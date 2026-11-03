"""Отправка сигнала тревоги на главный бэкенд.

BPMN: после «Riziko výpadku > kritická hranica? → áno» идут
«Generovanie automatickej požiadavky na dopĺňanie» → «Odoslanie notifikácie
na TSD skladníka» → «Odoslanie výstrahy dispečerovi (Alert)».
Создавать заявку в DB1 и показывать её на TSD/дашборде — работа главного
бэкенда (он владеет DB1 и сессиями). ML-сервис только сообщает ему: «на
L1 по MAT-001 риск 87 %, привези 120 шт». Поэтому — один POST.

Если главный бэкенд недоступен, мы не падаем: ошибка записывается в
predictions.alert_error, а алерт остаётся доступен через GET /api/alerts
(фронтенд/бэкенд может его «вытянуть» сам — запасной путь)."""
import logging

import httpx

from app.config import settings

log = logging.getLogger("ml.notifier")


def send_alert(payload: dict) -> tuple[bool, str | None]:
    url = settings.main_backend_url.rstrip("/") + settings.main_backend_alert_path
    try:
        r = httpx.post(url, json=payload, headers={"X-API-Key": settings.service_api_key}, timeout=3.0)
        r.raise_for_status()
        log.info("Alert sent to %s: %s/%s risk=%.1f%%", url, payload["lineName"], payload["productCode"], payload["riskPercent"])
        return True, None
    except Exception as exc:  # сеть, 4xx/5xx — не важно, процесс прогноза не должен ломаться
        log.warning("Alert to main backend failed: %s", exc)
        return False, str(exc)[:500]
