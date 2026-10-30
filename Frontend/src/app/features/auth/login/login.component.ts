import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ThemeService } from '../../../core/services/theme.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="login-page-root">
      <!-- Ambient Dynamic Background -->
      <div class="ambient-glow glow-top"></div>
      <div class="ambient-glow glow-bottom"></div>
      <div class="tech-grid-overlay"></div>

      <!-- Top Navigation Bar -->
      <header class="login-nav">
        <a routerLink="/" class="back-link">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          <span>Back to Home</span>
        </a>

        <div class="nav-right">
          <div class="eoc-badge">
            <span class="live-dot"></span>
            <span>GCC Disaster Management</span>
          </div>

          <button
            type="button"
            class="theme-toggle-btn"
            (click)="themeService.toggleTheme()"
            [title]="themeService.currentTheme() === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
            aria-label="Toggle theme"
          >
            @if (themeService.currentTheme() === 'dark') {
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            } @else {
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            }
          </button>
        </div>
      </header>

      <!-- Centered Main Content -->
      <main class="login-main">
        <div class="login-card-shell">
          <!-- Brand Badge & Title -->
          <div class="brand-hero">
            <div class="brand-badge-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
                <path d="M12 12v6"></path>
                <path d="M9 15l3-3 3 3"></path>
              </svg>
            </div>
            <h1 class="brand-heading">FloodWatch <span class="accent-ai">AI</span></h1>
            <p class="brand-subheading">Urban Flood Nowcasting & Safe Mobility System — Greater Chennai</p>
          </div>

          <!-- Glass Form Card -->
          <div class="auth-card">
            <div class="card-intro">
              <h2 class="card-title">Portal Sign In</h2>
              <p class="card-desc">Access citizen safe routes, authority controls, or system admin</p>
            </div>

            @if (errorMessage()) {
              <div class="error-banner animate-fade" role="alert">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>{{ errorMessage() }}</span>
              </div>
            }

            <form (ngSubmit)="onSubmit()" class="login-form">
              <!-- Login ID -->
              <div class="field-wrap">
                <label for="loginId" class="field-label">Email Address or Mobile Number</label>
                <div class="input-container">
                  <span class="field-icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                  </span>
                  <input
                    id="loginId"
                    name="loginId"
                    type="text"
                    [(ngModel)]="loginId"
                    placeholder="rohan.citizen@gmail.com or 9820112233"
                    required
                    autocomplete="username"
                    class="auth-input"
                  />
                </div>
              </div>

              <!-- Password -->
              <div class="field-wrap">
                <div class="label-row">
                  <label for="password" class="field-label">Password</label>
                </div>
                <div class="input-container">
                  <span class="field-icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                  </span>
                  <input
                    id="password"
                    name="password"
                    [type]="showPassword() ? 'text' : 'password'"
                    [(ngModel)]="password"
                    placeholder="Enter your password"
                    required
                    autocomplete="current-password"
                    class="auth-input has-toggle"
                  />
                  <button
                    type="button"
                    class="pwd-toggle-btn"
                    (click)="showPassword.set(!showPassword())"
                    [title]="showPassword() ? 'Hide password' : 'Show password'"
                    aria-label="Toggle password visibility"
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      @if (showPassword()) {
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      } @else {
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                      }
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Options -->
              <div class="form-row-options">
                <label class="remember-wrap">
                  <input type="checkbox" [(ngModel)]="rememberMe" name="rememberMe" class="custom-chk" />
                  <span>Keep me signed in</span>
                </label>
              </div>

              <!-- Submit Button -->
              <button type="submit" class="submit-action-btn" [disabled]="isLoading()">
                @if (isLoading()) {
                  <span class="action-spinner" aria-hidden="true"></span>
                  <span>Signing in...</span>
                } @else {
                  <span>Sign In to FloodWatch</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                }
              </button>
            </form>

            <!-- Quick Demo Credentials Section -->
            <div class="demo-login-box">
              <div class="divider-line">
                <span>OR SIGN IN AS DEMO ROLE</span>
              </div>

              <div class="demo-role-grid">
                <button
                  type="button"
                  class="demo-card-btn demo-citizen"
                  (click)="fillDemo('citizen')"
                  title="Load Citizen credentials"
                >
                  <div class="demo-icon-wrap citizen-icon">👤</div>
                  <div class="demo-texts">
                    <span class="demo-title">Citizen</span>
                    <span class="demo-hint">Safe routes & reports</span>
                  </div>
                </button>

                <button
                  type="button"
                  class="demo-card-btn demo-gov"
                  (click)="fillDemo('gov')"
                  title="Load EOC Officer credentials"
                >
                  <div class="demo-icon-wrap gov-icon">🏛️</div>
                  <div class="demo-texts">
                    <span class="demo-title">EOC Officer</span>
                    <span class="demo-hint">GCC Ripon Building</span>
                  </div>
                </button>

                <button
                  type="button"
                  class="demo-card-btn demo-admin"
                  (click)="fillDemo('admin')"
                  title="Load System Admin credentials"
                >
                  <div class="demo-icon-wrap admin-icon">🛡️</div>
                  <div class="demo-texts">
                    <span class="demo-title">Admin</span>
                    <span class="demo-hint">System & ML Ops</span>
                  </div>
                </button>
              </div>
            </div>

            <!-- Footer Link -->
            <div class="auth-card-footer">
              <span>New to FloodWatch Chennai?</span>
              <a routerLink="/register" class="register-anchor">Register as Citizen →</a>
            </div>
          </div>

          <!-- Bottom Trust Note -->
          <footer class="login-trust-footer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <span>Greater Chennai Corporation • Disaster Management Cell</span>
          </footer>
        </div>
      </main>
    </div>
  `,
  styles: [`
    /* ─── CSS Variables Scoped to Login Page ─── */
    .login-page-root {
      --lp-bg: #070c18;
      --lp-text-title: #f8fafc;
      --lp-text-sub: #94a3b8;
      --lp-card-bg: rgba(15, 23, 42, 0.78);
      --lp-card-border: rgba(255, 255, 255, 0.09);
      --lp-card-shadow: 0 24px 60px -12px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05);
      --lp-input-bg: rgba(11, 18, 32, 0.85);
      --lp-input-border: rgba(255, 255, 255, 0.12);
      --lp-input-text: #f8fafc;
      --lp-input-ph: #64748b;
      --lp-demo-bg: rgba(255, 255, 255, 0.03);
      --lp-demo-border: rgba(255, 255, 255, 0.08);
      --lp-demo-hover-bg: rgba(255, 255, 255, 0.08);
      --lp-demo-title: #f1f5f9;
      --lp-demo-sub: #94a3b8;
      --lp-glow-1: rgba(37, 99, 235, 0.28);
      --lp-glow-2: rgba(6, 182, 212, 0.2);

      min-height: 100vh;
      display: flex;
      flex-direction: column;
      position: relative;
      background-color: var(--lp-bg);
      color: var(--lp-text-title);
      overflow-x: hidden;
      font-family: inherit;
      transition: background-color 0.3s ease, color 0.3s ease;
    }

    /* Light Theme Adaptation */
    :host-context([data-theme="light"]) .login-page-root,
    :host-context(.theme-light) .login-page-root {
      --lp-bg: #f8fafc;
      --lp-text-title: #0f172a;
      --lp-text-sub: #475569;
      --lp-card-bg: rgba(255, 255, 255, 0.94);
      --lp-card-border: rgba(203, 213, 225, 0.85);
      --lp-card-shadow: 0 20px 45px -10px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05);
      --lp-input-bg: #ffffff;
      --lp-input-border: #cbd5e1;
      --lp-input-text: #0f172a;
      --lp-input-ph: #94a3b8;
      --lp-demo-bg: #f8fafc;
      --lp-demo-border: #e2e8f0;
      --lp-demo-hover-bg: #f1f5f9;
      --lp-demo-title: #0f172a;
      --lp-demo-sub: #64748b;
      --lp-glow-1: rgba(37, 99, 235, 0.12);
      --lp-glow-2: rgba(14, 165, 233, 0.08);
    }

    /* ─── Ambient Glow & Grid ─── */
    .ambient-glow {
      position: absolute;
      border-radius: 50%;
      filter: blur(120px);
      pointer-events: none;
      z-index: 0;
    }
    .glow-top {
      top: -100px;
      left: 50%;
      transform: translateX(-50%);
      width: 600px;
      height: 450px;
      background: radial-gradient(circle, var(--lp-glow-1) 0%, transparent 70%);
    }
    .glow-bottom {
      bottom: -150px;
      right: 15%;
      width: 500px;
      height: 400px;
      background: radial-gradient(circle, var(--lp-glow-2) 0%, transparent 70%);
    }
    .tech-grid-overlay {
      position: absolute;
      inset: 0;
      background-image: 
        linear-gradient(to right, rgba(148, 163, 184, 0.05) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(148, 163, 184, 0.05) 1px, transparent 1px);
      background-size: 40px 40px;
      pointer-events: none;
      z-index: 1;
    }

    /* ─── Top Navigation Bar ─── */
    .login-nav {
      position: relative;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.25rem 2rem;
      max-width: 1400px;
      width: 100%;
      margin: 0 auto;
    }
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.88rem;
      font-weight: 500;
      color: var(--lp-text-sub);
      text-decoration: none;
      padding: 0.45rem 0.85rem;
      border-radius: 8px;
      border: 1px solid transparent;
      transition: all 0.2s ease;
    }
    .back-link:hover {
      color: var(--lp-text-title);
      background: var(--lp-demo-hover-bg);
      border-color: var(--lp-demo-border);
    }
    .nav-right {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .eoc-badge {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--lp-text-sub);
      background: var(--lp-demo-bg);
      border: 1px solid var(--lp-demo-border);
      padding: 0.35rem 0.75rem;
      border-radius: 9999px;
    }
    .live-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background-color: #10b981;
      box-shadow: 0 0 8px #10b981;
      animation: pulseDot 2s infinite ease-in-out;
    }
    @keyframes pulseDot {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.35); opacity: 0.7; }
    }
    .theme-toggle-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 8px;
      background: var(--lp-demo-bg);
      border: 1px solid var(--lp-demo-border);
      color: var(--lp-text-sub);
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .theme-toggle-btn:hover {
      color: var(--lp-text-title);
      background: var(--lp-demo-hover-bg);
      border-color: rgba(37, 99, 235, 0.4);
    }

    /* ─── Main Content ─── */
    .login-main {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem 1rem 3rem;
      position: relative;
      z-index: 10;
    }
    .login-card-shell {
      width: 100%;
      max-width: 480px;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    /* ─── Brand Hero ─── */
    .brand-hero {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .brand-badge-icon {
      width: 54px;
      height: 54px;
      border-radius: 14px;
      background: linear-gradient(135deg, #2563eb, #0284c7);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      box-shadow: 0 8px 24px rgba(37, 99, 235, 0.35);
      margin-bottom: 0.85rem;
      transition: transform 0.2s ease;
    }
    .brand-badge-icon:hover {
      transform: scale(1.05);
    }
    .brand-heading {
      font-size: 1.95rem;
      font-weight: 800;
      color: var(--lp-text-title);
      letter-spacing: -0.025em;
      margin: 0;
      line-height: 1.15;
    }
    .accent-ai {
      color: #3b82f6;
      background: linear-gradient(135deg, #60a5fa, #3b82f6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .brand-subheading {
      font-size: 0.88rem;
      color: var(--lp-text-sub);
      margin: 0.35rem 0 0;
      line-height: 1.45;
      max-width: 400px;
    }

    /* ─── Auth Card ─── */
    .auth-card {
      background: var(--lp-card-bg);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid var(--lp-card-border);
      border-radius: 20px;
      padding: 2.25rem 2rem;
      box-shadow: var(--lp-card-shadow);
      transition: all 0.3s ease;
    }
    .card-intro {
      margin-bottom: 1.6rem;
    }
    .card-title {
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--lp-text-title);
      margin: 0 0 0.3rem;
      letter-spacing: -0.01em;
    }
    .card-desc {
      font-size: 0.85rem;
      color: var(--lp-text-sub);
      margin: 0;
      line-height: 1.4;
    }

    /* ─── Error Banner ─── */
    .error-banner {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #ef4444;
      padding: 0.75rem 1rem;
      border-radius: 10px;
      font-size: 0.85rem;
      margin-bottom: 1.25rem;
      font-weight: 500;
    }

    /* ─── Form Fields ─── */
    .login-form {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .field-wrap {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
    }
    .field-label {
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--lp-text-title);
      letter-spacing: 0.01em;
    }
    .input-container {
      position: relative;
      display: flex;
      align-items: center;
    }
    .field-icon {
      position: absolute;
      left: 14px;
      color: var(--lp-text-sub);
      pointer-events: none;
      display: flex;
      align-items: center;
    }
    .auth-input {
      width: 100%;
      height: 46px;
      background: var(--lp-input-bg);
      border: 1px solid var(--lp-input-border);
      border-radius: 10px;
      padding: 0 1rem 0 2.65rem;
      color: var(--lp-input-text);
      font-size: 0.92rem;
      outline: none;
      transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
      box-sizing: border-box;
    }
    .auth-input::placeholder {
      color: var(--lp-input-ph);
      opacity: 0.8;
    }
    .auth-input:focus {
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
    }
    .auth-input.has-toggle {
      padding-right: 2.85rem;
    }
    .pwd-toggle-btn {
      position: absolute;
      right: 12px;
      background: transparent;
      border: none;
      color: var(--lp-text-sub);
      padding: 6px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.18s ease;
    }
    .pwd-toggle-btn:hover {
      color: var(--lp-text-title);
    }

    /* ─── Options Row ─── */
    .form-row-options {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.82rem;
    }
    .remember-wrap {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--lp-text-sub);
      cursor: pointer;
      user-select: none;
    }
    .custom-chk {
      width: 16px;
      height: 16px;
      accent-color: #2563eb;
      cursor: pointer;
      border-radius: 4px;
    }

    /* ─── Submit Button ─── */
    .submit-action-btn {
      width: 100%;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: #ffffff;
      border: none;
      border-radius: 10px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
      transition: all 0.2s ease;
    }
    .submit-action-btn:hover:not(:disabled) {
      background: linear-gradient(135deg, #1d4ed8, #1e40af);
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(37, 99, 235, 0.45);
    }
    .submit-action-btn:active:not(:disabled) {
      transform: translateY(0);
    }
    .submit-action-btn:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
    .action-spinner {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* ─── Demo Role Switcher ─── */
    .demo-login-box {
      margin-top: 1.75rem;
    }
    .divider-line {
      display: flex;
      align-items: center;
      text-align: center;
      color: var(--lp-text-sub);
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      margin-bottom: 1rem;
    }
    .divider-line::before, .divider-line::after {
      content: '';
      flex: 1;
      border-bottom: 1px solid var(--lp-demo-border);
    }
    .divider-line span {
      padding: 0 0.75rem;
    }
    .demo-role-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.65rem;
    }
    .demo-card-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 0.35rem;
      padding: 0.85rem 0.5rem;
      background: var(--lp-demo-bg);
      border: 1px solid var(--lp-demo-border);
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
      box-sizing: border-box;
    }
    .demo-card-btn:hover {
      background: var(--lp-demo-hover-bg);
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
    }
    .demo-icon-wrap {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
    }
    .citizen-icon { background: rgba(37, 99, 235, 0.15); }
    .gov-icon { background: rgba(16, 185, 129, 0.15); }
    .admin-icon { background: rgba(168, 85, 247, 0.15); }

    .demo-card-btn.demo-citizen:hover { border-color: #3b82f6; }
    .demo-card-btn.demo-gov:hover { border-color: #10b981; }
    .demo-card-btn.demo-admin:hover { border-color: #a855f7; }

    .demo-texts {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }
    .demo-title {
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--lp-demo-title);
    }
    .demo-hint {
      font-size: 0.68rem;
      color: var(--lp-demo-sub);
      line-height: 1.15;
    }

    /* ─── Footer Links ─── */
    .auth-card-footer {
      margin-top: 1.6rem;
      padding-top: 1.25rem;
      border-top: 1px solid var(--lp-demo-border);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.45rem;
      font-size: 0.85rem;
      color: var(--lp-text-sub);
    }
    .register-anchor {
      color: #2563eb;
      font-weight: 600;
      text-decoration: none;
      transition: color 0.18s ease;
    }
    .register-anchor:hover {
      color: #1d4ed8;
      text-decoration: underline;
    }

    /* ─── Trust Footer ─── */
    .login-trust-footer {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.45rem;
      font-size: 0.72rem;
      color: var(--lp-text-sub);
      text-align: center;
      padding: 0 1rem;
    }

    /* ─── Responsive Adjustments ─── */
    @media (max-width: 520px) {
      .login-nav {
        padding: 1rem;
      }
      .eoc-badge span:last-child {
        display: none;
      }
      .auth-card {
        padding: 1.75rem 1.25rem;
      }
      .demo-role-grid {
        grid-template-columns: 1fr;
        gap: 0.5rem;
      }
      .demo-card-btn {
        flex-direction: row;
        text-align: left;
        padding: 0.65rem 0.85rem;
        gap: 0.75rem;
      }
    }
  `]
})
export class LoginComponent {
  readonly authService = inject(AuthService);
  readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  loginId = '';
  password = '';
  rememberMe = true;
  readonly showPassword = signal(false);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  fillDemo(role: 'citizen' | 'gov' | 'admin'): void {
    this.errorMessage.set(null);
    if (role === 'citizen') {
      this.loginId = 'citizen@dev.floodwatch.local';
      this.password = 'Citizen@2026';
    } else if (role === 'gov') {
      this.loginId = 'operator@dev.floodwatch.local';
      this.password = 'DevOperator@2026';
    } else if (role === 'admin') {
      this.loginId = 'admin@dev.floodwatch.local';
      this.password = 'DevAdmin@2026';
    }
  }

  onSubmit(): void {
    if (!this.loginId || !this.password) {
      this.errorMessage.set('Please enter both your login ID and password.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.authService.login({
      login_id: this.loginId,
      password: this.password,
      remember_me: this.rememberMe
    }).subscribe({
      next: () => {
        this.isLoading.set(false);
        const returnUrl = this.route.snapshot.queryParams['returnUrl'];
        if (returnUrl) {
          this.router.navigateByUrl(returnUrl);
        } else {
          this.authService.navigatePostLogin();
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err?.message || err?.error?.detail || 'Authentication failed. Please verify credentials.');
      }
    });
  }
}
