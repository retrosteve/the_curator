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
        variant: options?.confirmVariant,
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
      portraitUrl?: string;
      portraitAlt?: string;
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

    const heading = this.deps.createHeading('Select Restoration Service', 2, {
      textAlign: 'center',
      marginBottom: '8px',
    });

    const subtitle = this.deps.createText(
      `${carName} • Current Condition: ${currentCondition}/100`,
      {
        textAlign: 'center',
        marginBottom: '24px',
      }
    );
    subtitle.classList.add('restoration-modal__subtitle');

    modal.appendChild(heading);
    modal.appendChild(subtitle);

    options.forEach((opt) => {
      const card = document.createElement('div');
      card.className = 'restoration-option-card';

      const cardHeader = document.createElement('div');
      cardHeader.className = 'restoration-option-card__header';

      const leftHeader = document.createElement('div');
      leftHeader.className = 'restoration-option-card__header-left';

      if (opt.portraitUrl) {
        const portrait = document.createElement('img');
        portrait.src = opt.portraitUrl;
        portrait.alt = opt.portraitAlt ?? '';
        portrait.className = 'game-portrait game-portrait--sm';
        leftHeader.appendChild(portrait);
      }

      const optionName = document.createElement('h3');
      optionName.textContent = opt.name;
      optionName.className = 'restoration-option-card__title';

      const costInfo = document.createElement('div');
      costInfo.textContent = `${formatCurrency(opt.cost)} • ${opt.apCost} AP`;
      costInfo.className = 'restoration-option-card__cost';

      leftHeader.appendChild(optionName);
      cardHeader.appendChild(leftHeader);
      cardHeader.appendChild(costInfo);
      card.appendChild(cardHeader);

      const description = document.createElement('div');
      description.textContent = opt.description;
      description.className = 'restoration-option-card__description';
      card.appendChild(description);

      const statsRow = document.createElement('div');
      statsRow.className = 'restoration-option-card__stats';

      const conditionGain = document.createElement('div');
      conditionGain.textContent = `📈 +${opt.conditionGain} condition`;
      conditionGain.className = 'restoration-option-card__stat restoration-option-card__stat--condition';
      statsRow.appendChild(conditionGain);

      const valueInfo = document.createElement('div');
      valueInfo.textContent = `💰 Value: +${formatCurrency(opt.valueIncrease)}`;
      valueInfo.className = 'restoration-option-card__stat restoration-option-card__stat--value';
      statsRow.appendChild(valueInfo);

      const profitColor = opt.netProfit >= 0 ? '#2ecc71' : '#e74c3c';
      const profitIcon = opt.netProfit >= 0 ? '🟢' : '🔴';
      const profitStr = opt.netProfit >= 0 ? `+${formatCurrency(opt.netProfit)}` : formatCurrency(opt.netProfit);

      const profitInfo = document.createElement('div');
      profitInfo.textContent = `${profitIcon} Net: ${profitStr}`;
      profitInfo.className = 'restoration-option-card__stat restoration-option-card__stat--profit';
      profitInfo.style.color = profitColor;
      statsRow.appendChild(profitInfo);

      card.appendChild(statsRow);

      if (opt.risk) {
        const riskWarning = document.createElement('div');
        riskWarning.textContent = `⚠️ ${opt.risk}`;
        riskWarning.className = 'restoration-option-card__risk';
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

    cancelBtn.classList.add('restoration-modal__cancel');
    modal.appendChild(cancelBtn);

    this.deps.append(backdrop);
    this.deps.append(modal);
  }

  public showModal(
    title: string,
    message: string,
    buttons: { text: string; onClick: () => void; variant?: ButtonVariant }[]
  ): HTMLDivElement {
    const stop = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
    };

    const backdrop = document.createElement('div');
    backdrop.className = 'game-modal-backdrop';

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

    const heading = this.deps.createHeading(title, 2, {
      textAlign: 'center',
      marginBottom: '20px',
      flexShrink: '0',
    });

    const contentContainer = document.createElement('div');
    contentContainer.className = 'game-modal__content';

    // Security: always treat `message` as plain text (no HTML parsing).
    // Newlines are preserved via UIManager's `createText()` style.
    const text = this.deps.createText(message, {
      fontSize: '16px',
    });
    contentContainer.appendChild(text);

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'game-modal__buttons';

    buttons.forEach((btn) => {
      const button = this.deps.createButton(btn.text, () => {
        btn.onClick();
        this.deps.remove(modal);
        this.deps.remove(backdrop);
      }, { variant: btn.variant });
      buttonContainer.appendChild(button);
    });

    modal.appendChild(heading);
    modal.appendChild(contentContainer);
    modal.appendChild(buttonContainer);

    this.deps.append(backdrop);
    this.deps.append(modal);

    return modal;
  }

  public showCharacterModal(
    title: string,
    message: string,
    options: { portraitUrl: string; portraitAlt?: string; portraitSizePx?: number },
    buttons: { text: string; onClick: () => void; variant?: ButtonVariant }[]
  ): HTMLDivElement {
    const stop = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
    };

    const backdrop = document.createElement('div');
    backdrop.className = 'game-modal-backdrop';

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

    const headingRow = document.createElement('div');
    headingRow.className = 'game-modal__heading-row';

    const portrait = document.createElement('img');
    portrait.src = options.portraitUrl;
    portrait.alt = options.portraitAlt ?? '';
    const sizePx = options.portraitSizePx ?? 56;
    portrait.className = 'game-portrait';
    portrait.style.width = `${sizePx}px`;
    portrait.style.height = `${sizePx}px`;
    headingRow.appendChild(portrait);

    const heading = this.deps.createHeading(title, 2, {
      textAlign: 'center',
      marginBottom: '0',
      flexShrink: '0',
    });
    headingRow.appendChild(heading);

    const contentContainer = document.createElement('div');
    contentContainer.className = 'game-modal__content';

    // Security: always treat `message` as plain text (no HTML parsing).
    const text = this.deps.createText(message, {
      fontSize: '16px',
    });
    contentContainer.appendChild(text);

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'game-modal__buttons';

    buttons.forEach((btn) => {
      const button = this.deps.createButton(
        btn.text,
        () => {
          btn.onClick();
          this.deps.remove(modal);
          this.deps.remove(backdrop);
        },
        { variant: btn.variant }
      );
      buttonContainer.appendChild(button);
    });

    modal.appendChild(headingRow);
    modal.appendChild(contentContainer);
    modal.appendChild(buttonContainer);

    this.deps.append(backdrop);
    this.deps.append(modal);

    return modal;
  }
}
