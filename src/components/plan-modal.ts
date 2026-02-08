import { supabase } from '../config/supabase';
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

  private async render(): Promise<void> {
    this.overlay?.remove();

    // Ensure profile is loaded (may be pending after OAuth redirect)
    if (!authService.getProfile()) {
      await authService.refreshProfile();
    }

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
        <button class="btn btn-outline" id="deleteExistingBtn" style="margin-bottom: 10px;">
          Delete Existing Message
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
    document.getElementById('confirmSendBtn')?.addEventListener('click', (e) => {
      this.sendMessage(e.currentTarget as HTMLButtonElement);
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
    document.getElementById('sendFreeBtn')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
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
      this.sendMessage(btn);
    });

    // Delete existing message button
    document.getElementById('deleteExistingBtn')?.addEventListener('click', () => {
      this.handleDeleteExistingMessage();
    });

    // Cancel button
    document.getElementById('cancelBtn')?.addEventListener('click', () => {
      this.hide();
    });
  }

  private async handleDeleteExistingMessage(): Promise<void> {
    if (!confirm('This will permanently delete your existing pending message. Continue?')) {
      return;
    }

    const user = authService.getUser();
    if (!user) return;

    const { data: messages, error: fetchError } = await supabase
      .from('messages')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .limit(1);

    if (fetchError || !messages || messages.length === 0) {
      toast.error('Could not find your existing message.');
      return;
    }

    const result = await messageService.cancelMessage(messages[0].id);
    if (result.success) {
      toast.success('Message deleted. You can now send a new one.');
      // Refresh dashboard to reflect deletion
      import('./messages-dashboard').then(({ messagesDashboard }) => {
        messagesDashboard.refresh();
      });
      // Re-render modal — free_message_used is now reset, so it will show plan selection
      this.render();
    } else {
      toast.error(result.error || 'Failed to delete message.');
    }
  }

  private async sendMessage(triggerBtn?: HTMLButtonElement): Promise<void> {
    if (!this.data) return;

    // Use the button that triggered the send, or fall back to confirm button
    const btn = triggerBtn || document.getElementById('confirmSendBtn') as HTMLButtonElement | null;
    const originalText = btn?.textContent || '';
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
        btn.textContent = originalText;
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
