"""Live rainfall and weather endpoints backed by the server-side Open-Meteo client."""
from fastapi import APIRouter, HTTPException, Query
from backend.app.services.rainfall_service import RainfallService
from backend.app.services.satellite_nwp_service import SatelliteNwpService
from backend.app.core.config import settings

router = APIRouter(prefix="/rainfall", tags=["Rainfall & Weather"])


def _weather(latitude, longitude, location_id):
    try:
        return SatelliteNwpService.get_instance().get_live_precipitation_and_soil(latitude, longitude, location_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/current")
def current(latitude: float | None = None, longitude: float | None = None, location_id: str | None = None):
    try:
        return RainfallService.get_instance().get_current_rainfall(latitude, longitude, location_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/hourly")
@router.get("/forecast")
def hourly_forecast(latitude: float | None = None, longitude: float | None = None, location_id: str | None = None):
    data = _weather(latitude, longitude, location_id)
    return {"location": data["location"], "latitude": data["latitude"], "longitude": data["longitude"],
            "data_source": data["data_source"], "data_type": "forecast", "status": data["status"],
            "fetched_at": data.get("last_successful_fetch_at"), "is_stale": data.get("is_stale", False),
            "freshness": data.get("freshness"), "cached_data_available": data.get("cached_data_available", False),
            "forecast_is_stale": data.get("forecast_is_stale", False),
            "forecast_cache_age_seconds": data.get("forecast_cache_age_seconds"),
            "last_failed_refresh_at": data.get("last_failed_refresh_at"), "failure_type": data.get("failure_type"),
            "error": data.get("error"),
            "forecast_hours_requested": data["forecast_hours_requested"],
            "forecast_hours_available": data["forecast_hours_available"], "timezone": data.get("timezone", "Asia/Kolkata"),
            "hourly": data["hourly"]}


@router.get("/history")
def history(location_id: str | None = None, limit: int = Query(default=168, ge=1, le=744),
            category: str | None = Query(default=None, pattern="^(current_estimate|forecast|historical)$")):
    try:
        return SatelliteNwpService.get_instance().get_history(location_id, limit, category)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/status")
def status(location_id: str | None = None):
    try:
        return SatelliteNwpService.get_instance().get_status(location_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/locations")
def locations():
    service = SatelliteNwpService.get_instance()
    return {"locations": service.get_locations(), "study_area": service.get_study_area(), "data_source": "Open-Meteo",
            "refresh_interval_seconds": settings.WEATHER_REFRESH_INTERVAL_SECONDS,
            "forecast_hours": settings.WEATHER_FORECAST_HOURS}


@router.get("/radar")
def radar(location_id: str | None = None):
    try:
        return RainfallService.get_instance().get_radar_metadata(location_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/telemetry-details")
def telemetry_details(location_id: str | None = None):
    try:
        return RainfallService.get_instance().get_telemetry_details(location_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/satellite-nwp")
def satellite_nwp(latitude: float | None = None, longitude: float | None = None, location_id: str | None = None):
    return _weather(latitude, longitude, location_id)


@router.get("/forecast-horizon")
def forecast_horizon(horizon: str = Query(default="NOW"), location_id: str | None = None):
    try:
        return RainfallService.get_instance().get_forecast_for_horizon(horizon, location_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
