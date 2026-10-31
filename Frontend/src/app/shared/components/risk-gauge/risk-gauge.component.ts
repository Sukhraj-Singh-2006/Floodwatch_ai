import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-risk-gauge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="risk-gauge-box">
      <svg class="gauge-svg" viewBox="0 0 160 160">
        <!-- Background track -->
        <circle
          cx="80"
          cy="80"
          r="65"
          fill="none"
          stroke="rgba(255, 255, 255, 0.08)"
          stroke-width="12"
        />
        <!-- Progress track -->
        <circle
          cx="80"
          cy="80"
          r="65"
          fill="none"
          [attr.stroke]="gaugeColor"
          stroke-width="12"
          stroke-linecap="round"
          [attr.stroke-dasharray]="circumference"
          [attr.stroke-dashoffset]="dashOffset"
          transform="rotate(-90 80 80)"
          class="progress-ring"
        />
      </svg>
      <div class="gauge-inner">
        <span class="score-value">{{ score }}%</span>
        <span class="score-label">{{ scoreLabel }}</span>
        <span class="score-level" [style.color]="gaugeColor">{{ riskTextOverride || riskText }}</span>
      </div>
    </div>
  `,
  styles: [`
    .risk-gauge-box {
      position: relative;
      width: 170px;
      height: 170px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .gauge-svg {
      width: 100%;
      height: 100%;
      transform: scale(1);
    }
    .progress-ring {
      transition: stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.4s ease;
    }
    .gauge-inner {
      position: absolute;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .score-value {
      font-family: 'Outfit', sans-serif;
      font-size: 2.2rem;
      font-weight: 800;
      color: var(--text-main);
      line-height: 1;
    }
    .score-label {
      font-size: 0.72rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 0.15rem;
    }
    .score-level {
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 0.15rem;
    }
  `]
})
export class RiskGaugeComponent {
  @Input() score = 0;
  @Input() scoreLabel = 'Risk Score';
  @Input() riskTextOverride = '';

  readonly circumference = 2 * Math.PI * 65;

  get dashOffset(): number {
    const clamped = Math.min(100, Math.max(0, this.score));
    return this.circumference - (clamped / 100) * this.circumference;
  }

  get gaugeColor(): string {
    if (this.score >= 80) return '#ef4444'; // Critical / High
    if (this.score >= 50) return '#f59e0b'; // Caution / Medium
    if (this.score >= 20) return '#06b6d4'; // Low
    return '#10b981'; // Safe
  }

  get riskText(): string {
    if (this.score >= 80) return 'High Flood Risk';
    if (this.score >= 50) return 'Medium Risk';
    if (this.score >= 20) return 'Low Risk';
    return 'Safe / No Risk';
  }
}
