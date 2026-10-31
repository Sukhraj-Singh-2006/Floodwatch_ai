import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  RainfallForecast,
  RainfallLocationsResponse,
  RainfallReading,
  RainfallStatus
} from '../models/rainfall.model';

@Injectable({ providedIn: 'root' })
export class RainfallApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/api/v1/rainfall`;

  locations(): Observable<RainfallLocationsResponse> {
    return this.http.get<RainfallLocationsResponse>(`${this.baseUrl}/locations`);
  }

  current(locationId: string): Observable<RainfallReading> {
    return this.http.get<RainfallReading>(`${this.baseUrl}/current`, { params: this.locationParams(locationId) });
  }

  hourly(locationId: string): Observable<RainfallForecast> {
    return this.http.get<RainfallForecast>(`${this.baseUrl}/hourly`, { params: this.locationParams(locationId) });
  }

  status(locationId: string): Observable<RainfallStatus> {
    return this.http.get<RainfallStatus>(`${this.baseUrl}/status`, { params: this.locationParams(locationId) });
  }

  history(locationId: string, limit = 168): Observable<unknown> {
    const params = this.locationParams(locationId).set('limit', limit);
    return this.http.get(`${this.baseUrl}/history`, { params });
  }

  private locationParams(locationId: string): HttpParams {
    return new HttpParams().set('location_id', locationId);
  }
}
