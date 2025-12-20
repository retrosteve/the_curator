import { BaseGameScene } from './base-game-scene';
import { Car, calculateCarValue, getCarById } from '@/data/car-database';
import { Rival, getRivalById, calculateRivalInterest, getRivalBark, BarkTrigger } from '@/data/rival-database';
import { getCharacterPortraitUrlOrPlaceholder } from '@/assets/character-portraits';
import { RivalAI } from '@/systems/rival-ai';
import { GAME_CONFIG } from '@/config/game-config';
import { formatCurrency } from '@/utils/format';
import {
  createEncounterCenteredLayoutRoot,
  createEncounterActionsPanel,
  createEncounterLogPanel,
  type EncounterLogPanelApi,
  createEncounterTwoColGrid,
  disableEncounterActionButton,
  formatEncounterNeedLabel,
  ensureEncounterLayoutStyles,
} from '@/ui/internal/ui-encounter';
import { isPixelUIEnabled } from '@/ui/internal/ui-style';

type AuctionLogKind = 'system' | 'player' | 'rival' | 'auctioneer' | 'market' | 'warning' | 'error';

type AuctionLogEntry = {
  text: string;
  kind: AuctionLogKind;
  portraitUrl?: string;
  portraitAlt?: string;
  portraitSizePx?: number;
};

const AUCTIONEER_NAMES = [
  '"Fast Talkin\'" Fred Harvey',
  'Victoria "The Gavel" St Clair',
  'Barnaby "Old Timer" Brooks',
] as const;

const PLAYER_PORTRAIT_PLACEHOLDER_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="10" ry="10" fill="#222"/>
    <circle cx="32" cy="26" r="12" fill="#555"/>
    <path d="M14 58c2-12 10-18 18-18s16 6 18 18" fill="#555"/>
    <text x="32" y="38" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#ddd">YOU</text>
  </svg>`
)}`;

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

  private activeRivalBubble?: HTMLDivElement;
  private activeRivalBubbleText?: HTMLSpanElement;
  private activeRivalBubbleHideTimeoutId?: number;
  private activeRivalBubbleRemoveTimeoutId?: number;
  private lastRivalBarkText?: string;

  private activeAuctioneerBubble?: HTMLDivElement;
  private activeAuctioneerBubbleText?: HTMLSpanElement;
  private activeAuctioneerBubbleHideTimeoutId?: number;
  private activeAuctioneerBubbleRemoveTimeoutId?: number;
  private lastAuctioneerBarkText?: string;

  private rivalPortraitAnchor?: HTMLDivElement;
  private auctioneerPortraitAnchor?: HTMLDivElement;

  private pendingUIRefreshTimeoutId?: number;
  private pendingRivalBarkTimeoutId?: number;

  private logPanelApi?: EncounterLogPanelApi<AuctionLogKind>;

  private auctionLog: AuctionLogEntry[] = [];
  private lastPatienceToastBand: 'normal' | 'medium' | 'low' | 'critical' = 'normal';
  private hasAnyBids: boolean = false;

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

    this.activeRivalBubble = undefined;
    this.activeRivalBubbleText = undefined;
    this.activeRivalBubbleHideTimeoutId = undefined;
    this.activeRivalBubbleRemoveTimeoutId = undefined;
    this.lastRivalBarkText = undefined;

    this.activeAuctioneerBubble = undefined;
    this.activeAuctioneerBubbleText = undefined;
    this.activeAuctioneerBubbleHideTimeoutId = undefined;
    this.activeAuctioneerBubbleRemoveTimeoutId = undefined;
    this.lastAuctioneerBarkText = undefined;

    this.rivalPortraitAnchor = undefined;
    this.auctioneerPortraitAnchor = undefined;
    this.pendingUIRefreshTimeoutId = undefined;
    this.pendingRivalBarkTimeoutId = undefined;

    this.auctionLog = [];
    this.lastPatienceToastBand = 'normal';
    this.hasAnyBids = false;
  }

  create(): void {
    console.log('Auction Scene: Loaded');

    this.initializeManagers('auction');

    // Market-aware estimate (cache once for this auction to avoid UI drift).
    const baseValue = calculateCarValue(this.car);
    const marketInfo = this.gameManager.getCarMarketInfo(this.car.tags);
    this.auctionMarketEstimateValue = Math.floor(baseValue * marketInfo.modifier);

    // Market-aware starting bid (use the cached estimate).
    this.currentBid = Math.floor(this.auctionMarketEstimateValue * AuctionScene.STARTING_BID_MULTIPLIER);

    // Opening line + opening bid are logged via the first bark / first bid,
    // so they don't show up duplicated as system entries.

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

    // First bark after the UI exists so the bubble can anchor to the portrait.
    this.showAuctioneerBark('start');
    
    // Ensure cleanup on scene shutdown
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.clearPendingUIRefresh();
      this.clearPendingRivalBark();
      this.clearActiveRivalBubble();
      this.clearActiveAuctioneerBubble();
    });
  }

  private clearPendingUIRefresh(): void {
    if (this.pendingUIRefreshTimeoutId !== undefined) {
      window.clearTimeout(this.pendingUIRefreshTimeoutId);
      this.pendingUIRefreshTimeoutId = undefined;
    }
  }

  private clearPendingRivalBark(): void {
    if (this.pendingRivalBarkTimeoutId !== undefined) {
      window.clearTimeout(this.pendingRivalBarkTimeoutId);
      this.pendingRivalBarkTimeoutId = undefined;
    }
  }

  private showRivalBarkAfterAuctioneer(trigger: BarkTrigger, delayMs: number = 250): void {
    this.clearPendingRivalBark();
    this.pendingRivalBarkTimeoutId = window.setTimeout(() => {
      this.pendingRivalBarkTimeoutId = undefined;
      if (!this.scene.isActive()) return;
      this.showRivalBark(trigger);
    }, delayMs);
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

  private clearActiveAuctioneerBubble(): void {
    if (this.activeAuctioneerBubbleHideTimeoutId !== undefined) {
      clearTimeout(this.activeAuctioneerBubbleHideTimeoutId);
      this.activeAuctioneerBubbleHideTimeoutId = undefined;
    }
    if (this.activeAuctioneerBubbleRemoveTimeoutId !== undefined) {
      clearTimeout(this.activeAuctioneerBubbleRemoveTimeoutId);
      this.activeAuctioneerBubbleRemoveTimeoutId = undefined;
    }

    if (this.activeAuctioneerBubble && this.activeAuctioneerBubble.parentNode) {
      this.activeAuctioneerBubble.parentNode.removeChild(this.activeAuctioneerBubble);
    }
    this.activeAuctioneerBubble = undefined;
    this.activeAuctioneerBubbleText = undefined;
  }

  private restorePersistentBarks(): void {
    if (this.lastAuctioneerBarkText) {
      this.renderAuctioneerBarkText(this.lastAuctioneerBarkText, { suppressLog: true, animate: false });
    }
    if (this.lastRivalBarkText) {
      this.renderRivalBarkText(this.lastRivalBarkText, { suppressLog: true, animate: false });
    }
  }

  private getLogStyle(kind: AuctionLogKind): { color: string; fontWeight?: string } {
    switch (kind) {
      case 'player':
        return { color: '#4CAF50', fontWeight: 'bold' };
      case 'rival':
        return { color: '#ffd700', fontWeight: 'bold' };
      case 'auctioneer':
        return { color: '#ccc', fontWeight: 'bold' };
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
    // resetUIWithHUD() clears the entire overlay, so ensure any transient overlay-owned
    // elements (like the rival speech bubble) are cleared + references reset first.
    this.clearActiveRivalBubble();
    this.clearActiveAuctioneerBubble();
    this.rivalPortraitAnchor = undefined;
    this.auctioneerPortraitAnchor = undefined;
    this.logPanelApi = undefined;

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

    const participantStrip = document.createElement('div');
    Object.assign(participantStrip.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: '12px',
      margin: '0 0 12px 0',
      overflow: 'visible',
    } satisfies Partial<CSSStyleDeclaration>);

    const makePortraitAnchor = (url: string, alt: string): HTMLDivElement => {
      const anchor = document.createElement('div');
      Object.assign(anchor.style, {
        position: 'relative',
        width: '48px',
        height: '48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      } satisfies Partial<CSSStyleDeclaration>);

      const img = document.createElement('img');
      img.src = url;
      img.alt = alt;
      Object.assign(img.style, {
        width: '48px',
        height: '48px',
        display: 'block',
        margin: '0',
        objectFit: 'cover',
        boxSizing: 'border-box',
        borderRadius: isPixelUIEnabled() ? '0px' : '8px',
        border: '2px solid rgba(255,255,255,0.2)',
        backgroundColor: 'rgba(0,0,0,0.2)',
        imageRendering: isPixelUIEnabled() ? 'pixelated' : 'auto',
      } satisfies Partial<CSSStyleDeclaration>);

      anchor.appendChild(img);
      return anchor;
    };

    const makeParticipantColumn = (portrait: HTMLElement, label: string): HTMLDivElement => {
      const col = document.createElement('div');
      Object.assign(col.style, {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        flex: '1 1 0',
        minWidth: '0',
      } satisfies Partial<CSSStyleDeclaration>);
      col.appendChild(portrait);
      col.appendChild(
        this.uiManager.createText(label, {
          textAlign: 'center',
          fontWeight: 'bold',
          margin: '0',
          fontSize: '12px',
          color: '#ccc',
          lineHeight: '1.2',
          wordBreak: 'break-word',
        })
      );
      return col;
    };

    const auctioneerAnchor = makePortraitAnchor(
      getCharacterPortraitUrlOrPlaceholder(this.auctioneerName),
      `${this.auctioneerName} portrait`
    );
    this.auctioneerPortraitAnchor = auctioneerAnchor;
    participantStrip.appendChild(makeParticipantColumn(auctioneerAnchor, this.auctioneerName));

    const playerPortrait = makePortraitAnchor(PLAYER_PORTRAIT_PLACEHOLDER_URL, 'You');
    participantStrip.appendChild(makeParticipantColumn(playerPortrait, 'You'));

    const rivalAnchor = makePortraitAnchor(
      getCharacterPortraitUrlOrPlaceholder(this.rival.name),
      `${this.rival.name} portrait`
    );
    this.rivalPortraitAnchor = rivalAnchor;
    participantStrip.appendChild(makeParticipantColumn(rivalAnchor, this.rival.name));

    const rightPanel = createEncounterLogPanel(this.uiManager, {
      title: '',
      entries: this.auctionLog,
      getStyle: (kind) => this.getLogStyle(kind),
      maxEntries: 50,
      height: '520px',
      topContent: participantStrip,
      newestFirst: true,
      onReady: (api) => {
        this.logPanelApi = api;
      },
    });

    topGrid.appendChild(leftPanel);
    topGrid.appendChild(rightPanel);
    layoutRoot.appendChild(topGrid);

    // BOTTOM: actions + log
    const bottomGrid = createEncounterTwoColGrid('auction-layout__bottom');

    const { actionsPanel, buttonGrid, buttonTextStyle } = createEncounterActionsPanel(this.uiManager);

    const openingBidMode = !this.hasAnyBids;

    const bidBtn = this.uiManager.createButton(
      openingBidMode ? `Bid\n${formatCurrency(this.currentBid)}` : `Bid\n+${formatCurrency(AuctionScene.BID_INCREMENT)}`,
      () => this.playerBid(AuctionScene.BID_INCREMENT),
      { variant: 'primary', style: buttonTextStyle }
    );
    const bidTotal = openingBidMode ? this.currentBid : this.currentBid + AuctionScene.BID_INCREMENT;
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

    actionsPanel.style.gridColumn = '1 / -1';

    bottomGrid.appendChild(actionsPanel);
    layoutRoot.appendChild(bottomGrid);

    this.uiManager.append(layoutRoot);

    // Re-apply the last barks after any UI rebuild.
    this.restorePersistentBarks();
  }

  private appendAuctionLog(
    entry: string,
    kind: AuctionLogKind = 'system',
    options?: { portraitUrl?: string; portraitAlt?: string; portraitSizePx?: number }
  ): void {
    const trimmed = entry.trim();
    if (!trimmed) return;

    const portrait =
      options?.portraitUrl
        ? {
            portraitUrl: options.portraitUrl,
            portraitAlt: options.portraitAlt,
            portraitSizePx: options.portraitSizePx,
          }
        : kind === 'rival'
          ? {
              portraitUrl: getCharacterPortraitUrlOrPlaceholder(this.rival.name),
              portraitAlt: this.rival.name,
              portraitSizePx: 48,
            }
          : kind === 'auctioneer'
            ? {
                portraitUrl: getCharacterPortraitUrlOrPlaceholder(this.auctioneerName),
                portraitAlt: this.auctioneerName,
                portraitSizePx: 48,
              }
            : kind === 'player'
              ? {
                  portraitUrl: PLAYER_PORTRAIT_PLACEHOLDER_URL,
                  portraitAlt: 'You',
                  portraitSizePx: 48,
                }
              : undefined;

    const logEntry: AuctionLogEntry = {
      text: trimmed,
      kind,
      ...portrait,
    };

    this.auctionLog.push(logEntry);
    if (this.auctionLog.length > 50) {
      this.auctionLog.splice(0, this.auctionLog.length - 50);
    }

    // Incrementally render into the existing log panel (when available) so logs
    // don't batch-appear only after a full UI rebuild.
    this.logPanelApi?.appendEntry(logEntry);
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
      this.appendAuctionLog(logEntry, logKind, options);
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

  private renderRivalBarkText(trimmed: string, options?: { suppressLog?: boolean; animate?: boolean }): void {
    const text = trimmed.trim();
    if (!text) return;

    this.lastRivalBarkText = text;

    if (!options?.suppressLog) {
      // Mirror bubble dialogue into the auction log so players don't miss it.
      this.appendAuctionLog(`${this.rival.name}: “${text}”`, 'rival');
    }

    // Keep only one rival speech bubble visible at a time.
    // Note: the auction UI is periodically rebuilt via resetUIWithHUD(), which clears
    // the overlay and can orphan DOM nodes; if that happens, recreate the bubble.
    if (this.activeRivalBubble && !this.activeRivalBubble.isConnected) {
      this.clearActiveRivalBubble();
    }

    if (!this.activeRivalBubble) {
      const bubble = document.createElement('div');

      const anchoredToPortrait = this.rivalPortraitAnchor !== undefined;
      if (anchoredToPortrait) {
        bubble.style.cssText = `
          position: absolute;
          left: calc(100% + 16px);
          top: 50%;
          transform: translateX(12px) translateY(-50%);
          background: #fff;
          color: #000;
          padding: 10px 15px;
          border-radius: 15px;
          box-shadow: 0 4px 10px rgba(0,0,0,0.2);
          font-family: 'Comic Sans MS', 'Chalkboard SE', sans-serif;
          font-size: 14px;
          font-weight: bold;
          z-index: 100;
          opacity: 0;
          transition: opacity 0.3s ease, transform 0.3s ease;
          max-width: 260px;
          text-align: center;
          pointer-events: none;
          white-space: normal;
        `;
      } else {
        // Fallback (should be rare): use the old overlay positioning.
        bubble.style.cssText = `
          position: absolute;
          top: 30%;
          right: 25%;
          transform: translateX(50%);
          background: #fff;
          color: #000;
          padding: 10px 15px;
          border-radius: 15px;
          box-shadow: 0 4px 10px rgba(0,0,0,0.2);
          font-family: 'Comic Sans MS', 'Chalkboard SE', sans-serif;
          font-size: 14px;
          font-weight: bold;
          z-index: 100;
          opacity: 0;
          transition: opacity 0.3s ease, top 0.3s ease;
          max-width: 260px;
          text-align: center;
          pointer-events: none;
        `;
      }

      const messageSpan = document.createElement('span');
      bubble.appendChild(messageSpan);

      const tail = document.createElement('div');
      if (anchoredToPortrait) {
        tail.style.cssText = `
          position: absolute;
          left: -10px;
          top: 50%;
          transform: translateY(-50%);
          width: 0;
          height: 0;
          border-top: 10px solid transparent;
          border-bottom: 10px solid transparent;
          border-right: 10px solid #fff;
        `;
      } else {
        tail.style.cssText = `
          position: absolute;
          bottom: -8px;
          left: 0;
          width: 0;
          height: 0;
          border-left: 10px solid #fff;
          border-bottom: 10px solid transparent;
        `;
      }
      bubble.appendChild(tail);

      this.activeRivalBubble = bubble;
      this.activeRivalBubbleText = messageSpan;

      if (this.rivalPortraitAnchor) {
        this.rivalPortraitAnchor.appendChild(bubble);
      } else {
        this.uiManager.appendToOverlay(bubble);
      }
    }

    if (this.activeRivalBubbleText) {
      this.activeRivalBubbleText.textContent = text;
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

    const shouldAnimate = options?.animate ?? true;
    if (shouldAnimate) {
      bubble.style.opacity = '0';
      if (this.rivalPortraitAnchor) {
        bubble.style.transform = 'translateX(12px) translateY(-50%)';
        requestAnimationFrame(() => {
          bubble.style.opacity = '1';
          bubble.style.transform = 'translateX(0px) translateY(-50%)';
        });
      } else {
        bubble.style.top = '30%';
        requestAnimationFrame(() => {
          bubble.style.opacity = '1';
          bubble.style.top = '28%';
        });
      }
    } else {
      bubble.style.opacity = '1';
      if (this.rivalPortraitAnchor) {
        bubble.style.transform = 'translateX(0px) translateY(-50%)';
      } else {
        bubble.style.top = '28%';
      }
    }
  }

  private showRivalBark(trigger: BarkTrigger): void {
    const mood = this.rival.mood || 'Normal';
    const bark = getRivalBark(mood, trigger);
    const trimmed = bark.trim();
    if (!trimmed) return;

    this.renderRivalBarkText(trimmed);
  }

  private renderAuctioneerBarkText(trimmed: string, options?: { suppressLog?: boolean; animate?: boolean }): void {
    const text = trimmed.trim();
    if (!text) return;

    this.lastAuctioneerBarkText = text;

    if (!options?.suppressLog) {
      // Mirror bubble dialogue into the auction log so players don't miss it.
      this.appendAuctionLog(`${this.auctioneerName}: “${text}”`, 'auctioneer');
    }

    // Note: the auction UI is periodically rebuilt via resetUIWithHUD(), which clears
    // the overlay and can orphan DOM nodes; if that happens, recreate the bubble.
    if (this.activeAuctioneerBubble && !this.activeAuctioneerBubble.isConnected) {
      this.clearActiveAuctioneerBubble();
    }

    if (!this.activeAuctioneerBubble) {
      const bubble = document.createElement('div');

      const anchoredToPortrait = this.auctioneerPortraitAnchor !== undefined;
      if (anchoredToPortrait) {
        bubble.style.cssText = `
          position: absolute;
          left: calc(100% + 16px);
          top: 50%;
          transform: translateX(12px) translateY(-50%);
          background: #fff;
          color: #000;
          padding: 10px 15px;
          border-radius: 15px;
          box-shadow: 0 4px 10px rgba(0,0,0,0.2);
          font-family: 'Comic Sans MS', 'Chalkboard SE', sans-serif;
          font-size: 14px;
          font-weight: bold;
          z-index: 100;
          opacity: 0;
          transition: opacity 0.3s ease, transform 0.3s ease;
          max-width: 260px;
          text-align: center;
          pointer-events: none;
          white-space: normal;
        `;
      } else {
        bubble.style.cssText = `
          position: absolute;
          top: 24%;
          left: 25%;
          transform: translateX(-50%);
          background: #fff;
          color: #000;
          padding: 10px 15px;
          border-radius: 15px;
          box-shadow: 0 4px 10px rgba(0,0,0,0.2);
          font-family: 'Comic Sans MS', 'Chalkboard SE', sans-serif;
          font-size: 14px;
          font-weight: bold;
          z-index: 100;
          opacity: 0;
          transition: opacity 0.3s ease, top 0.3s ease;
          max-width: 260px;
          text-align: center;
          pointer-events: none;
        `;
      }

      const messageSpan = document.createElement('span');
      bubble.appendChild(messageSpan);

      const tail = document.createElement('div');
      if (anchoredToPortrait) {
        tail.style.cssText = `
          position: absolute;
          left: -10px;
          top: 50%;
          transform: translateY(-50%);
          width: 0;
          height: 0;
          border-top: 10px solid transparent;
          border-bottom: 10px solid transparent;
          border-right: 10px solid #fff;
        `;
      } else {
        tail.style.cssText = `
          position: absolute;
          bottom: -8px;
          right: 0;
          width: 0;
          height: 0;
          border-right: 10px solid #fff;
          border-bottom: 10px solid transparent;
        `;
      }
      bubble.appendChild(tail);

      this.activeAuctioneerBubble = bubble;
      this.activeAuctioneerBubbleText = messageSpan;

      if (this.auctioneerPortraitAnchor) {
        this.auctioneerPortraitAnchor.appendChild(bubble);
      } else {
        this.uiManager.appendToOverlay(bubble);
      }
    }

    if (this.activeAuctioneerBubbleText) {
      this.activeAuctioneerBubbleText.textContent = text;
    }

    if (this.activeAuctioneerBubbleHideTimeoutId !== undefined) {
      clearTimeout(this.activeAuctioneerBubbleHideTimeoutId);
      this.activeAuctioneerBubbleHideTimeoutId = undefined;
    }
    if (this.activeAuctioneerBubbleRemoveTimeoutId !== undefined) {
      clearTimeout(this.activeAuctioneerBubbleRemoveTimeoutId);
      this.activeAuctioneerBubbleRemoveTimeoutId = undefined;
    }

    const bubble = this.activeAuctioneerBubble;
    if (!bubble) return;

    const shouldAnimate = options?.animate ?? true;
    if (shouldAnimate) {
      bubble.style.opacity = '0';
      if (this.auctioneerPortraitAnchor) {
        bubble.style.transform = 'translateX(12px) translateY(-50%)';
        requestAnimationFrame(() => {
          bubble.style.opacity = '1';
          bubble.style.transform = 'translateX(0px) translateY(-50%)';
        });
      } else {
        bubble.style.top = '26%';
        requestAnimationFrame(() => {
          bubble.style.opacity = '1';
          bubble.style.top = '24%';
        });
      }
    } else {
      bubble.style.opacity = '1';
      if (this.auctioneerPortraitAnchor) {
        bubble.style.transform = 'translateX(0px) translateY(-50%)';
      } else {
        bubble.style.top = '24%';
      }
    }
  }

  private showAuctioneerBark(trigger: 'start' | 'player_bid' | 'player_power_bid' | 'rival_bid' | 'stall' | 'kick_tires' | 'end_player_win' | 'end_player_lose'): void {
    const pick = (lines: readonly string[]): string => lines[Math.floor(Math.random() * lines.length)] ?? '';

    let text = '';
    switch (trigger) {
      case 'start':
        text = 'Alright folks—let\'s get this started.';
        break;
      case 'player_bid':
        text = pick([
          `I have ${formatCurrency(this.currentBid)}! Do I hear ${formatCurrency(this.currentBid + AuctionScene.BID_INCREMENT)}?`,
          `New bid at ${formatCurrency(this.currentBid)}!`,
        ]);
        break;
      case 'player_power_bid':
        text = pick([
          `Big jump! ${formatCurrency(this.currentBid)} on the floor!`,
          `Power move—${formatCurrency(this.currentBid)}!`,
        ]);
        break;
      case 'rival_bid':
        text = pick([
          `We\'re at ${formatCurrency(this.currentBid)}!`,
          `Bid is ${formatCurrency(this.currentBid)}—who\'s next?`,
        ]);
        break;
      case 'stall':
        text = pick([
          'Going once…',
          'Going twice…',
          'Any other bidders?',
        ]);
        break;
      case 'kick_tires':
        text = pick([
          'Hey—no touching the merchandise.',
          'Careful with that—this isn\'t a showroom.',
        ]);
        break;
      case 'end_player_win':
        text = `Sold! To you for ${formatCurrency(this.currentBid)}.`;
        break;
      case 'end_player_lose':
        text = `Sold! To ${this.rival.name} for ${formatCurrency(this.currentBid)}.`;
        break;
      default:
        text = '';
        break;
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    this.renderAuctioneerBarkText(trimmed);
  }

  private playerBid(amount: number, options?: { power?: boolean }): void {
    const isFirstBid = !this.hasAnyBids;
    const openingBid = this.currentBid;
    const nextBid = this.currentBid + amount;

    const player = this.gameManager.getPlayerState();

    // Opening bid: first bid amount equals the opening price.
    if (isFirstBid) {
      if (player.money < openingBid) {
        this.showToastAndLog(
          'Not enough money to place the opening bid.',
          { backgroundColor: '#f44336' },
          `Not enough money to bid ${formatCurrency(openingBid)} (you have ${formatCurrency(player.money)}).`,
          'error'
        );
        return;
      }

      this.hasAnyBids = true;
      this.appendAuctionLog(`You: Opening bid → ${formatCurrency(openingBid)}.`, 'player');

      // If the player clicked Power Bid as their first action, treat it as:
      // opening bid (logged) + immediate power raise.
      if (options?.power) {
        if (player.money < nextBid) {
          this.showToastAndLog(
            'Not enough money to power bid that high.',
            { backgroundColor: '#f44336' },
            `Not enough money to bid ${formatCurrency(nextBid)} (you have ${formatCurrency(player.money)}).`,
            'error'
          );
          return;
        }

        this.currentBid = nextBid;
        this.showAuctioneerBark('player_power_bid');
        this.appendAuctionLog(`You: Power bid +${formatCurrency(amount)} → ${formatCurrency(this.currentBid)}.`, 'player');

        this.powerBidStreak++;
        this.rivalAI.onPlayerPowerBid();

        this.maybeToastPatienceWarning();

        // Check for patience reaction
        if (this.rivalAI.getPatience() < 30 && this.rivalAI.getPatience() > 0) {
          this.showRivalBarkAfterAuctioneer('patience_low');
        }

        if (this.rivalAI.getPatience() <= 0) {
          this.endAuction(true, `${this.rival.name} lost patience and quit!`);
          return;
        }
      } else {
        // Normal opening bid.
        this.showAuctioneerBark('player_bid');
        this.powerBidStreak = 0;
      }

      // Rival's turn
      this.rivalTurn();
      return;
    }

    if (player.money < nextBid) {
      this.showToastAndLog(
        'Not enough money to bid that high.',
        { backgroundColor: '#f44336' },
        `Not enough money to bid ${formatCurrency(nextBid)} (you have ${formatCurrency(player.money)}).`,
        'error'
      );
      return;
    }

    this.currentBid = nextBid;

    this.showAuctioneerBark(options?.power ? 'player_power_bid' : 'player_bid');

    if (options?.power) {
      this.appendAuctionLog(`You: Power bid +${formatCurrency(amount)} → ${formatCurrency(this.currentBid)}.`, 'player');
    } else {
      this.appendAuctionLog(`You: Bid +${formatCurrency(amount)} → ${formatCurrency(this.currentBid)}.`, 'player');
    }

    // Trigger rival reaction to being outbid
    if (!options?.power) {
      this.showRivalBarkAfterAuctioneer('outbid');
    }

    if (options?.power) {
      this.powerBidStreak++;
      this.rivalAI.onPlayerPowerBid();

      this.maybeToastPatienceWarning();
      
      // Check for patience reaction
      if (this.rivalAI.getPatience() < 30 && this.rivalAI.getPatience() > 0) {
        this.showRivalBarkAfterAuctioneer('patience_low');
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

    this.showAuctioneerBark('kick_tires');

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

    this.showAuctioneerBark('stall');

    this.appendAuctionLog(`You: Stall (-${AuctionScene.STALL_PATIENCE_PENALTY} rival patience).`, 'player');
    this.maybeToastPatienceWarning();
    
    // Check for patience reaction
    if (this.rivalAI.getPatience() < 30 && this.rivalAI.getPatience() > 0) {
      this.showRivalBarkAfterAuctioneer('patience_low');
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
      const isFirstBid = !this.hasAnyBids;
      if (isFirstBid) {
        this.hasAnyBids = true;
      } else {
        this.currentBid += decision.bidAmount;
      }

      this.showAuctioneerBark('rival_bid');
      
      // Show rival bark for bidding
      this.showRivalBarkAfterAuctioneer('bid');
      
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
      if (isFirstBid) {
        this.appendAuctionLog(
          `${this.rival.name}: Opening bid → ${formatCurrency(this.currentBid)}.${flavorInline ? ` ${flavorInline}` : ''}`,
          'rival'
        );
      } else {
        this.appendAuctionLog(
          `${this.rival.name}: Bid +${formatCurrency(decision.bidAmount)} → ${formatCurrency(this.currentBid)}.${flavorInline ? ` ${flavorInline}` : ''}`,
          'rival'
        );
      }

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
    this.clearPendingRivalBark();

    // Show final bark
    if (playerWon) {
      this.showAuctioneerBark('end_player_win');
      this.showRivalBarkAfterAuctioneer('lose'); // Rival lost
    } else {
      this.showAuctioneerBark('end_player_lose');
      this.showRivalBarkAfterAuctioneer('win'); // Rival won
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
