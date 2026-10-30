import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../core/auth/auth.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="register-wrapper">
      <div class="register-bg-overlay"></div>

      <div class="register-container">
        <!-- Brand Header -->
        <div class="register-brand">
          <div class="brand-logo-badge">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
              <path d="M2 17l10 5 10-5"></path>
              <path d="M2 12l10 5 10-5"></path>
            </svg>
          </div>
          <h1 class="brand-title">Citizen Safety Registration</h1>
          <p class="brand-subtitle">Receive hyper-local flood alerts & safe mobility routes across Greater Chennai</p>
        </div>

        <!-- Wizard Stepper Indicator -->
        <div class="stepper">
          <div class="step-item" [class.active]="step() === 1" [class.completed]="step() > 1">
            <div class="step-circle">{{ step() > 1 ? '✓' : '1' }}</div>
            <span class="step-label">Account</span>
          </div>
          <div class="step-line" [class.completed]="step() > 1"></div>
          
          <div class="step-item" [class.active]="step() === 2" [class.completed]="step() > 2">
            <div class="step-circle">{{ step() > 2 ? '✓' : '2' }}</div>
            <span class="step-label">Verify</span>
          </div>
          <div class="step-line" [class.completed]="step() > 2"></div>

          <div class="step-item" [class.active]="step() === 3" [class.completed]="step() > 3">
            <div class="step-circle">{{ step() > 3 ? '✓' : '3' }}</div>
            <span class="step-label">Alerts</span>
          </div>
          <div class="step-line" [class.completed]="step() > 3"></div>

          <div class="step-item" [class.active]="step() === 4">
            <div class="step-circle">4</div>
            <span class="step-label">Privacy</span>
          </div>
        </div>

        <!-- Main Wizard Card -->
        <div class="glass-card wizard-card">
          @if (errorMessage()) {
            <div class="alert-banner error">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <span>{{ errorMessage() }}</span>
            </div>
          }

          <!-- STEP 1: Account Information -->
          @if (step() === 1) {
            <div class="step-content">
              <div class="step-header">
                <h2>1. Account Information</h2>
                <p>Provide your personal details to receive targeted safety warnings</p>
              </div>

              <div class="form-grid">
                <div class="form-group full-width">
                  <label for="fullName">Full Name</label>
                  <input
                    id="fullName"
                    type="text"
                    [(ngModel)]="formData.fullName"
                    placeholder="e.g. Rohan Sharma"
                    class="form-control"
                  />
                </div>

                <div class="form-group">
                  <label for="email">Email Address</label>
                  <input
                    id="email"
                    type="email"
                    [(ngModel)]="formData.email"
                    placeholder="e.g. rohan.citizen@gmail.com"
                    class="form-control"
                  />
                </div>

                <div class="form-group">
                  <label for="mobile">Mobile Number (10 digits)</label>
                  <div class="mobile-input-group">
                    <span class="prefix">+91</span>
                    <input
                      id="mobile"
                      type="tel"
                      [(ngModel)]="formData.mobile"
                      placeholder="9820112233"
                      maxlength="10"
                      class="form-control"
                    />
                  </div>
                </div>

                <div class="form-group">
                  <label for="regPassword">Password</label>
                  <input
                    id="regPassword"
                    type="password"
                    [(ngModel)]="formData.password"
                    placeholder="Min. 8 characters"
                    class="form-control"
                  />
                </div>

                <div class="form-group">
                  <label for="confirmPassword">Confirm Password</label>
                  <input
                    id="confirmPassword"
                    type="password"
                    [(ngModel)]="formData.confirmPassword"
                    placeholder="Repeat password"
                    class="form-control"
                  />
                </div>
              </div>

              <div class="action-row right">
                <button
                  type="button"
                  class="btn btn-primary btn-lg"
                  [disabled]="isProcessing()"
                  (click)="submitStep1()"
                >
                  @if (isProcessing()) {
                    <span class="spinner"></span>
                    <span>Sending OTP...</span>
                  } @else {
                    <span>Verify & Continue →</span>
                  }
                </button>
              </div>
            </div>
          }

          <!-- STEP 2: OTP Verification -->
          @if (step() === 2) {
            <div class="step-content">
              <div class="step-header">
                <h2>2. Verification Code</h2>
                <p>We sent a 6-digit verification code to <strong>{{ formData.email }}</strong>.</p>
              </div>

              <div class="demo-otp-hint">
                <div class="hint-badge">Simulation Mode</div>
                <p>{{ otpMessage || 'Enter the verification code sent to your email. In local development, the backend returns the test code here.' }}</p>
              </div>

              <div class="otp-input-container">
                <input
                  type="text"
                  [(ngModel)]="otpCode"
                  maxlength="6"
                  placeholder="------"
                  class="form-control otp-input font-mono"
                  autofocus
                />
              </div>

              <div class="action-row between">
                <button type="button" class="btn btn-ghost" (click)="step.set(1)">
                  ← Back to Details
                </button>
                <button
                  type="button"
                  class="btn btn-primary btn-lg"
                  [disabled]="isProcessing() || otpCode.length !== 6"
                  (click)="submitStep2()"
                >
                  @if (isProcessing()) {
                    <span class="spinner"></span>
                    <span>Verifying...</span>
                  } @else {
                    <span>Confirm OTP →</span>
                  }
                </button>
              </div>
            </div>
          }

          <!-- STEP 3: Alert Preferences -->
          @if (step() === 3) {
            <div class="step-content">
              <div class="step-header">
                <h2>3. Alert Preferences</h2>
                <p>Customize the flood warnings you wish to receive during heavy rainfall</p>
              </div>

              <div class="preference-list">
                <label class="toggle-card">
                  <div class="toggle-info">
                    <strong>Flash Flood & Waterlogging Alerts</strong>
                    <span>Receive real-time notifications for critical water accumulation (>15cm)</span>
                  </div>
                  <input type="checkbox" [(ngModel)]="formData.preferences.flood_alerts_enabled" />
                </label>

                <label class="toggle-card">
                  <div class="toggle-info">
                    <strong>Safe Route Proximity Warnings</strong>
                    <span>Alert me if my daily route intersects a high-risk flooded arterial road</span>
                  </div>
                  <input type="checkbox" [(ngModel)]="formData.preferences.route_warnings_enabled" />
                </label>

                <label class="toggle-card">
                  <div class="toggle-info">
                    <strong>High & Critical Emergency Alerts</strong>
                    <span>Mandatory high-priority evacuation and severe flood warnings</span>
                  </div>
                  <input type="checkbox" [(ngModel)]="formData.preferences.high_risk_alerts_enabled" />
                </label>

                <div class="delivery-channels">
                  <span class="sub-heading">Delivery Channels</span>
                  <div class="channels-grid">
                    <label class="checkbox-pill">
                      <input type="checkbox" [(ngModel)]="formData.preferences.push_enabled" />
                      <span>In-App Push</span>
                    </label>
                    <label class="checkbox-pill">
                      <input type="checkbox" [(ngModel)]="formData.preferences.sms_enabled" />
                      <span>SMS Alerts</span>
                    </label>
                    <label class="checkbox-pill">
                      <input type="checkbox" [(ngModel)]="formData.preferences.email_enabled" />
                      <span>Email Digest</span>
                    </label>
                  </div>
                </div>
              </div>

              <div class="action-row between">
                <button type="button" class="btn btn-ghost" (click)="step.set(2)">
                  ← Back
                </button>
                <button type="button" class="btn btn-primary btn-lg" (click)="step.set(4)">
                  Continue to Privacy →
                </button>
              </div>
            </div>
          }

          <!-- STEP 4: Location Consent & Emergency Contact -->
          @if (step() === 4) {
            <div class="step-content">
              <div class="step-header">
                <h2>4. Privacy Consent & Emergency Contact</h2>
                <p>Finalize your registration with explicit location sharing permissions</p>
              </div>

              <!-- Consent Card -->
              <div class="consent-box" [class.consented]="formData.locationConsent">
                <label class="consent-checkbox-wrap">
                  <input type="checkbox" [(ngModel)]="formData.locationConsent" />
                  <div class="consent-text">
                    <strong>I grant explicit consent to share my device location</strong>
                    <p>
                      FloodWatch AI uses my location strictly to compute real-time proximity to flooded zones
                      and calculate safer transit routes. My coordinates are never public, and I can revoke consent or
                      purge my session anytime in Settings.
                    </p>
                  </div>
                </label>
              </div>

              <!-- Optional Emergency Contact -->
              <div class="emergency-contact-section">
                <div class="sub-heading-row">
                  <span class="sub-heading">Emergency Contact (Optional)</span>
                  <span class="badge-optional">Recommended</span>
                </div>
                <p class="hint">Will be notified via SMS if you are detected inside a critical flood inundation zone</p>

                <div class="form-grid">
                  <div class="form-group">
                    <label for="contactName">Contact Name</label>
                    <input
                      id="contactName"
                      type="text"
                      [(ngModel)]="formData.emergencyContact.contact_name"
                      placeholder="e.g. Sunita Sharma"
                      class="form-control"
                    />
                  </div>
                  <div class="form-group">
                    <label for="relationship">Relationship</label>
                    <select id="relationship" [(ngModel)]="formData.emergencyContact.relationship" class="form-control">
                      <option value="Parent">Parent</option>
                      <option value="Spouse">Spouse</option>
                      <option value="Sibling">Sibling</option>
                      <option value="Relative">Relative</option>
                      <option value="Friend">Friend</option>
                    </select>
                  </div>
                  <div class="form-group full-width">
                    <label for="contactMobile">Contact Mobile Number</label>
                    <input
                      id="contactMobile"
                      type="tel"
                      [(ngModel)]="formData.emergencyContact.mobile_number"
                      placeholder="9820556677"
                      class="form-control"
                    />
                  </div>
                </div>
              </div>

              <div class="action-row between">
                <button type="button" class="btn btn-ghost" (click)="step.set(3)">
                  ← Back
                </button>
                <button
                  type="button"
                  class="btn btn-primary btn-lg"
                  [disabled]="isProcessing()"
                  (click)="completeRegistration()"
                >
                  @if (isProcessing()) {
                    <span class="spinner"></span>
                    <span>Creating Account...</span>
                  } @else {
                    <span>Complete Registration ✓</span>
                  }
                </button>
              </div>
            </div>
          }

          <div class="wizard-footer">
            <span>Already have an account? <a routerLink="/login" class="link-login">Sign In</a></span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .register-wrapper {
      --reg-bg: #070c18;
      --reg-card-bg: rgba(15, 23, 42, 0.85);
      --reg-card-border: rgba(255, 255, 255, 0.09);
      --reg-card-shadow: 0 24px 60px -12px rgba(0, 0, 0, 0.65);
      --reg-input-bg: rgba(11, 18, 32, 0.85);
      --reg-input-border: rgba(255, 255, 255, 0.12);
      --reg-input-text: #f8fafc;
      --reg-toggle-bg: rgba(255, 255, 255, 0.03);
      --reg-toggle-border: rgba(255, 255, 255, 0.08);

      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: var(--reg-bg);
      padding: 2.5rem 1rem;
      position: relative;
      transition: background-color 0.3s ease;
    }

    :host-context([data-theme="light"]) .register-wrapper,
    :host-context(.theme-light) .register-wrapper {
      --reg-bg: #f8fafc;
      --reg-card-bg: rgba(255, 255, 255, 0.95);
      --reg-card-border: rgba(203, 213, 225, 0.85);
      --reg-card-shadow: 0 20px 45px -10px rgba(15, 23, 42, 0.08);
      --reg-input-bg: #ffffff;
      --reg-input-border: #cbd5e1;
      --reg-input-text: #0f172a;
      --reg-toggle-bg: #f8fafc;
      --reg-toggle-border: #e2e8f0;
    }

    .register-bg-overlay {
      position: absolute;
      inset: 0;
      background-image: 
        linear-gradient(to right, rgba(148, 163, 184, 0.05) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(148, 163, 184, 0.05) 1px, transparent 1px);
      background-size: 36px 36px;
      pointer-events: none;
    }
    .register-container {
      width: 100%;
      max-width: 600px;
      position: relative;
      z-index: 10;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .register-brand {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .brand-logo-badge {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: linear-gradient(135deg, #2563eb, #0284c7);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      margin-bottom: 0.6rem;
      box-shadow: 0 8px 20px rgba(37, 99, 235, 0.3);
    }
    .brand-title {
      font-size: 1.7rem;
      font-weight: 700;
      color: var(--text-main);
      margin: 0;
    }
    .brand-subtitle {
      font-size: 0.86rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }
    .stepper {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 1rem;
    }
    .step-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.35rem;
    }
    .step-circle {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-dim);
      font-weight: 600;
      font-size: 0.85rem;
      border: 1px solid rgba(255, 255, 255, 0.1);
      transition: all 0.3s ease;
    }
    .step-item.active .step-circle {
      background: #2563eb;
      color: white;
      border-color: #3b82f6;
      box-shadow: 0 0 12px rgba(37, 99, 235, 0.5);
    }
    .step-item.completed .step-circle {
      background: #10b981;
      color: white;
      border-color: #10b981;
    }
    .step-label {
      font-size: 0.72rem;
      color: var(--text-dim);
      font-weight: 500;
    }
    .step-item.active .step-label {
      color: var(--text-main);
      font-weight: 600;
    }
    .step-line {
      flex: 1;
      height: 2px;
      background: rgba(255, 255, 255, 0.1);
      margin: 0 0.5rem -1rem 0.5rem;
      transition: background 0.3s ease;
    }
    .step-line.completed {
      background: #10b981;
    }
    .wizard-card {
      background: var(--reg-card-bg);
      backdrop-filter: blur(20px);
      border: 1px solid var(--reg-card-border);
      border-radius: 16px;
      padding: 2rem;
      box-shadow: var(--reg-card-shadow);
    }
    .step-header {
      margin-bottom: 1.5rem;
    }
    .step-header h2 {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0 0 0.25rem 0;
    }
    .step-header p {
      font-size: 0.82rem;
      color: var(--text-dim);
      margin: 0;
    }
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .form-group.full-width {
      grid-column: span 2;
    }
    .form-group label {
      font-size: 0.8rem;
      color: var(--text-muted);
      font-weight: 500;
    }
    .form-control {
      background: var(--reg-input-bg);
      border: 1px solid var(--reg-input-border);
      border-radius: 8px;
      padding: 0.65rem 0.85rem;
      color: var(--reg-input-text);
      font-size: 0.88rem;
      outline: none;
      transition: border-color 0.2s;
    }
    .form-control:focus {
      border-color: #3b82f6;
    }
    .mobile-input-group {
      display: flex;
      align-items: center;
    }
    .mobile-input-group .prefix {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-right: none;
      border-radius: 8px 0 0 8px;
      padding: 0.65rem 0.75rem;
      font-size: 0.88rem;
      color: var(--text-dim);
    }
    .mobile-input-group .form-control {
      border-radius: 0 8px 8px 0;
      flex: 1;
    }
    .action-row {
      display: flex;
      margin-top: 1.8rem;
    }
    .action-row.right {
      justify-content: flex-end;
    }
    .action-row.between {
      justify-content: space-between;
      align-items: center;
    }
    .demo-otp-hint {
      background: rgba(59, 130, 246, 0.08);
      border: 1px solid rgba(59, 130, 246, 0.25);
      border-radius: 10px;
      padding: 1rem;
      margin-bottom: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .hint-badge {
      align-self: flex-start;
      font-size: 0.68rem;
      font-weight: 600;
      background: #2563eb;
      color: white;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
    }
    .demo-otp-hint p {
      font-size: 0.84rem;
      color: var(--text-muted);
      margin: 0;
    }
    .demo-otp-hint code {
      color: #60a5fa;
      font-weight: 700;
    }
    .otp-input-container {
      display: flex;
      justify-content: center;
      margin: 1.5rem 0;
    }
    .otp-input {
      width: 200px;
      text-align: center;
      font-size: 1.8rem;
      letter-spacing: 0.5rem;
      padding: 0.8rem;
      border: 2px solid rgba(59, 130, 246, 0.4);
    }
    .preference-list {
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
    }
    .toggle-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--reg-toggle-bg);
      border: 1px solid var(--reg-toggle-border);
      padding: 0.9rem 1.1rem;
      border-radius: 10px;
      cursor: pointer;
    }
    .toggle-card:hover {
      background: rgba(255, 255, 255, 0.05);
    }
    .toggle-info {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }
    .toggle-info strong {
      font-size: 0.88rem;
      color: var(--text-main);
    }
    .toggle-info span {
      font-size: 0.78rem;
      color: var(--text-dim);
    }
    .delivery-channels {
      margin-top: 0.6rem;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }
    .sub-heading {
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .channels-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.6rem;
    }
    .checkbox-pill {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 0.6rem 0.8rem;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.82rem;
      color: var(--text-muted);
    }
    .consent-box {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 1.2rem;
      border-radius: 12px;
      transition: all 0.2s ease;
      margin-bottom: 1.5rem;
    }
    .consent-box.consented {
      border-color: #3b82f6;
      background: rgba(59, 130, 246, 0.06);
    }
    .consent-checkbox-wrap {
      display: flex;
      gap: 0.8rem;
      cursor: pointer;
    }
    .consent-text strong {
      display: block;
      font-size: 0.9rem;
      color: var(--text-main);
      margin-bottom: 0.35rem;
    }
    .consent-text p {
      font-size: 0.8rem;
      color: var(--text-dim);
      line-height: 1.45;
      margin: 0;
    }
    .emergency-contact-section {
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding-top: 1.2rem;
    }
    .sub-heading-row {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      margin-bottom: 0.2rem;
    }
    .badge-optional {
      font-size: 0.68rem;
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      padding: 0.1rem 0.45rem;
      border-radius: 4px;
    }
    .hint {
      font-size: 0.78rem;
      color: var(--text-dim);
      margin-bottom: 0.9rem;
    }
    .wizard-footer {
      margin-top: 1.5rem;
      text-align: center;
      font-size: 0.84rem;
      color: var(--text-dim);
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      padding-top: 1.2rem;
    }
    .link-login {
      color: #60a5fa;
      text-decoration: none;
      font-weight: 500;
    }
    .link-login:hover {
      text-decoration: underline;
    }
    .alert-banner.error {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      font-size: 0.84rem;
      margin-bottom: 1.25rem;
    }
    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: white;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class RegisterComponent {
  private baseUrl = environment.apiBaseUrl;

  step = signal<number>(1);
  isProcessing = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  formData = {
    fullName: '',
    email: '',
    mobile: '',
    password: '',
    confirmPassword: '',
    locationConsent: true,
    preferences: {
      flood_alerts_enabled: true,
      route_warnings_enabled: true,
      high_risk_alerts_enabled: true,
      push_enabled: true,
      sms_enabled: true,
      email_enabled: true,
      location_alerts_enabled: true,
      emergency_contact_notifications_enabled: true
    },
    emergencyContact: {
      contact_name: '',
      relationship: 'Parent',
      mobile_number: '',
      notify_on_critical_alert: true
    }
  };

  otpCode = '';
  otpMessage = '';

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private router: Router
  ) {}

  submitStep1(): void {
    this.errorMessage.set(null);
    if (!this.formData.fullName || !this.formData.email || !this.formData.mobile || !this.formData.password) {
      this.errorMessage.set('Please fill out all required fields.');
      return;
    }
    if (this.formData.password !== this.formData.confirmPassword) {
      this.errorMessage.set('Passwords do not match.');
      return;
    }
    if (this.formData.password.length < 8) {
      this.errorMessage.set('Password must be at least 8 characters long.');
      return;
    }

    this.isProcessing.set(true);
    // Request OTP via backend
    this.http.post<{ message: string }>(`${this.baseUrl}/api/v1/auth/send-email-otp`, {
      target: this.formData.email.trim().toLowerCase(),
      purpose: 'REGISTRATION'
    }).subscribe({
      next: (response) => {
        this.isProcessing.set(false);
        this.otpMessage = response.message;
        this.step.set(2);
      },
      error: (err) => {
        this.isProcessing.set(false);
        this.errorMessage.set(err?.error?.detail || 'Failed to dispatch verification OTP.');
      }
    });
  }

  submitStep2(): void {
    this.errorMessage.set(null);
    this.isProcessing.set(true);

    this.http.post(`${this.baseUrl}/api/v1/auth/verify-email-otp`, {
      target: this.formData.email.trim().toLowerCase(),
      otp_code: this.otpCode,
      purpose: 'REGISTRATION'
    }).subscribe({
      next: () => {
        this.isProcessing.set(false);
        this.step.set(3);
      },
      error: (err) => {
        this.isProcessing.set(false);
        this.errorMessage.set(err?.error?.detail || 'Invalid or expired OTP code.');
      }
    });
  }

  completeRegistration(): void {
    this.errorMessage.set(null);
    this.isProcessing.set(true);

    const payload = {
      full_name: this.formData.fullName,
      email: this.formData.email,
      mobile: this.formData.mobile,
      password: this.formData.password,
      confirm_password: this.formData.confirmPassword,
      preferred_language: 'en',
      alert_preferences: this.formData.preferences,
      emergency_contact: this.formData.emergencyContact.contact_name ? {
        full_name: this.formData.emergencyContact.contact_name,
        relationship_type: this.formData.emergencyContact.relationship,
        mobile: this.formData.emergencyContact.mobile_number
      } : null
    };

    this.authService.registerCitizen(payload).subscribe({
      next: () => {
        this.isProcessing.set(false);
        this.router.navigate(['/citizen/dashboard']);
      },
      error: (err) => {
        this.isProcessing.set(false);
        this.errorMessage.set(err?.error?.detail || err?.message || 'Registration failed. Please review details.');
      }
    });
  }
}
