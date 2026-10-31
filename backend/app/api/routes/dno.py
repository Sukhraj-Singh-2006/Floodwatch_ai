"""
FloodWatch AI — Chennai Hydrodynamic DNO API Routes
SIH26085 — High-Resolution Urban Flood Susceptibility & Safe Mobility

Endpoints:
- GET  /api/v1/dno/health                     -> Health check, hardware device, model metadata & integrity hash
- POST /api/v1/dno/predict                    -> Spatiotemporal hydrodynamic forecast (H, U, V, extent, severity)
- GET  /api/v1/dno/events                     -> List available prepared storm events in Chennai library
- GET  /api/v1/dno/forecast/{event_id}/geojson -> Export inundated grid cells as standard GeoJSON polygons
"""

import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Query, Path

from backend.app.schemas.dno import (
    DNOHealthResponse,
    DNOPredictRequest,
    DNOPredictResponse,
    DNOEventsResponse
)
from backend.app.services.dno_inference_service import DNOInferenceService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dno", tags=["Hydrodynamic DNO (Experimental)"])


@router.get("/health", response_model=DNOHealthResponse)
def get_dno_health():
    """
    Returns the operational readiness, loaded checkpoint integrity, device (CUDA/CPU),
    and physical contract details of the experimental Chennai Phase 7C DNO model.
    """
    try:
        service = DNOInferenceService.get_instance()
        return service.get_health()
    except FileNotFoundError as e:
        logger.warning("DNO health unavailable: %s", e)
        raise HTTPException(status_code=503, detail="DNO model checkpoint is unavailable.") from e
    except Exception as e:
        logger.error("[DNO Health Error] %s", e)
        raise HTTPException(
            status_code=503,
            detail="DNO service is unavailable.",
        ) from e


@router.get("/events", response_model=DNOEventsResponse)
def get_available_events():
    """
    Lists the 30 prepared Chennai storm events available for DNO inference.
    All events have pre-assembled hydrodynamic simulation tensors conforming to the DNO schema.
    """
    try:
        service = DNOInferenceService.get_instance()
        return service.get_available_events()
    except FileNotFoundError as e:
        logger.warning("DNO events unavailable: %s", e)
        raise HTTPException(status_code=503, detail="DNO model checkpoint is unavailable.") from e
    except Exception as e:
        logger.error("[DNO Events Error] %s", e)
        raise HTTPException(
            status_code=503,
            detail="DNO service is unavailable.",
        ) from e


@router.post("/predict", response_model=DNOPredictResponse)
def predict_hydrodynamics(payload: DNOPredictRequest):
    """
    Runs DNO hydrodynamic forecast for a prepared Chennai event.
    Outputs:
    - Water depth H (meters)
    - Velocity magnitude W and components U, V (m/s)
    - Flooded cell counts and area (m2) for thresholds >0.05m, >0.10m, >0.20m, >0.50m, >1.00m
    - Depth severity classification bins across 120-minute horizon (24 x 5-minute timesteps)
    """
    try:
        service = DNOInferenceService.get_instance()
        result = service.predict_prepared_event(
            event_id=payload.event_id,
            include_spatial_grids=payload.include_spatial_grids,
            target_lead_minutes_spatial=payload.target_lead_minutes_spatial
        )
        return result
    except FileNotFoundError as e:
        logger.warning("DNO inference unavailable: %s", e)
        raise HTTPException(status_code=503, detail="DNO model checkpoint is unavailable.") from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[DNO Predict Error] {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"DNO inference execution failed: {str(e)}"
        )


@router.get("/forecast/{event_id}/geojson")
def get_forecast_geojson(
    event_id: str = Path(..., description="Prepared storm event identifier, e.g. storm_011"),
    lead_minutes: int = Query(default=60, ge=5, le=120, description="Forecast lead time in minutes (multiples of 5)"),
    threshold_m: float = Query(default=0.10, ge=0.01, le=5.0, description="Minimum inundation depth in meters for GeoJSON cells"),
    max_features: int = Query(default=1500, ge=10, le=5000, description="Maximum cell polygons to return")
):
    """
    Exports the predicted inundation footprint at a specific lead minute (T+5 to T+120)
    as a standard GeoJSON FeatureCollection of metric grid cell polygons (WGS84).
    Each polygon includes water depth (m), velocity (m/s), and severity classification.
    """
    try:
        service = DNOInferenceService.get_instance()
        geojson_data = service.get_forecast_geojson(
            event_id=event_id,
            lead_minutes=lead_minutes,
            threshold_m=threshold_m,
            max_features=max_features
        )
        return geojson_data
    except FileNotFoundError as e:
        logger.warning("DNO forecast unavailable: %s", e)
        raise HTTPException(status_code=503, detail="DNO model checkpoint is unavailable.") from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[DNO GeoJSON Error] {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate GeoJSON forecast: {str(e)}"
        )
