from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.db.models.user import User
from backend.app.db.models.citizen_preference import CitizenAlertPreferences
from backend.app.db.models.otp import OtpVerification
from backend.app.schemas.auth import (
    UserLoginRequest,
    CitizenRegisterRequest,
    TokenResponse,
    RefreshTokenRequest,
    UserMeResponse,
    AlertPreferencesInput,
    UserPublicSchema,
    GovernmentProfilePublicSchema,
    SavedLocationSchema
)
from backend.app.services.auth_service import AuthService, get_current_user, security_scheme
from backend.app.core.security import decode_token, create_access_token, revoke_token, is_token_revoked

router = APIRouter(prefix="/auth", tags=["Authentication & User Management"])


def _public_user(user: User) -> UserPublicSchema:
    """Pydantic v1/v2 compatible serializer."""
    if hasattr(UserPublicSchema, "model_validate"):
        return UserPublicSchema.model_validate(user, from_attributes=True)
    return UserPublicSchema.from_orm(user)  # type: ignore[attr-defined]


def _saved_location(sl) -> SavedLocationSchema:
    if hasattr(SavedLocationSchema, "model_validate"):
        return SavedLocationSchema.model_validate(sl, from_attributes=True)
    return SavedLocationSchema.from_orm(sl)  # type: ignore[attr-defined]

@router.post("/register", response_model=TokenResponse)
def register_citizen(payload: CitizenRegisterRequest, db: Session = Depends(get_db)):
    verification = db.query(OtpVerification).filter(
        OtpVerification.target == payload.email.lower().strip(),
        OtpVerification.purpose == "REGISTRATION",
    ).order_by(OtpVerification.created_at.desc()).first()
    if not verification or verification.verified_at is None:
        raise HTTPException(status_code=400, detail="Verify your email address before creating an account.")
    user = AuthService.register_citizen(payload, db)
    tokens = AuthService.create_tokens_for_user(user)
    return TokenResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        token_type="bearer",
        user=_public_user(user)
    )

@router.post("/login", response_model=TokenResponse)
def login(payload: UserLoginRequest, db: Session = Depends(get_db)):
    user = AuthService.authenticate_user(payload.login_id, payload.password, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email/mobile or password."
        )
    tokens = AuthService.create_tokens_for_user(user, remember_me=payload.remember_me)
    return TokenResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        token_type="bearer",
        user=_public_user(user)
    )

@router.post("/logout")
def logout(
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
):
    # Revoke the presenting access token so it cannot be replayed.
    try:
        revoke_token(credentials.credentials)
    except Exception:
        pass
    return {"success": True, "message": "Successfully logged out."}

@router.post("/refresh")
def refresh_token(payload: RefreshTokenRequest, db: Session = Depends(get_db)):
    if not payload.refresh_token or is_token_revoked(payload.refresh_token):
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token.")
    decoded = decode_token(payload.refresh_token)
    if not decoded or decoded.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token.")

    try:
        user_id = int(decoded.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token.")
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.status == "SUSPENDED":
        raise HTTPException(status_code=401, detail="User account inactive or suspended.")

    new_access_token = create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "status": user.status
    })
    return {
        "access_token": new_access_token,
        "token_type": "bearer"
    }

@router.get("/me", response_model=UserMeResponse)
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    has_active_loc = any(
        loc.consent_status and loc.expires_at > now for loc in current_user.locations
    )

    prefs = current_user.alert_preferences
    pref_schema = None
    if prefs:
        pref_schema = AlertPreferencesInput(
            flood_alerts_enabled=prefs.flood_alerts_enabled,
            route_warnings_enabled=prefs.route_warnings_enabled,
            high_risk_alerts_enabled=prefs.high_risk_alerts_enabled,
            push_enabled=prefs.push_enabled,
            email_enabled=prefs.email_enabled,
            sms_enabled=prefs.sms_enabled,
            location_alerts_enabled=prefs.location_alerts_enabled,
            emergency_contact_notifications_enabled=prefs.emergency_contact_notifications_enabled
        )

    gov_schema = None
    if current_user.government_profile:
        gp = current_user.government_profile
        gov_schema = GovernmentProfilePublicSchema(
            organization_name=gp.organization_name,
            department=gp.department,
            designation=gp.designation,
            official_email=gp.official_email,
            official_phone=gp.official_phone,
            jurisdiction=gp.jurisdiction,
            verification_status=gp.verification_status
        )

    saved_locs = [_saved_location(sl) for sl in current_user.saved_locations]

    return UserMeResponse(
        user=_public_user(current_user),
        alert_preferences=pref_schema,
        government_profile=gov_schema,
        has_active_location=has_active_loc,
        saved_locations=saved_locs
    )

@router.patch("/me/preferences", response_model=AlertPreferencesInput)
def update_preferences(
    payload: AlertPreferencesInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    prefs = current_user.alert_preferences
    if not prefs:
        prefs = CitizenAlertPreferences(user_id=current_user.id)
        db.add(prefs)

    prefs.flood_alerts_enabled = payload.flood_alerts_enabled
    prefs.route_warnings_enabled = payload.route_warnings_enabled
    prefs.high_risk_alerts_enabled = payload.high_risk_alerts_enabled
    prefs.push_enabled = payload.push_enabled
    prefs.email_enabled = payload.email_enabled
    prefs.sms_enabled = payload.sms_enabled
    prefs.location_alerts_enabled = payload.location_alerts_enabled
    prefs.emergency_contact_notifications_enabled = payload.emergency_contact_notifications_enabled

    db.commit()
    db.refresh(prefs)
    return payload
