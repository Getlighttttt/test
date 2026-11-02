# WMS ML backend — deployment scaffold only

It is a minimal FastAPI server

## What's currently implemented

- `GET /health` returns HTTP `200` and `modelReady: false`.
- `POST /predict` validates a proposed request body, then returns HTTP `501`
  `MODEL_NOT_IMPLEMENTED`. This is intentional; it never generates fake risk values.
- FastAPI interactive documentation at `/docs`.
- A Dockerfile and Compose service exposing `127.0.0.1:8001` on the developer's PC.

## Launch

From the repository root:

```powershell
docker compose up -d --build ml-service
docker compose ps
```

Check `http://localhost:8001/health` or use:

```powershell
Invoke-RestMethod http://localhost:8001/health
```

The OpenAPI UI is at `http://localhost:8001/docs`.

Inside Docker Compose, the service address is `http://ml-service:8000`.
The `ML_SERVICE_URL` environment variable is added to the ASP.NET container as
**future configuration only**; no C# code currently calls the Python API.

