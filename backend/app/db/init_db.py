from datetime import datetime, timedelta, timezone
import json
from sqlalchemy.orm import Session
from sqlalchemy import inspect, text
from backend.app.core.config import settings
from backend.app.core.security import get_password_hash
from backend.app.db.base import Base
from backend.app.db.session import engine
from backend.app.db.models import (
    User,
    GovernmentProfile,
    CitizenAlertPreferences,
    UserLocation,
    SavedLocation,
    EmergencyContact,
    EmergencyAlert,
    AlertDelivery
)
from backend.app.db.models import WeatherObservation

def init_db(db: Session) -> None:
    # 1. Create all tables
    Base.metadata.create_all(bind=engine)
    # Lightweight additive migration; existing observations and indexes remain intact.
    columns = {column["name"] for column in inspect(engine).get_columns("weather_observations")}
    with engine.begin() as connection:
        if "provider_timestamp_iso" not in columns:
            connection.execute(text("ALTER TABLE weather_observations ADD COLUMN provider_timestamp_iso VARCHAR(64)"))
        if "retrieved_at_iso" not in columns:
            connection.execute(text("ALTER TABLE weather_observations ADD COLUMN retrieved_at_iso VARCHAR(64)"))

    # 2. Seed development accounts if enabled
    if not settings.ENABLE_DEMO_SEED:
        return

    # Check if admin already exists (Development account)
    admin_user = db.query(User).filter(User.email == "admin@dev.floodwatch.local").first()
    if not admin_user:
        admin_user = User(
            full_name="System Administrator (Dev Test Account)",
            email="admin@dev.floodwatch.local",
            mobile="+919800000001",
            password_hash=get_password_hash("DevAdmin@2026"),
            role="ADMIN",
            status="VERIFIED",
            email_verified=True,
            mobile_verified=True,
            email_verified_at=datetime.now(timezone.utc),
            mobile_verified_at=datetime.now(timezone.utc)
        )
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)

    # Development Operator Account
    gov_user = db.query(User).filter(User.email == "operator@dev.floodwatch.local").first()
    if not gov_user:
        gov_user = User(
            full_name="EOC Watch Officer (Dev Test Account)",
            email="operator@dev.floodwatch.local",
            mobile="+919800000002",
            password_hash=get_password_hash("DevOperator@2026"),
            role="GOVERNMENT_OPERATOR",
            status="VERIFIED",
            email_verified=True,
            mobile_verified=True,
            email_verified_at=datetime.now(timezone.utc),
            mobile_verified_at=datetime.now(timezone.utc)
        )
        db.add(gov_user)
        db.commit()
        db.refresh(gov_user)

        gov_profile = GovernmentProfile(
            user_id=gov_user.id,
            organization_name="Greater Chennai Corporation (GCC) — Simulation Environment",
            department="Disaster Management Cell",
            designation="EOC Watch Officer (Dev)",
            official_email="operator@dev.floodwatch.local",
            official_phone="+91-44-25384520",
            jurisdiction="Greater Chennai Zones (Zone 9, 10, 13 - Adyar & Velachery)",
            verification_status="VERIFIED",
            verified_by=admin_user.id,
            verified_at=datetime.now(timezone.utc)
        )
        db.add(gov_profile)
        db.commit()

    # Opted-In Development Citizen Account (located near Velachery Basin)
    citizen_user = db.query(User).filter(User.email == "citizen@dev.floodwatch.local").first()
    if not citizen_user:
        citizen_user = User(
            full_name="Karthik R (Dev Citizen Account)",
            email="citizen@dev.floodwatch.local",
            mobile="+919800000004",
            password_hash=get_password_hash("Citizen@2026"),
            role="CITIZEN",
            status="ACTIVE",
            email_verified=True,
            mobile_verified=True,
            email_verified_at=datetime.now(timezone.utc),
            mobile_verified_at=datetime.now(timezone.utc)
        )
        db.add(citizen_user)
        db.commit()
        db.refresh(citizen_user)

        # Preferences
        prefs = CitizenAlertPreferences(
            user_id=citizen_user.id,
            flood_alerts_enabled=True,
            route_warnings_enabled=True,
            high_risk_alerts_enabled=True,
            push_enabled=True,
            email_enabled=True,
            sms_enabled=False,
            location_alerts_enabled=True,
            emergency_contact_notifications_enabled=False
        )
        db.add(prefs)

        # Active Session Location in Velachery Basin (12.9815, 80.2180)
        now = datetime.now(timezone.utc)
        loc = UserLocation(
            user_id=citizen_user.id,
            latitude=12.9815,
            longitude=80.2180,
            accuracy_meters=5.0,
            captured_at=now,
            consent_status=True,
            location_source="CURRENT_SESSION",
            expires_at=now + timedelta(hours=settings.LOCATION_MAX_AGE_HOURS)
        )
        db.add(loc)

        # Saved Location (Home in Velachery)
        home = SavedLocation(
            user_id=citizen_user.id,
            label="Home (Velachery Gandhi Salai)",
            latitude=12.9815,
            longitude=80.2180,
            alerts_enabled=True
        )
        db.add(home)

        # Emergency Contact
        ec = EmergencyContact(
            user_id=citizen_user.id,
            full_name="Meenakshi R",
            relationship_type="Family",
            mobile="+919800000005",
            verified=False,
            notification_consent=False
        )
        db.add(ec)
        db.commit()

    # Initial Development Emergency Alert over Velachery Lowland Basin
    alert = db.query(EmergencyAlert).filter(EmergencyAlert.alert_code == "ALT-CHN-2026-001").first()
    if not alert:
        now = datetime.now(timezone.utc)
        # Velachery Polygon GeoJSON
        velachery_poly = {
            "type": "Polygon",
            "coordinates": [[
                [80.2100, 12.9750],
                [80.2250, 12.9750],
                [80.2250, 12.9900],
                [80.2100, 12.9900],
                [80.2100, 12.9750]
            ]]
        }
        alert = EmergencyAlert(
            alert_code="ALT-CHN-2026-001",
            title="Severe Low-Lying Inundation Alert — Velachery Basin",
            location_name="Velachery Lake & Gandhi Salai Corridor",
            alert_type="FLOOD_INUNDATION",
            severity="CRITICAL",
            risk_score=92,
            model_confidence=94,
            forecast_horizon="NOW",
            geometry_geojson=json.dumps(velachery_poly),
            description="Saucer depression index and high soil saturation indicate severe localized water accumulation risk.",
            recommended_action="Avoid traveling through low-lying Velachery lake roads. Utilize elevated Taramani / Guindy bypass.",
            model_version="XGBoost-v1.0-Chennai",
            status="ACTIVE",
            prediction_timestamp=now,
            created_at=now,
            last_updated=now,
            expires_at=now + timedelta(hours=2)
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)

        if citizen_user:
            delivery = AlertDelivery(
                alert_id=alert.id,
                user_id=citizen_user.id,
                channel="IN_APP",
                delivery_status="SENT",
                sent_at=now
            )
            db.add(delivery)
            db.commit()

    print("[OK] Database initialized and development seed accounts created for Greater Chennai.")
