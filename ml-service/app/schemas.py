"""Контракты REST API (Pydantic). Это «договор» с главным бэкендом и фронтендом:
FastAPI сам валидирует входные данные и рисует документацию на /docs.

JSON — в camelCase (productCode, lineName, riskPercent…), как у главного
бэкенда на ASP.NET: фронтенду не нужно помнить два стиля имён, а C# без
настроек сопоставляет поля со своими свойствами (ProductCode, LineName…).
Названия productCode / lineName совпадают с Product.Code и LineName в DB1."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class Camel(BaseModel):
    # populate_by_name: на вход принимаем и productCode, и product_code
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True,
                              from_attributes=True, protected_namespaces=())


class TelemetryIn(Camel):
    """Одно измерение с линии (что лежит в медзискладе и как быстро уходит)."""
    line_name: str = Field(examples=["L1"])
    product_code: str = Field(examples=["MAT-001"])
    current_stock: float = Field(ge=0, examples=[45])
    consumption_rate: float = Field(ge=0, description="шт/час фактически", examples=[60])
    planned_rate: float = Field(gt=0, description="шт/час по такту", examples=[60])
    open_requests: int = Field(0, ge=0, description="открытые заявки на пополнение")
    lead_time_min: float = Field(20, gt=0, description="типичное время подвоза со склада, мин")


class PredictRequest(Camel):
    """Запрос «посчитай риск» (POST /predict). Совместим с контрактом заглушки Architect:
    productCode, lineName, currentStock, consumptionRate, horizonHours.
    consumptionRate можно не передавать — тогда ML возьмёт средний темп из истории
    LineConsumptionLogs (DB2) для этой линии и материала."""
    line_name: str = Field(min_length=1, max_length=100, examples=["L1"])
    product_code: str = Field(min_length=1, max_length=100, examples=["MAT-001"])
    current_stock: float = Field(ge=0, examples=[40])
    consumption_rate: float | None = Field(None, ge=0, description="шт/час; пусто → из истории DB2")
    planned_rate: float | None = Field(None, gt=0, description="шт/час по норме; пусто → из истории DB2")
    open_requests: int = Field(0, ge=0)
    lead_time_min: float = Field(20, gt=0)
    horizon_hours: float | None = Field(None, gt=0, le=168,
                                        description="принимается для совместимости; модель обучена на 60 мин")


class PredictionOut(Camel):
    id: int | None = None
    ts: datetime | None = None
    line_name: str
    product_code: str
    risk: float
    risk_percent: float
    risk_level: str          # LOW | MEDIUM | HIGH — для цвета строки во фронтенде
    minutes_to_stockout: float | None
    threshold: float
    is_critical: bool
    recommended_qty: int
    model_version: str
    alert_sent: bool = False
    acknowledged: bool = False
    horizon_minutes: int | None = None
    consumption_rate_used: float | None = None
    rate_source: str | None = None        # request | history | telemetry


class MetricsOut(Camel):
    model_version: str
    algorithm: str
    data_source: str
    ts: datetime | None = None
    n_train: int
    n_test: int
    accuracy: float
    precision: float
    recall: float
    f1: float
    roc_auc: float
    feature_importance: dict


class ThresholdIn(Camel):
    critical_threshold: float = Field(gt=0, lt=1)


class AckIn(Camel):
    product_code: str
    line_name: str
