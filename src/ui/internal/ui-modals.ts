import { formatCurrency } from '@/utils/format';
import { SKILL_METADATA, type SkillKey } from '@/config/game-config';
import type { ButtonVariant } from './ui-types';

type CreateHeading = (
  text: string,
  level: 1 | 2 | 3,
  style?: Partial<CSSStyleDeclaration>
) => HTMLHeadingElement;

type CreateText = (
  text: string,
  style?: Partial<CSSStyleDeclaration>
) => HTMLParagraphElement;

type CreateButton = (
  text: string,
  onClick: () => void,
  options?: {
    variant?: ButtonVariant;
    style?: Partial<CSSStyleDeclaration>;
  }
) => HTMLButtonElement;

/**
 * Creates and manages modal UI in the DOM overlay.
 * @internal Used by UIManager.
 */
export class ModalManager {
  constructor(
    private readonly deps: {
      append: (element: HTMLElement) => void;
      remove: (element: HTMLElement) => void;
      createHeading: CreateHeading;
      createText: CreateText;
      createButton: CreateButton;
    }
  ) {}

  public isModalOpen(): boolean {
    return document.querySelector('.game-modal-backdrop') !== null;
  }

  public showSkillLevelUp(skill: SkillKey, newLevel: number): void {
    const skillMeta = SKILL_METADATA[skill];
    const skillIcon = skillMeta.icon;
    const skillName = skillMeta.name;

    const unlockDescriptions: Record<SkillKey, Record<number, string>> = {
      eye: {
        2: '✓ Unlock "Kick Tires" tactic in auctions\n✓ See first history tag on cars\n✓ Better damage detection',
        3: '✓ See all history tags\n✓ More accurate value estimates\n✓ Spot hidden issues faster',
        4: '✓ See rival\'s remaining budget in auctions\n✓ Expert-level appraisals\n✓ Predict restoration outcomes',
        5: '✓ Predict market fluctuations 1 day ahead\n✓ Master appraiser status\n✓ See hidden car attributes',
      },
      tongue: {
        2: '✓ Unlock "Stall" tactic in auctions\n✓ More persuasive in negotiations\n✓ Better haggling results',
        3: '✓ Unlock "Sweet Talk" (reduce asking price 10%)\n✓ Increased Stall effectiveness\n✓ Rivals respect your reputation',
        4: '✓ 4 Stall uses per auction (up from 2)\n✓ Advanced negotiation tactics\n✓ Lower starting bids in auctions',
        5: '✓ Unlock "Intimidate" (force rival skip turn)\n✓ Master negotiator status\n✓ Maximum persuasion power',
      },
      network: {
        2: '✓ 25% chance to see special events 1 day early\n✓ Better location intel\n✓ More reliable leads',
        3: '✓ See rival locations before traveling\n✓ Expanded network contacts\n✓ Better car availability info',
        4: '✓ Unlock "Phone a Friend" (1 free appraisal/day)\n✓ Premium location access\n✓ Early auction notifications',
        5: '✓ See all cars at locations before traveling\n✓ Master curator network\n✓ Exclusive private sales access',
      },
    };

    const description = unlockDescriptions[skill][newLevel] || 'New abilities unlocked!';

    this.showModal(
      `${skillIcon} LEVEL UP! ${skillName} Level ${newLevel}`,
      `Congratulations! Your ${skillName} skill has improved!\n\n${description}`,
      [{ text: 'Excellent!', onClick: () => {} }]
    );
  }

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

  public showGarageFullModal(): void {
    this.showModal('Garage Full', 'Garage Full - Sell or Scrap current car first.', [
      { text: 'OK', onClick: () => {} },
    ]);
  }

  public showInsufficientFundsModal(): void {
    this.showModal('Not Enough Money', "You don't have enough money for this purchase.", [
      { text: 'OK', onClick: () => {} },
    ]);
  }

  public showTimeBlockModal(title: string, message: string): void {
    this.showModal(title, message, [{ text: 'OK', onClick: () => {} }]);
  }

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

    [
      'pointerdown',
      'pointerup',
      'pointermove',
      'click',
      'mousedown',
      'mouseup',
      'mousemove',
      'wheel',
      'touchstart',
      'touchend',
      'touchmove',
    ].forEach((eventName) => {
      backdrop.addEventListener(eventName, stop, { capture: true });
    });

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

    const heading = this.deps.createHeading('Select Restoration Service', 2, {
      textAlign: 'center',
      marginBottom: '8px',
    });

    const subtitle = this.deps.createText(
      `${carName} • Current Condition: ${currentCondition}/100`,
      {
        textAlign: 'center',
        marginBottom: '24px',
        fontSize: '16px',
        color: '#90caf9',
      }
    );

    modal.appendChild(heading);
    modal.appendChild(subtitle);

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

      const valueInfo = document.createElement('div');
      valueInfo.textContent = `💰 Value: +${formatCurrency(opt.valueIncrease)}`;
      Object.assign(valueInfo.style, {
        fontSize: '14px',
        color: '#64b5f6',
      });
      statsRow.appendChild(valueInfo);

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
        this.deps.remove(modal);
        this.deps.remove(backdrop);
        opt.onClick();
      });

      modal.appendChild(card);
    });

    const cancelBtn = this.deps.createButton('Cancel', () => {
      this.deps.remove(modal);
      this.deps.remove(backdrop);
      onCancel();
    });

    Object.assign(cancelBtn.style, {
      width: '100%',
      marginTop: '8px',
    });
    modal.appendChild(cancelBtn);

    this.deps.append(backdrop);
    this.deps.append(modal);
  }

  public showModal(
    title: string,
    message: string,
    buttons: { text: string; onClick: () => void }[]
  ): HTMLDivElement {
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

    [
      'pointerdown',
      'pointerup',
      'pointermove',
      'click',
      'mousedown',
      'mouseup',
      'mousemove',
      'wheel',
      'touchstart',
      'touchend',
      'touchmove',
    ].forEach((eventName) => {
      backdrop.addEventListener(eventName, stop, { capture: true });
    });

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

    const heading = this.deps.createHeading(title, 2, {
      textAlign: 'center',
      marginBottom: '20px',
      flexShrink: '0',
    });

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

    const isHTML = /<[a-z][\s\S]*>/i.test(message);

    if (isHTML) {
      contentContainer.innerHTML = message;
      Object.assign(contentContainer.style, {
        fontSize: '16px',
        color: '#e0e6ed',
        lineHeight: '1.6',
        fontFamily: 'Rajdhani, sans-serif',
      });
    } else {
      const text = this.deps.createText(message, {
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
      const button = this.deps.createButton(btn.text, () => {
        btn.onClick();
        this.deps.remove(modal);
        this.deps.remove(backdrop);
      });
      buttonContainer.appendChild(button);
    });

    modal.appendChild(heading);
    modal.appendChild(contentContainer);
    modal.appendChild(buttonContainer);

    this.deps.append(backdrop);
    this.deps.append(modal);

    return modal;
  }
}
