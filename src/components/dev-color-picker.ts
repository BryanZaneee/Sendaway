/**
 * Development Color Picker
 * A floating panel for experimenting with the site's pastel colors in real-time.
 * Only loaded in development mode.
 */

interface ColorConfig {
  name: string;
  variable: string;
  defaultValue: string;
}

const COLOR_CONFIGS: ColorConfig[] = [
  { name: 'Sky Blue', variable: '--pastel-blue', defaultValue: '#BAE6FD' },
  { name: 'Soft Pink', variable: '--pastel-pink', defaultValue: '#FECDD3' },
  { name: 'Mint Green', variable: '--pastel-green', defaultValue: '#BBF7D0' },
  { name: 'Lemon Yellow', variable: '--pastel-yellow', defaultValue: '#FDE68A' },
  { name: 'Background', variable: '--bg-color', defaultValue: '#FFFDF7' },
  { name: 'Card BG', variable: '--card-bg', defaultValue: '#FFFFFF' },
  { name: 'Hero BG', variable: '--hero-bg', defaultValue: '#F5C2C2' },
  { name: 'FAQ BG', variable: '--faq-bg', defaultValue: '#C2F5D4' },
];

const STORAGE_KEY = 'ftrmsg-dev-colors';

class DevColorPicker {
  private container: HTMLElement | null = null;
  private isCollapsed: boolean = false;
  private currentColors: Map<string, string> = new Map();

  init(): void {
    this.loadFromStorage();
    this.applyColors();
    this.createPanel();
    this.setupKeyboardShortcut();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, string>;
        for (const [variable, value] of Object.entries(parsed)) {
          this.currentColors.set(variable, value);
        }
      }
    } catch {
      // Ignore storage errors
    }

    // Fill in defaults for any missing colors
    for (const config of COLOR_CONFIGS) {
      if (!this.currentColors.has(config.variable)) {
        this.currentColors.set(config.variable, config.defaultValue);
      }
    }
  }

  private saveToStorage(): void {
    try {
      const obj: Record<string, string> = {};
      for (const [variable, value] of this.currentColors) {
        obj[variable] = value;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // Ignore storage errors
    }
  }

  private applyColors(): void {
    const root = document.documentElement;
    for (const [variable, value] of this.currentColors) {
      root.style.setProperty(variable, value);
    }
  }

  private createPanel(): void {
    // Create container
    this.container = document.createElement('div');
    this.container.id = 'dev-color-picker';
    this.container.innerHTML = this.getPanelHTML();
    this.applyStyles();
    document.body.appendChild(this.container);

    // Bind events
    this.bindEvents();
  }

  private getPanelHTML(): string {
    const colorInputs = COLOR_CONFIGS.map(config => {
      const currentValue = this.currentColors.get(config.variable) || config.defaultValue;
      return `
        <div class="dcp-color-row">
          <label class="dcp-label">${config.name}</label>
          <div class="dcp-input-group">
            <input
              type="color"
              class="dcp-color-input"
              data-variable="${config.variable}"
              value="${currentValue}"
            />
            <input
              type="text"
              class="dcp-hex-input"
              data-variable="${config.variable}"
              value="${currentValue}"
              maxlength="7"
            />
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="dcp-header">
        <span class="dcp-title">Color Picker</span>
        <button class="dcp-toggle" title="Toggle (Ctrl+Shift+C)">_</button>
      </div>
      <div class="dcp-body">
        ${colorInputs}
        <div class="dcp-actions">
          <button class="dcp-btn dcp-reset">Reset</button>
          <button class="dcp-btn dcp-copy">Copy CSS</button>
        </div>
      </div>
    `;
  }

  private applyStyles(): void {
    if (!this.container) return;

    this.container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 99999;
      font-family: 'Space Grotesk', sans-serif;
      width: 260px;
    `;

    // Add component styles
    const styleEl = document.createElement('style');
    styleEl.id = 'dev-color-picker-styles';
    styleEl.textContent = `
      #dev-color-picker {
        background: var(--pastel-yellow, #FDE68A);
        border: 3px solid black;
        border-radius: 8px;
        box-shadow: 6px 6px 0 black;
        overflow: hidden;
      }

      #dev-color-picker.collapsed .dcp-body {
        display: none;
      }

      #dev-color-picker.collapsed {
        width: auto;
      }

      .dcp-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 12px;
        border-bottom: 2px solid black;
        background: white;
        cursor: move;
      }

      .dcp-title {
        font-weight: 700;
        font-size: 0.85rem;
        text-transform: uppercase;
      }

      .dcp-toggle {
        background: var(--pastel-blue, #BAE6FD);
        border: 2px solid black;
        border-radius: 4px;
        width: 24px;
        height: 24px;
        cursor: pointer;
        font-weight: 700;
        font-size: 14px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .dcp-toggle:hover {
        background: var(--pastel-pink, #FECDD3);
      }

      .dcp-body {
        padding: 12px;
      }

      .dcp-color-row {
        margin-bottom: 10px;
      }

      .dcp-label {
        display: block;
        font-size: 0.75rem;
        font-weight: 600;
        margin-bottom: 4px;
        text-transform: uppercase;
      }

      .dcp-input-group {
        display: flex;
        gap: 8px;
      }

      .dcp-color-input {
        width: 40px;
        height: 32px;
        padding: 0;
        border: 2px solid black;
        border-radius: 4px;
        cursor: pointer;
        background: none;
      }

      .dcp-color-input::-webkit-color-swatch-wrapper {
        padding: 2px;
      }

      .dcp-color-input::-webkit-color-swatch {
        border: none;
        border-radius: 2px;
      }

      .dcp-hex-input {
        flex: 1;
        padding: 6px 8px;
        font-family: monospace;
        font-size: 0.85rem;
        border: 2px solid black;
        border-radius: 4px;
        text-transform: uppercase;
      }

      .dcp-hex-input:focus {
        outline: none;
        box-shadow: 2px 2px 0 var(--pastel-blue, #BAE6FD);
      }

      .dcp-actions {
        display: flex;
        gap: 8px;
        margin-top: 15px;
      }

      .dcp-btn {
        flex: 1;
        padding: 8px 12px;
        font-family: inherit;
        font-weight: 700;
        font-size: 0.75rem;
        text-transform: uppercase;
        border: 2px solid black;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s ease;
        box-shadow: 2px 2px 0 black;
      }

      .dcp-btn:hover {
        transform: translate(1px, 1px);
        box-shadow: 1px 1px 0 black;
      }

      .dcp-btn:active {
        transform: translate(2px, 2px);
        box-shadow: none;
      }

      .dcp-reset {
        background: var(--pastel-pink, #FECDD3);
      }

      .dcp-copy {
        background: var(--pastel-green, #BBF7D0);
      }
    `;
    document.head.appendChild(styleEl);
  }

  private bindEvents(): void {
    if (!this.container) return;

    // Toggle collapse
    const toggleBtn = this.container.querySelector('.dcp-toggle');
    toggleBtn?.addEventListener('click', () => this.toggle());

    // Color inputs
    const colorInputs = this.container.querySelectorAll('.dcp-color-input');
    colorInputs.forEach(input => {
      input.addEventListener('input', (e) => this.handleColorChange(e));
    });

    // Hex inputs
    const hexInputs = this.container.querySelectorAll('.dcp-hex-input');
    hexInputs.forEach(input => {
      input.addEventListener('input', (e) => this.handleHexChange(e));
      input.addEventListener('blur', (e) => this.validateHex(e));
    });

    // Reset button
    const resetBtn = this.container.querySelector('.dcp-reset');
    resetBtn?.addEventListener('click', () => this.resetToDefaults());

    // Copy button
    const copyBtn = this.container.querySelector('.dcp-copy');
    copyBtn?.addEventListener('click', () => this.copyCSS());

    // Make draggable
    this.makeDraggable();
  }

  private handleColorChange(e: Event): void {
    const input = e.target as HTMLInputElement;
    const variable = input.dataset.variable;
    if (!variable) return;

    const value = input.value.toUpperCase();
    this.updateColor(variable, value);

    // Sync hex input
    const hexInput = this.container?.querySelector(
      `.dcp-hex-input[data-variable="${variable}"]`
    ) as HTMLInputElement;
    if (hexInput) {
      hexInput.value = value;
    }
  }

  private handleHexChange(e: Event): void {
    const input = e.target as HTMLInputElement;
    const variable = input.dataset.variable;
    if (!variable) return;

    let value = input.value.toUpperCase();
    if (!value.startsWith('#')) {
      value = '#' + value;
    }

    // Only apply if valid hex
    if (/^#[0-9A-F]{6}$/i.test(value)) {
      this.updateColor(variable, value);

      // Sync color input
      const colorInput = this.container?.querySelector(
        `.dcp-color-input[data-variable="${variable}"]`
      ) as HTMLInputElement;
      if (colorInput) {
        colorInput.value = value;
      }
    }
  }

  private validateHex(e: Event): void {
    const input = e.target as HTMLInputElement;
    const variable = input.dataset.variable;
    if (!variable) return;

    let value = input.value.toUpperCase();
    if (!value.startsWith('#')) {
      value = '#' + value;
    }

    // Reset to current if invalid
    if (!/^#[0-9A-F]{6}$/i.test(value)) {
      input.value = this.currentColors.get(variable) || '#000000';
    } else {
      input.value = value;
    }
  }

  private updateColor(variable: string, value: string): void {
    this.currentColors.set(variable, value);
    document.documentElement.style.setProperty(variable, value);
    this.saveToStorage();
  }

  private resetToDefaults(): void {
    for (const config of COLOR_CONFIGS) {
      this.currentColors.set(config.variable, config.defaultValue);
      document.documentElement.style.setProperty(config.variable, config.defaultValue);

      // Update inputs
      const colorInput = this.container?.querySelector(
        `.dcp-color-input[data-variable="${config.variable}"]`
      ) as HTMLInputElement;
      const hexInput = this.container?.querySelector(
        `.dcp-hex-input[data-variable="${config.variable}"]`
      ) as HTMLInputElement;

      if (colorInput) colorInput.value = config.defaultValue;
      if (hexInput) hexInput.value = config.defaultValue;
    }

    this.saveToStorage();
  }

  private copyCSS(): void {
    const lines = COLOR_CONFIGS.map(config => {
      const value = this.currentColors.get(config.variable) || config.defaultValue;
      return `  ${config.variable}: ${value};`;
    });

    const css = `:root {\n${lines.join('\n')}\n}`;

    navigator.clipboard.writeText(css).then(() => {
      // Visual feedback
      const copyBtn = this.container?.querySelector('.dcp-copy') as HTMLButtonElement;
      if (copyBtn) {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = originalText;
        }, 1500);
      }
    }).catch(() => {
      // Fallback: show alert with CSS
      alert('CSS copied to clipboard:\n\n' + css);
    });
  }

  private toggle(): void {
    this.isCollapsed = !this.isCollapsed;
    this.container?.classList.toggle('collapsed', this.isCollapsed);

    const toggleBtn = this.container?.querySelector('.dcp-toggle');
    if (toggleBtn) {
      toggleBtn.textContent = this.isCollapsed ? '+' : '_';
    }
  }

  private setupKeyboardShortcut(): void {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+C
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  private makeDraggable(): void {
    const header = this.container?.querySelector('.dcp-header') as HTMLElement;
    if (!header || !this.container) return;

    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    header.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).classList.contains('dcp-toggle')) return;
      isDragging = true;
      offsetX = e.clientX - this.container!.getBoundingClientRect().left;
      offsetY = e.clientY - this.container!.getBoundingClientRect().top;
      header.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging || !this.container) return;

      const x = e.clientX - offsetX;
      const y = e.clientY - offsetY;

      // Keep within viewport
      const maxX = window.innerWidth - this.container.offsetWidth;
      const maxY = window.innerHeight - this.container.offsetHeight;

      this.container.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
      this.container.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
      this.container.style.right = 'auto';
      this.container.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      header.style.cursor = 'move';
    });
  }
}

export const devColorPicker = new DevColorPicker();
