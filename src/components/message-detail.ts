import { messageService } from '../services/message.service';
import { videoService } from '../services/video.service';
import { toast } from './toast';
import { calculateCountdown, formatDate } from '../utils/countdown';
import { isMessageUnlocked } from '../utils/message-status';
import { VIDEO_SIGNED_URL_EXPIRY_SECONDS } from '../config/constants';
import type { Message } from '../types/database';

// --- SVG Icons (Feather-style, stroke-width 2, round caps/joins) ---

const ICON_MAIL = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg>`;

const ICON_LOCK = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

const ICON_TRASH = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;

const ICON_VIDEO = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;

const ICON_DOWNLOAD = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

class MessageDetailModal {
  private overlay: HTMLElement | null = null;
  private message: Message | null = null;
  private intervalId: number | null = null;
  // Persists across hide/show calls; cleared only on app reload
  private signedUrl: string | null = null;
  private urlExpiresAt: Date | null = null;
  // Cached countdown DOM elements to avoid repeated queries
  private countdownElements: {
    days: HTMLElement | null;
    hours: HTMLElement | null;
    minutes: HTMLElement | null;
    seconds: HTMLElement | null;
  } | null = null;

  /**
   * Displays message detail modal (locked or unlocked view based on message state).
   * Cleans up any existing modal instance before rendering.
   */
  show(message: Message): void {
    this.hide();

    this.message = message;
    this.render();

    if (!isMessageUnlocked(message)) {
      this.startCountdown();
    }
  }

  /**
   * Hides modal, stops countdown timer, and removes overlay from DOM
   */
  hide(): void {
    this.stopCountdown();
    this.countdownElements = null;

    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }

  }

  /**
   * Initializes 1-second interval timer for countdown display updates
   */
  private startCountdown(): void {
    if (!this.message) return;

    this.updateCountdown();

    this.intervalId = window.setInterval(() => {
      this.updateCountdown();
    }, 1000);
  }

  /**
   * Clears interval timer and resets intervalId to null
   */
  private stopCountdown(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Recalculates countdown and updates DOM elements with current values
   */
  private updateCountdown(): void {
    if (!this.message || !this.overlay) return;

    const scheduledDate = new Date(this.message.scheduled_date);
    scheduledDate.setUTCHours(8, 0, 0, 0);

    const countdown = calculateCountdown(scheduledDate);

    // Cache DOM elements on first call to avoid repeated queries
    if (!this.countdownElements) {
      this.countdownElements = {
        days: this.overlay.querySelector('#countdown-days'),
        hours: this.overlay.querySelector('#countdown-hours'),
        minutes: this.overlay.querySelector('#countdown-minutes'),
        seconds: this.overlay.querySelector('#countdown-seconds'),
      };
    }

    const { days, hours, minutes, seconds } = this.countdownElements;
    if (days) days.textContent = countdown.days.toString();
    if (hours) hours.textContent = countdown.hours.toString();
    if (minutes) minutes.textContent = countdown.minutes.toString();
    if (seconds) seconds.textContent = countdown.seconds.toString();
  }

  /**
   * Prompts confirmation, calls cancelMessage, closes modal and refreshes dashboard
   */
  private async handleDelete(): Promise<void> {
    if (!this.message) return;

    const confirmed = confirm('Are you sure you want to delete this message? This action cannot be undone.');
    if (!confirmed) return;

    const result = await messageService.cancelMessage(this.message.id);

    if (result.success) {
      toast.success('Message deleted');
      this.hide();
      import('./messages-dashboard').then(({ messagesDashboard }) => {
        messagesDashboard.refresh();
      });
    } else {
      toast.error(result.error || 'Failed to delete message');
    }
  }

  /**
   * Returns human-readable duration between created_at and scheduled_date
   */
  private getWaitTime(): string {
    if (!this.message) return '';

    const created = new Date(this.message.created_at);
    const scheduled = new Date(this.message.scheduled_date);
    const diffDays = Math.ceil((scheduled.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Same day';
    if (diffDays === 1) return '1 day';
    if (diffDays < 7) return `${diffDays} days`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${diffDays >= 14 ? 's' : ''}`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${diffDays >= 60 ? 's' : ''}`;
    return `${Math.floor(diffDays / 365)} year${diffDays >= 730 ? 's' : ''}`;
  }

  /**
   * Creates and appends overlay div with specified background color
   */
  private createOverlayBase(bgColor: string): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.className = 'message-detail-overlay';
    overlay.style.background = bgColor;
    document.body.appendChild(overlay);
    return overlay;
  }

  /**
   * Returns CSS string for modal buttons, cards, and headers shared by locked/unlocked views
   */
  private getSharedStyles(): string {
    return `
      .message-detail-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 20px;
        overflow-y: auto;
      }
      .back-btn {
        position: absolute;
        top: 20px;
        left: 20px;
        background: white;
        border: 2px solid black;
        border-radius: 50px;
        padding: 10px 20px;
        font-family: inherit;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .detail-card {
        background: white;
        border: 4px solid black;
        border-radius: 12px;
        box-shadow: 10px 10px 0px 0px black;
        width: 100%;
        max-width: 600px;
        margin-top: 60px;
        overflow: hidden;
      }
      .detail-header {
        padding: 25px;
        border-bottom: 3px solid black;
        display: flex;
        align-items: center;
        gap: 15px;
      }
      .header-icon {
        width: 50px;
        height: 50px;
        background: white;
        border: 2px solid black;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .header-icon svg {
        width: 24px;
        height: 24px;
        color: #333;
      }
      .meta-row {
        display: flex;
        justify-content: space-around;
        padding: 20px;
        gap: 10px;
        flex-wrap: wrap;
      }
      .meta-item {
        background: #F5F5F5;
        border: 2px solid black;
        border-radius: 8px;
        padding: 15px 20px;
        text-align: center;
        flex: 1;
        min-width: 120px;
      }
      .meta-label {
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        color: #666;
        margin-bottom: 5px;
      }
      .meta-value {
        font-weight: 700;
      }
      .delete-section {
        padding: 20px;
        border-top: 2px solid #eee;
        text-align: center;
      }
      .delete-btn {
        background: none;
        border: none;
        color: #666;
        font-family: inherit;
        font-size: 0.9rem;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      .delete-btn:hover {
        color: #dc2626;
      }
    `;
  }

  /**
   * Routes to renderLocked or renderUnlocked based on message state
   */
  private async render(): Promise<void> {
    if (!this.message) return;

    if (isMessageUnlocked(this.message)) {
      await this.renderUnlocked();
    } else {
      this.renderLocked();
    }
  }

  /**
   * Returns true if signedUrl is null or urlExpiresAt < now
   */
  private isUrlExpired(): boolean {
    if (!this.signedUrl || !this.urlExpiresAt) {
      return true;
    }
    return this.urlExpiresAt < new Date();
  }

  /**
   * Generates locked message HTML with countdown timer and metadata
   */
  private renderLocked(): void {
    if (!this.message) return;

    const createdDate = formatDate(new Date(this.message.created_at));
    const unlocksDate = formatDate(new Date(this.message.scheduled_date));
    const waitTime = this.getWaitTime();
    const isPending = this.message.status === 'pending';

    this.overlay = this.createOverlayBase('#BAE6FD');
    this.overlay.innerHTML = `
      <style>
        ${this.getSharedStyles()}
        .detail-header {
          background: #FDE68A;
        }
        .countdown-section {
          padding: 30px;
          text-align: center;
        }
        .countdown-label {
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 2px;
          margin-bottom: 20px;
          color: #333;
        }
        .countdown-boxes {
          display: flex;
          justify-content: center;
          gap: 15px;
          flex-wrap: wrap;
        }
        .countdown-box {
          width: 100px;
          height: 100px;
          border: 3px solid black;
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .countdown-box.pink { background: var(--pastel-pink); }
        .countdown-box.peach { background: #FECACA; }
        .countdown-box.yellow { background: var(--pastel-yellow); }
        .countdown-box.green { background: var(--pastel-green); }
        .countdown-number {
          font-size: 2.5rem;
          font-weight: 800;
          line-height: 1;
        }
        .countdown-unit {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          color: #555;
          margin-top: 5px;
        }
      </style>

      <button class="back-btn" id="backBtn">
        <span>&larr;</span> Dashboard
      </button>

      <div class="detail-card">
        <div class="detail-header">
          <div class="header-icon">${ICON_LOCK}</div>
          <div>
            <h2 style="margin: 0; font-size: 1.5rem;">Message Locked</h2>
            <p style="margin: 5px 0 0 0; color: #555;">Patience. Good things are waiting.</p>
          </div>
        </div>

        <div class="countdown-section">
          <div class="countdown-label">Unlocks In</div>
          <div class="countdown-boxes">
            <div class="countdown-box pink">
              <span class="countdown-number" id="countdown-days">0</span>
              <span class="countdown-unit">Days</span>
            </div>
            <div class="countdown-box peach">
              <span class="countdown-number" id="countdown-hours">0</span>
              <span class="countdown-unit">Hours</span>
            </div>
            <div class="countdown-box yellow">
              <span class="countdown-number" id="countdown-minutes">0</span>
              <span class="countdown-unit">Min</span>
            </div>
            <div class="countdown-box green">
              <span class="countdown-number" id="countdown-seconds">0</span>
              <span class="countdown-unit">Sec</span>
            </div>
          </div>
        </div>

        <div class="meta-row">
          <div class="meta-item">
            <div class="meta-label">Created</div>
            <div class="meta-value">${createdDate}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">Wait Time</div>
            <div class="meta-value">${waitTime}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">Unlocks</div>
            <div class="meta-value">${unlocksDate}</div>
          </div>
        </div>

        ${isPending ? `
          <div class="delete-section">
            <button class="delete-btn" id="deleteBtn">
              ${ICON_TRASH} Delete message
            </button>
          </div>
        ` : ''}
      </div>
    `;

    this.overlay.querySelector('#backBtn')?.addEventListener('click', () => {
      this.hide();
    });

    this.overlay.querySelector('#deleteBtn')?.addEventListener('click', () => {
      this.handleDelete();
    });
  }

  /**
   * Generates unlocked/delivered message HTML with purple header, bordered message box, metadata, and video
   */
  private async renderUnlocked(): Promise<void> {
    if (!this.message) return;

    const createdDate = formatDate(new Date(this.message.created_at));
    const deliveredDate = this.message.delivered_at
      ? formatDate(new Date(this.message.delivered_at))
      : formatDate(new Date(this.message.scheduled_date));
    const waitTime = this.getWaitTime();

    let videoError = false;
    if (this.message.video_storage_path) {
      if (this.isUrlExpired()) {
        try {
          const url = await videoService.getSignedUrl(this.message.video_storage_path);
          if (url) {
            this.signedUrl = url;
            this.urlExpiresAt = new Date(Date.now() + VIDEO_SIGNED_URL_EXPIRY_SECONDS * 1000);
          } else {
            videoError = true;
            toast.error('Unable to load video. Please try again later.');
          }
        } catch (error) {
          console.error('Failed to get signed URL:', error);
          videoError = true;
          toast.error('Unable to load video. Please try again later.');
        }
      }
    }

    this.overlay = this.createOverlayBase('#BBF7D0');
    this.overlay.innerHTML = `
      <style>
        ${this.getSharedStyles()}
        .detail-header {
          background: var(--pastel-purple, #E0CFFC);
        }
        .message-box {
          margin: 20px;
          padding: 24px;
          background: var(--pastel-blue);
          border: 3px solid black;
          border-radius: 10px;
          white-space: pre-wrap;
          line-height: 1.7;
          max-height: 350px;
          overflow-y: auto;
        }
        .video-section {
          padding: 20px 25px;
          border-top: 2px solid #eee;
        }
        .video-player {
          width: 100%;
          border-radius: 8px;
          border: 2px solid black;
        }
        .download-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 15px;
          background: var(--pastel-blue);
          border: 2px solid black;
          border-radius: 8px;
          padding: 10px 20px;
          font-family: inherit;
          font-weight: 700;
          cursor: pointer;
          text-decoration: none;
          color: black;
        }
        .video-error {
          padding: 20px;
          background: #FEE2E2;
          border: 2px solid black;
          border-radius: 8px;
          text-align: center;
          color: #991B1B;
        }
      </style>

      <button class="back-btn" id="backBtn">
        <span>&larr;</span> Dashboard
      </button>

      <div class="detail-card">
        <div class="detail-header">
          <div class="header-icon">${ICON_MAIL}</div>
          <div>
            <h2 style="margin: 0; font-size: 1.5rem;">Message Delivered</h2>
            <p style="margin: 5px 0 0 0; color: #555;">A note from your past self</p>
          </div>
        </div>

        <div class="meta-row">
          <div class="meta-item">
            <div class="meta-label">Created</div>
            <div class="meta-value">${createdDate}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">Wait Time</div>
            <div class="meta-value">${waitTime}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">Delivered</div>
            <div class="meta-value">${deliveredDate}</div>
          </div>
        </div>

        <div class="message-box">${this.message.message_text}</div>

        ${this.message.video_storage_path ? `
          <div class="video-section">
            ${videoError ? `
              <div class="video-error">
                <p style="margin: 0;">${ICON_VIDEO} Video unavailable</p>
                <p style="margin: 10px 0 0 0; font-size: 0.85rem;">The video file could not be loaded.</p>
              </div>
            ` : `
              <video class="video-player" controls>
                <source src="${this.signedUrl}" type="video/mp4">
                Your browser does not support the video tag.
              </video>
              <a href="${this.signedUrl}" download class="download-btn">
                ${ICON_DOWNLOAD} Download Video
              </a>
            `}
          </div>
        ` : ''}

        <div class="delete-section">
          <button class="delete-btn" id="deleteBtn">
            ${ICON_TRASH} Delete message
          </button>
        </div>
      </div>
    `;

    this.overlay.querySelector('#backBtn')?.addEventListener('click', () => {
      this.hide();
    });

    this.overlay.querySelector('#deleteBtn')?.addEventListener('click', () => {
      this.handleDelete();
    });
  }
}

export const messageDetailModal = new MessageDetailModal();
