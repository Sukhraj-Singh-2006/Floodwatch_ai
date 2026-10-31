from sqlalchemy import Column, DateTime, Float, Integer, String, UniqueConstraint, Index
from backend.app.db.base import Base


class WeatherObservation(Base):
    """Provider readings; current estimates and forecast hours stay distinct."""
    __tablename__ = "weather_observations"
    __table_args__ = (
        UniqueConstraint("provider", "location_id", "data_category", "observation_time", name="uq_weather_reading"),
        Index("ix_weather_location_time", "location_id", "observation_time"),
    )

    id = Column(Integer, primary_key=True)
    provider = Column(String(80), nullable=False)
    location_id = Column(String(120), nullable=False)
    location_name = Column(String(200), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    rainfall_mm = Column(Float, nullable=True)
    precipitation_mm = Column(Float, nullable=True)
    precipitation_probability = Column(Float, nullable=True)
    temperature_c = Column(Float, nullable=True)
    humidity_percent = Column(Float, nullable=True)
    wind_speed_kmh = Column(Float, nullable=True)
    observation_time = Column(DateTime(timezone=True), nullable=False)
    retrieved_at = Column(DateTime(timezone=True), nullable=False)
    # SQLite strips tzinfo from DateTime columns. These ISO fields preserve the
    # provider's offset and the exact API retrieval instant across restarts.
    provider_timestamp_iso = Column(String(64), nullable=True)
    retrieved_at_iso = Column(String(64), nullable=True)
    data_category = Column(String(32), nullable=False)  # current_estimate / forecast
