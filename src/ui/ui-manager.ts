import { formatCurrency } from '@/utils/format';

/**
 * UIManager - Manages HTML/CSS UI overlay on top of Phaser canvas.
 * Creates and manages DOM elements for menus, buttons, HUD, and modals.
 * All interactive UI is rendered via DOM, not Phaser Text objects.
 * Container uses pointer-events:none; individual elements use pointer-events:auto.
 */
export class UIManager {
  private container: HTMLElement;

  private static formatLocationLabel(location: string): string {
    const normalized = location.replace(/[_-]+/g, ' ').trim();
    if (!normalized) return '';

    return normalized
      .split(/\s+/g)
      .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
      .join(' ');
  }

  constructor() {
    const overlay = document.getElementById('ui-overlay');
    if (!overlay) {
      throw new Error('UI overlay container not found');
    }
    this.container = overlay;
  }

  /**
   * Clear all UI elements from the overlay.
   * Should be called when transitioning between UI states or scenes.
   */
  public clear(): void {
    this.container.innerHTML = '';
  }

  /**
   * Create a styled button element with hover effects.
   * @param text - Button label text
   * @param onClick - Click event handler
   * @param options - Optional configuration
   * @param options.variant - Button variant: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'special'
   * @param options.style - Optional CSS style overrides
   * @returns Configured button element
   */
  public createButton(
    text: string,
    onClick: () => void,
    options?: {
      variant?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'special';
      style?: Partial<CSSStyleDeclaration>;
    }
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = text;
    button.className = 'game-button';
    
    // Add variant class if specified
    if (options?.variant) {
      button.classList.add(`btn-${options.variant}`);
    }
    
    // Apply custom style overrides if provided
    if (options?.style) {
      Object.assign(button.style, options.style);
    }

    // Prevent Phaser's global input listeners from also receiving clicks that
    // are meant for DOM UI elements (can make modals feel like they "don't work").
    const stop = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
    };

    button.addEventListener('pointerdown', stop);
    button.addEventListener('pointerup', stop);
    button.addEventListener('click', (event) => {
      stop(event);
      onClick();
    });

    return button;
  }

  /**
   * Create a styled panel container.
   * Useful for grouping related UI elements.
   * @param style - Optional CSS style overrides
   * @returns Configured div element
   */
  public createPanel(style?: Partial<CSSStyleDeclaration>): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'game-panel';
    
    Object.assign(panel.style, {
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      border: '2px solid #666',
      borderRadius: '10px',
      padding: '20px',
      color: '#fff',
      ...style,
    });

    return panel;
  }

  /**
   * Create a styled text paragraph element.
   * @param text - Text content
   * @param style - Optional CSS style overrides
   * @returns Configured paragraph element
   */
  public createText(
    text: string,
    style?: Partial<CSSStyleDeclaration>
  ): HTMLParagraphElement {
    const p = document.createElement('p');
    p.textContent = text;
    
    Object.assign(p.style, {
      margin: '10px 0',
      fontSize: '14px',
      color: '#fff',
      ...style,
    });

    return p;
  }

  /**
   * Create a styled heading element.
   * @param text - Heading text
   * @param level - Heading level (1, 2, or 3; default 2)
   * @param style - Optional CSS style overrides
   * @returns Configured heading element
   */
  public createHeading(
    text: string,
    level: 1 | 2 | 3 = 2,
    style?: Partial<CSSStyleDeclaration>
  ): HTMLHeadingElement {
    const heading = document.createElement(`h${level}`) as HTMLHeadingElement;
    heading.textContent = text;
    
    Object.assign(heading.style, {
      margin: '10px 0',
      color: '#fff',
      ...style,
    });

    return heading;
  }

  /**
   * Create a styled button container with flex layout.
   * Standard container for vertically stacked buttons.
   * @param style - Optional CSS style overrides
   * @returns Configured div element for buttons
   */
  public createButtonContainer(style?: Partial<CSSStyleDeclaration>): HTMLDivElement {
    const container = document.createElement('div');
    Object.assign(container.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      ...style,
    });
    return container;
  }

  /**
   * Append element to the UI overlay container.
   * @param element - Element to add to the overlay
   */
  public append(element: HTMLElement): void {
    this.container.appendChild(element);
  }

  /**
   * Remove element from the UI overlay container.
   * Only removes if element is currently a child of the container.
   * @param element - Element to remove from the overlay
   */
  public remove(element: HTMLElement): void {
    if (this.container.contains(element)) {
      this.container.removeChild(element);
    }
  }

  /**
   * Show a skill level-up modal with standardized formatting.
   * @param skill - The skill that leveled up ('eye' | 'tongue' | 'network')
   * @param level - The new skill level
   * @param description - Optional description of new abilities unlocked
   */
  public showSkillLevelUpModal(
    skill: 'eye' | 'tongue' | 'network',
    level: number,
    description?: string
  ): void {
    const skillNames = { eye: 'Eye', tongue: 'Tongue', network: 'Network' };
    const skillName = skillNames[skill];
    const defaultDescriptions = {
      eye: 'You can now spot more details when inspecting cars.',
      tongue: 'You can now haggle more effectively.',
      network: 'Your network has expanded, revealing new opportunities.',
    };
    const message = description || defaultDescriptions[skill];
    
    this.showModal(
      `${skillName} Skill Level Up!`,
      `Your ${skillName} skill improved to level ${level}!\n\n${message}`,
      [{ text: 'Excellent!', onClick: () => {} }]
    );
  }

  /**
   * Show a garage full modal with standardized formatting.
   */
  public showGarageFullModal(): void {
    this.showModal(
      'Garage Full',
      'Garage Full - Sell or Scrap current car first.',
      [{ text: 'OK', onClick: () => {} }]
    );
  }

  /**
   * Show an insufficient funds modal with standardized formatting.
   */
  public showInsufficientFundsModal(): void {
    this.showModal(
      'Not Enough Money',
      "You don't have enough money for this purchase.",
      [{ text: 'OK', onClick: () => {} }]
    );
  }



  /**
   * Show a time block warning modal (when action would exceed available time).
   * @param title - Warning title
   * @param message - Warning message
   */
  public showTimeBlockModal(title: string, message: string): void {
    this.showModal(title, message, [{ text: 'OK', onClick: () => {} }]);
  }

  /**
   * Show a modal dialog with title, message, and action buttons.
   * Modal auto-closes when any button is clicked.
   * @param title - Modal title text
   * @param message - Modal body text
   * @param buttons - Array of button configurations with text and onClick handlers
   * @returns The modal element (automatically appended to overlay)
   */
  public showModal(
    title: string,
    message: string,
    buttons: { text: string; onClick: () => void }[]
  ): HTMLDivElement {
    const stop = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
    };

    // Full-screen backdrop that captures pointer events everywhere.
    // Without this, areas outside the modal allow events through to the Phaser canvas.
    const backdrop = document.createElement('div');
    backdrop.className = 'game-modal-backdrop';
    Object.assign(backdrop.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      zIndex: '999',
      backgroundColor: 'transparent',
      pointerEvents: 'auto',
    });

    // Block all interactions from reaching Phaser while a modal is open.
    ['pointerdown', 'pointerup', 'pointermove', 'click', 'mousedown', 'mouseup', 'mousemove', 'wheel', 'touchstart', 'touchend', 'touchmove'].forEach(
      (eventName) => {
        backdrop.addEventListener(eventName, stop, { capture: true });
      }
    );

    const modal = document.createElement('div');
    modal.className = 'game-modal';
    
    Object.assign(modal.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      backgroundColor: 'rgba(0, 0, 0, 0.95)',
      border: '3px solid #fff',
      borderRadius: '10px',
      padding: '30px',
      minWidth: '400px',
      maxWidth: '600px',
      zIndex: '1000',
      pointerEvents: 'auto',
    });

    const heading = this.createHeading(title, 2, {
      textAlign: 'center',
      marginBottom: '20px',
    });

    const text = this.createText(message, {
      textAlign: 'center',
      marginBottom: '20px',
      fontSize: '16px',
    });

    const buttonContainer = document.createElement('div');
    Object.assign(buttonContainer.style, {
      display: 'flex',
      justifyContent: 'center',
      gap: '10px',
    });

    buttons.forEach((btn) => {
      const button = this.createButton(btn.text, () => {
        btn.onClick();
        this.remove(modal);
        this.remove(backdrop);
      });
      buttonContainer.appendChild(button);
    });

    modal.appendChild(heading);
    modal.appendChild(text);
    modal.appendChild(buttonContainer);

    this.append(backdrop);
    this.append(modal);
    return modal;
  }

  /**
   * Create HUD (Heads-Up Display) showing player stats.
   * Displays money, prestige (optional), day, and time.
   * @param data - HUD data object with money, prestige, day, and time
   * @returns Configured HUD element
   */
  public createHUD(data: {
    money: number;
    prestige?: number;
    day: number;
    time: string;
    location?: string;
    skills?: {
      eye: number;
      tongue: number;
      network: number;
    };
    garage?: {
      used: number;
      total: number;
    };
    market?: string;
  }): HTMLDivElement {
    const hud = document.createElement('div');
    hud.id = 'game-hud';
    
    Object.assign(hud.style, {
      position: 'absolute',
      top: '20px',
      left: '20px',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      border: '2px solid #666',
      borderRadius: '8px',
      padding: '15px',
      color: '#fff',
      fontSize: '16px',
      fontFamily: 'monospace',
    });

    hud.innerHTML = `
      <div data-hud="money">💰 Money: ${formatCurrency(data.money)}</div>
      ${data.prestige !== undefined ? `<div data-hud="prestige">🏆 Prestige: ${data.prestige}</div>` : ''}
      ${data.garage !== undefined ? `<div data-hud="garage">🏠 Garage: ${data.garage.used}/${data.garage.total}</div>` : ''}
      ${data.skills !== undefined ? `<div data-hud="skills">🧠 Skills: Eye ${data.skills.eye} | Tongue ${data.skills.tongue} | Network ${data.skills.network}</div>` : ''}
      <div data-hud="day">📅 Day: ${data.day}</div>
      <div data-hud="time">🕐 Time: ${data.time}</div>
      ${data.location !== undefined ? `<div data-hud="location">📍 Location: ${UIManager.formatLocationLabel(data.location)}</div>` : ''}
      ${data.market !== undefined ? `<div data-hud="market">📈 ${data.market}</div>` : ''}
    `;

    return hud;
  }

  /**
   * Update existing HUD values without recreating the element.
   * Only updates fields that are provided in the data object.
   * @param data - Partial HUD data to update
   */
  public updateHUD(data: {
    money?: number;
    prestige?: number;
    skills?: {
      eye: number;
      tongue: number;
      network: number;
    };
    day?: number;
    time?: string;
    location?: string;
    garage?: {
      used: number;
      total: number;
    };
    market?: string;
  }): void {
    const hud = document.getElementById('game-hud');
    if (!hud) return;

    const moneyEl = hud.querySelector<HTMLDivElement>('[data-hud="money"]');
    const prestigeEl = hud.querySelector<HTMLDivElement>('[data-hud="prestige"]');
    const garageEl = hud.querySelector<HTMLDivElement>('[data-hud="garage"]');
    const skillsEl = hud.querySelector<HTMLDivElement>('[data-hud="skills"]');
    const dayEl = hud.querySelector<HTMLDivElement>('[data-hud="day"]');
    const timeEl = hud.querySelector<HTMLDivElement>('[data-hud="time"]');
    const locationEl = hud.querySelector<HTMLDivElement>('[data-hud="location"]');
    const marketEl = hud.querySelector<HTMLDivElement>('[data-hud="market"]');

    if (data.money !== undefined && moneyEl) {
      moneyEl.textContent = `💰 Money: ${formatCurrency(data.money)}`;
    }
    if (data.prestige !== undefined && prestigeEl) {
      prestigeEl.textContent = `🏆 Prestige: ${data.prestige}`;
    }
    if (data.garage !== undefined && garageEl) {
      garageEl.textContent = `🏠 Garage: ${data.garage.used}/${data.garage.total}`;
    }
    if (data.skills !== undefined && skillsEl) {
      skillsEl.textContent = `🧠 Skills: Eye ${data.skills.eye} | Tongue ${data.skills.tongue} | Network ${data.skills.network}`;
    }
    if (data.day !== undefined && dayEl) {
      dayEl.textContent = `📅 Day: ${data.day}`;
    }
    if (data.time !== undefined && timeEl) {
      timeEl.textContent = `🕐 Time: ${data.time}`;
    }
    if (data.location !== undefined && locationEl) {
      locationEl.textContent = `📍 Location: ${UIManager.formatLocationLabel(data.location)}`;
    }
    if (data.market !== undefined && marketEl) {
      marketEl.textContent = `📈 ${data.market}`;
    }
  }

  /**
   * Show a confirmation modal with confirm/cancel buttons.
   * Reusable pattern for all yes/no decisions.
   * @param title - Modal title
   * @param message - Confirmation message
   * @param onConfirm - Callback when user confirms
   * @param onCancel - Optional callback when user cancels (defaults to no-op)
   * @param options - Optional configuration
   * @param options.confirmText - Text for confirm button (default: "Confirm")
   * @param options.confirmVariant - Button variant for confirm (default: "warning")
   * @param options.cancelText - Text for cancel button (default: "Cancel")
   */
  public confirmAction(
    title: string,
    message: string,
    onConfirm: () => void,
    onCancel?: () => void,
    options?: {
      confirmText?: string;
      confirmVariant?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'special';
      cancelText?: string;
    }
  ): void {
    this.showModal(title, message, [
      {
        text: options?.confirmText || 'Confirm',
        onClick: onConfirm,
        variant: options?.confirmVariant || 'warning',
      } as any,
      {
        text: options?.cancelText || 'Cancel',
        onClick: onCancel || (() => {}),
      },
    ]);
  }
}
