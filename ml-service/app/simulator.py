"""Симулятор конвейера — «Cyklický zber» из BPMN.

На защите нет настоящих датчиков на линиях, поэтому этот фоновый цикл
изображает медзисклады линий L1 и L2 главного бэкенда:
  L1 — MAT-001 (стальной лист) и MAT-002 (винты), L2 — MAT-002 и MAT-003 (кабель).
Каждые SIMULATOR_INTERVAL_SEC секунд «проходит» 10 минут смены: запас тает,
сервис считает риск и при необходимости шлёт алерт главному бэкенду.

Темп расхода берётся из реальной истории DB2 ("LineConsumptionLogs", её ведёт C#):
если её нет — из значений по умолчанию ниже.

Замкнутый цикл с реальной системой (SIMULATOR_AUTO_REFILL=false):
  алерт → C# создаёт ReplenishmentRequest → складник на TSD отправляет паллету
  на линию → C# пишет TO_LINE (с LineName) в MovementLogs → симулятор видит это
  событие и добавляет Quantity в запас ЭТОЙ линии → риск падает.
С SIMULATOR_AUTO_REFILL=true подвоз «приезжает» сам (демо без C#).

Включается переменной SIMULATOR_ENABLED=true."""
import asyncio
import logging
import random

from sqlalchemy import func, select

from app import service
from app.config import settings
from app.db import MovementLog, SessionLocal, main_table_exists
from app.schemas import TelemetryIn
from app.service import process_telemetry

log = logging.getLogger("ml.simulator")
SIM_MINUTES_PER_TICK = 10

# Пары линия/материал как в ConsumptionBootstrapper главного бэкенда.
# planned — темп по умолчанию (шт/час), пока нет истории в DB2; hours — стартовый запас в часах работы.
_state = {
    ("L1", "MAT-001"): {"planned": 130, "hours": 1.0, "lead": 20},
    ("L1", "MAT-002"): {"planned": 380, "hours": 2.5, "lead": 25},
    ("L2", "MAT-002"): {"planned": 380, "hours": 0.6, "lead": 30},
    ("L2", "MAT-003"): {"planned": 160, "hours": 1.8, "lead": 15},
}
_last_movement_id: int | None = None
_initialized = False


def _init_from_history(db) -> None:
    """Один раз при первом тике: темп из LineConsumptionLogs, стартовый запас от него."""
    global _initialized
    rates = service.consumption_rates(db)
    for key, s in _state.items():
        if key in rates:
            s["planned"] = rates[key]["rate_per_hour"]
        s["stock"] = round(s["planned"] * s["hours"])
    log.info("Simulator lines: %s", {f"{k[0]}/{k[1]}": s["planned"] for k, s in _state.items()})
    _initialized = True


def _apply_deliveries(db) -> None:
    """Паллеты, которые складник реально отправил на линию (TO_LINE в MovementLogs)."""
    global _last_movement_id
    if not main_table_exists("MovementLogs"):
        return
    if _last_movement_id is None:                       # первый раз: старую историю не учитываем
        _last_movement_id = db.scalar(select(func.max(MovementLog.id))) or 0
        return
    events = db.scalars(select(MovementLog).where(MovementLog.id > _last_movement_id,
                                                  MovementLog.event_type == "TO_LINE")
                        .order_by(MovementLog.id)).all()
    for e in events:
        _last_movement_id = e.id
        key = (e.line_name, e.product_code)
        if key not in _state:                            # старые записи без LineName — первая подходящая линия
            key = next((k for k in _state if k[1] == e.product_code), None)
        if key:
            _state[key]["stock"] += e.quantity
            _state[key]["waiting"] = False
            log.info("Delivery %s: +%s %s to %s", e.pallet_code, e.quantity, key[1], key[0])


def tick() -> None:
    db = SessionLocal()
    try:
        if not _initialized:
            _init_from_history(db)
        _apply_deliveries(db)
        for (line, code), s in _state.items():
            rate = max(1.0, s["planned"] * random.gauss(1.0, 0.15))
            s["stock"] = max(0.0, s["stock"] - rate * SIM_MINUTES_PER_TICK / 60)

            if s.get("eta") is not None:                # авто-подвоз в пути
                s["eta"] -= 1
                if s["eta"] <= 0:
                    s["stock"] += s.pop("qty")
                    s["eta"] = None
                    s["waiting"] = False

            pred = process_telemetry(db, TelemetryIn(
                line_name=line, product_code=code, current_stock=round(s["stock"]),
                consumption_rate=round(rate, 1), planned_rate=s["planned"],
                open_requests=1 if s.get("waiting") else 0, lead_time_min=s["lead"]))

            if pred.is_critical and not s.get("waiting"):
                s["waiting"] = True                     # заявка создана, ждём подвоз
                if settings.simulator_auto_refill:
                    s["eta"] = max(1, round(s["lead"] * random.uniform(0.8, 1.6) / SIM_MINUTES_PER_TICK))
                    s["qty"] = pred.recommended_qty
    finally:
        db.close()


async def run_forever() -> None:
    log.info("Simulator started, interval=%ss, auto_refill=%s",
             settings.simulator_interval_sec, settings.simulator_auto_refill)
    while True:
        try:
            await asyncio.to_thread(tick)
        except Exception:
            log.exception("Simulator tick failed")
        await asyncio.sleep(settings.simulator_interval_sec)
