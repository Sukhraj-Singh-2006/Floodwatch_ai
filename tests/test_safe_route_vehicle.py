import math

import pytest

from backend.app.api.routes import routing as routing_route
from backend.app.core.config import settings
from backend.app.schemas.route import RouteRequestSchema
from backend.app.services.flood_service import FloodService
from backend.app.services.vehicle_routing import (
    normalize_vehicle_type,
    route_geometry_distance_km,
    shortest_vehicle_path,
)


@pytest.mark.parametrize("vehicle", ["car", "SUV", "truck", "rescue"])
def test_route_request_vehicle_reaches_backend(vehicle, monkeypatch):
    received = {}

    class FakeFloodService:
        def calculate_safe_route(self, source, destination, vehicle_type):
            received.update(source=source, destination=destination, vehicle_type=vehicle_type)
            return {"source": source, "destination": destination}

    monkeypatch.setattr(routing_route.FloodService, "get_instance", classmethod(lambda cls: FakeFloodService()))
    payload = RouteRequestSchema(source="Chennai Central", destination="Chennai Airport", vehicle_type=vehicle)
    routing_route.calculate_safe_route(payload)
    assert received["vehicle_type"] == vehicle.lower()


def test_route_distances_come_from_returned_geometry_for_each_vehicle():
    service = FloodService.__new__(FloodService)
    observed = {}
    for vehicle in ("car", "SUV", "truck", "rescue"):
        plan = service.calculate_safe_route("Chennai Central", "Chennai Airport", vehicle)
        observed[vehicle] = plan
        assert plan["vehicle_type"] == vehicle.lower()
        assert plan["recommendedRoute"]["distanceKm"] == round(
            route_geometry_distance_km(plan["recommendedRoute"]["pathCoordinates"]), 2
        )
        assert plan["alternativeRoute"]["distanceKm"] == round(
            route_geometry_distance_km(plan["alternativeRoute"]["pathCoordinates"]), 2
        )
        speed = plan["speed_assumption_kmh"]
        assert plan["recommendedRoute"]["etaMinutes"] == max(
            1, math.ceil(plan["recommendedRoute"]["distanceKm"] / speed * 60)
        )
        assert plan["isSimulated"] is True
        assert plan["vehicle_restrictions_available"] is False

    # With no vehicle restriction data, sharing a route/distance is legitimate.
    assert len({plan["recommendedRoute"]["distanceKm"] for plan in observed.values()}) == 1
    assert len({plan["alternativeRoute"]["distanceKm"] for plan in observed.values()}) == 1
    assert observed["car"]["speed_assumption_kmh"] == settings.SAFE_ROUTE_SPEED_CAR_KMH
    assert observed["truck"]["speed_assumption_kmh"] == settings.SAFE_ROUTE_SPEED_TRUCK_KMH


def test_vehicle_restrictions_change_shortest_path_when_explicit_edge_tags_exist():
    roads = [
        {"id": "truck-restricted-shortcut", "from": "A", "to": "B", "length_km": 2.0, "hgv": "no"},
        {"id": "arterial-1", "from": "A", "to": "C", "length_km": 2.0},
        {"id": "arterial-2", "from": "C", "to": "B", "length_km": 2.0},
    ]
    car_path = shortest_vehicle_path(roads, "A", "B", "car")
    truck_path = shortest_vehicle_path(roads, "A", "B", "truck")

    assert car_path["nodes"] == ["A", "B"]
    assert truck_path["nodes"] == ["A", "C", "B"]
    assert car_path["distance_km"] == 2.0
    assert truck_path["distance_km"] == 4.0
    assert truck_path["excluded_roads"][0]["id"] == "truck-restricted-shortcut"


def test_rescue_does_not_bypass_private_access_without_explicit_permission():
    roads = [
        {"id": "private-road", "from": "A", "to": "B", "length_km": 1.0, "access": "no"},
        {"id": "public-1", "from": "A", "to": "C", "length_km": 2.0},
        {"id": "public-2", "from": "C", "to": "B", "length_km": 2.0},
    ]
    route = shortest_vehicle_path(roads, "A", "B", "rescue")
    assert route["nodes"] == ["A", "C", "B"]
    assert route["excluded_roads"][0]["reason"] == "road access is no; no explicit rescue exemption"

    roads[0]["vehicle_access"] = ["rescue"]
    permitted = shortest_vehicle_path(roads, "A", "B", "rescue")
    assert permitted["nodes"] == ["A", "B"]


def test_explicit_road_clearance_is_checked_only_with_operator_vehicle_dimensions():
    roads = [
        {"id": "low-bridge", "from": "A", "to": "B", "length_km": 1.0, "maxheight": "3.5 m"},
        {"id": "detour-1", "from": "A", "to": "C", "length_km": 2.0},
        {"id": "detour-2", "from": "C", "to": "B", "length_km": 2.0},
    ]
    no_vehicle_dimensions = shortest_vehicle_path(roads, "A", "B", "truck")
    configured_truck = shortest_vehicle_path(
        roads, "A", "B", "truck", {"truck": {"height_m": 3.8}}
    )
    assert no_vehicle_dimensions["nodes"] == ["A", "B"]  # Missing vehicle profile means no assumption.
    assert configured_truck["nodes"] == ["A", "C", "B"]
    assert "height" in configured_truck["excluded_roads"][0]["reason"]


@pytest.mark.parametrize("invalid", ["bus", "", "ambulance unknown"])
def test_vehicle_type_rejects_unsupported_values(invalid):
    with pytest.raises(ValueError):
        normalize_vehicle_type(invalid)
