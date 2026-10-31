from backend.app.services.satellite_nwp_service import SatelliteNwpService
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.app.db.base import Base
import backend.app.services.satellite_nwp_service as weather_module
from backend.app.services.rainfall_service import RainfallService
from backend.app.db.models.weather_observation import WeatherObservation
from backend.app.api.routes import rainfall as rainfall_routes


def sample_provider_response():
    local_now = datetime.now(ZoneInfo("Asia/Kolkata"))
    current_time = local_now.replace(minute=0, second=0, microsecond=0)
    next_hour = current_time + timedelta(hours=1)
    return {
        "timezone": "Asia/Kolkata",
        "current": {
            "time": current_time.strftime("%Y-%m-%dT%H:%M"),
            "precipitation": 0.0,
            "rain": 0.0,
            "temperature_2m": 29.0,
            "relative_humidity_2m": 74,
            "wind_speed_10m": 11.5,
        },
        "current_units": {"precipitation": "mm", "temperature_2m": "°C", "wind_speed_10m": "km/h"},
        "hourly": {
            "time": [next_hour.isoformat(timespec="minutes"), (next_hour + timedelta(hours=1)).isoformat(timespec="minutes")],
            "precipitation": [0.6, 0.0],
            "rain": [0.6, 0.0],
            "precipitation_probability": [40, 5],
            "temperature_2m": [28.0, 27.5],
            "relative_humidity_2m": [80, 84],
            "wind_speed_10m": [12.0, 10.0],
        },
    }


def test_project_reference_point_is_inside_actual_grid_and_outside_point_is_rejected():
    service = SatelliteNwpService()
    assert service._inside_study_area(13.0827, 80.2707)
    assert not service._inside_study_area(13.5, 80.5)
    assert service.get_study_area()["crs"] == "urn:ogc:def:crs:OGC:1.3:CRS84"


def test_provider_payload_is_parsed_as_estimate_and_forecast():
    service = SatelliteNwpService()
    location = service.get_locations()[0]
    parsed = service._parse(sample_provider_response(), location)
    assert parsed["data_type"] == "current_estimate"
    assert parsed["current"]["precipitation_mm"] == 0.0
    assert parsed["current"]["timestamp"].endswith("+05:30")
    assert parsed["hourly"][0]["precipitation_mm"] == 0.6
    assert parsed["hourly"][0]["precipitation_probability"] == 40
    assert parsed["data_source"] == "Open-Meteo"


def test_invalid_payload_does_not_get_parsed_as_zero():
    service = SatelliteNwpService()
    location = service.get_locations()[0]
    try:
        service._parse({"hourly": {"time": []}}, location)
        assert False, "response without a current object should be rejected"
    except ValueError:
        pass


def test_fetch_failure_returns_unavailable_nulls_and_not_fabricated_rainfall(monkeypatch):
    service = SatelliteNwpService()
    monkeypatch.setattr(service, "_fetch", lambda location: (_ for _ in ()).throw(RuntimeError("offline")))
    result = service.get_live_precipitation_and_soil()
    assert result["status"] == "unavailable"
    assert result["current"]["precipitation_mm"] is None
    assert result["hourly"] == []
    assert result["fetched_at"] is None


def test_missing_rainfall_stays_null_and_valid_zero_stays_zero():
    service = SatelliteNwpService()
    location = service.get_locations()[0]
    payload = sample_provider_response()
    assert service._parse(payload, location)["current"]["precipitation_mm"] == 0.0
    payload["current"].pop("precipitation")
    payload["current"].pop("rain")
    assert service._parse(payload, location)["current"]["precipitation_mm"] is None
    assert service._parse(payload, location)["current"]["rain_mm"] is None


def test_database_restart_restores_cached_current_and_hourly_with_original_times(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(weather_module, "SessionLocal", factory)
    service = SatelliteNwpService()
    location = service.get_locations()[0]
    parsed = service._parse(sample_provider_response(), location)
    service._persist(parsed)

    restarted_service = SatelliteNwpService()
    assert restarted_service.restore_cache_from_database() == {"locations_restored": 1}
    restored = restarted_service.get_live_precipitation_and_soil(location_id=location["id"])
    assert restored["status"] == "cached"
    assert restored["cache_restored"] is True
    assert restored["current"]["precipitation_mm"] == 0.0
    assert restored["current"]["timestamp"] == parsed["current"]["timestamp"]
    assert restored["fetched_at"] == parsed["fetched_at"]
    assert len(restored["hourly"]) == len(parsed["hourly"])


def test_cache_stale_on_outage_and_recovers_on_success(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(weather_module, "SessionLocal", factory)
    monkeypatch.setattr(weather_module.settings, "WEATHER_CACHE_TTL_SECONDS", 1)
    monkeypatch.setattr(weather_module.settings, "WEATHER_REFRESH_INTERVAL_SECONDS", 60)
    service = SatelliteNwpService()
    location = service.get_locations()[0]
    original = service._parse(sample_provider_response(), location)
    service._persist(original)
    service.restore_cache_from_database()
    key = location["id"]
    service._last_fetch[key] -= 2
    monkeypatch.setattr(service, "_fetch", lambda _loc: (_ for _ in ()).throw(RuntimeError("offline")))

    stale = service.get_live_precipitation_and_soil(location_id=key)
    assert stale["status"] == "stale"
    assert stale["current"]["precipitation_mm"] == 0.0
    assert stale["last_failed_refresh_at"]
    assert stale["cached_data_available"] is True

    service._last_attempt[key] -= 61
    recovered_payload = sample_provider_response()
    recovered_payload["current"]["precipitation"] = 2.4
    recovered_payload["current"]["rain"] = 2.1
    monkeypatch.setattr(service, "_fetch", lambda _loc: service._parse(recovered_payload, location))
    recovered = service.get_live_precipitation_and_soil(location_id=key)
    assert recovered["status"] == "success"
    assert recovered["current"]["precipitation_mm"] == 2.4
    assert recovered["last_failed_refresh_at"] is None


def test_forced_refresh_bypasses_fresh_cache_and_persists_current_and_forecast(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(weather_module, "SessionLocal", factory)
    service = SatelliteNwpService()
    location = service.get_locations()[0]
    key = location["id"]

    old_payload = sample_provider_response()
    old_payload["current"]["temperature_2m"] = 28.8
    old = service._parse(old_payload, location)
    assert service._persist(old) is True
    service._cache[key] = old
    service._last_fetch[key] = datetime.now().timestamp()
    service._last_attempt[key] = datetime.now().timestamp()

    fresh_payload = sample_provider_response()
    fresh_payload["current"]["temperature_2m"] = 29.3
    fresh_payload["hourly"]["precipitation"] = [1.2, 0.4]
    fresh_payload["hourly"]["rain"] = [1.2, 0.4]
    calls = []

    def provider_get(_location):
        calls.append(_location["id"])
        return service._parse(fresh_payload, location)

    monkeypatch.setattr(service, "_fetch", provider_get)
    result = service.get_live_precipitation_and_soil(location_id=key, force_refresh=True)

    assert calls == [key]
    assert result["status"] == "success"
    assert result["current"]["temperature_c"] == 29.3
    assert result["database_persisted"] is True
    db = factory()
    try:
        current = db.query(WeatherObservation).filter_by(location_id=key, data_category="current_estimate").one()
        forecast = db.query(WeatherObservation).filter_by(location_id=key, data_category="forecast").order_by(
            WeatherObservation.observation_time.asc()).first()
        assert current.temperature_c == 29.3
        assert forecast.precipitation_mm == 1.2
        assert current.retrieved_at_iso == result["fetched_at"]
        assert forecast.retrieved_at_iso == result["fetched_at"]
    finally:
        db.close()


def test_manual_refresh_endpoint_requests_forced_provider_refresh(monkeypatch):
    captured = {}

    class FakeWeather:
        def get_live_precipitation_and_soil(self, latitude, longitude, location_id, force_refresh=False):
            captured.update(latitude=latitude, longitude=longitude, location_id=location_id,
                            force_refresh=force_refresh)
            return {"status": "success", "data_source": "Open-Meteo"}

    monkeypatch.setattr(SatelliteNwpService, "get_instance", classmethod(lambda cls: FakeWeather()))
    response = rainfall_routes.refresh(location_id="chennai-reference")
    assert captured == {"latitude": None, "longitude": None, "location_id": "chennai-reference", "force_refresh": True}
    assert response["status"] == "success"


def test_dns_failure_is_classified_without_fabricating_reading(monkeypatch):
    service = SatelliteNwpService()
    monkeypatch.setattr(service, "_fetch", lambda _loc: (_ for _ in ()).throw(
        RuntimeError("Open-Meteo request failed: [Errno 8] nodename nor servname provided")))
    result = service.get_live_precipitation_and_soil()
    assert result["status"] == "unavailable"
    assert result["failure_type"] == "dns"
    assert result["current"]["precipitation_mm"] is None


def test_current_compatibility_response_exposes_failure_state_and_null_rainfall():
    class FailedWeather:
        def get_live_precipitation_and_soil(self, *args, **kwargs):
            return SatelliteNwpService()._unavailable(
                {"id": "chennai-reference", "name": "Chennai", "latitude": 13.0827, "longitude": 80.2707},
                "DNS lookup failed", "dns", "2026-10-31T00:00:00Z")

    service = RainfallService()
    service.weather = FailedWeather()
    result = service.get_current_rainfall()
    assert result["status"] == "unavailable"
    assert result["failure_type"] == "dns"
    assert result["precipitation_mm"] is None
    assert result["last_failed_refresh_at"] == "2026-10-31T00:00:00Z"
