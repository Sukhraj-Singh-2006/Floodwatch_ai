# Live rainfall integration

FloodWatch requests weather from Open-Meteo on the backend. Open-Meteo's free API does not need a key for non-commercial use. Provider timestamps are model timestamps with an explicit Chennai `+05:30` offset; `fetched_at` is an ISO 8601 UTC retrieval timestamp. Current values are model-based estimates, hourly values are forecasts, and the archived `Data/raw/Chennai rainfall.csv` remains a separate historical dataset.

## Geography

The default point is the existing `DEFAULT_LAT` / `DEFAULT_LON` Chennai reference (13.0827, 80.2707), labeled as a single-point estimate. The project contains no city boundary dataset in this path; the service uses the actual union of features in `Data/processed/grids/chennai_grid_500m.geojson` as its study-area footprint. Its CRS is `urn:ogc:def:crs:OGC:1.3:CRS84` (WGS84 longitude/latitude). Geometry bounds derived from that grid are longitude 80.095404–80.340025 and latitude 12.848014–13.251113. Runtime service metadata exposes the bounds, CRS, and source file. Any configured or selected coordinates outside the actual grid are rejected.

Set `WEATHER_MONITORING_LOCATIONS` to a JSON array to configure more points, for example `[{"id":"center","name":"Chennai center","latitude":13.0827,"longitude":80.2707}]`. Every point is validated against the grid before it can be queried. Without this setting, FloodWatch uses the existing Chennai reference point only. Open-Meteo values are point estimates; multiple points are not interpolated into a heatmap.

## Configuration

All settings are backend environment variables and can be changed without source edits:

| Variable | Default | Purpose |
| --- | --- | --- |
| `WEATHER_API_URL` | `https://api.open-meteo.com/v1/forecast` | Provider endpoint |
| `WEATHER_FORECAST_HOURS` | `48` | Requested hourly forecast horizon; Open-Meteo supports 1–384 hours |
| `WEATHER_REFRESH_INTERVAL_SECONDS` | `3600` | Central backend refresh interval (minimum effective interval is 60 seconds) |
| `WEATHER_HTTP_TIMEOUT_SECONDS` | `10` | Request timeout |
| `WEATHER_RETRY_COUNT` | `2` | Retries after the initial request, with exponential backoff / `Retry-After` handling |
| `WEATHER_RETRY_BACKOFF_SECONDS` | `0.5` | Initial retry backoff |
| `WEATHER_CACHE_TTL_SECONDS` | `3300` | Cache lifetime, slightly shorter than the one-hour refresh default |
| `WEATHER_MONITORING_LOCATIONS` | `[]` | JSON array of configured monitoring points |
| `WEATHER_STUDY_AREA_GEOJSON` | `Data/processed/grids/chennai_grid_500m.geojson` | Project footprint used to validate points |
| `WEATHER_HISTORICAL_RAINFALL_CSV` | `Data/raw/Chennai rainfall.csv` | Existing archived observations, kept separate from live data |

The 48-hour default is a configurable near-term display horizon, not a claim about forecast skill. The one-hour request cadence limits upstream calls and is appropriate for slowly updated numerical weather model runs; it does not mean the provider updates every hour. The timestamp on each hourly row is the provider's forecast-valid time. A refresh task runs once per backend process and populates the shared database/cache, so browser sessions do not each query Open-Meteo. Run one backend worker unless an external distributed scheduler/leader lock is configured.

`WEATHER_CACHE_TTL_SECONDS` must be positive and no greater than `WEATHER_REFRESH_INTERVAL_SECONDS`. On startup, FloodWatch restores the latest current record and stored forecast-valid hours from the database. A restored response is labeled `cached`; a failed refresh with a stored response is labeled `stale`, with original provider/retrieval timestamps and the failed-refresh timestamp retained. SQLite's existing indexed `DateTime` fields are stored as UTC-naive values for query compatibility; additive ISO string fields preserve explicit provider offsets and retrieval instants. Old rows are interpreted as Chennai-local for current timestamps and UTC for forecast timestamps, matching the earlier writer's behavior.

## API

All endpoints are under `/api/v1/rainfall`:

- `GET /current?location_id=...` — current model estimate, including precipitation amount for the preceding provider hour, temperature, humidity, wind, provider timestamp, retrieval timestamp, freshness/cache state, and classified refresh failure details.
- `GET /hourly?location_id=...` (also `/forecast`) — available forecast-valid hourly periods, probability, weather variables, and cache/error state.
- `GET /history?category=current_estimate|forecast|historical&limit=168` — stored API snapshots or a separate read of the original historical CSV.
- `GET /status?location_id=...` — connection, cache availability/freshness, last successful retrieval, last failed refresh, classified failure type, and available forecast hours.
- `GET /locations` — configured points and derived study-area bounds / CRS.
- `GET /radar` — compatibility endpoint returns only the selected point and explicitly reports that spatial distribution is unavailable.
- `GET /telemetry-details` — compatibility dashboard endpoint; no fabricated AWS stations or soil values.

Observations and forecasts persist to `weather_observations`, unique by provider, location, category, and provider timestamp. The database retains current estimates and forecasts as separate categories. Historical source files are read-only and are not copied over or modified.

## Flood model compatibility

The existing XGBoost model is documented as an offline daily-scale, 500 m susceptibility baseline. It requires daily rainfall and multi-day cumulative rainfall features on the model's spatial grid. Open-Meteo current/hourly values are point estimates and do not supply those spatial daily accumulations, so they are not adapted into the model. Baseline inference uses the latest archived daily feature rows and marks that feature date/source in output. Future flood forecasts remain unavailable from this model. Soil moisture, pressure, radar reflectivity, and gauge network outputs are not inferred where no connected source exists.
