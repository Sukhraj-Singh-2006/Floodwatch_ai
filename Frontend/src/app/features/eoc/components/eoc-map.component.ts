import { Component, ElementRef, Input, ViewChild, effect, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import { EocDataService } from '../services/eoc-data.service';
import { FloodZone, Severity } from '../models/eoc-models';

const RISK_COLORS: Record<string, string> = {
  SAFE: '#34d399', LOW: '#22d3ee', CAUTION: '#fbbf24', MEDIUM: '#fbbf24',
  HIGH: '#fb923c', WARNING: '#f59e0b', CRITICAL: '#f87171', SEVERE: '#ef4444',
};

function depthColor(cm: number): string {
  if (cm < 10) return '#22d3ee';
  if (cm < 25) return '#facc15';
  if (cm < 45) return '#fb923c';
  if (cm < 60) return '#ef4444';
  return '#a855f7';
}

const BASE_TILES = {
  standard: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  terrain: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
};

@Component({
  selector: 'app-eoc-map',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="map-wrap">
      <div #mapEl class="eoc-map"></div>

      <!-- Floating risk panel -->
      <div class="risk-panel">
        <span class="rp-title">CHENNAI FLOOD RISK</span>
        <span class="rp-sub">Real-time Catchment Risk Index</span>
        <div class="rp-score"><strong>{{ riskIndex() }}</strong><span>/ 100</span></div>
        <span class="rp-status" [style.color]="riskColor()">{{ riskLabel() }}</span>
        <div class="rp-grid">
          <div><em>Peak Rainfall</em><b>{{ tele().peakNowcastMmh.toFixed(1) }} mm/h</b></div>
          <div><em>Catchment Load</em><b>{{ tele().catchmentLoadPct }}%</b></div>
          <div><em>Soil Saturation</em><b>{{ tele().soilSaturationPct }}%</b></div>
          <div><em>Surcharge Nodes</em><b>{{ tele().surchargeNodes }} / {{ tele().totalNodes }}</b></div>
          <div><em>Predicted Peak</em><b>{{ tele().predictedPeakAt }}</b></div>
          <div><em>Horizon</em><b>{{ store.horizon() }}</b></div>
        </div>
        <span class="rp-chart-title">RAINFALL NOWCAST PROFILE</span>
        <svg viewBox="0 0 260 96" class="rp-chart" role="img" aria-label="Rainfall nowcast chart">
          <line x1="0" y1="88" x2="260" y2="88" stroke="#334155" stroke-width="1"/>
          <polyline [attr.points]="observedPoints()" fill="none" stroke="#22d3ee" stroke-width="2.5"/>
          <polyline [attr.points]="predictedPoints()" fill="none" stroke="#fbbf24" stroke-width="2" stroke-dasharray="5 4"/>
          @for (t of chartTicks(); track t.x) {
            <circle [attr.cx]="t.x" [attr.cy]="t.y" r="3" [attr.fill]="t.obs ? '#22d3ee' : '#fbbf24'"/>
          }
        </svg>
        <div class="rp-legend"><span><i class="sw obs"></i>Observed</span><span><i class="sw pred"></i>AI predicted</span></div>
      </div>

      <!-- Layer control -->
      <div class="layer-ctrl">
        <strong>MAP LAYERS</strong>
        <span class="lc-group">BASE MAP</span>
        @for (b of baseOptions; track b) {
          <label class="lc-row"><input type="radio" name="eoc-base" [checked]="store.layers().base === b" (change)="store.setLayer('base', b)"/>{{ b | titlecase }}</label>
        }
        <span class="lc-group">WEATHER</span>
        @for (l of weatherLayers; track l.key) {
          <label class="lc-row"><input type="checkbox" [checked]="store.layers()[l.key]" (change)="store.setLayer(l.key, !store.layers()[l.key])"/>{{ l.label }}</label>
        }
        <span class="lc-group">FLOOD</span>
        @for (l of floodLayers; track l.key) {
          <label class="lc-row"><input type="checkbox" [checked]="store.layers()[l.key]" (change)="store.setLayer(l.key, !store.layers()[l.key])"/>{{ l.label }}</label>
        }
        <span class="lc-group">INFRASTRUCTURE</span>
        @for (l of infraLayers; track l.key) {
          <label class="lc-row"><input type="checkbox" [checked]="store.layers()[l.key]" (change)="store.setLayer(l.key, !store.layers()[l.key])"/>{{ l.label }}</label>
        }
        <span class="lc-group">EMERGENCY</span>
        @for (l of emergLayers; track l.key) {
          <label class="lc-row"><input type="checkbox" [checked]="store.layers()[l.key]" (change)="store.setLayer(l.key, !store.layers()[l.key])"/>{{ l.label }}</label>
        }
      </div>

      <!-- Propagation timeline -->
      <div class="timeline">
        <button type="button" class="tl-btn" (click)="store.togglePlay()" [title]="store.playing() ? 'Pause' : 'Play'">
          {{ store.playing() ? '❚❚' : '▶' }}
        </button>
        @for (sp of [1, 2, 5]; track sp) {
          <button type="button" class="tl-speed" [class.on]="store.speed() === sp" (click)="store.setSpeed(sp === 1 ? 1 : sp === 2 ? 2 : 5)">{{ sp }}×</button>
        }
        <div class="tl-steps">
          @for (h of store.horizons; track h; let i = $index) {
            <button type="button" class="tl-step" [class.on]="store.horizonIndex() === i" (click)="store.setHorizon(i)">
              <b>{{ h }}</b><span>{{ horizonState(i) }}</span>
            </button>
          }
        </div>
        <span class="tl-state">{{ worstState() }}</span>
      </div>

      <!-- Critical alert overlay -->
      @if (store.criticalAlert(); as ca) {
        <div class="crit-card">
          <span class="crit-tag">CRITICAL ALERT · {{ store.dataMode() }}</span>
          <strong>{{ ca.location }}</strong>
          <span class="crit-sub">COMBINED TIDAL + PLUVIAL INUNDATION</span>
          <div class="crit-meta">Predicted depth <b>{{ ca.waterDepthCm }} cm</b> · Expected <b>{{ ca.expectedAt }}</b></div>
          <p>Restrict access and dispatch field verification.</p>
          <div class="crit-actions">
            <button type="button" class="btn-ack" (click)="store.acknowledgeIncident(ca.id)">ACKNOWLEDGE</button>
            <button type="button" class="btn-loc" (click)="flyToIncident(ca.id)">VIEW LOCATION</button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .map-wrap { position: relative; flex: 1; min-height: 560px; border-radius: 12px; overflow: hidden; border: 1px solid rgba(56,189,248,0.2); background: #050b18; }
    .eoc-map { position: absolute; inset: 0; z-index: 1; }
    .risk-panel {
      position: absolute; top: 12px; right: 12px; z-index: 500; width: 264px;
      background: rgba(7,13,29,0.92); border: 1px solid rgba(248,113,113,0.35); border-radius: 10px;
      padding: 0.8rem 0.9rem; display: flex; flex-direction: column; gap: 0.3rem; backdrop-filter: blur(10px);
      box-shadow: 0 0 24px rgba(239,68,68,0.15);
    }
    .rp-title { font-size: 0.62rem; font-weight: 800; letter-spacing: 0.16em; color: #f1f5f9; }
    .rp-sub { font-size: 0.62rem; color: #64748b; }
    .rp-score { display: flex; align-items: baseline; gap: 0.3rem; }
    .rp-score strong { font-size: 2rem; color: #f87171; font-family: ui-monospace, monospace; line-height: 1; }
    .rp-score span { color: #64748b; font-size: 0.8rem; }
    .rp-status { font-size: 0.68rem; font-weight: 800; letter-spacing: 0.12em; }
    .rp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.35rem 0.6rem; margin-top: 0.3rem; }
    .rp-grid div { display: flex; flex-direction: column; }
    .rp-grid em { font-style: normal; font-size: 0.56rem; letter-spacing: 0.08em; color: #64748b; text-transform: uppercase; }
    .rp-grid b { font-size: 0.74rem; color: #e2e8f0; font-family: ui-monospace, monospace; }
    .rp-chart-title { font-size: 0.58rem; font-weight: 800; letter-spacing: 0.14em; color: #94a3b8; margin-top: 0.5rem; }
    .rp-chart { width: 100%; height: 86px; background: rgba(2,6,16,0.6); border-radius: 6px; }
    .rp-legend { display: flex; gap: 0.8rem; font-size: 0.6rem; color: #94a3b8; }
    .sw { display: inline-block; width: 14px; height: 3px; margin-right: 4px; vertical-align: middle; }
    .sw.obs { background: #22d3ee; } .sw.pred { background: repeating-linear-gradient(90deg, #fbbf24 0 3px, transparent 3px 6px); }
    .layer-ctrl {
      position: absolute; top: 12px; left: 12px; z-index: 500; width: 196px; max-height: calc(100% - 110px); overflow-y: auto;
      background: rgba(7,13,29,0.92); border: 1px solid rgba(56,189,248,0.25); border-radius: 10px;
      padding: 0.7rem 0.8rem; display: flex; flex-direction: column; gap: 0.15rem; backdrop-filter: blur(10px);
    }
    .layer-ctrl strong { font-size: 0.6rem; letter-spacing: 0.16em; color: #e2e8f0; }
    .lc-group { font-size: 0.56rem; font-weight: 800; letter-spacing: 0.14em; color: #38bdf8; margin-top: 0.45rem; }
    .lc-row { display: flex; align-items: center; gap: 0.45rem; font-size: 0.68rem; color: #cbd5e1; cursor: pointer; padding: 0.1rem 0; }
    .lc-row input { accent-color: #0ea5e9; }
    .timeline {
      position: absolute; left: 12px; right: 12px; bottom: 12px; z-index: 500;
      display: flex; align-items: center; gap: 0.5rem;
      background: rgba(7,13,29,0.92); border: 1px solid rgba(56,189,248,0.25); border-radius: 10px;
      padding: 0.55rem 0.8rem; backdrop-filter: blur(10px);
    }
    .tl-btn { width: 34px; height: 34px; border-radius: 50%; border: 1px solid #0ea5e9; background: rgba(14,165,233,0.15); color: #fff; cursor: pointer; flex: none; }
    .tl-speed { border: 1px solid #334155; background: transparent; color: #94a3b8; border-radius: 6px; font-size: 0.64rem; padding: 0.25rem 0.45rem; cursor: pointer; }
    .tl-speed.on { color: #22d3ee; border-color: #0ea5e9; }
    .tl-steps { display: flex; gap: 0.35rem; flex: 1; }
    .tl-step { flex: 1; background: rgba(148,163,184,0.06); border: 1px solid rgba(148,163,184,0.2); border-radius: 7px; padding: 0.25rem 0.2rem; cursor: pointer; display: flex; flex-direction: column; align-items: center; color: #94a3b8; }
    .tl-step b { font-size: 0.62rem; }
    .tl-step span { font-size: 0.54rem; letter-spacing: 0.06em; }
    .tl-step.on { border-color: #f59e0b; color: #fde68a; background: rgba(245,158,11,0.1); }
    .tl-state { font-size: 0.62rem; font-weight: 800; letter-spacing: 0.12em; color: #f87171; white-space: nowrap; }
    .crit-card {
      position: absolute; right: 12px; bottom: 86px; z-index: 600; width: 300px;
      background: rgba(20,8,10,0.95); border: 1px solid rgba(239,68,68,0.6); border-radius: 10px;
      padding: 0.85rem 1rem; display: flex; flex-direction: column; gap: 0.3rem;
      animation: critPulse 2.4s ease-in-out infinite;
    }
    @keyframes critPulse { 50% { box-shadow: 0 0 26px rgba(239,68,68,0.4); } }
    .crit-tag { font-size: 0.58rem; font-weight: 800; letter-spacing: 0.14em; color: #f87171; }
    .crit-card strong { font-size: 0.9rem; color: #fff; }
    .crit-sub { font-size: 0.6rem; letter-spacing: 0.1em; color: #fca5a5; font-weight: 700; }
    .crit-meta { font-size: 0.7rem; color: #e2e8f0; }
    .crit-meta b { color: #fff; }
    .crit-card p { font-size: 0.7rem; color: #cbd5e1; margin: 0; }
    .crit-actions { display: flex; gap: 0.5rem; margin-top: 0.3rem; }
    .btn-ack { flex: 1; background: #dc2626; color: #fff; border: none; border-radius: 7px; padding: 0.5rem; font-size: 0.66rem; font-weight: 800; cursor: pointer; }
    .btn-loc { flex: 1; background: transparent; color: #fca5a5; border: 1px solid rgba(239,68,68,0.5); border-radius: 7px; padding: 0.5rem; font-size: 0.66rem; font-weight: 800; cursor: pointer; }
    @media (max-width: 900px) {
      .risk-panel { display: none; }
      .layer-ctrl { width: 160px; }
      .tl-state { display: none; }
    }
  `]
})
export class EocMapComponent implements OnInit, OnDestroy {
  @Input() focus: 'overview' | 'radar' | 'flood' = 'overview';
  @ViewChild('mapEl') mapEl!: ElementRef<HTMLDivElement>;
  readonly store = inject(EocDataService);

  private map?: L.Map;
  private baseLayer?: L.TileLayer;
  private groups: Record<string, L.LayerGroup> = {};
  private sweepMarker?: L.Marker;
  private sweepAngle = 0;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  readonly baseOptions: Array<'standard' | 'satellite' | 'terrain'> = ['standard', 'satellite', 'terrain'];
  readonly weatherLayers = [
    { key: 'radar' as const, label: 'Doppler Radar' },
    { key: 'rainfallIntensity' as const, label: 'Rainfall Intensity' },
    { key: 'rainfallAccumulation' as const, label: 'Rainfall Accumulation' },
    { key: 'aiNowcast' as const, label: 'AI Rainfall Nowcast' },
  ];
  readonly floodLayers = [
    { key: 'floodDepth' as const, label: 'Flood Depth' },
    { key: 'floodRisk' as const, label: 'Flood Risk' },
    { key: 'predictedInundation' as const, label: 'Predicted Inundation' },
  ];
  readonly infraLayers = [
    { key: 'drainageNetwork' as const, label: 'Drainage Network' },
    { key: 'drainageNodes' as const, label: 'Drainage Nodes' },
    { key: 'criticalRoads' as const, label: 'Critical Roads' },
  ];
  readonly emergLayers = [
    { key: 'incidents' as const, label: 'Incidents' },
    { key: 'shelters' as const, label: 'Shelters' },
    { key: 'emergencyRoutes' as const, label: 'Emergency Routes' },
  ];

  constructor() {
    effect(() => {
      // Track reactive deps; render imperatively.
      this.store.horizonIndex();
      this.store.layers();
      this.store.safeRoute();
      this.store.selectedNodeId();
      this.store.incidents();
      this.store.radarCells();
      this.store.waterways();
      this.renderAll();
    });
    effect(() => {
      const f = this.store.mapFocus();
      if (f && this.map) {
        this.map.flyTo([f.lat, f.lng], f.zoom, { duration: 1.2 });
        this.store.mapFocus.set(null);
      }
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    if (this.focus === 'radar') {
      this.store.setLayer('floodDepth', false);
      this.store.setLayer('floodRisk', false);
      this.store.setLayer('radar', true);
      this.store.setLayer('rainfallIntensity', true);
      this.store.setLayer('aiNowcast', true);
    } else if (this.focus === 'flood') {
      this.store.setLayer('radar', false);
      this.store.setLayer('floodDepth', true);
      this.store.setLayer('floodRisk', true);
      this.store.setLayer('predictedInundation', true);
    }
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.initMap(), 60);
  }

  ngOnDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.map?.remove();
  }

  tele() { return this.store.telemetry(); }
  riskIndex() { return this.store.telemetry().catchmentRiskIndex; }
  riskColor() {
    const v = this.riskIndex();
    return v >= 85 ? '#f87171' : v >= 60 ? '#fb923c' : v >= 35 ? '#fbbf24' : '#34d399';
  }
  riskLabel() {
    const v = this.riskIndex();
    return v >= 85 ? 'CRITICAL INUNDATION' : v >= 60 ? 'SEVERE' : v >= 35 ? 'ELEVATED' : 'NOMINAL';
  }

  private chartXY() {
    const s = this.store.rainfallSeries();
    const max = Math.max(...s.map((d) => Math.max(d.observedMmh ?? 0, d.predictedMmh)), 100);
    return s.map((d, i) => ({
      x: 12 + (i * (236 / (s.length - 1))),
      yObs: d.observedMmh == null ? null : 88 - (d.observedMmh / max) * 76,
      yPred: 88 - (d.predictedMmh / max) * 76,
      obs: d.observedMmh != null,
    }));
  }
  observedPoints() {
    return this.chartXY().filter((p) => p.yObs != null).map((p) => `${p.x},${p.yObs}`).join(' ');
  }
  predictedPoints() {
    return this.chartXY().map((p) => `${p.x},${p.yPred}`).join(' ');
  }
  chartTicks() {
    return this.chartXY().map((p) => ({ x: p.x, y: p.obs ? p.yObs! : p.yPred, obs: p.obs }));
  }

  horizonState(i: number): string {
    let worst = 0;
    const order = ['CURRENT', 'RISING', 'PEAK', 'SEVERE FLOOD', 'RECEDING'];
    for (const z of this.store.zones()) {
      const st = z.series[i]?.state ?? 'CURRENT';
      worst = Math.max(worst, order.indexOf(st));
    }
    return order[worst];
  }
  worstState(): string {
    return this.horizonState(this.store.horizonIndex());
  }

  flyToIncident(id: string): void {
    const inc = this.store.incidents().find((i) => i.id === id);
    const zone = this.store.zones().find((z) => inc && z.zoneName.split(' ')[0] === inc.location.split(' ')[0]);
    const target = zone ?? this.store.zones()[0];
    this.map?.flyTo([target.lat, target.lng], 13, { duration: 1.2 });
    this.store.selectIncident(id);
  }

  private initMap(): void {
    if (!this.mapEl || this.map) return;
    this.map = L.map(this.mapEl.nativeElement, {
      center: [this.store.center.lat, this.store.center.lng],
      zoom: 11, zoomControl: false, attributionControl: true,
    });
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    for (const k of ['radar', 'rain', 'nowcast', 'depth', 'risk', 'inund', 'drain', 'nodes', 'roads', 'inc', 'shelter', 'evac', 'route']) {
      this.groups[k] = L.layerGroup().addTo(this.map);
    }
    this.startSweep();
    this.renderAll();
  }

  private renderAll(): void {
    if (!this.map) return;
    const L_ = this.store.layers();
    // base
    if (!this.baseLayer || (this.baseLayer as unknown as { _eocBase?: string })._eocBase !== L_.base) {
      if (this.baseLayer) this.map.removeLayer(this.baseLayer);
      this.baseLayer = L.tileLayer(BASE_TILES[L_.base], {
        maxZoom: 18,
        attribution: L_.base === 'standard'
          ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          : L_.base === 'satellite' ? 'Tiles &copy; Esri' : '&copy; OpenStreetMap contributors | Map style &copy; OpenTopoMap'
      });
      (this.baseLayer as unknown as { _eocBase?: string })._eocBase = L_.base;
      this.baseLayer.addTo(this.map);
      this.baseLayer.bringToBack();
    }
    this.renderRadar(L_);
    this.renderZones(L_);
    this.renderDrainage(L_);
    this.renderRoads(L_);
    this.renderIncidents(L_);
    this.renderSheltersEvac(L_);
  }

  private renderRadar(L_: ReturnType<EocDataService['layers']>): void {
    this.groups['radar'].clearLayers();
    this.groups['rain'].clearLayers();
    this.groups['nowcast'].clearLayers();
    const c: [number, number] = [this.store.center.lat, this.store.center.lng];
    if (L_.radar) {
      if (this.store.radarLive() && this.store.radarCells().length) {
        for (const cell of this.store.radarCells()) {
          this.groups['radar'].addLayer(L.circle(cell.center, {
            radius: cell.radiusMeters, color: cell.colorHex, weight: 1.5, opacity: 0.9,
            fillColor: cell.colorHex, fillOpacity: 0.32,
          }).bindTooltip(
            `<strong>OBSERVED</strong> · ${cell.label}<br/>${cell.intensityMmh} mm/h · ${cell.source}`,
            { sticky: true }));
        }
      } else {
        for (const r of [4500, 9000, 13500]) {
          this.groups['radar'].addLayer(L.circle(c, {
            radius: r, color: '#22d3ee', weight: 1, opacity: 0.35, fill: false, dashArray: '4 6',
          }));
        }
      }
    }
    if (L_.rainfallIntensity || L_.rainfallAccumulation) {
      const hi = this.store.horizonIndex();
      for (const z of this.store.zones()) {
        const s = z.series[hi] ?? z.series[0];
        const intensity = Math.min(1, s.rainfallMmh / 100);
        this.groups['rain'].addLayer(L.circle([z.lat, z.lng], {
          radius: 900 + intensity * 1600, color: 'transparent',
          fillColor: intensity > 0.75 ? '#ef4444' : intensity > 0.55 ? '#fb923c' : intensity > 0.35 ? '#facc15' : '#22d3ee',
          fillOpacity: L_.rainfallAccumulation ? 0.28 : 0.38, weight: 0,
        }));
      }
    }
    if (L_.aiNowcast) {
      for (const z of this.store.zones()) {
        const s = z.series[this.store.horizons.length - 1];
        if (s.riskScore >= 85) {
          this.groups['nowcast'].addLayer(L.circle([z.lat, z.lng], {
            radius: 2200, color: '#a855f7', weight: 1.5, dashArray: '6 5', fill: false, opacity: 0.8,
          }));
        }
      }
    }
  }

  private renderZones(L_: ReturnType<EocDataService['layers']>): void {
    for (const g of ['depth', 'risk', 'inund']) this.groups[g].clearLayers();
    const hi = this.store.horizonIndex();
    for (const z of this.store.zones()) {
      const s = z.series[hi] ?? z.series[0];
      if (L_.floodDepth) {
        this.groups['depth'].addLayer(L.circle([z.lat, z.lng], {
          radius: 700 + s.waterDepthCm * 38,
          color: depthColor(s.waterDepthCm), weight: 2, opacity: 0.9,
          fillColor: depthColor(s.waterDepthCm), fillOpacity: 0.32,
        }).bindTooltip(
          `<strong>${z.zoneName}</strong> (${z.ward})<br/>Depth <strong>${s.waterDepthCm} cm</strong> · ${s.riskLevel}<br/>Rain ${s.rainfallMmh} mm/h · ${this.store.horizon()}`,
          { sticky: true }));
      }
      if (L_.floodRisk) {
        const col = RISK_COLORS[s.riskLevel] ?? '#94a3b8';
        const d = 0.012;
        this.groups['risk'].addLayer(L.rectangle(
          [[z.lat - d, z.lng - d], [z.lat + d, z.lng + d]],
          { color: col, weight: 1.5, fillColor: col, fillOpacity: 0.22 }
        ).bindTooltip(`<strong>${z.zoneName}</strong><br/>Risk ${s.riskScore}/100 (${s.riskLevel})`, { sticky: true }));
      }
      if (L_.predictedInundation && s.riskScore >= 70) {
        const d = 0.02;
        this.groups['inund'].addLayer(L.rectangle(
          [[z.lat - d, z.lng - d], [z.lat + d, z.lng + d]],
          { color: '#a855f7', weight: 1, dashArray: '5 4', fillColor: '#a855f7', fillOpacity: 0.12 }
        ));
      }
    }
  }

  private renderDrainage(L_: ReturnType<EocDataService['layers']>): void {
    this.groups['drain'].clearLayers();
    this.groups['nodes'].clearLayers();
    if (L_.drainageNetwork) {
      if (this.store.drainLive() && this.store.waterways().length) {
        for (const w of this.store.waterways()) {
          const col = w.type === 'SURFACE_RIVER' ? '#38bdf8' : w.type === 'CANAL' ? '#2dd4bf' : '#94a3b8';
          this.groups['drain'].addLayer(L.polyline(w.coordinates, {
            color: col, weight: w.type === 'UNDERGROUND_SWD' ? 1.5 : 3, opacity: 0.9,
            dashArray: w.type === 'UNDERGROUND_SWD' ? '6 4' : undefined,
          }).bindTooltip(`<strong>${w.name}</strong><br/>${w.type}${w.basin ? ' · ' + w.basin : ''}<br/><em>Observed · ${w.source}</em>`, { sticky: true }));
        }
      } else {
        for (const link of this.store.links()) {
          const a = this.store.nodes().find((n) => n.id === link.from);
          const bad = a?.status === 'CRITICAL';
          this.groups['drain'].addLayer(L.polyline(link.path.map((p) => [p.lat, p.lng] as [number, number]), {
            color: bad ? '#f87171' : a?.status === 'WARNING' ? '#fbbf24' : '#38bdf8',
            weight: bad ? 3 : 2, opacity: 0.85,
          }).bindTooltip('Simulated link — illustrative only', { sticky: true }));
        }
      }
    }
    if (L_.drainageNodes) {
      for (const n of this.store.nodes()) {
        const s = this.store.nodeSlice(n);
        const col = s.status === 'CRITICAL' ? '#ef4444' : s.status === 'WARNING' ? '#f59e0b' : '#34d399';
        const m = L.circleMarker([n.lat, n.lng], {
          radius: 7, color: col, weight: 2, fillColor: col, fillOpacity: 0.5,
        }).bindTooltip(
          `<strong>${n.id}</strong> · ${n.nodeType}<br/>${n.name}<br/>Surcharge <strong>${s.surchargePct}%</strong> (${s.status})${n.isDemo ? '<br/><em>Demo node</em>' : ''}`,
          { sticky: true });
        m.on('click', () => this.store.selectNode(n.id));
        this.groups['nodes'].addLayer(m);
      }
    }
  }

  private renderRoads(L_: ReturnType<EocDataService['layers']>): void {
    this.groups['roads'].clearLayers();
    this.groups['route'].clearLayers();
    if (L_.criticalRoads) {
      for (const r of this.store.routes()) {
        const col = r.status === 'CLOSED' ? '#ef4444' : r.status === 'RESTRICTED' ? '#fb923c' : r.status === 'WARNING' ? '#facc15' : '#34d399';
        this.groups['roads'].addLayer(L.polyline(r.path.map((p) => [p.lat, p.lng] as [number, number]), {
          color: col, weight: 4, opacity: 0.9,
        }).bindTooltip(`<strong>${r.roadName}</strong><br/>${r.floodDepthCm} cm · ${r.status}<br/>${r.recommendedAction}`, { sticky: true }));
      }
    }
    const plan = this.store.safeRoute();
    if (plan && L_.emergencyRoutes) {
      this.groups['route'].addLayer(L.polyline(plan.path.map((p) => [p.lat, p.lng] as [number, number]), {
        color: '#22d3ee', weight: 4, dashArray: '10 8', opacity: 0.95,
      }).bindTooltip(`<strong>${plan.name}</strong><br/>${plan.distanceKm} km · ETA ${plan.etaMin} min · max depth ${plan.maxDepthCm} cm`, { sticky: true }));
    }
  }

  private renderIncidents(L_: ReturnType<EocDataService['layers']>): void {
    this.groups['inc'].clearLayers();
    if (!L_.incidents) return;
    for (const i of this.store.incidents()) {
      const zone = this.store.zones().find((z) => z.zoneName.split(' ')[0] === i.location.split(' ')[0]) ?? this.store.zones()[0];
      const col = i.severity === 'CRITICAL' ? '#ef4444' : i.severity === 'WARNING' ? '#f59e0b' : '#22d3ee';
      const m = L.circleMarker([zone.lat + 0.004, zone.lng + 0.004], {
        radius: 8, color: col, weight: 2, fillColor: '#0b1526', fillOpacity: 0.9,
      }).bindTooltip(`<strong>${i.id}</strong> · ${i.severity}<br/>${i.location}<br/>${i.description}`, { sticky: true });
      m.on('click', () => this.store.selectIncident(i.id));
      this.groups['inc'].addLayer(m);
    }
  }

  private renderSheltersEvac(L_: ReturnType<EocDataService['layers']>): void {
    this.groups['shelter'].clearLayers();
    this.groups['evac'].clearLayers();
    if (L_.shelters) {
      for (const s of this.store.shelters()) {
        this.groups['shelter'].addLayer(L.marker([s.lat, s.lng], {
          icon: L.divIcon({ className: '', html: `<div style="background:#0ea5e9;color:#fff;font-size:11px;width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;border:1px solid #7dd3fc;">H</div>`, iconSize: [22, 22] }),
        }).bindTooltip(`<strong>${s.name}</strong><br/>Occupancy ${s.occupied}/${s.capacity}`, { sticky: true }));
      }
    }
    if (L_.emergencyRoutes) {
      this.groups['evac'].addLayer(L.polyline(
        [[13.0067, 80.2206], [12.998, 80.21], [12.99, 80.193]],
        { color: '#34d399', weight: 3, dashArray: '4 6', opacity: 0.9 }
      ).bindTooltip('Designated evacuation route — Kathipara → Airport corridor', { sticky: true }));
    }
  }

  private startSweep(): void {
    if (!this.map || this.sweepTimer) return;
    const icon = L.divIcon({
      className: '',
      html: `<div id="eoc-sweep" style="width:120px;height:120px;border-radius:50%;background:conic-gradient(from 0deg, rgba(34,211,238,0.35), transparent 22%);border:1px solid rgba(34,211,238,0.35);"></div>`,
      iconSize: [120, 120],
    });
    this.sweepMarker = L.marker([this.store.center.lat, this.store.center.lng], { icon, interactive: false });
    this.sweepMarker.addTo(this.map);
    this.sweepTimer = setInterval(() => {
      this.sweepAngle = (this.sweepAngle + 24) % 360;
      const el = document.getElementById('eoc-sweep');
      if (el) el.style.background = `conic-gradient(from ${this.sweepAngle}deg, rgba(34,211,238,0.35), transparent 22%)`;
    }, 120);
  }
}
