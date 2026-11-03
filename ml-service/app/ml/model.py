"""Обучение, сохранение и использование модели прогноза дефицита.

Задача — бинарная классификация: «будет ли на линии дефицит детали в
ближайшие HORIZON минут?». Вероятность класса 1 (predict_proba) и есть
«процент риска», который сравнивается с kritická hranica из BPMN.

Обучаем двух кандидатов и берём лучшего по ROC AUC:
  * LogisticRegression — простой, интерпретируемый baseline;
  * RandomForestClassifier — ловит нелинейности (например, «мало запаса
    И нет открытой заявки» опасно, а по отдельности — нет).
"""
import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, f1_score, precision_score,
                             recall_score, roc_auc_score)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from app.config import settings
from app.ml.features import FEATURES, add_features
from app.ml import synthetic

log = logging.getLogger("ml.model")


def _candidates():
    return {
        "LogisticRegression": Pipeline([
            ("scale", StandardScaler()),
            ("clf", LogisticRegression(max_iter=1000, class_weight="balanced")),
        ]),
        "RandomForest": Pipeline([
            ("clf", RandomForestClassifier(n_estimators=200, max_depth=10, min_samples_leaf=5,
                                           class_weight="balanced", random_state=42, n_jobs=-1)),
        ]),
    }


def train(df: pd.DataFrame, data_source: str) -> dict:
    """Обучает кандидатов, выбирает лучшего, сохраняет его на диск. Возвращает метрики."""
    df = add_features(df)
    X, y = df[FEATURES], df["shortage"].astype(int)
    if y.nunique() < 2:
        raise ValueError("В данных только один класс — модель обучить нельзя")

    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, stratify=y, random_state=42)

    results = {}
    for name, pipe in _candidates().items():
        pipe.fit(X_tr, y_tr)
        proba = pipe.predict_proba(X_te)[:, 1]
        pred = (proba >= 0.5).astype(int)
        results[name] = {
            "pipe": pipe,
            "accuracy": accuracy_score(y_te, pred),
            "precision": precision_score(y_te, pred, zero_division=0),
            "recall": recall_score(y_te, pred, zero_division=0),
            "f1": f1_score(y_te, pred, zero_division=0),
            "roc_auc": roc_auc_score(y_te, proba),
        }
        log.info("%s: AUC=%.3f F1=%.3f", name, results[name]["roc_auc"], results[name]["f1"])

    best_name = max(results, key=lambda k: results[k]["roc_auc"])
    best = results[best_name]

    clf = best["pipe"].named_steps["clf"]
    if hasattr(clf, "feature_importances_"):
        importance = clf.feature_importances_
    else:
        importance = np.abs(clf.coef_[0]) / np.abs(clf.coef_[0]).sum()
    feature_importance = {f: round(float(v), 4) for f, v in zip(FEATURES, importance)}

    # миллисекунды в версии — два переобучения в одну секунду не должны совпасть
    version = datetime.now(timezone.utc).strftime("v%Y%m%d-%H%M%S-%f")[:-3]
    bundle = {"pipeline": best["pipe"], "version": version, "algorithm": best_name, "features": FEATURES}
    Path(settings.model_path).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, settings.model_path)

    metrics = {
        "model_version": version,
        "algorithm": best_name,
        "data_source": data_source,
        "n_train": len(X_tr),
        "n_test": len(X_te),
        **{k: round(float(best[k]), 4) for k in ("accuracy", "precision", "recall", "f1", "roc_auc")},
        "feature_importance": json.dumps({
            "importance": feature_importance,
            "candidates": {n: round(float(r["roc_auc"]), 4) for n, r in results.items()},
        }),
    }
    registry.set(bundle)
    return metrics


def train_on_synthetic() -> dict:
    return train(synthetic.generate(horizon_min=settings.horizon_minutes), "synthetic")


class ModelRegistry:
    """Держит текущую модель в памяти. Lock нужен, т.к. переобучение может идти
    одновременно с запросами /predict."""

    def __init__(self):
        self._bundle = None
        self._lock = threading.Lock()

    def set(self, bundle):
        with self._lock:
            self._bundle = bundle

    def load(self) -> bool:
        path = Path(settings.model_path)
        if not path.exists():
            return False
        self.set(joblib.load(path))
        return True

    @property
    def version(self) -> str | None:
        return self._bundle["version"] if self._bundle else None

    @property
    def algorithm(self) -> str | None:
        return self._bundle["algorithm"] if self._bundle else None

    def predict_risk(self, rows: list[dict]) -> list[float]:
        with self._lock:
            if self._bundle is None:
                raise RuntimeError("Модель не загружена")
            df = add_features(pd.DataFrame(rows))
            return self._bundle["pipeline"].predict_proba(df[FEATURES])[:, 1].tolist()


registry = ModelRegistry()
