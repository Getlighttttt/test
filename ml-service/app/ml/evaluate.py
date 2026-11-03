"""Отчёт о качестве модели для документации проекта (без БД и без сервера).

Запуск:  python -m app.ml.evaluate
Печатает метрики обоих кандидатов, матрицу ошибок и как меняются precision/recall
при разных значениях kritická hranica — эту таблицу удобно вставить в отчёт
и обсудить с Domain Expert, какой порог выбрать."""
import numpy as np
from sklearn.metrics import confusion_matrix, precision_score, recall_score
from sklearn.model_selection import train_test_split

from app.config import settings
from app.ml import synthetic
from app.ml.features import FEATURES, add_features
from app.ml.model import _candidates


def main():
    df = add_features(synthetic.generate(horizon_min=settings.horizon_minutes))
    X, y = df[FEATURES], df["shortage"]
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, stratify=y, random_state=42)
    print(f"Dáta: {len(df)} záznamov, podiel nedostatku {y.mean():.1%}\n")

    for name, pipe in _candidates().items():
        pipe.fit(X_tr, y_tr)
        proba = pipe.predict_proba(X_te)[:, 1]
        print(f"=== {name}")
        print(f"{'hranica':>8} {'precision':>10} {'recall':>8} {'falošné alarmy':>15} {'prehliadnuté':>13}")
        for th in np.arange(0.3, 0.95, 0.1):
            pred = (proba >= th).astype(int)
            tn, fp, fn, tp = confusion_matrix(y_te, pred).ravel()
            print(f"{th:>8.1f} {precision_score(y_te, pred):>10.3f} {recall_score(y_te, pred):>8.3f} "
                  f"{fp:>15} {fn:>13}")
        print()


if __name__ == "__main__":
    main()
