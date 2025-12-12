/**
 * UIManager - Manages HTML/CSS UI overlay
 */
export class UIManager {
  private container: HTMLElement;

  constructor() {
    const overlay = document.getElementById('ui-overlay');
    if (!overlay) {
      throw new Error('UI overlay container not found');
    }
    this.container = overlay;
  }

  /**
   * Clear all UI elements
   */
  public clear(): void {
    this.container.innerHTML = '';
  }

  /**
   * Create a button element
   */
  public createButton(
    text: string,
    onClick: () => void,
    style?: Partial<CSSStyleDeclaration>
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = text;
    button.className = 'game-button';
    
    // Apply default styles
    Object.assign(button.style, {
      padding: '10px 20px',
      fontSize: '16px',
      fontWeight: 'bold',
      border: '2px solid #fff',
      backgroundColor: '#333',
      color: '#fff',
      cursor: 'pointer',
      borderRadius: '5px',
      transition: 'all 0.2s',
      ...style,
    });

    button.onmouseenter = () => {
      button.style.backgroundColor = '#555';
      button.style.transform = 'scale(1.05)';
    };

    button.onmouseleave = () => {
      button.style.backgroundColor = '#333';
      button.style.transform = 'scale(1)';
    };

    button.onclick = onClick;

    return button;
  }

  /**
   * Create a panel element
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
   * Create a text element
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
   * Create a heading element
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
   * Append element to UI overlay
   */
  public append(element: HTMLElement): void {
    this.container.appendChild(element);
  }

  /**
   * Remove element from UI overlay
   */
  public remove(element: HTMLElement): void {
    if (this.container.contains(element)) {
      this.container.removeChild(element);
    }
  }

  /**
   * Show a modal dialog
   */
  public showModal(
    title: string,
    message: string,
    buttons: { text: string; onClick: () => void }[]
  ): HTMLDivElement {
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
      });
      buttonContainer.appendChild(button);
    });

    modal.appendChild(heading);
    modal.appendChild(text);
    modal.appendChild(buttonContainer);

    this.append(modal);
    return modal;
  }

  /**
   * Create HUD (Heads-Up Display)
   */
  public createHUD(data: {
    money: number;
    prestige?: number;
    day: number;
    time: string;
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
      <div data-hud="money">💰 Money: $${data.money.toLocaleString()}</div>
      ${data.prestige !== undefined ? `<div data-hud="prestige">Prestige: ${data.prestige}</div>` : ''}
      <div data-hud="day">📅 Day: ${data.day}</div>
      <div data-hud="time">🕐 Time: ${data.time}</div>
    `;

    return hud;
  }

  /**
   * Update HUD values
   */
  public updateHUD(data: {
    money?: number;
    prestige?: number;
    day?: number;
    time?: string;
  }): void {
    const hud = document.getElementById('game-hud');
    if (!hud) return;

    const moneyEl = hud.querySelector<HTMLDivElement>('[data-hud="money"]');
    const prestigeEl = hud.querySelector<HTMLDivElement>('[data-hud="prestige"]');
    const dayEl = hud.querySelector<HTMLDivElement>('[data-hud="day"]');
    const timeEl = hud.querySelector<HTMLDivElement>('[data-hud="time"]');

    if (data.money !== undefined && moneyEl) {
      moneyEl.textContent = `💰 Money: $${data.money.toLocaleString()}`;
    }
    if (data.prestige !== undefined && prestigeEl) {
      prestigeEl.textContent = `Prestige: ${data.prestige}`;
    }
    if (data.day !== undefined && dayEl) {
      dayEl.textContent = `📅 Day: ${data.day}`;
    }
    if (data.time !== undefined && timeEl) {
      timeEl.textContent = `🕐 Time: ${data.time}`;
    }
  }
}
