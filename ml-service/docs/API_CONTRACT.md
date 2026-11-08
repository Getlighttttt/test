# ML-сервис — контракт API (новая версия проекта: L1/L2, `app` на 8080)

## 1. Адрес и порт

| Как запущено                                             | Адрес ML                                      | Swagger                      |
| -------------------------------------------------------- | --------------------------------------------- | ---------------------------- |
| Docker Compose, с компьютера (браузер, фронтенд)         | `http://localhost:8001`                       | `http://localhost:8001/docs` |
| Docker Compose, из другого контейнера (C# `app`)         | `http://ml-service:8000` (= `ML_SERVICE_URL`) | —                            |
| Локально без Docker (`uvicorn app.main:app --port 8000`) | `http://localhost:8000`                       | `http://localhost:8000/docs` |

ML сам ходит на главный бэкенд: в Docker `MAIN_BACKEND_URL=http://app:8080`, локально `http://localhost:5134`.

**Общие правила**

- JSON в **camelCase**, как у WmsApi. `productCode` = `Product.Code` (MAT-001…003), `lineName` = **`L1` / `L2`** (`ProductionLines`).
- **Чтение (GET) и `/predict`** — без авторизации, фронтенд может звать напрямую (CORS открыт для `localhost:8080` и `localhost:5173`).
- **Запись/управление** — заголовок `X-API-Key: dev-ml-key`. Ключ знает только C#; кнопки диспетчера идут через `MlController` (`integration/csharp`).
- Время — UTC.

## 2. Риск для фронтенда ⭐

### `GET /api/predictions/latest`

Текущий риск по каждой паре линия/материал, от самого рискованного. Фильтры: `?productCode=MAT-001`, `?lineName=L1`.

```json
[
  {
    "id": 1299,
    "ts": "2026-11-03T13:08:58.525263Z",
    "lineName": "L2",
    "productCode": "MAT-003",
    "risk": 0.9915,
    "riskPercent": 99.2,
    "riskLevel": "HIGH",
    "minutesToStockout": 18.8,
    "threshold": 0.7,
    "isCritical": true,
    "recommendedQty": 62,
    "modelVersion": "v20261103-132447-904",
    "alertSent": true,
    "acknowledged": false
  }
]
```

| Поле                | Что показывать                                                              |
| ------------------- | --------------------------------------------------------------------------- |
| `riskPercent`       | «Riziko výpadku», %                                                         |
| `riskLevel`         | цвет: `HIGH` (≥ порога) красный, `MEDIUM` (≥ 40 %) оранжевый, `LOW` зелёный |
| `minutesToStockout` | на сколько минут хватит запаса (может быть `null`)                          |
| `recommendedQty`    | сколько подвезти (0, если не критично)                                      |

### `POST /predict` (контракт заглушки Architect) = `POST /api/predict`

Расчёт «что если» без записи в DB2. `consumptionRate` можно не передавать — ML возьмёт средний темп этой линии и материала из истории `LineConsumptionLogs` (DB2).

```json
{
  "productCode": "MAT-002",
  "lineName": "L2",
  "currentStock": 120,
  "horizonHours": 1
}
```

Ответ — объект как выше + `"consumptionRateUsed": 375.0, "rateSource": "history", "horizonMinutes": 60`.
Нет истории и нет `consumptionRate` → `422`. `horizonHours` принимается для совместимости; модель считает риск на 60 минут.

### Другие GET

| Путь                                                             | Что возвращает                                                                                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                                                    | `{ "status": "ok", "service": "wms-ml", "modelReady": true, "modelVersion", "algorithm", "criticalThreshold", "horizonMinutes", "mainSchemaReady" }`          |
| `GET /api/alerts`                                                | открытые критические прогнозы (формат как выше)                                                                                                               |
| `GET /api/analytics/consumption-rates`                           | темп расхода из `LineConsumptionLogs`: `[{ "lineName": "L1", "productCode": "MAT-001", "ratePerHour": 127.7, "unit": "ks", "records": 100, "lastRecordAt" }]` |
| `GET /api/analytics/consumption?lineName=L2&productCode=MAT-003` | точки для графика: `[{ "ts", "currentStock", "consumptionRate", "riskPercent" }]`                                                                             |
| `GET /api/analytics/defects`                                     | брак из `MovementLogs` (QUARANTINE, QUARANTINE_REWORK, QUARANTINE_CLAIM) по материалам                                                                        |
| `GET /api/analytics/movements`                                   | число операций по типам (RECEIVE, STORE, TO_LINE, CONSUME…)                                                                                                   |
| `GET /api/analytics/summary`                                     | KPI: `telemetryRecords, predictions, criticalPredictions, openAlerts, movements, defectEvents, modelVersion, criticalThreshold`                               |
| `GET /api/model/metrics`                                         | метрики версий модели                                                                                                                                         |

## 3. Тревога: ML → C# (`POST {MAIN_BACKEND_URL}/api/ml/alerts`)

Заголовки: `Content-Type: application/json`, `X-API-Key: dev-ml-key`.

```json
{
  "predictionId": 3,
  "productCode": "MAT-003",
  "lineName": "L2",
  "riskPercent": 91.4,
  "threshold": 0.7,
  "minutesToStockout": 53.4,
  "recommendedQty": 43,
  "priority": 1,
  "message": "Riziko výpadku MAT-003 na L2: 91 % (hranica 70 %). Doplniť 43 ks.",
  "modelVersion": "v20261103-132447-904",
  "createdAt": "2026-11-03T13:32:50.293169+00:00"
}
```

| Поле                         | Куда в DB1                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `productCode`                | `Product` по `Code` → `ProductId`                                                     |
| `lineName`                   | `Alert.LineName`, `ReplenishmentRequest.LineName` (через `ProductionLines.Normalize`) |
| `riskPercent`, `message`     | `Alert.RiskPercent`, `Alert.Message`                                                  |
| `recommendedQty`, `priority` | `ReplenishmentRequest.Quantity`, `.Priority` (1 — риск ≥ 90 %, 2 — ≥ 80 %, 3 — иначе) |

Ответы `MlController`: `200` принято · `400` линия не L1/L2 · `401` неверный ключ · `404` неизвестный материал.
Повтор той же тревоги — не чаще раза в 10 минут, пока её не подтвердили.

## 4. C# → ML (с `X-API-Key`), уже в `MlController`

| Кнопка диспетчера       | Маршрут C#                       | Вызов ML                                            | Тело                                             |
| ----------------------- | -------------------------------- | --------------------------------------------------- | ------------------------------------------------ |
| Spustiť ML predikciu    | `POST /api/ml/forecast/run`      | `POST /api/forecast/run`                            | —                                                |
| Potvrdiť alert          | `POST /api/ml/alerts/{id}/ack`   | `POST /api/alerts/ack`                              | `{ "productCode": "MAT-001", "lineName": "L1" }` |
| Pretrénovať model       | `POST /api/ml/train?source=auto` | `POST /api/model/train?source=auto\|synthetic\|db2` | —                                                |
| Zmeniť kritickú hranicu | `PUT /api/ml/threshold`          | `PUT /api/model/threshold`                          | `{ "criticalThreshold": 0.7 }`                   |
| Riziko (с сессией)      | `GET /api/ml/risk`               | `GET /api/predictions/latest`                       | —                                                |

Данные с линии (в демо их шлёт встроенный симулятор L1/L2):

```http
POST /api/telemetry
X-API-Key: dev-ml-key

{ "lineName": "L1", "productCode": "MAT-001", "currentStock": 12,
  "consumptionRate": 130, "plannedRate": 130, "openRequests": 0, "leadTimeMin": 20 }
```

## 5. DB2 — кто что делает

| Таблица                                           | Создаёт | Пишет                                                                                             | ML                                                   |
| ------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `MovementLogs`                                    | C#      | C# (`MovementLogger`)                                                                             | читает: брак, `TO_LINE` (+`LineName`) для симулятора |
| `LineConsumptionLogs`                             | C#      | C# (`ConsumptionBootstrapper`, экран Consumption)                                                 | читает: темп расхода по линиям                       |
| `PredictionHistories`                             | C#      | **ML** — каждый прогноз (RiskPercent 0–100, HorizonMinutes 60, PredictedShortageAt, ModelVersion) | пишет                                                |
| `consumption_log`, `predictions`, `model_metrics` | ML      | ML                                                                                                | свои таблицы                                         |

ML **никогда не создаёт таблицы C#**. При старте ML ждёт (до `MAIN_SCHEMA_WAIT_SEC`), пока C# создаст свои таблицы через `EnsureCreated()`, и только потом создаёт свои. Проверено на PostgreSQL 16 в обоих порядках запуска. Дополнительная страховка на стороне C# — в `integration/csharp/README.md`, пункт 4.
