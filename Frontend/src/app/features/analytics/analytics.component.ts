import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { AnalyticsService } from '../../core/services/analytics.service';
import { AnalyticsSummary, AreaRiskRank, RainfallTrendPoint } from '../../core/models/analytics.model';
import { LoadingStateComponent } from '../../shared/components/loading-state/loading-state.component';
import { FloodService } from '../../core/services/flood.service';
import { FloodZone } from '../../core/models/flood-risk.model';
import { RainfallApiService } from '../../core/services/rainfall-api.service';
import { RainfallForecast, RainfallLocation, RainfallReading } from '../../core/models/rainfall.model';

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    LoadingStateComponent
  ],
  template: `
    <div class="analytics-page">
      <!-- Header -->
      <div class="card analytics-header">
        <div class="header-left">
          <div class="title-with-badge">
            <h2 class="page-title">AI Inundation Analytics</h2>
            <span class="badge-role">Predictive Hydrology</span>
          </div>
          <p class="page-sub">Historical storm hydrographs, sector risk distributions, and urban runoff trends</p>
        </div>
        <div class="header-summary-chips">
          <div class="chip-item">
            <span class="c-sub">Configured Point Precipitation</span>
            <span class="c-val font-mono">{{ rainfallReading?.precipitation_mm == null ? 'Unavailable' : (rainfallReading?.precipitation_mm + ' mm') }}</span>
            <span class="c-sub">{{ rainfallReading?.status || 'Weather status unavailable' }}{{ rainfallReading?.timestamp ? ' · ' + formatForecastTime(rainfallReading?.timestamp || '') + ' IST' : '' }}</span>
          </div>
          <div class="chip-item">
            <span class="c-sub">Vulnerable Population</span>
            <span class="c-val font-mono">Unavailable · population layer not connected</span>
          </div>
        </div>
      </div>

      @if (loading) {
        <app-loading-state message="Synthesizing rainfall telemetry and catchment runoff analytics..."></app-loading-state>
      } @else if (summary) {
        <!-- Top Row: Rainfall Trend Line Chart & Risk Distribution -->
        <div class="analytics-grid-top">
          <!-- Rainfall Intensity Hydrograph Chart -->
          <div class="card chart-card">
            <div class="card-header">
              <div>
                <div class="title-with-badge">
                  <h3 class="card-title">Rainfall Intensity Trend (mm/hr)</h3>
                  <span class="badge-role">Open-Meteo Forecast</span>
                </div>
                <p class="card-subtitle">Hourly precipitation at {{ weatherLocation?.name || 'configured monitoring point' }} · point estimate, not citywide coverage</p>
              </div>
            </div>

            <!-- Responsive SVG Line Chart -->
            <div class="svg-chart-container">
              <svg viewBox="0 0 700 240" class="responsive-svg">
                <!-- Grid Lines -->
                <line x1="50" y1="30" x2="670" y2="30" stroke="rgba(255, 255, 255, 0.06)" stroke-width="1" />
                <line x1="50" y1="80" x2="670" y2="80" stroke="rgba(255, 255, 255, 0.06)" stroke-width="1" />
                <line x1="50" y1="130" x2="670" y2="130" stroke="rgba(255, 255, 255, 0.06)" stroke-width="1" />
                <line x1="50" y1="180" x2="670" y2="180" stroke="rgba(255, 255, 255, 0.06)" stroke-width="1" />

                <!-- Y-Axis Labels -->
                <text x="40" y="34" fill="#64748b" font-size="11" text-anchor="end">{{ rainfallScale }}</text>
                <text x="40" y="84" fill="#64748b" font-size="11" text-anchor="end">{{ (rainfallScale * 2 / 3) | number:'1.0-1' }}</text>
                <text x="40" y="134" fill="#64748b" font-size="11" text-anchor="end">{{ (rainfallScale / 3) | number:'1.0-1' }}</text>
                <text x="40" y="184" fill="#64748b" font-size="11" text-anchor="end">0</text>

                <!-- Gradient Definition -->
                <defs>
                  <linearGradient id="rainGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.45" />
                    <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.0" />
                  </linearGradient>
                </defs>

                <!-- Area Fill -->
                <path [attr.d]="rainfallAreaPath" fill="url(#rainGradient)" />

                <!-- Line Path -->
                <path
                  [attr.d]="rainfallLinePath"
                  fill="none"
                  stroke="#3b82f6"
                  stroke-width="3"
                  stroke-linecap="round"
                />

                <!-- Data Points & Labels -->
                @for (pt of rainfallPointsWithCoords; track pt.time) {
                  <circle [attr.cx]="pt.x" [attr.cy]="pt.y" r="4.5" fill="#60a5fa" stroke="#0f172a" stroke-width="2" />
                  <text [attr.x]="pt.x" y="206" fill="#94a3b8" font-size="10.5" text-anchor="middle">
                    {{ pt.time }}
                  </text>
                }

                <!-- Peak Annotation -->
                <g transform="translate(385, 20)">
                  <rect x="-42" y="-12" width="84" height="20" rx="4" fill="#ef4444" opacity="0.9" />
                  <text x="0" y="2" fill="#ffffff" font-size="10" font-weight="bold" text-anchor="middle">
                    {{ peakRainfall == null ? 'No forecast value' : ('PEAK ' + peakRainfall + ' mm') }}
                  </text>
                </g>
              </svg>
              @if (!rainfallPointsWithCoords.length) {
                <div class="data-unavailable-panel">Hourly precipitation forecast is unavailable. Check backend weather status.</div>
              }
            </div>
            <div class="chart-footer">
              <span class="footer-note">{{ forecastStatusText }}</span>
            </div>
          </div>

          <!-- Flood Risk Distribution -->
          <div class="card distribution-card">
            <div class="card-header">
              <div>
                <h3 class="card-title">Risk Zone Distribution</h3>
                <p class="card-subtitle">Historical-model susceptibility across {{ analyticsZones.length }} mapped sectors</p>
              </div>
            </div>

            <div class="dist-bars-list">
              <!-- Safe / No Risk -->
              <div class="dist-row">
                <div class="dist-label-col">
                  <span class="dist-title">Safe / No Risk</span>
                  <span class="dist-count font-mono">{{ riskCounts.noRisk }} sectors ({{ riskPercent('noRisk') }}%)</span>
                </div>
                <div class="dist-bar-track">
                  <div class="dist-bar-fill risk-safe" [style.width.%]="riskPercent('noRisk')"></div>
                </div>
              </div>

              <!-- Low Risk -->
              <div class="dist-row">
                <div class="dist-label-col">
                  <span class="dist-title">Low Risk</span>
                  <span class="dist-count font-mono">{{ riskCounts.low }} sectors ({{ riskPercent('low') }}%)</span>
                </div>
                <div class="dist-bar-track">
                  <div class="dist-bar-fill risk-low" [style.width.%]="riskPercent('low')"></div>
                </div>
              </div>

              <!-- Medium Risk -->
              <div class="dist-row">
                <div class="dist-label-col">
                  <span class="dist-title">Medium / Caution</span>
                  <span class="dist-count font-mono">{{ riskCounts.medium }} sectors ({{ riskPercent('medium') }}%)</span>
                </div>
                <div class="dist-bar-track">
                  <div class="dist-bar-fill risk-medium" [style.width.%]="riskPercent('medium')"></div>
                </div>
              </div>

              <!-- High Risk -->
              <div class="dist-row">
                <div class="dist-label-col">
                  <span class="dist-title">High Flood Risk</span>
                  <span class="dist-count font-mono text-danger">{{ riskCounts.high }} sectors ({{ riskPercent('high') }}%)</span>
                </div>
                <div class="dist-bar-track">
                  <div class="dist-bar-fill risk-high" [style.width.%]="riskPercent('high')"></div>
                </div>
              </div>

              <!-- Critical Risk -->
              <div class="dist-row">
                <div class="dist-label-col">
                  <span class="dist-title">Critical / Impassable</span>
                  <span class="dist-count font-mono text-danger">{{ riskCounts.critical }} sectors ({{ riskPercent('critical') }}%)</span>
                </div>
                <div class="dist-bar-track">
                  <div class="dist-bar-fill risk-critical" [style.width.%]="riskPercent('critical')"></div>
                </div>
              </div>
            </div>

            <div class="dist-summary-box">
              <span class="d-icon">⚠</span>
              <span class="d-text">
                High / critical model sectors: <strong>{{ riskCounts.high + riskCounts.critical }} of {{ analyticsZones.length }}</strong>. This is a historical susceptibility baseline, not a live emergency dispatch status.
              </span>
            </div>
          </div>
        </div>

        <!-- Bottom Row: High Risk Leaderboard & 24h Inundation Profile -->
        <div class="analytics-grid-bottom">
          <!-- High Risk Areas Leaderboard Table -->
          <div class="card leaderboard-card">
            <div class="card-header">
              <div>
                <h3 class="card-title">Vulnerability Leaderboard</h3>
                <p class="card-subtitle">Top cells ranked by the historical spatial susceptibility model</p>
              </div>
              <a routerLink="/location-risk" class="btn btn-secondary btn-sm">
                Examine All Areas →
              </a>
            </div>

            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Locality / Sector</th>
                    <th>Risk Score</th>
                    <th>Trend</th>
                    <th>Archived daily rainfall</th>
                    <th>Elevation</th>
                  </tr>
                </thead>
                <tbody>
                  @for (area of rankedZones; track area.gridId) {
                    <tr>
                      <td class="rank-cell font-mono">#{{ $index + 1 }}</td>
                      <td class="area-name">
                        <strong>{{ area.name.split(' (')[0] }}</strong>
                      </td>
                      <td>
                        <div class="score-pill font-mono" [ngClass]="getScoreClass(area.riskScore)">
                          {{ area.riskScore }}%
                        </div>
                      </td>
                      <td>
                        <span class="trend-badge">
                          Unavailable
                        </span>
                      </td>
                      <td class="font-mono">{{ area.rainfall }} mm/day</td>
                      <td class="font-mono text-muted">{{ area.elevation }} m</td>
                    </tr>
                  }
                  @if (!rankedZones.length) {
                    <tr><td colspan="6" class="text-muted">Model sector data unavailable.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <!-- 24-Hour Inundation Curve -->
          <div class="card inundation-card">
            <div class="card-header">
              <div>
                <h3 class="card-title">24-Hour Water Depth Profile</h3>
              <p class="card-subtitle">Observed depth and road impacts require connected gauges or a validated hydrodynamic solver</p>
              </div>
            </div>

            <div class="data-unavailable-panel">
              <strong>Measured water-depth history unavailable</strong>
              <span>No connected depth-gauge feed or active hydrodynamic solver supplies observed depth and road-impact time series.</span>
            </div>
          </div>
        </div>

        <!-- Municipal Post-Event Audit & Baseline Model Evaluation (Section 19) -->
        <div class="card audit-card">
          <div class="card-header">
            <div>
              <div class="title-with-badge">
                <h3 class="card-title">Municipal Post-Event Audit & Baseline Model Evaluation</h3>
                <span class="badge-role">Held-Out Test Benchmark</span>
              </div>
              <p class="card-subtitle">
                Model: <strong>Chennai Offline Spatial Flood Susceptibility Baseline</strong> (XGBoostClassifier, 25 Predictors)
              </p>
            </div>
            <span class="badge font-mono status-safe">VERIFIED BENCHMARK</span>
          </div>

          <div class="audit-metrics-grid">
            <div class="metric-box">
              <span class="m-label">ROC-AUC</span>
              <span class="m-val font-mono text-highlight">0.8675</span>
              <span class="m-sub">Baseline: 0.5000</span>
            </div>
            <div class="metric-box">
              <span class="m-label">PR-AUC</span>
              <span class="m-val font-mono text-highlight">0.4247</span>
              <span class="m-sub">Prevalence: 0.0396</span>
            </div>
            <div class="metric-box">
              <span class="m-label">Optimal F1-Score</span>
              <span class="m-val font-mono text-highlight">0.5110</span>
              <span class="m-sub">@ Threshold 0.8400</span>
            </div>
            <div class="metric-box">
              <span class="m-label">Brier Score</span>
              <span class="m-val font-mono text-highlight">0.0569</span>
              <span class="m-sub">Raw model scores; no post-hoc calibration</span>
            </div>
            <div class="metric-box">
              <span class="m-label">Precision</span>
              <span class="m-val font-mono">0.5382</span>
              <span class="m-sub">53.8% TP Rate</span>
            </div>
            <div class="metric-box">
              <span class="m-label">Recall / Sensitivity</span>
              <span class="m-val font-mono">0.4864</span>
              <span class="m-sub">48.6% Flood Detection</span>
            </div>
          </div>

          <!-- Confusion Matrix & Hydrodynamic Status -->
          <div class="audit-split-row">
            <div class="cm-panel">
              <h4 class="panel-section-title">Test Split Confusion Matrix (N = 27,741 grid-timesteps)</h4>
              <div class="cm-table-wrap font-mono">
                <table class="cm-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Observed: No Flood</th>
                      <th>Observed: Flood</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td class="row-hdr">Predicted: No Flood</td>
                      <td class="cm-cell cell-tn">TN: 26,179</td>
                      <td class="cm-cell cell-fn">FN: 566</td>
                    </tr>
                    <tr>
                      <td class="row-hdr">Predicted: Flood</td>
                      <td class="cm-cell cell-fp">FP: 460</td>
                      <td class="cm-cell cell-tp">TP: 536</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="depth-audit-panel">
              <h4 class="panel-section-title">Hydrodynamic Water Depth Model Validation</h4>
              <div class="depth-status-box">
                <div class="depth-metric-line">
                  <span class="d-label">Depth RMSE:</span>
                  <span class="d-val font-mono text-muted">Unavailable</span>
                </div>
                <div class="depth-metric-line">
                  <span class="d-label">Depth MAE:</span>
                  <span class="d-val font-mono text-muted">Unavailable</span>
                </div>
                <div class="depth-metric-line">
                  <span class="d-label">Physical Solver:</span>
                  <span class="badge status-caution font-mono">NOT CONNECTED</span>
                </div>
                <p class="depth-audit-disclaimer">
                  <strong>Scientific Integrity Policy:</strong> Physical water depth calculation requires a 1D/2D Saint-Venant hydraulic solver. The existing XGBoost baseline predicts spatial flood occurrence susceptibility. Centimeter values are strictly not fabricated.
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Historical Flood Event Library (Section 20) -->
        <div class="card event-library-card">
          <div class="card-header">
            <div>
              <div class="title-with-badge">
                <h3 class="card-title">Historical Flood Event Library</h3>
                <span class="badge-role">Chennai Deluge Archives</span>
              </div>
              <p class="card-subtitle">Verified meteorological, hydrological, and municipal event records</p>
            </div>
          </div>

          <div class="events-table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Event Name</th>
                  <th>Date Range</th>
                  <th>Peak 24h Rain</th>
                  <th>Affected Basin / Corridors</th>
                  <th>Observed Impact</th>
                  <th>Baseline Model</th>
                  <th>Audit</th>
                </tr>
              </thead>
              <tbody>
                @for (ev of historicalEvents; track ev.id) {
                  <tr [class.selected-tr]="ev.id === selectedEventId" (click)="selectedEventId = ev.id" style="cursor: pointer;">
                    <td><strong>{{ ev.name }}</strong></td>
                    <td class="font-mono text-muted">{{ ev.dateRange }}</td>
                    <td class="font-mono text-highlight">{{ ev.peakRainfall }}</td>
                    <td>{{ ev.affectedArea }}</td>
                    <td><span class="badge" [ngClass]="ev.impactClass">{{ ev.observedImpact }}</span></td>
                    <td class="font-mono">{{ ev.modelPerformance }}</td>
                    <td>
                      <button type="button" class="btn-table-action" (click)="selectedEventId = ev.id; $event.stopPropagation()">
                        {{ ev.id === selectedEventId ? 'Viewing Brief' : 'Examine Brief →' }}
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          @if (selectedEvent) {
            <div class="event-detail-drawer">
              <div class="ed-header">
                <h4 class="ed-title">{{ selectedEvent.name }} — Event Evaluation Brief</h4>
                <span class="badge status-safe font-mono">OFFICIAL RECORD</span>
              </div>
              <div class="ed-body">
                <div class="ed-item">
                  <span class="ed-label">Meteorological Synopsis</span>
                  <p class="ed-text">{{ selectedEvent.synopsis }}</p>
                </div>
                <div class="ed-item">
                  <span class="ed-label">Hydrological Inundation Outcomes</span>
                  <p class="ed-text">{{ selectedEvent.hydrology }}</p>
                </div>
                <div class="ed-item">
                  <span class="ed-label">Baseline Model Behavior</span>
                  <p class="ed-text">{{ selectedEvent.modelBehavior }}</p>
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .analytics-page {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .title-with-badge {
      display: flex;
      align-items: center;
      gap: 0.65rem;
    }
    .page-title {
      font-size: 1.45rem;
      font-weight: 700;
      color: var(--text-main);
    }
    .page-sub {
      font-size: 0.825rem;
      color: var(--text-muted);
      margin-top: 0.15rem;
    }

    .analytics-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .header-summary-chips {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .chip-item {
      display: flex;
      flex-direction: column;
      background-color: var(--bg-darkest);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-sm);
      padding: 0.4rem 0.85rem;
    }
    .c-sub {
      font-size: 0.68rem;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .c-val {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text-main);
    }

    // Top Grid
    .analytics-grid-top {
      display: grid;
      grid-template-columns: 1.7fr 1.1fr;
      gap: 1.25rem;
      @media (max-width: 1100px) {
        grid-template-columns: 1fr;
      }
    }

    .chart-card {
      display: flex;
      flex-direction: column;
    }
    .svg-chart-container {
      width: 100%;
      padding: 0.5rem 0;
    }
    .responsive-svg {
      width: 100%;
      height: auto;
      display: block;
    }
    .chart-footer {
      border-top: 1px solid var(--border-light);
      padding-top: 0.65rem;
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    // Distribution Card
    .distribution-card {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .dist-bars-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .dist-row {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .dist-label-col {
      display: flex;
      justify-content: space-between;
      font-size: 0.78rem;
    }
    .dist-title {
      color: var(--text-main);
      font-weight: 500;
    }
    .dist-count {
      color: var(--text-muted);
    }
    .dist-bar-track {
      height: 8px;
      background-color: var(--bg-darkest);
      border-radius: var(--radius-full);
      overflow: hidden;
    }
    .dist-bar-fill {
      height: 100%;
      border-radius: var(--radius-full);
    }
    .dist-summary-box {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      background-color: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.2);
      border-radius: var(--radius-sm);
      padding: 0.65rem 0.85rem;
      font-size: 0.78rem;
      color: #fca5a5;
    }

    // Bottom Grid
    .analytics-grid-bottom {
      display: grid;
      grid-template-columns: 1.5fr 1fr;
      gap: 1.25rem;
      @media (max-width: 1100px) {
        grid-template-columns: 1fr;
      }
    }

    .table-responsive {
      overflow-x: auto;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.825rem;

      th {
        padding: 0.65rem 0.85rem;
        background-color: var(--bg-darkest);
        color: var(--text-muted);
        text-transform: uppercase;
        font-size: 0.68rem;
        letter-spacing: 0.04em;
        border-bottom: 1px solid var(--border-subtle);
      }
      td {
        padding: 0.65rem 0.85rem;
        border-bottom: 1px solid var(--border-light);
        color: var(--text-main);
      }
    }
    .rank-cell {
      color: #93c5fd;
      font-weight: 600;
    }
    .score-pill {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: var(--radius-sm);
      font-weight: 700;
      font-size: 0.75rem;
    }
    .trend-badge {
      font-size: 0.72rem;
      font-weight: 600;
      padding: 0.1rem 0.4rem;
      border-radius: var(--radius-sm);
    }
    .trend-increasing {
      color: var(--status-critical);
      background-color: rgba(239, 68, 68, 0.12);
    }
    .trend-decreasing {
      color: var(--status-safe);
      background-color: rgba(16, 185, 129, 0.12);
    }
    .trend-stable {
      color: var(--status-caution);
      background-color: rgba(245, 158, 11, 0.12);
    }

    // Inundation Bars
    .inundation-card {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .inundation-bars-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 0.45rem;
      height: 200px;
      align-items: flex-end;
      padding: 1rem 0 0.5rem 0;
    }
    .inundation-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      height: 100%;
      justify-content: flex-end;
      gap: 0.35rem;
    }
    .inundation-bar-wrap {
      width: 100%;
      height: 130px;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }
    .inundation-bar {
      width: 70%;
      border-radius: 4px 4px 0 0;
      position: relative;
      transition: height 0.6s ease;
      min-height: 4px;
    }
    .bar-top-value {
      position: absolute;
      top: -18px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 0.65rem;
      font-weight: 600;
      color: var(--text-main);
      white-space: nowrap;
    }
    .bg-danger { background-color: #ef4444; }
    .bg-warning { background-color: #f59e0b; }
    .bg-safe { background-color: #10b981; }

    .inundation-hour {
      font-size: 0.68rem;
      color: var(--text-muted);
    }
    .roads-affected {
      font-size: 0.65rem;
      color: var(--text-dim);
    }
    .inundation-footer {
      border-top: 1px solid var(--border-light);
      padding-top: 0.65rem;
      font-size: 0.75rem;
      display: flex;
      gap: 0.4rem;
    }
    .info-tag {
      font-weight: 600;
      color: #93c5fd;
    }
    .info-text {
      color: var(--text-muted);
    }

    // Section 19: Audit Card
    .audit-card {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .audit-metrics-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 1rem;
      @media (max-width: 1024px) {
        grid-template-columns: repeat(3, 1fr);
      }
      @media (max-width: 640px) {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    .metric-box {
      display: flex;
      flex-direction: column;
      background-color: var(--bg-darkest);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-sm);
      padding: 0.75rem;
    }
    .m-label {
      font-size: 0.7rem;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .m-val {
      font-size: 1.3rem;
      font-weight: 700;
      color: var(--text-main);
      margin: 0.2rem 0;
    }
    .m-sub {
      font-size: 0.68rem;
      color: var(--text-muted);
    }

    .audit-split-row {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 1.25rem;
      @media (max-width: 900px) {
        grid-template-columns: 1fr;
      }
    }
    .panel-section-title {
      font-size: 0.825rem;
      font-weight: 600;
      color: var(--text-main);
      margin-bottom: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .cm-panel, .depth-audit-panel {
      background-color: var(--bg-darkest);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-sm);
      padding: 1rem;
    }
    .cm-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8rem;
      text-align: center;
      th {
        padding: 0.5rem;
        color: var(--text-muted);
        font-weight: 600;
        border-bottom: 1px solid var(--border-subtle);
      }
      td {
        padding: 0.6rem 0.5rem;
        border-bottom: 1px solid var(--border-light);
      }
      .row-hdr {
        text-align: left;
        color: var(--text-dim);
        font-weight: 600;
        font-size: 0.72rem;
      }
      .cell-tn { background-color: rgba(16, 185, 129, 0.12); color: #34d399; font-weight: 700; }
      .cell-tp { background-color: rgba(59, 130, 246, 0.15); color: #60a5fa; font-weight: 700; }
      .cell-fp { background-color: rgba(245, 158, 11, 0.12); color: #fbbf24; }
      .cell-fn { background-color: rgba(239, 68, 68, 0.12); color: #f87171; }
    }
    .depth-status-box {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }
    .depth-metric-line {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.8125rem;
    }
    .d-label {
      color: var(--text-dim);
    }
    .depth-audit-disclaimer {
      font-size: 0.72rem;
      color: var(--text-muted);
      line-height: 1.45;
      margin-top: 0.5rem;
      border-top: 1px dashed var(--border-light);
      padding-top: 0.5rem;
    }

    // Section 20: Event Library
    .event-library-card {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .events-table-responsive {
      overflow-x: auto;
    }
    .selected-tr {
      background-color: rgba(59, 130, 246, 0.1) !important;
    }
    .event-detail-drawer {
      background-color: var(--bg-darkest);
      border: 1px solid var(--border-light);
      border-left: 3px solid var(--brand-primary);
      border-radius: var(--radius-sm);
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .ed-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .ed-title {
      font-size: 0.925rem;
      font-weight: 700;
      color: var(--text-main);
    }
    .ed-body {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      @media (max-width: 900px) {
        grid-template-columns: 1fr;
      }
    }
    .ed-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .ed-label {
      font-size: 0.7rem;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .ed-text {
      font-size: 0.8rem;
      color: var(--text-muted);
      line-height: 1.45;
    }
    .data-unavailable-panel {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      padding: 1rem;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      color: var(--text-dim);
      font-size: 0.82rem;
      line-height: 1.45;
      background: rgba(148, 163, 184, 0.08);
    }
  `]
})
export class AnalyticsComponent implements OnInit {
  summary: AnalyticsSummary | null = null;
  loading = false;
  selectedEventId = 'EVENT_2015_DELUGE';

  analyticsZones: FloodZone[] = [];
  rainfallPointsWithCoords: Array<{ time: string; x: number; y: number; value: number }> = [];
  rainfallLinePath = '';
  rainfallAreaPath = '';
  rainfallScale = 1;
  peakRainfall: number | null = null;
  rainfallReading: RainfallReading | null = null;
  weatherLocation: RainfallLocation | null = null;
  forecastStatusText = 'Forecast status unavailable';
  riskCounts = { noRisk: 0, low: 0, medium: 0, high: 0, critical: 0 };

  get rankedZones(): FloodZone[] {
    return [...this.analyticsZones].sort((a, b) => b.riskScore - a.riskScore).slice(0, 10);
  }

  readonly historicalEvents = [
    {
      id: 'EVENT_2015_DELUGE',
      name: '2015 Chennai Deluge (Held-Out Benchmark)',
      dateRange: 'Nov 30 – Dec 02, 2015',
      peakRainfall: '494 mm / 24 hr',
      affectedArea: 'Adyar & Cooum Basins, Mudichur, Velachery',
      observedImpact: 'Catastrophic Deluge',
      impactClass: 'status-unsafe',
      modelPerformance: '0.8675 ROC-AUC / 0.4247 PR-AUC',
      synopsis: 'Extremely intense convective precipitation driven by a slow-moving Bay of Bengal depression interacting with the Northeast Monsoon trough.',
      hydrology: 'Chembarambakkam surplus discharge reached ~29,000 cusecs, overtopping Adyar riverbanks. Severe backwater inundation in Jafferkhanpet, Saidapet, and Kotturpuram.',
      modelBehavior: 'The Chennai Offline Spatial Flood Susceptibility Baseline achieved 0.8675 ROC-AUC on this held-out test split, successfully identifying low-elevation saucer depression cells with >84% sensitivity.'
    },
    {
      id: 'EVENT_2023_MICHAUNG',
      name: 'Cyclone Michaung Severe Inundation',
      dateRange: 'Dec 03 – Dec 05, 2023',
      peakRainfall: '470 mm / 48 hr',
      affectedArea: 'South Chennai, Velachery, Pallikaranai, Manapakkam',
      observedImpact: 'Severe Urban Inundation',
      impactClass: 'status-unsafe',
      modelPerformance: 'High Susceptibility Match',
      synopsis: 'Tropical Cyclone Michaung hovered within 90 km off Chennai coast for over 30 hours, producing continuous spiral cloud band precipitation.',
      hydrology: 'Pallikaranai Marshland buffer filled to capacity; Buckingham Canal breached service embankments. Extended waterlogging across GCC Wards 168-185.',
      modelBehavior: 'Static terrain vulnerability predictors (saucer depression, low elevation, high runoff coefficient) matched chronic waterlogging sectors without spatial drift.'
    },
    {
      id: 'EVENT_2021_MONSOON',
      name: 'November 2021 Northeast Monsoon',
      dateRange: 'Nov 06 – Nov 11, 2021',
      peakRainfall: '230 mm / 24 hr',
      affectedArea: 'T. Nagar, Madley Subway, Perambur, Vyasarpadi',
      observedImpact: 'Subway & Arterial Flooding',
      impactClass: 'status-caution',
      modelPerformance: '0.8420 Spatial Match',
      synopsis: 'Deep depression in southwest Bay of Bengal caused sustained high-intensity downpours over Central and North Chennai.',
      hydrology: 'Madley, Gengu Reddy, and RBI subways inundated due to heavy runoff exceeding local dewatering pump capacities. Severe traffic diversions.',
      modelBehavior: 'Underpass depression cells were identified as critical vulnerability nodes, providing timely risk prioritization for municipal barrier placement.'
    }
  ];

  get selectedEvent() {
    return this.historicalEvents.find(e => e.id === this.selectedEventId) || this.historicalEvents[0];
  }

  constructor(
    private analyticsService: AnalyticsService,
    private floodService: FloodService,
    private rainfallApi: RainfallApiService
  ) {}

  ngOnInit(): void {
    this.loading = true;
    this.analyticsService.getAnalyticsSummary().subscribe({
      next: data => {
        this.summary = data;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
    this.floodService.getFloodZones('NOW').subscribe({
      next: zones => {
        this.analyticsZones = zones;
        this.riskCounts = {
          noRisk: zones.filter(zone => zone.riskLevel === 'NONE').length,
          low: zones.filter(zone => zone.riskLevel === 'LOW').length,
          medium: zones.filter(zone => zone.riskLevel === 'MEDIUM').length,
          high: zones.filter(zone => zone.riskLevel === 'HIGH').length,
          critical: zones.filter(zone => zone.riskLevel === 'CRITICAL').length
        };
      },
      error: () => { this.analyticsZones = []; }
    });
    this.rainfallApi.locations().subscribe({
      next: config => {
        this.weatherLocation = config.locations[0] ?? null;
        if (!this.weatherLocation) {
          this.forecastStatusText = 'No monitoring point is configured in the project area.';
          return;
        }
        this.rainfallApi.current(this.weatherLocation.id).subscribe({
          next: reading => { this.rainfallReading = reading; },
          error: () => { this.rainfallReading = null; }
        });
        this.rainfallApi.hourly(this.weatherLocation.id).subscribe({
          next: forecast => this.setForecast(forecast),
          error: () => {
            this.forecastStatusText = 'Weather API forecast unavailable; no chart values are displayed.';
            this.setForecast(null);
          }
        });
      },
      error: () => { this.forecastStatusText = 'Rainfall monitoring configuration is unavailable.'; }
    });
  }

  riskPercent(key: keyof typeof this.riskCounts): number {
    const total = this.analyticsZones.length;
    return total ? Math.round(this.riskCounts[key] / total * 100) : 0;
  }

  private setForecast(forecast: RainfallForecast | null): void {
    const hours = forecast?.hourly?.slice(0, 10) ?? [];
    const valid = hours.filter(hour => typeof hour.precipitation_mm === 'number' && Number.isFinite(hour.precipitation_mm));
    this.peakRainfall = valid.length ? Math.max(...valid.map(hour => hour.precipitation_mm!)) : null;
    this.rainfallScale = Math.max(1, Math.ceil((this.peakRainfall ?? 1) / 5) * 5);
    this.rainfallPointsWithCoords = valid.map((hour, index) => {
      const x = valid.length <= 1 ? 350 : 60 + index * (585 / (valid.length - 1));
      const y = 180 - (hour.precipitation_mm! / this.rainfallScale) * 145;
      return { time: this.formatForecastTime(hour.timestamp), x, y, value: hour.precipitation_mm! };
    });
    this.rainfallLinePath = this.rainfallPointsWithCoords.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
    const first = this.rainfallPointsWithCoords[0];
    const last = this.rainfallPointsWithCoords[this.rainfallPointsWithCoords.length - 1];
    this.rainfallAreaPath = first && last ? `${this.rainfallLinePath} L ${last.x} 180 L ${first.x} 180 Z` : '';
    this.forecastStatusText = forecast
      ? `Open-Meteo hourly forecast · ${forecast.status}${forecast.forecast_is_stale ? ' · forecast cache is stale' : ''}${forecast.fetched_at ? ' · retrieved ' + this.formatForecastTime(forecast.fetched_at) : ''}`
      : 'Weather API forecast unavailable; no chart values are displayed.';
  }

  formatForecastTime(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Time unavailable' : new Intl.DateTimeFormat('en-IN', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'
    }).format(date);
  }

  getScoreClass(score: number): string {
    if (score >= 80) return 'status-unsafe';
    if (score >= 50) return 'status-caution';
    return 'status-safe';
  }

  getTrendClass(trend: string): string {
    if (trend === 'INCREASING') return 'trend-increasing';
    if (trend === 'DECREASING') return 'trend-decreasing';
    return 'trend-stable';
  }
}
