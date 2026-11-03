"""Конфигурация ML-сервиса. Все значения берутся из переменных окружения
(их задаёт docker-compose), поэтому код не нужно менять между ноутбуком и Docker."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", protected_namespaces=())

    # --- DB2 (аналитическая база) ---
    # Внутри docker-сети хост = имя сервиса "db2" и внутренний порт 5432.
    # Локально (без Docker) используется проброшенный порт 5434.
    database_url: str = "postgresql+psycopg://wms:wms123@localhost:5434/wms_analytics"
    # Сколько секунд при старте ждать, пока C# создаст свои таблицы в DB2
    # (EnsureCreated работает только на пустой базе — см. app/db.py)
    main_schema_wait_sec: int = 90

    # --- Связь с главным бэкендом ---
    # Локально — профиль "http" из launchSettings.json; в Docker — http://app:8080
    main_backend_url: str = "http://localhost:5134"
    main_backend_alert_path: str = "/api/ml/alerts"
    # Общий секрет между бэкендами (заголовок X-API-Key)
    service_api_key: str = "dev-ml-key"

    # --- Бизнес-параметры от Domain Expert ---
    # BPMN-шлюз «Riziko výpadku > kritická hranica?»
    critical_threshold: float = 0.70
    # Горизонт прогноза: «будет ли дефицит в ближайшие N минут»
    horizon_minutes: int = 60

    # --- Модель ---
    model_path: str = "models/shortage_model.joblib"
    # Минимум реальных записей в DB2, чтобы переобучаться на них, а не на синтетике
    min_real_samples: int = 200
    # Темп расхода берём из последних N записей LineConsumptionLogs по паре линия/материал
    rate_history_records: int = 100

    # --- Симулятор конвейера («Cyklický zber») ---
    simulator_enabled: bool = False
    simulator_interval_sec: int = 30
    # true  — симулятор сам «подвозит» материал после алерта (демо без участия людей);
    # false — материал прибывает только когда складник реально отправит паллету на линию
    #         (событие TO_LINE в MovementLogs) — полный замкнутый цикл через главный бэкенд.
    simulator_auto_refill: bool = False

    # --- CORS для фронтенда ---
    # 8080 — фронтенд, который отдаёт контейнер app (C#); 5173 — Vite при разработке
    cors_origins: str = "http://localhost:8080,http://localhost:5173,http://localhost:3000"


settings = Settings()
