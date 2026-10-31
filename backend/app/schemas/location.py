from datetime import datetime
from pydantic import BaseModel, Field

class LocationUpdateRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    accuracy_meters: float = Field(default=10.0, ge=0)
    consent_status: bool = Field(..., description="Explicit consent flag. Must be True.")
    location_source: str = "CURRENT_SESSION" # CURRENT_SESSION, LAST_KNOWN

class LocationResponse(BaseModel):
    latitude: float
    longitude: float
    accuracy_meters: float
    captured_at: datetime
    expires_at: datetime
    consent_status: bool
    location_source: str

    class Config:
        from_attributes = True

class SavedLocationCreate(BaseModel):
    label: str = Field(..., min_length=2)
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    alerts_enabled: bool = True

class SavedLocationResponse(BaseModel):
    id: int
    label: str
    latitude: float
    longitude: float
    alerts_enabled: bool
    created_at: datetime

    class Config:
        from_attributes = True


class EmergencyContactCreate(BaseModel):
    contact_name: str = Field(..., min_length=2, max_length=120)
    relationship: str = Field(default="Family", min_length=2, max_length=40)
    mobile_number: str = Field(..., min_length=7, max_length=32)
    notify_on_critical_alert: bool = False


class EmergencyContactResponse(EmergencyContactCreate):
    id: int
