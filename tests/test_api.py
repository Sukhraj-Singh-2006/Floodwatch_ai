import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.vehicle_routing import route_geometry_distance_km

client = TestClient(app)

def test_root():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "FloodWatch AI" in data["project"]
    assert "Chennai" in data["study_area"]

def test_health():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_kpis():
    response = client.get("/api/v1/current-risk/kpis")
    assert response.status_code == 200
    data = response.json()
    assert "currentRainfall" in data
    assert "highRiskZones" in data
    assert data["isSimulated"] is False

def test_forecast_risk():
    response = client.get("/api/v1/forecast-risk?horizon=NOW")
    assert response.status_code == 200
    zones = response.json()
    assert len(zones) > 1000
    assert zones[0]["isSimulated"] is False
    assert "riskScore" in zones[0]

def test_safe_route():
    observed_distances = set()
    for vehicle in ("car", "SUV", "truck", "rescue"):
        response = client.post("/api/v1/safe-route", json={
            "source": "Chennai Central", "destination": "Chennai Airport", "vehicle_type": vehicle
        })
        assert response.status_code == 200
        data = response.json()
        assert data["vehicle_type"] == vehicle.lower()
        assert data["recommendedRoute"]["safetyScore"] > data["alternativeRoute"]["safetyScore"]
        assert len(data["recommendedRoute"]["pathCoordinates"]) > 2
        assert len(data["hazards"]) >= 1
        assert data["isSimulated"] is True  # Candidate geometry is not backed by a connected road-edge graph.
        assert data["road_network_available"] is False
        assert data["recommendedRoute"]["distanceKm"] == round(
            route_geometry_distance_km(data["recommendedRoute"]["pathCoordinates"]), 2
        )
        assert data["alternativeRoute"]["distanceKm"] == round(
            route_geometry_distance_km(data["alternativeRoute"]["pathCoordinates"]), 2
        )
        assert data["vehicle_restrictions_available"] is False
        observed_distances.add(data["recommendedRoute"]["distanceKm"])
    # Identical paths are expected because the shipped road data has no restrictions to distinguish vehicles.
    assert len(observed_distances) == 1


def test_frontend_alert_and_privacy_paths_are_mounted():
    for path in (
        "/api/v1/alerts/my-alerts",
        "/api/v1/location/saved",
        "/api/v1/location/emergency-contacts",
    ):
        response = client.get(path)
        # Mounted protected endpoints reject missing authentication; they must not 404.
        assert response.status_code in (401, 403), (path, response.status_code, response.text)

def test_alerts():
    response = client.get("/api/v1/alerts")
    assert response.status_code == 200
    alerts = response.json()
    assert len(alerts) >= 4
    # Test acknowledge
    alt_id = alerts[0]["id"]
    ack_res = client.patch(f"/api/v1/alerts/{alt_id}/acknowledge")
    assert ack_res.status_code == 200
    assert ack_res.json()["acknowledged"] is True

def test_analytics():
    response = client.get("/api/v1/analytics/summary")
    assert response.status_code == 200
    data = response.json()
    assert len(data["areaRankings"]) > 0
    assert len(data["rainfallTrends"]) > 0

def test_system_overview():
    response = client.get("/api/v1/health/system-overview")
    assert response.status_code == 200
    data = response.json()
    assert "XGBoost" in data["modelMetrics"]["algorithm"]
    assert data["modelMetrics"]["prototypeAccuracy"] > 0.80
