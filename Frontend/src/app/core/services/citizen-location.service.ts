import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface LocationConsent {
  location_sharing_consent: boolean;
  consent_given_at?: string;
  has_active_session?: boolean;
}

export interface SavedLocation {
  id?: number;
  label: string;
  address?: string;
  latitude: number;
  longitude: number;
  radius_meters?: number;
  is_primary?: boolean;
}

export interface EmergencyContact {
  id?: number;
  contact_name: string;
  relationship: string;
  mobile_number: string;
  notify_on_critical_alert: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class CitizenLocationService {
  private baseUrl = environment.apiBaseUrl;
  
  consentStatus = signal<boolean>(false);
  currentPosition = signal<{ lat: number; lon: number; accuracy: number; updatedAt: Date } | null>(null);
  isTracking = signal<boolean>(false);
  private watchId: number | null = null;

  constructor(private http: HttpClient) {
    this.checkConsent();
  }

  checkConsent(): Observable<LocationConsent> {
    return this.http.get<LocationConsent>(`${this.baseUrl}/api/v1/locations/me/consent`).pipe(
      tap(res => {
        this.consentStatus.set(res.location_sharing_consent);
      }),
      catchError(() => of({ location_sharing_consent: false }))
    );
  }

  updateConsent(consent: boolean): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/locations/me/consent`, {
      consent,
      consent_type: 'EXPLICIT_OPT_IN'
    }).pipe(
      tap(() => {
        this.consentStatus.set(consent);
        if (!consent) {
          this.stopTracking();
        }
      })
    );
  }

  requestBrowserLocation(): Promise<{ lat: number; lon: number; accuracy: number }> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser.'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            updatedAt: new Date()
          };
          this.currentPosition.set(coords);
          this.syncLocationToBackend(coords.lat, coords.lon, coords.accuracy).subscribe({
            error: () => {}
          });
          resolve(coords);
        },
        (err) => {
          reject(err);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    });
  }

  startLiveTracking(): void {
    if (!navigator.geolocation || this.watchId !== null) return;
    this.isTracking.set(true);

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          updatedAt: new Date()
        };
        this.currentPosition.set(coords);
        this.syncLocationToBackend(coords.lat, coords.lon, coords.accuracy).subscribe({
          error: () => {}
        });
      },
      () => {
        this.stopTracking();
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  }

  stopTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.isTracking.set(false);
  }

  syncLocationToBackend(latitude: number, longitude: number, accuracy: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/locations/me`, {
      latitude,
      longitude,
      accuracy
    });
  }

  purgeCurrentSession(): Observable<any> {
    return this.http.delete(`${this.baseUrl}/api/v1/locations/me/purge-session`).pipe(
      tap(() => {
        this.currentPosition.set(null);
        this.stopTracking();
      })
    );
  }

  deleteLocationHistory(): Observable<any> {
    return this.http.delete(`${this.baseUrl}/api/v1/locations/me/history`).pipe(
      tap(() => {
        this.currentPosition.set(null);
        this.stopTracking();
      })
    );
  }

  getSavedLocations(): Observable<SavedLocation[]> {
    return this.http.get<SavedLocation[]>(`${this.baseUrl}/api/v1/location/saved`);
  }

  addSavedLocation(payload: SavedLocation): Observable<SavedLocation> {
    return this.http.post<SavedLocation>(`${this.baseUrl}/api/v1/location/saved`, payload);
  }

  deleteSavedLocation(id: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}/api/v1/location/saved/${id}`);
  }

  getEmergencyContacts(): Observable<EmergencyContact[]> {
    return this.http.get<EmergencyContact[]>(`${this.baseUrl}/api/v1/location/emergency-contacts`);
  }

  addEmergencyContact(payload: EmergencyContact): Observable<EmergencyContact> {
    return this.http.post<EmergencyContact>(`${this.baseUrl}/api/v1/location/emergency-contacts`, payload);
  }

  deleteEmergencyContact(id: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}/api/v1/location/emergency-contacts/${id}`);
  }
}
