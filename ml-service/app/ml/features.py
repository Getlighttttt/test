"""Признаки (features) для модели прогноза дефицита.

Сырые данные с линии мало что говорят модели по отдельности: 120 штук — это
много или мало? Зависит от темпа расхода. Поэтому мы добавляем производные
признаки, которые логист считает «в голове»:
  * coverage_min      — на сколько минут хватит текущего запаса
  * slack_min         — запас по времени после учёта времени подвоза
  * rate_ratio        — насколько линия сейчас быстрее/медленнее плана
"""
import numpy as np
import pandas as pd

RAW_FEATURES = ["current_stock", "consumption_rate", "planned_rate", "open_requests", "lead_time_min"]
FEATURES = RAW_FEATURES + ["coverage_min", "slack_min", "rate_ratio"]


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    rate = df["consumption_rate"].clip(lower=0.1)            # защита от деления на 0
    df["coverage_min"] = (df["current_stock"] / rate * 60).clip(upper=24 * 60)
    df["slack_min"] = df["coverage_min"] - df["lead_time_min"]
    df["rate_ratio"] = df["consumption_rate"] / df["planned_rate"].clip(lower=0.1)
    return df


def minutes_to_stockout(current_stock: float, consumption_rate: float) -> float | None:
    if consumption_rate <= 0:
        return None
    return round(current_stock / consumption_rate * 60, 1)


def recommended_qty(current_stock: float, consumption_rate: float, planned_rate: float,
                    lead_time_min: float, horizon_min: int) -> float:
    """Сколько подвезти, чтобы покрыть горизонт + время подвоза с 20% страховым запасом."""
    rate = max(consumption_rate, planned_rate)
    need = rate * (horizon_min + lead_time_min) / 60 * 1.2 - current_stock
    return float(max(0, np.ceil(need)))
