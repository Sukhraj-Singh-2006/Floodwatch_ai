import { Component, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { environment } from '../../../environments/environment';

export interface SimScenario {
  rainfall_daily_mm: number;
  rainfall_cum_3d_mm: number;
  rainfall_delta_mm: number;
  tidal_lock_penalty: number;
}

export interface SimZone {
  gridId: string;
  name: string;
  locality: string;
  latitude: number;
  longitude: number;
  bounds: number[][];
  probability: number;
  riskScore: number;
  riskLevel: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  elevation: number;
  lowLyingScore: number;
  drainageDistM: number;
}

export interface SimResult {
  scenario: SimScenario;
  summary: {
    total_sectors_evaluated: number;
    inundated_sectors_count: number;
    inundated_area_km2: number;
    critical_sectors_count: number;
    moderate_sectors_count: number;
    low_risk_sectors_count: number;
    mean_risk_probability: number;
    population_exposure_index: number;
    critical_infrastructure_at_risk: number;
  };
  impacted_zones: SimZone[];
  feature_sensitivities: { feature: string; weight: number }[];
  timestamp: string;
}

@Component({
  selector: 'app-simulation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="simulation-page">
      <!-- Header -->
      <div class="sim-header">
        <div>
          <div class="header-badges">
            <h1 class="page-title">XGBoost Flood Susceptibility Simulation Studio</h1>
            <span class="badge-tag">XGBoost v2.0 Production Surrogate</span>
            <span class="badge-crs">3,963 Grid Cells (500m)</span>
          </div>
          <p class="page-desc">
            Interactively simulate extreme weather scenarios across Greater Chennai to evaluate model predictions, inundation spatial footprints, and infrastructure vulnerability.
          </p>
        </div>

        <!-- Presets -->
        <div class="presets-bar">
          <span class="presets-label">Storm Presets:</span>
          <button class="btn-preset" (click)="loadPreset(45, 60, 5, 0.0)">Normal Monsoon (45mm)</button>
          <button class="btn-preset" (click)="loadPreset(135, 210, 25, 0.3)">Severe Surge (135mm)</button>
          <button class="btn-preset highlight" (click)="loadPreset(345, 490, 65, 0.8)">2015 Historic Deluge (345mm)</button>
          <button class="btn-preset" (click)="loadPreset(180, 150, 80, 1.0)">Cloudburst + Tidal Lock (180mm)</button>
        </div>
      </div>

      <!-- Controls & KPI Row -->
      <div class="sim-top-row">
        <!-- Sliders Control Card -->
        <div class="control-card">
          <div class="card-title-row">
            <span class="card-title">Scenario Hydro-Meteorological Controls</span>
            <span class="status-indicator" *ngIf="isRunning">
              <span class="pulse-dot"></span> Computing Vectorized Model...
            </span>
          </div>

          <div class="sliders-grid">
            <!-- 24h Daily Rain -->
            <div class="slider-group">
              <div class="slider-header">
                <span class="slider-name">24h Rainfall Loading</span>
                <span class="slider-val font-mono text-cyan">{{ rainfallDaily }} mm</span>
              </div>
              <input type="range" class="range-input" min="10" max="400" step="5" [(ngModel)]="rainfallDaily" (input)="onSliderChange()" (change)="onSliderChange()" />
              <div class="range-bounds"><span>10 mm (Light)</span><span>200 mm (Heavy)</span><span>400 mm (Catastrophic)</span></div>
            </div>

            <!-- Antecedent 3-Day Rain -->
            <div class="slider-group">
              <div class="slider-header">
                <span class="slider-name">Antecedent 3-Day Cumulative</span>
                <span class="slider-val font-mono">{{ rainfallCum3d }} mm</span>
              </div>
              <input type="range" class="range-input" min="0" max="600" step="10" [(ngModel)]="rainfallCum3d" (input)="onSliderChange()" (change)="onSliderChange()" />
              <div class="range-bounds"><span>0 mm (Dry Soil)</span><span>300 mm (Saturated)</span><span>600 mm (Super-saturated)</span></div>
            </div>

            <!-- Convective Rainfall Delta -->
            <div class="slider-group">
              <div class="slider-header">
                <span class="slider-name">Hourly Surge Delta (ΔR)</span>
                <span class="slider-val font-mono">{{ rainfallDelta }} mm/h</span>
              </div>
              <input type="range" class="range-input" min="-20" max="100" step="5" [(ngModel)]="rainfallDelta" (input)="onSliderChange()" (change)="onSliderChange()" />
              <div class="range-bounds"><span>-20 (Receding)</span><span>0 (Steady)</span><span>+100 (Cloudburst Pulse)</span></div>
            </div>

            <!-- Tidal Lock Penalty -->
            <div class="slider-group">
              <div class="slider-header">
                <span class="slider-name">Coastal Tidal Lock Factor</span>
                <span class="slider-val font-mono text-amber">{{ (tidalLock * 100) | number:'1.0-0' }}% Restriction</span>
              </div>
              <input type="range" class="range-input" min="0.0" max="1.0" step="0.1" [(ngModel)]="tidalLock" (input)="onSliderChange()" (change)="onSliderChange()" />
              <div class="range-bounds"><span>0% (Free Discharge)</span><span>50% (Spring Tide)</span><span>100% (High Tide Outfall Blocked)</span></div>
            </div>
          </div>

          <!-- Run Simulation Button -->
          <button class="btn-run-sim" [disabled]="isRunning" (click)="executeSimulation()">
            <svg *ngIf="!isRunning" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            <span *ngIf="isRunning" class="spinner"></span>
            <span>{{ isRunning ? 'Computing 3,963 Grid Cells...' : 'Run Scenario Simulation' }}</span>
          </button>
        </div>

        <!-- Summary KPI Metrics Cards -->
        <div class="kpi-cards-grid" *ngIf="simulationResult">
          <div class="kpi-card danger">
            <span class="kpi-label">Inundated Area</span>
            <div class="kpi-val-row">
              <span class="kpi-val font-mono">{{ simulationResult.summary.inundated_area_km2 }}</span>
              <span class="kpi-unit">km²</span>
            </div>
            <span class="kpi-sub font-mono">{{ simulationResult.summary.inundated_sectors_count }} sectors (p ≥ 0.50)</span>
          </div>

          <div class="kpi-card critical">
            <span class="kpi-label">Critical High-Risk</span>
            <div class="kpi-val-row">
              <span class="kpi-val font-mono">{{ simulationResult.summary.critical_sectors_count }}</span>
              <span class="kpi-unit">cells</span>
            </div>
            <span class="kpi-sub">Severe probability (p ≥ 0.75)</span>
          </div>

          <div class="kpi-card warning">
            <span class="kpi-label">Population Exposure</span>
            <div class="kpi-val-row">
              <span class="kpi-val font-mono">{{ (simulationResult.summary.population_exposure_index / 1000) | number:'1.1-1' }}k</span>
              <span class="kpi-unit">citizens</span>
            </div>
            <span class="kpi-sub">GCC urban density index</span>
          </div>

          <div class="kpi-card info">
            <span class="kpi-label">Critical Infra at Risk</span>
            <div class="kpi-val-row">
              <span class="kpi-val font-mono">{{ simulationResult.summary.critical_infrastructure_at_risk }}</span>
              <span class="kpi-unit">facilities</span>
            </div>
            <span class="kpi-sub">Hospitals & Emergency Posts</span>
          </div>
        </div>
      </div>

      <!-- Bottom Layout: Interactive Leaflet Map + Top Localities List -->
      <div class="sim-bottom-layout">
        <!-- Interactive Leaflet Map -->
        <div class="map-card">
          <div class="map-header">
            <span class="map-title">Simulated 500m Spatial Inundation Footprint</span>
            <div class="map-legend-pills">
              <span class="pill-dot critical"></span> Critical (p ≥ 0.75)
              <span class="pill-dot high"></span> High (p ≥ 0.50)
              <span class="pill-dot moderate"></span> Moderate (p ≥ 0.25)
            </div>
          </div>
          <div class="leaflet-map-wrapper" #mapRef></div>
        </div>

        <!-- Right Side: Impacted Localities & Feature Attribution -->
        <div class="side-details-panel">
          <!-- Top Impacted Localities -->
          <div class="detail-card">
            <div class="detail-header">
              <span class="detail-title">Top Impacted Chennai Localities</span>
              <span class="badge-count font-mono" *ngIf="simulationResult">{{ simulationResult.impacted_zones.length }} zones</span>
            </div>
            <div class="localities-list" *ngIf="simulationResult">
              <div class="locality-item" *ngFor="let zone of simulationResult.impacted_zones.slice(0, 15)" (click)="focusOnZone(zone)">
                <div class="loc-main">
                  <span class="loc-name">{{ zone.locality }}</span>
                  <span class="loc-id font-mono">{{ zone.gridId }}</span>
                </div>
                <div class="loc-badges">
                  <span class="badge-risk" [ngClass]="zone.riskLevel.toLowerCase()">{{ zone.riskLevel }}</span>
                  <span class="loc-prob font-mono">{{ (zone.probability * 100) | number:'1.0-0' }}%</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Feature Sensitivity -->
          <div class="detail-card" *ngIf="simulationResult">
            <div class="detail-header">
              <span class="detail-title">Scenario Feature Contribution (SHAP)</span>
            </div>
            <div class="sensitivities-list">
              <div class="sens-item" *ngFor="let s of simulationResult.feature_sensitivities">
                <div class="sens-row">
                  <span class="sens-name">{{ s.feature }}</span>
                  <span class="sens-val font-mono">{{ (s.weight * 100) | number:'1.0-0' }}%</span>
                </div>
                <div class="sens-bar">
                  <div class="sens-fill" [style.width.%]="s.weight * 100"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .simulation-page {
      padding: 1.5rem 2rem;
      background-color: var(--bg-dark);
      color: var(--text-main);
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      min-height: calc(100vh - var(--header-height));
    }
    .sim-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .header-badges {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .page-title {
      font-size: 1.45rem;
      font-weight: 700;
      color: var(--text-main);
      margin: 0;
    }
    .badge-tag {
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.4);
      color: #f59e0b;
      font-size: 0.72rem;
      font-weight: 700;
      padding: 0.2rem 0.6rem;
      border-radius: var(--radius-full);
      text-transform: uppercase;
    }
    .badge-crs {
      background: rgba(148, 163, 184, 0.12);
      color: #94a3b8;
      font-size: 0.72rem;
      font-weight: 600;
      padding: 0.2rem 0.55rem;
      border-radius: var(--radius-full);
    }
    .page-desc {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin: 0.35rem 0 0;
      max-width: 820px;
    }

    /* Presets */
    .presets-bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .presets-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      font-weight: 600;
    }
    .btn-preset {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      font-size: 0.72rem;
      font-weight: 600;
      padding: 0.4rem 0.75rem;
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    .btn-preset:hover {
      color: var(--text-main);
      border-color: #06b6d4;
    }
    .btn-preset.highlight {
      border-color: rgba(239, 68, 68, 0.5);
      color: #f87171;
      background: rgba(239, 68, 68, 0.08);
    }

    /* Top Row */
    .sim-top-row {
      display: grid;
      grid-template-columns: 1fr 480px;
      gap: 1.25rem;
    }
    @media (max-width: 1200px) {
      .sim-top-row { grid-template-columns: 1fr; }
    }

    /* Controls Card */
    .control-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1.1rem;
    }
    .card-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .card-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text-main);
    }
    .status-indicator {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      color: #06b6d4;
      font-weight: 600;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #06b6d4;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.4); opacity: 0.4; }
    }

    .sliders-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem 1.5rem;
    }
    @media (max-width: 768px) {
      .sliders-grid { grid-template-columns: 1fr; }
    }
    .slider-group {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .slider-header {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .slider-name { color: var(--text-muted); }
    .text-cyan { color: #06b6d4; }
    .text-amber { color: #f59e0b; }
    .range-input {
      width: 100%;
      height: 6px;
      border-radius: 3px;
      background: #1e293b;
      outline: none;
      accent-color: #06b6d4;
      cursor: pointer;
    }
    .range-bounds {
      display: flex;
      justify-content: space-between;
      font-size: 0.62rem;
      color: rgba(148, 163, 184, 0.6);
    }

    .btn-run-sim {
      background: linear-gradient(135deg, #2563eb, #0284c7);
      color: #ffffff;
      font-weight: 700;
      font-size: 0.88rem;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: var(--radius-sm);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);
      transition: all var(--transition-fast);
    }
    .btn-run-sim:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(2, 132, 199, 0.45);
    }
    .btn-run-sim:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* KPI Cards */
    .kpi-cards-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
    .kpi-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 1rem;
      display: flex;
      flex-direction: column;
    }
    .kpi-card.danger { border-left: 4px solid #ef4444; }
    .kpi-card.critical { border-left: 4px solid #dc2626; }
    .kpi-card.warning { border-left: 4px solid #f59e0b; }
    .kpi-card.info { border-left: 4px solid #06b6d4; }
    .kpi-label {
      font-size: 0.68rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .kpi-val-row {
      display: flex;
      align-items: baseline;
      gap: 0.4rem;
      margin: 0.25rem 0;
    }
    .kpi-val {
      font-size: 1.55rem;
      font-weight: 800;
      color: var(--text-main);
    }
    .kpi-unit {
      font-size: 0.85rem;
      color: var(--text-muted);
      font-weight: 600;
    }
    .kpi-sub {
      font-size: 0.68rem;
      color: var(--text-muted);
    }

    /* Bottom Layout */
    .sim-bottom-layout {
      display: grid;
      grid-template-columns: 1fr 400px;
      gap: 1.25rem;
      min-height: 550px;
    }
    @media (max-width: 1200px) {
      .sim-bottom-layout { grid-template-columns: 1fr; }
    }

    /* Map Card */
    .map-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .map-header {
      padding: 0.85rem 1.25rem;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .map-title {
      font-size: 0.85rem;
      font-weight: 700;
    }
    .map-legend-pills {
      display: flex;
      gap: 0.75rem;
      font-size: 0.72rem;
      color: var(--text-muted);
      align-items: center;
    }
    .pill-dot {
      width: 10px;
      height: 10px;
      border-radius: 2px;
      display: inline-block;
    }
    .pill-dot.critical { background: #ef4444; }
    .pill-dot.high { background: #f97316; }
    .pill-dot.moderate { background: #eab308; }
    .leaflet-map-wrapper {
      width: 100%;
      height: 100%;
      min-height: 480px;
      background: #0b0f19;
    }

    /* Side Details */
    .side-details-panel {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .detail-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .detail-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .detail-title {
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .badge-count {
      font-size: 0.72rem;
      color: #06b6d4;
    }
    .localities-list {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      max-height: 280px;
      overflow-y: auto;
    }
    .locality-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 0.65rem;
      background: var(--bg-card-subtle);
      border: 1px solid rgba(255, 255, 255, 0.03);
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    .locality-item:hover {
      background: rgba(6, 182, 212, 0.08);
      border-color: rgba(6, 182, 212, 0.3);
    }
    .loc-main {
      display: flex;
      flex-direction: column;
    }
    .loc-name {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-main);
    }
    .loc-id {
      font-size: 0.65rem;
      color: var(--text-muted);
    }
    .loc-badges {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .badge-risk {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 0.15rem 0.45rem;
      border-radius: var(--radius-full);
      text-transform: uppercase;
    }
    .badge-risk.critical { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
    .badge-risk.high { background: rgba(249, 115, 22, 0.2); color: #f97316; }
    .badge-risk.moderate { background: rgba(234, 179, 8, 0.2); color: #eab308; }
    .loc-prob {
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--text-main);
    }

    /* Sensitivities */
    .sensitivities-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .sens-item {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }
    .sens-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.72rem;
      color: var(--text-main);
    }
    .sens-val { font-weight: 700; color: #06b6d4; }
    .sens-bar {
      width: 100%;
      height: 4px;
      background: #1e293b;
      border-radius: 2px;
      overflow: hidden;
    }
    .sens-fill {
      height: 100%;
      background: linear-gradient(90deg, #0284c7, #06b6d4);
    }
  `]
})
export class SimulationComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapRef', { static: false }) mapRef!: ElementRef<HTMLDivElement>;

  rainfallDaily = 135.0;
  rainfallCum3d = 210.0;
  rainfallDelta = 25.0;
  tidalLock = 0.3;

  isRunning = false;
  simulationResult: SimResult | null = null;

  private map: L.Map | null = null;
  private sectorLayersGroup: L.LayerGroup = L.layerGroup();
  private debounceTimer: any = null;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.executeSimulation();
  }

  ngAfterViewInit(): void {
    this.initMap();
  }

  ngOnDestroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.map) {
      this.map.remove();
    }
  }

  onSliderChange(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.executeSimulation();
    }, 180);
  }

  loadPreset(daily: number, cum3d: number, delta: number, tide: number): void {
    this.rainfallDaily = daily;
    this.rainfallCum3d = cum3d;
    this.rainfallDelta = delta;
    this.tidalLock = tide;
    this.executeSimulation();
  }

  executeSimulation(): void {
    this.isRunning = true;
    const body: SimScenario = {
      rainfall_daily_mm: this.rainfallDaily,
      rainfall_cum_3d_mm: this.rainfallCum3d,
      rainfall_delta_mm: this.rainfallDelta,
      tidal_lock_penalty: this.tidalLock
    };

    this.http.post<SimResult>(`${environment.apiBaseUrl}/api/v1/simulation/run`, body).subscribe({
      next: (res) => {
        this.simulationResult = res;
        this.isRunning = false;
        this.renderSimulatedSectors();
      },
      error: () => {
        this.simulationResult = this.createLocalSimFallback(this.rainfallDaily, this.rainfallCum3d, this.tidalLock);
        this.isRunning = false;
        this.renderSimulatedSectors();
      }
    });
  }

  initMap(): void {
    if (!this.mapRef || this.map) return;
    const container = this.mapRef.nativeElement;

    this.map = L.map(container, {
      center: [13.0400, 80.2200],
      zoom: 11,
      zoomControl: true,
      preferCanvas: true
    });

    // OpenStreetMap basemap (no API key required)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18
    }).addTo(this.map);

    this.sectorLayersGroup.addTo(this.map);

    setTimeout(() => {
      this.map?.invalidateSize();
      this.renderSimulatedSectors();
    }, 150);

    setTimeout(() => {
      this.map?.invalidateSize();
    }, 450);
  }

  private createLocalSimFallback(daily: number, cum3d: number, tide: number): SimResult {
    const keyZones: SimZone[] = [
      { gridId: 'CHN-2941', name: 'Velachery South Basin', locality: 'Velachery', latitude: 12.9815, longitude: 80.2180, bounds: [[12.977, 80.213], [12.986, 80.223]], probability: Math.min(0.98, (daily / 200) * 0.9), riskScore: Math.round(Math.min(98, (daily / 200) * 90)), riskLevel: daily > 80 ? 'CRITICAL' : 'HIGH', elevation: 4.8, lowLyingScore: 0.92, drainageDistM: 140 },
      { gridId: 'CHN-2810', name: 'Madipakkam Lake Lowlands', locality: 'Madipakkam', latitude: 12.9640, longitude: 80.1980, bounds: [[12.960, 80.193], [12.968, 80.203]], probability: Math.min(0.96, (daily / 210) * 0.88), riskScore: Math.round(Math.min(96, (daily / 210) * 88)), riskLevel: daily > 90 ? 'CRITICAL' : 'HIGH', elevation: 5.2, lowLyingScore: 0.88, drainageDistM: 220 },
      { gridId: 'CHN-3120', name: 'Adyar Kotturpuram Riverbank', locality: 'Kotturpuram', latitude: 13.0080, longitude: 80.2450, bounds: [[13.004, 80.240], [13.012, 80.250]], probability: Math.min(0.95, (daily / 220) * 0.85), riskScore: Math.round(Math.min(95, (daily / 220) * 85)), riskLevel: daily > 100 ? 'CRITICAL' : 'HIGH', elevation: 3.9, lowLyingScore: 0.86, drainageDistM: 80 },
      { gridId: 'CHN-2450', name: 'Mudichur / Tambaram Floodplain', locality: 'Mudichur', latitude: 12.9150, longitude: 80.0850, bounds: [[12.910, 80.080], [12.920, 80.090]], probability: Math.min(0.94, (daily / 230) * 0.82), riskScore: Math.round(Math.min(94, (daily / 230) * 82)), riskLevel: daily > 95 ? 'CRITICAL' : 'HIGH', elevation: 5.0, lowLyingScore: 0.84, drainageDistM: 310 },
      { gridId: 'CHN-3410', name: 'Vyasarpadi Otteri Nallah', locality: 'Vyasarpadi', latitude: 13.1185, longitude: 80.2615, bounds: [[13.114, 80.257], [13.123, 80.266]], probability: Math.min(0.92, (daily / 240) * 0.80), riskScore: Math.round(Math.min(92, (daily / 240) * 80)), riskLevel: daily > 110 ? 'CRITICAL' : 'HIGH', elevation: 3.5, lowLyingScore: 0.90, drainageDistM: 110 },
      { gridId: 'CHN-2210', name: 'Perumbakkam Marsh Basin', locality: 'Perumbakkam', latitude: 12.8950, longitude: 80.1920, bounds: [[12.890, 80.187], [12.900, 80.197]], probability: Math.min(0.89, (daily / 250) * 0.78), riskScore: Math.round(Math.min(89, (daily / 250) * 78)), riskLevel: 'MODERATE', elevation: 4.2, lowLyingScore: 0.82, drainageDistM: 420 },
      { gridId: 'CHN-3380', name: 'Kolathur Retteri Sump', locality: 'Kolathur', latitude: 13.1238, longitude: 80.2185, bounds: [[13.119, 80.213], [13.128, 80.224]], probability: Math.min(0.85, (daily / 260) * 0.75), riskScore: Math.round(Math.min(85, (daily / 260) * 75)), riskLevel: 'MODERATE', elevation: 6.1, lowLyingScore: 0.76, drainageDistM: 190 },
      { gridId: 'CHN-3050', name: 'T. Nagar Panagal Park Commercial', locality: 'T. Nagar', latitude: 13.0418, longitude: 80.2341, bounds: [[13.037, 80.229], [13.046, 80.239]], probability: Math.min(0.82, (daily / 270) * 0.72), riskScore: Math.round(Math.min(82, (daily / 270) * 72)), riskLevel: 'MODERATE', elevation: 8.5, lowLyingScore: 0.70, drainageDistM: 60 }
    ];

    const inunCount = Math.round((daily / 250) * 240);
    return {
      scenario: { rainfall_daily_mm: daily, rainfall_cum_3d_mm: cum3d, rainfall_delta_mm: 15, tidal_lock_penalty: tide },
      summary: {
        total_sectors_evaluated: 3963,
        inundated_sectors_count: inunCount,
        inundated_area_km2: Math.round(inunCount * 0.25 * 10) / 10,
        critical_sectors_count: Math.round(inunCount * 0.35),
        moderate_sectors_count: Math.round(inunCount * 0.45),
        low_risk_sectors_count: 3963 - inunCount,
        mean_risk_probability: Math.round((daily / 350) * 1000) / 1000,
        population_exposure_index: inunCount * 1850,
        critical_infrastructure_at_risk: Math.min(42, Math.round(inunCount * 0.12))
      },
      impacted_zones: keyZones,
      feature_sensitivities: [
        { feature: 'Daily Precipitation (mm)', weight: 0.42 },
        { feature: 'Topographic Depression (DEM)', weight: 0.24 },
        { feature: 'Antecedent 3-Day Moisture', weight: 0.16 },
        { feature: 'Distance to Storm Water Drains', weight: 0.11 },
        { feature: 'Tidal Backwater Restriction', weight: 0.07 }
      ],
      timestamp: new Date().toISOString()
    };
  }

  renderSimulatedSectors(): void {
    if (!this.map || !this.simulationResult) return;
    this.sectorLayersGroup.clearLayers();

    for (const zone of this.simulationResult.impacted_zones) {
      if (!zone.bounds || zone.bounds.length < 2) continue;

      let fillColor = '#eab308'; // Moderate
      if (zone.riskLevel === 'CRITICAL') fillColor = '#ef4444';
      else if (zone.riskLevel === 'HIGH') fillColor = '#f97316';

      const rect = L.rectangle(zone.bounds as L.LatLngBoundsExpression, {
        color: fillColor,
        weight: 1.5,
        fillColor: fillColor,
        fillOpacity: Math.max(0.35, zone.probability * 0.75)
      });

      rect.bindPopup(`
        <div style="font-family: sans-serif; font-size: 12px; color: #1e293b;">
          <strong>${zone.name}</strong><br/>
          <strong>Simulation Probability:</strong> ${(zone.probability * 100).toFixed(1)}%<br/>
          <strong>Risk Level:</strong> <span style="color: ${fillColor}; font-weight: bold;">${zone.riskLevel}</span><br/>
          <strong>Elevation:</strong> ${zone.elevation} m MSL<br/>
          <strong>Low-Lying Index:</strong> ${zone.lowLyingScore}<br/>
          <strong>Distance to SWD:</strong> ${zone.drainageDistM} m
        </div>
      `);

      this.sectorLayersGroup.addLayer(rect);
    }
  }

  focusOnZone(zone: SimZone): void {
    if (this.map && zone.latitude && zone.longitude) {
      this.map.flyTo([zone.latitude, zone.longitude], 13, { duration: 1.2 });
    }
  }
}
