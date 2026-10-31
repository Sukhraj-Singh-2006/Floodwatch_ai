from typing import List, Optional
from pydantic import BaseModel, Field, field_validator

class RouteRequestSchema(BaseModel):
    source: Optional[str] = None
    origin: Optional[str] = None
    destination: str
    mode: Optional[str] = "vehicle"
    vehicle_type: Optional[str] = "car" # 'car' | 'SUV' | 'truck' | 'rescue'

    @field_validator("vehicle_type", mode="before")
    @classmethod
    def normalize_vehicle(cls, value):
        normalized = "car" if value is None else value.strip().lower().replace(" ", "_")
        aliases = {
            "sedan": "car", "hatch": "car", "hatchback": "car",
            "high_clearance_suv": "suv", "heavy_commercial_truck": "truck",
            "emergency": "rescue", "emergency_rescue": "rescue",
            "emergency_rescue_vehicle": "rescue",
        }
        normalized = aliases.get(normalized, normalized)
        if normalized not in {"car", "suv", "truck", "rescue"}:
            raise ValueError("vehicle_type must be car, suv, truck, or rescue")
        return normalized

class RouteOptionSchema(BaseModel):
    id: str
    name: str
    type: str # 'RECOMMENDED_SAFE' | 'HIGHER_RISK_ALTERNATIVE'
    distanceKm: float
    etaMinutes: int
    safetyScore: int
    riskStatus: str # 'SAFE' | 'CAUTION' | 'UNSAFE'
    floodPointsAvoided: int
    hazardExposure: str # 'Low' | 'Medium' | 'High'
    pathCoordinates: List[List[float]]
    notes: str
    isSimulated: bool = False

class RouteHazardSchema(BaseModel):
    id: str
    title: str
    location: str
    coordinates: List[float] # [lat, lon]
    severity: str # 'CAUTION' | 'UNSAFE'
    waterDepthCm: int
    status: str
    isSimulated: bool = False

class RoutePlanResultSchema(BaseModel):
    source: str
    destination: str
    vehicle_type: str = "car"
    road_network_available: bool = False
    vehicle_restrictions_available: bool = False
    roads_excluded_due_to_vehicle: List[dict] = Field(default_factory=list)
    speed_assumption_kmh: Optional[float] = None
    sourceCoords: List[float]
    destCoords: List[float]
    recommendedRoute: RouteOptionSchema
    alternativeRoute: RouteOptionSchema
    hazards: List[RouteHazardSchema]
    isSimulated: bool = False

class PresetRouteSchema(BaseModel):
    id: str
    label: str
    source: str
    destination: str
    description: str
