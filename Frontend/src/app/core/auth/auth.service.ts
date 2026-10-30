import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpBackend } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export type UserRole = 'CITIZEN' | 'GOVERNMENT_VIEWER' | 'GOVERNMENT_OPERATOR' | 'GOVERNMENT_SUPERVISOR' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'PENDING' | 'VERIFIED' | 'SUSPENDED';

export interface UserProfile {
  id: number;
  full_name: string;
  email: string;
  mobile: string;
  role: UserRole;
  status: UserStatus;
  email_verified: boolean;
  mobile_verified: boolean;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserProfile;
}

export interface AlertPreferences {
  flood_alerts_enabled: boolean;
  route_warnings_enabled: boolean;
  high_risk_alerts_enabled: boolean;
  push_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  location_alerts_enabled: boolean;
  emergency_contact_notifications_enabled: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private baseUrl = environment.apiBaseUrl;
  private tokenKey = 'floodwatch_access_token';
  private refreshKey = 'floodwatch_refresh_token';
  private userKey = 'floodwatch_user_profile';

  currentUser = signal<UserProfile | null>(this.getStoredUser());
  token = signal<string | null>(this.getStoredToken());

  isAuthenticated = computed(() => !!this.currentUser() && !!this.token());
  userRole = computed(() => this.currentUser()?.role || null);
  isCitizen = computed(() => this.userRole() === 'CITIZEN');
  isGovernment = computed(() => !!this.userRole()?.startsWith('GOVERNMENT_'));
  isAdmin = computed(() => this.userRole() === 'ADMIN');
  isVerifiedGov = computed(() => this.isGovernment() && this.currentUser()?.status === 'VERIFIED');

  constructor(private http: HttpClient, private router: Router, handler: HttpBackend) {
    // Bypass interceptors for the refresh call itself to avoid 401 loops.
    this.httpPlain = new HttpClient(handler);
  }

  private httpPlain: HttpClient;

  private getStoredToken(): string | null {
    try {
      return localStorage.getItem(this.tokenKey);
    } catch {
      return null;
    }
  }

  getRefreshToken(): string | null {
    try {
      return localStorage.getItem(this.refreshKey);
    } catch {
      return null;
    }
  }

  /** Decode JWT expiry (seconds) without verifying signature. Returns null if unreadable. */
  getTokenExpiry(token: string | null): number | null {
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload?.exp === 'number' ? payload.exp * 1000 : null;
    } catch {
      return null;
    }
  }

  /** True when an unexpired access token is present. */
  hasValidToken(): boolean {
    const token = this.token();
    if (!token) return false;
    const exp = this.getTokenExpiry(token);
    if (exp === null) return true; // opaque token: fall back to presence check
    return Date.now() < exp - 30_000; // 30s clock skew margin
  }

  /** Exchange the stored refresh token for a new access token. */
  refreshAccessToken(): Observable<string> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available.'));
    }
    return this.httpPlain
      .post<{ access_token: string; token_type: string }>(
        `${this.baseUrl}/api/v1/auth/refresh`,
        { refresh_token: refreshToken }
      )
      .pipe(
        map((res) => res.access_token),
        tap((accessToken) => {
          this.token.set(accessToken);
          try {
            localStorage.setItem(this.tokenKey, accessToken);
          } catch {}
        }),
        catchError((err) => {
          this.clearSession();
          return throwError(() => err);
        })
      );
  }

  private getStoredUser(): UserProfile | null {
    try {
      const raw = localStorage.getItem(this.userKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  registerCitizen(payload: any): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/api/v1/auth/register`, payload).pipe(
      tap((res) => this.handleAuthSuccess(res)),
      catchError((err) => {
        const message = err?.error?.detail || err?.message || 'Registration failed. Please try again.';
        return throwError(() => new Error(message));
      })
    );
  }

  login(payload: { login_id: string; password: string; remember_me?: boolean }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/api/v1/auth/login`, payload).pipe(
      tap((res) => this.handleAuthSuccess(res)),
      catchError((err) => {
        const message = err?.error?.detail || (err.status === 0
          ? 'Cannot reach the FloodWatch API. Start the backend and try again.'
          : err?.message || 'Authentication failed. Please verify your credentials.');
        return throwError(() => new Error(message));
      })
    );
  }

  logout(): void {
    if (this.token()) {
      this.http.post(`${this.baseUrl}/api/v1/auth/logout`, {}).subscribe({
        next: () => {},
        error: () => {}
      });
    }
    this.clearSession();
    this.router.navigate(['/login']);
  }

  /** Remove tokens/user without navigating (used on refresh failure). */
  clearSession(): void {
    try {
      localStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.refreshKey);
      localStorage.removeItem(this.userKey);
    } catch {}
    this.currentUser.set(null);
    this.token.set(null);
  }

  getMe(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/auth/me`).pipe(
      tap((res: any) => {
        if (res && res.user) {
          this.currentUser.set(res.user);
          localStorage.setItem(this.userKey, JSON.stringify(res.user));
        }
      })
    );
  }

  updatePreferences(prefs: AlertPreferences): Observable<AlertPreferences> {
    return this.http.patch<AlertPreferences>(`${this.baseUrl}/api/v1/auth/me/preferences`, prefs);
  }

  hasRole(allowedRoles: UserRole[]): boolean {
    const r = this.userRole();
    return !!r && allowedRoles.includes(r);
  }

  navigatePostLogin(): void {
    const role = this.userRole();
    if (role === 'CITIZEN') {
      this.router.navigate(['/citizen/dashboard']);
    } else if (role?.startsWith('GOVERNMENT_')) {
      this.router.navigate(['/government/dashboard']);
    } else if (role === 'ADMIN') {
      this.router.navigate(['/admin']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }

  private handleAuthSuccess(res: AuthResponse): void {
    this.token.set(res.access_token);
    this.currentUser.set(res.user);
    try {
      localStorage.setItem(this.tokenKey, res.access_token);
      localStorage.setItem(this.refreshKey, res.refresh_token);
      localStorage.setItem(this.userKey, JSON.stringify(res.user));
    } catch {}
  }
}
