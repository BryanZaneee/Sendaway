import { authService } from '../services/auth.service';
import { messageService, CreateMessageData } from '../services/message.service';
import { paymentService } from '../services/payment.service';
import { toast } from './toast';

interface PlanModalData {
  messageData: CreateMessageData;
  hasVideo: boolean;
  onSuccess: () => void;
}

class PlanModal {
  private overlay: HTMLElement | null = null;
  private data: PlanModalData | null = null;

  /**
   * Show the plan selection modal
   */
  show(data: PlanModalData): void {
    this.data = data;
    this.render();
  }

  /**
   * Hide the modal
   */
  hide(): void {
    if (this.overlay) {
      this.overlay.classList.remove('active');
      setTimeout(() => {
        this.overlay?.remove();
        this.overlay = null;
      }, 200);
    }
  }

  private render(): void {
    this.overlay?.remove();

    const profile = authService.getProfile();
    const isPro = profile?.tier === 'pro';
    const hasFreeUsed = profile?.free_message_used ?? false;

    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay active';
    this.overlay.id = 'planModal';

    // If user is pro, just confirm and send
    if (isPro) {
      this.overlay.innerHTML = this.getProConfirmHTML();
    } else if (hasFreeUsed) {
      // Free message already used - must upgrade
      this.overlay.innerHTML = this.getMustUpgradeHTML();
    } else {
      // Show plan selection
      this.overlay.innerHTML = this.getPlanSelectionHTML();
    }

    document.body.appendChild(this.overlay);

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.hide();
    });

    this.setupHandlers();
  }

  private getProConfirmHTML(): string {
    return `
      <div class="modal">
        <h2>Confirm Message</h2>
        <p style="margin-bottom: 25px;">
          Your message will be delivered on <strong>${this.formatDate(this.data!.messageData.scheduledDate)}</strong>.
        </p>

        ${this.data?.hasVideo ? `
          <p style="background: var(--pastel-blue); border: 2px solid black; padding: 10px; margin-bottom: 20px;">
            Video attachment included
          </p>
        ` : ''}

        <button class="btn" id="confirmSendBtn" style="margin-bottom: 10px;">
          Schedule Message
        </button>
        <button class="btn btn-outline" id="cancelBtn">
          Cancel
        </button>
      </div>
    `;
  }

  private getMustUpgradeHTML(): string {
    return `
      <div class="modal">
        <h2>Upgrade Required</h2>
        <p style="margin-bottom: 25px;">
          You've already used your free message. Upgrade to Pro for unlimited messages${this.data?.hasVideo ? ' and video support' : ''}.
        </p>

        <button class="btn" id="goProBtn" style="margin-bottom: 10px; background: var(--pastel-pink);">
          Go Pro - $9 One-Time
        </button>
        <button class="btn btn-outline" id="cancelBtn">
          Cancel
        </button>
      </div>
    `;
  }

  private getPlanSelectionHTML(): string {
    const hasVideo = this.data?.hasVideo ?? false;

    return `
      <div class="modal">
        <h2>Almost There!</h2>
        <p style="margin-bottom: 25px;">Choose a plan to send your message.</p>

        <button class="btn" id="goProBtn" style="margin-bottom: 15px; background: var(--pastel-pink);">
          Go Pro ($9) - Video + Unlimited Messages
        </button>

        ${hasVideo ? `
          <p style="font-size: 0.85rem; color: #666; margin-bottom: 15px;">
            Note: Video will not be included with the free plan.
          </p>
        ` : ''}

        <button class="btn btn-outline" id="sendFreeBtn">
          Send Free (Text Only, 1 Message)
        </button>
      </div>
    `;
  }

  private setupHandlers(): void {
    // Confirm send (Pro users)
    document.getElementById('confirmSendBtn')?.addEventListener('click', () => {
      this.sendMessage();
    });

    // Go Pro button
    document.getElementById('goProBtn')?.addEventListener('click', async () => {
      try {
        await paymentService.redirectToCheckout('pro_upgrade');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to start checkout');
      }
    });

    // Send Free button
    document.getElementById('sendFreeBtn')?.addEventListener('click', () => {
      if (this.data?.hasVideo) {
        // Confirm they want to proceed without video
        if (!confirm('Your video will not be included with the free plan. Continue with text only?')) {
          return;
        }
        // Remove video from message data
        this.data.messageData.videoStoragePath = undefined;
        this.data.messageData.videoSizeBytes = undefined;
        this.data.messageData.videoDurationSeconds = undefined;
      }
      this.sendMessage();
    });

    // Cancel button
    document.getElementById('cancelBtn')?.addEventListener('click', () => {
      this.hide();
    });
  }

  private async sendMessage(): Promise<void> {
    if (!this.data) return;

    const btn = document.querySelector('#planModal .btn:first-of-type') as HTMLButtonElement;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Sending...';
    }

    const result = await messageService.createMessage(this.data.messageData);

    if (result.success) {
      toast.success('Your FtrMsg message has been scheduled!');
      this.hide();
      this.data.onSuccess();
    } else {
      toast.error(result.error || 'Failed to send message');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Try Again';
      }
    }
  }

  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}

export const planModal = new PlanModal();
