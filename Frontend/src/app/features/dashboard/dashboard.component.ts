import { Component, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import * as L from 'leaflet';

import { FloodService } from '../../core/services/flood.service';
import { AlertService } from '../../core/services/alert.service';
import { ThemeService } from '../../core/services/theme.service';
import { DnoService } from '../../core/services/dno.service';
import { DNOPredictResponse, DNOTimestepForecast, PreparedStormEvent, DNOHealthResponse } from '../../core/models/dno.model';
import { SystemKPIs, FloodZone, RecentPrediction, PredictionTime } from '../../core/models/flood-risk.model';
import { FloodAlert } from '../../core/models/alert.model';
import { StatCardComponent } from '../../shared/components/stat-card/stat-card.component';
import { RiskBadgeComponent } from '../../shared/components/risk-badge/risk-badge.component';
import { AlertCardComponent } from '../../shared/components/alert-card/alert-card.component';
import { TimeSelectorComponent } from '../../shared/components/time-selector/time-selector.component';
import { MapLegendComponent } from '../../shared/components/map-legend/map-legend.component';
import { LoadingStateComponent } from '../../shared/components/loading-state/loading-state.component';
import { RainfallApiService } from '../../core/services/rainfall-api.service';
import { RainfallForecastHour, RainfallLocation, RainfallReading } from '../../core/models/rainfall.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    StatCardComponent,
    RiskBadgeComponent,
    AlertCardComponent,
    TimeSelectorComponent,
    MapLegendComponent,
    LoadingStateComponent
  ],
  template: `
    <div class="dashboard-page">
      <!-- Greeting & Overview Header -->
      <div class="dashboard-header">
        <div class="header-titles">
          <h1 class="welcome-heading">{{ greeting }}, Admin</h1>
          <p class="welcome-sub">
            Monitor real-time flood conditions and AI-powered predictions across Greater Chennai.
          </p>
        </div>
        <div class="header-meta">
          <div class="meta-item">
            <span class="meta-label">Current Date</span>
            <span class="meta-val">{{ currentDate }}</span>
          </div>
          <div class="meta-divider"></div>
          <div class="meta-item">
            <span class="meta-label">Sync Status</span>
            <span class="meta-val" [class.status-live]="weatherCurrentAvailable && !weatherIsStale">
              <span class="pulse-dot" *ngIf="weatherCurrentAvailable && !weatherIsStale"></span> {{ weatherStatusLabel }}
            </span>
          </div>
          <div class="meta-divider"></div>
          <div class="meta-item">
            <span class="meta-label">Last Updated</span>
              <span class="meta-val font-mono">{{ kpis?.lastUpdated || 'Unavailable' }}</span>
          </div>
        </div>
      </div>

      <!-- 4 KPI Cards -->
      @if (loadingKpis) {
        <app-loading-state message="Loading flood telemetry KPIs..."></app-loading-state>
      } @else if (kpis) {
        <div class="kpi-grid">
          <!-- KPI 1: Current Rainfall -->
          <app-stat-card
            title="Current Rainfall"
            [value]="kpis.currentRainfall ?? 'Unavailable'"
            unit="mm (preceding hour)"
            [delta]="kpis.rainfallDelta"
            statusType="caution"
          >
            <div icon class="kpi-icon icon-water">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
              </svg>
            </div>
          </app-stat-card>

          <!-- KPI 2: High-Risk Zones -->
          <app-stat-card
            title="High-Risk Zones"
            [value]="kpis.highRiskZones"
            [delta]="kpis.highRiskDelta"
            statusType="unsafe"
          >
            <div icon class="kpi-icon icon-danger">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>
          </app-stat-card>

          <!-- KPI 3: Unsafe Roads -->
          <app-stat-card
            title="Unsafe Roads"
            [value]="kpis.unsafeRoads"
            [delta]="kpis.unsafeRoadsStatus"
            statusType="caution"
          >
            <div icon class="kpi-icon icon-road">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
          </app-stat-card>

          <!-- KPI 4: Active Alerts -->
          <app-stat-card
            title="Active Alerts"
            [value]="alertService.activeAlertsCount()"
            [delta]="alertService.highPriorityCount() + ' require immediate attention'"
            statusType="unsafe"
          >
            <div icon class="kpi-icon icon-bell">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
            </div>
          </app-stat-card>
        </div>
      }

      <!-- Operational Diagnostics Grid: Flood Risk Index, Catchment Stress, Soil Saturation, Drainage State -->
      <div class="ops-diagnostics-grid">
        <!-- Transparent Flood Risk Index (Section 12) -->
        <div class="card ops-diag-card">
          <div class="ops-card-header">
            <div>
              <span class="ops-card-label">Transparent Index</span>
              <h4 class="ops-card-title">Flood Risk Index</h4>
            </div>
            <div class="risk-index-badge font-mono">
              <span class="score-large">78</span><span class="score-denom">/100</span>
            </div>
          </div>
          <p class="ops-card-sub">Contributing environmental drivers:</p>
          <div class="drivers-list">
            <div class="driver-item">
              <span class="d-name">Rainfall Intensity</span>
              <span class="d-val font-mono text-danger">HIGH (42 mm/h)</span>
              <span class="src-tag tag-obs">OBSERVED</span>
            </div>
            <div class="driver-item">
              <span class="d-name">Drainage Stress</span>
              <span class="d-val font-mono text-danger">HIGH (85% load)</span>
              <span class="src-tag tag-derived">DERIVED</span>
            </div>
            <div class="driver-item">
              <span class="d-name">Terrain Vulnerability</span>
              <span class="d-val font-mono text-warning">MODERATE (DEM)</span>
              <span class="src-tag tag-derived">DERIVED</span>
            </div>
            <div class="driver-item">
              <span class="d-name">Historical Susceptibility</span>
              <span class="d-val font-mono text-danger">HIGH (XGBoost)</span>
              <span class="src-tag tag-model">MODEL</span>
            </div>
          </div>
        </div>

        <!-- Catchment Stress Indicator (Section 10) -->
        <div class="card ops-diag-card">
          <div class="ops-card-header">
            <div>
              <span class="ops-card-label">Hydrologic Balance</span>
              <h4 class="ops-card-title">Catchment Load / Stress</h4>
            </div>
            <span class="badge status-caution font-mono">82% STRESSED</span>
          </div>
          <p class="ops-card-sub">Adyar & Cooum basin hydrologic loading:</p>
          <div class="drivers-list">
            <div class="driver-item">
              <span class="d-name">Precipitation Rate</span>
              <span class="d-val font-mono">34.5 mm/hr</span>
              <span class="src-tag tag-obs">OBSERVED</span>
            </div>
            <div class="driver-item">
              <span class="d-name">Antecedent Rain (24h)</span>
              <span class="d-val font-mono">118.4 mm</span>
              <span class="src-tag tag-obs">OBSERVED</span>
            </div>
            <div class="driver-item">
              <span class="d-name">Runoff Coefficient</span>
              <span class="d-val font-mono">0.78 (Urban)</span>
              <span class="src-tag tag-derived">DERIVED</span>
            </div>
            <div class="driver-item">
              <span class="d-name">Drainage Surcharge</span>
              <span class="d-val font-mono text-caution">Elevated Outfall</span>
              <span class="src-tag tag-derived">DERIVED</span>
            </div>
          </div>
        </div>

        <!-- Soil Saturation Interface (Section 11) -->
        <div class="card ops-diag-card">
          <div class="ops-card-header">
            <div>
              <span class="ops-card-label">Infiltration Telemetry</span>
              <h4 class="ops-card-title">Soil Saturation</h4>
            </div>
            <span class="badge font-mono" [class.status-safe]="soilSaturationPct !== null" [class.status-dim]="soilSaturationPct === null">{{ soilTelemetryStatus }}</span>
          </div>
          <p class="ops-card-sub">Regional soil moisture estimate:</p>
          <div class="soil-state-box">
            @if (soilSaturationPct !== null) {
              <div class="soil-icon-row">
                <span class="soil-status-text">{{ soilSaturationPct.toFixed(1) }}% saturation</span>
                <span class="src-tag tag-model">{{ soilSaturationPct >= 80 ? 'SATURATED' : 'NORMAL' }}</span>
              </div>
              <p class="soil-desc">
                Volumetric moisture: {{ soilMoistureM3M3 !== null ? soilMoistureM3M3.toFixed(3) + ' m³/m³' : 'not provided' }}. Source: {{ soilTelemetrySource }}. This is a regional grid estimate; GCC in-situ TDR probes are not connected.
              </p>
            } @else {
              <div class="soil-icon-row"><span class="soil-status-text">Soil telemetry unavailable</span></div>
              <p class="soil-desc">The rainfall telemetry API did not provide a soil moisture estimate. Check the backend connection and data source.</p>
            }
            <div class="driver-item" style="margin-top: 0.5rem;">
              <span class="d-name">Data Status:</span>
              <span class="src-tag" [class.tag-model]="soilSaturationPct !== null" [class.tag-unavail]="soilSaturationPct === null">{{ soilTelemetryStatus }}</span>
            </div>
          </div>
        </div>

        <!-- Drainage Network & Surcharge State (Section 8 & 9) -->
        <div class="card ops-diag-card">
          <div class="ops-card-header">
            <div>
              <span class="ops-card-label">Storm Water Network</span>
              <h4 class="ops-card-title">Drainage Hydraulic State</h4>
            </div>
            <span class="badge status-safe font-mono">INTERFACE READY</span>
          </div>
          <p class="ops-card-sub">Macro-canals & 2023 SWD lines:</p>
          <div class="drivers-list">
            <div class="driver-item">
              <span class="d-name">Surface Waterways</span>
              <span class="d-val font-mono">4 Rivers / Canals</span>
              <span class="src-tag tag-obs">OBSERVED</span>
            </div>
            <div class="driver-item">
              <span class="d-name">SWD Network (KML)</span>
              <span class="d-val font-mono">GCC 2023 GIS</span>
              <span class="src-tag tag-obs">OBSERVED</span>
            </div>
            <div class="driver-item">
              <span class="d-name">Live Pipe Surcharge</span>
              <span class="d-val font-mono text-muted">Awaiting sensors</span>
              <span class="src-tag tag-unavail">UNAVAILABLE</span>
            </div>
            <div class="driver-item">
              <span class="d-name">Hydraulic Solver</span>
              <span class="d-val font-mono text-muted">1D/2D Saint-Venant</span>
              <span class="src-tag tag-unavail">NOT CONNECTED</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Open-Meteo model estimate for the configured Chennai monitoring point -->
      <div class="card weather-telemetry-card">
        <div class="card-header weather-header">
          <div class="weather-title-group">
            <div class="weather-badge-row">
              <span class="badge-live-pulse"><span class="pulse-dot"></span> {{ weatherStatusLabel }}</span>
              <span class="badge-radar font-mono">OPEN-METEO</span>
              <span class="badge-source font-mono">{{ weatherDataTypeLabel }}</span>
            </div>
            <h3 class="card-title">Detailed Weather Telemetry & Basin Hydrology</h3>
            <p class="card-subtitle">
              Provider model estimates for the selected Chennai point. They are not rain-gauge observations or city-wide rainfall coverage.
            </p>
          </div>
          <div class="weather-actions">
            <label class="sr-only" for="rain-location">Monitoring location</label>
            <select id="rain-location" class="form-select" [value]="selectedWeatherLocation" (change)="selectWeatherLocation($event)">
              @for (loc of weatherLocations; track loc.id) {
                <option [value]="loc.id">{{ loc.name }}</option>
              }
            </select>
            <button type="button" class="btn btn-secondary btn-sm" (click)="refreshWeather()">
              ↻ Refresh Weather
            </button>
          </div>
        </div>

        <!-- Atmospheric Parameters Bar -->
        <div class="atm-params-strip">
          <div class="atm-item">
            <span class="atm-label">Temperature</span>
            <span class="atm-val font-mono">{{ cityWeather.temp ?? '—' }} °C</span>
          </div>
          <div class="atm-item">
            <span class="atm-label">Relative Humidity</span>
            <span class="atm-val font-mono">{{ cityWeather.humidity ?? '—' }}%</span>
          </div>
          <div class="atm-item">
            <span class="atm-label">Atm. Pressure</span>
            <span class="atm-val font-mono">—</span>
          </div>
          <div class="atm-item">
            <span class="atm-label">Wind Vector</span>
            <span class="atm-val font-mono">{{ cityWeather.wind ?? '—' }}</span>
          </div>
          <div class="atm-item">
            <span class="atm-label">Precipitation (preceding hour)</span>
            <span class="atm-val font-mono text-cyan">{{ weatherCurrent?.precipitation_mm ?? '—' }} mm</span>
          </div>
          <div class="atm-item">
            <span class="atm-label">Soil Saturation</span>
            <span class="atm-val font-mono text-warning">Unavailable</span>
          </div>
        </div>

        <div class="rainfall-live-panel">
          <div class="rainfall-live-heading">
            <div><strong>{{ weatherLocationName }}</strong> · {{ weatherCoordinates }}</div>
            <span [class.stale-data]="weatherIsStale">{{ weatherStatusLabel }}</span>
          </div>
          <div class="weather-diagnostics" aria-live="polite">
            <span>Connection: <strong>{{ weatherConnectionLabel }}</strong></span>
            <span>Current rainfall: <strong>{{ weatherCurrentAvailable ? (weatherCurrent?.precipitation_mm + ' mm') : 'Unavailable' }}</strong></span>
            <span>Cache: <strong>{{ weatherCacheLabel }}</strong></span>
            <span>Last successful retrieval: <strong>{{ weatherLastSuccessAt || 'None recorded' }}</strong></span>
            <span>Last failed refresh: <strong>{{ weatherLastFailureAt || 'None recorded' }}</strong></span>
            <span>Provider timestamp: <strong>{{ weatherProviderTimestamp || 'Unavailable' }}</strong></span>
            <span>Hourly forecast: <strong>{{ weatherForecastIsStale ? 'Cached forecast is stale' : (weatherHourly.length ? 'Available' : 'Unavailable') }}</strong></span>
            <span>Forecast cache age: <strong>{{ weatherForecastCacheAge }}</strong></span>
          </div>
          @if (weatherError) { <div class="weather-error" role="alert"><span>{{ weatherError }}</span><button type="button" class="btn btn-secondary btn-sm" (click)="refreshWeather()">Retry</button></div> }
          @if (weatherLoading && !weatherHourly.length) {
            <div class="rainfall-skeleton" aria-label="Loading rainfall telemetry"><span></span><span></span><span></span><span></span></div>
          }
          @else if (weatherChartAvailable) {
            <div class="rainfall-chart-wrap">
              <div class="rainfall-chart-toolbar">
                <div class="rainfall-chart-title">Next {{ weatherHourly.slice(0, 48).length }} hours · Open-Meteo model forecast</div>
                <div class="rainfall-chart-switch" role="group" aria-label="Forecast chart measure">
                  <button type="button" [class.active]="rainChartMetric === 'rainfall'" (click)="setRainChartMetric('rainfall')">Rainfall (mm)</button>
                  <button type="button" [class.active]="rainChartMetric === 'probability'" (click)="setRainChartMetric('probability')">Probability (%)</button>
                </div>
              </div>
              <svg viewBox="0 0 600 150" role="img" aria-label="Hourly precipitation forecast chart" preserveAspectRatio="none">
                <path [attr.d]="rainChartPoints" fill="none" stroke="#1684e8" stroke-width="3" />
                @for (point of weatherHourly.slice(0, 48); track point.timestamp; let idx = $index) {
                  @if (chartValue(point) != null) {
                    <circle [attr.cx]="chartX(idx)" [attr.cy]="chartY(point)" r="3.5" fill="#38bdf8">
                      <title>{{ formatChennaiTimestamp(point.timestamp) }} · {{ chartTooltip(point) }}</title>
                    </circle>
                  }
                }
              </svg>
            </div>
            <div class="rainfall-hourly-grid">
              @for (hour of weatherHourly.slice(0, 12); track hour.timestamp) {
                <div [title]="formatChennaiTimestamp(hour.timestamp)"><strong>{{ hour.precipitation_mm ?? '—' }} mm</strong><span>{{ hour.timestamp | date:'EEE HH:mm':'Asia/Kolkata' }}</span>
                  <small>Chance {{ hour.precipitation_probability ?? '—' }}%</small></div>
              }
            </div>
          } @else {
            <p class="weather-empty">{{ weatherStatusLabel }}. No validated hourly forecast is available.</p>
          }
        </div>
      </div>

      <!-- Main Area: Left (Map Overview) & Right (Active Alerts) -->
      <div class="dashboard-main-columns">
        <!-- Left: Live Flood Risk Overview -->
        <div class="card map-preview-card">
          <div class="card-header">
            <div>
              <div class="title-with-badge">
                <h3 class="card-title">Live Flood Risk Overview</h3>
              </div>
              <p class="card-subtitle">
                Prediction horizon: <strong class="text-highlight">{{ currentHorizon }}</strong> (next 3 hours)
              </p>
            </div>
            <app-time-selector
              [selected]="currentHorizon"
              [fullLabels]="true"
              [showLabel]="false"
              (horizonChange)="onHorizonChange($event)"
            ></app-time-selector>
          </div>

          <!-- Advanced Map Layer Controls (Section 22) -->
          <div class="map-layers-bar">
            <span class="layers-bar-label">GIS Layers:</span>
            <div class="layer-chips">
              <label class="layer-chip active">
                <input type="checkbox" checked disabled> Flood Risk (500m)
              </label>
              <label class="layer-chip active">
                <input type="checkbox" [checked]="layerRadar" (change)="layerRadar = !layerRadar"> Doppler Radar
              </label>
              <label class="layer-chip active">
                <input type="checkbox" [checked]="layerHotspots" (change)="layerHotspots = !layerHotspots"> Hotspots
              </label>
              <label class="layer-chip active">
                <input type="checkbox" [checked]="layerDrainage" (change)="layerDrainage = !layerDrainage"> Drainage (SWD)
              </label>
              <label class="layer-chip" [class.active]="layerDno" title="Toggle Chennai Phase 7C DNO Hydrodynamic Water Depth Layer">
                <input type="checkbox" [checked]="layerDno" (change)="toggleDnoLayer()" [disabled]="!dnoService.health()?.model_loaded"> Hydrodynamic Depth (DNO) <span class="layer-status-pill">{{ dnoService.health()?.model_loaded ? 'READY' : 'UNAVAILABLE' }}</span>
              </label>
              <label class="layer-chip">
                <input type="checkbox" [checked]="layerRoutes" (change)="layerRoutes = !layerRoutes"> Safe Corridors
              </label>
            </div>
          </div>

          <!-- Leaflet Map Container -->
          <div class="map-wrapper">
            <div #miniMapContainer class="leaflet-map-canvas"></div>
            <div class="map-overlay-legend">
              <app-map-legend></app-map-legend>
            </div>
            <div class="map-actions-bar">
              <span class="map-info-text">Greater Chennai Corporation (GCC) 500m Metric Grid</span>
              <div class="map-btn-group">
                <button type="button" class="btn btn-secondary btn-sm" (click)="focusDnoPilot()" title="Center on Adyar-Velachery Pilot Catchment">
                  Focus DNO Basin (10km)
                </button>
                <a routerLink="/flood-map" class="btn btn-primary btn-sm">
                  Open Fullscreen GIS Map →
                </a>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Active Alerts Feed -->
        <div class="card alerts-panel-card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Active Emergency Alerts</h3>
              <p class="card-subtitle">{{ alerts.length }} active alerts across jurisdiction</p>
            </div>
            <a routerLink="/alerts" class="view-all-link">
              View All →
            </a>
          </div>

          <div class="alerts-feed-list">
            @for (alert of alerts.slice(0, 4); track alert.id) {
              <app-alert-card
                [alert]="alert"
                (acknowledge)="onAcknowledgeAlert($event)"
                (viewLocation)="onViewAlertLocation($event)"
                (dismiss)="onDismissAlert($event)"
              ></app-alert-card>
            }
            @if (alerts.length === 0) {
              <div class="empty-feed-state">
                <span class="empty-icon">✓</span>
                <span class="empty-msg">All jurisdictional alerts acknowledged or cleared.</span>
              </div>
            }
          </div>
        </div>
      </div>

      <!-- AI HYDRODYNAMIC NOWCAST (Chennai Phase 7C DNO) -->
      <div class="card dno-hydrodynamic-card">
        <!-- Header -->
        <div class="dno-card-header">
          <div class="dno-title-group">
            <div class="dno-badge-row">
              <span class="dno-pill-pulse" [class.dno-disabled-pill]="!dnoService.health()?.model_loaded"><span class="pulse-dot-cyan"></span> {{ dnoService.health()?.model_loaded ? 'EXPERIMENTAL DNO READY' : 'EXPERIMENTAL DNO UNAVAILABLE' }}</span>
              <span class="dno-tag font-mono">CHENNAI PHASE 7C DNO</span>
              <span class="dno-tag font-mono">128 × 128 (78.1m)</span>
              <span class="dno-tag-device font-mono" [class.device-cuda]="dnoService.health()?.device?.includes('cuda')" [class.dno-device-unavailable]="!dnoService.health()?.model_loaded">
                {{ dnoService.health()?.model_loaded ? ('⚡ ' + dnoService.health()?.device?.toUpperCase()) : 'MODEL NOT LOADED' }}
              </span>
            </div>
            <h3 class="dno-main-title">Chennai Hydrodynamic Depth & Velocity Forecasting</h3>
            <p class="dno-sub-text" *ngIf="dnoService.health()?.model_loaded">
              High-resolution Deep Neural Operator (DNO) surrogate simulating physical 2D Navier-Stokes/Saint-Venant
              water depth (H), velocity vectors (U, V), and localized saucer ponding across the Adyar–Velachery pilot basin.
            </p>
            @if (!dnoService.health()?.model_loaded) {
              <p class="dno-sub-text">Forecast controls remain disabled until a verified trained checkpoint is installed. No depth or velocity values are generated while the model is unavailable.</p>
            }
          </div>

          <!-- Event Selector & Action -->
          @if (dnoService.health()?.model_loaded && dnoService.availableEvents()?.events?.length) {
          <div class="dno-event-controls">
            <div class="dno-select-wrap">
              <label class="dno-select-label">Select Chennai Flood Event:</label>
              <select
                class="dno-event-select font-mono"
                [value]="dnoService.selectedEventId()"
                (change)="onDnoEventChange($event)"
                [disabled]="dnoService.isPredicting() || !dnoService.availableEvents()?.events?.length"
              >
                @for (ev of dnoService.availableEvents()?.events; track ev.id) {
                  <option [value]="ev.id">
                    {{ ev.id }} • {{ ev.rainfall_mm }}mm ({{ ev.category }})
                  </option>
                }
              </select>
            </div>
            <button
              type="button"
              class="btn btn-primary dno-run-btn"
              (click)="runDnoForecast()"
              [disabled]="dnoService.isPredicting() || !dnoService.availableEvents()?.events?.length"
            >
              @if (dnoService.isPredicting()) {
                <span class="btn-spinner"></span> Simulating Hydrodynamics...
              } @else {
                🌊 Run Hydrodynamic Forecast
              }
            </button>
          </div>
          } @else {
            <div class="dno-event-controls dno-disabled-note">Prepared storm selector and forecast are disabled because no verified DNO checkpoint is loaded.</div>
          }
        </div>

        <!-- Loading State Indicator -->
        @if (dnoService.isPredicting()) {
          <div class="dno-loading-banner">
            <div class="dno-spinner"></div>
            <div>
              <div class="dno-load-title">Running DNO Hydrodynamic Forecast on {{ dnoService.selectedEventId() }}...</div>
              <div class="dno-load-sub">Fourier operator evaluating 24 time steps on 128x128 spatial grid</div>
            </div>
          </div>
        }

        <!-- Error State -->
        @if (dnoService.errorMessage()) {
          <div class="dno-error-banner dno-unavailable-banner" role="status">
            <span class="dno-err-icon">⚠️</span>
            <span>{{ dnoService.errorMessage() }}</span>
          </div>
        }

        <!-- Prediction Content (When Available) -->
        @if (dnoService.currentPrediction(); as pred) {
          <!-- Top KPI Metrics -->
          <div class="dno-kpi-strip">
            <div class="dno-kpi-card">
              <div class="kpi-label">Peak Water Depth (Hmax)</div>
              <div class="kpi-val-row">
                <span class="kpi-number text-cyan font-mono">{{ pred.summary.peak_depth_m.toFixed(2) }}</span>
                <span class="kpi-unit">meters</span>
              </div>
              <div class="kpi-sub">Domain maximum over 120m</div>
            </div>

            <div class="dno-kpi-card">
              <div class="kpi-label">Current Step Depth (Hmax)</div>
              <div class="kpi-val-row">
                <span class="kpi-number text-warning font-mono">{{ currentDnoForecast?.max_depth_m?.toFixed(2) || '0.00' }}</span>
                <span class="kpi-unit">meters</span>
              </div>
              <div class="kpi-sub">At lead time T+{{ dnoService.selectedLeadMinutes() }}m</div>
            </div>

            <div class="dno-kpi-card">
              <div class="kpi-label">Peak Velocity (Vmax)</div>
              <div class="kpi-val-row">
                <span class="kpi-number text-highlight font-mono">{{ (currentDnoForecast?.max_velocity_mps || pred.summary.peak_velocity_mps).toFixed(2) }}</span>
                <span class="kpi-unit">m/s</span>
              </div>
              <div class="kpi-sub">Surface flow vector speed</div>
            </div>

            <div class="dno-kpi-card">
              <div class="kpi-label">Inundated Footprint (>0.05m)</div>
              <div class="kpi-val-row">
                <span class="kpi-number text-danger font-mono">{{ ((currentDnoForecast?.flooded_area_m2 || 0) / 1000000).toFixed(2) }}</span>
                <span class="kpi-unit">km²</span>
              </div>
              <div class="kpi-sub">{{ currentDnoForecast?.flood_extent?.cells_gt_0_05m || 0 }} wet cells (78m grid)</div>
            </div>

            <div class="dno-kpi-card">
              <div class="kpi-label">Severe Flood Area (>0.50m)</div>
              <div class="kpi-val-row">
                <span class="kpi-number text-danger font-mono">{{ ((currentDnoForecast?.flood_extent?.area_m2_gt_0_50m || 0) / 1000000).toFixed(2) }}</span>
                <span class="kpi-unit">km²</span>
              </div>
              <div class="kpi-sub">{{ currentDnoForecast?.flood_extent?.cells_gt_0_50m || 0 }} critical cells</div>
            </div>

            <div class="dno-kpi-card">
              <div class="kpi-label">Inference Latency</div>
              <div class="kpi-val-row">
                <span class="kpi-number text-cyan font-mono">{{ pred.diagnostics.inference_latency_ms.toFixed(1) }}</span>
                <span class="kpi-unit">ms</span>
              </div>
              <div class="kpi-sub">Total req: {{ pred.diagnostics.total_latency_ms.toFixed(0) }}ms</div>
            </div>
          </div>

          <!-- Forecast Timeline Controller -->
          <div class="dno-timeline-container">
            <div class="timeline-header">
              <div class="timeline-title-wrap">
                <span class="timeline-icon">⏱</span>
                <span class="timeline-title">Forecast Lead Timeline (0 to 120 Minutes)</span>
                <span class="timeline-curr-step font-mono">
                  T+{{ dnoService.selectedLeadMinutes() }} MIN (Step {{ (dnoService.selectedLeadMinutes() / 5) }}/24)
                </span>
              </div>
              <div class="timeline-actions">
                <button type="button" class="btn-step" (click)="prevDnoStep()" [disabled]="dnoService.selectedLeadMinutes() <= 5">
                  ◀ -5m
                </button>
                <button type="button" class="btn-step btn-play" (click)="toggleDnoPlayback()">
                  {{ dnoPlayingTimeline ? '⏸ Pause' : '▶ Play Animation' }}
                </button>
                <button type="button" class="btn-step" (click)="nextDnoStep()" [disabled]="dnoService.selectedLeadMinutes() >= 120">
                  +5m ▶
                </button>
              </div>
            </div>

            <!-- Slider Range -->
            <div class="timeline-slider-track">
              <input
                type="range"
                min="5"
                max="120"
                step="5"
                [value]="dnoService.selectedLeadMinutes()"
                (input)="onDnoTimelineChange($event)"
                class="dno-timeline-slider"
              />
              <div class="timeline-ticks">
                <span class="tick" [class.active]="dnoService.selectedLeadMinutes() === 5">T+5m</span>
                <span class="tick" [class.active]="dnoService.selectedLeadMinutes() === 30">T+30m</span>
                <span class="tick" [class.active]="dnoService.selectedLeadMinutes() === 60">T+60m</span>
                <span class="tick" [class.active]="dnoService.selectedLeadMinutes() === 90">T+90m</span>
                <span class="tick" [class.active]="dnoService.selectedLeadMinutes() === 120">T+120m</span>
              </div>
            </div>
          </div>

          <!-- Hydrodynamic Extent Thresholds & Depth Severity Bins -->
          <div class="dno-details-grid">
            <!-- Flood Extent Thresholds -->
            <div class="dno-detail-card">
              <h4 class="detail-card-title">Threshold Inundation Footprint at T+{{ dnoService.selectedLeadMinutes() }}m</h4>
              <p class="detail-card-sub">Established physical depth thresholds (native meters):</p>
              <div class="threshold-rows">
                <div class="th-item">
                  <span class="th-label">> 0.05m (Thin Runoff)</span>
                  <span class="th-val font-mono">{{ currentDnoForecast?.flood_extent?.cells_gt_0_05m || 0 }} cells</span>
                  <span class="th-area font-mono text-cyan">{{ (((currentDnoForecast?.flood_extent?.area_m2_gt_0_05m || 0) / 1000000)).toFixed(2) }} km²</span>
                </div>
                <div class="th-item">
                  <span class="th-label">> 0.10m (Ankle-deep)</span>
                  <span class="th-val font-mono">{{ currentDnoForecast?.flood_extent?.cells_gt_0_10m || 0 }} cells</span>
                  <span class="th-area font-mono text-cyan">{{ (((currentDnoForecast?.flood_extent?.area_m2_gt_0_10m || 0) / 1000000)).toFixed(2) }} km²</span>
                </div>
                <div class="th-item">
                  <span class="th-label">> 0.20m (Curb Overtopping)</span>
                  <span class="th-val font-mono">{{ currentDnoForecast?.flood_extent?.cells_gt_0_20m || 0 }} cells</span>
                  <span class="th-area font-mono text-warning">{{ (((currentDnoForecast?.flood_extent?.area_m2_gt_0_20m || 0) / 1000000)).toFixed(2) }} km²</span>
                </div>
                <div class="th-item">
                  <span class="th-label">> 0.50m (Wheel Submersion)</span>
                  <span class="th-val font-mono">{{ currentDnoForecast?.flood_extent?.cells_gt_0_50m || 0 }} cells</span>
                  <span class="th-area font-mono text-danger">{{ (((currentDnoForecast?.flood_extent?.area_m2_gt_0_50m || 0) / 1000000)).toFixed(2) }} km²</span>
                </div>
                <div class="th-item">
                  <span class="th-label">> 1.00m (Severe Inundation)</span>
                  <span class="th-val font-mono">{{ currentDnoForecast?.flood_extent?.cells_gt_1_00m || 0 }} cells</span>
                  <span class="th-area font-mono text-danger">{{ (((currentDnoForecast?.flood_extent?.area_m2_gt_1_00m || 0) / 1000000)).toFixed(2) }} km²</span>
                </div>
              </div>
            </div>

            <!-- Severity Distribution Bins -->
            <div class="dno-detail-card">
              <h4 class="detail-card-title">Depth Severity Distribution Bins</h4>
              <p class="detail-card-sub">Discrete model-derived depth classification across 16,384 cells:</p>
              <div class="severity-bars">
                <div class="sev-row">
                  <span class="sev-name">Dry (<0.05m)</span>
                  <div class="sev-bar-bg"><div class="sev-bar-fill fill-dry" [style.width.%]="((currentDnoForecast?.depth_severity_cells?.dry_under_5cm || 0) / 16384) * 100"></div></div>
                  <span class="sev-count font-mono">{{ currentDnoForecast?.depth_severity_cells?.dry_under_5cm || 0 }}</span>
                </div>
                <div class="sev-row">
                  <span class="sev-name">Low (0.05–0.10m)</span>
                  <div class="sev-bar-bg"><div class="sev-bar-fill fill-low" [style.width.%]="((currentDnoForecast?.depth_severity_cells?.low_5_to_10cm || 0) / 16384) * 100"></div></div>
                  <span class="sev-count font-mono">{{ currentDnoForecast?.depth_severity_cells?.low_5_to_10cm || 0 }}</span>
                </div>
                <div class="sev-row">
                  <span class="sev-name">Minor (0.10–0.20m)</span>
                  <div class="sev-bar-bg"><div class="sev-bar-fill fill-minor" [style.width.%]="((currentDnoForecast?.depth_severity_cells?.minor_10_to_20cm || 0) / 16384) * 100"></div></div>
                  <span class="sev-count font-mono">{{ currentDnoForecast?.depth_severity_cells?.minor_10_to_20cm || 0 }}</span>
                </div>
                <div class="sev-row">
                  <span class="sev-name">Moderate (0.20–0.50m)</span>
                  <div class="sev-bar-bg"><div class="sev-bar-fill fill-mod" [style.width.%]="((currentDnoForecast?.depth_severity_cells?.moderate_20_to_50cm || 0) / 16384) * 100"></div></div>
                  <span class="sev-count font-mono">{{ currentDnoForecast?.depth_severity_cells?.moderate_20_to_50cm || 0 }}</span>
                </div>
                <div class="sev-row">
                  <span class="sev-name">Severe (0.50–1.00m)</span>
                  <div class="sev-bar-bg"><div class="sev-bar-fill fill-sev" [style.width.%]="((currentDnoForecast?.depth_severity_cells?.severe_50cm_to_1m || 0) / 16384) * 100"></div></div>
                  <span class="sev-count font-mono">{{ currentDnoForecast?.depth_severity_cells?.severe_50cm_to_1m || 0 }}</span>
                </div>
                <div class="sev-row">
                  <span class="sev-name">Very Severe (1.00–2.00m)</span>
                  <div class="sev-bar-bg"><div class="sev-bar-fill fill-vsev" [style.width.%]="((currentDnoForecast?.depth_severity_cells?.very_severe_1_to_2m || 0) / 16384) * 100"></div></div>
                  <span class="sev-count font-mono">{{ currentDnoForecast?.depth_severity_cells?.very_severe_1_to_2m || 0 }}</span>
                </div>
                <div class="sev-row">
                  <span class="sev-name">Extreme Deep Pooling (>2.00m)</span>
                  <div class="sev-bar-bg"><div class="sev-bar-fill fill-ext" [style.width.%]="((currentDnoForecast?.depth_severity_cells?.extreme_over_2m || 0) / 16384) * 100"></div></div>
                  <span class="sev-count font-mono text-danger">{{ currentDnoForecast?.depth_severity_cells?.extreme_over_2m || 0 }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Operational Separation & Architecture Callout -->
          <div class="dno-separation-panel">
            <div class="sep-box sep-operational">
              <div class="sep-badge font-mono">PRODUCTION MODEL</div>
              <h5 class="sep-title">Operational Flood Risk (XGBoost)</h5>
              <p class="sep-desc">
                Primary GCC-wide flood-risk classifier trained on audited spatial predictors. Governs safe routing, citizen SMS/push warnings, and macro evacuation corridors across 3,963 terrestrial sectors.
              </p>
            </div>
            <div class="sep-box sep-experimental">
              <div class="sep-badge font-mono">EXPERIMENTAL SURROGATE</div>
              <h5 class="sep-title">Hydrodynamic Nowcast (Chennai Phase 7C DNO)</h5>
              <p class="sep-desc">
                Neural operator simulating non-linear 2D depth (H) and velocity (U, V) over a 120-minute horizon. Operates on prepared hydrodynamic storm events in the Adyar–Velachery pilot catchment (128 × 128 grid).
              </p>
            </div>
          </div>
        }
      </div>

      <!-- Zone Quick Inspection Modal / Drawer -->
      @if (selectedZone) {
        <div class="inspection-modal-overlay" (click)="closeInspection()">
          <div class="inspection-modal-card" (click)="$event.stopPropagation()">
            <div class="inspection-modal-header">
              <div class="inspection-title-group">
                <h3 class="inspection-modal-title">{{ selectedZone.name }}</h3>
                <span class="inspection-grid-id font-mono">{{ selectedZone.gridId }} • Greater Chennai</span>
              </div>
              <button
                type="button"
                class="btn-close"
                (click)="closeInspection()"
                title="Close Inspection"
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div class="inspection-modal-body">
              <div class="inspection-kpi-row">
                <div class="ins-item">
                  <span class="ins-label">Risk Classification</span>
                  <app-risk-badge [level]="selectedZone.riskLevel" [customText]="selectedZone.riskLevel + ' RISK'"></app-risk-badge>
                </div>
                <div class="ins-item">
                  <span class="ins-label">Risk Probability</span>
                  <span class="ins-value font-mono" [style.color]="getRiskColor(selectedZone.riskScore)">{{ selectedZone.riskScore }}%</span>
                </div>
                <div class="ins-item">
                  <span class="ins-label">Physical Water Depth</span>
                  <span class="ins-value font-mono text-muted" title="Hydraulic depth modeling awaiting 1D/2D Saint-Venant solver connection">
                    Depth unavailable*
                  </span>
                </div>
                <div class="ins-item">
                  <span class="ins-label">Topographic Elevation</span>
                  <span class="ins-value font-mono">{{ selectedZone.elevation }} m MSL</span>
                </div>
              </div>

              <div class="ins-desc">
                <p>
                  Sector <strong>{{ selectedZone.name }}</strong> evaluated at forecast horizon 
                  <strong>{{ currentHorizon }}</strong>. Telemetry indicates saucer depression risk factors with drainage outfall distance of 420m.
                </p>
                <p class="depth-disclaimer-note" style="font-size: 0.72rem; color: var(--text-dim); margin-top: 0.35rem;">
                  * Note: The Chennai XGBoost baseline model predicts spatial flood occurrence susceptibility. Physical water depths require hydrodynamic solver integration. Centimeter depths are strictly not fabricated.
                </p>
              </div>

              <div class="inspection-modal-actions">
                <button type="button" class="btn btn-secondary" (click)="closeInspection()">
                  Close
                </button>
                <button type="button" class="btn btn-primary" (click)="openFullAnalysis(selectedZone)">
                  Open Full Inundation Analysis →
                </button>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- Bottom Section: Recent Predictions & System Status -->
      <div class="dashboard-bottom-columns">
        <!-- Recent Predictions Table -->
        <div class="card predictions-card">
          <div class="card-header">
            <div>
              <div class="title-with-badge">
                <h3 class="card-title">Recent AI Predictions</h3>
              </div>
              <p class="card-subtitle">Multi-horizon inundation vulnerability assessments</p>
            </div>
            <a routerLink="/location-risk" class="btn btn-secondary btn-sm">
              Search Location Risk →
            </a>
          </div>

          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Location / Locality</th>
                  <th>Current Risk</th>
                  <th>+1 Hour</th>
                  <th>+3 Hours</th>
                  <th>AI Confidence</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (item of recentPredictions; track item.location) {
                  <tr>
                    <td class="location-cell">
                      <strong>{{ item.location }}</strong>
                      <span class="sub-locality">Greater Chennai (GCC)</span>
                    </td>
                    <td>
                      <app-risk-badge [level]="item.currentRisk"></app-risk-badge>
                    </td>
                    <td>
                      <app-risk-badge [level]="item.plus1HourRisk"></app-risk-badge>
                    </td>
                    <td>
                      <app-risk-badge [level]="item.plus3HoursRisk"></app-risk-badge>
                    </td>
                    <td>
                      <div class="confidence-bar-wrap">
                        <span class="confidence-val font-mono">{{ item.confidence }}%</span>
                        <div class="progress-bar-bg">
                          <div class="progress-bar-fill" [style.width.%]="item.confidence"></div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        class="btn-table-action"
                        (click)="inspectLocation(item.location)"
                        title="Inspect Location Risk"
                      >
                        Inspect →
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- System Status Summary -->
        <div class="card system-status-card">
          <div class="card-header">
            <div>
              <div class="title-with-badge">
                <h3 class="card-title">System Health & Telemetry</h3>
              </div>
              <p class="card-subtitle">Microservice & data pipeline heartbeats</p>
            </div>
            <a routerLink="/admin" class="view-all-link">Admin Details →</a>
          </div>

          <div class="status-list">
            <div class="status-row">
              <div class="status-name-group">
                <span class="status-icon-dot" [class.dot-inactive]="!kpis"></span>
              <span class="service-name">MODEL (XGBoost Historical Baseline)</span>
              </div>
              <span class="badge" [ngClass]="kpis ? 'status-safe' : 'status-caution'">{{ loadingKpis ? 'CHECKING' : (kpis ? 'AVAILABLE' : 'UNAVAILABLE') }}</span>
            </div>

            <div class="status-row">
              <div class="status-name-group">
                <span class="status-icon-dot" [class.dot-inactive]="!floodZones.length"></span>
                <span class="service-name">SPATIAL GRID ({{ floodZones.length || '—' }} CELLS)</span>
              </div>
              <span class="badge" [ngClass]="floodZones.length ? 'status-safe' : 'status-caution'">{{ floodZones.length ? 'LOADED' : 'UNAVAILABLE' }}</span>
            </div>

            <div class="status-row">
              <div class="status-name-group">
                <span class="status-icon-dot" [class.dot-inactive]="!floodZones.length"></span>
                <span class="service-name">MAP DATA (GCC 500m Metric Grid)</span>
              </div>
              <span class="badge" [ngClass]="floodZones.length ? 'status-safe' : 'status-caution'">{{ floodZones.length ? 'AVAILABLE' : 'UNAVAILABLE' }}</span>
            </div>

            <div class="status-row">
              <div class="status-name-group">
                <span class="status-icon-dot" [class.dot-inactive]="!weatherCurrentAvailable || weatherIsStale"></span>
                <span class="service-name">RAINFALL PROVIDER (Open-Meteo)</span>
              </div>
              <span class="badge" [ngClass]="weatherCurrentAvailable && !weatherIsStale ? 'status-safe' : 'status-caution'">{{ weatherIsStale ? 'STALE CACHE' : (weatherCurrentAvailable ? 'CONNECTED' : 'UNAVAILABLE') }}</span>
            </div>

            <div class="status-row">
              <div class="status-name-group">
                <span class="status-icon-dot"></span>
                <span class="service-name">DRAINAGE DATA (KML 2023 SWD)</span>
              </div>
              <span class="badge status-safe font-mono">CONNECTED</span>
            </div>

            <div class="status-row">
              <div class="status-name-group">
                <span class="status-icon-dot dot-inactive" style="background-color: #f59e0b; box-shadow: 0 0 6px #f59e0b;"></span>
                <span class="service-name">HYDRAULIC SOLVER (1D/2D Saint-Venant)</span>
              </div>
              <span class="badge status-caution font-mono">NOT CONNECTED</span>
            </div>
          </div>

          <div class="status-card-footer">
            <div class="footer-metric">
              <span class="f-label">Inference Latency:</span>
              <span class="f-val font-mono">Not measured</span>
            </div>
            <div class="footer-metric">
              <span class="f-label">Grid Resolution:</span>
              <span class="f-val font-mono">500m × 500m</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Physical inundation estimates require a connected, calibrated solver. -->
      <div class="card eta-prediction-card">
        <div class="card-header eta-header">
          <div>
            <div class="title-with-badge">
              <span class="badge status-caution font-mono">NOT CONNECTED</span>
              <h3 class="card-title">Physical Inundation Depth & ETA</h3>
            </div>
            <p class="card-subtitle">
              A calibrated hydrodynamic solver and measured catchment storage inputs are not connected. FloodWatch cannot provide a verified water-depth or inundation-time estimate here.
            </p>
          </div>
          <div class="data-unavailable-panel">
            <strong>Water depth: unavailable · Inundation ETA: unavailable</strong>
            <span>Open-Meteo rainfall is a point weather estimate. It is not sufficient to calculate basin flooding without validated antecedent catchment rainfall, storage, drainage capacity, and an operational solver.</span>
            <a routerLink="/simulation" class="eta-link">Open Storm Scenario Studio →</a>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-page {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }
    .dashboard-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--border-light);
      width: 100%;
      box-sizing: border-box;
      min-width: 0;
    }
    .header-titles {
      min-width: 0;
      flex: 1 1 280px;
    }
    .welcome-heading {
      font-size: clamp(1.25rem, 2.5vw, 1.65rem);
      font-weight: 700;
      color: var(--text-main);
      overflow-wrap: anywhere;
      word-break: normal;
    }
    .welcome-sub {
      font-size: 0.875rem;
      color: var(--text-muted);
      margin-top: 0.2rem;
      overflow-wrap: anywhere;
      word-break: normal;
    }
    .header-meta {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
      background-color: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 0.5rem 1rem;
      box-shadow: var(--shadow-sm);
      box-sizing: border-box;
      min-width: 0;
      max-width: 100%;

      @media (max-width: 640px) {
        width: 100%;
        justify-content: space-between;
        gap: 0.5rem;
        padding: 0.5rem 0.75rem;
      }
    }
    .meta-item {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .meta-label {
      font-size: 0.68rem;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .meta-val {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--text-main);
      white-space: nowrap;
    }
    .status-live {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      color: var(--brand-primary);
    }
    .pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: var(--brand-primary);
      box-shadow: 0 0 6px var(--brand-primary);
    }
    .meta-divider {
      width: 1px;
      height: 24px;
      background-color: var(--border-subtle);
    }

    // KPI Grid
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1.25rem;
      width: 100%;
      box-sizing: border-box;
      min-width: 0;

      @media (max-width: 1300px) {
        grid-template-columns: repeat(2, 1fr);
      }
      @media (max-width: 640px) {
        grid-template-columns: 1fr;
        gap: 0.875rem;
      }
    }
    .kpi-icon {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .icon-water { color: #38bdf8; }
    .icon-danger { color: #ef4444; }
    .icon-road { color: #f59e0b; }
    .icon-bell { color: #a855f7; }

    // Dashboard Columns
    .dashboard-main-columns {
      display: grid;
      grid-template-columns: 1.6fr 1fr;
      gap: 1.25rem;
      width: 100%;
      box-sizing: border-box;
      min-width: 0;

      @media (max-width: 1100px) {
        grid-template-columns: 1fr;
      }
    }

    .title-with-badge {
      display: flex;
      align-items: center;
      gap: 0.65rem;
    }
    .text-highlight {
      color: var(--brand-primary);
    }

    .map-preview-card {
      display: flex;
      flex-direction: column;
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
    }
    .map-wrapper {
      position: relative;
      width: 100%;
      height: 420px;
      border-radius: var(--radius-md);
      overflow: hidden;
      border: 1px solid var(--border-subtle);
    }
    .leaflet-map-canvas {
      width: 100%;
      height: 100%;
    }
    .map-overlay-legend {
      position: absolute;
      bottom: 48px;
      left: 12px;
      z-index: 500;
      max-width: 220px;
      pointer-events: auto;
      @media (max-width: 640px) {
        display: none;
      }
    }
    .map-actions-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: var(--bg-glass);
      backdrop-filter: blur(8px);
      padding: 0.5rem 1rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 500;
      border-top: 1px solid var(--border-subtle);
    }
    .map-info-text {
      font-size: 0.76rem;
      color: var(--text-muted);
    }

    // Alerts Feed Panel
    .alerts-panel-card {
      display: flex;
      flex-direction: column;
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
    }
    .view-all-link {
      font-size: 0.8125rem;
      color: var(--brand-primary);
      text-decoration: none;
      font-weight: 600;
      &:hover {
        text-decoration: underline;
      }
    }
    .alerts-feed-list {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      overflow-y: auto;
      max-height: 420px;
      padding-right: 0.25rem;
    }
    .empty-feed-state {
      padding: 2.5rem 1.5rem;
      text-align: center;
      color: var(--text-dim);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.65rem;
    }
    .empty-icon {
      font-size: 1.5rem;
      color: var(--status-safe);
    }
    .empty-msg {
      font-size: 0.85rem;
    }

    // Inspection Modal Overlay & Card
    .inspection-modal-overlay {
      position: fixed;
      inset: 0;
      background-color: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      z-index: 2000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      animation: fadeIn 0.15s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .inspection-modal-card {
      background-color: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-xl);
      padding: 1.75rem;
      width: 100%;
      max-width: 580px;
      box-shadow: var(--shadow-lg);
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      animation: scaleIn 0.18s ease;
    }
    @keyframes scaleIn {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    .inspection-modal-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      border-bottom: 1px solid var(--border-light);
      padding-bottom: 0.85rem;
    }
    .inspection-title-group {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }
    .inspection-modal-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text-main);
    }
    .inspection-grid-id {
      font-size: 0.75rem;
      color: var(--text-dim);
    }
    .inspection-modal-body {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .inspection-kpi-row {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      background-color: var(--bg-darkest);
      padding: 1rem;
      border-radius: var(--radius-md);
      border: 1px solid var(--border-light);
    }
    .ins-item {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .ins-label {
      font-size: 0.72rem;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .ins-value {
      font-size: 1rem;
      font-weight: 700;
      color: var(--text-main);
    }
    .ins-desc {
      font-size: 0.875rem;
      color: var(--text-muted);
      line-height: 1.5;
    }
    .inspection-modal-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.75rem;
      border-top: 1px solid var(--border-light);
      padding-top: 1rem;
    }

    // Bottom Columns
    .dashboard-bottom-columns {
      display: grid;
      grid-template-columns: 1.6fr 1fr;
      gap: 1.25rem;
      width: 100%;
      box-sizing: border-box;
      min-width: 0;

      @media (max-width: 1100px) {
        grid-template-columns: 1fr;
      }
    }
    .predictions-card,
    .system-status-card {
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
    }

    .table-responsive {
      overflow-x: auto;
      width: 100%;
      box-sizing: border-box;
      min-width: 0;
      -webkit-overflow-scrolling: touch;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.835rem;

      th {
        padding: 0.65rem 0.85rem;
        background-color: var(--bg-darkest);
        color: var(--text-muted);
        font-weight: 600;
        text-transform: uppercase;
        font-size: 0.7rem;
        letter-spacing: 0.04em;
        border-bottom: 1px solid var(--border-subtle);
      }
      td {
        padding: 0.75rem 0.85rem;
        border-bottom: 1px solid var(--border-light);
        color: var(--text-main);
      }
      tbody tr:hover {
        background-color: rgba(148, 163, 184, 0.08);
      }
    }
    .location-cell {
      display: flex;
      flex-direction: column;
    }
    .sub-locality {
      font-size: 0.7rem;
      color: var(--text-dim);
    }
    .confidence-bar-wrap {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .confidence-val {
      font-size: 0.75rem;
      font-weight: 600;
      min-width: 32px;
    }
    .progress-bar-bg {
      flex: 1;
      height: 6px;
      background-color: var(--bg-darkest);
      border-radius: var(--radius-full);
      overflow: hidden;
      border: 1px solid var(--border-light);
    }
    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--brand-primary), var(--status-safe));
      border-radius: var(--radius-full);
    }
    .btn-table-action {
      font-size: 0.75rem;
      color: var(--brand-primary);
      font-weight: 600;
      padding: 0.25rem 0.5rem;
      border-radius: var(--radius-sm);
      border: 1px solid transparent;
      &:hover {
        background-color: rgba(37, 99, 235, 0.1);
        border-color: rgba(37, 99, 235, 0.25);
      }
    }

    // System Status Card
    .status-list {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }
    .status-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.65rem 0.85rem;
      background-color: var(--bg-darkest);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-sm);
    }
    .status-name-group {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .status-icon-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: var(--status-safe);
      box-shadow: 0 0 6px var(--status-safe);
    }
    .status-icon-dot.dot-inactive { background-color: #f59e0b; box-shadow: 0 0 6px rgba(245, 158, 11, 0.55); }
    .service-name {
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--text-main);
    }
    .status-card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 1.25rem;
      padding-top: 0.85rem;
      border-top: 1px solid var(--border-light);
      font-size: 0.75rem;
    }
    .footer-metric {
      display: flex;
      gap: 0.35rem;
    }
    .f-label {
      color: var(--text-dim);
    }
    .f-val {
      color: var(--text-main);
      font-weight: 600;
    }

    // Operational Diagnostics Grid (Section 10, 11, 12)
    .ops-diagnostics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1.25rem;
      width: 100%;
      box-sizing: border-box;
      min-width: 0;

      @media (max-width: 1300px) {
        grid-template-columns: repeat(2, 1fr);
      }
      @media (max-width: 680px) {
        grid-template-columns: 1fr;
        gap: 0.875rem;
      }
    }
    .ops-diag-card {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      background-color: var(--bg-card);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-md);
      padding: 1rem;
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
      overflow-wrap: anywhere;
      word-break: normal;
    }
    .ops-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .ops-card-label {
      font-size: 0.68rem;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .ops-card-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text-main);
      margin-top: 0.15rem;
    }
    .ops-card-sub {
      font-size: 0.72rem;
      color: var(--text-muted);
    }
    .risk-index-badge {
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.3);
      padding: 0.2rem 0.5rem;
      border-radius: var(--radius-sm);
    }
    .score-large {
      font-size: 1.15rem;
      font-weight: 800;
      color: #ef4444;
    }
    .score-denom {
      font-size: 0.7rem;
      color: var(--text-muted);
    }
    .drivers-list {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
    }
    .driver-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.76rem;
      background-color: var(--bg-darkest);
      padding: 0.35rem 0.6rem;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-light);
    }
    .d-name {
      color: var(--text-muted);
      font-weight: 500;
    }
    .d-val {
      font-weight: 600;
      color: var(--text-main);
    }
    .src-tag {
      font-size: 0.62rem;
      font-weight: 700;
      padding: 0.15rem 0.35rem;
      border-radius: 3px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .tag-obs { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .tag-derived { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
    .tag-model { background: rgba(168, 85, 247, 0.15); color: #c084fc; }
    .tag-unavail { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }

    .soil-state-box {
      background-color: var(--bg-darkest);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-sm);
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .soil-status-text {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-dim);
    }
    .soil-desc {
      font-size: 0.72rem;
      color: var(--text-muted);
      line-height: 1.4;
    }

    // Map Layer Controls (Section 22)
    .map-layers-bar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 1rem;
      background-color: var(--bg-darkest);
      border-bottom: 1px solid var(--border-light);
      flex-wrap: wrap;
    }
    .layers-bar-label {
      font-size: 0.7rem;
      color: var(--text-dim);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .layer-chips {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .layer-chip {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.72rem;
      color: var(--text-muted);
      background-color: var(--bg-card);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-sm);
      padding: 0.2rem 0.55rem;
      cursor: pointer;
      user-select: none;
      &.active {
        color: var(--text-main);
        border-color: var(--brand-primary);
      }
      &.disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      input[type="checkbox"] {
        accent-color: var(--brand-primary);
      }
    }
    .layer-status-pill {
      font-size: 0.6rem;
      background: rgba(245, 158, 11, 0.2);
      color: #fbbf24;
      padding: 0.05rem 0.3rem;
      border-radius: 3px;
    }

    /* Weather Telemetry Console */
    .weather-telemetry-card {
      background: linear-gradient(180deg, var(--bg-card) 0%, rgba(15, 23, 42, 0.95) 100%);
      border: 1px solid var(--border-subtle);
    }
    .weather-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .weather-actions { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; }
    .weather-actions select { max-width: 19rem; }
    .rainfall-live-panel { padding: 1rem 1.25rem; }
    .rainfall-live-heading { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; color: var(--text-dim); font-size: 0.8rem; }
    .rainfall-live-heading strong { color: var(--text-main); }
    .stale-data { color: #d97706; }
    .weather-error { display: flex; justify-content: space-between; align-items: center; gap: .75rem; color: #dc2626; padding: .7rem .85rem; border-radius: var(--radius-sm); background: rgba(220,38,38,.08); }
    .weather-diagnostics { display: flex; flex-wrap: wrap; gap: 0.45rem 1rem; padding: 0.75rem 0; color: var(--text-dim); font-size: 0.72rem; }
    .weather-diagnostics strong { color: var(--text-main); font-weight: 600; }
    .weather-empty { color: var(--text-dim); }
    .rainfall-chart-wrap { margin-top: 1rem; }
    .rainfall-chart-toolbar { display: flex; align-items: center; justify-content: space-between; gap: .75rem; flex-wrap: wrap; }
    .rainfall-chart-switch { display: inline-flex; gap: .25rem; padding: .2rem; border: 1px solid var(--border-light); border-radius: var(--radius-sm); }
    .rainfall-chart-switch button { border: 0; border-radius: 4px; padding: .35rem .6rem; color: var(--text-dim); background: transparent; cursor: pointer; font-size: .72rem; }
    .rainfall-chart-switch button.active { color: var(--text-main); background: rgba(56,189,248,.16); }
    .rainfall-skeleton { display: grid; grid-template-columns: repeat(4, 1fr); gap: .6rem; padding: 1rem 0; }
    .rainfall-skeleton span { min-height: 3.5rem; border-radius: var(--radius-sm); background: linear-gradient(90deg, rgba(148,163,184,.10), rgba(148,163,184,.22), rgba(148,163,184,.10)); background-size: 200% 100%; animation: rainfall-shimmer 1.3s linear infinite; }
    @keyframes rainfall-shimmer { to { background-position: -200% 0; } }
    .rainfall-chart-title { color: var(--text-dim); font-size: 0.78rem; margin-bottom: 0.5rem; }
    .rainfall-chart-wrap svg { width: 100%; height: 9rem; overflow: visible; background: linear-gradient(180deg, rgba(56,189,248,.12), transparent); border-bottom: 1px solid var(--border-light); }
    .rainfall-hourly-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(6.6rem, 1fr)); gap: 0.45rem; margin-top: 0.75rem; }
    .rainfall-hourly-grid > div { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.55rem; border-radius: var(--radius-sm); background: rgba(148,163,184,.1); }
    .rainfall-hourly-grid strong { color: var(--text-main); font-size: 0.8rem; }
    .rainfall-hourly-grid span, .rainfall-hourly-grid small { color: var(--text-dim); font-size: 0.67rem; }
    .weather-badge-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.4rem;
      flex-wrap: wrap;
    }
    .badge-live-pulse {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.68rem;
      font-weight: 700;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: var(--radius-sm);
      padding: 0.2rem 0.55rem;
      letter-spacing: 0.04em;
    }
    .badge-radar {
      font-size: 0.68rem;
      color: #fbbf24;
      background: rgba(251, 191, 36, 0.12);
      border: 1px solid rgba(251, 191, 36, 0.25);
      border-radius: var(--radius-sm);
      padding: 0.2rem 0.55rem;
    }
    .badge-source {
      font-size: 0.68rem;
      color: var(--text-dim);
      background: var(--bg-darkest);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-sm);
      padding: 0.2rem 0.55rem;
    }
    .atm-params-strip {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 0.75rem;
      padding: 1rem 1.25rem;
      background: rgba(2, 6, 23, 0.6);
      border-top: 1px solid var(--border-light);
      border-bottom: 1px solid var(--border-light);
      width: 100%;
      box-sizing: border-box;
      min-width: 0;

      @media (max-width: 1300px) { grid-template-columns: repeat(3, 1fr); }
      @media (max-width: 640px) { grid-template-columns: repeat(2, 1fr); }
      @media (max-width: 400px) { grid-template-columns: 1fr; }
    }
    .atm-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 0;
    }
    .atm-label {
      font-size: 0.68rem;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .atm-val {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text-main);
    }
    .aws-stations-section {
      padding: 1rem 1.25rem;
      width: 100%;
      box-sizing: border-box;
      min-width: 0;
    }
    .aws-stations-title {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 0.75rem;
      flex-wrap: wrap;
      gap: 0.5rem;
      min-width: 0;
    }
    .aws-count {
      color: var(--brand-primary);
      font-size: 0.72rem;
    }
    .aws-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.75rem;
      width: 100%;
      box-sizing: border-box;
      min-width: 0;

      @media (max-width: 1300px) { grid-template-columns: repeat(2, 1fr); }
      @media (max-width: 640px) { grid-template-columns: 1fr; }
    }
    .aws-card {
      background: var(--bg-card-subtle);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-md);
      padding: 0.65rem 0.85rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
      transition: transform 0.15s ease, border-color 0.15s ease;
      &:hover {
        border-color: rgba(56, 189, 248, 0.4);
        transform: translateY(-1px);
      }
    }
    .aws-card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
    }
    .aws-station-name {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-main);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .aws-status-tag {
      font-size: 0.6rem;
      color: #34d399;
      background: rgba(52, 211, 153, 0.12);
      padding: 0.1rem 0.35rem;
      border-radius: 3px;
      font-weight: 700;
    }
    .aws-card-metrics {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .aws-metric {
      display: flex;
      align-items: baseline;
      gap: 0.25rem;
    }
    .m-val {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--text-main);
    }
    .m-unit {
      font-size: 0.65rem;
      color: var(--text-dim);
    }

    /* ETA Prediction Card */
    .eta-prediction-card {
      background: linear-gradient(180deg, var(--bg-card) 0%, rgba(15, 23, 42, 0.98) 100%);
      border: 1px solid var(--border-subtle);
      border-top: 3px solid #3b82f6;
    }
    .eta-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 1.25rem;
    }
    .eta-controls-group {
      display: flex;
      align-items: flex-end;
      gap: 1.25rem;
      flex-wrap: wrap;
    }
    .eta-input-wrap {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .eta-input-label {
      font-size: 0.7rem;
      color: var(--text-dim);
      font-weight: 600;
      text-transform: uppercase;
    }
    .slider-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .eta-slider {
      accent-color: #3b82f6;
      width: 140px;
      cursor: pointer;
    }
    .eta-slider-val {
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--text-main);
      min-width: 68px;
    }
    .btn-pred-eta {
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.55rem 1.15rem;
    }
    .btn-spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .presets-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1.25rem;
      background: var(--bg-darkest);
      border-top: 1px solid var(--border-light);
      border-bottom: 1px solid var(--border-light);
      flex-wrap: wrap;
    }
    .presets-label {
      font-size: 0.7rem;
      color: var(--text-dim);
      font-weight: 600;
    }
    .preset-pill {
      background: var(--bg-card);
      border: 1px solid var(--border-light);
      color: var(--text-muted);
      border-radius: var(--radius-sm);
      padding: 0.2rem 0.6rem;
      font-size: 0.72rem;
      cursor: pointer;
      transition: all 0.15s ease;
      &:hover {
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
        border-color: #3b82f6;
      }
      &.alert-pill:hover {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
        border-color: #ef4444;
      }
    }

    .eta-results-showcase {
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .eta-summary-bar {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
      background: rgba(2, 6, 23, 0.7);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-md);
      padding: 0.85rem 1.25rem;
      width: 100%;
      box-sizing: border-box;
      min-width: 0;

      @media (max-width: 1100px) { grid-template-columns: repeat(2, 1fr); }
      @media (max-width: 520px) { grid-template-columns: 1fr; }
    }
    .summary-stat {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 0;
    }
    .s-label {
      font-size: 0.68rem;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .s-val {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text-main);
    }
    .eta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
      width: 100%;
      box-sizing: border-box;
      min-width: 0;

      @media (max-width: 1300px) { grid-template-columns: repeat(2, 1fr); }
      @media (max-width: 700px) { grid-template-columns: 1fr; }
    }
    .eta-card {
      background: var(--bg-card);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-md);
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
      overflow-wrap: anywhere;
      word-break: normal;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      &.is-flooding {
        border-color: rgba(239, 68, 68, 0.4);
        box-shadow: 0 4px 14px rgba(239, 68, 68, 0.08);
      }
      &.is-safe {
        border-color: rgba(16, 185, 129, 0.3);
      }
      &:hover {
        transform: translateY(-2px);
      }
    }
    .eta-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.5rem;
    }
    .locality-name {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text-main);
      margin: 0;
    }
    .locality-elev {
      font-size: 0.68rem;
      color: var(--text-dim);
    }
    .eta-status-pill {
      font-size: 0.62rem;
      font-weight: 700;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      letter-spacing: 0.03em;
      white-space: nowrap;
    }
    .pill-danger { background: rgba(239, 68, 68, 0.18); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
    .pill-warning { background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .pill-success { background: rgba(16, 185, 129, 0.18); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }

    .eta-time-banner {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      background: var(--bg-darkest);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-sm);
      padding: 0.55rem 0.75rem;
    }
    .eta-clock-icon {
      font-size: 1.2rem;
    }
    .eta-time-info {
      display: flex;
      flex-direction: column;
    }
    .eta-time-label {
      font-size: 0.62rem;
      color: var(--text-dim);
      text-transform: uppercase;
    }
    .eta-time-val {
      font-size: 0.9rem;
      font-weight: 700;
    }
    .eta-hydraulic-breakdown {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      background: rgba(15, 23, 42, 0.4);
      padding: 0.45rem 0.6rem;
      border-radius: var(--radius-sm);
    }
    .h-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.72rem;
    }
    .h-label { color: var(--text-muted); }
    .h-val { font-weight: 600; color: var(--text-main); }
    .eta-card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 0.35rem;
      border-top: 1px solid var(--border-light);
    }
    .eta-link {
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--brand-primary);
      text-decoration: none;
      &:hover { text-decoration: underline; }
    }

    /* DNO Hydrodynamic Nowcast Styles */
    .dno-hydrodynamic-card {
      border: 1px solid rgba(6, 182, 212, 0.3);
      box-shadow: 0 4px 20px rgba(6, 182, 212, 0.08);
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .dno-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 1.25rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--border-light);
    }
    .dno-title-group {
      flex: 1 1 340px;
      min-width: 0;
    }
    .dno-badge-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .dno-pill-pulse {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: #06b6d4;
      background: rgba(6, 182, 212, 0.12);
      border: 1px solid rgba(6, 182, 212, 0.35);
      border-radius: var(--radius-full);
      padding: 0.2rem 0.65rem;
    }
    .dno-disabled-pill { color: #64748b; background: #f1f5f9; border-color: #cbd5e1; }
    .dno-disabled-pill .pulse-dot-cyan { background: #94a3b8; box-shadow: none; animation: none; }
    .dno-device-unavailable { color: #64748b; background: #f1f5f9; border-color: #cbd5e1; }
    .dno-disabled-note { max-width: 360px; align-self: center; color: #475569; background: #f1f5f9; border: 1px solid #dbe3ed; border-radius: var(--radius-md); padding: 0.65rem 0.8rem; font-size: 0.78rem; line-height: 1.4; }
    .pulse-dot-cyan {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #06b6d4;
      box-shadow: 0 0 8px #06b6d4;
      animation: dnoPulse 1.8s infinite;
    }
    @keyframes dnoPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    .dno-tag {
      font-size: 0.65rem;
      font-weight: 600;
      color: var(--text-muted);
      background: var(--bg-surface);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-sm);
      padding: 0.15rem 0.45rem;
    }
    .dno-tag-device {
      font-size: 0.65rem;
      font-weight: 700;
      color: #10b981;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: var(--radius-sm);
      padding: 0.15rem 0.5rem;
    }
    .device-cuda {
      color: #06b6d4;
      background: rgba(6, 182, 212, 0.1);
      border-color: rgba(6, 182, 212, 0.3);
    }
    .dno-main-title {
      font-size: 1.2rem;
      font-weight: 700;
      color: var(--text-main);
      margin: 0 0 0.35rem 0;
    }
    .dno-sub-text {
      font-size: 0.8rem;
      color: var(--text-muted);
      line-height: 1.45;
      margin: 0;
    }
    .dno-event-controls {
      display: flex;
      align-items: flex-end;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
    .dno-select-wrap {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .dno-select-label {
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--text-dim);
      text-transform: uppercase;
    }
    .dno-event-select {
      background: var(--bg-card);
      border: 1px solid var(--border-light);
      color: var(--text-main);
      border-radius: var(--radius-md);
      padding: 0.45rem 0.75rem;
      font-size: 0.8rem;
      outline: none;
      min-width: 220px;
      &:focus { border-color: #06b6d4; }
    }
    .dno-run-btn {
      padding: 0.45rem 1rem;
      font-size: 0.82rem;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: linear-gradient(135deg, #0284c7 0%, #06b6d4 100%);
      border: none;
      &:hover:not(:disabled) {
        background: linear-gradient(135deg, #0369a1 0%, #0891b2 100%);
      }
    }
    .dno-loading-banner {
      display: flex;
      align-items: center;
      gap: 1rem;
      background: rgba(6, 182, 212, 0.08);
      border: 1px dashed rgba(6, 182, 212, 0.4);
      border-radius: var(--radius-md);
      padding: 1rem 1.25rem;
    }
    .dno-spinner {
      width: 28px;
      height: 28px;
      border: 3px solid rgba(6, 182, 212, 0.2);
      border-top-color: #06b6d4;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .dno-load-title {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-main);
    }
    .dno-load-sub {
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    .dno-error-banner {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
      padding: 0.75rem 1rem;
      border-radius: var(--radius-md);
      font-size: 0.82rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .dno-unavailable-banner { color: #475569; background: #f1f5f9; border-color: #dbe3ed; }
    .dno-kpi-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 0.75rem;
    }
    .dno-kpi-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-md);
      padding: 0.75rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }
    .kpi-label {
      font-size: 0.68rem;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .kpi-val-row {
      display: flex;
      align-items: baseline;
      gap: 0.35rem;
    }
    .kpi-number {
      font-size: 1.35rem;
      font-weight: 700;
      line-height: 1.2;
    }
    .kpi-unit {
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    .kpi-sub {
      font-size: 0.68rem;
      color: var(--text-dim);
    }
    .dno-timeline-container {
      background: var(--bg-surface);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-md);
      padding: 1rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .timeline-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
    .timeline-title-wrap {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .timeline-title {
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--text-main);
    }
    .timeline-curr-step {
      font-size: 0.75rem;
      font-weight: 700;
      color: #06b6d4;
      background: rgba(6, 182, 212, 0.12);
      border: 1px solid rgba(6, 182, 212, 0.3);
      padding: 0.15rem 0.5rem;
      border-radius: var(--radius-sm);
    }
    .timeline-actions {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .btn-step {
      background: var(--bg-card);
      border: 1px solid var(--border-light);
      color: var(--text-main);
      padding: 0.3rem 0.65rem;
      font-size: 0.75rem;
      font-weight: 600;
      border-radius: var(--radius-sm);
      cursor: pointer;
      &:hover:not(:disabled) { border-color: #06b6d4; color: #06b6d4; }
      &:disabled { opacity: 0.4; cursor: not-allowed; }
    }
    .btn-play {
      background: rgba(6, 182, 212, 0.15);
      border-color: rgba(6, 182, 212, 0.4);
      color: #06b6d4;
    }
    .timeline-slider-track {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .dno-timeline-slider {
      width: 100%;
      height: 6px;
      border-radius: 3px;
      outline: none;
      background: var(--bg-card);
      accent-color: #06b6d4;
      cursor: pointer;
    }
    .timeline-ticks {
      display: flex;
      justify-content: space-between;
      font-size: 0.68rem;
      color: var(--text-dim);
      font-family: var(--font-mono);
    }
    .timeline-ticks .tick.active {
      color: #06b6d4;
      font-weight: 700;
    }
    .dno-details-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 1rem;
    }
    .dno-detail-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-md);
      padding: 1rem;
    }
    .detail-card-title {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text-main);
      margin: 0 0 0.25rem 0;
    }
    .detail-card-sub {
      font-size: 0.72rem;
      color: var(--text-muted);
      margin: 0 0 0.75rem 0;
    }
    .threshold-rows {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
    }
    .th-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.35rem 0.5rem;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      font-size: 0.75rem;
    }
    .th-label { color: var(--text-muted); }
    .th-val { color: var(--text-dim); font-size: 0.7rem; }
    .th-area { font-weight: 600; }
    .severity-bars {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .sev-row {
      display: grid;
      grid-template-columns: 140px 1fr 45px;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.72rem;
    }
    .sev-name { color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sev-bar-bg {
      height: 6px;
      background: var(--bg-card);
      border-radius: 3px;
      overflow: hidden;
    }
    .sev-bar-fill {
      height: 100%;
      border-radius: 3px;
    }
    .fill-dry { background: #64748b; }
    .fill-low { background: #3b82f6; }
    .fill-minor { background: #06b6d4; }
    .fill-mod { background: #f59e0b; }
    .fill-sev { background: #ea580c; }
    .fill-vsev { background: #dc2626; }
    .fill-ext { background: #7f1d1d; }
    .sev-count { text-align: right; color: var(--text-dim); }
    .dno-separation-panel {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1rem;
      padding-top: 0.5rem;
      border-top: 1px solid var(--border-light);
    }
    .sep-box {
      border-radius: var(--radius-md);
      padding: 0.85rem 1rem;
    }
    .sep-operational {
      background: rgba(16, 185, 129, 0.05);
      border: 1px solid rgba(16, 185, 129, 0.25);
    }
    .sep-experimental {
      background: rgba(6, 182, 212, 0.05);
      border: 1px solid rgba(6, 182, 212, 0.25);
    }
    .sep-badge {
      display: inline-block;
      font-size: 0.62rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      padding: 0.1rem 0.4rem;
      border-radius: var(--radius-sm);
      margin-bottom: 0.35rem;
    }
    .sep-operational .sep-badge {
      color: #10b981;
      background: rgba(16, 185, 129, 0.15);
    }
    .sep-experimental .sep-badge {
      color: #06b6d4;
      background: rgba(6, 182, 212, 0.15);
    }
    .sep-title {
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--text-main);
      margin: 0 0 0.25rem 0;
    }
    .sep-desc {
      font-size: 0.72rem;
      color: var(--text-muted);
      line-height: 1.4;
      margin: 0;
    }
    .map-btn-group {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
  `]
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('miniMapContainer') miniMapContainer!: ElementRef;

  private readonly rainfallApi = inject(RainfallApiService);
  public dnoService: DnoService = inject(DnoService);

  layerDno = false;
  dnoPlayingTimeline = false;
  private dnoPlayTimer?: any;
  currentDnoForecast: DNOTimestepForecast | null = null;
  private dnoLayerGroup = L.layerGroup();
  private dnoPilotBoundsRect?: L.Rectangle;
  private cachedGeoJsonMap = new Map<number, any>();

  greeting = 'Good Afternoon';
  currentDate = '';
  currentHorizon: PredictionTime = 'NOW';

  kpis: SystemKPIs | null = null;
  loadingKpis = true;
  alerts: FloodAlert[] = [];
  recentPredictions: RecentPrediction[] = [];
  floodZones: FloodZone[] = [];
  selectedZone: FloodZone | null = null;

  layerRadar = true;
  layerHotspots = true;
  layerDrainage = true;
  layerRoutes = false;

  // Dynamic Open-Meteo point estimate and hourly forecast.
  weatherLocations: RainfallLocation[] = [];
  selectedWeatherLocation = '';
  weatherCurrent: RainfallReading | null = null;
  weatherHourly: RainfallForecastHour[] = [];
  weatherLoading = false;
  weatherError = '';
  weatherFetchedAt = '';
  weatherLastSuccessAt = '';
  weatherLastFailureAt = '';
  weatherProviderTimestamp = '';
  weatherIsStale = false;
  weatherForecastIsStale = false;
  weatherForecastCacheAge = 'Unknown';
  weatherStatusLabel = 'WEATHER UNAVAILABLE';
  weatherConnectionLabel = 'Checking';
  weatherCacheLabel = 'No cached reading';
  weatherDataTypeLabel = 'MODEL ESTIMATE';
  weatherLocationName = 'Chennai reference point';
  weatherCoordinates = '—';
  cityWeather: { temp: number | null; humidity: number | null; pressure: number | null; wind: string | null } =
    { temp: null, humidity: null, pressure: null, wind: null };
  rainChartPoints = '';
  rainChartMetric: 'rainfall' | 'probability' = 'rainfall';
  private rainPointMarker?: L.CircleMarker;
  private weatherRefreshTimer?: ReturnType<typeof setInterval>;
  private weatherRefreshIntervalSeconds = 3600;

  soilSaturationPct: number | null = null;
  soilMoistureM3M3: number | null = null;
  soilTelemetryStatus = 'UNAVAILABLE';
  soilTelemetrySource = 'Waiting for rainfall telemetry';

  private map?: L.Map;
  private zoneLayersGroup = L.layerGroup();
  private resizeHandler?: () => void;

  constructor(
    private floodService: FloodService,
    public alertService: AlertService,
    public themeService: ThemeService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initGreetingAndDate();
    this.loadKPIs();
    this.loadAlerts();
    this.loadRecentPredictions();
    this.loadWeatherTelemetry();
    this.loadDnoHealthAndEvents();
  }

  loadWeatherTelemetry(): void {
    this.weatherLoading = true;
    this.weatherError = '';
    this.rainfallApi.locations().subscribe({
      next: res => {
        this.weatherLocations = Array.isArray(res?.locations) ? res.locations : [];
        this.weatherRefreshIntervalSeconds = Math.max(60, Number(res?.refresh_interval_seconds ?? this.weatherRefreshIntervalSeconds));
        if (!this.selectedWeatherLocation && this.weatherLocations.length) this.selectedWeatherLocation = this.weatherLocations[0].id;
        this.fetchSelectedWeather();
        if (this.weatherRefreshTimer) clearInterval(this.weatherRefreshTimer);
        this.weatherRefreshTimer = setInterval(() => this.fetchSelectedWeather(), this.weatherRefreshIntervalSeconds * 1000);
      },
      error: () => { this.weatherLoading = false; this.weatherError = 'Weather location configuration is unavailable.'; }
    });
  }

  selectWeatherLocation(event: Event): void {
    this.selectedWeatherLocation = (event.target as HTMLSelectElement).value;
    this.fetchSelectedWeather();
  }

  private fetchSelectedWeather(): void {
    if (!this.selectedWeatherLocation) { this.weatherLoading = false; return; }
    const loc = this.weatherLocations.find(item => item.id === this.selectedWeatherLocation);
    this.weatherLocationName = loc?.name ?? 'Selected location';
    this.weatherCoordinates = loc ? `${Number(loc.latitude).toFixed(5)}, ${Number(loc.longitude).toFixed(5)}` : '—';
    this.rainfallApi.current(this.selectedWeatherLocation).subscribe({
      next: current => {
        this.weatherCurrent = current;
        this.weatherProviderTimestamp = this.formatChennaiTimestamp(current.timestamp);
        this.weatherFetchedAt = this.formatChennaiTimestamp(current.fetched_at);
        this.weatherLastSuccessAt = this.weatherFetchedAt;
        this.weatherLastFailureAt = this.formatChennaiTimestamp(current.last_failed_refresh_at);
        this.weatherIsStale = Boolean(current.is_stale) || current.status === 'stale';
        this.weatherStatusLabel = this.weatherStatusText(current.status, current.failure_type);
        this.updateRainfallKpiProvenance(current.status, current.precipitation_mm, current.fetched_at);
        this.weatherConnectionLabel = current.status === 'success' ? 'Connected' :
          (current.status === 'cached' ? 'Using saved response; refresh not confirmed' : 'Unavailable');
        this.weatherCacheLabel = current.cached_data_available
          ? (this.weatherIsStale ? 'Available · stale' : (current.freshness === 'cached' ? 'Available · restored from database' : 'Available · recent'))
          : 'No cached reading';
        if (current.error) this.weatherError = this.weatherDiagnosticMessage(current.failure_type);
        this.cityWeather = { temp: current.temperature_c ?? null, humidity: current.humidity_percent ?? null,
          pressure: null, wind: current.wind_speed_kmh == null ? null : `${current.wind_speed_kmh} km/h` };
        this.soilSaturationPct = null;
        this.soilMoistureM3M3 = null;
        this.soilTelemetryStatus = 'UNAVAILABLE';
        this.soilTelemetrySource = 'No soil moisture product is connected';
        this.applyRainfallPointToMap(current);
      },
      error: () => {
        this.weatherError = 'Could not retrieve rainfall from the FloodWatch backend. The last displayed reading is retained when available.';
        this.weatherConnectionLabel = 'Backend unavailable';
        if (this.weatherCurrent) { this.weatherIsStale = true; this.weatherStatusLabel = 'CACHED DATA · BACKEND UNAVAILABLE'; this.weatherCacheLabel = 'Last reading retained · stale'; }
        else this.weatherStatusLabel = 'WEATHER UNAVAILABLE';
      }
    });
    this.rainfallApi.status(this.selectedWeatherLocation).subscribe({
      next: status => {
        this.weatherConnectionLabel = status.status === 'success' ? 'Connected' :
          (status.status === 'cached' ? 'Saved data available; provider refresh not confirmed' : 'Unavailable');
        this.weatherIsStale = Boolean(status.is_stale) || status.status === 'stale';
        this.weatherLastSuccessAt = this.formatChennaiTimestamp(status.last_successful_fetch_at);
        this.weatherLastFailureAt = this.formatChennaiTimestamp(status.last_failed_refresh_at);
        this.weatherCacheLabel = status.cached_data_available
          ? (this.weatherIsStale ? 'Available · stale' : (status.freshness === 'cached' ? 'Available · restored from database' : 'Available · recent'))
          : 'No cached reading';
        this.weatherStatusLabel = this.weatherStatusText(status.status, status.failure_type);
        this.weatherForecastIsStale = Boolean(status.forecast_is_stale);
        this.weatherForecastCacheAge = this.formatCacheAge(status.forecast_cache_age_seconds);
        this.updateRainfallKpiProvenance(status.status, this.weatherCurrent?.precipitation_mm, status.last_successful_fetch_at);
        if (status.error) this.weatherError = this.weatherDiagnosticMessage(status.failure_type);
      },
      error: () => {
        this.weatherConnectionLabel = 'Status unavailable';
        if (this.weatherCurrent) { this.weatherIsStale = true; this.weatherCacheLabel = 'Last reading retained · freshness unconfirmed'; }
      }
    });
    this.rainfallApi.hourly(this.selectedWeatherLocation).subscribe({
      next: forecast => {
        this.weatherHourly = forecast.status === 'success' || forecast.status === 'stale' || forecast.status === 'cached' ? (forecast.hourly ?? []) : [];
        this.weatherForecastCacheAge = this.formatCacheAge(forecast.forecast_cache_age_seconds);
        this.weatherForecastIsStale = Boolean(forecast.forecast_is_stale) ||
          this.weatherHourly.some((hour: any) => this.timestampAgeSeconds(hour.fetched_at) > this.weatherRefreshIntervalSeconds);
        this.weatherDataTypeLabel = `FORECAST · ${forecast.forecast_hours_available ?? 0} HOURS`;
        this.rainChartPoints = this.buildRainChart(this.weatherHourly.slice(0, 48));
        this.weatherLoading = false;
      },
      error: () => {
        this.weatherForecastIsStale = this.weatherHourly.length > 0;
        this.weatherLoading = false;
        if (!this.weatherError) this.weatherError = 'Could not refresh the hourly forecast. Previously loaded forecast data is retained when available.';
      }
    });
  }

  get weatherCurrentAvailable(): boolean {
    return typeof this.weatherCurrent?.precipitation_mm === 'number' && Number.isFinite(this.weatherCurrent.precipitation_mm);
  }

  get weatherChartAvailable(): boolean {
    return this.weatherHourly.slice(0, 48).some(hour => this.chartValue(hour) !== null);
  }

  private formatCacheAge(seconds?: number | null): string {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return 'Unknown';
    if (seconds < 60) return `${Math.round(seconds)} sec`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
    return `${Math.floor(seconds / 3600)} hr ${Math.floor((seconds % 3600) / 60)} min`;
  }

  private weatherStatusText(status: string, failureType?: string | null): string {
    if (status === 'success') return 'LIVE PROVIDER RESPONSE';
    if (status === 'cached') return 'CACHED RESPONSE · REFRESH NOT CONFIRMED';
    if (status === 'stale') return `STALE CACHED RESPONSE · ${String(failureType ?? 'provider').toUpperCase()} FAILURE`;
    return `WEATHER UNAVAILABLE · ${String(failureType ?? 'provider').toUpperCase()} FAILURE`;
  }

  private updateRainfallKpiProvenance(status: string, value: number | null | undefined, fetchedAt?: string | null): void {
    if (!this.kpis) return;
    let rainfallDelta = this.kpis.rainfallDelta;
    if (status === 'cached' || status === 'stale') {
      const time = this.formatChennaiTimestamp(fetchedAt);
      rainfallDelta = `Cached model estimate${time ? ` · retrieved ${time}` : ''}`;
    } else if (status === 'unavailable' && value == null) {
      rainfallDelta = 'Live rainfall unavailable';
      this.kpis = { ...this.kpis, currentRainfall: null };
    }
    if (rainfallDelta !== this.kpis.rainfallDelta) this.kpis = { ...this.kpis, rainfallDelta };
  }

  private weatherDiagnosticMessage(failureType?: string | null): string {
    const messages: Record<string, string> = {
      dns: 'FloodWatch could not resolve the Open-Meteo host. Check this Mac’s internet and DNS settings.',
      network: 'FloodWatch could not connect to Open-Meteo. Check internet access, VPN, proxy, or firewall settings.',
      timeout: 'Open-Meteo did not respond before the request timed out. Cached rainfall is shown when available.',
      rate_limit: 'Open-Meteo rate-limited this request. FloodWatch will retry after its configured refresh interval.',
      provider: 'Open-Meteo is temporarily unavailable. Cached rainfall is shown when available.',
      api_error: 'Open-Meteo rejected the request. Check the weather endpoint configuration and provider response.',
      invalid_response: 'Open-Meteo returned a response that FloodWatch could not validate.'
    };
    return messages[failureType ?? ''] ?? 'The weather refresh failed. Cached rainfall is shown when available.';
  }

  formatChennaiTimestamp(value?: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short'
    }).format(date) + ' IST';
  }

  private timestampAgeSeconds(value?: string | null): number {
    if (!value) return Number.POSITIVE_INFINITY;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? Math.max(0, (Date.now() - timestamp) / 1000) : Number.POSITIVE_INFINITY;
  }

  setRainChartMetric(metric: 'rainfall' | 'probability'): void {
    this.rainChartMetric = metric;
    this.rainChartPoints = this.buildRainChart(this.weatherHourly.slice(0, 48));
  }

  chartValue(hour: RainfallForecastHour): number | null {
    const value = this.rainChartMetric === 'rainfall' ? hour.precipitation_mm : hour.precipitation_probability;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  chartTooltip(hour: RainfallForecastHour): string {
    const value = this.chartValue(hour);
    return value == null ? 'Value unavailable' : this.rainChartMetric === 'rainfall' ? `${value} mm` : `${value}% probability`;
  }

  chartX(index: number): number {
    const count = Math.min(this.weatherHourly.length, 48);
    return count <= 1 ? 300 : index * 600 / (count - 1);
  }

  chartY(hour: RainfallForecastHour): number {
    const values = this.weatherHourly.slice(0, 48).map(item => this.chartValue(item)).filter((value): value is number => value !== null);
    const max = this.rainChartMetric === 'probability' ? 100 : Math.max(...values, 1);
    const value = this.chartValue(hour) ?? 0;
    return 140 - value / max * 125;
  }

  private buildRainChart(values: RainfallForecastHour[]): string {
    if (!values.length) return '';
    const validValues = values.map(value => this.chartValue(value)).filter((value): value is number => value !== null);
    if (!validValues.length) return '';
    const max = this.rainChartMetric === 'probability' ? 100 : Math.max(...validValues, 1);
    let segmentOpen = false;
    return values.map((hour, i) => {
      const value = this.chartValue(hour);
      if (value === null) { segmentOpen = false; return ''; }
      const command = segmentOpen ? 'L' : 'M';
      segmentOpen = true;
      return `${command}${this.chartX(i)},${140 - value / max * 125}`;
    }).filter(Boolean).join(' ');
  }

  private applyRainfallPointToMap(reading: RainfallReading): void {
    if (!this.map || typeof reading.latitude !== 'number' || typeof reading.longitude !== 'number') return;
    if (this.rainPointMarker) this.map.removeLayer(this.rainPointMarker);
    const amount = reading.precipitation_mm;
    const locationName = typeof reading.location === 'string' ? reading.location : reading.location?.name;
    const popupTime = this.formatChennaiTimestamp(reading.timestamp);
    const popupSource = reading.data_source ?? 'Open-Meteo';
    this.rainPointMarker = L.circleMarker([reading.latitude, reading.longitude], {
      radius: 8, color: '#075985', weight: 2, fillColor: '#38bdf8', fillOpacity: 0.9
    }).bindPopup(`<strong>${locationName ?? 'Weather point'}</strong><br/>Single-point model estimate · ${reading.status}<br/>Rainfall: ${amount == null ? 'unavailable' : `${amount} mm (preceding hour)`}<br/>Temperature: ${reading.temperature_c ?? 'unavailable'} °C<br/>Humidity: ${reading.humidity_percent ?? 'unavailable'}%<br/>Provider time: ${popupTime || 'unavailable'}<br/>Source: ${popupSource}<br/>${reading.latitude.toFixed(5)}, ${reading.longitude.toFixed(5)}`);
    this.rainPointMarker.addTo(this.map);
  }

  refreshWeather(): void {
    if (this.selectedWeatherLocation) this.fetchSelectedWeather();
    else this.loadWeatherTelemetry();
  }

  ngAfterViewInit(): void {
    // Defer initialization to next animation frame to eliminate UI blocking/lag
    requestAnimationFrame(() => {
      this.initMiniMap();
      this.loadMapZones(this.currentHorizon);
    });

    if (typeof window !== 'undefined') {
      this.resizeHandler = () => {
        if (this.map) {
          this.map.invalidateSize();
        }
      };
      window.addEventListener('resize', this.resizeHandler, { passive: true });
    }
  }

  ngOnDestroy(): void {
    if (this.weatherRefreshTimer) clearInterval(this.weatherRefreshTimer);
    if (this.dnoPlayTimer) {
      clearInterval(this.dnoPlayTimer);
      this.dnoPlayTimer = undefined;
    }
    if (this.resizeHandler && typeof window !== 'undefined') {
      window.removeEventListener('resize', this.resizeHandler);
    }
    if (this.map) {
      this.map.remove();
    }
  }

  private initGreetingAndDate(): void {
    const hour = new Date().getHours();
    if (hour < 12) this.greeting = 'Good Morning';
    else if (hour < 17) this.greeting = 'Good Afternoon';
    else this.greeting = 'Good Evening';

    this.currentDate = new Date().toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  private loadKPIs(): void {
    this.loadingKpis = true;
    this.floodService.getKPIs().subscribe({
      next: data => {
        this.kpis = data;
        if (this.weatherCurrent) {
          this.updateRainfallKpiProvenance(this.weatherCurrent.status, this.weatherCurrent.precipitation_mm,
            this.weatherCurrent.fetched_at);
        }
        this.loadingKpis = false;
      },
      error: () => {
        this.loadingKpis = false;
      }
    });
  }

  private loadAlerts(): void {
    this.alertService.getAlerts().subscribe(data => {
      this.alerts = data;
    });
  }

  private loadRecentPredictions(): void {
    this.floodService.getRecentPredictions().subscribe(data => {
      this.recentPredictions = data;
    });
  }

  private initMiniMap(): void {
    if (!this.miniMapContainer || this.map) return;

    // Center on Greater Chennai area with Canvas hardware acceleration
    this.map = L.map(this.miniMapContainer.nativeElement, {
      center: [13.0827, 80.2707],
      zoom: 11,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true
    });
    if (this.weatherCurrent) this.applyRainfallPointToMap(this.weatherCurrent);

    L.control.zoom({ position: 'topright' }).addTo(this.map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      subdomains: ['a', 'b', 'c'],
      keepBuffer: 2,
      updateWhenIdle: true
    }).addTo(this.map);

    this.zoneLayersGroup.addTo(this.map);

    // Chennai Phase 7C DNO Pilot Catchment boundary (Adyar-Velachery 10km x 10km)
    const pilotBounds: L.LatLngBoundsExpression = [
      [12.943196, 80.170273],
      [13.033893, 80.262192]
    ];
    this.dnoPilotBoundsRect = L.rectangle(pilotBounds, {
      color: '#00e5ff',
      weight: 2,
      dashArray: '6, 6',
      fillColor: '#00e5ff',
      fillOpacity: 0.04
    });
    this.dnoPilotBoundsRect.bindTooltip(`
      <div style="font-family: inherit; font-size: 0.8rem;">
        <strong style="color: #00e5ff;">Chennai DNO Pilot Catchment</strong><br/>
        Adyar–Velachery Basin (10 km × 10 km)<br/>
        Grid: 128 × 128 (78.1m resolution)
      </div>
    `, { sticky: true });

    this.dnoLayerGroup.addLayer(this.dnoPilotBoundsRect);
    this.dnoLayerGroup.addTo(this.map);

    requestAnimationFrame(() => {
      this.map?.invalidateSize();
    });
  }

  private loadMapZones(horizon: PredictionTime): void {
    this.floodService.getFloodZones(horizon).subscribe(zones => {
      this.floodZones = zones;
      this.renderZonesOnMap(zones);
    });
  }

  private renderZonesOnMap(zones: FloodZone[]): void {
    if (!this.map) return;
    this.zoneLayersGroup.clearLayers();

    zones.forEach(zone => {
      let fillColor = '#10b981'; // Safe
      let borderColor = '#059669';

      if (zone.riskLevel === 'HIGH' || zone.riskScore >= 80) {
        fillColor = '#ef4444';
        borderColor = '#b91c1c';
      } else if (zone.riskLevel === 'MEDIUM' || zone.riskScore >= 50) {
        fillColor = '#f59e0b';
        borderColor = '#d97706';
      } else if (zone.riskLevel === 'LOW' || zone.riskScore >= 20) {
        fillColor = '#06b6d4';
        borderColor = '#0891b2';
      }

      const rect = L.rectangle(zone.bounds, {
        color: borderColor,
        weight: 2,
        fillColor: fillColor,
        fillOpacity: 0.35
      });

      rect.bindTooltip(`
        <div style="font-family: inherit;">
          <strong>${zone.name}</strong><br/>
          Risk Score: <strong>${zone.riskScore}%</strong> (${zone.riskLevel})<br/>
          Depth: <strong>${zone.waterDepth}m</strong>
        </div>
      `, { sticky: true });

      rect.on('click', () => {
        this.selectedZone = zone;
        this.floodService.setSelectedZone(zone);
      });

      this.zoneLayersGroup.addLayer(rect);
    });
  }

  onHorizonChange(horizon: PredictionTime): void {
    this.currentHorizon = horizon;
    this.floodService.setHorizon(horizon);
    this.loadMapZones(horizon);

    if (this.kpis) {
      if (horizon === '+1H') {
        this.kpis = { ...this.kpis, currentRainfall: 26.0, highRiskZones: 15, rainfallDelta: '↑ Peak predicted rate' };
      } else if (horizon === '+3H') {
        this.kpis = { ...this.kpis, currentRainfall: 6.2, highRiskZones: 6, rainfallDelta: '↓ Receding convective line' };
      } else if (horizon === 'NOW') {
        this.kpis = { ...this.kpis, currentRainfall: 18.4, highRiskZones: 12, rainfallDelta: '↑ 12% from last hour' };
      }
    }
  }

  onAcknowledgeAlert(id: string): void {
    this.alertService.acknowledgeAlert(id).subscribe();
  }

  onDismissAlert(id: string): void {
    this.alerts = this.alerts.filter(a => a.id !== id);
  }

  onViewAlertLocation(alert: FloodAlert): void {
    this.router.navigate(['/flood-map'], {
      queryParams: { lat: alert.coordinates[0], lng: alert.coordinates[1], focus: alert.location }
    });
  }

  inspectLocation(locationName: string): void {
    // Find matching zone or create a mock inspection zone
    const found = this.floodZones.find(z => z.name.toLowerCase().includes(locationName.toLowerCase()));
    if (found) {
      this.selectedZone = found;
    } else {
      // Find from recent predictions
      const pred = this.recentPredictions.find(p => p.location === locationName);
      this.selectedZone = {
        gridId: 'CHN-' + Math.floor(1000 + Math.random() * 9000),
        name: locationName + ' Basin',
        latitude: 13.0827,
        longitude: 80.2707,
        bounds: [[13.07, 80.26], [13.09, 80.28]],
        riskLevel: pred?.currentRisk || 'MEDIUM',
        riskScore: pred?.confidence || 65,
        predictionTime: this.currentHorizon,
        rainfall: 24.5,
        elevation: 8.2,
        waterDepth: pred?.currentRisk === 'HIGH' ? 0.85 : 0.35,
        runoffCoefficient: 0.75,
        slope: 'Low',
        summary: `Vulnerability assessment for ${locationName}`,
        historicalFlooding: 'Moderate',
        drainageStatus: 'Moderate',
        builtUpDensity: 78,
        isSimulated: true
      };
    }
  }

  closeInspection(): void {
    this.selectedZone = null;
  }

  openFullAnalysis(zone: FloodZone): void {
    this.closeInspection();
    this.router.navigate(['/location-risk'], {
      queryParams: { location: zone.name.split(' ')[0] }
    });
  }

  getRiskColor(score: number): string {
    if (score >= 80) return '#ef4444';
    if (score >= 50) return '#f59e0b';
    return '#10b981';
  }

  // ==========================================
  // CHENNAI PHASE 7C DNO HYDRODYNAMIC METHODS
  // ==========================================

  private loadDnoHealthAndEvents(): void {
    this.dnoService.getHealth().subscribe({
      next: health => {
        if (!health.model_loaded) return;
        this.dnoService.getEvents().subscribe({
          next: resp => {
            if (!resp?.events?.length) return;
            const initialEvent = resp.events.find(event => event.id === 'storm_011') || resp.events[0];
            this.dnoService.selectedEventId.set(initialEvent.id);
          }
        });
      }
    });
  }

  onDnoEventChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    if (target && target.value) {
      this.dnoService.selectedEventId.set(target.value);
    }
  }

  runDnoForecast(): void {
    const eventId = this.dnoService.selectedEventId();
    if (!eventId) return;

    this.cachedGeoJsonMap.clear();
    this.dnoService.predict({
      event_id: eventId,
      include_spatial_grids: false
    }).subscribe({
      next: (resp) => {
        this.updateCurrentDnoForecast();
        this.loadDnoGeoJson(this.dnoService.selectedLeadMinutes());
      },
      error: (err) => {
        console.error('[DNO Predict Error]', err);
      }
    });
  }

  onDnoTimelineChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target) {
      const minutes = parseInt(target.value, 10);
      this.setDnoLeadMinutes(minutes);
    }
  }

  setDnoLeadMinutes(minutes: number): void {
    this.dnoService.setLeadMinutes(minutes);
    this.updateCurrentDnoForecast();
    this.loadDnoGeoJson(this.dnoService.selectedLeadMinutes());
  }

  prevDnoStep(): void {
    const curr = this.dnoService.selectedLeadMinutes();
    if (curr > 5) {
      this.setDnoLeadMinutes(curr - 5);
    }
  }

  nextDnoStep(): void {
    const curr = this.dnoService.selectedLeadMinutes();
    if (curr < 120) {
      this.setDnoLeadMinutes(curr + 5);
    }
  }

  toggleDnoPlayback(): void {
    if (this.dnoPlayingTimeline) {
      if (this.dnoPlayTimer) {
        clearInterval(this.dnoPlayTimer);
        this.dnoPlayTimer = undefined;
      }
      this.dnoPlayingTimeline = false;
    } else {
      this.dnoPlayingTimeline = true;
      this.dnoPlayTimer = setInterval(() => {
        let nextMin = this.dnoService.selectedLeadMinutes() + 5;
        if (nextMin > 120) {
          nextMin = 5;
        }
        this.setDnoLeadMinutes(nextMin);
      }, 1500);
    }
  }

  private updateCurrentDnoForecast(): void {
    this.currentDnoForecast = this.dnoService.getCurrentTimestepForecast();
  }

  loadDnoGeoJson(leadMinutes: number): void {
    const eventId = this.dnoService.selectedEventId();
    if (!eventId) return;

    if (this.cachedGeoJsonMap.has(leadMinutes)) {
      const cached = this.cachedGeoJsonMap.get(leadMinutes);
      this.renderDnoGeoJsonOnMap(cached);
      return;
    }

    this.dnoService.getForecastGeoJson(eventId, leadMinutes, 0.10, 1500).subscribe({
      next: (geoJson) => {
        this.cachedGeoJsonMap.set(leadMinutes, geoJson);
        this.renderDnoGeoJsonOnMap(geoJson);
      },
      error: (err) => {
        console.warn('[DNO GeoJSON Error]', err);
      }
    });
  }

  renderDnoGeoJsonOnMap(geoJson: any): void {
    if (!this.map) return;
    this.dnoLayerGroup.clearLayers();

    // Re-add pilot catchment boundary outline
    if (this.dnoPilotBoundsRect) {
      this.dnoLayerGroup.addLayer(this.dnoPilotBoundsRect);
    }

    if (!this.layerDno || !geoJson || !geoJson.features) return;

    const geoJsonLayer = L.geoJSON(geoJson, {
      style: (feature: any) => {
        const depth = feature?.properties?.depth_m || 0;
        let fillColor = '#00e5ff'; // cyan
        let fillOpacity = 0.55;
        let strokeColor = '#00b4d8';

        if (depth >= 1.0) {
          fillColor = '#ef4444'; // red (severe)
          strokeColor = '#b91c1c';
          fillOpacity = 0.85;
        } else if (depth >= 0.50) {
          fillColor = '#f97316'; // deep orange
          strokeColor = '#c2410c';
          fillOpacity = 0.75;
        } else if (depth >= 0.20) {
          fillColor = '#f59e0b'; // amber
          strokeColor = '#d97706';
          fillOpacity = 0.65;
        } else if (depth >= 0.10) {
          fillColor = '#06b6d4'; // teal
          strokeColor = '#0891b2';
          fillOpacity = 0.55;
        }

        return {
          fillColor: fillColor,
          color: strokeColor,
          weight: 1,
          fillOpacity: fillOpacity
        };
      },
      onEachFeature: (feature: any, layer: L.Layer) => {
        const p = feature.properties || {};
        const depth = (p.depth_m !== undefined) ? Number(p.depth_m).toFixed(2) : '0.00';
        const u = (p.velocity_u_mps !== undefined) ? Number(p.velocity_u_mps).toFixed(2) : '0.00';
        const v = (p.velocity_v_mps !== undefined) ? Number(p.velocity_v_mps).toFixed(2) : '0.00';
        const velMag = (p.velocity_magnitude_mps !== undefined) ? Number(p.velocity_magnitude_mps).toFixed(2) : '0.00';
        const sev = p.severity || 'MODERATE';
        const leadMin = p.lead_time_minutes ?? this.dnoService.selectedLeadMinutes();

        layer.bindTooltip(`
          <div style="font-family: inherit; font-size: 0.8rem; line-height: 1.4;">
            <div style="font-weight: 700; color: #00e5ff; margin-bottom: 2px;">Chennai Phase 7C DNO Cell</div>
            <div>Lead Time: <strong>T+${leadMin}m</strong></div>
            <div>Water Depth (H): <strong>${depth} m</strong></div>
            <div>Velocity Magnitude: <strong>${velMag} m/s</strong></div>
            <div>Vectors: <strong>U=${u} m/s, V=${v} m/s</strong></div>
            <div>Severity: <strong style="color: #f59e0b;">${sev}</strong></div>
            <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">Resolution: 78.1m Grid Cell</div>
          </div>
        `, { sticky: true });
      }
    });

    this.dnoLayerGroup.addLayer(geoJsonLayer);
  }

  toggleDnoLayer(): void {
    this.layerDno = !this.layerDno;
    if (!this.map) return;
    if (this.layerDno) {
      if (!this.map.hasLayer(this.dnoLayerGroup)) {
        this.dnoLayerGroup.addTo(this.map);
      }
      const currMin = this.dnoService.selectedLeadMinutes();
      if (this.cachedGeoJsonMap.has(currMin)) {
        this.renderDnoGeoJsonOnMap(this.cachedGeoJsonMap.get(currMin));
      } else {
        this.loadDnoGeoJson(currMin);
      }
    } else {
      this.dnoLayerGroup.clearLayers();
      if (this.dnoPilotBoundsRect) {
        this.dnoLayerGroup.addLayer(this.dnoPilotBoundsRect);
      }
    }
  }

  focusDnoPilot(): void {
    if (!this.map) return;
    const pilotBounds: L.LatLngBoundsExpression = [
      [12.943196, 80.170273],
      [13.033893, 80.262192]
    ];
    this.map.fitBounds(pilotBounds, { padding: [30, 30], maxZoom: 14 });
  }
}
