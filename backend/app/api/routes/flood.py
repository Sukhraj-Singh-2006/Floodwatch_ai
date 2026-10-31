from typing import List, Optional, Any
from fastapi import APIRouter, HTTPException, Query
from backend.app.schemas.flood import FloodZoneSchema, SystemKPIsSchema, RecentPredictionSchema, RoadSegmentSchema
from backend.app.schemas.hotspot import FloodHotspotItem, FloodDepthResponse
from backend.app.services.flood_service import FloodService

router = APIRouter()

@router.get("/current-risk/kpis", response_model=SystemKPIsSchema)
def get_current_kpis():
    service = FloodService.get_instance()
    return service.get_kpis()

@router.get("/forecast-risk", response_model=List[FloodZoneSchema])
def get_forecast_risk(horizon: str = Query(default="NOW", description="Prediction horizon (NOW, +30M, +1H, +2H, +3H)")):
    service = FloodService.get_instance()
    return service.get_flood_zones(horizon=horizon)

@router.get("/forecast-risk/status")
def get_forecast_status(horizon: str = Query(default="NOW", description="Prediction horizon")):
    service = FloodService.get_instance()
    return service.get_forecast_status(horizon=horizon)

@router.get("/forecast-risk/recent", response_model=List[RecentPredictionSchema])
def get_recent_predictions():
    service = FloodService.get_instance()
    return service.get_recent_predictions()

@router.get("/flood/hotspots", response_model=List[FloodHotspotItem])
@router.get("/hotspots", response_model=List[FloodHotspotItem])
def get_flood_hotspots(limit: int = Query(default=20, ge=1, le=100)):
    service = FloodService.get_instance()
    return service.get_hotspots(limit=limit)

@router.get("/flood/depth", response_model=FloodDepthResponse)
@router.get("/depth", response_model=FloodDepthResponse)
def get_flood_depth(location: str = Query(default="Velachery Basin")):
    service = FloodService.get_instance()
    return service.get_depth_prediction(location=location)

@router.get("/map-data/zones/{grid_id}", response_model=FloodZoneSchema)
def get_zone_by_id(grid_id: str):
    service = FloodService.get_instance()
    zone = service.get_zone_by_id(grid_id)
    if not zone:
        raise HTTPException(status_code=404, detail=f"Grid cell {grid_id} not found")
    return zone

@router.get("/map-data/roads", response_model=List[RoadSegmentSchema])
def get_road_segments():
    service = FloodService.get_instance()
    return service.get_road_segments()

@router.get("/location-risk", response_model=FloodZoneSchema)
def get_location_risk(location: str = Query(..., description="Location name or landmark")):
    service = FloodService.get_instance()
    zone = service.get_location_risk(location)
    if not zone:
        raise HTTPException(status_code=404, detail=f"Location {location} not found")
    return zone


@router.get("/predict-eta")
@router.post("/predict-eta")
@router.get("/flood/predict-eta")
@router.post("/flood/predict-eta")
def predict_flood_eta(
    rainfall_rate_mm_h: Optional[float] = Query(default=None, description="Optional rainfall input; an Open-Meteo point estimate is not a basin rain rate"),
    accumulated_rainfall_mm: Optional[float] = Query(default=None, description="Optional antecedent rainfall; no compatible catchment feed is connected")
):
    """
    Reports physical ETA availability. This endpoint does not fabricate depth or ETA
    until a calibrated solver and required basin-scale inputs are connected.
    """
    service = FloodService.get_instance()
    return service.predict_inundation_eta(
        rainfall_rate_mm_h=rainfall_rate_mm_h,
        accumulated_rainfall_mm=accumulated_rainfall_mm
    )

