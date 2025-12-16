import { formatCurrency } from '@/utils/format';
import { Car } from '@/data/car-database';
import { GAME_CONFIG, SKILL_METADATA } from '@/config/game-config';

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
  private tutorialDialogueElement: HTMLElement | null = null;
  private tutorialBackdropElement: HTMLElement | null = null;
  private activeToasts: HTMLElement[] = []; // Track active toasts for stacking

  private static ensureStyleElement(id: string, cssText: string): void {
    if (document.getElementById(id)) return;

    const style = document.createElement('style');
    style.id = id;
    style.textContent = cssText;
    document.head.appendChild(style);
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
    return document.querySelector('.modal-backdrop') !== null;
  }

  /**
   * Show floating money text animation (e.g., '+$2,500' when selling).
   * Text floats upward and fades out.
   */
  public showFloatingMoney(amount: number, isPositive: boolean = true): void {
    const floatingText = document.createElement('div');
    const symbol = isPositive ? '+' : '-';
    const color = isPositive ? '#2ecc71' : '#e74c3c';
    
    floatingText.textContent = `${symbol}${formatCurrency(Math.abs(amount))}`;
    floatingText.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 36px;
      font-weight: bold;
      color: ${color};
      text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
      pointer-events: none;
      z-index: 10000;
      animation: floatUp 1.5s ease-out forwards;
    `;
    
    // Add CSS animation if not already present
    UIManager.ensureStyleElement(
      'floatingMoneyAnimation',
      `
        @keyframes floatUp {
          0% {
            opacity: 1;
            transform: translate(-50%, -50%) translateY(0);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) translateY(-100px);
          }
        }
      `
    );
    
    document.body.appendChild(floatingText);
    
    // Remove element after animation
    setTimeout(() => {
      if (floatingText.parentNode) {
        floatingText.parentNode.removeChild(floatingText);
      }
    }, 1500);
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
    skill: 'eye' | 'tongue' | 'network',
    amount: number,
    currentXP?: number,
    requiredXP?: number,
    currentLevel?: number
  ): void {
    const skillMeta = SKILL_METADATA[skill];
    const skillIcon = skillMeta.icon;
    const skillName = skillMeta.name;
    const skillColor = skillMeta.color;
    
    // Calculate vertical position based on active toasts (stack them)
    const { baseTopPosition, heightWithMargin } = GAME_CONFIG.ui.toast;
    const topPosition = baseTopPosition + (this.activeToasts.length * heightWithMargin);
    
    // Build toast text with optional progress
    let toastText = `${skillIcon} +${amount} ${skillName} XP`;
    if (currentXP !== undefined && requiredXP !== undefined && currentLevel !== undefined) {
      if (requiredXP === 0) {
        toastText += ` (MAX LEVEL)`;
      } else {
        toastText += ` (${currentXP}/${requiredXP} to Lv${currentLevel + 1})`;
      }
    }
    
    const toast = document.createElement('div');
    toast.textContent = toastText;
    toast.style.cssText = `
      position: fixed;
      top: ${topPosition}px;
      right: 20px;
      padding: 12px 20px;
      background: ${skillColor};
      color: #fff;
      border-radius: 8px;
      font-size: 14px;
      font-weight: bold;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      pointer-events: none;
      z-index: 10000;
      animation: slideInFadeOut ${GAME_CONFIG.ui.toast.animationDuration}ms ease-out forwards;
      transition: top 0.3s ease;
    `;
    
    // Track this toast
    this.activeToasts.push(toast);
    
    // Add CSS animation if not already present
    UIManager.ensureStyleElement(
      'xpToastAnimation',
      `
        @keyframes slideInFadeOut {
          0% {
            opacity: 0;
            transform: translateX(100px);
          }
          15% {
            opacity: 1;
            transform: translateX(0);
          }
          85% {
            opacity: 1;
            transform: translateX(0);
          }
          100% {
            opacity: 0;
            transform: translateX(100px);
          }
        }
      `
    );
    
    document.body.appendChild(toast);
    
    // Remove element after animation and update stack positions
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      // Remove from active toasts array
      const index = this.activeToasts.indexOf(toast);
      if (index > -1) {
        this.activeToasts.splice(index, 1);
      }
      // Reposition remaining toasts
      this.repositionToasts();
    }, GAME_CONFIG.ui.toast.animationDuration);
  }

  /**
   * Show a generic toast notification.
   * Intended for lightweight feedback that should not block gameplay.
   */
  public showToast(
    message: string,
    options?: { backgroundColor?: string; durationMs?: number }
  ): void {
    const safeMessage = message?.trim();
    if (!safeMessage) return;

    const durationMs = options?.durationMs ?? GAME_CONFIG.ui.toast.animationDuration;
    const backgroundColor = options?.backgroundColor ?? 'rgba(44, 62, 80, 0.95)';

    const { baseTopPosition, heightWithMargin } = GAME_CONFIG.ui.toast;
    const topPosition = baseTopPosition + (this.activeToasts.length * heightWithMargin);

    const toast = document.createElement('div');
    toast.textContent = safeMessage;
    toast.style.cssText = `
      position: fixed;
      top: ${topPosition}px;
      right: 20px;
      padding: 12px 20px;
      background: ${backgroundColor};
      color: #fff;
      border-radius: 8px;
      font-size: 14px;
      font-weight: bold;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      pointer-events: none;
      z-index: 10000;
      animation: toastSlideInFadeOut ${durationMs}ms ease-out forwards;
      transition: top 0.3s ease;
      max-width: 380px;
      white-space: pre-wrap;
    `;

    this.activeToasts.push(toast);

    UIManager.ensureStyleElement(
      'genericToastAnimation',
      `
        @keyframes toastSlideInFadeOut {
          0% {
            opacity: 0;
            transform: translateX(100px);
          }
          15% {
            opacity: 1;
            transform: translateX(0);
          }
          85% {
            opacity: 1;
            transform: translateX(0);
          }
          100% {
            opacity: 0;
            transform: translateX(100px);
          }
        }
      `
    );

    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }

      const index = this.activeToasts.indexOf(toast);
      if (index > -1) {
        this.activeToasts.splice(index, 1);
      }
      this.repositionToasts();
    }, durationMs);
  }

  /**
   * Reposition remaining toasts after one is removed.
   * Updates vertical position of each toast to fill gaps.
   */
  private repositionToasts(): void {
    const { baseTopPosition, heightWithMargin } = GAME_CONFIG.ui.toast;
    this.activeToasts.forEach((toast, index) => {
      toast.style.top = `${baseTopPosition + (index * heightWithMargin)}px`;
    });
  }

  /**
   * Show skill level-up celebration modal with unlock description.
   * @param skill - The skill that leveled up
   * @param newLevel - The new skill level
   */
  public showSkillLevelUp(skill: 'eye' | 'tongue' | 'network', newLevel: number): void {
    const skillMeta = SKILL_METADATA[skill];
    const skillIcon = skillMeta.icon;
    const skillName = skillMeta.name;
    
    // Define unlock descriptions for each skill level
    const unlockDescriptions: Record<string, Record<number, string>> = {
      eye: {
        2: '✓ Unlock "Kick Tires" tactic in auctions\\n✓ See first history tag on cars\\n✓ Better damage detection',
        3: '✓ See all history tags\\n✓ More accurate value estimates\\n✓ Spot hidden issues faster',
        4: '✓ See rival\'s remaining budget in auctions\\n✓ Expert-level appraisals\\n✓ Predict restoration outcomes',
        5: '✓ Predict market fluctuations 1 day ahead\\n✓ Master appraiser status\\n✓ See hidden car attributes',
      },
      tongue: {
        2: '✓ Unlock "Stall" tactic in auctions\\n✓ More persuasive in negotiations\\n✓ Better haggling results',
        3: '✓ Unlock "Sweet Talk" (reduce asking price 10%)\\n✓ Increased Stall effectiveness\\n✓ Rivals respect your reputation',
        4: '✓ 4 Stall uses per auction (up from 2)\\n✓ Advanced negotiation tactics\\n✓ Lower starting bids in auctions',
        5: '✓ Unlock "Intimidate" (force rival skip turn)\\n✓ Master negotiator status\\n✓ Maximum persuasion power',
      },
      network: {
        2: '✓ 25% chance to see special events 1 day early\\n✓ Better location intel\\n✓ More reliable leads',
        3: '✓ See rival locations before traveling\\n✓ Expanded network contacts\\n✓ Better car availability info',
        4: '✓ Unlock "Phone a Friend" (1 free appraisal/day)\\n✓ Premium location access\\n✓ Early auction notifications',
        5: '✓ See all cars at locations before traveling\\n✓ Master curator network\\n✓ Exclusive private sales access',
      },
    };
    
    const description = unlockDescriptions[skill][newLevel] || 'New abilities unlocked!';
    
    this.showModal(
      `${skillIcon} LEVEL UP! ${skillName} Level ${newLevel}`,
      `Congratulations! Your ${skillName} skill has improved!\\n\\n${description}`,
      [{ text: 'Excellent!', onClick: () => {} }]
    );
  }

  /**
   * Clear all UI elements from the overlay.
   * Should be called when transitioning between UI states or scenes.
   * Preserves tutorial dialogues which persist across scenes.
   */
  public clear(): void {
    // Store tutorial elements temporarily
    const tutorialBackdrop = this.tutorialBackdropElement;
    const tutorialDialogue = this.tutorialDialogueElement;
    
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
    const stop = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
    };

    const backdrop = document.createElement('div');
    backdrop.className = 'game-modal-backdrop';
    Object.assign(backdrop.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      zIndex: '999',
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      pointerEvents: 'auto',
    });

    ['pointerdown', 'pointerup', 'pointermove', 'click', 'mousedown', 'mouseup', 'mousemove', 'wheel', 'touchstart', 'touchend', 'touchmove'].forEach(
      (eventName) => {
        backdrop.addEventListener(eventName, stop, { capture: true });
      }
    );

    const modal = document.createElement('div');
    modal.className = 'game-modal restoration-modal';
    
    Object.assign(modal.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'linear-gradient(145deg, rgba(18, 18, 35, 0.98), rgba(30, 30, 50, 0.98))',
      border: '3px solid rgba(100, 200, 255, 0.4)',
      borderRadius: '20px',
      padding: '32px',
      minWidth: '500px',
      maxWidth: '700px',
      maxHeight: '80vh',
      overflowY: 'auto',
      zIndex: '1000',
      pointerEvents: 'auto',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
    });

    const heading = this.createHeading('Select Restoration Service', 2, {
      textAlign: 'center',
      marginBottom: '8px',
    });

    const subtitle = this.createText(`${carName} • Current Condition: ${currentCondition}/100`, {
      textAlign: 'center',
      marginBottom: '24px',
      fontSize: '16px',
      color: '#90caf9',
    });

    modal.appendChild(heading);
    modal.appendChild(subtitle);

    // Create option cards
    options.forEach((opt) => {
      const card = document.createElement('div');
      Object.assign(card.style, {
        background: 'linear-gradient(145deg, rgba(30, 30, 50, 0.8), rgba(40, 40, 60, 0.8))',
        border: '2px solid rgba(100, 200, 255, 0.2)',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '16px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      });

      card.addEventListener('mouseenter', () => {
        card.style.borderColor = 'rgba(100, 200, 255, 0.5)';
        card.style.transform = 'translateX(4px)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.borderColor = 'rgba(100, 200, 255, 0.2)';
        card.style.transform = 'translateX(0)';
      });

      const cardHeader = document.createElement('div');
      Object.assign(cardHeader.style, {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px',
      });

      const optionName = document.createElement('h3');
      optionName.textContent = opt.name;
      Object.assign(optionName.style, {
        margin: '0',
        fontSize: '18px',
        color: '#64b5f6',
        fontFamily: 'Orbitron, sans-serif',
      });

      const costInfo = document.createElement('div');
      costInfo.textContent = `${formatCurrency(opt.cost)} • ${opt.apCost} AP`;
      Object.assign(costInfo.style, {
        fontSize: '16px',
        color: '#ffd54f',
        fontWeight: 'bold',
      });

      cardHeader.appendChild(optionName);
      cardHeader.appendChild(costInfo);
      card.appendChild(cardHeader);

      const description = document.createElement('div');
      description.textContent = opt.description;
      Object.assign(description.style, {
        fontSize: '14px',
        color: '#b0bec5',
        marginBottom: '12px',
        lineHeight: '1.5',
      });
      card.appendChild(description);

      const statsRow = document.createElement('div');
      Object.assign(statsRow.style, {
        display: 'flex',
        gap: '16px',
        marginBottom: '8px',
      });

      const conditionGain = document.createElement('div');
      conditionGain.textContent = `📈 +${opt.conditionGain} condition`;
      Object.assign(conditionGain.style, {
        fontSize: '14px',
        color: '#81c784',
      });
      statsRow.appendChild(conditionGain);

      // Value increase (always positive)
      const valueInfo = document.createElement('div');
      valueInfo.textContent = `💰 Value: +${formatCurrency(opt.valueIncrease)}`;
      Object.assign(valueInfo.style, {
        fontSize: '14px',
        color: '#64b5f6',
      });
      statsRow.appendChild(valueInfo);
      
      // Net profit after costs
      const profitColor = opt.netProfit >= 0 ? '#2ecc71' : '#e74c3c';
      const profitIcon = opt.netProfit >= 0 ? '🟢' : '🔴';
      const profitStr = opt.netProfit >= 0 ? `+${formatCurrency(opt.netProfit)}` : formatCurrency(opt.netProfit);
      
      const profitInfo = document.createElement('div');
      profitInfo.textContent = `${profitIcon} Net: ${profitStr}`;
      Object.assign(profitInfo.style, {
        fontSize: '14px',
        color: profitColor,
        fontWeight: 'bold',
      });
      statsRow.appendChild(profitInfo);

      card.appendChild(statsRow);

      if (opt.risk) {
        const riskWarning = document.createElement('div');
        riskWarning.textContent = `⚠️ ${opt.risk}`;
        Object.assign(riskWarning.style, {
          fontSize: '13px',
          color: '#ff9800',
          marginTop: '8px',
          fontStyle: 'italic',
        });
        card.appendChild(riskWarning);
      }

      card.addEventListener('click', () => {
        this.remove(modal);
        this.remove(backdrop);
        opt.onClick();
      });

      modal.appendChild(card);
    });

    // Cancel button
    const cancelBtn = this.createButton('Cancel', () => {
      this.remove(modal);
      this.remove(backdrop);
      onCancel();
    });
    Object.assign(cancelBtn.style, {
      width: '100%',
      marginTop: '8px',
    });
    modal.appendChild(cancelBtn);

    this.append(backdrop);
    this.append(modal);
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
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
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
      background: 'linear-gradient(145deg, rgba(18, 18, 35, 0.98), rgba(30, 30, 50, 0.98))',
      border: '3px solid rgba(100, 200, 255, 0.4)',
      borderRadius: '20px',
      padding: '32px',
      minWidth: '400px',
      maxWidth: '700px',
      maxHeight: '85vh',
      zIndex: '1000',
      pointerEvents: 'auto',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
      display: 'flex',
      flexDirection: 'column',
    });

    const heading = this.createHeading(title, 2, {
      textAlign: 'center',
      marginBottom: '20px',
      flexShrink: '0',
    });

    // Create content container with scroll
    const contentContainer = document.createElement('div');
    Object.assign(contentContainer.style, {
      overflowY: 'auto',
      overflowX: 'hidden',
      marginBottom: '20px',
      flexGrow: '1',
      flexShrink: '1',
      wordWrap: 'break-word',
      textAlign: 'center',
    });

    // Check if message contains HTML tags
    const isHTML = /<[a-z][\s\S]*>/i.test(message);
    
    if (isHTML) {
      // If it's HTML content, use innerHTML
      contentContainer.innerHTML = message;
      // Apply text styling to the container
      Object.assign(contentContainer.style, {
        fontSize: '16px',
        color: '#e0e6ed',
        lineHeight: '1.6',
        fontFamily: 'Rajdhani, sans-serif',
      });
    } else {
      // Otherwise use createText for plain text
      const text = this.createText(message, {
        fontSize: '16px',
      });
      contentContainer.appendChild(text);
    }

    const buttonContainer = document.createElement('div');
    Object.assign(buttonContainer.style, {
      display: 'flex',
      justifyContent: 'center',
      gap: '10px',
      flexShrink: '0',
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
    modal.appendChild(contentContainer);
    modal.appendChild(buttonContainer);

    this.append(backdrop);
    this.append(modal);
    return modal;
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
    museumIncome?: {
      totalPerDay: number;
      carCount: number;
    };
    victoryProgress?: {
      prestige: { current: number; required: number; met: boolean };
      unicorns: { current: number; required: number; met: boolean };
      museumCars: { current: number; required: number; met: boolean };
      skillLevel: { current: number; required: number; met: boolean };
      onClickProgress?: () => void;
    };
  }): HTMLDivElement {
    const hud = document.createElement('div');
    hud.id = 'game-hud';
    
    Object.assign(hud.style, {
      position: 'absolute',
      top: '20px',
      left: '20px',
      background: 'linear-gradient(145deg, rgba(18, 18, 35, 0.92), rgba(30, 30, 50, 0.92))',
      border: '2px solid rgba(100, 200, 255, 0.3)',
      borderRadius: '12px',
      padding: '16px 20px',
      color: '#e0e6ed',
      fontSize: '15px',
      fontFamily: 'Rajdhani, monospace',
      fontWeight: '600',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
      backdropFilter: 'blur(10px)',
    });

    hud.innerHTML = `
      <div data-hud="money">💰 Money: ${formatCurrency(data.money)}</div>
      ${data.prestige !== undefined ? `<div data-hud="prestige">🏆 Prestige: ${data.prestige}</div>` : ''}
      ${data.museumIncome !== undefined && data.museumIncome.carCount > 0 ? `<div data-hud="museum-income" style="color: #f39c12; font-size: 13px;" title="Museum cars generate prestige daily based on condition quality">🏛️ Museum: +${data.museumIncome.totalPerDay} prestige/day (${data.museumIncome.carCount} cars)</div>` : ''}
      ${data.garage !== undefined ? `<div data-hud="garage">🏠 Garage: ${data.garage.used}/${data.garage.total}</div>` : ''}
      ${data.dailyRent !== undefined ? `<div data-hud="daily-rent" style="color: #ff6b6b; font-size: 13px;" title="Rent increases as you upgrade your garage">💸 Daily Rent: ${formatCurrency(data.dailyRent)}</div>` : ''}
      ${data.skills !== undefined ? `<div data-hud="skills">🧠 Skills: Eye ${data.skills.eye} | Tongue ${data.skills.tongue} | Network ${data.skills.network}</div>` : ''}
      <div data-hud="day">📅 Day: ${data.day}</div>
      <div data-hud="ap">⚡ ${data.ap}</div>
      ${data.location !== undefined ? `<div data-hud="location">📍 Location: ${UIManager.formatLocationLabel(data.location)}</div>` : ''}
      ${data.market !== undefined ? `<div data-hud="market">📈 ${data.market}</div>` : ''}
    `;

    // Add victory progress tracker if provided
    if (data.victoryProgress) {
      const progressDiv = document.createElement('div');
      progressDiv.style.cssText = `
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid rgba(100, 200, 255, 0.2);
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s ease;
      `;
      
      const prestigeIcon = data.victoryProgress.prestige.met ? '✅' : '⬜';
      const unicornIcon = data.victoryProgress.unicorns.met ? '✅' : '⬜';
      const museumIcon = data.victoryProgress.museumCars.met ? '✅' : '⬜';
      const skillIcon = data.victoryProgress.skillLevel.met ? '✅' : '⬜';
      
      progressDiv.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 4px; color: #ffd700;">🏆 Victory Progress (click for details)</div>
        <div style="line-height: 1.4;">
          ${prestigeIcon} Prestige: ${data.victoryProgress.prestige.current}/${data.victoryProgress.prestige.required}<br>
          ${unicornIcon} Unicorns: ${data.victoryProgress.unicorns.current}/${data.victoryProgress.unicorns.required}<br>
          ${museumIcon} Museum: ${data.victoryProgress.museumCars.current}/${data.victoryProgress.museumCars.required}<br>
          ${skillIcon} Max Skill: ${data.victoryProgress.skillLevel.current}/${data.victoryProgress.skillLevel.required}
        </div>
      `;
      
      if (data.victoryProgress.onClickProgress) {
        progressDiv.addEventListener('mouseenter', () => {
          progressDiv.style.backgroundColor = 'rgba(100, 200, 255, 0.1)';
          progressDiv.style.borderRadius = '8px';
          progressDiv.style.padding = '4px';
        });
        progressDiv.addEventListener('mouseleave', () => {
          progressDiv.style.backgroundColor = 'transparent';
          progressDiv.style.padding = '0';
        });
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

    const moneyEl = hud.querySelector<HTMLDivElement>('[data-hud="money"]');
    const prestigeEl = hud.querySelector<HTMLDivElement>('[data-hud="prestige"]');
    const garageEl = hud.querySelector<HTMLDivElement>('[data-hud="garage"]');
    const skillsEl = hud.querySelector<HTMLDivElement>('[data-hud="skills"]');
    const dayEl = hud.querySelector<HTMLDivElement>('[data-hud="day"]');
    const apEl = hud.querySelector<HTMLDivElement>('[data-hud="ap"]');
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
    if (data.ap !== undefined && apEl) {
      apEl.textContent = `⚡ ${data.ap}`;
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
    this.showModal(title, message, [
      {
        text: options?.confirmText || 'Confirm',
        onClick: onConfirm,
      },
      {
        text: options?.cancelText || 'Cancel',
        onClick: onCancel || (() => {}),
      },
    ]);
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
    // Remove existing tutorial dialogue if present
    this.hideTutorialDialogue();

    // Create backdrop to block interaction
    const backdrop = document.createElement('div');
    backdrop.className = 'tutorial-backdrop';
    this.tutorialBackdropElement = backdrop;
    this.container.appendChild(backdrop);

    const dialogue = document.createElement('div');
    dialogue.className = 'tutorial-dialogue';
    dialogue.id = 'tutorial-dialogue';

    const header = document.createElement('div');
    header.className = 'tutorial-header';
    
    const speakerName = document.createElement('h3');
    speakerName.textContent = speaker;
    speakerName.style.margin = '0';
    speakerName.style.fontSize = '20px';
    speakerName.style.color = '#f39c12';
    speakerName.style.fontFamily = 'Orbitron, sans-serif';
    
    header.appendChild(speakerName);
    dialogue.appendChild(header);

    const content = document.createElement('p');
    content.textContent = text;
    content.style.margin = '12px 0 0 0';
    content.style.fontSize = '16px';
    content.style.lineHeight = '1.6';
    content.style.color = '#e0e6ed';
    content.style.fontFamily = 'Rajdhani, sans-serif';
    content.style.whiteSpace = 'pre-line';
    
    dialogue.appendChild(content);

    const dismissBtn = this.createButton(
      'Got it',
      () => {
        this.hideTutorialDialogue();
        if (onDismiss) {
          onDismiss();
        }
      },
      { 
        variant: 'info',
        style: { 
          marginTop: '16px',
          width: '100%'
        } 
      }
    );
    dialogue.appendChild(dismissBtn);

    this.tutorialDialogueElement = dialogue;
    this.container.appendChild(dialogue);
  }

  /**
   * Hide the currently displayed tutorial dialogue.
   */
  public hideTutorialDialogue(): void {
    if (this.tutorialBackdropElement) {
      this.tutorialBackdropElement.remove();
      this.tutorialBackdropElement = null;
    }
    if (this.tutorialDialogueElement) {
      this.tutorialDialogueElement.remove();
      this.tutorialDialogueElement = null;
    }
  }
}
