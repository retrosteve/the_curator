import { formatCurrency } from '@/utils/format';
import { Car } from '@/data/car-database';
import { type SkillKey } from '@/config/game-config';
import { createMapDashboardContainer, createMapLocationCard } from '@/ui/internal/ui-map';
import { ModalManager } from '@/ui/internal/ui-modals';
import { ToastManager } from '@/ui/internal/ui-toasts';
import { TutorialUI } from '@/ui/internal/ui-tutorial';

/**
 * UIManager - Manages HTML/CSS UI overlay on top of Phaser canvas.
 * Creates and manages DOM elements for menus, buttons, HUD, and modals.
 * All interactive UI is rendered via DOM, not Phaser Text objects.
 * Container uses pointer-events:none; individual elements use pointer-events:auto.
 * Singleton pattern ensures consistent UI state across scenes.
 */
export class UIManager {
  private static instance: UIManager;
  private container: HTMLElement;
  private readonly toastManager: ToastManager;
  private readonly modalManager: ModalManager;
  private readonly tutorialUI: TutorialUI;

  /**
   * Append an element to the UI overlay root (#ui-overlay).
   * Use this instead of document.body to keep UI ownership consistent.
   */
  public appendToOverlay(element: HTMLElement): void {
    this.container.appendChild(element);
  }

  /**
   * Get the UI overlay root element.
   */
  public getOverlayRoot(): HTMLElement {
    return this.container;
  }

  public createMapLocationCard(options: {
    name: string;
    description: string;
    icon: string;
    color: number;
    apCost: number;
    isGarage: boolean;
    isLocked: boolean;
    lockReason?: string;
    isExhaustedToday: boolean;
    showRivalBadge: boolean;
    showSpecialBadge: boolean;
    onVisit: () => void;
  }): HTMLElement {
    return createMapLocationCard({
      ...options,
      onShowLockedModal: (title, message) => {
        this.showModal(title, message, [{ text: 'OK', onClick: () => {} }]);
      },
    });
  }

  public createMapDashboardContainer(): HTMLDivElement {
    return createMapDashboardContainer();
  }

  public mountMapDashboard(container: HTMLElement): void {
    this.appendToOverlay(container);
  }

  private static formatLocationLabel(location: string): string {
    const normalized = location.replace(/[_-]+/g, ' ').trim();
    if (!normalized) return '';

    return normalized
      .split(/\s+/g)
      .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
      .join(' ');
  }

  private constructor() {
    const overlay = document.getElementById('ui-overlay');
    if (!overlay) {
      throw new Error('UI overlay container not found');
    }
    this.container = overlay;

    this.toastManager = new ToastManager((el) => this.appendToOverlay(el));
    this.modalManager = new ModalManager({
      append: (el) => this.append(el),
      remove: (el) => this.remove(el),
      createHeading: (text, level, style) => this.createHeading(text, level, style),
      createText: (text, style) => this.createText(text, style),
      createButton: (text, onClick, options) => this.createButton(text, onClick, options),
    });
    this.tutorialUI = new TutorialUI(this.container, (text, onClick, options) =>
      this.createButton(text, onClick, options)
    );
  }

  public static getInstance(): UIManager {
    if (!UIManager.instance) {
      UIManager.instance = new UIManager();
    }
    return UIManager.instance;
  }

  /**
   * Returns true if a modal is currently displayed.
   */
  public isModalOpen(): boolean {
    return this.modalManager.isModalOpen();
  }

  /**
   * Show floating money text animation (e.g., '+$2,500' when selling).
   * Text floats upward and fades out.
   */
  public showFloatingMoney(amount: number, isPositive: boolean = true): void {
    this.toastManager.showFloatingMoney(amount, isPositive);
  }

  /**
   * Show XP gain toast notification (e.g., '+10 Eye XP (75/100 to Level 2)').
   * Multiple toasts stack vertically to avoid overlapping.
   * @param skill - The skill that gained XP
   * @param amount - Amount of XP gained
   * @param currentXP - Current XP after gain (optional, for progress display)
   * @param requiredXP - XP required for next level (optional, for progress display)
   * @param currentLevel - Current skill level (optional, for progress display)
   */
  public showXPGain(
    skill: SkillKey,
    amount: number,
    currentXP?: number,
    requiredXP?: number,
    currentLevel?: number
  ): void {
    this.toastManager.showXPGain(skill, amount, currentXP, requiredXP, currentLevel);
  }

  /**
   * Show a generic toast notification.
   * Intended for lightweight feedback that should not block gameplay.
   */
  public showToast(
    message: string,
    options?: { backgroundColor?: string; durationMs?: number }
  ): void {
    this.toastManager.showToast(message, options);
  }

  /**
   * Show skill level-up celebration modal with unlock description.
   * @param skill - The skill that leveled up
   * @param newLevel - The new skill level
   */
  public showSkillLevelUp(skill: SkillKey, newLevel: number): void {
    this.modalManager.showSkillLevelUp(skill, newLevel);
  }

  /**
   * Clear all UI elements from the overlay.
   * Should be called when transitioning between UI states or scenes.
   * Preserves tutorial dialogues which persist across scenes.
   */
  public clear(): void {
    const { backdrop: tutorialBackdrop, dialogue: tutorialDialogue } =
      this.tutorialUI.getElements();
    
    // Clear everything
    this.container.innerHTML = '';
    
    // Restore tutorial elements if they existed
    if (tutorialBackdrop) {
      this.container.appendChild(tutorialBackdrop);
    }
    if (tutorialDialogue) {
      this.container.appendChild(tutorialDialogue);
    }
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
      background: 'linear-gradient(145deg, rgba(18, 18, 35, 0.95), rgba(30, 30, 50, 0.95))',
      border: '2px solid rgba(100, 200, 255, 0.3)',
      borderRadius: '16px',
      padding: '24px',
      color: '#e0e6ed',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
      backdropFilter: 'blur(10px)',
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
      margin: '8px 0',
      fontSize: '15px',
      color: '#e0e6ed',
      lineHeight: '1.6',
      fontFamily: 'Rajdhani, sans-serif',
      whiteSpace: 'pre-line',
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
      margin: '0 0 16px 0',
      color: '#64b5f6',
      fontFamily: 'Orbitron, sans-serif',
      fontWeight: '700',
      textShadow: '0 2px 10px rgba(0, 0, 0, 0.5)',
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
    this.modalManager.showSkillLevelUpModal(skill, level, description);
  }

  /**
   * Show a garage full modal with standardized formatting.
   */
  public showGarageFullModal(): void {
    this.modalManager.showGarageFullModal();
  }

  /**
   * Show restoration options modal with proper card-based layout.
   * @param carName - Name of the car being restored
   * @param currentCondition - Current condition value
   * @param options - Array of restoration options with details
   * @param onCancel - Callback when user cancels
   */
  public showRestorationModal(
    carName: string,
    currentCondition: number,
    options: Array<{
      name: string;
      cost: number;
      apCost: number;
      description: string;
      conditionGain: number;
      valueIncrease: number;
      netProfit: number;
      risk?: string;
      onClick: () => void;
    }>,
    onCancel: () => void
  ): void {
    this.modalManager.showRestorationModal(carName, currentCondition, options, onCancel);
  }

  /**
   * Show an insufficient funds modal with standardized formatting.
   */
  public showInsufficientFundsModal(): void {
    this.modalManager.showInsufficientFundsModal();
  }



  /**
   * Show a time block warning modal (when action would exceed available time).
   * @param title - Warning title
   * @param message - Warning message
   */
  public showTimeBlockModal(title: string, message: string): void {
    this.modalManager.showTimeBlockModal(title, message);
  }

  /**
   * Show a modal dialog with title, message, and action buttons.
   * Modal auto-closes when any button is clicked.
   * 
   * Use this for:
   * - Informational messages (single OK button)
   * - Presenting multiple distinct actions (e.g., "View Details" vs "Continue")
   * - Custom modal layouts with specific button styling
   * 
   * For simple yes/no confirmations, use confirmAction() instead.
   * 
   * @param title - Modal title text
   * @param message - Modal body text (supports newlines with \n)
   * @param buttons - Array of button configurations with text and onClick handlers
   * @returns The modal element (automatically appended to overlay)
   * @see confirmAction for yes/no confirmation dialogs
   */
  public showModal(
    title: string,
    message: string,
    buttons: { text: string; onClick: () => void }[]
  ): HTMLDivElement {
    return this.modalManager.showModal(title, message, buttons);
  }

  /**
   * Create a standardized car info panel.
   * @param car - The car to display
   * @param options - Configuration options
   * @returns Configured panel element
   */
  public createCarInfoPanel(car: Car, options?: {
    showValue?: boolean;
    customValueText?: string;
    showCondition?: boolean;
    showTags?: boolean;
    style?: Partial<CSSStyleDeclaration>;
    titleColor?: string;
  }): HTMLDivElement {
    const panel = this.createPanel({
      textAlign: 'center',
      ...options?.style
    });

    const title = this.createHeading(car.name, 2, {
      color: options?.titleColor || '#ecf0f1',
      marginBottom: '10px'
    });
    panel.appendChild(title);

    const details: string[] = [];
    if (options?.showCondition !== false) {
      details.push(`Condition: ${car.condition}/100`);
    }
    
    if (options?.customValueText) {
      details.push(options.customValueText);
    } else if (options?.showValue) {
       details.push(`Base Value: ${formatCurrency(car.baseValue)}`);
    }

    if (details.length > 0) {
      const infoText = this.createText(details.join(' | '), {
        marginBottom: '10px',
        fontSize: '16px'
      });
      panel.appendChild(infoText);
    }

    if (options?.showTags !== false && car.tags && car.tags.length > 0) {
       const tagsText = this.createText(`Tags: ${car.tags.join(', ')}`, {
         color: '#90caf9',
         fontSize: '14px',
         fontStyle: 'italic'
       });
       panel.appendChild(tagsText);
    }

    return panel;
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
    ap: string;
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
    dailyRent?: number;
    market?: string;
    collectionPrestige?: {
      totalPerDay: number;
      carCount: number;
    };
    victoryProgress?: {
      prestige: { current: number; required: number; met: boolean };
      unicorns: { current: number; required: number; met: boolean };
      collectionCars: { current: number; required: number; met: boolean };
      skillLevel: { current: number; required: number; met: boolean };
      onClickProgress?: () => void;
    };
  }): HTMLDivElement {
    const hud = document.createElement('div');
    hud.id = 'game-hud';

    hud.className = 'game-panel game-hud';

    const locationLabel = data.location !== undefined ? UIManager.formatLocationLabel(data.location) : undefined;
    const skillsLabel = data.skills !== undefined
      ? `Eye ${data.skills.eye} · Tongue ${data.skills.tongue} · Network ${data.skills.network}`
      : undefined;

    hud.innerHTML = `
      <div class="hud-grid">
        <div class="hud-item" data-hud="money">
          <span class="hud-icon">💰</span>
          <span class="hud-label">Money</span>
          <span class="hud-value" data-hud-value="money">${formatCurrency(data.money)}</span>
        </div>

        ${data.prestige !== undefined ? `
          <div class="hud-item" data-hud="prestige">
            <span class="hud-icon">🏆</span>
            <span class="hud-label">Prestige</span>
            <span class="hud-value" data-hud-value="prestige">${data.prestige}</span>
          </div>
        ` : ''}

        <div class="hud-item" data-hud="day">
          <span class="hud-icon">📅</span>
          <span class="hud-label">Day</span>
          <span class="hud-value" data-hud-value="day">${data.day}</span>
        </div>

        <div class="hud-item" data-hud="ap">
          <span class="hud-icon">⚡</span>
          <span class="hud-label">AP</span>
          <span class="hud-value" data-hud-value="ap">${data.ap}</span>
        </div>

        ${data.location !== undefined ? `
          <div class="hud-item hud-item--wide" data-hud="location">
            <span class="hud-icon">📍</span>
            <span class="hud-label">Location</span>
            <span class="hud-value" data-hud-value="location">${locationLabel}</span>
          </div>
        ` : ''}

        ${data.market !== undefined ? `
          <div class="hud-item" data-hud="market">
            <span class="hud-icon">📈</span>
            <span class="hud-label">Market</span>
            <span class="hud-value" data-hud-value="market">${data.market}</span>
          </div>
        ` : ''}

        ${data.garage !== undefined ? `
          <div class="hud-item" data-hud="garage">
            <span class="hud-icon">🏠</span>
            <span class="hud-label">Garage</span>
            <span class="hud-value" data-hud-value="garage">${data.garage.used}/${data.garage.total}</span>
          </div>
        ` : ''}

        ${data.skills !== undefined ? `
          <div class="hud-item hud-item--wide" data-hud="skills" title="Skills: Eye, Tongue, Network">
            <span class="hud-icon">🧠</span>
            <span class="hud-label">Skills</span>
            <span class="hud-value" data-hud-value="skills">${skillsLabel}</span>
          </div>
        ` : ''}

        ${data.dailyRent !== undefined ? `
          <div class="hud-item hud-item--subtle hud-item--danger" data-hud="daily-rent" title="Rent increases as you upgrade your garage">
            <span class="hud-icon">💸</span>
            <span class="hud-label">Rent</span>
            <span class="hud-value">${formatCurrency(data.dailyRent)}</span>
          </div>
        ` : ''}

        ${data.collectionPrestige !== undefined && data.collectionPrestige.carCount > 0 ? `
          <div class="hud-item hud-item--subtle hud-item--warning hud-item--wide" data-hud="collection-prestige" title="Cars in your collection generate prestige daily based on condition quality">
            <span class="hud-icon">🏛️</span>
            <span class="hud-label">Collection</span>
            <span class="hud-value">+${data.collectionPrestige.totalPerDay} prestige/day (${data.collectionPrestige.carCount} cars)</span>
          </div>
        ` : ''}
      </div>
    `;

    // Add victory progress tracker if provided
    if (data.victoryProgress) {
      const progressDiv = document.createElement('div');
      progressDiv.className = 'hud-progress';
      
      const prestigeIcon = data.victoryProgress.prestige.met ? '✅' : '⬜';
      const unicornIcon = data.victoryProgress.unicorns.met ? '✅' : '⬜';
      const collectionIcon = data.victoryProgress.collectionCars.met ? '✅' : '⬜';
      const skillIcon = data.victoryProgress.skillLevel.met ? '✅' : '⬜';
      
      progressDiv.innerHTML = `
        <div class="hud-progress-title">🏆 Victory (click)</div>
        <div class="hud-progress-items">
          <div class="hud-progress-item">${prestigeIcon} Prestige <span>${data.victoryProgress.prestige.current}/${data.victoryProgress.prestige.required}</span></div>
          <div class="hud-progress-item">${unicornIcon} Unicorns <span>${data.victoryProgress.unicorns.current}/${data.victoryProgress.unicorns.required}</span></div>
          <div class="hud-progress-item">${collectionIcon} Collection <span>${data.victoryProgress.collectionCars.current}/${data.victoryProgress.collectionCars.required}</span></div>
          <div class="hud-progress-item">${skillIcon} Max Skill <span>${data.victoryProgress.skillLevel.current}/${data.victoryProgress.skillLevel.required}</span></div>
        </div>
      `;
      
      if (data.victoryProgress.onClickProgress) {
        progressDiv.addEventListener('click', data.victoryProgress.onClickProgress);
      }
      
      hud.appendChild(progressDiv);
    }

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
    ap?: string;
    location?: string;
    garage?: {
      used: number;
      total: number;
    };
    market?: string;
  }): void {
    const hud = document.getElementById('game-hud');
    if (!hud) return;

    const moneyValueEl = hud.querySelector<HTMLSpanElement>('[data-hud-value="money"]');
    const prestigeValueEl = hud.querySelector<HTMLSpanElement>('[data-hud-value="prestige"]');
    const garageValueEl = hud.querySelector<HTMLSpanElement>('[data-hud-value="garage"]');
    const skillsValueEl = hud.querySelector<HTMLSpanElement>('[data-hud-value="skills"]');
    const dayValueEl = hud.querySelector<HTMLSpanElement>('[data-hud-value="day"]');
    const apValueEl = hud.querySelector<HTMLSpanElement>('[data-hud-value="ap"]');
    const locationValueEl = hud.querySelector<HTMLSpanElement>('[data-hud-value="location"]');
    const marketValueEl = hud.querySelector<HTMLSpanElement>('[data-hud-value="market"]');

    if (data.money !== undefined && moneyValueEl) {
      moneyValueEl.textContent = formatCurrency(data.money);
    }
    if (data.prestige !== undefined && prestigeValueEl) {
      prestigeValueEl.textContent = `${data.prestige}`;
    }
    if (data.garage !== undefined && garageValueEl) {
      garageValueEl.textContent = `${data.garage.used}/${data.garage.total}`;
    }
    if (data.skills !== undefined && skillsValueEl) {
      skillsValueEl.textContent = `Eye ${data.skills.eye} · Tongue ${data.skills.tongue} · Network ${data.skills.network}`;
    }
    if (data.day !== undefined && dayValueEl) {
      dayValueEl.textContent = `${data.day}`;
    }
    if (data.ap !== undefined && apValueEl) {
      apValueEl.textContent = data.ap;
    }
    if (data.location !== undefined && locationValueEl) {
      locationValueEl.textContent = UIManager.formatLocationLabel(data.location);
    }
    if (data.market !== undefined && marketValueEl) {
      marketValueEl.textContent = data.market;
    }
  }

  /**
   * Show a confirmation modal with confirm/cancel buttons.
   * Reusable pattern for all yes/no decisions.
   * 
   * Use this for:
   * - Confirming destructive actions (sell car, quit auction)
   * - Spending resources (money, AP, prestige)
   * - Any binary choice where one option proceeds and one cancels
   * 
   * For informational messages or multiple distinct actions, use showModal() instead.
   * 
   * @param title - Modal title
   * @param message - Confirmation message (supports newlines with \n)
   * @param onConfirm - Callback when user confirms
   * @param onCancel - Optional callback when user cancels (defaults to no-op)
   * @param options - Optional configuration
   * @param options.confirmText - Text for confirm button (default: "Confirm")
   * @param options.confirmVariant - Button variant for confirm (default: "warning")
   * @param options.cancelText - Text for cancel button (default: "Cancel")
   * @see showModal for informational dialogs or multiple actions
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
    this.modalManager.confirmAction(title, message, onConfirm, onCancel, options);
  }

  /**
   * Show a tutorial dialogue with character portrait.
   * Tutorial dialogues are styled differently and positioned at the bottom
   * to avoid conflicts with game modals.
   * @param speaker - Name of the character speaking (e.g., "Uncle Ray", "Sterling Vance")
   * @param text - Dialogue text to display
   * @param onDismiss - Optional callback when dialogue is dismissed
   */
  public showTutorialDialogue(speaker: string, text: string, onDismiss?: () => void): void {
    this.tutorialUI.showTutorialDialogue(speaker, text, onDismiss);
  }

  /**
   * Hide the currently displayed tutorial dialogue.
   */
  public hideTutorialDialogue(): void {
    this.tutorialUI.hideTutorialDialogue();
  }
}
