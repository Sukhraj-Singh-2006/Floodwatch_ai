/**
 * FloodWatch AI — EOC central data store (Chennai, GCC fixed geography).
 * Tries real FastAPI government feeds first; falls back to the isolated
 * deterministic simulation dataset and flags SIMULATION mode in the UI.
 */
import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, forkJoin, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  DataMode,
  DrainageNode,
  EocIncident,
  FloodZone,
  HealthCheck,
  HorizonKey,
  MapLayerState,
  RadarCell,
  RainfallSample,
  RouteAdvisory,
  SafeRoutePlan,
  Shelter,
  StormArchiveEntry,
  TelemetrySnapshot,
  VehicleKind,
  Waterway,
} from '../models/eoc-models';
import {
  CHENNAI_CENTER,
  HORIZONS,
  SIM_ARCHIVE,
  SIM_DRAINAGE_LINKS,
  SIM_DRAINAGE_NODES,
  SIM_HEALTH,
  SIM_INCIDENTS,
  SIM_RAINFALL_SERIES,
  SIM_ROUTES,
  SIM_SHELTERS,
  SIM_TELEMETRY,
  SIM_ZONES,
  planSafeRoute,
} from '../data/eoc-simulation';
import { DrainageLink } from '../models/eoc-models';

export type EocView =
  | 'overview' | 'radar' | 'drainage' | 'flood'
  | 'routes' | 'alerts' | 'timeline' | 'reports' | 'health';

@Injectable({ providedIn: 'root' })
export class EocDataService {
  readonly center = CHENNAI_CENTER;
  readonly horizons = HORIZONS;

  // ---- data state ----
  readonly dataMode = signal<DataMode>('SIMULATION');
  readonly backendNote = signal<string>('Backend feed unavailable — showing DEMO SIMULATION.');
  readonly telemetry = signal<TelemetrySnapshot>(SIM_TELEMETRY);
  readonly rainfallSeries = signal<RainfallSample[]>(SIM_RAINFALL_SERIES);
  readonly zones = signal<FloodZone[]>(SIM_ZONES);
  readonly nodes = signal<DrainageNode[]>(SIM_DRAINAGE_NODES);
  readonly links = signal<DrainageLink[]>(SIM_DRAINAGE_LINKS);
  readonly incidents = signal<EocIncident[]>(SIM_INCIDENTS);
  readonly routes = signal<RouteAdvisory[]>(SIM_ROUTES);
  readonly shelters = signal<Shelter[]>(SIM_SHELTERS);
  readonly archive = signal<StormArchiveEntry[]>(SIM_ARCHIVE);
  readonly health = signal<HealthCheck[]>(SIM_HEALTH);
  readonly now = signal<Date>(new Date());

  // ---- observed live layers (populated when backend feeds answer) ----
  readonly radarCells = signal<RadarCell[]>([]);
  readonly waterways = signal<Waterway[]>([]);
  readonly rainLive = signal(false);
  readonly radarLive = signal(false);
  readonly drainLive = signal(false);
  readonly sysLive = signal(false);

  // ---- timeline state ----
  readonly horizonIndex = signal(0);
  readonly playing = signal(false);
  readonly speed = signal<1 | 2 | 5>(1);
  readonly horizon = computed<HorizonKey>(() => this.horizons[this.horizonIndex()]);

  // ---- map / selection state ----
  readonly layers = signal<MapLayerState>({
    base: 'standard', radar: true, rainfallIntensity: true, rainfallAccumulation: false,
    aiNowcast: true, floodDepth: true, floodRisk: true, predictedInundation: false,
    drainageNetwork: true, drainageNodes: true, criticalRoads: true,
    incidents: true, shelters: false, emergencyRoutes: false,
  });
  readonly activeView = signal<EocView>('overview');
  readonly selectedNodeId = signal<string | null>(null);
  readonly selectedIncidentId = signal<string | null>(null);
  readonly vehicle = signal<VehicleKind>('RESCUE');
  readonly safeRoute = signal<SafeRoutePlan | null>(null);
  readonly criticalAlert = signal<EocIncident | null>(SIM_INCIDENTS[2]);
  readonly criticalDismissed = signal(false);
  /** One-shot map camera request consumed by the map component. */
  readonly mapFocus = signal<{ lat: number; lng: number; zoom: number } | null>(null);
  requestMapFocus(lat: number, lng: number, zoom = 13): void {
    this.mapFocus.set({ lat, lng, zoom });
  }

  readonly selectedNode = computed(() =>
    this.nodes().find((n) => n.id === this.selectedNodeId()) ?? null);
  readonly acknowledgedIds = signal<Set<string>>(new Set());

  private timer: ReturnType<typeof setInterval> | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;

  constructor(private http: HttpClient) {
    this.clock = setInterval(() => this.now.set(new Date()), 1000);
    this.loadFeeds();
  }

  /** Attempt live feeds; any failure keeps deterministic simulation. */
  loadFeeds(): void {
    const base = `${environment.apiBaseUrl}/api/v1`;
    forkJoin({
      rain: this.http.get(`${base}/rainfall/current`).pipe(catchError(() => of(null))),
      radar: this.http.get(`${base}/rainfall/radar`).pipe(catchError(() => of(null))),
      surface: this.http.get<unknown[]>(`${base}/drainage/surface-waterways`).pipe(catchError(() => of(null))),
      underground: this.http.get<unknown[]>(`${base}/drainage/underground-drains`).pipe(catchError(() => of(null))),
      sys: this.http.get(`${base}/health/system-status`).pipe(catchError(() => of(null))),
      overview: this.http.get(`${base}/government/emergency-overview`).pipe(catchError(() => of(null))),
    }).subscribe((res) => {
      let live = false;
      if (res.rain && typeof res.rain === 'object') {
        this.applyLiveRainfall(res.rain as Record<string, unknown>);
        live = true;
      }
      if (res.radar && typeof res.radar === 'object') {
        this.applyLiveRadar(res.radar as Record<string, unknown>);
        live = true;
      }
      const ways: Waterway[] = [];
      for (const src of [res.surface, res.underground]) {
        if (Array.isArray(src)) {
          for (const w of src as Record<string, unknown>[]) {
            const coords = w['coordinates'];
            if (w['id'] && Array.isArray(coords)) {
              ways.push({
                id: String(w['id']), name: String(w['name'] ?? w['id']),
                type: String(w['type'] ?? ''), coordinates: coords as Array<[number, number]>,
                basin: typeof w['basin'] === 'string' ? w['basin'] : undefined,
                source: String(w['source'] ?? 'GCC GIS'),
              });
            }
          }
        }
      }
      if (ways.length) {
        this.waterways.set(ways);
        this.drainLive.set(true);
        live = true;
      }
      if (res.sys && typeof res.sys === 'object') {
        this.applyLiveHealth(res.sys as Record<string, Record<string, string>>);
      }
      if (res.overview && typeof res.overview === 'object') {
        this.applyLiveOverview(res.overview as Record<string, unknown>);
      }
      if (live) {
        this.dataMode.set('LIVE');
        this.backendNote.set('Regional rainfall and soil-moisture estimates live · forecast horizons, surcharge & incidents simulated.');
      } else {
        this.dataMode.set('SIMULATION');
        this.backendNote.set('Backend feed unavailable — showing DEMO SIMULATION.');
      }
    });
  }

  private applyLiveRainfall(r: Record<string, unknown>): void {
    if (typeof r['value'] !== 'number') return;
    this.rainLive.set(true);
    this.telemetry.update((t) => ({
      ...t,
      radarNowcastMmh: r['value'] as number,
      soilSaturationPct: typeof r['soil_saturation_pct'] === 'number'
        ? r['soil_saturation_pct']
        : t.soilSaturationPct,
      generatedAt: new Date().toISOString(),
    }));
  }

  private applyLiveRadar(r: Record<string, unknown>): void {
    const cells = r['cells'];
    if (!Array.isArray(cells) || !cells.length) return;
    const parsed: RadarCell[] = [];
    for (const c of cells as Record<string, unknown>[]) {
      const center = c['center'];
      if (Array.isArray(center) && typeof c['intensity_mm_per_hr'] === 'number') {
        parsed.push({
          center: [Number(center[0]), Number(center[1])],
          radiusMeters: Number(c['radius_meters'] ?? 3000),
          intensityMmh: c['intensity_mm_per_hr'] as number,
          colorHex: String(c['color_hex'] ?? '#f59e0b'),
          label: String(c['label'] ?? 'Radar cell'),
          source: String(c['source'] ?? 'IMD'),
        });
      }
    }
    if (parsed.length) {
      this.radarCells.set(parsed);
      this.radarLive.set(true);
    }
  }

  private applyLiveHealth(sys: Record<string, Record<string, string>>): void {
    const checks: HealthCheck[] = [];
    const mapStatus = (s: string) =>
      /READY|CONNECTED|OPERATIONAL/.test(s) ? 'ONLINE' as const
      : /AWAITING|DEGRADED/.test(s) ? 'DEGRADED' as const : 'OFFLINE' as const;
    for (const [key, v] of Object.entries(sys)) {
      if (!v || typeof v !== 'object') continue;
      checks.push({
        id: key,
        label: String(v['name'] ?? key),
        status: mapStatus(String(v['status'] ?? '')),
        detail: `${String(v['status'] ?? '')} · ${String(v['details'] ?? '')}`,
      });
    }
    if (checks.length) {
      checks.push({ id: 'api', label: 'FastAPI Backend', status: 'ONLINE', detail: 'EOC feeds reachable' });
      this.health.set(checks);
      this.sysLive.set(true);
    }
  }

  private applyLiveOverview(o: Record<string, unknown>): void {
    try {
      const t = this.telemetry();
      const num = (v: unknown, fb: number) => (typeof v === 'number' ? v : fb);
      this.telemetry.set({
        ...t,
        activeIncidents: num(o['active_alerts_count'], t.activeIncidents),
        catchmentRiskIndex: num(o['catchment_risk_index'], t.catchmentRiskIndex),
        generatedAt: new Date().toISOString(),
      });
      this.dataMode.set('LIVE');
      this.backendNote.set('Connected to GCC EOC live feeds.');
    } catch {
      this.dataMode.set('SIMULATION');
    }
  }

  // ---- timeline controls ----
  setHorizon(i: number): void {
    this.horizonIndex.set(Math.max(0, Math.min(this.horizons.length - 1, i)));
  }
  togglePlay(): void {
    this.playing() ? this.pause() : this.play();
  }
  play(): void {
    if (this.timer) return;
    this.playing.set(true);
    const stepMs = this.speed() === 5 ? 400 : this.speed() === 2 ? 1000 : 2000;
    this.timer = setInterval(() => {
      const next = this.horizonIndex() + 1;
      if (next >= this.horizons.length) { this.pause(); return; }
      this.horizonIndex.set(next);
    }, stepMs);
  }
  pause(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.playing.set(false);
  }
  setSpeed(s: 1 | 2 | 5): void {
    const was = this.playing();
    this.pause();
    this.speed.set(s);
    if (was) this.play();
  }

  // ---- selection / actions ----
  setLayer<K extends keyof MapLayerState>(key: K, value: MapLayerState[K]): void {
    this.layers.update((l) => ({ ...l, [key]: value }));
  }
  selectNode(id: string | null): void { this.selectedNodeId.set(id); }
  selectIncident(id: string | null): void { this.selectedIncidentId.set(id); }
  acknowledgeIncident(id: string): void {
    this.acknowledgedIds.update((s) => new Set(s).add(id));
    this.incidents.update((list) =>
      list.map((i) => (i.id === id ? { ...i, status: 'ACKNOWLEDGED' } : i)));
    if (this.criticalAlert()?.id === id) this.criticalAlert.set(null);
  }
  dismissCritical(): void { this.criticalDismissed.set(true); this.criticalAlert.set(null); }
  generateSafeRoute(): void {
    this.safeRoute.set(planSafeRoute(this.vehicle()));
    this.setLayer('emergencyRoutes', true);
  }

  /** Slice helpers for the active horizon. */
  zoneSlice(z: FloodZone): FloodZone['series'][number] {
    return z.series[this.horizonIndex()] ?? z.series[0];
  }
  nodeSlice(n: DrainageNode): DrainageNode['series'][number] {
    return n.series[this.horizonIndex()] ?? n.series[0];
  }
}
