"""Подключение к DB2 (wms_analytics) и описание её таблиц.

В DB2 два «хозяина», каждый СОЗДАЁТ только свои таблицы:

  * главный бэкенд (C#, EF Core) создаёт:
      "MovementLogs"        — история операций склада (RECEIVE, STORE, TO_LINE, QUARANTINE…)
      "LineConsumptionLogs" — реальный расход материала на линиях L1/L2
      "PredictionHistories" — история прогнозов ML (строки пишет ML-сервис)
  * ML-сервис (Python) создаёт:
      consumption_log, predictions, model_metrics

ML-сервис читает MovementLogs и LineConsumptionLogs и добавляет строки в
PredictionHistories, но НИКОГДА не создаёт таблицы C#. Поэтому таблицы C#
описаны на отдельном Base (MainBase), который ML не передаёт в create_all.

Порядок запуска. EF-метод EnsureCreated() создаёт таблицы, только если в базе
нет НИ ОДНОЙ таблицы. Если ML создаст свои таблицы первым, C# решит «база уже
есть» и не создаст свои. Поэтому при старте ML сначала ждёт, пока C# создаст
"MovementLogs" (см. wait_for_main_schema), и только потом создаёт свои таблицы.
"""
import logging
import time
from datetime import datetime, timezone

from sqlalchemy import (BigInteger, Boolean, Date, DateTime, Float, ForeignKey,
                        Integer, String, Text, create_engine, inspect)
from sqlalchemy.orm import (DeclarativeBase, Mapped, mapped_column,
                            sessionmaker)

from app.config import settings

log = logging.getLogger("ml.db")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, pool_pre_ping=True, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

# BIGINT в PostgreSQL, INTEGER в SQLite (иначе SQLite не делает автонумерацию в тестах)
BigId = BigInteger().with_variant(Integer, "sqlite")


class Base(DeclarativeBase):
    """Таблицы, которые создаёт и которыми владеет ML-сервис."""


class MainBase(DeclarativeBase):
    """Таблицы главного бэкенда (C#). ML их НЕ создаёт — только читает/дописывает строки."""


# =========================================================== таблицы ML-сервиса

class ConsumptionLog(Base):
    """Телеметрия с линии: «Priebežný zber dát o spotrebe materiálu na linke»."""
    __tablename__ = "consumption_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    line_name: Mapped[str] = mapped_column(String(32), index=True)
    product_code: Mapped[str] = mapped_column(String(64), index=True)
    current_stock: Mapped[float] = mapped_column(Float)          # штук в медзискладе линии
    consumption_rate: Mapped[float] = mapped_column(Float)       # штук / час (факт)
    planned_rate: Mapped[float] = mapped_column(Float)           # штук / час (норма из истории)
    open_requests: Mapped[int] = mapped_column(Integer, default=0)  # уже созданные заявки на пополнение
    lead_time_min: Mapped[float] = mapped_column(Float, default=20)  # время подвоза со склада
    # Факт, известный задним числом: случился ли дефицит в горизонте (для обучения)
    shortage_occurred: Mapped[bool | None] = mapped_column(Boolean, nullable=True)


class Prediction(Base):
    """Результат «Výpočet predikcie nedostatku materiálu» + что с ним сделали."""
    __tablename__ = "predictions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    line_name: Mapped[str] = mapped_column(String(32), index=True)
    product_code: Mapped[str] = mapped_column(String(64), index=True)
    risk: Mapped[float] = mapped_column(Float)                    # 0..1
    minutes_to_stockout: Mapped[float | None] = mapped_column(Float, nullable=True)
    threshold: Mapped[float] = mapped_column(Float)
    is_critical: Mapped[bool] = mapped_column(Boolean)
    recommended_qty: Mapped[float] = mapped_column(Float, default=0)
    model_version: Mapped[str] = mapped_column(String(64))
    alert_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    alert_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)  # диспетчер «Kontrola alertov»
    consumption_id: Mapped[int | None] = mapped_column(ForeignKey("consumption_log.id"), nullable=True)


class ModelMetrics(Base):
    """Метрики каждой обученной версии модели — показываются диспетчеру и в отчёте."""
    __tablename__ = "model_metrics"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    model_version: Mapped[str] = mapped_column(String(64), unique=True)
    algorithm: Mapped[str] = mapped_column(String(64))
    data_source: Mapped[str] = mapped_column(String(32))  # synthetic | db2
    n_train: Mapped[int] = mapped_column(Integer)
    n_test: Mapped[int] = mapped_column(Integer)
    accuracy: Mapped[float] = mapped_column(Float)
    precision: Mapped[float] = mapped_column(Float)
    recall: Mapped[float] = mapped_column(Float)
    f1: Mapped[float] = mapped_column(Float)
    roc_auc: Mapped[float] = mapped_column(Float)
    feature_importance: Mapped[str] = mapped_column(Text)  # JSON


# =========================================================== таблицы главного бэкенда (C#)
# Имена таблиц и столбцов — в точности как у EF Core (Models/Db2Models.cs в WmsApi).

class MovementLog(MainBase):
    """История операций склада. Пишет C# (MovementLogger), ML только читает."""
    __tablename__ = "MovementLogs"
    id: Mapped[int] = mapped_column("Id", BigId, primary_key=True)
    timestamp: Mapped[datetime] = mapped_column("Timestamp", DateTime(timezone=True), default=utcnow)
    event_type: Mapped[str] = mapped_column("EventType", Text)
    pallet_code: Mapped[str] = mapped_column("PalletCode", Text, default="")
    product_code: Mapped[str] = mapped_column("ProductCode", Text, default="")
    quantity: Mapped[int] = mapped_column("Quantity", Integer, default=0)
    from_zone: Mapped[str | None] = mapped_column("FromZone", Text, nullable=True)
    to_zone: Mapped[str | None] = mapped_column("ToZone", Text, nullable=True)
    line_name: Mapped[str | None] = mapped_column("LineName", Text, nullable=True)   # NULL, L1, L2
    user_name: Mapped[str | None] = mapped_column("UserName", Text, nullable=True)
    details: Mapped[str | None] = mapped_column("Details", Text, nullable=True)


class LineConsumptionLog(MainBase):
    """Реальный расход: целая паллета израсходована на линии за интервал. Пишет C#, ML читает."""
    __tablename__ = "LineConsumptionLogs"
    id: Mapped[int] = mapped_column("Id", BigId, primary_key=True)
    pallet_code: Mapped[str | None] = mapped_column("PalletCode", Text, nullable=True)
    product_code: Mapped[str] = mapped_column("ProductCode", Text)
    line_name: Mapped[str] = mapped_column("LineName", Text)
    period_start: Mapped[datetime] = mapped_column("PeriodStart", DateTime(timezone=True))
    period_end: Mapped[datetime] = mapped_column("PeriodEnd", DateTime(timezone=True))
    quantity_consumed: Mapped[int] = mapped_column("QuantityConsumed", Integer)
    unit: Mapped[str] = mapped_column("Unit", Text, default="")
    source: Mapped[str | None] = mapped_column("Source", Text, nullable=True)   # synthetic | manual
    recorded_at: Mapped[datetime] = mapped_column("RecordedAt", Date)


class PredictionHistory(MainBase):
    """История прогнозов, которую C# завёл для ML. Таблицу создаёт C#, строки пишет ML."""
    __tablename__ = "PredictionHistories"
    id: Mapped[int] = mapped_column("Id", BigId, primary_key=True)
    product_code: Mapped[str] = mapped_column("ProductCode", Text)
    line_name: Mapped[str] = mapped_column("LineName", Text)
    timestamp: Mapped[datetime] = mapped_column("Timestamp", DateTime(timezone=True), default=utcnow)
    risk_percent: Mapped[float] = mapped_column("RiskPercent", Float)           # 0..100
    horizon_minutes: Mapped[int | None] = mapped_column("HorizonMinutes", Integer, nullable=True)
    predicted_shortage_at: Mapped[datetime | None] = mapped_column("PredictedShortageAt",
                                                                   DateTime(timezone=True), nullable=True)
    model_version: Mapped[str | None] = mapped_column("ModelVersion", Text, nullable=True)
    details: Mapped[str | None] = mapped_column("Details", Text, nullable=True)


# =========================================================== старт и доступ

_main_ready: dict[str, bool] = {}


def main_table_exists(name: str) -> bool:
    """Есть ли таблица C#. Положительный ответ запоминаем, отрицательный перепроверяем
    (C# может запуститься позже ML)."""
    if _main_ready.get(name):
        return True
    ok = inspect(engine).has_table(name)
    if ok:
        _main_ready[name] = True
    return ok


def wait_for_db() -> None:
    """В Docker база может проснуться позже нас — пробуем подключиться до 30 раз."""
    for attempt in range(30):
        try:
            with engine.connect():
                return
        except Exception as exc:
            log.warning("DB2 not ready (%s), retry %s/30", str(exc).splitlines()[0][:150], attempt + 1)
            time.sleep(2)
    raise RuntimeError("DB2 is unreachable")


def wait_for_main_schema(timeout_sec: int) -> bool:
    """Ждём, пока главный бэкенд создаст свои таблицы в DB2 (EnsureCreated)."""
    deadline = time.monotonic() + timeout_sec
    while True:
        if main_table_exists("MovementLogs"):
            return True
        if time.monotonic() >= deadline:
            return False
        log.info("Waiting for the main backend (C#) to create its DB2 tables…")
        time.sleep(3)


def init_db() -> None:
    wait_for_db()
    if not wait_for_main_schema(settings.main_schema_wait_sec):
        log.warning("Tables of the main backend (MovementLogs…) were not found in DB2 within %ss. "
                    "ML creates only its own tables and works without C# data. Start WmsApi on an EMPTY "
                    "DB2 first, or apply the DB2 fix from integration/csharp/README.md.",
                    settings.main_schema_wait_sec)
    Base.metadata.create_all(engine)       # только таблицы ML; таблицы C# не трогаем


def get_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
