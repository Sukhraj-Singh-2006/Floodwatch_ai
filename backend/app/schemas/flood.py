from typing import List, Tuple, Optional
from pydantic import BaseModel, Field

class FloodZoneSchema(BaseModel):
    gridId: str
    name: str
    latitude: float
    longitude: float
    bounds: List[List[float]] # [[minLat, minLon], [maxLat, maxLon]]
    riskLevel: str # 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    riskScore: int # 0 - 100
    predictionTime: str # 'NOW' | '+30M' | '+1H' | '+2H' | '+3H'
    rainfall: float # mm
    elevation: float # meters
    waterDepth: Optional[float] = None # continuous meters; null if unmeasured
    runoffCoefficient: float
    slope: str
    summary: str
    historicalFlooding: str
    drainageStatus: str
    builtUpDensity: int
    isSimulated: bool = False
    probability: Optional[float] = None
    provenanceStatus: Optional[str] = "MODEL_PREDICTED"

class SystemKPIsSchema(BaseModel):
    currentRainfall: Optional[float] = None
    rainfallDelta: str
    highRiskZones: int
    highRiskDelta: str
    unsafeRoads: int
    unsafeRoadsStatus: str
    activeAlerts: int
    highPriorityAlerts: int
    lastUpdated: str
    isSimulated: bool = False

class RecentPredictionSchema(BaseModel):
    location: str
    currentRisk: str
    plus1HourRisk: str
    plus3HoursRisk: str
    confidence: int
    isSimulated: bool = False

class RoadSegmentSchema(BaseModel):
    id: str
    name: str
    status: str # 'SAFE' | 'CAUTION' | 'UNSAFE' | 'BLOCKED'
    riskScore: int
    waterDepthCm: int
    coordinates: List[List[float]]
    avoidedBySafeRoute: bool
    locality: str
