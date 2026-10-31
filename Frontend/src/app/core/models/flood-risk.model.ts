export type RiskLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type PredictionTime = 'NOW' | '+30M' | '+1H' | '+2H' | '+3H';

export interface FloodZone {
  gridId: string;
  name: string;
  latitude: number;
  longitude: number;
  bounds: [[number, number], [number, number]]; // Leaflet LatLngBoundsExpression
  riskLevel: RiskLevel;
  riskScore: number; // 0 - 100
  predictionTime: PredictionTime;
  rainfall: number; // mm/hr (simulated)
  elevation: number; // meters (prototype)
  waterDepth: number; // meters (simulated)
  runoffCoefficient: number; // 0.0 - 1.0
  slope: 'Low' | 'Moderate' | 'Steep';
  summary: string;
  historicalFlooding: 'Low' | 'Moderate' | 'High' | 'Severe';
  drainageStatus: 'Operational' | 'Moderate' | 'Choked' | 'Critical';
  builtUpDensity: number; // percentage e.g. 82%
  isSimulated: boolean;
}

export interface RoadSegment {
  id: string;
  name: string;
  status: 'SAFE' | 'CAUTION' | 'UNSAFE' | 'BLOCKED';
  riskScore: number;
  waterDepthCm: number;
  coordinates: [number, number][];
  avoidedBySafeRoute: boolean;
  locality: string;
}

export interface SystemKPIs {
  currentRainfall: number | null;
  rainfallDelta: string;
  highRiskZones: number;
  highRiskDelta: string;
  unsafeRoads: number;
  unsafeRoadsStatus: string;
  activeAlerts: number;
  highPriorityAlerts: number;
  lastUpdated: string;
  isSimulated: boolean;
}

export interface RecentPrediction {
  location: string;
  currentRisk: RiskLevel;
  plus1HourRisk: RiskLevel;
  plus3HoursRisk: RiskLevel;
  confidence: number;
  isSimulated: boolean;
}
