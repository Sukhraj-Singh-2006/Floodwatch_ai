"""
FloodWatch AI — Phase 7D: Chennai Hydrodynamic DNO Inference Service
SIH26085 — High-Resolution Urban Flood Susceptibility & Hydrodynamic Forecasting

Contract & Specifications:
- Selected Model: Chennai Phase 7C (threshold = 0.15m, alpha = 1.00)
- Checkpoint: models/urban_flood_dno/checkpoints/chennai_phase7c/best_alpha_1.00_checkpoint.pt
- SHA-256: 8c25b242b10e2bbdbee7f4a407902a045a3fe4ba55f5df4f548b1930c04126c2
- Physical Units: Native Scale (H in meters, U/V in m/s) — NO 5x multiplier.
- Forecast Horizon: 120 minutes (24 x 5-minute timesteps)
- Grid: 128x128 Adyar-Velachery Pilot Domain (EPSG:32644 UTM Zone 44N, dx = 78.125m)
- Status: Isolated Experimental Hydrodynamic Surrogate (Production XGBoost remains untouched)
"""

import os
import sys
import time
import json
import hashlib
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import torch

# Ensure External/UrbanFloodCast DNO package is accessible
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
DNO_LIB_PATH = os.path.join(REPO_ROOT, "External", "UrbanFloodCast", "DNO")
if DNO_LIB_PATH not in sys.path:
    sys.path.insert(0, DNO_LIB_PATH)

from models.DNO import DNO

try:
    from pyproj import Transformer
    _TRANSFORMER = Transformer.from_crs("EPSG:32644", "EPSG:4326", always_xy=True)
except Exception:
    _TRANSFORMER = None


class DNOInferenceService:
    _instance: Optional["DNOInferenceService"] = None

    EXPECTED_SHA256 = "8c25b242b10e2bbdbee7f4a407902a045a3fe4ba55f5df4f548b1930c04126c2"
    EXPECTED_FILE_SIZE = 107304025

    # Grid Constants
    GRID_WIDTH = 128
    GRID_HEIGHT = 128
    CELL_SIZE_M = 78.125
    CELL_AREA_M2 = 78.125 * 78.125  # ~6103.515625 m²
    TIMESTEPS = 24
    TIMESTEP_MIN = 5
    HORIZON_MIN = 120

    UTM_XMIN = 410000.0
    UTM_YMIN = 1431000.0
    UTM_XMAX = 420000.0
    UTM_YMAX = 1441000.0

    WGS84_BOUNDS = {
        "min_lat": 12.943196,
        "max_lat": 13.033893,
        "min_lon": 80.170273,
        "max_lon": 80.262192
    }

    FLOOD_THRESHOLDS = [0.05, 0.10, 0.20, 0.50, 1.00]

    DISCLAIMER = (
        "This DNO model is an experimental hydrodynamic surrogate trained and evaluated "
        "on the current Chennai research dataset. It is not yet an operational government "
        "flood-warning system. The current DNO horizon is 120 minutes. Live operational "
        "rainfall/NWP coupling is not claimed unless actually implemented and verified."
    )

    PRODUCTION_SEPARATION = (
        "Production: XGBoost flood-risk model (Primary operational classifier, unchanged). "
        "Experimental: Phase 7C DNO hydrodynamic depth/velocity model (Isolated surrogate service)."
    )

    def __init__(self, force_cpu: bool = False):
        self.device = torch.device("cpu") if force_cpu or not torch.cuda.is_available() else torch.device("cuda:0")
        self.ckpt_path = os.path.join(
            REPO_ROOT, "models", "urban_flood_dno", "checkpoints", "chennai_phase7c", "best_alpha_1.00_checkpoint.pt"
        )
        self.tensor_dir = os.path.join(
            REPO_ROOT, "Data", "dno", "chennai", "storm_library", "tensors"
        )
        self.manifest_path = os.path.join(
            REPO_ROOT, "Data", "dno", "chennai", "storm_library", "metadata", "storm_library_manifest.json"
        )

        self.model: Optional[DNO] = None
        self.model_loaded = False
        self.actual_sha256 = ""
        self.actual_size = 0
        self.ckpt_meta: Dict[str, Any] = {}
        self.load_duration_ms = 0.0

        self._load_model()

    @classmethod
    def get_instance(cls, force_cpu: bool = False) -> "DNOInferenceService":
        if cls._instance is None:
            cls._instance = cls(force_cpu=force_cpu)
        return cls._instance

    def _verify_checkpoint(self) -> None:
        if not os.path.exists(self.ckpt_path):
            raise FileNotFoundError(f"DNO Checkpoint file not found: {self.ckpt_path}")

        self.actual_size = os.path.getsize(self.ckpt_path)
        hasher = hashlib.sha256()
        with open(self.ckpt_path, "rb") as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
        self.actual_sha256 = hasher.hexdigest()

        if self.actual_sha256 != self.EXPECTED_SHA256:
            raise ValueError(
                f"Checkpoint SHA-256 hash mismatch! "
                f"Expected: {self.EXPECTED_SHA256}, Actual: {self.actual_sha256}"
            )

    def _load_model(self) -> None:
        t0 = time.perf_counter()
        self._verify_checkpoint()

        # Instantiate identical Phase 7C DNO architecture
        self.model = DNO(
            num_channels=5,
            width=10,
            initial_step=1,
            pad=0,
            factor=1
        ).to(self.device)

        ckpt_dict = torch.load(self.ckpt_path, map_location=self.device)
        self.model.load_state_dict(ckpt_dict["model_state_dict"])
        self.model.eval()

        self.ckpt_meta = {
            "epoch": ckpt_dict.get("epoch", 47),
            "alpha": ckpt_dict.get("alpha", 1.00),
            "train_total_loss": ckpt_dict.get("train_total_loss"),
            "val_total_loss": ckpt_dict.get("val_total_loss"),
            "model_config": ckpt_dict.get("model_config"),
            "timestamp": ckpt_dict.get("timestamp")
        }

        self.model_loaded = True
        self.load_duration_ms = round((time.perf_counter() - t0) * 1000.0, 2)
        print(f"[DNO] Model loaded successfully on {self.device} in {self.load_duration_ms} ms (SHA256: {self.actual_sha256[:12]}...).")

    def get_health(self) -> Dict[str, Any]:
        vram_mb = None
        if self.device.type == "cuda":
            vram_mb = round(torch.cuda.memory_allocated(self.device) / (1024 * 1024), 2)

        return {
            "status": "ok",
            "model_loaded": self.model_loaded,
            "model_name": "Chennai Urban Flood DNO",
            "model_version": f"phase7c-alpha{self.ckpt_meta.get('alpha', 1.00):.2f}",
            "checkpoint_sha256": self.actual_sha256,
            "checkpoint_size_bytes": self.actual_size,
            "device": str(self.device),
            "horizon_minutes": self.HORIZON_MIN,
            "timestep_minutes": self.TIMESTEP_MIN,
            "memory_diagnostics": {
                "device": str(self.device),
                "cuda_vram_allocated_mb": vram_mb,
                "model_load_ms": self.load_duration_ms
            },
            "production_separation": self.PRODUCTION_SEPARATION,
            "disclaimer": self.DISCLAIMER
        }

    def get_available_events(self) -> Dict[str, Any]:
        """Lists available prepared storm library events."""
        events = []
        manifest = {}
        if os.path.exists(self.manifest_path):
            try:
                with open(self.manifest_path, "r", encoding="utf-8") as f:
                    manifest = json.load(f).get("storm_events", {})
            except Exception:
                manifest = {}

        for i in range(1, 31):
            eid = f"storm_{i:03d}"
            in_file = os.path.join(self.tensor_dir, f"{eid}_input_tensor.pt")
            tg_file = os.path.join(self.tensor_dir, f"{eid}_target_tensor.pt")
            in_exists = os.path.exists(in_file)
            tg_exists = os.path.exists(tg_file)

            meta = manifest.get(eid, {})
            events.append({
                "id": eid,
                "category": meta.get("category", "Synthetic Storm"),
                "rainfall_mm": meta.get("total_rainfall_mm", 0.0),
                "peak_intensity_mm_h": meta.get("peak_intensity_mm_h", 0.0),
                "profile": meta.get("profile", "unknown"),
                "input_tensor_exists": in_exists,
                "target_tensor_exists": tg_exists
            })

        return {
            "total_events": len(events),
            "events": events,
            "note": "All 30 events are prepared 2D hydrodynamic simulation tensors in native scale."
        }

    def predict_prepared_event(
        self,
        event_id: str = "storm_011",
        include_spatial_grids: bool = False,
        target_lead_minutes_spatial: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Executes hydrodynamic inference using the selected Phase 7C DNO model.
        Returns H, U, V predictions, flood extent, velocity magnitude, and depth severity bins.
        """
        if not self.model_loaded or self.model is None:
            raise RuntimeError("DNO model is not loaded.")

        # 1. Locate prepared tensor
        tensor_file = os.path.join(self.tensor_dir, f"{event_id}_input_tensor.pt")
        if not os.path.exists(tensor_file):
            raise FileNotFoundError(f"Prepared tensor for event '{event_id}' not found at: {tensor_file}")

        # 2. Load and validate input tensor
        t_req_start = time.perf_counter()
        x = torch.load(tensor_file, map_location=self.device)

        expected_shape = (1, self.GRID_HEIGHT, self.GRID_WIDTH, self.TIMESTEPS, 1, 5)
        if x.shape != expected_shape:
            raise ValueError(f"Input tensor shape mismatch: expected {expected_shape}, got {tuple(x.shape)}")

        # 3. Model inference under torch.no_grad()
        t_inf_start = time.perf_counter()
        with torch.no_grad():
            pred = self.model(x)
        t_inf_end = time.perf_counter()
        inference_ms = round((t_inf_end - t_inf_start) * 1000.0, 2)

        # 4. Check numerical integrity
        nan_detected = bool(torch.isnan(pred).any().item())
        inf_detected = bool(torch.isinf(pred).any().item())
        if nan_detected or inf_detected:
            raise ValueError("Numerical instability detected: DNO output contains NaN or Inf.")

        # 5. Extract output products in physical units
        # Physical contract: pred is native physical scale (H in m, U in m/s, V in m/s)
        # Apply physical floor H >= 0 to remove dry-bed oscillation artifacts
        t_post_start = time.perf_counter()
        pred_np = pred.detach().cpu().numpy()  # [1, 128, 128, 24, 3]

        H = np.maximum(0.0, pred_np[0, ..., 0])  # [128, 128, 24] meters
        U = pred_np[0, ..., 1]                   # [128, 128, 24] m/s
        V = pred_np[0, ..., 2]                   # [128, 128, 24] m/s
        W = np.sqrt(U ** 2 + V ** 2)             # [128, 128, 24] m/s velocity magnitude

        forecasts: List[Dict[str, Any]] = []
        peak_depth_overall = float(np.max(H))
        peak_velocity_overall = float(np.max(W))
        peak_flooded_area_overall = 0.0

        for t in range(self.TIMESTEPS):
            lead_min = (t + 1) * self.TIMESTEP_MIN
            h_t = H[:, :, t]
            w_t = W[:, :, t]

            max_d = float(np.max(h_t))
            mean_d = float(np.mean(h_t))
            max_v = float(np.max(w_t))
            mean_v = float(np.mean(w_t))

            # Flood extent thresholds
            c_005 = int(np.sum(h_t > 0.05))
            c_010 = int(np.sum(h_t > 0.10))
            c_020 = int(np.sum(h_t > 0.20))
            c_050 = int(np.sum(h_t > 0.50))
            c_100 = int(np.sum(h_t > 1.00))

            area_005 = round(c_005 * self.CELL_AREA_M2, 1)
            area_010 = round(c_010 * self.CELL_AREA_M2, 1)
            area_020 = round(c_020 * self.CELL_AREA_M2, 1)
            area_050 = round(c_050 * self.CELL_AREA_M2, 1)
            area_100 = round(c_100 * self.CELL_AREA_M2, 1)

            if area_005 > peak_flooded_area_overall:
                peak_flooded_area_overall = area_005

            # Severity bins
            dry = int(np.sum(h_t < 0.05))
            b_05_10 = int(np.sum((h_t >= 0.05) & (h_t < 0.10)))
            b_10_20 = int(np.sum((h_t >= 0.10) & (h_t < 0.20)))
            b_20_50 = int(np.sum((h_t >= 0.20) & (h_t < 0.50)))
            b_50_1m = int(np.sum((h_t >= 0.50) & (h_t < 1.00)))
            b_1m_2m = int(np.sum((h_t >= 1.00) & (h_t < 2.00)))
            b_gt_2m = int(np.sum(h_t >= 2.00))

            forecasts.append({
                "lead_minutes": lead_min,
                "timestep_index": t + 1,
                "max_depth_m": round(max_d, 4),
                "mean_depth_m": round(mean_d, 4),
                "flooded_area_m2": area_005,
                "max_velocity_mps": round(max_v, 4),
                "mean_velocity_mps": round(mean_v, 4),
                "flood_extent": {
                    "cells_gt_0_05m": c_005,
                    "area_m2_gt_0_05m": area_005,
                    "cells_gt_0_10m": c_010,
                    "area_m2_gt_0_10m": area_010,
                    "cells_gt_0_20m": c_020,
                    "area_m2_gt_0_20m": area_020,
                    "cells_gt_0_50m": c_050,
                    "area_m2_gt_0_50m": area_050,
                    "cells_gt_1_00m": c_100,
                    "area_m2_gt_1_00m": area_100
                },
                "depth_severity_cells": {
                    "dry_under_5cm": dry,
                    "low_5_to_10cm": b_05_10,
                    "minor_10_to_20cm": b_10_20,
                    "moderate_20_to_50cm": b_20_50,
                    "severe_50cm_to_1m": b_50_1m,
                    "very_severe_1_to_2m": b_1m_2m,
                    "extreme_over_2m": b_gt_2m
                }
            })

        # Optional spatial grid matrices
        spatial_grids_dict = None
        if include_spatial_grids:
            target_t = 23  # default T+120
            if target_lead_minutes_spatial is not None:
                target_t = max(0, min(self.TIMESTEPS - 1, (target_lead_minutes_spatial // self.TIMESTEP_MIN) - 1))

            spatial_grids_dict = {
                "lead_minutes": (target_t + 1) * self.TIMESTEP_MIN,
                "timestep_index": target_t + 1,
                "depth_m": np.round(H[:, :, target_t], 4).tolist(),
                "velocity_mps": np.round(W[:, :, target_t], 4).tolist()
            }

        t_post_end = time.perf_counter()
        postprocess_ms = round((t_post_end - t_post_start) * 1000.0, 2)
        total_ms = round((t_post_end - t_req_start) * 1000.0, 2)

        # Cleanup GPU cache
        if self.device.type == "cuda":
            torch.cuda.empty_cache()

        return {
            "model": "chennai_phase7c_dno",
            "model_version": f"phase7c-alpha{self.ckpt_meta.get('alpha', 1.00):.2f}",
            "input_mode": "prepared",
            "event_id": event_id,
            "forecast_horizon_minutes": self.HORIZON_MIN,
            "timestep_minutes": self.TIMESTEP_MIN,
            "num_timesteps": self.TIMESTEPS,
            "grid": {
                "crs": "EPSG:32644",
                "domain_name": "Adyar–Velachery Basin (Greater Chennai)",
                "width": self.GRID_WIDTH,
                "height": self.GRID_HEIGHT,
                "cell_size_meters": self.CELL_SIZE_M,
                "cell_area_m2": self.CELL_AREA_M2,
                "bounds_utm44n": [self.UTM_XMIN, self.UTM_YMIN, self.UTM_XMAX, self.UTM_YMAX],
                "bounds_wgs84": self.WGS84_BOUNDS
            },
            "model_metadata": {
                "model_name": "Chennai Urban Flood DNO",
                "phase": "Phase 7C",
                "alpha": float(self.ckpt_meta.get("alpha", 1.00)),
                "threshold_m": 0.15,
                "loss_type": "Thresholded dual-regime depth-weighted loss",
                "training_horizon": "120 minutes (24 x 5-min intervals)",
                "forecast_horizon_minutes": self.HORIZON_MIN,
                "timestep_minutes": self.TIMESTEP_MIN,
                "units": {
                    "water_depth": "meters",
                    "velocity_u": "m/s",
                    "velocity_v": "m/s",
                    "velocity_magnitude": "m/s"
                }
            },
            "summary": {
                "peak_depth_m": round(peak_depth_overall, 4),
                "peak_velocity_mps": round(peak_velocity_overall, 4),
                "peak_flooded_area_m2": round(peak_flooded_area_overall, 1),
                "peak_flooded_area_km2": round(peak_flooded_area_overall / 1e6, 3),
                "total_domain_area_km2": round((self.GRID_WIDTH * self.CELL_SIZE_M * self.GRID_HEIGHT * self.CELL_SIZE_M) / 1e6, 1)
            },
            "forecasts": forecasts,
            "spatial_grids": spatial_grids_dict,
            "diagnostics": {
                "device": str(self.device),
                "inference_latency_ms": inference_ms,
                "postprocessing_latency_ms": postprocess_ms,
                "total_latency_ms": total_ms,
                "nan_detected": nan_detected,
                "inf_detected": inf_detected,
                "model_load_latency_ms": self.load_duration_ms
            },
            "disclaimer": self.DISCLAIMER
        }

    def get_forecast_geojson(
        self,
        event_id: str = "storm_011",
        lead_minutes: int = 60,
        threshold_m: float = 0.10,
        max_features: int = 1500
    ) -> Dict[str, Any]:
        """
        Generates GeoJSON FeatureCollection of inundated grid cells for a given lead time.
        Each feature is a cell polygon with water depth and velocity properties.
        """
        if _TRANSFORMER is None:
            raise RuntimeError("pyproj Transformer is not available.")

        # Run prediction
        res = self.predict_prepared_event(
            event_id=event_id,
            include_spatial_grids=True,
            target_lead_minutes_spatial=lead_minutes
        )

        grid_data = res.get("spatial_grids")
        if not grid_data:
            raise ValueError("Failed to retrieve spatial grid data for GeoJSON export.")

        depth_grid = np.array(grid_data["depth_m"])
        vel_grid = np.array(grid_data["velocity_mps"])
        actual_lead = grid_data["lead_minutes"]

        dx = self.CELL_SIZE_M
        features = []

        # Find cells above threshold
        wet_rows, wet_cols = np.where(depth_grid >= threshold_m)

        # Sort by depth descending so most severe cells are prioritized if capping
        if len(wet_rows) > max_features:
            depth_vals = depth_grid[wet_rows, wet_cols]
            top_indices = np.argsort(depth_vals)[::-1][:max_features]
            wet_rows = wet_rows[top_indices]
            wet_cols = wet_cols[top_indices]

        for r, c in zip(wet_rows, wet_cols):
            d_val = float(depth_grid[r, c])
            v_val = float(vel_grid[r, c])

            # In UTM 44N: r=0 is top (YMAX), c=0 is left (XMIN)
            x0 = self.UTM_XMIN + c * dx
            x1 = x0 + dx
            y1 = self.UTM_YMAX - r * dx
            y0 = y1 - dx

            # Transform corner coordinates to WGS84 (lon, lat)
            lon0, lat0 = _TRANSFORMER.transform(x0, y0)
            lon1, lat0_r = _TRANSFORMER.transform(x1, y0)
            lon1_t, lat1 = _TRANSFORMER.transform(x1, y1)
            lon0_t, lat1_l = _TRANSFORMER.transform(x0, y1)

            poly_coords = [[
                [round(lon0, 6), round(lat0, 6)],
                [round(lon1, 6), round(lat0_r, 6)],
                [round(lon1_t, 6), round(lat1, 6)],
                [round(lon0_t, 6), round(lat1_l, 6)],
                [round(lon0, 6), round(lat0, 6)]
            ]]

            # Severity classification
            if d_val >= 2.00:
                sev = "EXTREME_DEEP_POOLING"
            elif d_val >= 1.00:
                sev = "VERY_SEVERE"
            elif d_val >= 0.50:
                sev = "SEVERE"
            elif d_val >= 0.20:
                sev = "MODERATE"
            elif d_val >= 0.10:
                sev = "LOW"
            else:
                sev = "VERY_LOW"

            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": poly_coords
                },
                "properties": {
                    "grid_row": int(r),
                    "grid_col": int(c),
                    "depth_m": round(d_val, 4),
                    "velocity_mps": round(v_val, 4),
                    "severity": sev,
                    "lead_minutes": actual_lead,
                    "event_id": event_id
                }
            })

        return {
            "type": "FeatureCollection",
            "crs": {
                "type": "name",
                "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}
            },
            "properties": {
                "event_id": event_id,
                "lead_minutes": actual_lead,
                "threshold_m": threshold_m,
                "total_inundated_cells": len(features),
                "crs_source": "EPSG:32644 (Chennai UTM 44N)",
                "disclaimer": self.DISCLAIMER
            },
            "features": features
        }
