"""
FloodWatch AI — FastAPI Backend Application
SIH26085 — AI-Powered Urban Flood Susceptibility and Safe Mobility System (Greater Chennai Corporation)
"""

import sys
import os
import asyncio
import logging
import fcntl
import tempfile
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure project root is on sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.app.core.config import settings
from backend.app.api.api_router import api_router
from backend.app.services.flood_service import FloodService
from backend.app.db.session import SessionLocal
from backend.app.db.init_db import init_db

logger = logging.getLogger(__name__)

async def _weather_refresh_loop():
    """One refresh task per application process; requests are cached centrally."""
    lock_path = os.path.join(tempfile.gettempdir(), "floodwatch-open-meteo-refresh.lock")
    lock_handle = open(lock_path, "w")
    try:
        fcntl.flock(lock_handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        logger.info("Another local backend worker owns the weather refresh scheduler.")
        lock_handle.close()
        return
    from backend.app.services.satellite_nwp_service import SatelliteNwpService
    service = SatelliteNwpService.get_instance()
    try:
        while True:
            for location in service.get_locations():
                try:
                    await asyncio.to_thread(service.get_live_precipitation_and_soil, location_id=location["id"])
                except Exception:
                    logger.exception("Scheduled weather refresh failed for %s", location["id"])
            await asyncio.sleep(max(60, settings.WEATHER_REFRESH_INTERVAL_SECONDS))
    finally:
        fcntl.flock(lock_handle.fileno(), fcntl.LOCK_UN)
        lock_handle.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize Database tables and development seed accounts
    print("[STARTUP] Initializing Database tables and RBAC seeds...")
    db = SessionLocal()
    try:
        init_db(db)
    finally:
        db.close()

    from backend.app.services.satellite_nwp_service import SatelliteNwpService
    restore_result = SatelliteNwpService.get_instance().restore_cache_from_database()
    print(f"[STARTUP] Restored {restore_result['locations_restored']} Open-Meteo location cache(s) from database.")

    # Refresh data in one backend task, independent of browser sessions.
    weather_task = asyncio.create_task(_weather_refresh_loop(), name="open-meteo-refresh")
    app.state.weather_refresh_task = weather_task

    # Warm up model and preload grid forecasts
    print("[STARTUP] Initializing FloodWatch AI Nowcasting and Safe Routing Engine...")
    FloodService.get_instance()
    print("[READY] All Chennai GIS spatial features, XGBoost model, and RBAC auth ready for requests.")

    # Initialize experimental DNO Hydrodynamic service
    try:
        from backend.app.services.dno_inference_service import DNOInferenceService
        DNOInferenceService.get_instance()
        print("[READY] Chennai Phase 7C DNO Hydrodynamic inference service initialized.")
    except Exception as e:
        print(f"[WARN] DNO Hydrodynamic service warmup deferred: {e}")

    yield
    weather_task.cancel()
    try:
        await weather_task
    except asyncio.CancelledError:
        pass
    print("[SHUTDOWN] FloodWatch AI service stopping.")

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="High-resolution AI-powered urban flood susceptibility and risk-aware safe routing engine for Greater Chennai.",
    version="2.0.0",
    lifespan=lifespan
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API v1 router
app.include_router(api_router, prefix=settings.API_V1_STR)

# Mount direct alias for /api/dno endpoints
from backend.app.api.routes import dno
app.include_router(dno.router, prefix="/api")

@app.get("/")
def root():
    return {
        "project": settings.PROJECT_NAME,
        "challenge_code": settings.SIH_PROJECT_CODE,
        "study_area": settings.STUDY_AREA,
        "version": "2.0.0 (Phase 2)",
        "model_version": settings.MODEL_VERSION,
        "api_docs": "/docs",
        "api_v1": settings.API_V1_STR,
        "status": "ONLINE"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
