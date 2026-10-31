export interface RainfallLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface RainfallReading {
  location?: RainfallLocation | string;
  location_id?: string;
  latitude: number | null;
  longitude: number | null;
  precipitation_mm: number | null;
  rain_mm?: number | null;
  temperature_c: number | null;
  humidity_percent: number | null;
  wind_speed_kmh: number | null;
  timestamp: string | null;
  fetched_at: string | null;
  data_source: string;
  data_type: string;
  status: 'success' | 'cached' | 'stale' | 'unavailable' | string;
  is_stale?: boolean;
  cached_data_available?: boolean;
  freshness?: string;
  last_failed_refresh_at?: string | null;
  failure_type?: string | null;
  error?: string | null;
}

export interface RainfallForecastHour {
  timestamp: string;
  precipitation_mm: number | null;
  precipitation_probability: number | null;
  fetched_at?: string | null;
}

export interface RainfallForecast {
  location: string;
  latitude: number | null;
  longitude: number | null;
  data_source: string;
  status: string;
  fetched_at: string | null;
  forecast_is_stale?: boolean;
  forecast_cache_age_seconds?: number | null;
  forecast_hours_available: number;
  hourly: RainfallForecastHour[];
}

export interface RainfallStatus {
  status: string;
  freshness?: string;
  is_stale?: boolean;
  cached_data_available?: boolean;
  last_successful_fetch_at?: string | null;
  last_failed_refresh_at?: string | null;
  forecast_is_stale?: boolean;
  forecast_cache_age_seconds?: number | null;
  failure_type?: string | null;
  error?: string | null;
}

export interface RainfallLocationsResponse {
  locations: RainfallLocation[];
  refresh_interval_seconds: number;
  forecast_hours: number;
}
