"""Shared vehicle normalization and road-attribute checks for safe routing.

Road restrictions are applied only when a road record contains explicit access
metadata. Missing metadata never grants special emergency access or SUV flood
tolerance.
"""

from __future__ import annotations

import math
import heapq
import itertools
from typing import Any, Iterable

VEHICLE_TYPES = {"car", "suv", "truck", "rescue"}
_EARTH_RADIUS_KM = 6371.0088


def normalize_vehicle_type(value: str | None) -> str:
    normalized = "car" if value is None else value.strip().lower().replace(" ", "_")
    aliases = {
        "sedan": "car", "hatch": "car", "hatchback": "car",
        "high_clearance_suv": "suv", "heavy_commercial_truck": "truck",
        "emergency": "rescue", "emergency_rescue": "rescue",
        "emergency_rescue_vehicle": "rescue",
    }
    normalized = aliases.get(normalized, normalized)
    if normalized not in VEHICLE_TYPES:
        raise ValueError(f"Unsupported vehicle_type '{value}'. Choose car, suv, truck, or rescue.")
    return normalized


def route_geometry_distance_km(coordinates: Iterable[Iterable[float]]) -> float:
    """Sum great-circle segment lengths for a Leaflet [lat, lon] polyline."""
    points = [tuple(point) for point in coordinates]
    if len(points) < 2:
        return 0.0
    total = 0.0
    for first, second in zip(points, points[1:]):
        lat1, lon1 = map(math.radians, first[:2])
        lat2, lon2 = map(math.radians, second[:2])
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        total += 2 * _EARTH_RADIUS_KM * math.asin(math.sqrt(min(1.0, a)))
    return total


def road_exclusion_reason(
    road: dict[str, Any], vehicle_type: str, vehicle_dimensions: dict[str, float] | None = None
) -> str | None:
    """Return a restriction reason only when explicit road metadata supports it."""
    vehicle = normalize_vehicle_type(vehicle_type)
    explicit = road.get("vehicle_restrictions") or road.get("vehicleRestrictions") or []
    if isinstance(explicit, str):
        explicit = [explicit]
    if vehicle in {str(item).strip().lower() for item in explicit}:
        return f"explicit {vehicle} restriction"

    vehicle_access = road.get("vehicle_access") or road.get("vehicleAccess") or []
    if isinstance(vehicle_access, str):
        vehicle_access = [vehicle_access]
    allowed = {str(item).strip().lower() for item in vehicle_access}

    access = str(road.get("access", "")).strip().lower()
    if access in {"no", "private"} and vehicle not in allowed:
        return f"road access is {access}; no explicit {vehicle} exemption"

    if vehicle == "truck" and str(road.get("hgv", road.get("access:hgv", ""))).strip().lower() in {"no", "private"}:
        return "heavy goods vehicle access is restricted"

    if vehicle == "rescue" and str(road.get("emergency", road.get("access:emergency", ""))).strip().lower() in {"no", "private"}:
        return "emergency vehicle access is explicitly restricted"

    if vehicle in {"car", "suv", "truck"} and str(road.get("motor_vehicle", "")).strip().lower() in {"no", "private"}:
        return "motor vehicle access is restricted"

    dimensions = vehicle_dimensions or {}
    for road_key, vehicle_key, label in (
        ("maxheight", "height_m", "height"),
        ("maxweight", "weight_t", "weight"),
        ("maxwidth", "width_m", "width"),
    ):
        limit = _numeric_road_limit(road.get(road_key))
        actual = dimensions.get(vehicle_key)
        if limit is not None and isinstance(actual, (int, float)) and actual > limit:
            return f"vehicle {label} {actual:g} exceeds road limit {limit:g}"

    return None


def _numeric_road_limit(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            # Road limit fields must be normalized to m, t, and m in source data.
            return float(value.strip().split()[0])
        except (ValueError, IndexError):
            return None
    return None


def vehicle_restriction_metadata_available(roads: Iterable[dict[str, Any]]) -> bool:
    restriction_keys = {
        "vehicle_restrictions", "vehicleRestrictions", "vehicle_access", "vehicleAccess",
        "access", "hgv", "access:hgv", "emergency", "access:emergency", "motor_vehicle",
        "maxheight", "maxweight", "maxwidth",
    }
    return any(any(key in road for key in restriction_keys) for road in roads)


def shortest_vehicle_path(
    roads: Iterable[dict[str, Any]], source: str, destination: str, vehicle_type: str,
    vehicle_dimensions: dict[str, dict[str, float]] | None = None,
) -> dict[str, Any]:
    """Dijkstra over connected road-edge records, excluding explicit restrictions.

    Edge records require ``from``, ``to``, and ``length_km``. This is ready for
    a real connected road dataset; the current Chennai road records are display
    polylines without graph endpoints, so they cannot be routed as a network.
    """
    vehicle = normalize_vehicle_type(vehicle_type)
    adjacency: dict[str, list[tuple[str, float, dict[str, Any]]]] = {}
    excluded: list[dict[str, str]] = []
    for road in roads:
        dimensions = vehicle_dimensions or {}
        reason = road_exclusion_reason(road, vehicle, dimensions.get(vehicle, {}))
        if reason:
            excluded.append({"id": str(road.get("id", "")), "name": str(road.get("name", "")), "reason": reason})
            continue
        start, end = road.get("from"), road.get("to")
        length = road.get("length_km")
        if not isinstance(start, str) or not isinstance(end, str) or not isinstance(length, (int, float)) or length <= 0:
            continue
        adjacency.setdefault(start, []).append((end, float(length), road))
        if not road.get("oneway"):
            adjacency.setdefault(end, []).append((start, float(length), road))

    sequence = itertools.count()
    queue: list[tuple[float, int, str, list[str], list[dict[str, Any]]]] = [(0.0, next(sequence), source, [source], [])]
    best: dict[str, float] = {source: 0.0}
    while queue:
        distance, _, node, path, path_roads = heapq.heappop(queue)
        if node == destination:
            return {"nodes": path, "roads": path_roads, "distance_km": distance, "excluded_roads": excluded}
        if distance > best.get(node, float("inf")):
            continue
        for neighbor, edge_length, road in adjacency.get(node, []):
            next_distance = distance + edge_length
            if next_distance < best.get(neighbor, float("inf")):
                best[neighbor] = next_distance
                heapq.heappush(queue, (next_distance, next(sequence), neighbor, path + [neighbor], path_roads + [road]))
    return {"nodes": [], "roads": [], "distance_km": None, "excluded_roads": excluded}
