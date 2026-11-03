"""Генератор синтетической истории работы линии.

Зачем: у нового завода (и у нашего учебного проекта) ещё нет месяцев реальной
истории в DB2. Чтобы модель можно было обучить с первого запуска, мы
симулируем смены по упрощённой физике медзисклада линии:

  * фактический расход колеблется вокруг такта (шум + редкие ускорения);
  * если есть открытая заявка, подвоз приходит через случайное время
    (lead time ± разброс, иногда сильная задержка — «AGV застрял»);
  * метка shortage = 1, если запас кончился раньше, чем приехал подвоз,
    в пределах горизонта прогноза.

Метка получается НЕ простой формулой от признаков (есть случайность),
поэтому модели действительно есть чему учиться, а не «угадывать правило».
Когда в DB2 накопится достаточно реальных записей, модель переобучается на них.
"""
import numpy as np
import pandas as pd


def generate(n: int = 6000, horizon_min: int = 60, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    # Темп по такту, шт/час. Диапазон покрывает реальные линии из LineConsumptionLogs:
    # MAT-001 ≈ 130/ч, MAT-003 ≈ 160 м/ч, MAT-002 ≈ 380/ч.
    planned_rate = rng.choice([30, 60, 90, 130, 160, 250, 380, 450], size=n).astype(float)
    # Текущий темп: обычно около плана, иногда линия «разгоняется»
    rate_factor = rng.normal(1.0, 0.12, n) + rng.binomial(1, 0.08, n) * rng.uniform(0.2, 0.5, n)
    consumption_rate = np.clip(planned_rate * rate_factor, 1, None)
    # Запас от «почти пусто» до «на 3 часа»
    current_stock = np.round(planned_rate * rng.uniform(0.05, 3.0, n))
    open_requests = rng.binomial(1, 0.45, n)
    lead_time_min = rng.uniform(10, 45, n)

    # --- Симуляция будущего (это и есть «правда», которую модель предсказывает) ---
    future_rate = consumption_rate * rng.lognormal(0, 0.15, n)
    t_empty = current_stock / future_rate * 60                       # мин до нуля
    delay = rng.binomial(1, 0.12, n) * rng.uniform(15, 60, n)         # сбой транспорта
    arrival = np.where(open_requests == 1, lead_time_min * rng.uniform(0.8, 1.3, n) + delay, np.inf)

    shortage = (t_empty < horizon_min) & (arrival > t_empty)

    return pd.DataFrame({
        "current_stock": current_stock,
        "consumption_rate": np.round(consumption_rate, 2),
        "planned_rate": planned_rate,
        "open_requests": open_requests,
        "lead_time_min": np.round(lead_time_min, 1),
        "shortage": shortage.astype(int),
    })
