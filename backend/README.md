# WMS Main Backend (ASP.NET Core 8)

Main REST API for the In-Plant WMS. Handles warehouse operations, user roles, PostgreSQL persistence, and integration with the Python ML service. In Docker, the same **`app` container** serves the compiled React frontend.

## Run with Docker

From the **repository root**:

```bash
docker compose up -d --build
```

- **WMS and API:** http://localhost:8080
- **Swagger:** http://localhost:8080/swagger
- **ML service (separate Python container):** http://localhost:8001/docs

## Run locally

Requires the **.NET 8 SDK** and both PostgreSQL databases. From the repository root:

```bash
docker compose up -d db1 db2
dotnet run --project backend/WmsApi/WmsApi/WmsApi.csproj --launch-profile http
```

Local API/Swagger: **http://localhost:5134/swagger**. The development connection strings in `WmsApi/WmsApi/appsettings.json` use PostgreSQL on `localhost:5433` (DB1) and `localhost:5434` (DB2).

The ML client defaults to `http://localhost:8000` outside Docker; if your ML service is instead running at the Docker-exposed port, set `ML_SERVICE_URL=http://localhost:8001` in the backend environment.

## Databases and startup

- **DB1 — `wms_operational`:** users and roles, products, orders, pallets, locations, replenishment requests, quarantine cases, and alerts.
- **DB2 — `wms_analytics`:** `MovementLogs`, `LineConsumptionLogs`, and `PredictionHistories`. The Python ML service also maintains its own analytics tables in DB2.
- At startup, `Program.cs` uses EF Core `EnsureCreated()`, seeds demo users/materials/orders/locations, and runs `ConsumptionBootstrapper`.
- `ConsumptionBootstrapper` inserts **1,000 synthetic consumption logs for L1 and 1,000 for L2** (2,000 total) across the last 180 days. It skips previously seeded line/material groups and does not create real pallets.

**Do not run `docker compose down -v` unless you intend to delete the database volumes.** `EnsureCreated()` does not perform schema migrations on existing databases.

## API and ML integration

- Warehouse operations: controllers for receiving, replenishment, line inventory, consumption, quarantine, authentication, and dispatcher views.
- `MlController` receives authenticated service-to-service alerts at `POST /api/ml/alerts` using `X-API-Key`. It creates/updates `Alert` and automatic `ReplenishmentRequest` records in DB1 without changing the manual request rules.
- Dispatcher ML endpoints: `GET /api/ml/alerts`, `POST /api/ml/alerts/{id}/ack`, `GET /api/ml/risk`, `POST /api/ml/forecast/run`, `POST /api/ml/train`, and `PUT /api/ml/threshold`.
- In Docker, C# connects to Python at **`http://ml-service:8000`** through `ML_SERVICE_URL`. Python calls C# at **`http://app:8080`** through `MAIN_BACKEND_URL`.

Key locations: `WmsApi/WmsApi/Controllers/` (API), `WmsApi/WmsApi/Models/` (entities/DTOs), `WmsApi/WmsApi/Data/` (EF contexts and seeders), `WmsApi/WmsApi/Program.cs` (startup).

For ML implementation details and API contracts, see [`../ml-service/README.md`](../ml-service/README.md) and [`../ml-service/docs/API_CONTRACT.md`](../ml-service/docs/API_CONTRACT.md).
