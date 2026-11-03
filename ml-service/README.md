# WMS ML Service (Python / FastAPI)

Второй бэкенд системы внутризаводской логистики: прогноз дефицита материала на линии
(Material Shortage Prediction), алерты на главный бэкенд, аналитическая база DB2.

```bash
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000   # API: http://localhost:8000/docs
pytest -q                                   # 16 тестов
python -m app.ml.evaluate                   # отчёт о качестве модели
```

В Docker: `docker compose up -d --build` из корня репозитория → ML на `http://localhost:8001` (блок сервиса — `docker-compose.ml-snippet.yml`).
Контракт API — [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md), подключение к C# — [`integration/csharp/README.md`](integration/csharp/README.md).

Полное пошаговое описание, объяснение решений и контракт для остальных участников —
[`docs/AI_EXPERT_GUIDE.md`](docs/AI_EXPERT_GUIDE.md).
