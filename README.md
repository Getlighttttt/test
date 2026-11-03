# In-Plant WMS

Warehouse management demo for receiving and storing pallets, supplying production lines (L1/L2), tracking consumption, and preparing data for shortage prediction.

## Run

Requires Docker with Docker Compose. From the repository root:

```bash
docker compose up -d --build
```

- **WMS frontend and API:** http://localhost:8080
- **API documentation:** http://localhost:8080/swagger
- **ML service health:** http://localhost:8001/health
- **ML API documentation:** http://localhost:8001/docs

```bash
docker compose ps                 # container status
docker compose logs -f app        # backend logs
docker compose down               # stop containers (data is preserved)
```

**Do not use `docker compose down -v`** unless you want to delete the database volumes.

| Service | Purpose |
| --- | --- |
| `app` | ASP.NET Core 8 API, also serves the built React frontend (port 8080) |
| `db1` | PostgreSQL `wms_operational` — current warehouse state (host port 5433) |
| `db2` | PostgreSQL `wms_analytics` — movement and consumption history (host port 5434) |
| `ml-service` | Python FastAPI service (host port 8001; `ml-service:8000` inside Docker) |

DB1 includes users, products, orders, pallets, locations, replenishment requests, quarantine cases, and alerts. DB2 has `MovementLogs`, `LineConsumptionLogs`, and `PredictionHistories`. Logs in DB2 refer to pallets by **code**, not a foreign key into DB1.

1. **Receiving:** Skladník receives pallets against a supplier order. Dispečer approves any quantity deviations.
2. **Storage / quarantine:** Accepted pallets are stored in free locations; problematic pallets can be quarantined and moved to rework or claim areas.
3. **Replenishment:** Dispečer requests material for L1 or L2; Skladník sends an entire matching pallet. The pallet is tracked by `Status = ON_LINE` and `LineName`.
4. **Consumption:** Skladník selects an on-line pallet, date, arrival time, and duration in minutes. Confirmation marks the whole pallet `CONSUMED` in DB1 and creates `CONSUME` in `MovementLogs` plus a record in `LineConsumptionLogs` in DB2.
5. **Monitoring:** Dispečer sees current stock, production-line inventory, requests, deviations, and quarantine cases.

`LineConsumptionLogs` records the product, line, pallet code (nullable), consumed quantity, UTC start/end times, and `RecordedAt` (the date selected by Skladník). `Source` distinguishes manual records from synthetic test data.

The backend automatically creates sample users, materials, five supplier orders (`ORD-001`–`ORD-005`), and warehouse locations. It also generates **1,000 synthetic consumption logs for each production line (2,000 total)** in DB2: L1 uses MAT-001 and MAT-002, while L2 uses MAT-002 and MAT-003. Each record represents one whole pallet with randomized consumption duration and timestamps, `PalletCode = NULL`, and `Source = "synthetic"`. Initialization checks existing data to avoid generating duplicate records on restart.

The Python service is currently a **placeholder**: `/health` works, but `/predict` returns HTTP 501 until a model is integrated. ASP.NET is not yet calling it.