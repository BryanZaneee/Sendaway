type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

class ToastManager {
  private container: HTMLElement | null = null;
  private toasts: Toast[] = [];

  private ensureContainer(): HTMLElement {
    if (this.container) return this.container;

    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 400px;
    `;
    document.body.appendChild(this.container);

    return this.container;
  }

  private getBackgroundColor(type: ToastType): string {
    switch (type) {
      case 'success':
        return 'linear-gradient(135deg, var(--pastel-green, #C2D4BC), rgba(194, 212, 188, 0.7))';
      case 'error':
        return 'linear-gradient(135deg, var(--pastel-pink, #E8C4C8), rgba(232, 196, 200, 0.7))';
      case 'info':
        return 'linear-gradient(135deg, var(--pastel-blue, #C4D7E0), rgba(196, 215, 224, 0.7))';
    }
  }

  show(message: string, type: ToastType = 'info', duration: number = 4000): void {
    const container = this.ensureContainer();
    const id = crypto.randomUUID();

    const toast: Toast = { id, message, type };
    this.toasts.push(toast);

    const toastEl = document.createElement('div');
    toastEl.id = `toast-${id}`;
    toastEl.style.cssText = `
      background: ${this.getBackgroundColor(type)};
      border: 1px solid rgba(90, 80, 100, 0.15);
      border-radius: 16px;
      padding: 15px 20px;
      box-shadow: 0 4px 20px rgba(90, 80, 100, 0.1);
      backdrop-filter: blur(12px);
      font-family: 'Lora', serif;
      font-weight: 600;
      color: #1A1721;
      animation: toastFadeIn 0.4s ease;
      cursor: pointer;
    `;
    toastEl.textContent = message;

    // Add click to dismiss
    toastEl.addEventListener('click', () => this.dismiss(id));

    container.appendChild(toastEl);

    // Auto dismiss
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }
  }

  dismiss(id: string): void {
    const toastEl = document.getElementById(`toast-${id}`);
    if (toastEl) {
      toastEl.style.animation = 'toastFadeOut 0.4s ease';
      setTimeout(() => {
        toastEl.remove();
        this.toasts = this.toasts.filter(t => t.id !== id);
      }, 300);
    }
  }

  success(message: string, duration?: number): void {
    this.show(message, 'success', duration);
  }

  error(message: string, duration?: number): void {
    this.show(message, 'error', duration);
  }

  info(message: string, duration?: number): void {
    this.show(message, 'info', duration);
  }
}

// Add keyframe animations
const style = document.createElement('style');
style.textContent = `
  @keyframes toastFadeIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
      filter: blur(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
      filter: blur(0);
    }
  }
  @keyframes toastFadeOut {
    from {
      opacity: 1;
      transform: translateY(0);
      filter: blur(0);
    }
    to {
      opacity: 0;
      transform: translateY(-10px);
      filter: blur(4px);
    }
  }
`;
document.head.appendChild(style);

export const toast = new ToastManager();
