import { messageService } from '../services/message.service';
import { videoService } from '../services/video.service';
import { toast } from './toast';
import { calculateCountdown, formatDate } from '../utils/countdown';
import { isMessageUnlocked } from '../utils/message-status';
import type { Message } from '../types/database';

class MessageDetailModal {
  private overlay: HTMLElement | null = null;
  private message: Message | null = null;
  private intervalId: number | null = null;
  // Persists across hide/show calls; cleared only on app reload
  private signedUrl: string | null = null;
  private urlExpiresAt: Date | null = null;

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

    const daysEl = this.overlay.querySelector('#countdown-days');
    const hoursEl = this.overlay.querySelector('#countdown-hours');
    const minutesEl = this.overlay.querySelector('#countdown-minutes');
    const secondsEl = this.overlay.querySelector('#countdown-seconds');

    if (daysEl) daysEl.textContent = countdown.days.toString();
    if (hoursEl) hoursEl.textContent = countdown.hours.toString();
    if (minutesEl) minutesEl.textContent = countdown.minutes.toString();
    if (secondsEl) secondsEl.textContent = countdown.seconds.toString();
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
        ${this.getSharedStyles()}
        .detail-header {
          background: #FDE68A;
        }
        .lock-icon {
          width: 50px;
          height: 50px;
          background: white;
          border: 2px solid black;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
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
      </style>

      <button class="back-btn" id="backBtn">
        <span>&larr;</span> Dashboard
      </button>

      <div class="detail-card">
        <div class="detail-header">
          <div class="lock-icon">&#128274;</div>
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
              <span>&#128465;</span> Delete message
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
   * Generates unlocked message HTML with text, video player (if video exists), and download button
   */
  private async renderUnlocked(): Promise<void> {
    if (!this.message) return;

    const deliveredDate = this.message.delivered_at
      ? formatDate(new Date(this.message.delivered_at))
      : formatDate(new Date(this.message.scheduled_date));

    let videoError = false;
    if (this.message.video_storage_path) {
      if (this.isUrlExpired()) {
        try {
          const url = await videoService.getSignedUrl(
            this.message.video_storage_path,
            604800 // 7 days in seconds
          );
          if (url) {
            this.signedUrl = url;
            this.urlExpiresAt = new Date(Date.now() + 604800 * 1000);
          } else {
            videoError = true;
          }
        } catch (error) {
          console.error('Failed to get signed URL:', error);
          videoError = true;
        }
      }
    }

    this.overlay = this.createOverlayBase('#BBF7D0');
    this.overlay.innerHTML = `
      <style>
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
        ${this.getSharedStyles()}
        .detail-header {
          background: var(--pastel-green);
        }
        .unlock-icon {
          width: 50px;
          height: 50px;
          background: white;
          border: 2px solid black;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
        }
        .message-content {
          padding: 25px;
          max-height: 300px;
          overflow-y: auto;
          white-space: pre-wrap;
          line-height: 1.6;
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
        .delivered-badge {
          padding: 15px 25px;
          background: #F5F5F5;
          border-top: 2px solid #eee;
          font-size: 0.9rem;
          color: #555;
        }
      </style>

      <button class="back-btn" id="backBtn">
        <span>&larr;</span> Dashboard
      </button>

      <div class="detail-card">
        <div class="detail-header">
          <div class="unlock-icon">&#10003;</div>
          <div>
            <h2 style="margin: 0; font-size: 1.5rem;">Message Unlocked</h2>
            <p style="margin: 5px 0 0 0; color: #555;">Your message from the past has arrived.</p>
          </div>
        </div>

        <div class="message-content">${this.message.message_text}</div>

        ${this.message.video_storage_path ? `
          <div class="video-section">
            ${videoError ? `
              <div class="video-error">
                <p style="margin: 0;">&#9888; Video unavailable</p>
                <p style="margin: 10px 0 0 0; font-size: 0.85rem;">The video file could not be loaded.</p>
              </div>
            ` : `
              <video class="video-player" controls>
                <source src="${this.signedUrl}" type="video/mp4">
                Your browser does not support the video tag.
              </video>
              <a href="${this.signedUrl}" download class="download-btn">
                <span>&#8595;</span> Download Video
              </a>
            `}
          </div>
        ` : ''}

        <div class="delivered-badge">
          Delivered on ${deliveredDate}
        </div>
      </div>
    `;

    this.overlay.querySelector('#backBtn')?.addEventListener('click', () => {
      this.hide();
    });
  }
}

export const messageDetailModal = new MessageDetailModal();
