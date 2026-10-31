# Safe Route vehicle behavior

The Safe Route request includes `vehicle_type` (`car`, `suv`, `truck`, or `rescue`). The backend normalizes and validates it.

## Current project data limits

The repository does not include a connected Chennai road-edge graph. The current route API uses its existing candidate polylines, so vehicle types can legitimately receive the same path and distance. Distances are now computed from each returned polyline with great-circle segment lengths; they are not road-network edge lengths. The response marks these routes `isSimulated: true` and describes this limitation.

The existing road overlay records do not include vehicle access, bridge, height, weight, width, or speed-limit attributes. The API reports `vehicle_restrictions_available: false` and does not grant SUV flood tolerance or emergency access. `vehicle_routing.py` contains a Dijkstra edge filter for connected edge data and only removes an edge when explicit restriction metadata supports doing so.

## ETA assumptions

No road speed limits or live traffic speeds are present. ETA is calculated from computed polyline distance and configurable nominal planning speeds. These are planning assumptions, not observed speeds:

- `SAFE_ROUTE_SPEED_CAR_KMH` (default 30)
- `SAFE_ROUTE_SPEED_SUV_KMH` (default 30)
- `SAFE_ROUTE_SPEED_TRUCK_KMH` (default 22)
- `SAFE_ROUTE_SPEED_RESCUE_KMH` (default 35)
- `SAFE_ROUTE_VEHICLE_DIMENSIONS` (default `{}`; optional operator fleet dimensions, e.g. `{"truck":{"height_m":4.0,"weight_t":18,"width_m":2.5}}`)

Set these environment variables to override the estimates. Road `maxheight`, `maxweight`, and `maxwidth` limits are evaluated only when compatible vehicle dimensions are explicitly configured (meters, tonnes, meters). Provide actual road speed and vehicle fleet data before treating ETAs or dimensional restrictions as operational guidance.
