import { BaseGameScene } from './base-game-scene';
import { Car, calculateCarValue, getCarById } from '@/data/car-database';
import { Rival, getTierName, getRivalById, calculateRivalInterest, getMoodModifiers, getRivalBark, BarkTrigger } from '@/data/rival-database';
import { getCharacterPortraitUrlOrPlaceholder } from '@/assets/character-portraits';
import { RivalAI } from '@/systems/rival-ai';
import { GAME_CONFIG } from '@/config/game-config';
import { formatCurrency } from '@/utils/format';
import {
  createEncounterCenteredLayoutRoot,
  createEncounterActionsPanel,
  createEncounterLogPanel,
  createEncounterTwoColGrid,
  disableEncounterActionButton,
  formatEncounterNeedLabel,
  ensureEncounterLayoutStyles,
} from '@/ui/internal/ui-encounter';
import { isPixelUIEnabled } from '@/ui/internal/ui-style';

type AuctionLogKind = 'system' | 'player' | 'rival' | 'market' | 'warning' | 'error';

type AuctionLogEntry = {
  text: string;
  kind: AuctionLogKind;
  portraitUrl?: string;
  portraitAlt?: string;
  portraitSizePx?: number;
};

const AUCTIONEER_NAMES = [
  '"Fast Talkin\'" Fred Harvey',
  'Victoria "The Gavel" Sterling',
  'Barnaby "Old Timer" Brooks',
] as const;

/**
 * Auction Scene - Turn-based bidding battle against a rival.
 * Player uses various tactics (bid, power bid, stall, kick tires) to win the car.
 * Rival patience and budget determine when they quit.
 */
export class AuctionScene extends BaseGameScene {
  private car!: Car;
  private rival!: Rival;
  private rivalAI!: RivalAI;
  private locationId?: string;
  private auctioneerName!: string;
  private encounterStarted: boolean = false;
  private currentBid: number = 0;
  private stallUsesThisAuction: number = 0;
  private powerBidStreak: number = 0;
  private auctionMarketEstimateValue: number = 0;
  private auctionMarketEstimateFactors: string[] = [];

  private activeRivalBubble?: HTMLDivElement;
  private activeRivalBubbleText?: HTMLSpanElement;
  private activeRivalBubbleHideTimeoutId?: number;
  private activeRivalBubbleRemoveTimeoutId?: number;

  private pendingUIRefreshTimeoutId?: number;

  private auctionLog: AuctionLogEntry[] = [];
  private lastPatienceToastBand: 'normal' | 'medium' | 'low' | 'critical' = 'normal';

  private static readonly STARTING_BID_MULTIPLIER = GAME_CONFIG.auction.startingBidMultiplier;
  private static readonly BID_INCREMENT = GAME_CONFIG.auction.bidIncrement;
  private static readonly POWER_BID_INCREMENT = GAME_CONFIG.auction.powerBidIncrement;
  private static readonly POWER_BID_PATIENCE_PENALTY = GAME_CONFIG.auction.powerBidPatiencePenalty;
  private static readonly STALL_PATIENCE_PENALTY = GAME_CONFIG.auction.stallPatiencePenalty;

  private static readonly KICK_TIRES_BUDGET_REDUCTION = GAME_CONFIG.auction.kickTires.rivalBudgetReduction;
  private static readonly REQUIRED_EYE_LEVEL_FOR_KICK_TIRES = GAME_CONFIG.auction.kickTires.requiredEyeLevel;

  private static readonly REQUIRED_TONGUE_LEVEL_FOR_STALL = GAME_CONFIG.auction.stall.requiredTongueLevel;

  constructor() {
    super({ key: 'AuctionScene' });
  }

  init(data: { car: Car; rival: Rival; interest: number; locationId?: string }): void {
    this.car = data.car;
    this.rival = data.rival;
    this.rivalAI = new RivalAI(data.rival, data.interest);
    this.locationId = data.locationId;
    this.auctioneerName = AUCTIONEER_NAMES[Math.floor(Math.random() * AUCTIONEER_NAMES.length)];
    this.encounterStarted = false;
    // Initialize with non-market value; we'll re-evaluate once managers are ready.
    this.currentBid = Math.floor(calculateCarValue(this.car) * AuctionScene.STARTING_BID_MULTIPLIER);
    this.stallUsesThisAuction = 0;
    this.powerBidStreak = 0;
    this.auctionMarketEstimateValue = 0;
    this.auctionMarketEstimateFactors = [];

    this.activeRivalBubble = undefined;
    this.activeRivalBubbleText = undefined;
    this.activeRivalBubbleHideTimeoutId = undefined;
    this.activeRivalBubbleRemoveTimeoutId = undefined;
    this.pendingUIRefreshTimeoutId = undefined;

    this.auctionLog = [];
    this.lastPatienceToastBand = 'normal';
  }

  create(): void {
    console.log('Auction Scene: Loaded');

    this.initializeManagers('auction');

    // Market-aware estimate (cache once for this auction to avoid UI drift).
    const baseValue = calculateCarValue(this.car);
    const marketInfo = this.gameManager.getCarMarketInfo(this.car.tags);
    this.auctionMarketEstimateFactors = marketInfo.factors;
    this.auctionMarketEstimateValue = Math.floor(baseValue * marketInfo.modifier);

    // Market-aware starting bid (use the cached estimate).
    this.currentBid = Math.floor(this.auctionMarketEstimateValue * AuctionScene.STARTING_BID_MULTIPLIER);

    this.logOnly(`${this.auctioneerName}: Alright folks—let’s get this started.`, 'system', {
      portraitUrl: getCharacterPortraitUrlOrPlaceholder(this.auctioneerName),
      portraitAlt: this.auctioneerName,
    });

    this.appendAuctionLog(`Auction opens at ${formatCurrency(this.currentBid)}.`, 'system');
    const marketLine = this.auctionMarketEstimateFactors.length > 0
      ? `Market: ${this.auctionMarketEstimateFactors.join(' | ')}`
      : 'Market: No active modifiers.';
    this.appendAuctionLog(marketLine, 'market');

    // Defensive guard: this scene should not start if the garage is already full.
    // Entry points (e.g., MapScene) should prevent this, but keep this to avoid bypasses.
    const player = this.gameManager.getPlayerState();
    if (!this.gameManager.hasGarageSpace()) {
      this.uiManager.showModal(
        'Garage Full',
        'Your garage is full. Sell or scrap a car before entering an auction.',
        [
          { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
          { text: 'Back to Map', onClick: () => this.scene.start('MapScene') },
        ]
      );
      return;
    }

    // Defensive guard: don't start an auction if the player can't even afford the opening bid.
    // Important: do NOT consume the daily offer in this case (player never meaningfully participated).
    if (player.money < this.currentBid) {
      this.uiManager.showModal(
        'Not Enough Money',
        `You can't afford the opening bid for this auction.

Opening bid: ${formatCurrency(this.currentBid)}
Your money: ${formatCurrency(player.money)}

Tip: Visit the Garage to sell something, then come back.`,
        [
          { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
          { text: 'Back to Map', onClick: () => this.scene.start('MapScene') },
        ]
      );
      return;
    }

    this.encounterStarted = true;

    this.setupBackground('AUCTION BATTLE!', {
      topColor: 0x8b0000,
      bottomColor: 0x4b0000,
      titleSize: '42px',
      titleColor: '#ffd700',
    });
    this.setupUI();
    this.setupCommonEventListeners();
    
    // Ensure cleanup on scene shutdown
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.clearPendingUIRefresh();
      this.clearActiveRivalBubble();
    });
  }

  private clearPendingUIRefresh(): void {
    if (this.pendingUIRefreshTimeoutId !== undefined) {
      window.clearTimeout(this.pendingUIRefreshTimeoutId);
      this.pendingUIRefreshTimeoutId = undefined;
    }
  }

  private clearActiveRivalBubble(): void {
    if (this.activeRivalBubbleHideTimeoutId !== undefined) {
      clearTimeout(this.activeRivalBubbleHideTimeoutId);
      this.activeRivalBubbleHideTimeoutId = undefined;
    }
    if (this.activeRivalBubbleRemoveTimeoutId !== undefined) {
      clearTimeout(this.activeRivalBubbleRemoveTimeoutId);
      this.activeRivalBubbleRemoveTimeoutId = undefined;
    }

    if (this.activeRivalBubble && this.activeRivalBubble.parentNode) {
      this.activeRivalBubble.parentNode.removeChild(this.activeRivalBubble);
    }
    this.activeRivalBubble = undefined;
    this.activeRivalBubbleText = undefined;
  }

  private getLogStyle(kind: AuctionLogKind): { color: string; fontWeight?: string } {
    switch (kind) {
      case 'player':
        return { color: '#4CAF50', fontWeight: 'bold' };
      case 'rival':
        return { color: '#ffd700', fontWeight: 'bold' };
      case 'market':
        return { color: '#FFC107' };
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

    // Minimal responsive layout tweaks for the auction UI.
    ensureEncounterLayoutStyles({
      styleId: 'auctionLayoutStyles',
      rootClass: 'auction-layout',
      topClass: 'auction-layout__top',
      bottomClass: 'auction-layout__bottom',
    });

    const layoutRoot = createEncounterCenteredLayoutRoot('auction-layout');
    const topGrid = createEncounterTwoColGrid('auction-layout__top');

    // LEFT: car + your numbers
    const leftPanel = this.uiManager.createPanel({ padding: '18px' });

    const marketValue = this.auctionMarketEstimateValue;

    const carPanel = this.uiManager.createCarInfoPanel(this.car, {
      showValue: false,
      titleColor: '#ffd700',
      style: {
        marginBottom: '12px',
      },
    });
    leftPanel.appendChild(carPanel);

    leftPanel.appendChild(
      this.uiManager.createText(
        `Estimated Value: ${formatCurrency(marketValue)}`,
        { fontSize: '13px', color: '#ccc', textAlign: 'center', margin: '0 0 12px 0' }
      )
    );

    leftPanel.appendChild(
      this.uiManager.createHeading(`Current Bid: ${formatCurrency(this.currentBid)}`, 3, {
        textAlign: 'center',
        marginBottom: '10px',
        color: '#4CAF50',
      })
    );

    leftPanel.appendChild(
      this.uiManager.createText(`Your Money: ${formatCurrency(player.money)}`, {
        textAlign: 'center',
        margin: '0',
        fontWeight: 'bold',
      })
    );

    // RIGHT: rival overview (no exact budget shown)
    const rightPanel = this.uiManager.createPanel({ padding: '18px' });

    rightPanel.appendChild(
      this.uiManager.createHeading('Rival', 3, {
        textAlign: 'center',
        marginBottom: '10px',
        color: '#ffd700',
      })
    );

    const portraitUrl = getCharacterPortraitUrlOrPlaceholder(this.rival.name);
    const portraitImg = document.createElement('img');
    portraitImg.src = portraitUrl;
    portraitImg.alt = `${this.rival.name} portrait`;
    Object.assign(portraitImg.style, {
      width: '72px',
      height: '72px',
      display: 'block',
      margin: '0 auto 10px auto',
      objectFit: 'cover',
      borderRadius: isPixelUIEnabled() ? '0px' : '10px',
      border: '2px solid rgba(255,255,255,0.2)',
      backgroundColor: 'rgba(0,0,0,0.2)',
      imageRendering: isPixelUIEnabled() ? 'pixelated' : 'auto',
    } as Partial<CSSStyleDeclaration>);
    rightPanel.appendChild(portraitImg);

    rightPanel.appendChild(
      this.uiManager.createText(this.rival.name, { textAlign: 'center', fontWeight: 'bold', margin: '0 0 4px 0' })
    );
    rightPanel.appendChild(
      this.uiManager.createText(`Tier: ${getTierName(this.rival.tier)}`, { textAlign: 'center', fontSize: '13px', color: '#ccc', margin: '0 0 10px 0' })
    );

    if (this.rival.mood && this.rival.mood !== 'Normal') {
      const moodInfo = getMoodModifiers(this.rival.mood);
      rightPanel.appendChild(
        this.uiManager.createText(moodInfo.description, {
          textAlign: 'center',
          fontSize: '13px',
          color: '#f39c12',
          fontStyle: 'italic',
          margin: '0 0 12px 0',
        })
      );
    }

    const patience = this.rivalAI.getPatience();
    const patiencePercent = Math.max(0, Math.min(100, patience));
    const thresholds = GAME_CONFIG.auction.patienceThresholds;
    let patienceColor = '#4CAF50';
    if (patience < thresholds.critical) patienceColor = '#f44336';
    else if (patience < thresholds.low) patienceColor = '#ff9800';
    else if (patience < thresholds.medium) patienceColor = '#FFC107';

    rightPanel.appendChild(
      this.uiManager.createText(`Patience: ${patience}/100`, {
        margin: '0 0 8px 0',
        fontWeight: 'bold',
        textAlign: 'center',
      })
    );

    // Patience progress bar
    const patienceBarContainer = document.createElement('div');
    Object.assign(patienceBarContainer.style, {
      width: '100%',
      height: '20px',
      backgroundColor: 'rgba(0,0,0,0.3)',
      borderRadius: '10px',
      overflow: 'hidden',
      marginBottom: '12px',
      border: '2px solid rgba(255,255,255,0.2)',
    });

    const patienceBarFill = document.createElement('div');
    Object.assign(patienceBarFill.style, {
      width: `${patiencePercent}%`,
      height: '100%',
      backgroundColor: patienceColor,
      transition: 'all 0.3s ease',
    });

    patienceBarContainer.appendChild(patienceBarFill);
    rightPanel.appendChild(patienceBarContainer);

    topGrid.appendChild(leftPanel);
    topGrid.appendChild(rightPanel);
    layoutRoot.appendChild(topGrid);

    // BOTTOM: actions + log
    const bottomGrid = createEncounterTwoColGrid('auction-layout__bottom');

    const { actionsPanel, buttonGrid, buttonTextStyle } = createEncounterActionsPanel(this.uiManager);

    const bidBtn = this.uiManager.createButton(
      `Bid\n+${formatCurrency(AuctionScene.BID_INCREMENT)}`,
      () => this.playerBid(AuctionScene.BID_INCREMENT),
      { variant: 'primary', style: buttonTextStyle }
    );
    const bidTotal = this.currentBid + AuctionScene.BID_INCREMENT;
    if (player.money < bidTotal) {
      disableEncounterActionButton(bidBtn, formatEncounterNeedLabel('Bid', formatCurrency(bidTotal)));
    }
    buttonGrid.appendChild(bidBtn);

    const powerBidBtn = this.uiManager.createButton(
      `Power Bid\n+${formatCurrency(AuctionScene.POWER_BID_INCREMENT)} · Patience -${AuctionScene.POWER_BID_PATIENCE_PENALTY}`,
      () => this.playerBid(AuctionScene.POWER_BID_INCREMENT, { power: true }),
      { variant: 'warning', style: buttonTextStyle }
    );
    powerBidBtn.dataset.tutorialTarget = 'auction.power-bid';
    const powerBidTotal = this.currentBid + AuctionScene.POWER_BID_INCREMENT;
    if (player.money < powerBidTotal) {
      disableEncounterActionButton(
        powerBidBtn,
        formatEncounterNeedLabel('Power Bid', formatCurrency(powerBidTotal))
      );
    }
    buttonGrid.appendChild(powerBidBtn);

    const kickTiresBtn = this.uiManager.createButton(
      `Kick Tires\nEye ${AuctionScene.REQUIRED_EYE_LEVEL_FOR_KICK_TIRES}+ · Budget -${formatCurrency(AuctionScene.KICK_TIRES_BUDGET_REDUCTION)}`,
      () => this.playerKickTires(),
      { variant: 'info', style: buttonTextStyle }
    );
    if (player.skills.eye < AuctionScene.REQUIRED_EYE_LEVEL_FOR_KICK_TIRES) {
      disableEncounterActionButton(
        kickTiresBtn,
        `Kick Tires\nRequires Eye ${AuctionScene.REQUIRED_EYE_LEVEL_FOR_KICK_TIRES}+`
      );
    }
    buttonGrid.appendChild(kickTiresBtn);

    const maxStalls = player.skills.tongue;
    const stallsRemaining = Math.max(0, maxStalls - this.stallUsesThisAuction);
    const stallBtn = this.uiManager.createButton(
      `Stall\nTongue ${AuctionScene.REQUIRED_TONGUE_LEVEL_FOR_STALL}+ · Uses left: ${stallsRemaining}`,
      () => this.playerStall(),
      { variant: 'special', style: buttonTextStyle }
    );
    if (player.skills.tongue < AuctionScene.REQUIRED_TONGUE_LEVEL_FOR_STALL || stallsRemaining <= 0) {
      if (player.skills.tongue < AuctionScene.REQUIRED_TONGUE_LEVEL_FOR_STALL) {
        disableEncounterActionButton(
          stallBtn,
          `Stall\nRequires Tongue ${AuctionScene.REQUIRED_TONGUE_LEVEL_FOR_STALL}+`
        );
      } else {
        disableEncounterActionButton(stallBtn, 'Stall\nNo uses left');
      }
    }
    buttonGrid.appendChild(stallBtn);

    const quitBtn = this.uiManager.createButton('Quit Auction', () => this.playerQuit(), {
      variant: 'danger',
      style: {
        ...buttonTextStyle,
        gridColumn: '1 / -1',
        textAlign: 'center',
      },
    });
    buttonGrid.appendChild(quitBtn);

    actionsPanel.appendChild(buttonGrid);

    const logPanel = createEncounterLogPanel(this.uiManager, {
      entries: this.auctionLog,
      getStyle: (kind) => this.getLogStyle(kind),
    });

    bottomGrid.appendChild(actionsPanel);
    bottomGrid.appendChild(logPanel);
    layoutRoot.appendChild(bottomGrid);

    this.uiManager.append(layoutRoot);
  }

  private appendAuctionLog(entry: string, kind: AuctionLogKind = 'system'): void {
    const trimmed = entry.trim();
    if (!trimmed) return;

    const rivalPortrait = kind === 'rival'
      ? {
          portraitUrl: getCharacterPortraitUrlOrPlaceholder(this.rival.name),
          portraitAlt: this.rival.name,
        }
      : undefined;

    this.auctionLog.push({
      text: trimmed,
      kind,
      ...rivalPortrait,
    });
    if (this.auctionLog.length > 50) {
      this.auctionLog.splice(0, this.auctionLog.length - 50);
    }
  }

  private showToastAndLog(
    toast: string,
    options?: { backgroundColor?: string; durationMs?: number },
    log?: string,
    logKind: AuctionLogKind = 'warning'
  ): void {
    let logEntry = (log ?? toast).trim();
    // Ensure non-speech lines still get the prefix-based coloring.
    if (logEntry && !logEntry.includes(':')) {
      if (logKind === 'error') logEntry = `Error: ${logEntry}`;
      else if (logKind === 'warning') logEntry = `Warning: ${logEntry}`;
    }
    if (logEntry) {
      const last = this.auctionLog.length > 0 ? this.auctionLog[this.auctionLog.length - 1] : undefined;
      if (!last || last.text !== logEntry) {
        this.appendAuctionLog(logEntry, logKind);
      }
    }

    this.uiManager.showToast(toast, options);
  }

  private logOnly(
    entry: string,
    logKind: AuctionLogKind = 'warning',
    options?: { portraitUrl?: string; portraitAlt?: string; portraitSizePx?: number }
  ): void {
    let logEntry = entry.trim();
    if (!logEntry) return;

    // Ensure non-speech lines still get the prefix-based coloring.
    if (!logEntry.includes(':')) {
      if (logKind === 'error') logEntry = `Error: ${logEntry}`;
      else if (logKind === 'warning') logEntry = `Warning: ${logEntry}`;
    }

    const last = this.auctionLog.length > 0 ? this.auctionLog[this.auctionLog.length - 1] : undefined;
    if (!last || last.text !== logEntry) {
      const trimmed = logEntry.trim();
      if (!trimmed) return;
      this.auctionLog.push({
        text: trimmed,
        kind: logKind,
        portraitUrl: options?.portraitUrl,
        portraitAlt: options?.portraitAlt,
        portraitSizePx: options?.portraitSizePx,
      });
      if (this.auctionLog.length > 50) {
        this.auctionLog.splice(0, this.auctionLog.length - 50);
      }
    }
  }

  private maybeToastPatienceWarning(): void {
    const patience = this.rivalAI.getPatience();
    if (patience <= 0) return;

    const thresholds = GAME_CONFIG.auction.patienceThresholds;
    if (patience < thresholds.critical) {
      if (this.lastPatienceToastBand !== 'critical') {
        this.lastPatienceToastBand = 'critical';
        // Rival-related notifications should live in the auction log only.
        this.logOnly('Warning: Rival is about to quit!', 'warning', {
          portraitUrl: getCharacterPortraitUrlOrPlaceholder(this.rival.name),
          portraitAlt: this.rival.name,
        });
      }
      return;
    }

    if (patience < thresholds.low) {
      if (this.lastPatienceToastBand === 'normal' || this.lastPatienceToastBand === 'medium') {
        this.lastPatienceToastBand = 'low';
        // Rival-related notifications should live in the auction log only.
        this.logOnly('Rival is getting impatient…', 'warning', {
          portraitUrl: getCharacterPortraitUrlOrPlaceholder(this.rival.name),
          portraitAlt: this.rival.name,
        });
      }
      return;
    }

    if (patience < thresholds.medium) {
      if (this.lastPatienceToastBand === 'normal') {
        this.lastPatienceToastBand = 'medium';
        // Rival-related notifications should live in the auction log only.
        this.logOnly('Rival looks annoyed.', 'warning', {
          portraitUrl: getCharacterPortraitUrlOrPlaceholder(this.rival.name),
          portraitAlt: this.rival.name,
        });
      }
    }
  }

  private showRivalBark(trigger: BarkTrigger): void {
    const mood = this.rival.mood || 'Normal';
    const text = getRivalBark(mood, trigger);

    const trimmed = text.trim();
    if (!trimmed) return;

    // Mirror bubble dialogue into the auction log so players don't miss it.
    this.appendAuctionLog(`${this.rival.name}: “${trimmed}”`, 'rival');

    // Keep only one rival speech bubble visible at a time.
    if (!this.activeRivalBubble) {
      const bubble = document.createElement('div');
      bubble.style.cssText = `
        position: absolute;
        top: 30%;
        right: 25%;
        transform: translateX(50%);
        background: #fff;
        color: #000;
        padding: 10px 15px;
        border-radius: 15px;
        border-bottom-left-radius: 0;
        box-shadow: 0 4px 10px rgba(0,0,0,0.2);
        font-family: 'Comic Sans MS', 'Chalkboard SE', sans-serif;
        font-size: 14px;
        font-weight: bold;
        z-index: 100;
        opacity: 0;
        transition: opacity 0.3s ease, top 0.3s ease;
        max-width: 200px;
        text-align: center;
        pointer-events: none;
      `;

      const messageSpan = document.createElement('span');
      bubble.appendChild(messageSpan);

      const tail = document.createElement('div');
      tail.style.cssText = `
        position: absolute;
        bottom: -8px;
        left: 0;
        width: 0;
        height: 0;
        border-left: 10px solid #fff;
        border-bottom: 10px solid transparent;
      `;
      bubble.appendChild(tail);

      this.activeRivalBubble = bubble;
      this.activeRivalBubbleText = messageSpan;
      this.uiManager.appendToOverlay(bubble);
    }

    if (this.activeRivalBubbleText) {
      this.activeRivalBubbleText.textContent = trimmed;
    }

    if (this.activeRivalBubbleHideTimeoutId !== undefined) {
      clearTimeout(this.activeRivalBubbleHideTimeoutId);
      this.activeRivalBubbleHideTimeoutId = undefined;
    }
    if (this.activeRivalBubbleRemoveTimeoutId !== undefined) {
      clearTimeout(this.activeRivalBubbleRemoveTimeoutId);
      this.activeRivalBubbleRemoveTimeoutId = undefined;
    }

    const bubble = this.activeRivalBubble;
    if (!bubble) return;

    bubble.style.opacity = '0';
    bubble.style.top = '30%';
    requestAnimationFrame(() => {
      bubble.style.opacity = '1';
      bubble.style.top = '28%';
    });

    this.activeRivalBubbleHideTimeoutId = window.setTimeout(() => {
      bubble.style.opacity = '0';
      this.activeRivalBubbleRemoveTimeoutId = window.setTimeout(() => {
        this.clearActiveRivalBubble();
      }, 300);
    }, 3000);
  }

  private playerBid(amount: number, options?: { power?: boolean }): void {
    const newBid = this.currentBid + amount;

    const player = this.gameManager.getPlayerState();

    if (player.money < newBid) {
      this.showToastAndLog(
        'Not enough money to bid that high.',
        { backgroundColor: '#f44336' },
        `Not enough money to bid ${formatCurrency(newBid)} (you have ${formatCurrency(player.money)}).`,
        'error'
      );
      return;
    }

    this.currentBid = newBid;

    if (options?.power) {
      this.appendAuctionLog(`You: Power bid +${formatCurrency(amount)} → ${formatCurrency(this.currentBid)}.`, 'player');
    } else {
      this.appendAuctionLog(`You: Bid +${formatCurrency(amount)} → ${formatCurrency(this.currentBid)}.`, 'player');
    }

    // Trigger rival reaction to being outbid
    if (!options?.power) {
      this.showRivalBark('outbid');
    }

    if (options?.power) {
      this.powerBidStreak++;
      this.rivalAI.onPlayerPowerBid();

      this.maybeToastPatienceWarning();
      
      // Check for patience reaction
      if (this.rivalAI.getPatience() < 30 && this.rivalAI.getPatience() > 0) {
        this.showRivalBark('patience_low');
      }

      if (this.rivalAI.getPatience() <= 0) {
        this.endAuction(true, `${this.rival.name} lost patience and quit!`);
        return;
      }
    } else {
      this.powerBidStreak = 0; // Reset streak on normal bid
    }

    // Rival's turn
    this.rivalTurn();
  }

  private playerKickTires(): void {
    const player = this.gameManager.getPlayerState();
    if (player.skills.eye < AuctionScene.REQUIRED_EYE_LEVEL_FOR_KICK_TIRES) {
      this.showToastAndLog(
        `Requires Eye ${AuctionScene.REQUIRED_EYE_LEVEL_FOR_KICK_TIRES}+ to Kick Tires.`,
        { backgroundColor: '#f44336' },
        `Kick Tires blocked: requires Eye ${AuctionScene.REQUIRED_EYE_LEVEL_FOR_KICK_TIRES}+ (you have Eye ${player.skills.eye}).`,
        'error'
      );
      return;
    }

    this.powerBidStreak = 0; // Reset streak
    this.rivalAI.onPlayerKickTires(AuctionScene.KICK_TIRES_BUDGET_REDUCTION);

    this.appendAuctionLog(`You: Kick tires (pressure applied; they look less willing to spend).`, 'player');

    if (this.currentBid > this.rivalAI.getBudget()) {
      this.endAuction(true, `${this.rival.name} is out of budget and quits!`);
      return;
    }

    // Rival's turn
    this.rivalTurn();
  }

  private playerStall(): void {
    const player = this.gameManager.getPlayerState();
    const tongue = player.skills.tongue;
    if (tongue < AuctionScene.REQUIRED_TONGUE_LEVEL_FOR_STALL) {
      this.showToastAndLog(
        `Requires Tongue ${AuctionScene.REQUIRED_TONGUE_LEVEL_FOR_STALL}+ to Stall.`,
        { backgroundColor: '#f44336' },
        `Stall blocked: requires Tongue ${AuctionScene.REQUIRED_TONGUE_LEVEL_FOR_STALL}+ (you have Tongue ${tongue}).`,
        'error'
      );
      return;
    }

    if (this.stallUsesThisAuction >= tongue) {
      this.showToastAndLog(
        'No Stall uses left this auction.',
        { backgroundColor: '#ff9800' },
        `No Stall uses left (${this.stallUsesThisAuction}/${tongue}).`,
        'warning'
      );
      return;
    }

    this.stallUsesThisAuction += 1;
    this.powerBidStreak = 0; // Reset streak
    this.rivalAI.onPlayerStall();

    this.appendAuctionLog(`You: Stall (-${AuctionScene.STALL_PATIENCE_PENALTY} rival patience).`, 'player');
    this.maybeToastPatienceWarning();
    
    // Check for patience reaction
    if (this.rivalAI.getPatience() < 30 && this.rivalAI.getPatience() > 0) {
      this.showRivalBark('patience_low');
    }
    
    if (this.rivalAI.getPatience() <= 0) {
      this.endAuction(true, `${this.rival.name} lost patience and quit!`);
    } else {
      // Stalling pressures the rival but hands them the turn.
      this.rivalTurn();
    }
  }

  private playerQuit(): void {
    this.clearPendingUIRefresh();
    this.consumeOfferIfNeeded();
    this.endAuction(false, 'You quit the auction.');
  }

  private consumeOfferIfNeeded(): void {
    if (!this.encounterStarted) return;
    if (this.locationId) {
      this.gameManager.consumeDailyCarOfferForLocation(this.locationId);
    }
  }

  private rivalTurn(): void {
    const decision = this.rivalAI.decideBid(this.currentBid);

    if (!decision.shouldBid) {
      this.appendAuctionLog(`${this.rival.name}: ${decision.reason}.`, 'rival');
      this.endAuction(true, `${this.rival.name} ${decision.reason}!`);
    } else {
      this.currentBid += decision.bidAmount;
      
      // Show rival bark for bidding
      this.showRivalBark('bid');
      
      // Add flavor text based on rival's patience level
      const patience = this.rivalAI.getPatience();
      let flavorText = '';
      
      if (patience < 20) {
        flavorText = '\n\nFinal offer!';
      } else if (patience < 30) {
        flavorText = '\n\nGetting tired of this...';
      } else if (patience < 50) {
        flavorText = '\n\nYou\'re really pushing it.';
      }

      const flavorInline = flavorText.replace(/\n+/g, ' ').trim();
      this.appendAuctionLog(
        `${this.rival.name}: Bid +${formatCurrency(decision.bidAmount)} → ${formatCurrency(this.currentBid)}.${flavorInline ? ` ${flavorInline}` : ''}`,
        'rival'
      );

      // Non-blocking update: refresh UI and keep momentum.
      // Track and clear this timeout to avoid:
      // - wiping modals via UIManager.clear() after the auction ends
      // - updating UI after scene shutdown
      this.clearPendingUIRefresh();
      this.pendingUIRefreshTimeoutId = window.setTimeout(() => {
        // Scene may have transitioned; don't update UI if we're not active.
        if (!this.scene.isActive()) return;
        this.setupUI();
        this.pendingUIRefreshTimeoutId = undefined;
      }, GAME_CONFIG.ui.modalDelays.rivalBid);
    }
  }

  private endAuction(playerWon: boolean, message: string): void {
    // Prevent any scheduled UI refresh from wiping the final result modal.
    this.clearPendingUIRefresh();

    // Show final bark
    if (playerWon) {
      this.showRivalBark('lose'); // Rival lost
    } else {
      this.showRivalBark('win'); // Rival won
    }

    if (playerWon) {
      const player = this.gameManager.getPlayerState();

      // Important edge-case: the rival can outbid you, then quit due to tactics (Kick Tires / Stall)
      // leaving the winning bid above your available money.
      if (player.money < this.currentBid) {
        this.consumeOfferIfNeeded();
        this.uiManager.showModal(
          "Won But Can't Pay",
          `${message}\n\nYou pressured ${this.rival.name} into quitting, but the winning bid is ${formatCurrency(this.currentBid)} and you only have ${formatCurrency(player.money)}.\n\nYou forfeit the car.`,
          [
            {
              text: 'Back to Map',
              onClick: () => this.scene.start('MapScene'),
            },
          ]
        );
        return;
      }

      if (this.gameManager.spendMoney(this.currentBid)) {
        if (!this.gameManager.addCar(this.car)) {
          // Garage is full
          this.uiManager.showModal(
            'Garage Full!',
            `You won the auction, but your garage is full!\n\nYou are forced to forfeit the car.`,
            [
              {
                text: 'Continue',
                onClick: () => this.scene.start('MapScene'),
              },
            ]
          );
          // Refund the money since we couldn't add the car
          this.gameManager.addMoney(this.currentBid);

          // The car is forfeited; treat this location as exhausted today.
          this.consumeOfferIfNeeded();
          return;
        }

        // Winning (and acquiring) exhausts the location's daily offer.
        this.consumeOfferIfNeeded();
        
        // Award Tongue XP for winning an auction
        const tongueXPGain = GAME_CONFIG.player.skillProgression.xpGains.auction;
        const leveledUp = this.gameManager.addSkillXP('tongue', tongueXPGain);
        // XP toast + level-up celebration are handled by BaseGameScene via eventBus.
        
        // Tutorial: Show completion message AFTER auction win modal is dismissed
        let isTutorialComplete = false;
        try {
          isTutorialComplete = this.tutorialManager.isOnRedemptionStep();
        } catch (error) {
          console.error('Tutorial error checking completion:', error);
        }
        
        this.uiManager.showModal(
          'You Won!',
          `${message}\n\nYou bought ${this.car.name} for ${formatCurrency(this.currentBid)}!${leveledUp ? '\n\n🎉 Your Tongue skill leveled up!' : ''}`,
          [
            {
              text: 'Continue',
              onClick: () => {
                if (isTutorialComplete) {
                  // Show tutorial completion dialogue before returning to map
                  this.tutorialManager.showDialogueWithCallback(
                    "Uncle Ray",
                    "🎉 Congratulations! 🎉\n\nYou've mastered the basics of car collecting:\n• Inspecting cars with your Eye skill\n• Restoring cars to increase value\n• Bidding strategically in auctions\n• Reading rival behavior\n\nNow go build the world's greatest car collection! Remember: every car tells a story, and you're the curator.",
                    () => {
                      this.tutorialManager.onTutorialCompleted();
                      this.scene.start('MapScene');
                    }
                  );
                } else {
                  this.scene.start('MapScene');
                }
              },
            },
          ]
        );
      }
    } else {
      // Leaving/losing also exhausts the location's daily offer (stricter anti-fishing).
      this.consumeOfferIfNeeded();
      // Tutorial: After losing to Sterling Vance, immediately encounter Scrapyard Joe at the same sale
      try {
        if (this.tutorialManager.isOnFirstLossStep()) {
          // Uncle Ray spots another opportunity - show dialogue then start second auction
          this.tutorialManager.showDialogueWithCallback(
            "Uncle Ray",
            "Don't let that loss get you down! Look - there's another car here nobody else noticed: a Boxy Wagon. This time you're facing a weaker rival. Use aggressive tactics like Power Bid to make them quit early!",
            () => {
              this.tutorialManager.onRedemptionPromptAccepted();
              const boxywagon = getCarById('car_tutorial_boxy_wagon');
              const scrappyJoe = getRivalById('scrapyard_joe');
              if (boxywagon && scrappyJoe) {
                const interest = calculateRivalInterest(scrappyJoe, boxywagon.tags);
                this.scene.start('AuctionScene', { car: boxywagon, rival: scrappyJoe, interest });
              }
            }
          );
          return;
        }
      } catch (error) {
        console.error('Tutorial error in redemption flow:', error);
        // Continue with normal loss flow
      }
      
      // Normal loss flow
      try {
        if (this.tutorialManager.isOnRedemptionStep()) {
          this.tutorialManager.showDialogueWithCallback(
            'Uncle Ray',
            'No worries—redemption means we keep coming back until we win. Head back to the Weekend Auction House and we\'ll run it again.',
            () => this.scene.start('MapScene')
          );
          return;
        }
      } catch (error) {
        console.error('Tutorial error in redemption loss flow:', error);
        // Continue with normal loss flow
      }

      this.uiManager.showModal(
        'Auction Lost',
        message,
        [
          {
            text: 'See Analysis',
            onClick: () => this.showAuctionDebrief(),
          },
          {
            text: 'Continue',
            onClick: () => this.scene.start('MapScene'),
          },
        ]
      );
    }
  }

  /**
   * Show detailed auction debrief with tactical analysis.
   * Helps player understand what happened and learn tactics.
   */
  private showAuctionDebrief(): void {
    const patience = this.rivalAI.getPatience();
    const budget = this.rivalAI.getBudget();
    const player = this.gameManager.getPlayerState();

    let analysis = `📈 AUCTION ANALYSIS\n\n`;
    analysis += `YOUR BID: ${formatCurrency(this.currentBid)}\n`;
    analysis += `RIVAL BID: Won the auction\n\n`;
    
    analysis += `👤 RIVAL STATUS:\n`;
    analysis += `• Patience Remaining: ${patience}/100\n`;
    analysis += `• Budget Remaining: ${formatCurrency(budget)}\n\n`;
    
    // Tactical hints based on situation
    analysis += `💡 TACTICAL INSIGHTS:\n`;
    
    if (patience > 50) {
      analysis += `• Rival had high patience (${patience}%) - they were determined\n`;
      analysis += `• Try 'Power Bid' or 'Stall' to drain patience faster\n`;
    } else if (patience > 20) {
      analysis += `• Rival was getting impatient (${patience}%) - you were close!\n`;
      analysis += `• One more 'Stall' might have made them quit\n`;
    } else {
      analysis += `• Rival was nearly broken (${patience}% patience) - so close!\n`;
      analysis += `• They were about to quit - you almost had them\n`;
    }
    
    if (budget < this.currentBid * 1.5) {
      analysis += `• Rival's budget was limited (${formatCurrency(budget)} left)\n`;
      if (player.skills.eye >= 3) {
        analysis += `• 'Kick Tires' could have forced them out of budget\n`;
      } else {
        analysis += `• Eye skill Lvl 3+ unlocks 'Kick Tires' to attack budget\n`;
      }
    }
    
    if (this.stallUsesThisAuction === 0 && player.skills.tongue >= 3) {
      analysis += `• You didn't use 'Stall' - it drains ${GAME_CONFIG.auction.stallPatiencePenalty} patience\n`;
    }
    
    analysis += `\n🔄 WHAT'S NEXT:\n`;
    analysis += `• Return to map to find more opportunities\n`;
    analysis += `• Each loss teaches you rival behavior\n`;
    analysis += `• Level up skills to unlock new tactics`;

    this.uiManager.showModal(
      '📊 Auction Debrief',
      analysis,
      [
        {
          text: 'Back to Map',
          onClick: () => this.scene.start('MapScene'),
        },
      ]
    );
  }

}
