"""A deployable API scaffold. NO machine-learning model is implemented yet."""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(
    title="In-Plant WMS ML Service",
    description="Infrastructure placeholder for the AI Expert's shortage-risk model.",
    version="0.1.0",
)


class PredictionRequest(BaseModel):
    # FastAPI uses these camelCase keys in its public OpenAPI/JSON contract.
    productCode: str = Field(min_length=1, max_length=100)
    lineName: str = Field(min_length=1, max_length=100)
    currentStock: float = Field(ge=0, description="Units currently available on the line")
    consumptionRate: float = Field(ge=0, description="Consumed units per hour")
    horizonHours: float = Field(gt=0, le=168, description="Prediction horizon in hours")


@app.get("/health")
def health():
    """Used by Docker Compose to verify that the HTTP service is running."""
    return {"status": "ok", "service": "wms-ml", "modelReady": False}


@app.post("/predict")
def predict(request: PredictionRequest):
    """Explicitly fail until a real trained model is integrated.

    Returning a made-up percentage would wrongly imply that ML already works.
    """
    raise HTTPException(
        status_code=501,
        detail={
            "code": "MODEL_NOT_IMPLEMENTED",
            "message": "ML inference has not been implemented. Contact the AI Expert.",
        },
    )
