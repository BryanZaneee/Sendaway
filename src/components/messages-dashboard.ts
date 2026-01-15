import { supabase } from '../config/supabase';
import { authService } from '../services/auth.service';
import { toast } from './toast';
import { isMessageUnlocked } from '../utils/message-status';
import type { Message } from '../types/database';

const PAGE_SIZE = 10;

class MessagesDashboard {
  private container: HTMLElement | null = null;
  private messages: Message[] = [];
  private offset: number = 0;
  private hasMore: boolean = true;
  private isLoading: boolean = false;

  /**
   * Attaches auth state listener to show/hide dashboard based on login status
   */
  init(): void {
    this.container = document.getElementById('messagesDashboard');

    authService.onAuthStateChange((state) => {
      if (state.user) {
        this.show();
      } else {
        this.hide();
      }
    });
  }

  /**
   * Displays dashboard, hides landing sections, fetches and renders messages
   */
  async show(): Promise<void> {
    this.messages = [];
    this.offset = 0;
    this.hasMore = true;

    document.getElementById('howItWorks')?.classList.add('hidden');
    document.getElementById('pricingSection')?.classList.add('hidden');
    document.getElementById('faqSection')?.classList.add('hidden');

    if (this.container) {
      this.container.classList.remove('hidden');
    }

    await this.fetchMessages();
    this.render();
  }

  /**
   * Hides dashboard, shows landing sections, clears container HTML
   */
  hide(): void {
    document.getElementById('howItWorks')?.classList.remove('hidden');
    document.getElementById('pricingSection')?.classList.remove('hidden');
    document.getElementById('faqSection')?.classList.remove('hidden');

    if (this.container) {
      this.container.classList.add('hidden');
      this.container.innerHTML = '';
    }
  }

  /**
   * Queries messages table with pagination, updates local state and hasMore flag
   */
  private async fetchMessages(): Promise<void> {
    const user = authService.getUser();
    if (!user) return;

    this.isLoading = true;

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', user.id)
      .order('scheduled_date', { ascending: true })
      .range(this.offset, this.offset + PAGE_SIZE - 1);

    if (error) {
      console.error('Error fetching messages:', error);
      toast.error('Failed to load messages. Please refresh the page.');
      this.isLoading = false;
      return;
    }

    if (data) {
      this.messages = [...this.messages, ...data];
      this.hasMore = data.length === PAGE_SIZE;
    }

    this.isLoading = false;
  }

  /**
   * Increments offset, fetches next page, re-renders dashboard
   */
  async loadMore(): Promise<void> {
    if (this.isLoading || !this.hasMore) return;

    this.offset += PAGE_SIZE;
    await this.fetchMessages();
    this.render();
  }

  /**
   * Generates dashboard HTML, wires up event handlers for load more and card clicks
   */
  private render(): void {
    if (!this.container) return;

    const html = `
      <div class="container" style="padding: 40px 20px;">
        <h2 style="text-align: center; margin-bottom: 30px;">Your Messages</h2>
        <div class="messages-grid" style="display: grid; gap: 20px; max-width: 800px; margin: 0 auto;">
          ${this.messages.length === 0
            ? '<p style="text-align: center; color: #555;">No messages yet. Create your first message above!</p>'
            : this.messages.map((msg) => this.createMessageCard(msg)).join('')
          }
        </div>
        ${this.hasMore ? `
          <div style="text-align: center; margin-top: 30px;">
            <button id="loadMoreBtn" class="btn btn-secondary" style="width: auto;">
              ${this.isLoading ? 'Loading...' : 'Load More'}
            </button>
          </div>
        ` : ''}
      </div>
    `;

    this.container.innerHTML = html;

    document.getElementById('loadMoreBtn')?.addEventListener('click', () => {
      this.loadMore();
    });

    this.container.querySelectorAll('.message-card').forEach((card) => {
      card.addEventListener('click', () => {
        const messageId = card.getAttribute('data-message-id');
        const message = this.messages.find((m) => m.id === messageId);
        if (message) {
          import('./message-detail').then(({ messageDetailModal }) => {
            messageDetailModal.show(message);
          });
        }
      });
    });
  }

  /**
   * Generates HTML for single message card with status icon, preview text, and metadata
   */
  private createMessageCard(message: Message): string {
    const isDelivered = message.status === 'delivered';
    const isUnlocked = isMessageUnlocked(message);
    const scheduledDate = new Date(message.scheduled_date);

    const preview = message.message_text.substring(0, 100) + (message.message_text.length > 100 ? '...' : '');
    const dateStr = scheduledDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const statusIcon = isUnlocked
      ? '<span style="color: #22c55e;">&#10003;</span>'
      : '<span style="color: #666;">&#128274;</span>';

    const statusText = isDelivered
      ? `Delivered ${message.delivered_at ? new Date(message.delivered_at).toLocaleDateString() : ''}`
      : isUnlocked
        ? 'Ready to view'
        : `Unlocks ${dateStr}`;

    return `
      <div class="message-card neo-box" data-message-id="${message.id}" style="padding: 20px; cursor: pointer;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
          <div style="font-size: 1.5rem;">${statusIcon}</div>
          <span style="font-size: 0.8rem; color: #555; background: ${isUnlocked ? 'var(--pastel-green)' : 'var(--pastel-yellow)'}; padding: 3px 8px; border: 1px solid black; border-radius: 4px;">
            ${statusText}
          </span>
        </div>
        <p style="margin: 0; color: ${isUnlocked ? '#000' : '#666'}; ${isUnlocked ? '' : 'filter: blur(2px);'}">
          ${preview}
        </p>
        ${message.video_storage_path ? '<span style="font-size: 0.8rem; color: #555; margin-top: 10px; display: inline-block;">&#127909; Video attached</span>' : ''}
      </div>
    `;
  }

  /**
   * Resets state and refetches messages from offset 0
   */
  async refresh(): Promise<void> {
    this.messages = [];
    this.offset = 0;
    this.hasMore = true;
    await this.fetchMessages();
    this.render();
  }
}

export const messagesDashboard = new MessagesDashboard();
