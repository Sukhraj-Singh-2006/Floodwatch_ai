"""Open-Meteo-backed, cached rainfall and weather estimates for project locations."""
from __future__ import annotations

import json
import logging
import os
import csv
import socket
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.db.models.weather_observation import WeatherObservation
from backend.app.db.session import SessionLocal

logger = logging.getLogger(__name__)
PROVIDER = "Open-Meteo"
CHENNAI_TIMEZONE = "Asia/Kolkata"


def _iso_utc(value: datetime | None = None) -> str:
    return (value or datetime.now(timezone.utc)).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _provider_datetime(value: str, tz_name: str = CHENNAI_TIMEZONE) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.replace(tzinfo=ZoneInfo(tz_name)) if parsed.tzinfo is None else parsed


def _display_iso(value: datetime, tz_name: str = CHENNAI_TIMEZONE) -> str:
    return value.astimezone(ZoneInfo(tz_name)).isoformat()


def _as_utc_naive(value: datetime) -> datetime:
    aware = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return aware.astimezone(timezone.utc).replace(tzinfo=None)


def _number(obj: dict, key: str, lower: float | None = None, upper: float | None = None):
    value = obj.get(key)
    if value is None:
        return None
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    if not (-1e6 < value < 1e6) or (lower is not None and value < lower) or (upper is not None and value > upper):
        return None
    return value


class SatelliteNwpService:
    """Fetch-on-demand plus a single process-wide refresh/cache per location."""
    _instance = None
    _instance_lock = threading.Lock()

    @classmethod
    def get_instance(cls):
        with cls._instance_lock:
            if cls._instance is None:
                cls._instance = cls()
        return cls._instance

    def __init__(self):
        if not 1 <= settings.WEATHER_FORECAST_HOURS <= 384:
            raise ValueError("WEATHER_FORECAST_HOURS must be within the Open-Meteo forecast_hours range (1–384).")
        self._cache: dict[str, dict[str, Any]] = {}
        self._last_fetch: dict[str, float] = {}
        self._last_attempt: dict[str, float] = {}
        self._last_error: dict[str, str] = {}
        self._last_failure_type: dict[str, str] = {}
        self._last_failure_at: dict[str, str] = {}
        self._locks: dict[str, threading.Lock] = {}
        self._lock = threading.Lock()
        self._coverage = self._load_study_area()
        self.locations = self._load_locations()

    def _load_study_area(self):
        path = settings.WEATHER_STUDY_AREA_GEOJSON
        if not os.path.isabs(path):
            root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
            path = os.path.join(root, path)
        try:
            with open(path, encoding="utf-8") as f:
                geojson = json.load(f)
            geometries = [item["geometry"] for item in geojson.get("features", []) if item.get("geometry")]
            points = [point for geom in geometries for point in self._geometry_points(geom)]
            min_lon = min(point[0] for point in points)
            min_lat = min(point[1] for point in points)
            max_lon = max(point[0] for point in points)
            max_lat = max(point[1] for point in points)
            try:
                from shapely.geometry import shape
                from shapely.ops import unary_union
                union = unary_union([shape(geom) for geom in geometries])
            except ImportError:
                union = None
            return {"geometry": union, "geometries": geometries,
                    "crs": geojson.get("crs", {}).get("properties", {}).get("name", "unknown"),
                    "bounds": {"min_lat": min_lat, "min_lon": min_lon, "max_lat": max_lat, "max_lon": max_lon},
                    "source": os.path.relpath(path, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))}
        except Exception as exc:
            logger.exception("Could not load project study-area grid at %s: %s", path, exc)
            return {"geometry": None, "geometries": [], "crs": None, "bounds": None, "source": path}

    @staticmethod
    def _geometry_points(geometry):
        def walk(value):
            if isinstance(value, (list, tuple)):
                if len(value) >= 2 and isinstance(value[0], (int, float)) and isinstance(value[1], (int, float)):
                    yield (float(value[0]), float(value[1]))
                else:
                    for child in value:
                        yield from walk(child)
        yield from walk(geometry.get("coordinates", []))

    def _load_locations(self):
        try:
            configured = json.loads(settings.WEATHER_MONITORING_LOCATIONS or "[]")
            if not isinstance(configured, list):
                raise ValueError("must be a JSON list")
        except (ValueError, TypeError) as exc:
            logger.error("Invalid WEATHER_MONITORING_LOCATIONS: %s", exc)
            configured = []
        if not configured:
            configured = [{"id": "chennai-reference", "name": "Chennai reference point (single-point estimate)",
                           "latitude": settings.DEFAULT_LAT, "longitude": settings.DEFAULT_LON}]
        valid = []
        for item in configured:
            try:
                loc = {"id": str(item.get("id") or f"{item['latitude']},{item['longitude']}"),
                       "name": str(item.get("name") or "Configured monitoring point"),
                       "latitude": float(item["latitude"]), "longitude": float(item["longitude"])}
                if not (-90 <= loc["latitude"] <= 90 and -180 <= loc["longitude"] <= 180):
                    raise ValueError("coordinates out of range")
                if not self._inside_study_area(loc["latitude"], loc["longitude"]):
                    logger.warning("Ignoring weather location outside project grid: %s", loc["id"])
                    continue
                valid.append(loc)
            except (KeyError, TypeError, ValueError) as exc:
                logger.warning("Ignoring invalid weather location %r: %s", item, exc)
        return valid

    def _inside_study_area(self, lat: float, lon: float) -> bool:
        geometry = self._coverage.get("geometry")
        if geometry is not None:
            from shapely.geometry import Point
            return geometry.covers(Point(lon, lat))
        return any(self._covers_geojson(geom, lon, lat) for geom in self._coverage.get("geometries", []))

    @classmethod
    def _covers_geojson(cls, geometry, x, y):
        def in_ring(ring):
            inside = False
            for i, (x1, y1) in enumerate(ring):
                x2, y2 = ring[(i + 1) % len(ring)]
                cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1)
                if abs(cross) < 1e-12 and min(x1, x2) - 1e-12 <= x <= max(x1, x2) + 1e-12 and min(y1, y2) - 1e-12 <= y <= max(y1, y2) + 1e-12:
                    return True
                if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                    inside = not inside
            return inside
        kind = geometry.get("type")
        polygons = geometry.get("coordinates", [])
        if kind == "Polygon":
            polygons = [polygons]
        elif kind not in ("MultiPolygon", "Polygon"):
            return False
        for polygon in polygons:
            if polygon and in_ring(polygon[0]) and not any(in_ring(hole) for hole in polygon[1:]):
                return True
        return False

    def get_study_area(self):
        return {k: self._coverage.get(k) for k in ("crs", "bounds", "source")}

    def get_locations(self):
        return [dict(loc) for loc in self.locations]

    def restore_cache_from_database(self):
        """Rehydrate each configured point from its latest successfully persisted response."""
        restored = 0
        for location in self.locations:
            try:
                restored += int(self._restore_location_cache(location))
            except Exception:
                logger.exception("Unable to restore weather cache for %s", location["id"])
        return {"locations_restored": restored}

    def _restore_location_cache(self, location):
        key = location["id"]
        if key in self._cache:
            return False
        db: Session = SessionLocal()
        try:
            current = (db.query(WeatherObservation)
                       .filter_by(provider=PROVIDER, location_id=key, data_category="current_estimate")
                       .order_by(WeatherObservation.retrieved_at.desc(), WeatherObservation.observation_time.desc())
                       .first())
            if current is None:
                return False
            retrieved = self._row_retrieved_datetime(current)
            provider_current = self._row_provider_datetime(current, CHENNAI_TIMEZONE)
            forecasts = []
            now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
            forecast_end = now_utc + timedelta(hours=settings.WEATHER_FORECAST_HOURS)
            forecast_rows = (db.query(WeatherObservation)
                             .filter_by(provider=PROVIDER, location_id=key, data_category="forecast")
                             .filter(WeatherObservation.observation_time >= now_utc,
                                     WeatherObservation.observation_time <= forecast_end)
                             .order_by(WeatherObservation.observation_time.asc()).all())
            for row in forecast_rows:
                provider_time = self._row_provider_datetime(row, "UTC")
                forecasts.append(self._row_as_hour(row, provider_time))
            fetched_at = _iso_utc(retrieved)
            data = {"location": {"id": current.location_id, "name": current.location_name,
                                 "latitude": current.latitude, "longitude": current.longitude},
                    "latitude": current.latitude, "longitude": current.longitude,
                    "current": self._row_as_current(current, provider_current), "hourly": forecasts,
                    "fetched_at": fetched_at, "last_successful_fetch_at": fetched_at,
                    "data_source": PROVIDER, "data_type": "current_estimate", "status": "cached",
                    "timezone": CHENNAI_TIMEZONE, "forecast_hours_requested": settings.WEATHER_FORECAST_HOURS,
                    "forecast_hours_available": len(forecasts), "units": {"precipitation": "mm", "temperature_2m": "°C", "wind_speed_10m": "km/h"},
                    "cache_restored": True}
            self._cache[key] = data
            self._last_fetch[key] = retrieved.timestamp()
            return True
        except Exception as exc:
            logger.warning("Database weather-cache restore failed for %s: %s", key, exc)
            return False
        finally:
            db.close()

    @staticmethod
    def _row_retrieved_datetime(row):
        if row.retrieved_at_iso:
            return _provider_datetime(row.retrieved_at_iso, "UTC").astimezone(timezone.utc)
        return (row.retrieved_at.replace(tzinfo=timezone.utc) if row.retrieved_at.tzinfo is None
                else row.retrieved_at.astimezone(timezone.utc))

    @staticmethod
    def _row_provider_datetime(row, legacy_timezone):
        if row.provider_timestamp_iso:
            return _provider_datetime(row.provider_timestamp_iso, legacy_timezone)
        dt = row.observation_time
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=ZoneInfo(legacy_timezone))
        return dt

    @staticmethod
    def _row_as_current(row, timestamp):
        return {"timestamp": _display_iso(timestamp), "precipitation_mm": row.precipitation_mm,
                "rain_mm": row.rainfall_mm, "temperature_c": row.temperature_c,
                "humidity_percent": row.humidity_percent, "wind_speed_kmh": row.wind_speed_kmh}

    @staticmethod
    def _row_as_hour(row, timestamp):
        return {"timestamp": _display_iso(timestamp), "precipitation_mm": row.precipitation_mm,
                "rain_mm": row.rainfall_mm, "precipitation_probability": row.precipitation_probability,
                "temperature_c": row.temperature_c, "humidity_percent": row.humidity_percent,
                "wind_speed_kmh": row.wind_speed_kmh,
                "fetched_at": row.retrieved_at_iso or _iso_utc(SatelliteNwpService._row_retrieved_datetime(row))}

    def get_live_precipitation_and_soil(self, latitude=None, longitude=None, location_id=None):
        location = self._resolve_location(latitude, longitude, location_id)
        key = location["id"]
        with self._lock:
            lock = self._locks.setdefault(key, threading.Lock())
        with lock:
            if key not in self._cache:
                self._restore_location_cache(location)
            age = time.time() - self._last_fetch.get(key, 0)
            if key in self._cache and age < settings.WEATHER_CACHE_TTL_SECONDS:
                result = self._with_freshness(self._cache[key], age)
                result["status"] = "cached" if result.get("cache_restored") else "success"
                return result
            attempt_age = time.time() - self._last_attempt.get(key, 0)
            if key in self._last_attempt and attempt_age < max(60, settings.WEATHER_REFRESH_INTERVAL_SECONDS):
                if key in self._cache:
                    result = self._with_freshness(self._cache[key], age)
                    result["status"] = "stale"
                    result["error"] = self._last_error.get(key, "Weather provider refresh failed.")
                    result["failure_type"] = self._last_failure_type.get(key)
                    result["last_failed_refresh_at"] = self._last_failure_at.get(key)
                    return result
                return self._unavailable(location, self._last_error.get(key, "Weather provider refresh failed; retry is cooling down."),
                    self._last_failure_type.get(key), self._last_failure_at.get(key))
            self._last_attempt[key] = time.time()
            try:
                parsed = self._fetch(location)
                self._cache[key] = parsed
                self._last_fetch[key] = time.time()
                self._last_error.pop(key, None)
                self._last_failure_type.pop(key, None)
                self._last_failure_at.pop(key, None)
                self._persist(parsed)
                return self._with_freshness(parsed, 0)
            except Exception as exc:
                logger.warning("Open-Meteo refresh failed for %s: %s", key, exc)
                self._last_error[key] = str(exc)
                self._last_failure_type[key] = self._classify_error(exc)
                self._last_failure_at[key] = _iso_utc()
                if key in self._cache:
                    result = self._with_freshness(self._cache[key], time.time() - self._last_fetch[key])
                    result["status"] = "stale"
                    result["error"] = str(exc)
                    result["failure_type"] = self._last_failure_type[key]
                    result["last_failed_refresh_at"] = self._last_failure_at[key]
                    return result
                return self._unavailable(location, str(exc), self._last_failure_type[key], self._last_failure_at[key])

    @staticmethod
    def _classify_error(exc):
        message = str(exc).lower()
        if (isinstance(exc, socket.gaierror) or "name or service not known" in message
                or "could not resolve" in message or "nodename nor servname" in message or "gaierror" in message):
            return "dns"
        if isinstance(exc, httpx.TimeoutException) or "timed out" in message or "timeout" in message:
            return "timeout"
        if isinstance(exc, httpx.ConnectError) or "connecterror" in message or "connection refused" in message:
            return "network"
        if "429" in message or "too many requests" in message:
            return "rate_limit"
        if isinstance(exc, httpx.HTTPStatusError):
            if exc.response.status_code == 429:
                return "rate_limit"
            if exc.response.status_code >= 500:
                return "provider"
            return "api_error"
        return "invalid_response" if isinstance(exc, ValueError) else "provider"

    def _resolve_location(self, latitude=None, longitude=None, location_id=None):
        if latitude is None and longitude is None:
            if location_id:
                found = next((loc for loc in self.locations if loc["id"] == location_id), None)
                if found is None:
                    raise ValueError("Unknown configured monitoring location.")
                return dict(found)
            if not self.locations:
                return {"id": "unavailable", "name": "Chennai monitoring area", "latitude": settings.DEFAULT_LAT, "longitude": settings.DEFAULT_LON}
            return dict(self.locations[0])
        if latitude is None or longitude is None:
            raise ValueError("latitude and longitude must be supplied together")
        lat, lon = float(latitude), float(longitude)
        if not self._inside_study_area(lat, lon):
            raise ValueError("Requested coordinate is outside the FloodWatch project study-area grid.")
        known = next((loc for loc in self.locations if abs(loc["latitude"]-lat) < 1e-6 and abs(loc["longitude"]-lon) < 1e-6), None)
        return dict(known) if known else {"id": f"point:{lat:.6f},{lon:.6f}", "name": "Selected study-area point", "latitude": lat, "longitude": lon}

    def _fetch(self, location):
        params = {
            "latitude": location["latitude"], "longitude": location["longitude"],
            "current": "precipitation,rain,temperature_2m,relative_humidity_2m,wind_speed_10m",
            "hourly": "precipitation,rain,precipitation_probability,temperature_2m,relative_humidity_2m,wind_speed_10m",
            "forecast_hours": settings.WEATHER_FORECAST_HOURS, "timezone": "Asia/Kolkata",
        }
        attempts = max(0, settings.WEATHER_RETRY_COUNT) + 1
        last_error = None
        with httpx.Client(timeout=settings.WEATHER_HTTP_TIMEOUT_SECONDS, follow_redirects=True) as client:
            for attempt in range(attempts):
                try:
                    response = client.get(settings.WEATHER_API_URL, params=params)
                    if response.status_code == 429 or response.status_code >= 500:
                        response.raise_for_status()
                    response.raise_for_status()
                    payload = response.json()
                    return self._parse(payload, location)
                except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
                    last_error = exc
                    if attempt + 1 < attempts:
                        retry_after = None
                        if isinstance(exc, httpx.HTTPStatusError):
                            retry_after = exc.response.headers.get("Retry-After")
                        try:
                            delay = float(retry_after) if retry_after else settings.WEATHER_RETRY_BACKOFF_SECONDS * (2 ** attempt)
                        except ValueError:
                            delay = settings.WEATHER_RETRY_BACKOFF_SECONDS * (2 ** attempt)
                        time.sleep(min(delay, 10.0))
        raise RuntimeError(f"Open-Meteo request failed after {attempts} attempt(s): {last_error}")

    def _parse(self, payload, location):
        if not isinstance(payload, dict) or not isinstance(payload.get("current"), dict):
            raise ValueError("Provider response lacks a current weather object")
        current = payload["current"]
        hourly = payload.get("hourly")
        if not isinstance(hourly, dict) or not isinstance(hourly.get("time"), list):
            raise ValueError("Provider response lacks hourly timestamps")
        fetched_at = _iso_utc()
        current_time = current.get("time")
        if not isinstance(current_time, str):
            raise ValueError("Provider response lacks current timestamp")
        timezone_name = payload.get("timezone") or CHENNAI_TIMEZONE
        current_time_iso = _display_iso(_provider_datetime(current_time, timezone_name), timezone_name)
        values = []
        times = hourly["time"]
        for i, timestamp in enumerate(times):
            try:
                entry_time = datetime.fromisoformat(timestamp)
            except (TypeError, ValueError):
                continue
            if entry_time.tzinfo is None:
                entry_time = entry_time.replace(tzinfo=ZoneInfo(timezone_name))
            if entry_time <= datetime.now(entry_time.tzinfo):
                continue
            def at(name, lo=None, hi=None):
                seq = hourly.get(name)
                return _number({"x": seq[i]}, "x", lo, hi) if isinstance(seq, list) and i < len(seq) else None
            values.append({"timestamp": entry_time.isoformat(), "fetched_at": fetched_at,
                           "precipitation_mm": at("precipitation", 0),
                           "rain_mm": at("rain", 0), "precipitation_probability": at("precipitation_probability", 0, 100),
                           "temperature_c": at("temperature_2m", -100, 70), "humidity_percent": at("relative_humidity_2m", 0, 100),
                           "wind_speed_kmh": at("wind_speed_10m", 0)})
        current_entry = {"timestamp": current_time_iso, "precipitation_mm": _number(current, "precipitation", 0),
                         "rain_mm": _number(current, "rain", 0), "temperature_c": _number(current, "temperature_2m", -100, 70),
                         "humidity_percent": _number(current, "relative_humidity_2m", 0, 100),
                         "wind_speed_kmh": _number(current, "wind_speed_10m", 0)}
        return {"location": location, "latitude": location["latitude"], "longitude": location["longitude"],
                "current": current_entry, "hourly": values, "fetched_at": fetched_at, "data_source": PROVIDER,
                "data_type": "current_estimate", "status": "success", "timezone": timezone_name,
                "forecast_hours_available": len(values), "forecast_hours_requested": settings.WEATHER_FORECAST_HOURS,
                "provider_time": current_time_iso, "provider_time_raw": current_time, "units": payload.get("current_units", {}),
                "retrieved_at": fetched_at, "cache_restored": False}

    def _persist(self, data):
        db: Session = SessionLocal()
        try:
            rows = [(data["current"], "current_estimate")] + [(item, "forecast") for item in data["hourly"]]
            for item, category in rows:
                try:
                    provider_dt = _provider_datetime(item["timestamp"], data.get("timezone", CHENNAI_TIMEZONE))
                    obs_time = _as_utc_naive(provider_dt)
                    existing = db.query(WeatherObservation).filter_by(provider=PROVIDER,
                        location_id=data["location"]["id"], data_category=category, observation_time=obs_time).first()
                    retrieved_dt = _provider_datetime(data["fetched_at"], "UTC")
                    row = existing or WeatherObservation(provider=PROVIDER, location_id=data["location"]["id"],
                        location_name=data["location"]["name"], latitude=data["latitude"], longitude=data["longitude"],
                        observation_time=obs_time, data_category=category)
                    row.location_name = data["location"]["name"]
                    row.latitude, row.longitude = data["latitude"], data["longitude"]
                    row.rainfall_mm = item.get("rain_mm")
                    row.precipitation_mm = item.get("precipitation_mm")
                    row.precipitation_probability = item.get("precipitation_probability")
                    row.temperature_c = item.get("temperature_c")
                    row.humidity_percent = item.get("humidity_percent")
                    row.wind_speed_kmh = item.get("wind_speed_kmh")
                    row.observation_time = obs_time
                    row.retrieved_at = _as_utc_naive(retrieved_dt)
                    row.provider_timestamp_iso = provider_dt.isoformat()
                    row.retrieved_at_iso = _iso_utc(retrieved_dt)
                    db.add(row)
                except (TypeError, ValueError):
                    logger.warning("Skipping malformed weather observation %r", item)
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Could not persist Open-Meteo readings")
        finally:
            db.close()

    def _with_freshness(self, data, age):
        result = dict(data)
        result["is_stale"] = age > settings.WEATHER_REFRESH_INTERVAL_SECONDS
        result["cache_age_seconds"] = int(age)
        forecast_ages = []
        for item in result.get("hourly", []):
            try:
                retrieved = _provider_datetime(item["fetched_at"], "UTC").astimezone(timezone.utc)
                forecast_ages.append(max(0, time.time() - retrieved.timestamp()))
            except (KeyError, TypeError, ValueError):
                continue
        forecast_age = max(forecast_ages, default=None)
        result["forecast_cache_age_seconds"] = int(forecast_age) if forecast_age is not None else None
        result["forecast_is_stale"] = forecast_age is not None and forecast_age > settings.WEATHER_REFRESH_INTERVAL_SECONDS
        result["last_successful_fetch_at"] = data.get("fetched_at")
        result["cached_data_available"] = True
        result["freshness"] = "stale" if result["is_stale"] else ("cached" if data.get("cache_restored") else "fresh")
        result.setdefault("last_failed_refresh_at", None)
        result.setdefault("failure_type", None)
        result.setdefault("error", None)
        return result

    def _unavailable(self, location, error, failure_type=None, last_failed_refresh_at=None):
        return {"location": location, "latitude": location["latitude"], "longitude": location["longitude"],
                "current": {"timestamp": None, "rain_mm": None, "precipitation_mm": None, "temperature_c": None,
                            "humidity_percent": None, "wind_speed_kmh": None}, "hourly": [], "fetched_at": None,
                "last_successful_fetch_at": None, "data_source": PROVIDER, "data_type": "current_estimate",
                "status": "unavailable", "freshness": "unavailable", "cached_data_available": False,
                "is_stale": False, "forecast_is_stale": False, "forecast_cache_age_seconds": None,
                "error": error, "failure_type": failure_type,
                "last_failed_refresh_at": last_failed_refresh_at,
                "forecast_hours_requested": settings.WEATHER_FORECAST_HOURS, "forecast_hours_available": 0}

    def get_status(self, location_id=None):
        data = self.get_live_precipitation_and_soil(location_id=location_id)
        return {"status": data["status"], "data_source": data["data_source"], "location": data["location"],
                "last_successful_fetch_at": data.get("last_successful_fetch_at"), "is_stale": data.get("is_stale", False),
                "freshness": data.get("freshness"), "cached_data_available": data.get("cached_data_available", False),
                "forecast_is_stale": data.get("forecast_is_stale", False),
                "forecast_cache_age_seconds": data.get("forecast_cache_age_seconds"),
                "last_failed_refresh_at": data.get("last_failed_refresh_at"), "failure_type": data.get("failure_type"),
                "forecast_hours_requested": data["forecast_hours_requested"], "forecast_hours_available": data["forecast_hours_available"],
                "error": data.get("error")}

    def get_history(self, location_id=None, limit=168, category=None):
        loc = self._resolve_location(location_id=location_id)
        if category == "historical":
            path = settings.WEATHER_HISTORICAL_RAINFALL_CSV
            if not os.path.isabs(path):
                root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
                path = os.path.join(root, path)
            data = []
            with open(path, newline="", encoding="utf-8-sig") as source:
                for row in csv.DictReader(source):
                    try:
                        data.append({"rainfall_mm": float(row["Rainfall"]), "timestamp": row["Date"],
                                     "station": row["Station"], "district": row["District"],
                                     "data_type": "historical", "data_source": "FloodWatch archived rainfall CSV"})
                    except (KeyError, TypeError, ValueError):
                        continue
            return {"location": loc, "data_source": "FloodWatch archived rainfall CSV", "data_type": "historical",
                    "data": data[-min(max(limit, 1), 744):]}
        db = SessionLocal()
        try:
            query = db.query(WeatherObservation).filter(WeatherObservation.location_id == loc["id"])
            if category:
                query = query.filter(WeatherObservation.data_category == category)
            rows = query.order_by(WeatherObservation.observation_time.desc()).limit(min(max(limit, 1), 744)).all()
            return {"location": loc, "data_source": PROVIDER, "data": [
                {"rain_mm": r.rainfall_mm, "precipitation_mm": r.precipitation_mm,
                 "precipitation_probability": r.precipitation_probability, "temperature_c": r.temperature_c,
                 "humidity_percent": r.humidity_percent, "wind_speed_kmh": r.wind_speed_kmh,
                 "timestamp": r.provider_timestamp_iso or self._legacy_provider_iso(r),
                 "fetched_at": r.retrieved_at_iso or _iso_utc(self._row_retrieved_datetime(r)),
                 "data_type": r.data_category} for r in reversed(rows)]}
        finally:
            db.close()

    @staticmethod
    def _legacy_provider_iso(row):
        # Earlier SQLite writes stripped zones: current timestamps were local
        # Chennai time, while forecast instants had already been converted to UTC.
        zone = CHENNAI_TIMEZONE if row.data_category == "current_estimate" else "UTC"
        return _display_iso(SatelliteNwpService._row_provider_datetime(row, zone))
