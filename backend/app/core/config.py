import os
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "FloodWatch AI — Greater Chennai"
    API_V1_STR: str = "/api/v1"
    SIH_PROJECT_CODE: str = "SIH26085"
    STUDY_AREA: str = "Greater Chennai Corporation (GCC) & Contiguous Catchment"
    MODEL_VERSION: str = "XGBoost-v1.0-Chennai"
    DATA_MODE: str = "chennai_real_pipeline"
    USE_DEVELOPMENT_FALLBACK: bool = False
    CORS_ORIGINS: list[str] = ["http://localhost:4200", "http://127.0.0.1:4200", "*"]
    PORT: int = 8000
    HOST: str = "0.0.0.0"

    # Geographic Bounding Box & Center (Chennai UTM 44N / WGS84)
    DEFAULT_LAT: float = 13.0827
    DEFAULT_LON: float = 80.2707
    BOUNDS_MIN_LAT: float = 12.85
    BOUNDS_MAX_LAT: float = 13.25
    BOUNDS_MIN_LON: float = 80.09
    BOUNDS_MAX_LON: float = 80.35

    # Open-Meteo is queried by the backend. Defaults keep API use low while
    # allowing the requested period/locations to be changed through the env.
    WEATHER_API_URL: str = "https://api.open-meteo.com/v1/forecast"
    WEATHER_FORECAST_HOURS: int = 48
    WEATHER_REFRESH_INTERVAL_SECONDS: int = Field(default=3600, ge=60)
    WEATHER_HTTP_TIMEOUT_SECONDS: float = 10.0
    WEATHER_RETRY_COUNT: int = 2
    WEATHER_RETRY_BACKOFF_SECONDS: float = 0.5
    WEATHER_CACHE_TTL_SECONDS: int = Field(default=3300, ge=1)
    WEATHER_MONITORING_LOCATIONS: str = "[]"
    WEATHER_STUDY_AREA_GEOJSON: str = "Data/processed/grids/chennai_grid_500m.geojson"
    WEATHER_HISTORICAL_RAINFALL_CSV: str = "Data/raw/Chennai rainfall.csv"

    # Nominal urban planning speeds used only because the current road layer has
    # no speed-limit/current-speed attributes. Override with route-specific data.
    SAFE_ROUTE_SPEED_CAR_KMH: float = Field(default=30.0, gt=0)
    SAFE_ROUTE_SPEED_SUV_KMH: float = Field(default=30.0, gt=0)
    SAFE_ROUTE_SPEED_TRUCK_KMH: float = Field(default=22.0, gt=0)
    SAFE_ROUTE_SPEED_RESCUE_KMH: float = Field(default=35.0, gt=0)
    # Optional operator-supplied fleet dimensions; empty means no assumed sizes.
    # Example shape: {"truck":{"height_m":4.0,"weight_t":18,"width_m":2.5}}
    SAFE_ROUTE_VEHICLE_DIMENSIONS: dict[str, dict[str, float]] = Field(default_factory=dict)

    # Security & JWT
    SECRET_KEY: str = os.getenv("SECRET_KEY", "sih26085-chennai-floodwatch-ai-secret-key-2026-prod")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./data/floodwatch.db")

    # Environment & Demo Seed
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    ENABLE_DEMO_SEED: bool = os.getenv("ENABLE_DEMO_SEED", "true").lower() == "true"

    # Alert Geofence & Location Retention
    ALERT_ZONE_BUFFER_METERS: float = 500.0
    ALERT_COOLDOWN_MINUTES: int = 30
    LOCATION_MAX_AGE_HOURS: int = 4
    OTP_EXPIRE_MINUTES: int = 10
    OTP_MAX_ATTEMPTS: int = 5

    model_config = SettingsConfigDict(case_sensitive=True)

    @model_validator(mode="after")
    def validate_weather_cache_schedule(self):
        if self.WEATHER_CACHE_TTL_SECONDS > self.WEATHER_REFRESH_INTERVAL_SECONDS:
            raise ValueError("WEATHER_CACHE_TTL_SECONDS must not exceed WEATHER_REFRESH_INTERVAL_SECONDS")
        return self

    @model_validator(mode="after")
    def validate_route_speeds(self):
        if any(speed <= 0 for speed in (
            self.SAFE_ROUTE_SPEED_CAR_KMH,
            self.SAFE_ROUTE_SPEED_SUV_KMH,
            self.SAFE_ROUTE_SPEED_TRUCK_KMH,
            self.SAFE_ROUTE_SPEED_RESCUE_KMH,
        )):
            raise ValueError("Safe-route planning speeds must be positive")
        return self

settings = Settings()
