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
        return 'var(--pastel-green, #BBF7D0)';
      case 'error':
        return 'var(--pastel-pink, #FECDD3)';
      case 'info':
        return 'var(--pastel-blue, #BAE6FD)';
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
      border: 3px solid black;
      border-radius: 8px;
      padding: 15px 20px;
      box-shadow: 4px 4px 0 black;
      font-family: 'Space Grotesk', sans-serif;
      font-weight: 600;
      animation: slideIn 0.3s ease;
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
      toastEl.style.animation = 'slideOut 0.3s ease';
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
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

export const toast = new ToastManager();
