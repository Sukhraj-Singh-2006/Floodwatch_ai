import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  DNOHealthResponse,
  DNOEventsResponse,
  DNOPredictRequest,
  DNOPredictResponse,
  DNOGeoJsonResponse,
  DNOTimestepForecast
} from '../models/dno.model';

@Injectable({
  providedIn: 'root'
})
export class DnoService {
  private readonly baseUrl = environment.apiBaseUrl;

  // Reactive state signals
  readonly health = signal<DNOHealthResponse | null>(null);
  readonly availableEvents = signal<DNOEventsResponse | null>(null);
  readonly selectedEventId = signal<string>('storm_011');
  readonly currentPrediction = signal<DNOPredictResponse | null>(null);
  readonly selectedLeadMinutes = signal<number>(60);
  readonly isPredicting = signal<boolean>(false);
  readonly isGeoJsonLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  constructor(private http: HttpClient) {}

  /**
   * Fetches DNO service operational health, active hardware device (CUDA/CPU),
   * model checkpoint integrity (SHA-256), and training configuration.
   */
  getHealth(): Observable<DNOHealthResponse> {
    return this.http.get<DNOHealthResponse>(`${this.baseUrl}/api/v1/dno/health`).pipe(
      tap(healthData => {
        this.health.set(healthData);
      }),
      catchError(err => {
        this.errorMessage.set(this.readableFailure(err, 'DNO health information is unavailable.'));
        return throwError(() => err);
      })
    );
  }

  /**
   * Retrieves list of the 30 prepared Chennai storm events in the library.
   */
  getEvents(): Observable<DNOEventsResponse> {
    return this.http.get<DNOEventsResponse>(`${this.baseUrl}/api/v1/dno/events`).pipe(
      tap(eventsData => {
        this.availableEvents.set(eventsData);
      }),
      catchError(err => {
        this.errorMessage.set(this.readableFailure(err, 'Prepared Chennai storm events are unavailable.'));
        return throwError(() => err);
      })
    );
  }

  /**
   * Executes hydrodynamic prediction on a selected prepared storm event.
   * Caches result in currentPrediction signal.
   */
  predict(request: DNOPredictRequest): Observable<DNOPredictResponse> {
    this.isPredicting.set(true);
    this.errorMessage.set(null);

    return this.http.post<DNOPredictResponse>(`${this.baseUrl}/api/v1/dno/predict`, request).pipe(
      tap(response => {
        this.currentPrediction.set(response);
        this.selectedEventId.set(request.event_id);
        this.isPredicting.set(false);
      }),
      catchError(err => {
        this.isPredicting.set(false);
        this.errorMessage.set(this.readableFailure(err, 'DNO inference failed; no forecast was produced.'));
        return throwError(() => err);
      })
    );
  }

  private readableFailure(error: any, fallback: string): string {
    const detail = error?.error?.detail;
    if (typeof detail === 'string' && /checkpoint.*unavailable/i.test(detail)) {
      return 'DNO forecast unavailable: the required model checkpoint is missing from this backend deployment.';
    }
    if (error?.status === 0) return 'DNO backend is not reachable. Start the backend and check its connection.';
    if (error?.status === 503) return 'DNO forecast service is unavailable. Check backend model readiness.';
    return fallback;
  }

  /**
   * Retrieves WGS84 GeoJSON FeatureCollection of inundated cells at a specific forecast lead minute.
   */
  getForecastGeoJson(
    eventId: string,
    leadMinutes: number = 60,
    thresholdM: number = 0.10,
    maxFeatures: number = 1500
  ): Observable<DNOGeoJsonResponse> {
    this.isGeoJsonLoading.set(true);

    const params = new HttpParams()
      .set('lead_minutes', leadMinutes.toString())
      .set('threshold_m', thresholdM.toString())
      .set('max_features', maxFeatures.toString());

    return this.http.get<DNOGeoJsonResponse>(
      `${this.baseUrl}/api/v1/dno/forecast/${eventId}/geojson`,
      { params }
    ).pipe(
      tap(() => {
        this.isGeoJsonLoading.set(false);
      }),
      catchError(err => {
        this.isGeoJsonLoading.set(false);
        return throwError(() => err);
      })
    );
  }

  /**
   * Helper to set current lead time without re-running inference
   */
  setLeadMinutes(minutes: number): void {
    const clamped = Math.max(5, Math.min(120, Math.round(minutes / 5) * 5));
    this.selectedLeadMinutes.set(clamped);
  }

  /**
   * Returns the forecast item for the currently selected lead minute
   */
  getCurrentTimestepForecast(): DNOTimestepForecast | null {
    const pred = this.currentPrediction();
    if (!pred || !pred.forecasts) return null;
    const targetMin = this.selectedLeadMinutes();
    return pred.forecasts.find(f => f.lead_minutes === targetMin) || pred.forecasts[0] || null;
  }
}
