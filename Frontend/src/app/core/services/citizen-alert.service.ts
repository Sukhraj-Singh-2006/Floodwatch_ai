import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, interval, switchMap, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface TargetedAlert {
  id: number;
  alert_code: string;
  title: string;
  severity: 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  flood_category: string;
  affected_ward: string;
  affected_landmarks: string[];
  message: string;
  safety_instructions: string;
  recommended_safe_routes: string[];
  issued_at: string;
  expires_at: string;
  delivery_status: string;
  acknowledged_at?: string;
  proximity_distance_meters?: number;
}

@Injectable({
  providedIn: 'root'
})
export class CitizenAlertService {
  private baseUrl = environment.apiBaseUrl;

  alerts = signal<TargetedAlert[]>([]);
  unreadCount = signal<number>(0);
  activeEmergency = signal<TargetedAlert | null>(null);

  constructor(private http: HttpClient) {}

  fetchMyAlerts(): Observable<TargetedAlert[]> {
    return this.http.get<TargetedAlert[]>(`${this.baseUrl}/api/v1/alerts/my-alerts`).pipe(
      tap(list => {
        this.alerts.set(list);
        const unread = list.filter(a => !a.acknowledged_at).length;
        this.unreadCount.set(unread);

        const criticalOrHigh = list.find(a => (a.severity === 'CRITICAL' || a.severity === 'HIGH') && !a.acknowledged_at);
        this.activeEmergency.set(criticalOrHigh || null);
      }),
      catchError(() => of([]))
    );
  }

  acknowledgeAlert(alertId: number): Observable<any> {
    return this.http.patch(`${this.baseUrl}/api/v1/alerts/${alertId}/read`, {}).pipe(
      tap(() => {
        this.fetchMyAlerts().subscribe();
      })
    );
  }

  // Polling for live targeted alert updates
  startAlertPolling(intervalMs: number = 30000): Observable<TargetedAlert[]> {
    return interval(intervalMs).pipe(
      switchMap(() => this.fetchMyAlerts())
    );
  }
}
