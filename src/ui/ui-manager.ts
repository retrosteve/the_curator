import { Car } from '@/data/car-database';
import { type SkillKey } from '@/config/game-config';
import { createMapDashboardContainer, createMapLocationCard } from '@/ui/internal/ui-map';
import { ModalManager } from '@/ui/internal/ui-modals';
import { ToastManager } from '@/ui/internal/ui-toasts';
import { TutorialUI } from '@/ui/internal/ui-tutorial';
import { TutorialHighlighter } from '@/ui/internal/ui-tutorial-highlight';
import { createCarInfoPanel as createCarInfoPanelInternal } from '@/ui/internal/ui-car-panels';
import { clearOverlayPreserving } from '@/ui/internal/ui-overlay';
import {
  createDiv,
  createGameButton,
  createGameButtonContainer,
  createGameHeading,
  createGamePanel,
  createGameText,
} from '@/ui/internal/ui-elements';
import { createHUD as createHUDInternal, updateHUD as updateHUDInternal } from '@/ui/internal/ui-hud';
import { eventBus } from '@/core/event-bus';
import { getCharacterPortraitUrlOrPlaceholder } from '@/assets/character-portraits';
import type { ButtonVariant, HUDData, HUDUpdate } from '@/ui/internal/ui-types';

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
  private overlay: HTMLElement;
  private readonly toastManager: ToastManager;
  private readonly modalManager: ModalManager;
  private readonly tutorialUI: TutorialUI;
  private readonly tutorialHighlighter: TutorialHighlighter;

  /**
   * Append an element to the UI overlay root (#ui-overlay).
   * Use this instead of document.body to keep UI ownership consistent.
   */
  public appendToOverlay(element: HTMLElement): void {
    this.container.appendChild(element);
    this.refreshTutorialHighlight();
  }

  /**
   * Get the UI overlay root element.
   */
  public getOverlayRoot(): HTMLElement {
    return this.container;
  }

  public createMapLocationCard(options: {
    locationId: string;
    name: string;
    description: string;
    icon: string;
    color: number;
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
    this.overlay = overlay;

    const rootId = 'ui-root';
    let root = this.overlay.querySelector<HTMLElement>(`#${rootId}`);
    if (!root) {
      root = document.createElement('div');
      root.id = rootId;
      this.overlay.appendChild(root);
    }

    const scaleId = 'ui-scale';
    let scaledRoot = root.querySelector<HTMLElement>(`#${scaleId}`);
    if (!scaledRoot) {
      scaledRoot = document.createElement('div');
      scaledRoot.id = scaleId;
      root.appendChild(scaledRoot);
    }

    this.container = scaledRoot;

    // Pixel UI theme: keep gameplay visuals as-is, but style the DOM overlay with
    // a crisp, low-frills look (square corners, minimal gradients).
    this.overlay.classList.add('ui-pixel');

    this.toastManager = new ToastManager((el) => this.appendToOverlay(el));
    this.modalManager = new ModalManager({
      append: (el) => this.append(el),
      remove: (el) => this.remove(el),
      createDiv: (className, style) => createDiv(className, style),
      createHeading: (text, level, style) => this.createHeading(text, level, style),
      createText: (text, style) => this.createText(text, style),
      createButton: (text, onClick, options) => this.createButton(text, onClick, options),
    });
    this.tutorialUI = new TutorialUI(this.container, (text, onClick, options) =>
      this.createButton(text, onClick, options)
    );
    this.tutorialHighlighter = new TutorialHighlighter(this.container);

    eventBus.on('tutorial-highlight-changed', (payload) => {
      this.tutorialHighlighter.setTargets(payload.targets);
      this.tutorialHighlighter.refresh();
    });
  }

  public refreshTutorialHighlight(): void {
    this.tutorialHighlighter.refresh();
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
    options?: {
      backgroundColor?: string;
      durationMs?: number;
      portraitUrl?: string;
      portraitAlt?: string;
      portraitSizePx?: number;
    }
  ): void {
    this.toastManager.showToast(message, options);
  }

  /**
   * Show a generic toast notification, decorated with a character portrait.
   * Intended for character-driven notifications where a face helps recognition.
   */
  public showCharacterToast(
    characterName: string,
    message: string,
    options?: {
      backgroundColor?: string;
      durationMs?: number;
      portraitSizePx?: number;
    }
  ): void {
    this.toastManager.showToast(message, {
      ...options,
      portraitUrl: getCharacterPortraitUrlOrPlaceholder(characterName),
      portraitAlt: characterName,
    });
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

    clearOverlayPreserving(this.container, [tutorialBackdrop, tutorialDialogue]);

    this.refreshTutorialHighlight();
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
      variant?: ButtonVariant;
      style?: Partial<CSSStyleDeclaration>;
    }
  ): HTMLButtonElement {
    return createGameButton(text, onClick, options);
  }

  /**
   * Create a styled panel container.
   * Useful for grouping related UI elements.
   * @param style - Optional CSS style overrides
   * @returns Configured div element
   */
  public createPanel(style?: Partial<CSSStyleDeclaration>): HTMLDivElement {
    return createGamePanel(style);
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
    return createGameText(text, style);
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
    return createGameHeading(text, level, style);
  }

  /**
   * Create a styled button container with flex layout.
   * Standard container for vertically stacked buttons.
   * @param style - Optional CSS style overrides
   * @returns Configured div element for buttons
   */
  public createButtonContainer(style?: Partial<CSSStyleDeclaration>): HTMLDivElement {
    return createGameButtonContainer(style);
  }

  /**
   * Append element to the UI overlay container.
   * @param element - Element to add to the overlay
   */
  public append(element: HTMLElement): void {
    this.container.appendChild(element);
    this.refreshTutorialHighlight();
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

    this.refreshTutorialHighlight();
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
      description: string;
      conditionGain: number;
      valueIncrease: number;
      netProfit: number;
      risk?: string;
      portraitUrl?: string;
      portraitAlt?: string;
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

  public showCharacterModal(
    characterName: string,
    title: string,
    message: string,
    buttons: { text: string; onClick: () => void }[],
    options?: { portraitSizePx?: number }
  ): HTMLDivElement {
    return this.modalManager.showCharacterModal(
      title,
      message,
      {
        portraitUrl: getCharacterPortraitUrlOrPlaceholder(characterName),
        portraitAlt: characterName,
        portraitSizePx: options?.portraitSizePx,
      },
      buttons
    );
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
    showImage?: boolean;
    imageHeightPx?: number;
    style?: Partial<CSSStyleDeclaration>;
    titleColor?: string;
  }): HTMLDivElement {
    return createCarInfoPanelInternal(car, options);
  }

  /**
   * Create HUD (Heads-Up Display) showing player stats.
   * Displays money, prestige (optional), day, and time.
   * @param data - HUD data object with money, prestige, day, and time
   * @returns Configured HUD element
   */
  public createHUD(data: HUDData): HTMLDivElement {
    return createHUDInternal(data, { formatLocationLabel: UIManager.formatLocationLabel });
  }

  /**
   * Update existing HUD values without recreating the element.
   * Only updates fields that are provided in the data object.
   * @param data - Partial HUD data to update
   */
  public updateHUD(data: HUDUpdate): void {
    updateHUDInternal(data, { formatLocationLabel: UIManager.formatLocationLabel });
  }

  /**
   * Show a confirmation modal with confirm/cancel buttons.
   * Reusable pattern for all yes/no decisions.
   * 
   * Use this for:
   * - Confirming destructive actions (sell car, quit auction)
  * - Spending resources (money, prestige)
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
      confirmVariant?: ButtonVariant;
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
  public showTutorialDialogue(
    speaker: string,
    text: string,
    onDismiss?: () => void,
    options?: {
      portraitUrl?: string;
      portraitAlt?: string;
      portraitSizePx?: number;
    }
  ): void {
    this.tutorialUI.showTutorialDialogue(speaker, text, onDismiss, options);
  }

  /**
   * Show a tutorial dialogue with portrait resolved from a character name.
   */
  public showCharacterTutorialDialogue(
    characterName: string,
    text: string,
    onDismiss?: () => void,
    options?: { portraitSizePx?: number }
  ): void {
    this.tutorialUI.showTutorialDialogue(characterName, text, onDismiss, {
      portraitUrl: getCharacterPortraitUrlOrPlaceholder(characterName),
      portraitAlt: characterName,
      portraitSizePx: options?.portraitSizePx,
    });
  }

  /**
   * Hide the currently displayed tutorial dialogue.
   */
  public hideTutorialDialogue(): void {
    this.tutorialUI.hideTutorialDialogue();
  }
}
