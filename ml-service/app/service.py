"""Бизнес-логика ML-сервиса — прямое отражение дорожки «WMS & ML Systém» в BPMN:

  Priebežný zber dát o spotrebe   → save telemetry (consumption_log)
  Odoslanie dát do Python ML      → вызов process_telemetry()
  Výpočet predikcie nedostatku    → registry.predict_risk()
  Riziko > kritická hranica?      → risk >= settings.critical_threshold
     áno → Generovanie požiadavky / notifikácia TSD / Alert dispečerovi → notifier.send_alert()
     nie → Cyklický zber (ждём следующее измерение)
  Zápis histórie a predikcií do DB2 → predictions + "PredictionHistories" (пишем в
     ОБОИХ случаях, иначе не из чего считать качество модели и строить графики)
"""
import json
import logging
from datetime import timedelta

import pandas as pd

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import (ConsumptionLog, LineConsumptionLog, ModelMetrics,
                    Prediction, PredictionHistory, main_table_exists, utcnow)
from app.ml.features import RAW_FEATURES, minutes_to_stockout, recommended_qty
from app.ml.model import registry, train, train_on_synthetic
from app.notifier import send_alert
from app.schemas import TelemetryIn

log = logging.getLogger("ml.service")


def process_telemetry(db: Session, t: TelemetryIn, notify: bool = True) -> Prediction:
    row = ConsumptionLog(**t.model_dump())
    db.add(row)
    db.flush()  # получаем row.id для связи с прогнозом

    risk = registry.predict_risk([t.model_dump(include=set(RAW_FEATURES))])[0]
    threshold = settings.critical_threshold
    is_critical = risk >= threshold
    qty = recommended_qty(t.current_stock, t.consumption_rate, t.planned_rate,
                          t.lead_time_min, settings.horizon_minutes) if is_critical else 0.0

    pred = Prediction(
        line_name=t.line_name, product_code=t.product_code, risk=round(risk, 4),
        minutes_to_stockout=minutes_to_stockout(t.current_stock, t.consumption_rate),
        threshold=threshold, is_critical=is_critical, recommended_qty=qty,
        model_version=registry.version, consumption_id=row.id,
    )
    db.add(pred)
    db.flush()

    write_prediction_history(db, pred)

    # Не спамим: если по этой паре линия/материал уже есть свежий неподтверждённый
    # критический алерт (последние 10 мин), второй раз не шлём.
    if is_critical and notify and not _recent_open_alert(db, t.line_name, t.product_code, exclude_id=pred.id):
        ok, err = send_alert(alert_payload(pred))
        pred.alert_sent, pred.alert_error = ok, err

    db.commit()
    return pred


def write_prediction_history(db: Session, p: Prediction) -> None:
    """Копия прогноза в таблицу C# "PredictionHistories" — её главный бэкенд завёл
    специально для истории прогнозов ML. Если C# ещё не создал таблицу — пропускаем."""
    if not main_table_exists("PredictionHistories"):
        return
    shortage_at = (utcnow() + timedelta(minutes=p.minutes_to_stockout)
                   if p.minutes_to_stockout is not None else None)
    db.add(PredictionHistory(
        product_code=p.product_code, line_name=p.line_name, timestamp=utcnow(),
        risk_percent=round(p.risk * 100, 1), horizon_minutes=settings.horizon_minutes,
        predicted_shortage_at=shortage_at, model_version=p.model_version,
        details=json.dumps({"predictionId": p.id, "isCritical": p.is_critical,
                            "threshold": p.threshold, "recommendedQty": int(p.recommended_qty)}),
    ))


# ---------------------------------------------------------------- реальный расход из DB2

def consumption_rates(db: Session) -> dict[tuple[str, str], dict]:
    """Средний темп расхода (шт/час) по каждой паре линия/материал из "LineConsumptionLogs".

    Каждая запись там — «паллета из N штук израсходована за M минут». Темп пары =
    сумма штук / сумма часов по последним RATE_HISTORY_RECORDS записям. Это и есть
    «история расхода деталей» из DB2, на которую опирается прогноз."""
    if not main_table_exists("LineConsumptionLogs"):
        return {}
    rows = db.execute(
        select(LineConsumptionLog.line_name, LineConsumptionLog.product_code,
               LineConsumptionLog.quantity_consumed, LineConsumptionLog.period_start,
               LineConsumptionLog.period_end, LineConsumptionLog.unit)
        .order_by(LineConsumptionLog.period_end.desc()).limit(20000)).all()
    acc: dict[tuple[str, str], dict] = {}
    for line, code, qty, start, end, unit in rows:
        a = acc.setdefault((line, code), {"qty": 0, "hours": 0.0, "records": 0, "unit": unit, "last": end})
        if a["records"] >= settings.rate_history_records:
            continue
        hours = (end - start).total_seconds() / 3600
        if hours <= 0:
            continue
        a["qty"] += qty
        a["hours"] += hours
        a["records"] += 1
    return {k: {"rate_per_hour": round(a["qty"] / a["hours"], 1), "records": a["records"],
                "unit": a["unit"], "last_record_at": a["last"]}
            for k, a in acc.items() if a["hours"] > 0}


def history_rate(db: Session, line_name: str, product_code: str) -> float | None:
    r = consumption_rates(db).get((line_name, product_code))
    return r["rate_per_hour"] if r else None


def _recent_open_alert(db: Session, line_name: str, product_code: str, exclude_id: int) -> bool:
    since = utcnow() - timedelta(minutes=10)
    q = select(func.count()).select_from(Prediction).where(
        Prediction.line_name == line_name, Prediction.product_code == product_code, Prediction.is_critical.is_(True),
        Prediction.alert_sent.is_(True), Prediction.acknowledged.is_(False),
        Prediction.ts >= since, Prediction.id != exclude_id)
    return db.scalar(q) > 0


def risk_level(risk: float, threshold: float) -> str:
    """Для цвета строки на дашборде: HIGH = выше kritickej hranice."""
    if risk >= threshold:
        return "HIGH"
    return "MEDIUM" if risk >= 0.4 else "LOW"


def priority_for(risk: float) -> int:
    """Приоритет заявки в шкале главного бэкенда: 1 = самый срочный … 5, по умолчанию 3."""
    if risk >= 0.9:
        return 1
    if risk >= 0.8:
        return 2
    return 3


def alert_payload(p: Prediction) -> dict:
    """То, что получает главный бэкенд на POST /api/ml/alerts.
    Имена полей совпадают с его моделями Alert и ReplenishmentRequest."""
    return {
        "predictionId": p.id,
        "productCode": p.product_code,
        "lineName": p.line_name,
        "riskPercent": round(p.risk * 100, 1),
        "threshold": p.threshold,
        "minutesToStockout": p.minutes_to_stockout,
        "recommendedQty": int(p.recommended_qty),
        "priority": priority_for(p.risk),
        "message": f"Riziko výpadku {p.product_code} na {p.line_name}: {p.risk * 100:.0f} % "
                   f"(hranica {p.threshold * 100:.0f} %). Doplniť {p.recommended_qty:.0f} ks.",
        "modelVersion": p.model_version,
        "createdAt": (p.ts or utcnow()).isoformat(),
    }


def latest_per_line_sku(db: Session) -> list[ConsumptionLog]:
    """Последнее измерение по каждой паре линия/SKU — для ручного запуска прогноза диспетчером."""
    sub = (select(ConsumptionLog.line_name, ConsumptionLog.product_code, func.max(ConsumptionLog.id).label("mid"))
           .group_by(ConsumptionLog.line_name, ConsumptionLog.product_code).subquery())
    return list(db.scalars(select(ConsumptionLog).join(sub, ConsumptionLog.id == sub.c.mid)))


# ---------------------------------------------------------------- обучение

def label_history(db: Session) -> int:
    """Проставляет «правду» задним числом: был ли дефицит (stock <= 0) в течение
    горизонта после измерения. Именно так реальные данные из DB2 становятся
    обучающей выборкой — модель учится на собственном заводе."""
    horizon = timedelta(minutes=settings.horizon_minutes)
    cutoff = utcnow() - horizon
    pending = db.scalars(select(ConsumptionLog).where(
        ConsumptionLog.shortage_occurred.is_(None), ConsumptionLog.ts <= cutoff)).all()
    labeled = 0
    for r in pending:
        future = db.scalars(select(ConsumptionLog.current_stock).where(
            ConsumptionLog.line_name == r.line_name, ConsumptionLog.product_code == r.product_code,
            ConsumptionLog.ts > r.ts, ConsumptionLog.ts <= r.ts + horizon)).all()
        if future:
            r.shortage_occurred = any(s <= 0 for s in future)
            labeled += 1
    db.commit()
    return labeled


def retrain(db: Session, source: str = "auto") -> ModelMetrics:
    """source: synthetic | db2 | auto (db2, если хватает размеченных данных)."""
    label_history(db)
    df = None
    if source in ("auto", "db2"):
        rows = db.scalars(select(ConsumptionLog).where(ConsumptionLog.shortage_occurred.is_not(None))).all()
        if len(rows) >= settings.min_real_samples:
            df = pd.DataFrame([{
                "current_stock": r.current_stock, "consumption_rate": r.consumption_rate,
                "planned_rate": r.planned_rate, "open_requests": r.open_requests,
                "lead_time_min": r.lead_time_min, "shortage": int(r.shortage_occurred)} for r in rows])
            if df["shortage"].nunique() < 2:
                df = None
        if df is None and source == "db2":
            raise ValueError(f"В DB2 недостаточно размеченных данных (нужно >= {settings.min_real_samples}, "
                             f"оба класса). Используйте source=synthetic или auto.")

    metrics = train(df, "db2") if df is not None else train_on_synthetic()
    m = ModelMetrics(**metrics)
    db.add(m)
    db.commit()
    return m


def ensure_model(db: Session) -> None:
    """При старте: загрузить модель с диска, а если её нет — обучить на синтетике."""
    if registry.load():
        log.info("Model %s loaded from disk", registry.version)
        exists = db.scalar(select(func.count()).select_from(ModelMetrics)
                           .where(ModelMetrics.model_version == registry.version))
        if exists:
            return
        # Файл модели есть, а метрик в DB2 нет (новая база) — переобучим, чтобы метрики были
    log.info("Training initial model on synthetic data…")
    retrain(db, "synthetic")
