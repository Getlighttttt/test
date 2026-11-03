# WMS Frontend (React / Vite)

Web interface for the In-Plant WMS, built with **React 19** and **Vite**. It provides separate views for **Skladník** (warehouse operator) and **Dispečer** (dispatcher), including warehouse operations and ML shortage-risk monitoring.

## Run locally

Requires Node.js and npm. Start the ASP.NET backend at `http://localhost:5134` first, then run from `frontend/`:

```bash
npm ci
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` requests to `http://localhost:5134` (see `vite.config.js`). Other commands:

```bash
npm run build   # production files in dist/
npm run lint    # ESLint checks
```

## Run with Docker

From the **repository root**:

```bash
docker compose up -d --build
```

Open **http://localhost:8080**. The production React build is served by ASP.NET in the existing **`app` container**.

## Features and integration

- **Skladník (TSD):** receiving, storage transfers, sending pallets to L1/L2, consumption logging, and quarantine.
- **Dispečer:** stock dashboard, deviations, replenishment requests, quarantine cases, and line inventory.
- **ML on the dashboard:** predictions from `GET /api/ml/risk`, active alerts from `GET /api/ml/alerts`, and acknowledgment via `POST /api/ml/alerts/{id}/ack`. Prediction and alert data refresh every **15 seconds**.
- **Authentication:** protected routes based on the ASP.NET cookie session; API requests use relative `/api/...` URLs.

Important files: `src/App.jsx` (routes), `src/components/` (layout and protection), `src/pages/` (screens), `src/api.js` (API requests), `vite.config.js` (development proxy).

The frontend does not access PostgreSQL directly and does not store the ML service API key. Backend endpoints handle data access and protected ML actions.
