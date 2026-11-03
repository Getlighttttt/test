"""Автотесты ML-сервиса. Запуск: pytest -q
Используют SQLite вместо PostgreSQL, чтобы не требовать Docker для тестов.
Таблицы главного бэкенда (C#) в тестах создаём сами — как будто C# уже запустился.
Отправка алерта на главный бэкенд подменяется (monkeypatch)."""
import os
import tempfile
from datetime import date, datetime, timedelta, timezone

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["MODEL_PATH"] = f"{_tmp}/model.joblib"
os.environ["SERVICE_API_KEY"] = "test-key"
os.environ["MIN_REAL_SAMPLES"] = "50"
os.environ["SIMULATOR_ENABLED"] = "false"
os.environ["MAIN_SCHEMA_WAIT_SEC"] = "5"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import func, select  # noqa: E402

from app import service, simulator  # noqa: E402
from app.db import (LineConsumptionLog, MainBase, MovementLog,  # noqa: E402
                    PredictionHistory, SessionLocal, engine)
from app.main import app  # noqa: E402

H = {"X-API-Key": "test-key"}
sent = []


def _seed_csharp_db2():
    """Имитируем C#: EnsureCreated (таблицы) + ConsumptionBootstrapper (история расхода)."""
    MainBase.metadata.create_all(engine)
    start = datetime(2026, 10, 1, 6, 0, tzinfo=timezone.utc)
    with SessionLocal() as db:
        for i in range(30):                      # L1/MAT-001: 100 шт за 48 мин → 125 шт/ч
            t0 = start + timedelta(hours=i)
            db.add(LineConsumptionLog(product_code="MAT-001", line_name="L1", period_start=t0,
                                      period_end=t0 + timedelta(minutes=48), quantity_consumed=100,
                                      unit="ks", source="synthetic", recorded_at=date(2026, 10, 1)))
        for i in range(30):                      # L2/MAT-003: 200 м за 75 мин → 160 м/ч
            t0 = start + timedelta(hours=i)
            db.add(LineConsumptionLog(product_code="MAT-003", line_name="L2", period_start=t0,
                                      period_end=t0 + timedelta(minutes=75), quantity_consumed=200,
                                      unit="m", source="synthetic", recorded_at=date(2026, 10, 1)))
        db.commit()


@pytest.fixture(scope="module")
def client():
    _seed_csharp_db2()
    service.send_alert = lambda payload: (sent.append(payload) or (True, None))
    with TestClient(app) as c:
        yield c


# Фронтенд/C# шлют camelCase
LOW = dict(lineName="L1", productCode="MAT-001", currentStock=8, consumptionRate=70,
           plannedRate=60, openRequests=0, leadTimeMin=25)
HIGH = dict(lineName="L2", productCode="MAT-003", currentStock=400, consumptionRate=40,
            plannedRate=45, openRequests=0, leadTimeMin=20)


def test_health_and_model_trained_on_start(client):
    r = client.get("/health").json()
    assert r["status"] == "ok" and r["modelReady"] and r["mainSchemaReady"]
    m = client.get("/api/model/metrics").json()
    assert m[0]["dataSource"] == "synthetic" and m[0]["rocAuc"] > 0.9


def test_api_key_required(client):
    assert client.post("/api/telemetry", json=LOW).status_code == 401


def test_critical_path_sends_alert_in_csharp_format(client):
    r = client.post("/api/telemetry", json=LOW, headers=H).json()
    assert r["isCritical"] and r["alertSent"] and r["recommendedQty"] > 0 and r["riskLevel"] == "HIGH"
    a = sent[-1]
    assert a["productCode"] == "MAT-001" and a["lineName"] == "L1"
    assert isinstance(a["recommendedQty"], int) and a["priority"] in (1, 2, 3) and a["riskPercent"] > 70
    n = len(sent)
    client.post("/api/telemetry", json=LOW, headers=H)          # повтор не дублирует алерт
    assert len(sent) == n
    assert any(x["lineName"] == "L1" for x in client.get("/api/alerts").json())


def test_predictions_copied_to_csharp_history_table(client):
    with SessionLocal() as db:
        rows = db.scalars(select(PredictionHistory).where(PredictionHistory.line_name == "L1")).all()
    assert rows and 0 <= rows[0].risk_percent <= 100 and rows[0].horizon_minutes == 60
    assert rows[0].model_version and rows[0].predicted_shortage_at is not None


def test_consumption_rates_from_history(client):
    rates = {(r["lineName"], r["productCode"]): r for r in client.get("/api/analytics/consumption-rates").json()}
    assert rates[("L1", "MAT-001")]["ratePerHour"] == 125.0 and rates[("L1", "MAT-001")]["records"] == 30
    assert rates[("L2", "MAT-003")]["ratePerHour"] == 160.0 and rates[("L2", "MAT-003")]["unit"] == "m"


def test_predict_architect_contract_uses_history_rate(client):
    # тело как в заглушке Architect: без consumptionRate → темп из LineConsumptionLogs
    r = client.post("/predict", json={"productCode": "MAT-001", "lineName": "L1",
                                      "currentStock": 30, "horizonHours": 1})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["rateSource"] == "history" and j["consumptionRateUsed"] == 125.0 and j["riskLevel"] == "HIGH"
    # нет истории и нет темпа → понятная ошибка
    assert client.post("/predict", json={"productCode": "MAT-009", "lineName": "L1",
                                         "currentStock": 30}).status_code == 422


def test_snake_case_input_also_accepted(client):
    r = client.post("/api/predict", json={"line_name": "L9", "product_code": "MAT-002", "current_stock": 500,
                                          "consumption_rate": 30, "planned_rate": 30})
    assert r.status_code == 200 and r.json()["riskLevel"] == "LOW" and r.json()["rateSource"] == "request"


def test_safe_path_no_alert(client):
    r = client.post("/api/telemetry", json=HIGH, headers=H).json()
    assert not r["isCritical"] and not r["alertSent"]


def test_ack_closes_alerts(client):
    a = client.get("/api/alerts").json()[0]
    client.post(f"/api/alerts/{a['id']}/ack", headers=H)
    assert all(x["lineName"] != a["lineName"] for x in client.get("/api/alerts").json())


def test_ack_by_pair_from_csharp(client):
    client.post("/api/telemetry", json=dict(LOW, lineName="L7"), headers=H)
    r = client.post("/api/alerts/ack", json={"productCode": "MAT-001", "lineName": "L7"}, headers=H).json()
    assert r["acknowledged"] >= 1
    assert all(x["lineName"] != "L7" for x in client.get("/api/alerts").json())


def test_threshold_changes_decision(client):
    client.put("/api/model/threshold", json={"criticalThreshold": 0.99}, headers=H)
    mid = dict(LOW, currentStock=45, openRequests=1)
    assert not client.post("/api/predict", json=mid).json()["isCritical"]
    client.put("/api/model/threshold", json={"criticalThreshold": 0.7}, headers=H)


def test_reads_movementlogs_written_by_csharp(client):
    with SessionLocal() as db:                                 # так пишет MovementLogger в C#
        db.add_all([MovementLog(event_type="RECEIVE", pallet_code="PALLET-001", product_code="MAT-001", quantity=100),
                    MovementLog(event_type="QUARANTINE", pallet_code="PALLET-002", product_code="MAT-002",
                                quantity=50, to_zone="QUARANTINE", details="dôvod: prasknutý obal"),
                    MovementLog(event_type="QUARANTINE_CLAIM", pallet_code="PALLET-002", product_code="MAT-002",
                                quantity=50)])
        db.commit()
    s = client.get("/api/analytics/summary").json()
    assert s["movements"] == 3 and s["defectEvents"] == 2 and s["predictions"] >= 3
    assert {d["eventType"] for d in client.get("/api/analytics/defects").json()} == {"QUARANTINE", "QUARANTINE_CLAIM"}
    hist = client.get("/api/analytics/consumption", params={"lineName": "L1", "productCode": "MAT-001"}).json()
    assert len(hist) == 2 and "currentStock" in hist[0]


def test_latest_filter_and_forecast_run(client):
    res = client.post("/api/forecast/run", headers=H).json()
    assert {p["lineName"] for p in res} == {"L1", "L2", "L7"}
    assert len(client.get("/api/predictions/latest").json()) == 3
    only = client.get("/api/predictions/latest", params={"productCode": "MAT-003"}).json()
    assert len(only) == 1 and only[0]["productCode"] == "MAT-003"


def test_simulator_uses_history_and_picks_up_to_line_delivery(client):
    simulator.tick()                                           # инициализация + запоминает последний Id
    assert simulator._state[("L1", "MAT-001")]["planned"] == 125.0          # темп из истории
    simulator._state[("L2", "MAT-002")]["stock"] = 5
    before_l1 = simulator._state[("L1", "MAT-002")]["stock"]
    before_l2 = simulator._state[("L2", "MAT-002")]["stock"]
    with SessionLocal() as db:                                 # складник отправил MAT-002 на L2
        db.add(MovementLog(event_type="TO_LINE", pallet_code="PALLET-007", product_code="MAT-002",
                           quantity=300, from_zone="STORAGE", to_zone="LINE_BUFFER", line_name="L2"))
        db.commit()
    simulator.tick()
    assert simulator._state[("L2", "MAT-002")]["stock"] > before_l2 + 200    # пришло на L2
    assert simulator._state[("L1", "MAT-002")]["stock"] < before_l1          # L1 не задета


def test_retrain_auto_falls_back_to_synthetic(client):
    r = client.post("/api/model/train", params={"source": "auto"}, headers=H).json()
    assert r["dataSource"] == "synthetic"
    assert client.post("/api/model/train", params={"source": "db2"}, headers=H).status_code == 400


def test_label_history_and_retrain_on_db2(client):
    """Реальная обратная связь: старые измерения размечаются по факту и модель учится на DB2."""
    import random
    from app.db import ConsumptionLog, utcnow
    random.seed(1)
    start = utcnow() - timedelta(hours=30)
    with SessionLocal() as db:
        for k in range(8):                       # 8 «смен» по 20 измерений каждые 10 мин
            stock = random.choice([40, 60, 250])
            for i in range(20):
                stock = stock + 150 if i == 12 else max(0, stock - random.uniform(5, 15))
                db.add(ConsumptionLog(ts=start + timedelta(hours=3 * k, minutes=10 * i),
                                      line_name=f"HIST-{k}", product_code="MAT-H", current_stock=round(stock),
                                      consumption_rate=60, planned_rate=60, open_requests=0, lead_time_min=20))
        db.commit()
        labeled = service.label_history(db)
        assert db.scalar(select(func.count()).select_from(PredictionHistory)) > 0
    assert labeled > 100
    r = client.post("/api/model/train", params={"source": "db2"}, headers=H)
    assert r.status_code == 200, r.text
    assert r.json()["dataSource"] == "db2"
    client.post("/api/model/train", params={"source": "synthetic"}, headers=H)  # вернуть демо-модель
