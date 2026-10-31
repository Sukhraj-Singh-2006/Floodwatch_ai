# Data Sources & Integrity Documentation — FloodWatch AI (Phase 2 Mumbai)

## 1. Study Area Scope
- **Geographic Focus**: Greater Mumbai (Brihanmumbai Municipal Corporation - BMC area), Maharashtra, India.
- **Bounding Box**:
  - Min Longitude: `72.7750° E`, Max Longitude: `72.9900° E`
  - Min Latitude: `18.8900° N`, Max Latitude: `19.2900° N`
- **Projected Metric CRS**: `EPSG:32643` (UTM Zone 43N) for all Euclidean metric operations, distance-to-drain calculations, area estimates, and grid generation.
- **Geographic Web CRS**: `EPSG:4326` (WGS84) for GeoJSON serialization, API outputs, and Leaflet map consumption.

---

## 2. Dataset Inventory & Provenance

### A. Greater Mumbai Administrative Boundary (`DS-01`)
- **Source**: OpenStreetMap Boundary & Survey of India / Municipal Administrative Open Data.
- **Spatial Coverage**: 24 administrative municipal wards (A through T wards across Island City, Eastern Suburbs, and Western Suburbs).
- **Processing**: Standardized polygon envelope used to clip all rasters, drains, and road networks.

### B. Rainfall Telemetry Network (`DS-02`)
- **Source**: Indian Meteorological Department (IMD) AWS & MCGM Disaster Management Telemetry.
- **Key Stations**:
  - Colaba (Island City South)
  - Santacruz (Suburban Central)
  - Dadar / Hindmata AWS
  - Kurla / LBS Marg AWS
  - Andheri West / East AWS
  - Chembur / Vashi Naka AWS
  - Malad / Goregaon AWS
  - Borivali / Dahisar AWS
- **Derived Rolling Features**:
  - `rainfall_1h`: Past 1-hour accumulated precipitation (mm)
  - `rainfall_3h`: Past 3-hour accumulated precipitation (mm)
  - `rainfall_6h`: Past 6-hour accumulated precipitation (mm)
  - `rainfall_24h`: Past 24-hour antecedent rainfall index (mm)
  - `rainfall_intensity_change`: Acceleration of rainfall rate ($R_{1h} - R_{prev}$)
- **Limitations**: Station-level hourly gauge measurements are interpolated to grid centroids using inverse distance weighting (IDW).

### C. Drainage Network & River Channels (`DS-03`)
- **Source**: BMC Stormwater Drainage (SWD) GIS & OpenStreetMap Natural Waterway vectors.
- **Key Channels Included**:
  - Mithi River (Powai lake overflow through BKC to Mahim Bay)
  - Poisar River & Dahisar River
  - Oshiwara River
  - Major outfalls into the Arabian Sea and Thane Creek
- **Derived GIS Features**:
  - `distance_to_drain_m`: Euclidean distance from grid centroid to nearest major drain.
  - `drainage_density`: Total drainage length per square kilometer in grid.
  - `distance_to_coast_m`: Proximity to coastal tidal outfalls (affecting gravity drainage during high tide).

### D. Digital Elevation Model (`DS-04`)
- **Source**: Copernicus Global GLO-30 DEM & NASA SRTM 30m.
- **Derived Topographic Features**:
  - `elevation_m`: Mean surface elevation relative to mean sea level.
  - `slope_deg`: Topographic slope gradient.
  - `low_lying_score`: Relative topographic position index identifying natural depressions (e.g. Hindmata, Sion, Kurla).

### E. Historical Flood Events & Chronic Hotspots (`DS-05`)
- **Source**: BMC Official List of 386 Chronic Waterlogging Hotspots and monsoon disaster reports (2018–2025).
- **Benchmark Chronic Spots**:
  1. Hindmata Junction (Dadar) — low-lying saucer basin
  2. Gandhi Market & King's Circle (Sion)
  3. Milan Subway (Santacruz) — depressed railway underpass
  4. Andheri Subway (Andheri) — depressed railway underpass
  5. Kurla Kamani & Kurla Station West (Mithi River backflow)
  6. Chunabhatti Railway Crossing
  7. Chembur Amar Mahal Junction
  8. Sakinaka 90 Feet Road
  9. Dahisar Subway
  10. Vidyavihar Subway
- **Use**: Generates ground-truth binary labels ($1 = \text{waterlogging event}$, $0 = \text{normal}$) for time-aware supervised learning.

### F. Road Network (`DS-06`)
- The current repository does **not** contain a connected Chennai road-edge graph or a Geofabrik road extract. It contains a small set of simplified route overlay polylines in `FloodService.get_road_segments()` and fixed safe-route candidate geometries.
- Those records have no per-vehicle access restrictions, road speed limits, or truck height/weight/width attributes. The Safe Route API therefore reports planning geometry and configured planning-speed ETAs; it does not claim street-level network routing.
- The reusable vehicle edge filter can apply explicit access tags once a connected road graph with those attributes is provided. Missing attributes never grant SUV flood tolerance or emergency access.

### G. Urban Built-up & Impervious Cover (`DS-07`)
- **Source**: ESA WorldCover 10m & Copernicus Global Land Cover.
- **Metric**: `built_up_ratio` (0.0 to 1.0) indicating surface imperviousness.

---

## 3. Transparency & Fallback Declaration
Where live telemetry feeds cannot be streamed due to firewall/credential restrictions during Phase 2 testing, a documented development fallback stream is configured in `backend/app/core/config.py`:
`USE_DEVELOPMENT_FALLBACK = True`.
All API responses and UI displays clearly annotate whether data originated from real-time endpoints or verified historical simulations.
