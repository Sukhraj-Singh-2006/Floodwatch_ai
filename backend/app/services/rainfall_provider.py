"""Rainfall provider contracts and the Open-Meteo adapter."""
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Dict, Optional


class RainfallProvider(ABC):
    @abstractmethod
    def get_current(self) -> Dict[str, Any]: ...
    @abstractmethod
    def get_forecast(self, horizon: str) -> Dict[str, Any]: ...
    @abstractmethod
    def get_timestamp(self) -> str: ...
    @abstractmethod
    def get_source(self) -> str: ...
    @abstractmethod
    def get_confidence(self) -> Optional[float]: ...


class SatelliteNwpProvider(RainfallProvider):
    """Open-Meteo point estimate adapter. The provider has no gauge telemetry."""
    def __init__(self):
        from backend.app.services.satellite_nwp_service import SatelliteNwpService
        self.service = SatelliteNwpService.get_instance()
        self.provider_name = "Open-Meteo"

    def get_current(self):
        data = self.service.get_live_precipitation_and_soil()
        current = data["current"]
        return {**current, "value": current.get("precipitation_mm"), "unit": "mm",
                "source": self.provider_name, "timestamp": current.get("timestamp"),
                "status": data["status"], "data_type": "current_estimate",
                "location": data["location"], "latitude": data["latitude"], "longitude": data["longitude"],
                "fetched_at": data.get("last_successful_fetch_at"), "is_stale": data.get("is_stale", False)}

    def get_forecast(self, horizon: str):
        return {"horizon": horizon, "status": "forecast_data_unavailable", "source": self.provider_name,
                "message": "Use the hourly forecast endpoint; Open-Meteo hourly periods are not fixed 30-minute nowcasts."}

    def get_timestamp(self):
        data = self.service.get_live_precipitation_and_soil()
        return data.get("last_successful_fetch_at") or datetime.now(timezone.utc).isoformat()

    def get_source(self):
        return self.provider_name

    def get_confidence(self):
        return None
