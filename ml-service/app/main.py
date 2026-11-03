"""ML Backend (Python / FastAPI) — второй бэкенд информационной системы.

Запуск локально:  uvicorn app.main:app --reload --port 8000
Документация API: http://localhost:8000/docs
"""
import asyncio
import json
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app import service, simulator
from app.config import settings
from app.db import (ConsumptionLog, ModelMetrics, MovementLog, Prediction,
                    SessionLocal, get_session, init_db, main_table_exists)
from app.ml.features import RAW_FEATURES, minutes_to_stockout, recommended_qty
from app.ml.model import registry
from app.schemas import (AckIn, MetricsOut, PredictionOut, PredictRequest,
                         TelemetryIn, ThresholdIn)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("ml.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1) Ждём DB2, ждём таблицы C# (EnsureCreated), создаём свои таблицы — см. app/db.py
    await asyncio.to_thread(init_db)
    # 2) Модель: загрузить или обучить
    with SessionLocal() as db:
        service.ensure_model(db)
    # 3) Симулятор линий (только для демо)
    task = asyncio.create_task(simulator.run_forever()) if settings.simulator_enabled else None
    yield
    if task:
        task.cancel()


app = FastAPI(title="WMS ML Service", version="1.0.0",
              description="Prediktívny servis nedostatku materiálu (Material Shortage Prediction)",
              lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
                   allow_methods=["*"], allow_headers=["*"])


def require_api_key(x_api_key: str | None = Header(default=None)):
    """Запись и управление моделью — только для доверенного главного бэкенда."""
    if x_api_key != settings.service_api_key:
        raise HTTPException(401, "Invalid or missing X-API-Key")


def to_out(p: Prediction) -> PredictionOut:
    return PredictionOut(id=p.id, ts=p.ts, line_name=p.line_name, product_code=p.product_code, risk=p.risk,
                         risk_percent=round(p.risk * 100, 1), risk_level=service.risk_level(p.risk, p.threshold),
                         minutes_to_stockout=p.minutes_to_stockout, threshold=p.threshold,
                         is_critical=p.is_critical, recommended_qty=int(p.recommended_qty),
                         model_version=p.model_version, alert_sent=p.alert_sent, acknowledged=p.acknowledged)


def metrics_out(m: ModelMetrics) -> MetricsOut:
    return MetricsOut(**{**{c.key: getattr(m, c.key) for c in m.__mapper__.column_attrs},
                         "feature_importance": json.loads(m.feature_importance)})


# ------------------------------------------------------------------ служебное
@app.get("/health", tags=["system"])
def health(db: Session = Depends(get_session)):
    db.execute(select(1))
    return {"status": "ok", "service": "wms-ml", "modelReady": registry.version is not None,
            "modelVersion": registry.version, "algorithm": registry.algorithm,
            "criticalThreshold": settings.critical_threshold, "horizonMinutes": settings.horizon_minutes,
            "mainSchemaReady": main_table_exists("MovementLogs")}


# ------------------------------------------------------------------ прогноз
@app.post("/api/telemetry", response_model=PredictionOut, tags=["prediction"],
          dependencies=[Depends(require_api_key)])
def ingest_telemetry(t: TelemetryIn, db: Session = Depends(get_session)):
    """Основной поток BPMN: данные с линии → прогноз → (алерт) → запись в DB2."""
    return to_out(service.process_telemetry(db, t))


@app.post("/predict", response_model=PredictionOut, tags=["prediction"])
@app.post("/api/predict", response_model=PredictionOut, tags=["prediction"])
def predict_only(r: PredictRequest, db: Session = Depends(get_session)):
    """«Посчитай риск» без записи в DB2 и без алерта — для фронтенда, C# и проверки в Swagger.

    /predict — адрес из заглушки Architect (тот же контракт), /api/predict — тот же расчёт.
    Если consumptionRate / plannedRate не переданы, ML берёт средний темп расхода
    этой линии и материала из истории "LineConsumptionLogs" в DB2."""
    hist = service.history_rate(db, r.line_name, r.product_code)
    if r.consumption_rate is not None:
        rate, source = r.consumption_rate, "request"
    elif hist is not None:
        rate, source = hist, "history"
    else:
        raise HTTPException(422, f"consumptionRate is required: no consumption history in DB2 for "
                                 f"{r.line_name}/{r.product_code}")
    planned = r.planned_rate or hist or rate
    features = {"current_stock": r.current_stock, "consumption_rate": rate, "planned_rate": planned,
                "open_requests": r.open_requests, "lead_time_min": r.lead_time_min}
    risk = registry.predict_risk([features])[0]
    crit = risk >= settings.critical_threshold
    return PredictionOut(line_name=r.line_name, product_code=r.product_code, risk=round(risk, 4),
                         risk_percent=round(risk * 100, 1),
                         risk_level=service.risk_level(risk, settings.critical_threshold),
                         minutes_to_stockout=minutes_to_stockout(r.current_stock, rate),
                         threshold=settings.critical_threshold, is_critical=crit,
                         recommended_qty=int(recommended_qty(r.current_stock, rate, planned, r.lead_time_min,
                                                             settings.horizon_minutes)) if crit else 0,
                         model_version=registry.version, horizon_minutes=settings.horizon_minutes,
                         consumption_rate_used=round(rate, 1), rate_source=source)


@app.post("/api/forecast/run", response_model=list[PredictionOut], tags=["prediction"],
          dependencies=[Depends(require_api_key)])
def run_forecast(db: Session = Depends(get_session)):
    """Кнопка диспетчера «Spustiť ML predikciu»: пересчитать риск по последним данным всех линий."""
    results = []
    for c in service.latest_per_line_sku(db):
        t = TelemetryIn(line_name=c.line_name, product_code=c.product_code, current_stock=c.current_stock,
                        consumption_rate=c.consumption_rate, planned_rate=c.planned_rate,
                        open_requests=c.open_requests, lead_time_min=c.lead_time_min)
        results.append(to_out(service.process_telemetry(db, t)))
    return sorted(results, key=lambda p: -p.risk)


@app.get("/api/predictions/latest", response_model=list[PredictionOut], tags=["prediction"])
def latest_predictions(product_code: str | None = Query(None, alias="productCode"),
                       line_name: str | None = Query(None, alias="lineName"),
                       db: Session = Depends(get_session)):
    """ГЛАВНЫЙ эндпоинт для фронтенда: текущий риск по каждой паре линия/материал
    (таблица риска на дашборде диспетчера). Отсортировано от самого рискованного."""
    sub = (select(func.max(Prediction.id)).group_by(Prediction.line_name, Prediction.product_code)).scalar_subquery()
    q = select(Prediction).where(Prediction.id.in_(sub))
    if product_code:
        q = q.where(Prediction.product_code == product_code)
    if line_name:
        q = q.where(Prediction.line_name == line_name)
    return [to_out(p) for p in db.scalars(q.order_by(desc(Prediction.risk)))]


@app.get("/api/alerts", response_model=list[PredictionOut], tags=["alerts"])
def alerts(only_open: bool = True, limit: int = Query(50, le=500), db: Session = Depends(get_session)):
    """Блок Alerts на дашборде (и запасной pull-канал, если push на главный бэкенд не прошёл)."""
    q = select(Prediction).where(Prediction.is_critical.is_(True))
    if only_open:
        q = q.where(Prediction.acknowledged.is_(False))
    return [to_out(p) for p in db.scalars(q.order_by(desc(Prediction.id)).limit(limit))]


@app.post("/api/alerts/{prediction_id}/ack", response_model=PredictionOut, tags=["alerts"],
          dependencies=[Depends(require_api_key)])
def acknowledge(prediction_id: int, db: Session = Depends(get_session)):
    """BPMN: «Kontrola alertov ML predikcie» — диспетчер подтвердил алерт."""
    p = db.get(Prediction, prediction_id)
    if not p:
        raise HTTPException(404, "Prediction not found")
    # подтверждаем все открытые алерты этой пары линия/SKU, чтобы не висели дубли
    for other in db.scalars(select(Prediction).where(Prediction.line_name == p.line_name, Prediction.product_code == p.product_code,
                                                     Prediction.is_critical.is_(True),
                                                     Prediction.acknowledged.is_(False))):
        other.acknowledged = True
    db.commit()
    return to_out(p)


@app.post("/api/alerts/ack", tags=["alerts"], dependencies=[Depends(require_api_key)])
def acknowledge_pair(body: AckIn, db: Session = Depends(get_session)):
    """Подтверждение по паре материал/линия — главный бэкенд вызывает его, когда диспетчер
    подтвердил свой Alert в DB1 (там нет predictionId)."""
    n = 0
    for p in db.scalars(select(Prediction).where(Prediction.product_code == body.product_code,
                                                 Prediction.line_name == body.line_name,
                                                 Prediction.is_critical.is_(True),
                                                 Prediction.acknowledged.is_(False))):
        p.acknowledged = True
        n += 1
    db.commit()
    return {"acknowledged": n}


# ------------------------------------------------------------------ аналитика
@app.get("/api/analytics/consumption", tags=["analytics"])
def consumption_history(line_name: str = Query(alias="lineName"), product_code: str = Query(alias="productCode"),
                        limit: int = Query(100, le=1000), db: Session = Depends(get_session)):
    """Данные для графика «запас и риск во времени» на дашборде."""
    rows = db.execute(
        select(ConsumptionLog.ts, ConsumptionLog.current_stock, ConsumptionLog.consumption_rate, Prediction.risk)
        .join(Prediction, Prediction.consumption_id == ConsumptionLog.id, isouter=True)
        .where(ConsumptionLog.line_name == line_name, ConsumptionLog.product_code == product_code)
        .order_by(desc(ConsumptionLog.id)).limit(limit)).all()
    return [{"ts": r.ts, "currentStock": r.current_stock, "consumptionRate": r.consumption_rate,
             "riskPercent": round(r.risk * 100, 1) if r.risk is not None else None} for r in reversed(rows)]


# Брак (Subproces 23) в MovementLogs главного бэкенда: QUARANTINE — в карантин,
# QUARANTINE_REWORK — на переработку, QUARANTINE_CLAIM — рекламация (+ старые названия)
DEFECT_EVENTS = ("QUARANTINE", "QUARANTINE_REWORK", "QUARANTINE_CLAIM", "QUARANTINE_REPAIR", "WRITE_OFF")


@app.get("/api/analytics/defects", tags=["analytics"])
def defect_stats(db: Session = Depends(get_session)):
    """Брак по материалу (Subproces 23) — считается из MovementLogs, которые пишет главный бэкенд."""
    if not main_table_exists("MovementLogs"):
        return []
    rows = db.execute(select(MovementLog.product_code, MovementLog.event_type, func.count(),
                             func.sum(MovementLog.quantity))
                      .where(MovementLog.event_type.in_(DEFECT_EVENTS))
                      .group_by(MovementLog.product_code, MovementLog.event_type)).all()
    return [{"productCode": c, "eventType": e, "events": n, "quantity": q} for c, e, n, q in rows]


@app.get("/api/analytics/movements", tags=["analytics"])
def movement_stats(db: Session = Depends(get_session)):
    """Сколько операций каждого типа (RECEIVE, STORE, TO_LINE, CONSUME…) записал главный бэкенд."""
    if not main_table_exists("MovementLogs"):
        return []
    rows = db.execute(select(MovementLog.event_type, func.count(), func.sum(MovementLog.quantity))
                      .group_by(MovementLog.event_type)).all()
    return [{"eventType": e, "events": n, "quantity": q} for e, n, q in rows]


@app.get("/api/analytics/consumption-rates", tags=["analytics"])
def consumption_rates(db: Session = Depends(get_session)):
    """Средний темп расхода по линиям и материалам из истории "LineConsumptionLogs" (DB2).
    На этих темпах работают прогноз (/predict без consumptionRate) и симулятор."""
    return [{"lineName": line, "productCode": code, "ratePerHour": r["rate_per_hour"],
             "unit": r["unit"], "records": r["records"], "lastRecordAt": r["last_record_at"]}
            for (line, code), r in sorted(service.consumption_rates(db).items())]


@app.get("/api/analytics/summary", tags=["analytics"])
def summary(db: Session = Depends(get_session)):
    """KPI-плитки для дашборда / «Generovanie denných logistických reportov»."""
    count = lambda q: db.scalar(select(func.count()).select_from(q))  # noqa: E731
    main = main_table_exists("MovementLogs")
    return {
        "telemetryRecords": count(ConsumptionLog),
        "predictions": count(Prediction),
        "criticalPredictions": db.scalar(select(func.count()).select_from(Prediction)
                                         .where(Prediction.is_critical.is_(True))),
        "openAlerts": db.scalar(select(func.count()).select_from(Prediction)
                                .where(Prediction.is_critical.is_(True), Prediction.acknowledged.is_(False))),
        "movements": count(MovementLog) if main else 0,
        "defectEvents": db.scalar(select(func.count()).select_from(MovementLog)
                                  .where(MovementLog.event_type.in_(DEFECT_EVENTS))) if main else 0,
        "modelVersion": registry.version,
        "criticalThreshold": settings.critical_threshold,
    }


# ------------------------------------------------------------------ модель
@app.get("/api/model/metrics", response_model=list[MetricsOut], tags=["model"])
def model_metrics(db: Session = Depends(get_session)):
    rows = db.scalars(select(ModelMetrics).order_by(desc(ModelMetrics.id)).limit(20)).all()
    return [metrics_out(m) for m in rows]


@app.post("/api/model/train", response_model=MetricsOut, tags=["model"], dependencies=[Depends(require_api_key)])
def retrain(source: str = Query("auto", pattern="^(auto|synthetic|db2)$"), db: Session = Depends(get_session)):
    try:
        m = service.retrain(db, source)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return metrics_out(m)


@app.put("/api/model/threshold", tags=["model"], dependencies=[Depends(require_api_key)])
def set_threshold(body: ThresholdIn):
    """Kritická hranica — бизнес-параметр Domain Expert; диспетчер может подстроить на лету."""
    settings.critical_threshold = body.critical_threshold
    return {"criticalThreshold": settings.critical_threshold}
