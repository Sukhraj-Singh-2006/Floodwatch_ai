"""Compatibility facade for existing FloodWatch rainfall consumers."""
from datetime import datetime, timezone
from backend.app.services.satellite_nwp_service import SatelliteNwpService


class RainfallService:
    _instance = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        self.weather = SatelliteNwpService.get_instance()

    def get_current_rainfall(self, latitude=None, longitude=None, location_id=None):
        data = self.weather.get_live_precipitation_and_soil(latitude, longitude, location_id)
        cur = data["current"]
        return {**cur, "value": cur.get("precipitation_mm"), "rain_mm": cur.get("rain_mm"), "unit": "mm",
                "source": data["data_source"], "timestamp": cur.get("timestamp"), "fetched_at": data.get("last_successful_fetch_at"),
                "status": data["status"], "data_type": "current_estimate", "is_stale": data.get("is_stale", False),
                "location": data["location"], "latitude": data["latitude"], "longitude": data["longitude"],
                "soil_saturation_pct": None, "soil_moisture_m3_m3": None, "soil_data_status": "UNAVAILABLE",
                "stations": [], "stationCount": 0,
                "cached_data_available": data.get("cached_data_available", False),
                "freshness": data.get("freshness", "unavailable"),
                "last_failed_refresh_at": data.get("last_failed_refresh_at"),
                "failure_type": data.get("failure_type"), "error": data.get("error"),
                "cache_age_seconds": data.get("cache_age_seconds"),
                "message": ("Cached Open-Meteo model estimate; provider refresh failed." if data.get("status") == "stale"
                            else "Point forecast estimate; no in-situ station readings are connected.")}

    def get_radar_metadata(self, location_id=None):
        data = self.weather.get_live_precipitation_and_soil(location_id=location_id)
        location = data["location"]
        cur = data["current"]
        # Open-Meteo is a point forecast; represent only the configured point and do not create a radar surface.
        cells = []
        if cur.get("precipitation_mm") is not None:
            cells.append({"center": [data["latitude"], data["longitude"]], "intensity_mm_per_hr": cur["precipitation_mm"],
                          "label": f"{location['name']} (point estimate)", "source": data["data_source"],
                          "timestamp": cur["timestamp"], "status": data["status"], "location_id": location["id"]})
        return {"station_name": "Open-Meteo point estimate", "station_code": location["id"],
                "latitude": data["latitude"], "longitude": data["longitude"], "last_sweep_utc": data.get("last_successful_fetch_at"),
                "status": data["status"], "cells": cells, "spatial_distribution_available": False,
                "provenance": {"source": data["data_source"], "timestamp": cur.get("timestamp"), "status": data["status"],
                               "notes": "A single point forecast is not spatial rainfall coverage."}}

    def get_forecast_for_horizon(self, horizon: str, location_id=None):
        data = self.weather.get_live_precipitation_and_soil(location_id=location_id)
        h = (horizon or "NOW").upper()
        if h in ("NOW", "CURRENT"):
            return self.get_current_rainfall(location_id=location_id)
        return {"horizon": h, "status": "forecast_data_unavailable", "source": "Open-Meteo",
                "message": "This legacy route uses fixed nowcast labels. See /hourly or /forecast for provider hourly periods.",
                "timestamp": data.get("fetched_at"), "provenance_status": "unavailable"}

    def get_telemetry_details(self, location_id=None):
        data = self.weather.get_live_precipitation_and_soil(location_id=location_id)
        cur = data["current"]
        loc = data["location"]
        return {"timestamp": data.get("fetched_at"), "source": data["data_source"], "status": data["status"],
                "location": loc, "latitude": data["latitude"], "longitude": data["longitude"],
                "data_type": "current_estimate", "city_aggregate": {
                    "mean_rainfall_rate_mm_h": cur.get("precipitation_mm"), "peak_rainfall_rate_mm_h": None,
                    "accumulated_24h_mm": None, "ambient_temperature_c": cur.get("temperature_c"),
                    "relative_humidity_pct": cur.get("humidity_percent"), "barometric_pressure_hpa": None,
                    "wind_speed_kmh": cur.get("wind_speed_kmh"), "wind_direction": None,
                    "soil_saturation_pct": None, "soil_moisture_m3_m3": None, "soil_data_status": "UNAVAILABLE",
                    "soil_source": None}, "hourly": data["hourly"], "aws_stations": [],
                "monitoring_locations": self.weather.get_locations(), "study_area": self.weather.get_study_area(),
                "fetched_at": data.get("last_successful_fetch_at"), "is_stale": data.get("is_stale", False),
                "forecast_hours_available": data.get("forecast_hours_available", 0)}
