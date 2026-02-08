import { supabase } from '../config/supabase';
import { authService } from '../services/auth.service';
import { toast } from './toast';
import { isMessageUnlocked } from '../utils/message-status';
import { formatDate } from '../utils/countdown';
import type { Message } from '../types/database';

const PAGE_SIZE = 10;

// --- SVG Icons (Feather-style, stroke-width 2, round caps/joins) ---

const ICON_MAIL = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg>`;

const ICON_LOCK_OPEN = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;

const ICON_LOCK_CLOSED = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

const ICON_CHECK_CIRCLE = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

const ICON_CLOCK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

const ICON_CALENDAR = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

const ICON_VIDEO = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;

export type MessageGroup = 'unlocked' | 'locked' | 'delivered';

export function getMessageGroup(message: Message): MessageGroup {
  if (message.status === 'delivered') return 'delivered';
  if (isMessageUnlocked(message)) return 'unlocked';
  return 'locked';
}

const GROUP_ORDER: MessageGroup[] = ['unlocked', 'locked', 'delivered'];
const GROUP_LABELS: Record<MessageGroup, string> = {
  unlocked: 'UNLOCKED',
  locked: 'LOCKED',
  delivered: 'DELIVERED',
};

class MessagesDashboard {
  private container: HTMLElement | null = null;
  private messages: Message[] = [];
  private offset: number = 0;
  private hasMore: boolean = true;
  private isLoading: boolean = false;
  private showInProgress: boolean = false;

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
    if (this.showInProgress) return;
    this.showInProgress = true;
    try {
      this.messages = [];
      this.offset = 0;
      this.hasMore = true;

      document.getElementById('howItWorks')?.classList.add('hidden');
      document.getElementById('messageDemoSection')?.classList.add('hidden');
      document.getElementById('trustSection')?.classList.add('hidden');
      document.getElementById('pricingSection')?.classList.add('hidden');
      document.getElementById('faqSection')?.classList.add('hidden');
      document.getElementById('navLinks')?.classList.add('hidden');
      document.getElementById('socialProofBand')?.classList.add('hidden');
      document.getElementById('footerCtaCol')?.classList.add('hidden');

      if (this.container) {
        this.container.classList.remove('hidden');
      }

      await this.fetchMessages();
      this.render();
    } finally {
      this.showInProgress = false;
    }
  }

  /**
   * Hides dashboard, shows landing sections, clears container HTML
   */
  hide(): void {
    document.getElementById('howItWorks')?.classList.remove('hidden');
    document.getElementById('messageDemoSection')?.classList.remove('hidden');
    document.getElementById('trustSection')?.classList.remove('hidden');
    document.getElementById('pricingSection')?.classList.remove('hidden');
    document.getElementById('faqSection')?.classList.remove('hidden');
    document.getElementById('navLinks')?.classList.remove('hidden');
    document.getElementById('socialProofBand')?.classList.remove('hidden');
    document.getElementById('footerCtaCol')?.classList.remove('hidden');

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

    // Group messages
    const groups: Record<MessageGroup, Message[]> = { unlocked: [], locked: [], delivered: [] };
    for (const msg of this.messages) {
      groups[getMessageGroup(msg)].push(msg);
    }

    const unlockedCount = groups.unlocked.length;
    const isEmpty = this.messages.length === 0;

    // Build section HTML
    let cardIndex = 0;
    let sectionsHtml = '';
    for (const group of GROUP_ORDER) {
      const msgs = groups[group];
      if (msgs.length === 0) continue;

      sectionsHtml += `
        <div class="dash-section-header">${GROUP_LABELS[group]} (${msgs.length})</div>
        ${msgs.map((msg) => this.createMessageCard(msg, cardIndex++)).join('')}
      `;
    }

    const html = `
      <style>
        .dash-container {
          padding: 40px 20px;
          max-width: 860px;
          margin: 0 auto;
        }
        .dash-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 32px;
        }
        .dash-header-icon {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: var(--pastel-green);
          border: 3px solid black;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .dash-header-icon svg {
          width: 26px;
          height: 26px;
        }
        .dash-header-text h2 {
          margin: 0;
          font-size: 1.6rem;
        }
        .dash-header-text p {
          margin: 4px 0 0;
          color: #555;
          font-size: 0.9rem;
        }
        .dash-section-header {
          grid-column: 1 / -1;
          font-size: 0.8rem;
          font-weight: 800;
          letter-spacing: 2px;
          color: #555;
          padding: 8px 0 4px;
          border-bottom: 2px solid #ddd;
          margin-top: 8px;
        }
        .dash-grid {
          display: grid;
          gap: 20px;
          grid-template-columns: 1fr;
        }
        @media (min-width: 640px) {
          .dash-grid {
            grid-template-columns: 1fr 1fr;
          }
        }

        /* Card styles */
        .msg-card {
          border: 3px solid black;
          border-radius: 14px;
          padding: 24px 20px 20px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 12px;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
          box-shadow: 5px 5px 0px 0px black;
        }
        .msg-card:hover {
          transform: translate(-2px, -2px);
          box-shadow: 7px 7px 0px 0px black;
        }
        .msg-card.unlocked { background: var(--pastel-purple); }
        .msg-card.locked {
          background: var(--pastel-yellow);
          border-radius: 0 0 14px 14px;
          padding-top: 48px;
          overflow: visible;
          position: relative;
        }
        .msg-card.locked::before {
          content: '';
          position: absolute;
          top: -3px;
          left: -3px;
          right: -3px;
          height: 52px;
          background: #f0d76a;
          clip-path: polygon(0 0, 100% 0, 50% 100%);
          border: 3px solid black;
          border-bottom: none;
          z-index: 0;
        }
        .msg-card.delivered { background: var(--pastel-green); }

        .card-icon-circle {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .card-icon-circle svg {
          width: 30px;
          height: 30px;
        }
        .msg-card.unlocked .card-icon-circle { background: rgba(139, 92, 246, 0.15); color: #7c3aed; }
        .msg-card.locked .card-icon-circle {
          background: white;
          border: 3px solid black;
          color: #b45309;
          position: relative;
          z-index: 1;
          margin-top: -8px;
        }
        .msg-card.delivered .card-icon-circle { background: rgba(22, 163, 74, 0.15); color: #15803d; }

        .card-status {
          font-weight: 800;
          font-size: 1rem;
        }
        .card-meta {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 0.82rem;
          color: #444;
        }
        .card-meta-row {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          justify-content: center;
        }
        .card-meta-row svg {
          flex-shrink: 0;
        }
        .card-video-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 0.78rem;
          font-weight: 700;
          color: #555;
          background: rgba(0,0,0,0.06);
          border-radius: 20px;
          padding: 3px 10px;
        }

        /* Staggered entry animation */
        @keyframes cardFadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .msg-card {
          animation: cardFadeIn 0.35s ease both;
        }
        @media (prefers-reduced-motion: reduce) {
          .msg-card {
            animation: none;
          }
        }

        /* Empty state */
        .dash-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          padding: 60px 20px;
          text-align: center;
        }
        .dash-empty-icon {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: var(--pastel-blue);
          border: 3px solid black;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .dash-empty-icon svg {
          width: 32px;
          height: 32px;
          color: #333;
        }
        .dash-empty h3 {
          margin: 0;
          font-size: 1.3rem;
        }
        .dash-empty p {
          margin: 0;
          color: #555;
          max-width: 360px;
        }
      </style>

      <div class="dash-container">
        <div class="dash-header">
          <div class="dash-header-icon">${ICON_MAIL}</div>
          <div class="dash-header-text">
            <h2>Your messages</h2>
            <p>${unlockedCount > 0 ? `${unlockedCount} unlocked` : 'All messages locked or delivered'}</p>
          </div>
        </div>

        ${isEmpty ? `
          <div class="dash-empty">
            <div class="dash-empty-icon">${ICON_MAIL}</div>
            <h3>No messages yet</h3>
            <p>Write a message to your future self. It will be locked away until the date you choose.</p>
            <a href="#messageForm" class="btn btn-primary" style="width: auto; margin-top: 8px;">Write a Message</a>
          </div>
        ` : `
          <div class="dash-grid">
            ${sectionsHtml}
          </div>
          ${this.hasMore ? `
            <div style="text-align: center; margin-top: 30px;">
              <button id="loadMoreBtn" class="btn btn-secondary" style="width: auto;">
                ${this.isLoading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          ` : ''}
        `}
      </div>
    `;

    this.container.innerHTML = html;

    document.getElementById('loadMoreBtn')?.addEventListener('click', () => {
      this.loadMore();
    });

    this.container.querySelectorAll('.msg-card').forEach((card) => {
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
   * Generates HTML for a single message card with status icon, label, and metadata
   */
  private createMessageCard(message: Message, index: number): string {
    const group = getMessageGroup(message);
    const createdDate = formatDate(new Date(message.created_at));
    const scheduledDate = formatDate(new Date(message.scheduled_date));
    const delay = Math.min(index * 80, 500);

    let icon: string;
    let statusLabel: string;
    let dateLabel: string;
    let dateValue: string;

    switch (group) {
      case 'unlocked':
        icon = ICON_LOCK_OPEN;
        statusLabel = 'Unlocked';
        dateLabel = 'Unlocks';
        dateValue = scheduledDate;
        break;
      case 'locked':
        icon = ICON_LOCK_CLOSED;
        statusLabel = 'Locked';
        dateLabel = 'Unlocks';
        dateValue = scheduledDate;
        break;
      case 'delivered':
        icon = ICON_CHECK_CIRCLE;
        statusLabel = 'Delivered';
        dateLabel = 'Delivered';
        dateValue = message.delivered_at ? formatDate(new Date(message.delivered_at)) : scheduledDate;
        break;
    }

    return `
      <div class="msg-card ${group} neo-box" data-message-id="${message.id}" style="animation-delay: ${delay}ms;">
        <div class="card-icon-circle">${icon}</div>
        <div class="card-status">${statusLabel}</div>
        <div class="card-meta">
          <span class="card-meta-row">${ICON_CLOCK} Created ${createdDate}</span>
          <span class="card-meta-row">${ICON_CALENDAR} ${dateLabel} ${dateValue}</span>
        </div>
        ${message.video_storage_path ? `<span class="card-video-badge">${ICON_VIDEO} Video</span>` : ''}
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
