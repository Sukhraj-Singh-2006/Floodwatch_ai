import { Component, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import * as L from 'leaflet';

import { RoutingService } from '../../core/services/routing.service';
import { RoutePlanResult, PresetRoute, RouteOption } from '../../core/models/route.model';

import { LoadingStateComponent } from '../../shared/components/loading-state/loading-state.component';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-safe-route',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LoadingStateComponent
  ],
  template: `
    <div class="safe-route-page">
      <!-- Top Control & Route Planning Input Card -->
      <div class="card route-input-card">
        <div class="route-header-row">
          <div>
            <div class="title-with-badge">
              <h2 class="page-title">Safe Mobility & Route Planner</h2>
              <span class="badge-role">Flood-Avoidance Engine</span>
            </div>
            <p class="page-sub">Calculates optimal evacuation and transit paths avoiding inundated road corridors</p>
          </div>
        </div>

        <div class="inputs-bar">
          <!-- From -->
          <div class="input-field-group">
            <span class="field-label">From (Origin):</span>
            <div class="input-wrap">
              <span class="dot-origin"></span>
              <input
                type="text"
                class="route-input"
                placeholder="Enter source location..."
                [(ngModel)]="sourceLocation"
                (ngModelChange)="markRouteOutdated()"
              />
            </div>
          </div>

          <!-- Swap Button -->
          <button type="button" class="btn-swap" (click)="swapLocations()" title="Swap Origin and Destination">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="17 1 21 5 17 9"></polyline>
              <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
              <polyline points="7 23 3 19 7 15"></polyline>
              <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
            </svg>
          </button>

          <!-- To -->
          <div class="input-field-group">
            <span class="field-label">To (Destination):</span>
            <div class="input-wrap">
              <span class="dot-dest"></span>
              <input
                type="text"
                class="route-input"
                placeholder="Enter destination location..."
                [(ngModel)]="destinationLocation"
                (ngModelChange)="markRouteOutdated()"
              />
            </div>
          </div>

          <!-- Vehicle Type -->
          <div class="input-field-group">
            <span class="field-label">Vehicle Type:</span>
            <div class="input-wrap">
              <select [(ngModel)]="vehicleType" (ngModelChange)="markRouteOutdated()" class="route-input" style="padding-left: 0.75rem; cursor: pointer;">
                <option value="car">Car (Sedan/Hatch)</option>
                <option value="SUV">SUV (High Clearance)</option>
                <option value="truck">Heavy Commercial Truck</option>
                <option value="rescue">Emergency / Rescue Vehicle</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            class="btn btn-primary btn-find"
            (click)="calculateRoute()"
            [disabled]="loading"
          >
            Find Safest Route
          </button>
        </div>

        <!-- Emergency Services Quick Target -->
        <div class="emergency-target-row">
          <span class="emergency-title">🚨 Emergency Facility Navigation:</span>
          <div class="emergency-chips">
            <button type="button" class="emergency-chip hospital" (click)="targetEmergencyFacility('hospital')">
              🏥 Nearest Hospital / Trauma Center
            </button>
            <button type="button" class="emergency-chip fire" (click)="targetEmergencyFacility('fire_station')">
              🚒 Nearest Fire & High-Water Rescue
            </button>
            <button type="button" class="emergency-chip police" (click)="targetEmergencyFacility('police')">
              🚓 Nearest Police Command Post
            </button>
          </div>
        </div>

        <!-- Presets -->
        <div class="presets-row">
          <span class="presets-title">Quick Scenarios:</span>
          <div class="preset-chips">
            @for (preset of presetRoutes; track preset.id) {
              <button
                type="button"
                class="preset-chip"
                [class.active]="sourceLocation === preset.source && destinationLocation === preset.destination"
                (click)="applyPreset(preset)"
              >
                {{ preset.label }}
              </button>
            }
          </div>
        </div>
      </div>

      <!-- Main Layout: Map & Comparison Cards -->
      <div class="route-main-grid">
        <!-- Leaflet Map -->
        <div class="card map-column">
          <div class="map-inner-wrap">
            <div #routeMapCanvas class="leaflet-map-canvas"></div>

            <!-- In-Map Semantic Legend -->
            <div class="route-map-legend">
              <div class="legend-row">
                <span class="legend-line route-safe-line"></span>
                <span>Recommended Safer Route</span>
              </div>
              <div class="legend-row">
                <span class="legend-line route-alt-line"></span>
                <span>Higher-Risk Alternative</span>
              </div>
              <div class="legend-row">
                <span class="hazard-dot"></span>
                <span>Flood Hazard</span>
              </div>
              <div class="legend-row">
                <span style="font-size: 13px;">🏥</span>
                <span>Hospital POI</span>
              </div>
              <div class="legend-row">
                <span style="font-size: 13px;">🚒</span>
                <span>Fire & Rescue Station</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Route Comparison Sidebar -->
        <div class="comparison-column">
          @if (loading) {
            <app-loading-state message="Evaluating roadway water levels & calculating safe paths..."></app-loading-state>
          } @else if (routePlan) {
            @if (routePlanOutdated) {
              <div class="route-outdated-notice" role="status">Route results are for previous inputs. Click <strong>Find Safest Route</strong> to recalculate for the selected vehicle and locations.</div>
            }
            <div class="route-vehicle-summary">
              Planned vehicle: <strong>{{ vehicleLabel(routePlan.vehicle_type ?? vehicleType) }}</strong>
              @if (routePlan.speed_assumption_kmh) { <span>· ETA planning speed {{ routePlan.speed_assumption_kmh }} km/h</span> }
            </div>
            @if (routePlan.road_network_available === false) {
              <div class="route-data-limit" role="note">No connected Chennai road graph is configured. These are planning polylines with geometry-based distances, not street-network routes.</div>
            }
            @if (routePlan.vehicle_restrictions_available === false) {
              <div class="route-data-limit" role="note">Vehicle access restrictions are unavailable in the road data. No SUV flood tolerance or emergency restricted-road access is assumed.</div>
            }
            @if (routePlan.roads_excluded_due_to_vehicle?.length) {
              <div class="route-data-limit">Roads excluded for this vehicle:
                @for (road of routePlan.roads_excluded_due_to_vehicle; track road.id) { <span>{{ road.name }} ({{ road.reason }}) </span> }
              </div>
            }
            <!-- Card 1: Recommended Safe Route -->
            <div class="card route-card recommended-card">
              <div class="route-card-top">
                <div class="rec-badge">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  RECOMMENDED SAFE ROUTE
                </div>
                <span class="safety-score font-mono status-safe">
                  {{ routePlan.recommendedRoute.safetyScore }}% SAFE
                </span>
              </div>

              <h4 class="route-name">{{ routePlan.recommendedRoute.name }}</h4>
              <p class="route-notes">{{ routePlan.recommendedRoute.notes }}</p>

              <div class="route-metrics-row">
                <div class="r-metric">
                  <span class="r-lbl">Distance</span>
                  <span class="r-val font-mono">{{ routePlan.recommendedRoute.distanceKm }} km</span>
                </div>
                <div class="r-metric">
                  <span class="r-lbl">Est. Time</span>
                  <span class="r-val font-mono">{{ routePlan.recommendedRoute.etaMinutes }} min</span>
                </div>
                <div class="r-metric">
                  <span class="r-lbl">Flood Risk</span>
                  <span class="badge" [ngClass]="routeRiskClass(routePlan.recommendedRoute.riskStatus)">{{ routePlan.recommendedRoute.riskStatus }}</span>
                </div>
                <div class="r-metric">
                  <span class="r-lbl">Hazards Avoided</span>
                  <span class="r-val font-mono text-safe">{{ routePlan.recommendedRoute.floodPointsAvoided }}</span>
                </div>
              </div>
            </div>

            <!-- Card 2: Faster Alternative Route -->
            <div class="card route-card alternative-card">
              <div class="route-card-top">
                <span class="alt-badge">HIGHER-RISK ALTERNATIVE</span>
                <span class="safety-score font-mono status-unsafe">
                  {{ routePlan.alternativeRoute.safetyScore }}% SAFE
                </span>
              </div>

              <h4 class="route-name">{{ routePlan.alternativeRoute.name }}</h4>
              <p class="route-notes">{{ routePlan.alternativeRoute.notes }}</p>

              <div class="route-metrics-row">
                <div class="r-metric">
                  <span class="r-lbl">Distance</span>
                  <span class="r-val font-mono">{{ routePlan.alternativeRoute.distanceKm }} km</span>
                </div>
                <div class="r-metric">
                  <span class="r-lbl">Est. Time</span>
                  <span class="r-val font-mono">{{ routePlan.alternativeRoute.etaMinutes }} min</span>
                </div>
                <div class="r-metric">
                  <span class="r-lbl">Flood Risk</span>
                  <span class="badge" [ngClass]="routeRiskClass(routePlan.alternativeRoute.riskStatus)">{{ routePlan.alternativeRoute.riskStatus }}</span>
                </div>
                <div class="r-metric">
                  <span class="r-lbl">Exposure</span>
                  <span class="badge status-unsafe">{{ routePlan.alternativeRoute.hazardExposure }}</span>
                </div>
              </div>

              <div class="alternative-disclaimer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>
                  The recommended route prioritizes lower flood risk and avoids deep water accumulation.
                </span>
              </div>
            </div>

            <!-- Active Hazards on Route -->
            <div class="card hazards-card">
              <div class="card-header" style="margin-bottom: 0.5rem;">
                <span class="card-title" style="font-size: 0.95rem;">Active Road Hazards ({{ routePlan.hazards.length }})</span>
              </div>
              <div class="hazards-list">
                @for (haz of routePlan.hazards; track haz.id) {
                  <div class="hazard-item">
                    <div class="h-top">
                      <span class="h-name font-mono">{{ haz.title }}</span>
                      <span class="badge" [ngClass]="haz.severity === 'UNSAFE' ? 'status-critical' : 'status-caution'">
                        {{ haz.waterDepthCm }} cm depth
                      </span>
                    </div>
                    <span class="h-location">{{ haz.location }}</span>
                    <span class="h-status">{{ haz.status }}</span>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .safe-route-page {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
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

    .route-input-card {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .inputs-bar {
      display: flex;
      align-items: flex-end;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .input-field-group {
      flex: 1;
      min-width: 220px;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .field-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .input-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }
    .dot-origin {
      position: absolute;
      left: 0.85rem;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background-color: var(--status-safe);
      box-shadow: 0 0 8px var(--status-safe);
    }
    .dot-dest {
      position: absolute;
      left: 0.85rem;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background-color: var(--brand-primary);
      box-shadow: 0 0 8px var(--brand-primary);
    }
    .route-input {
      width: 100%;
      background-color: var(--bg-darkest);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 0.55rem 1rem 0.55rem 2.2rem;
      color: var(--text-main);
      font-size: 0.875rem;
      outline: none;
      transition: border-color var(--transition-fast);

      &:focus {
        border-color: var(--brand-primary);
      }
    }

    .btn-swap {
      height: 40px;
      width: 40px;
      border-radius: var(--radius-md);
      background-color: var(--bg-card-hover);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      &:hover {
        color: var(--text-main);
        border-color: var(--text-dim);
      }
    }
    .btn-find {
      height: 40px;
      padding: 0 1.25rem;
    }

    // Presets Row
    .presets-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
      padding-top: 0.5rem;
      border-top: 1px solid var(--border-light);
    }
    .presets-title {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .preset-chips {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .preset-chip {
      font-size: 0.75rem;
      padding: 0.25rem 0.65rem;
      border-radius: var(--radius-full);
      background-color: var(--bg-darkest);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      transition: all var(--transition-fast);

      &:hover {
        color: var(--text-main);
      }
      &.active {
        background-color: rgba(59, 130, 246, 0.15);
        border-color: var(--brand-primary);
        color: #ffffff;
      }
    }

    /* Emergency Target Row */
    .emergency-target-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding-top: 0.5rem;
      border-top: 1px solid var(--border-subtle);
      flex-wrap: wrap;
    }
    .emergency-title {
      font-size: 0.75rem;
      font-weight: 700;
      color: #f87171;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .emergency-chips {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .emergency-chip {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.35rem 0.75rem;
      border-radius: var(--radius-full);
      background-color: var(--bg-darkest);
      border: 1px solid var(--border-subtle);
      color: var(--text-main);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      transition: all var(--transition-fast);
    }
    .emergency-chip.hospital {
      border-color: rgba(239, 68, 68, 0.4);
      background: rgba(239, 68, 68, 0.08);
      color: #fca5a5;
    }
    .emergency-chip.hospital:hover {
      background: rgba(239, 68, 68, 0.2);
      border-color: #ef4444;
      color: #ffffff;
    }
    .emergency-chip.fire {
      border-color: rgba(249, 115, 22, 0.4);
      background: rgba(249, 115, 22, 0.08);
      color: #fdba74;
    }
    .emergency-chip.fire:hover {
      background: rgba(249, 115, 22, 0.2);
      border-color: #f97316;
      color: #ffffff;
    }
    .emergency-chip.police {
      border-color: rgba(59, 130, 246, 0.4);
      background: rgba(59, 130, 246, 0.08);
      color: #93c5fd;
    }
    .emergency-chip.police:hover {
      background: rgba(59, 130, 246, 0.2);
      border-color: #3b82f6;
      color: #ffffff;
    }

    // Main Grid
    .route-main-grid {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 1.25rem;
      @media (max-width: 1100px) {
        grid-template-columns: 1fr;
      }
    }

    .map-column {
      padding: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .map-inner-wrap {
      position: relative;
      width: 100%;
      height: 540px;
    }
    .leaflet-map-canvas {
      width: 100%;
      height: 100%;
    }
    .route-map-legend {
      position: absolute;
      bottom: 20px;
      left: 20px;
      background: rgba(15, 23, 42, 0.9);
      backdrop-filter: blur(8px);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 0.65rem 0.85rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      z-index: 500;
      font-size: 0.75rem;
    }
    .legend-row {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      color: var(--text-main);
    }
    .legend-line {
      width: 24px;
      height: 4px;
      border-radius: 2px;
    }
    .route-safe-line {
      background-color: #10b981;
    }
    .route-alt-line {
      background: repeating-linear-gradient(90deg, #f97316, #f97316 4px, transparent 4px, transparent 8px);
    }
    .hazard-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background-color: #ef4444;
      box-shadow: 0 0 6px #ef4444;
    }

    // Comparison Column
    .comparison-column {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .route-card {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }
    .recommended-card {
      border-color: rgba(16, 185, 129, 0.4);
      background: linear-gradient(180deg, rgba(16, 185, 129, 0.05) 0%, var(--bg-card) 100%);
    }
    .alternative-card {
      border-color: rgba(249, 115, 22, 0.35);
    }
    .route-card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .rec-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.72rem;
      font-weight: 700;
      color: #10b981;
      letter-spacing: 0.04em;
    }
    .alt-badge {
      font-size: 0.72rem;
      font-weight: 700;
      color: #f97316;
      letter-spacing: 0.04em;
    }
    .safety-score {
      font-size: 0.875rem;
      font-weight: 700;
      padding: 0.15rem 0.5rem;
      border-radius: var(--radius-sm);
    }
    .route-name {
      font-size: 1.05rem;
      font-weight: 600;
      color: var(--text-main);
      margin: 0;
    }
    .route-notes {
      font-size: 0.8125rem;
      color: var(--text-muted);
      line-height: 1.4;
      margin: 0;
    }

    .route-metrics-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      background-color: var(--bg-darkest);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-sm);
      padding: 0.5rem 0.65rem;
      gap: 0.5rem;
      margin-top: 0.35rem;
    }
    .r-metric {
      display: flex;
      flex-direction: column;
    }
    .r-lbl {
      font-size: 0.68rem;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .r-val {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text-main);
    }
    .text-safe {
      color: var(--status-safe);
    }

    .alternative-disclaimer {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      color: #fed7aa;
      background-color: rgba(249, 115, 22, 0.1);
      border-left: 3px solid #f97316;
      padding: 0.4rem 0.6rem;
      border-radius: 2px;
      line-height: 1.35;
    }

    // Hazards Card
    .hazards-card {
      padding: 0.85rem 1rem;
    }
    .hazards-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .hazard-item {
      display: flex;
      flex-direction: column;
      background-color: var(--bg-darkest);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-sm);
      padding: 0.5rem 0.65rem;
      gap: 0.15rem;
    }
    .h-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .h-name {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--text-main);
    }
    .h-location {
      font-size: 0.72rem;
      color: var(--text-muted);
    }
    .h-status {
      font-size: 0.7rem;
      color: var(--status-unsafe);
    }
    .route-outdated-notice, .route-data-limit, .route-vehicle-summary {
      border-radius: var(--radius-sm); padding: .65rem .8rem; font-size: .78rem;
    }
    .route-outdated-notice { background: rgba(245,158,11,.12); border: 1px solid rgba(245,158,11,.38); color: var(--text-main); }
    .route-data-limit { background: rgba(148,163,184,.1); border: 1px solid var(--border-subtle); color: var(--text-muted); }
    .route-vehicle-summary { color: var(--text-muted); }
    .route-vehicle-summary strong { color: var(--text-main); }
  `]
})
export class SafeRouteComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('routeMapCanvas') routeMapCanvas!: ElementRef;

  sourceLocation = 'Chennai Central';
  destinationLocation = 'Chennai Airport';
  vehicleType = 'car';
  presetRoutes: PresetRoute[] = [];
  routePlan: RoutePlanResult | null = null;
  routePlanOutdated = false;
  loading = false;
  emergencyFacilities: any[] = [
    { id: 'FAC-HOSP-01', name: 'Rajiv Gandhi Govt General Hospital (RGGGH)', type: 'hospital', category: 'Tertiary Trauma Center', lat: 13.0818, lon: 80.2778, phone: '044-25305000' },
    { id: 'FAC-HOSP-02', name: 'Apollo Hospital (Greams Road)', type: 'hospital', category: 'Multispecialty Super Center', lat: 13.0594, lon: 80.2508, phone: '044-28290200' },
    { id: 'FAC-HOSP-03', name: 'MIOT International Hospital', type: 'hospital', category: 'Trauma & Flood Evacuation Center', lat: 13.0232, lon: 80.1795, phone: '044-42002288' },
    { id: 'FAC-HOSP-04', name: 'Govt Stanley Medical College Hospital', type: 'hospital', category: 'North Chennai General Hospital', lat: 13.1072, lon: 80.2883, phone: '044-25281351' },
    { id: 'FAC-HOSP-05', name: 'Dr. Kamakshi Memorial Hospital', type: 'hospital', category: 'South Chennai / Pallikaranai Hub', lat: 12.9468, lon: 80.2084, phone: '044-66300300' },
    { id: 'FAC-FIRE-01', name: 'Kilpauk Fire & Rescue Station (Command HQ)', type: 'fire_station', category: 'Disaster Rescue Command', lat: 13.0805, lon: 80.2435, phone: '101' },
    { id: 'FAC-FIRE-02', name: 'T. Nagar Fire Station', type: 'fire_station', category: 'Urban Flood Dewatering Unit', lat: 13.0378, lon: 80.2335, phone: '101' },
    { id: 'FAC-FIRE-03', name: 'Tambaram Fire & Rescue Station', type: 'fire_station', category: 'South Corridor Evacuation Command', lat: 12.9249, lon: 80.1250, phone: '101' },
    { id: 'FAC-FIRE-04', name: 'Ashok Nagar Fire & Rescue Unit', type: 'fire_station', category: 'Rapid Inundation Relief Station', lat: 13.0345, lon: 80.2118, phone: '101' },
    { id: 'FAC-POL-01', name: 'Greater Chennai Police Commissionerate', type: 'police', category: 'Central Command & Control', lat: 13.0833, lon: 80.2600, phone: '100' },
    { id: 'FAC-POL-02', name: 'Adyar Police District Headquarters', type: 'police', category: 'South Coastal Traffic & Safety Command', lat: 13.0067, lon: 80.2572, phone: '100' },
    { id: 'FAC-POL-03', name: 'Mylapore Police Station', type: 'police', category: 'East Coastal Patrol & Evac', lat: 13.0335, lon: 80.2685, phone: '100' },
    { id: 'FAC-POL-04', name: 'Guindy Traffic & Emergency Police Post', type: 'police', category: 'Industrial Hub Traffic Management', lat: 13.0100, lon: 80.2120, phone: '100' }
  ];

  private map?: L.Map;
  private routeLayersGroup = L.layerGroup();
  private emergencyLayersGroup = L.layerGroup();

  constructor(
    private routingService: RoutingService,
    private route: ActivatedRoute,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.loadPresets();
    this.loadEmergencyFacilities();
    this.route.queryParams.subscribe(params => {
      if (params['from']) this.sourceLocation = params['from'];
      if (params['to']) this.destinationLocation = params['to'];
      if (params['vehicle']) this.vehicleType = params['vehicle'];
    });
  }

  private loadEmergencyFacilities(): void {
    this.http.get<any[]>(`${environment.apiBaseUrl}/api/v1/emergency/facilities`).subscribe({
      next: (facs) => {
        if (facs && facs.length > 0) {
          this.emergencyFacilities = facs;
        }
        this.renderEmergencyMarkers();
      },
      error: () => {
        // Fallback pre-populated
        this.renderEmergencyMarkers();
      }
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.initRouteMap();
      this.calculateRoute();
    }, 120);
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
    }
  }

  private loadPresets(): void {
    this.routingService.getPresetRoutes().subscribe(presets => {
      this.presetRoutes = presets;
    });
  }

  private initRouteMap(): void {
    if (!this.routeMapCanvas) return;

    this.map = L.map(this.routeMapCanvas.nativeElement, {
      center: [13.0827, 80.2707],
      zoom: 12,
      zoomControl: false,
      attributionControl: false
    });

    L.control.zoom({ position: 'topright' }).addTo(this.map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      subdomains: ['a', 'b', 'c']
    }).addTo(this.map);

    this.emergencyLayersGroup.addTo(this.map);
    this.routeLayersGroup.addTo(this.map);
    this.renderEmergencyMarkers();

    setTimeout(() => {
      this.map?.invalidateSize();
    }, 150);
  }

  targetEmergencyFacility(type: string): void {
    const matching = this.emergencyFacilities.filter(f => f.type === type);
    if (matching.length > 0) {
      // Pick first matching or nearest
      const target = matching[0];
      this.destinationLocation = target.name;
      this.calculateRoute();
    }
  }

  private renderEmergencyMarkers(): void {
    if (!this.map) return;
    this.emergencyLayersGroup.clearLayers();

    this.emergencyFacilities.forEach(fac => {
      let iconSymbol = '🏥';
      let bgColor = '#ef4444';
      if (fac.type === 'fire_station') {
        iconSymbol = '🚒';
        bgColor = '#f97316';
      } else if (fac.type === 'police') {
        iconSymbol = '🚓';
        bgColor = '#3b82f6';
      }

      const customIcon = L.divIcon({
        className: 'emergency-poi-marker',
        html: `
          <div style="background-color: ${bgColor}; border: 2px solid #ffffff; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 0 10px ${bgColor}; cursor: pointer;">
            ${iconSymbol}
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const marker = L.marker([fac.lat, fac.lon], { icon: customIcon });
      marker.bindTooltip(`
        <div style="font-family: sans-serif; font-size: 11px;">
          <strong>${fac.name}</strong><br/>
          <span style="color: #64748b;">${fac.category || fac.type}</span><br/>
          ${fac.phone ? '📞 ' + fac.phone + '<br/>' : ''}
          <span style="color: #10b981; font-weight: bold;">⚡ Click to navigate here</span>
        </div>
      `);

      marker.on('click', () => {
        this.destinationLocation = fac.name;
        this.calculateRoute();
      });

      this.emergencyLayersGroup.addLayer(marker);
    });
  }

  calculateRoute(): void {
    this.loading = true;
    this.routingService.calculateSafeRoute(this.sourceLocation, this.destinationLocation, this.vehicleType).subscribe({
      next: plan => {
        this.routePlan = plan;
        this.routePlanOutdated = false;
        this.renderRouteOnMap(plan);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  markRouteOutdated(): void {
    if (this.routePlan) this.routePlanOutdated = true;
  }

  vehicleLabel(vehicle: string): string {
    const labels: Record<string, string> = {
      car: 'Car (Sedan/Hatch)', suv: 'SUV (High Clearance)',
      truck: 'Heavy Commercial Truck', rescue: 'Emergency / Rescue Vehicle'
    };
    return labels[vehicle.toLowerCase()] ?? vehicle;
  }

  routeRiskClass(status: string): string {
    if (status === 'SAFE') return 'status-safe';
    if (status === 'CAUTION') return 'status-caution';
    return 'status-unsafe';
  }

  swapLocations(): void {
    const temp = this.sourceLocation;
    this.sourceLocation = this.destinationLocation;
    this.destinationLocation = temp;
    this.calculateRoute();
  }

  applyPreset(preset: PresetRoute): void {
    this.sourceLocation = preset.source;
    this.destinationLocation = preset.destination;
    this.calculateRoute();
  }

  private renderRouteOnMap(plan: RoutePlanResult): void {
    if (!this.map) return;
    this.routeLayersGroup.clearLayers();

    // 1. Recommended Safe Route (Solid green/safe)
    const safePolyline = L.polyline(plan.recommendedRoute.pathCoordinates as any, {
      color: '#10b981',
      weight: 6,
      opacity: 0.9
    });
    safePolyline.bindTooltip(`
      <strong>${plan.recommendedRoute.name}</strong><br/>
      ${this.vehicleLabel(plan.vehicle_type ?? this.vehicleType)}<br/>
      ${plan.recommendedRoute.distanceKm} km • ${plan.recommendedRoute.etaMinutes} min • Safety: ${plan.recommendedRoute.safetyScore}%
    `);
    this.routeLayersGroup.addLayer(safePolyline);

    // 2. Alternative Route (Dashed orange/caution)
    const altPolyline = L.polyline(plan.alternativeRoute.pathCoordinates as any, {
      color: '#f97316',
      weight: 5,
      dashArray: '8, 8',
      opacity: 0.75
    });
    altPolyline.bindTooltip(`
      <strong>${plan.alternativeRoute.name}</strong><br/>
      ${this.vehicleLabel(plan.vehicle_type ?? this.vehicleType)}<br/>
      ${plan.alternativeRoute.distanceKm} km • ${plan.alternativeRoute.etaMinutes} min (Hazards Exposure: High)
    `);
    this.routeLayersGroup.addLayer(altPolyline);

    // 3. Custom SVG Marker for Origin
    const originIcon = L.divIcon({
      className: 'custom-map-pin',
      html: `
        <div style="background-color: #10b981; border: 2px solid #ffffff; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 11px;">
          A
        </div>
      `,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
    const originMarker = L.marker(plan.sourceCoords as any, { icon: originIcon });
    originMarker.bindTooltip(`<strong>Origin:</strong> ${plan.source}`);
    this.routeLayersGroup.addLayer(originMarker);

    // 4. Custom SVG Marker for Destination
    const destIcon = L.divIcon({
      className: 'custom-map-pin',
      html: `
        <div style="background-color: #3b82f6; border: 2px solid #ffffff; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 11px;">
          B
        </div>
      `,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
    const destMarker = L.marker(plan.destCoords as any, { icon: destIcon });
    destMarker.bindTooltip(`<strong>Destination:</strong> ${plan.destination}`);
    this.routeLayersGroup.addLayer(destMarker);

    // 5. Hazard Markers (Underpass ponding)
    plan.hazards.forEach(h => {
      const hazardIcon = L.divIcon({
        className: 'custom-map-pin',
        html: `
          <div style="background-color: #ef4444; border: 2px solid #ffffff; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; box-shadow: 0 0 10px #ef4444;">
            ⚠
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      const marker = L.marker(h.coordinates as any, { icon: hazardIcon });
      marker.bindTooltip(`
        <strong>${h.title}</strong><br/>
        Depth: <strong>${h.waterDepthCm} cm</strong><br/>
        Status: ${h.status}
      `);
      this.routeLayersGroup.addLayer(marker);
    });

    // Fit map bounds to routes
    const bounds = safePolyline.getBounds();
    this.map.fitBounds(bounds, { padding: [40, 40] });
  }
}
