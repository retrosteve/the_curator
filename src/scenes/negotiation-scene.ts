import { BaseGameScene } from './base-game-scene';
import { Car, calculateCarValue } from '@/data/car-database';
import { GAME_CONFIG } from '@/config/game-config';
import { formatCurrency } from '@/utils/format';
import type { SpecialEvent } from '@/systems/special-events-system';
import {
  createEncounterCenteredLayoutRoot,
  createEncounterActionsPanel,
  createEncounterLogPanel,
  createEncounterTwoColGrid,
  disableEncounterActionButton,
  formatEncounterNeedLabel,
  ensureEncounterLayoutStyles,
} from '@/ui/internal/ui-encounter';

type NegotiationLogKind = 'system' | 'player' | 'seller' | 'warning' | 'error';

type NegotiationLogEntry = {
  text: string;
  kind: NegotiationLogKind;
};

/**
 * Negotiation Scene - PvE encounter with a seller.
 * Player can haggle to reduce the asking price.
 * Haggle attempts limited by Tongue skill level.
 * Eye skill reveals hidden car history.
 */
export class NegotiationScene extends BaseGameScene {
  private car!: Car;
  private specialEvent?: SpecialEvent;
  private locationId?: string;
  private encounterStarted: boolean = false;
  private askingPrice: number = 0;
  private lowestPrice: number = 0;
  private negotiationCount: number = 0;
  private hasAwardedInspectXP: boolean = false;
  private marketModifier: number = 1;
  private baseEstimatedValue: number = 0;
  private marketEstimatedValue: number = 0;
  private negotiationLog: NegotiationLogEntry[] = [];

  constructor() {
    super({ key: 'NegotiationScene' });
  }

  init(data: { car: Car; specialEvent?: SpecialEvent; locationId?: string }): void {
    this.car = data.car;
    this.specialEvent = data.specialEvent;
    this.locationId = data.locationId;
    this.encounterStarted = false;
    // Prices will be calculated in create() once managers are initialized (market system depends on day).
    this.askingPrice = 0;
    this.lowestPrice = 0;
    this.negotiationCount = 0;
    this.hasAwardedInspectXP = false;
    this.marketModifier = 1;
    this.baseEstimatedValue = 0;
    this.marketEstimatedValue = 0;
    this.negotiationLog = [];
  }

  create(): void {
    console.log('Negotiation Scene: Loaded');

    this.initializeManagers('negotiation');

    // Market-aware pricing.
    this.baseEstimatedValue = calculateCarValue(this.car);
    const marketInfo = this.gameManager.getCarMarketInfo(this.car.tags);
    this.marketModifier = marketInfo.modifier;
    this.marketEstimatedValue = Math.floor(this.baseEstimatedValue * this.marketModifier);

    // Seller starts asking for 120% of market-adjusted value.
    this.askingPrice = Math.floor(this.marketEstimatedValue * GAME_CONFIG.negotiation.askingPriceMultiplier);
    // Seller won't go below 90% of market-adjusted value.
    this.lowestPrice = Math.floor(this.marketEstimatedValue * GAME_CONFIG.negotiation.lowestPriceMultiplier);

    this.appendNegotiationLog(`Negotiation starts at ${formatCurrency(this.askingPrice)}.`, 'system');

    // Defensive guard: this scene should not start if the garage is already full.
    // Entry points (e.g., MapScene) should prevent this, but keep this to avoid bypasses.
    if (!this.gameManager.hasGarageSpace()) {
      this.uiManager.showModal(
        'Garage Full',
        'Your garage is full. Sell or scrap a car before negotiating another purchase.',
        [
          { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
          { text: 'Back to Map', onClick: () => this.scene.start('MapScene') },
        ]
      );
      return;
    }

    this.encounterStarted = true;

    // Greenish/Neutral background for negotiation
    this.setupBackground('NEGOTIATION', {
      topColor: 0x2c3e50,
      bottomColor: 0x27ae60,
    });
    this.setupCommonEventListeners();

    // Award Eye XP once per encounter (not on every UI refresh).
    this.awardInspectXPOnce();

    this.setupUI();

    // Tutorial trigger: advance from first_visit_scrapyard to first_inspect
    this.tutorialManager.onEnteredFirstScrapyardInspection();
  }

  private appendNegotiationLog(entry: string, kind: NegotiationLogKind = 'system'): void {
    const trimmed = entry.trim();
    if (!trimmed) return;
    this.negotiationLog.push({ text: trimmed, kind });
    if (this.negotiationLog.length > 50) {
      this.negotiationLog.splice(0, this.negotiationLog.length - 50);
    }
  }

  private getLogStyle(kind: NegotiationLogKind): { color: string; fontWeight?: string } {
    switch (kind) {
      case 'player':
        return { color: '#4CAF50', fontWeight: 'bold' };
      case 'seller':
        return { color: '#64b5f6', fontWeight: 'bold' };
      case 'error':
        return { color: '#f44336', fontWeight: 'bold' };
      case 'warning':
        return { color: '#ff9800' };
      case 'system':
      default:
        return { color: '#ccc' };
    }
  }


  private setupUI(): void {
    this.resetUIWithHUD();

    const player = this.gameManager.getPlayerState();

    // Minimal responsive layout tweaks for the negotiation UI.
    ensureEncounterLayoutStyles({
      styleId: 'negotiationLayoutStyles',
      rootClass: 'negotiation-layout',
      topClass: 'negotiation-layout__top',
      bottomClass: 'negotiation-layout__bottom',
    });

    const layoutRoot = createEncounterCenteredLayoutRoot('negotiation-layout');
    const topGrid = createEncounterTwoColGrid('negotiation-layout__top');

    // LEFT: car + your numbers
    const leftPanel = this.uiManager.createPanel({ padding: '18px' });
    const carPanel = this.uiManager.createCarInfoPanel(this.car, {
      showValue: false,
      titleColor: '#ffd700',
      style: {
        marginBottom: '12px',
      },
    });
    leftPanel.appendChild(carPanel);

    leftPanel.appendChild(
      this.uiManager.createText(`Estimated Value: ${formatCurrency(this.marketEstimatedValue)}`, {
        fontSize: '13px',
        color: '#ccc',
        textAlign: 'center',
        margin: '0 0 12px 0',
      })
    );

    leftPanel.appendChild(
      this.uiManager.createHeading(`Asking Price: ${formatCurrency(this.askingPrice)}`, 3, {
        textAlign: 'center',
        marginBottom: '10px',
        color: '#f1c40f',
      })
    );

    leftPanel.appendChild(
      this.uiManager.createText(`Your Money: ${formatCurrency(player.money)}`, {
        textAlign: 'center',
        margin: '0',
        fontWeight: 'bold',
      })
    );

    // Hidden details (Eye Skill)
    if (player.skills.eye >= 2 && this.car.history && this.car.history.length > 0) {
      leftPanel.appendChild(
        this.uiManager.createText(`History: ${this.car.history.join(', ')}`, {
          color: '#e74c3c',
          marginTop: '10px',
        })
      );
    }

    // RIGHT: seller / negotiation overview
    const rightPanel = this.uiManager.createPanel({ padding: '18px' });
    rightPanel.appendChild(
      this.uiManager.createHeading('Seller', 3, {
        textAlign: 'center',
        marginBottom: '10px',
        color: '#64b5f6',
      })
    );

    const maxNegotiations = player.skills.tongue;
    const negotiationsRemaining = Math.max(0, maxNegotiations - this.negotiationCount);
    rightPanel.appendChild(
      this.uiManager.createText(`Haggles left: ${negotiationsRemaining}`, {
        margin: '0 0 8px 0',
        fontWeight: 'bold',
        textAlign: 'center',
      })
    );

    if (this.specialEvent) {
      rightPanel.appendChild(
        this.uiManager.createText(`Special Event: ${this.specialEvent.name}`, {
          textAlign: 'center',
          fontWeight: 'bold',
          color: '#f39c12',
          margin: '0 0 6px 0',
        })
      );
      rightPanel.appendChild(
        this.uiManager.createText(this.specialEvent.description, {
          textAlign: 'center',
          color: '#bdc3c7',
          fontStyle: 'italic',
          margin: '0',
        })
      );
    }

    topGrid.appendChild(leftPanel);
    topGrid.appendChild(rightPanel);
    layoutRoot.appendChild(topGrid);

    // BOTTOM: actions + log
    const bottomGrid = createEncounterTwoColGrid('negotiation-layout__bottom');

    const { actionsPanel, buttonGrid, buttonTextStyle } = createEncounterActionsPanel(this.uiManager);

    const buyBtn = this.uiManager.createButton('Accept Offer', () => this.handleBuy(), {
      variant: 'success',
      style: buttonTextStyle,
    });
    buyBtn.dataset.tutorialTarget = 'negotiation.accept-offer';
    if (player.money < this.askingPrice) {
      disableEncounterActionButton(
        buyBtn,
        formatEncounterNeedLabel('Accept Offer', formatCurrency(this.askingPrice))
      );
    }
    buttonGrid.appendChild(buyBtn);

    const haggleBtn = this.uiManager.createButton(`Haggle\nTongue ${maxNegotiations} · Uses left: ${negotiationsRemaining}`, () => this.handleHaggle(), {
      variant: 'primary',
      style: buttonTextStyle,
    });
    if (this.askingPrice <= this.lowestPrice || negotiationsRemaining <= 0) {
      if (this.askingPrice <= this.lowestPrice) {
        disableEncounterActionButton(haggleBtn, 'Haggle\nBest price reached');
      } else {
        disableEncounterActionButton(haggleBtn, 'Haggle\nNo uses left');
      }
    }
    buttonGrid.appendChild(haggleBtn);

    const leaveBtn = this.uiManager.createButton('Leave', () => this.handleLeave(), {
      variant: 'danger',
      style: {
        ...buttonTextStyle,
        gridColumn: '1 / -1',
        textAlign: 'center',
      },
    });
    buttonGrid.appendChild(leaveBtn);

    actionsPanel.appendChild(buttonGrid);

    const logPanel = createEncounterLogPanel(this.uiManager, {
      entries: this.negotiationLog,
      getStyle: (kind) => this.getLogStyle(kind),
    });

    bottomGrid.appendChild(actionsPanel);
    bottomGrid.appendChild(logPanel);
    layoutRoot.appendChild(bottomGrid);

    this.uiManager.append(layoutRoot);
  }

  private handleHaggle(): void {
    const player = this.gameManager.getPlayerState();
    const maxNegotiations = player.skills.tongue; // Level 1 = 1 attempt, Level 5 = 5 attempts

    if (this.negotiationCount >= maxNegotiations) {
      this.uiManager.showModal(
        'No More Haggling',
        'The seller refuses to negotiate further.',
        [{ text: 'OK', onClick: () => {} }]
      );
      return;
    }

    this.negotiationCount++;

    this.appendNegotiationLog('You: Haggle.', 'player');
    
    // Award Tongue XP for haggling
    const tongueXPGain = GAME_CONFIG.player.skillProgression.xpGains.haggle;
    this.gameManager.addSkillXP('tongue', tongueXPGain);
    
    // Simple reduction logic
    const reduction = Math.floor(this.askingPrice * GAME_CONFIG.negotiation.haggleReductionRate);
    this.askingPrice = Math.max(this.lowestPrice, this.askingPrice - reduction);

    if (this.askingPrice <= this.lowestPrice) {
      this.appendNegotiationLog('Seller: That’s my lowest price.', 'seller');
    }

    this.setupUI();
  }

  private awardInspectXPOnce(): void {
    if (this.hasAwardedInspectXP) return;
    this.hasAwardedInspectXP = true;

    const eyeXPGain = GAME_CONFIG.player.skillProgression.xpGains.inspect;
    this.gameManager.addSkillXP('eye', eyeXPGain);
  }

  private handleBuy(): void {
    if (!this.gameManager.hasGarageSpace()) {
       // Check garage capacity
       this.uiManager.showGarageFullModal();
       return;
    }

    if (!this.gameManager.spendMoney(this.askingPrice)) {
      this.uiManager.showInsufficientFundsModal();
      this.appendNegotiationLog(`Error: Not enough money to pay ${formatCurrency(this.askingPrice)}.`, 'error');
      return;
    }

    if (!this.gameManager.addCar(this.car)) {
      this.uiManager.showGarageFullModal();
      // Refund the money since we couldn't add the car
      this.gameManager.addMoney(this.askingPrice);
      return;
    }

    this.appendNegotiationLog(`You: Bought ${this.car.name} for ${formatCurrency(this.askingPrice)}.`, 'player');

    if (this.locationId) {
      this.gameManager.consumeDailyCarOfferForLocation(this.locationId);
    }

    // Apply special event rewards
    let rewardMessage = '';
    if (this.specialEvent) {
      if (this.specialEvent.reward.moneyBonus) {
        this.gameManager.addMoney(this.specialEvent.reward.moneyBonus);
        rewardMessage += `\nBonus: +${formatCurrency(this.specialEvent.reward.moneyBonus)}`;
      }
      if (this.specialEvent.reward.prestigeBonus) {
        this.gameManager.addPrestige(this.specialEvent.reward.prestigeBonus);
        rewardMessage += `\nBonus: +${this.specialEvent.reward.prestigeBonus} Prestige`;
      }
    }

    this.uiManager.showModal(
      'Purchase Complete',
      `Purchased ${this.car.name} for ${formatCurrency(this.askingPrice)}!${rewardMessage}`,
      [{
        text: 'Continue',
        onClick: () => {
          // Tutorial trigger: first buy - show dialogue with callback before scene transition
          if (this.tutorialManager.isOnFirstInspectStep()) {
            this.tutorialManager.showDialogueWithCallback(
              'Uncle Ray',
              "Good purchase! You earned +10 Eye XP for inspecting that car. Hover over the skill bars in your garage to see what each level unlocks. Click 'Garage' to see your new car, then restore it to increase its value.",
              () => {
                this.tutorialManager.onFirstTutorialCarPurchased();
                this.handleLeave();
              }
            );
          } else {
            this.handleLeave();
          }
        }
      }]
    );
  }

  private handleLeave(): void {
    this.uiManager.clear();

    if (this.encounterStarted && this.locationId) {
      const isEarlyTutorialScrapyardAttempt =
        this.tutorialManager.isTutorialActive() &&
        this.locationId === 'scrapyard_1' &&
        this.tutorialManager.isInEarlyScrapyardBeatBeforePurchase();

      if (!isEarlyTutorialScrapyardAttempt) {
        this.gameManager.consumeDailyCarOfferForLocation(this.locationId);
      }
    }

    this.scene.start('MapScene');
  }
}
