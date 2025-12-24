import { debugLog, errorLog } from '@/utils/log';
import { BaseGameScene } from './base-game-scene';
import { Car, calculateCarValue, getCarById } from '@/data/car-database';
import { Rival, getRivalById, calculateRivalInterest, BarkTrigger, getRivalBark } from '@/data/rival-database';
import { BASE_LOCATIONS } from '@/data/location-database';
import { getCharacterPortraitUrlOrPlaceholder } from '@/assets/character-portraits';
import { RivalAI } from '@/systems/rival-ai';
import { GAME_CONFIG } from '@/config/game-config';
import { formatCurrency } from '@/utils/format';
import {
  createEncounterCenteredLayoutRoot,
  disableEncounterActionButton,
  formatEncounterNeedLabel,
  ensureEncounterLayoutStyles,
} from '@/ui/internal/ui-encounter';
import { isPixelUIEnabled } from '@/ui/internal/ui-style';
import {
  type BiddingContext,
  type BiddingCallbacks,
  playerBid as playerBidInternal,
  playerKickTires as playerKickTiresInternal,
  playerStall as playerStallInternal,
  rivalTurnImmediate as rivalTurnImmediateInternal,
} from './internal/auction-bidding';

type BidHistoryEntry = {
  bidder: 'player' | 'rival';
  totalBid: number;
  atMs: number;
};

type AuctionParticipant = 'auctioneer' | 'player' | 'rival';

type ParticipantFlashState = {
  anchors: Partial<Record<AuctionParticipant, HTMLDivElement>>;
  clearTimeoutIds: Partial<Record<AuctionParticipant, number>>;
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

  // Participant portrait anchors + flash timers.
  private participantFlash: ParticipantFlashState = { anchors: {}, clearTimeoutIds: {} };

  private pendingUIRefreshTimeoutId?: number;
  private pendingRivalBarkTimeoutId?: number;
  private pendingRivalTurnTimeoutId?: number;
  private pendingPlayerTurnEnableTimeoutId?: number;
  private pendingEndAuctionTimeoutId?: number;

  private isPlayerTurn: boolean = false;
  private lastBidder?: 'player' | 'rival';

  private bidHistory: BidHistoryEntry[] = [];
  private lastAuctioneerLine: string = '';
  private auctioneerQuoteEl?: HTMLElement;
  private hasAnyBids: boolean = false;

  private static readonly STARTING_BID_MULTIPLIER = GAME_CONFIG.auction.startingBidMultiplier;
  private static readonly BID_INCREMENT = GAME_CONFIG.auction.bidIncrement;
  private static readonly POWER_BID_INCREMENT = GAME_CONFIG.auction.powerBidIncrement;

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
    this.isPlayerTurn = false;
    this.lastBidder = undefined;
    // Initialize with non-market value; we'll re-evaluate once managers are ready.
    this.currentBid = Math.floor(calculateCarValue(this.car) * AuctionScene.STARTING_BID_MULTIPLIER);
    this.stallUsesThisAuction = 0;
    this.powerBidStreak = 0;
    this.bidHistory = [];
    this.lastAuctioneerLine = '';
    this.auctioneerQuoteEl = undefined;
    this.auctionMarketEstimateValue = 0;

    this.participantFlash = { anchors: {}, clearTimeoutIds: {} };
    this.pendingUIRefreshTimeoutId = undefined;
    this.pendingRivalBarkTimeoutId = undefined;
    this.pendingRivalTurnTimeoutId = undefined;
    this.hasAnyBids = false;
  }

  create(): void {
    debugLog('Auction Scene: Loaded');

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

    // Auctioneer opening prompt, then enable the player's first turn.
    this.clearPendingPlayerTurnEnable();
    this.pendingPlayerTurnEnableTimeoutId = window.setTimeout(() => {
      this.pendingPlayerTurnEnableTimeoutId = undefined;
      if (!this.scene.isActive()) return;

      this.showAuctioneerBark('opening_prompt');
      this.isPlayerTurn = true;
      this.setupUI();
    }, GAME_CONFIG.ui.modalDelays.openingPromptAfterStart);
    
    // Ensure cleanup on scene shutdown
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.clearPendingUIRefresh();
      this.clearPendingRivalTurn();
      this.clearPendingRivalBark();
      this.clearPendingPlayerTurnEnable();
      this.clearPendingEndAuction();
      this.clearAllParticipantFlashTimeouts();
    });
  }

  private clearAllParticipantFlashTimeouts(): void {
    for (const id of Object.values(this.participantFlash.clearTimeoutIds)) {
      if (id !== undefined) window.clearTimeout(id);
    }
    this.participantFlash.clearTimeoutIds = {};
  }

  private flashParticipant(participant: AuctionParticipant): void {
    const anchor = this.participantFlash.anchors[participant];
    if (!anchor || !anchor.isConnected) return;

    const img = anchor.querySelector('img');
    if (!img) return;

    const existingTimeout = this.participantFlash.clearTimeoutIds[participant];
    if (existingTimeout !== undefined) {
      window.clearTimeout(existingTimeout);
      this.participantFlash.clearTimeoutIds[participant] = undefined;
    }

    // Restart animation reliably.
    img.classList.remove('auction-participant-flash');
    // Force reflow to reset animation.
    void img.offsetWidth;
    img.classList.add('auction-participant-flash');

    this.participantFlash.clearTimeoutIds[participant] = window.setTimeout(() => {
      img.classList.remove('auction-participant-flash');
      this.participantFlash.clearTimeoutIds[participant] = undefined;
    }, 520);
  }

  private clearPendingPlayerTurnEnable(): void {
    if (this.pendingPlayerTurnEnableTimeoutId !== undefined) {
      window.clearTimeout(this.pendingPlayerTurnEnableTimeoutId);
      this.pendingPlayerTurnEnableTimeoutId = undefined;
    }
  }

  private scheduleEnablePlayerTurn(delayMs: number = GAME_CONFIG.ui.modalDelays.nextTurnAfterAuctioneer): void {
    this.clearPendingPlayerTurnEnable();
    this.pendingPlayerTurnEnableTimeoutId = window.setTimeout(() => {
      this.pendingPlayerTurnEnableTimeoutId = undefined;
      if (!this.scene.isActive()) return;
      this.isPlayerTurn = true;
      this.setupUI();
    }, delayMs);
  }

  private clearPendingEndAuction(): void {
    if (this.pendingEndAuctionTimeoutId !== undefined) {
      window.clearTimeout(this.pendingEndAuctionTimeoutId);
      this.pendingEndAuctionTimeoutId = undefined;
    }
  }

  private playerEndAuctionEarly(): void {
    if (!this.encounterStarted) return;

    // Lock out any remaining turns and play a quick closeout before resolving.
    this.isPlayerTurn = false;
    this.setupUI();

    this.clearPendingUIRefresh();
    this.clearPendingRivalTurn();
    this.clearPendingRivalBark();
    this.clearPendingPlayerTurnEnable();
    this.clearPendingEndAuction();

    this.showAuctioneerBark('stall');
    this.pendingEndAuctionTimeoutId = window.setTimeout(() => {
      this.pendingEndAuctionTimeoutId = undefined;
      if (!this.scene.isActive()) return;

      this.showAuctioneerBark('stall');
      this.pendingEndAuctionTimeoutId = window.setTimeout(() => {
        this.pendingEndAuctionTimeoutId = undefined;
        if (!this.scene.isActive()) return;

        this.resolveAuctionAfterPlayerEnded();
      }, GAME_CONFIG.ui.modalDelays.nextTurnAfterAuctioneer);
    }, GAME_CONFIG.ui.modalDelays.nextTurnAfterAuctioneer);
  }

  private resolveAuctionAfterPlayerEnded(): void {
    if (!this.scene.isActive()) return;

    // Player opted out: consider this encounter consumed.
    this.consumeOfferIfNeeded();

    // If nobody has bid yet, assume the rival snaps up the opening bid.
    if (!this.hasAnyBids) {
      this.hasAnyBids = true;
      this.lastBidder = 'rival';
      this.recordBid('rival', this.currentBid);
      this.showAuctioneerBark('rival_bid');
      this.endAuction(false, 'You ended the auction early.');
      return;
    }

    // If the rival is already winning, just close it out.
    if (this.lastBidder === 'rival') {
      this.endAuction(false, 'You ended the auction early.');
      return;
    }

    // If the player is winning, give the rival one final chance to outbid.
    if (this.lastBidder === 'player') {
      const decision = this.rivalAI.decideBid(this.currentBid);

      if (!decision.shouldBid) {
        const finalBark: BarkTrigger = decision.reason === 'Lost patience' ? 'patience_low' : 'outbid';
        this.endAuction(true, `${this.rival.name} ${decision.reason}!`, finalBark);
        return;
      }

      this.currentBid += decision.bidAmount;
      this.lastBidder = 'rival';
      this.recordBid('rival', this.currentBid);
      this.showAuctioneerBark('rival_bid');
      this.endAuction(false, 'You ended the auction early.');
      return;
    }

    // Fallback: treat as rival win.
    this.endAuction(false, 'You ended the auction early.');
  }

  private clearPendingUIRefresh(): void {
    if (this.pendingUIRefreshTimeoutId !== undefined) {
      window.clearTimeout(this.pendingUIRefreshTimeoutId);
      this.pendingUIRefreshTimeoutId = undefined;
    }
  }

  private clearPendingRivalTurn(): void {
    if (this.pendingRivalTurnTimeoutId !== undefined) {
      window.clearTimeout(this.pendingRivalTurnTimeoutId);
      this.pendingRivalTurnTimeoutId = undefined;
    }
  }

  private scheduleRivalTurn(delayMs: number = GAME_CONFIG.ui.modalDelays.rivalBid): void {
    this.clearPendingRivalTurn();
    this.pendingRivalTurnTimeoutId = window.setTimeout(() => {
      this.pendingRivalTurnTimeoutId = undefined;
      if (!this.scene.isActive()) return;
      this.rivalTurnImmediate();
    }, delayMs);
  }

  private clearPendingRivalBark(): void {
    if (this.pendingRivalBarkTimeoutId !== undefined) {
      window.clearTimeout(this.pendingRivalBarkTimeoutId);
      this.pendingRivalBarkTimeoutId = undefined;
    }
  }

  private showRivalBarkAfterAuctioneer(
    trigger: BarkTrigger,
    delayMs: number = GAME_CONFIG.ui.modalDelays.rivalBarkAfterAuctioneer
  ): void {
    this.clearPendingRivalBark();
    this.pendingRivalBarkTimeoutId = window.setTimeout(() => {
      this.pendingRivalBarkTimeoutId = undefined;
      if (!this.scene.isActive()) return;
      this.showRivalBark(trigger);
    }, delayMs);
  }

  private recordBid(bidder: 'player' | 'rival', totalBid: number): void {
    this.bidHistory.push({ bidder, totalBid, atMs: Date.now() });
    if (this.bidHistory.length > 50) {
      this.bidHistory.splice(0, this.bidHistory.length - 50);
    }
    this.flashParticipant(bidder);
  }

  private formatBidTimeAgo(atMs: number): string {
    const deltaMs = Math.max(0, Date.now() - atMs);
    const seconds = Math.floor(deltaMs / 1000);
    if (seconds < 10) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }


  private setupUI(): void {
    // resetUIWithHUD() clears the entire overlay. Clear anchor refs and pending flash cleanup timers.
    this.clearAllParticipantFlashTimeouts();
    this.participantFlash.anchors = {};
    this.auctioneerQuoteEl = undefined;

    this.resetUIWithHUD();

    const player = this.gameManager.getPlayerState();

    // Minimal responsive layout tweaks for the auction UI.
    ensureEncounterLayoutStyles({
      styleId: 'auctionLayoutStyles',
      rootClass: 'auction-layout',
      topClass: 'auction-layout__main',
      bottomClass: 'auction-layout__main',
    });

    const layoutRoot = createEncounterCenteredLayoutRoot('auction-layout');
    layoutRoot.style.gap = '12px';

    const pixelUI = isPixelUIEnabled();

    const openingBidMode = !this.hasAnyBids;
    const normalBidTotal = openingBidMode ? this.currentBid : this.currentBid + AuctionScene.BID_INCREMENT;
    const powerBidTotal = this.currentBid + AuctionScene.POWER_BID_INCREMENT;

    const makePortraitAnchor = (url: string, alt: string, sizePx: number = 40): HTMLDivElement => {
      const anchor = document.createElement('div');
      Object.assign(anchor.style, {
        position: 'relative',
        width: `${sizePx}px`,
        height: `${sizePx}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
      } satisfies Partial<CSSStyleDeclaration>);

      const img = document.createElement('img');
      img.src = url;
      img.alt = alt;
      Object.assign(img.style, {
        width: `${sizePx}px`,
        height: `${sizePx}px`,
        display: 'block',
        margin: '0',
        objectFit: 'cover',
        boxSizing: 'border-box',
        borderRadius: pixelUI ? '0px' : '10px',
        border: '2px solid rgba(255,255,255,0.2)',
        backgroundColor: 'rgba(0,0,0,0.2)',
        imageRendering: pixelUI ? 'pixelated' : 'auto',
      } satisfies Partial<CSSStyleDeclaration>);

      anchor.appendChild(img);
      return anchor;
    };

    const header = this.uiManager.createPanel({
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '14px',
    });

    const headerLeft = document.createElement('div');
    Object.assign(headerLeft.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
      minWidth: '0',
    } satisfies Partial<CSSStyleDeclaration>);

    headerLeft.appendChild(
      this.uiManager.createHeading('AUCTION', 2, {
        margin: '0',
        color: '#ffd700',
        letterSpacing: pixelUI ? '0.08em' : '0.02em',
        textTransform: pixelUI ? 'uppercase' : 'none',
      })
    );

    const locationName = (() => {
      if (!this.locationId) return null;

      const base = BASE_LOCATIONS.find((loc) => loc.id === this.locationId);
      if (base) return base.name;

      const specials = this.gameManager.getActiveSpecialEvents();
      const special = specials.find((event) => event.id === this.locationId);
      if (special) return special.name;

      return null;
    })();

    headerLeft.appendChild(
      this.uiManager.createText(locationName ?? 'Live bidding encounter', {
        margin: '0',
        fontSize: '12px',
        opacity: '0.8',
      })
    );

    const headerRight = document.createElement('div');
    Object.assign(headerRight.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      flex: '0 0 auto',
    } satisfies Partial<CSSStyleDeclaration>);

    const creditsBox = this.uiManager.createPanel({
      padding: '10px 12px',
      borderRadius: pixelUI ? '0px' : '12px',
      background: 'rgba(0,0,0,0.18)',
      boxShadow: 'none',
      border: '1px solid rgba(255,255,255,0.10)',
    });
    creditsBox.appendChild(
      this.uiManager.createText('Your credits', {
        margin: '0 0 2px 0',
        fontSize: '11px',
        opacity: '0.75',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      })
    );
    creditsBox.appendChild(
      this.uiManager.createText(formatCurrency(player.money), {
        margin: '0',
        fontWeight: '800',
        color: '#ffd700',
      })
    );
    headerRight.appendChild(creditsBox);

    const youPortrait = makePortraitAnchor(PLAYER_PORTRAIT_PLACEHOLDER_URL, 'You', 36);
    this.participantFlash.anchors.player = youPortrait;
    headerRight.appendChild(youPortrait);
    headerRight.appendChild(
      this.uiManager.createText('You', {
        margin: '0',
        fontWeight: '800',
        whiteSpace: 'nowrap',
      })
    );

    header.appendChild(headerLeft);
    header.appendChild(headerRight);
    layoutRoot.appendChild(header);

    const mainGrid = document.createElement('div');
    mainGrid.classList.add('auction-layout__main');
    Object.assign(mainGrid.style, {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
      gap: '14px',
      alignItems: 'start',
    } satisfies Partial<CSSStyleDeclaration>);

    const leftCol = document.createElement('div');
    Object.assign(leftCol.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      minWidth: '0',
    } satisfies Partial<CSSStyleDeclaration>);

    const rightCol = document.createElement('div');
    Object.assign(rightCol.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      minWidth: '0',
    } satisfies Partial<CSSStyleDeclaration>);

    // LEFT: status strip (reference: countdown + current bid)
    const statusStrip = this.uiManager.createPanel({
      padding: '14px 16px',
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
      gap: '12px',
      alignItems: 'center',
    });

    const patienceBox = document.createElement('div');
    Object.assign(patienceBox.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      minWidth: '0',
    } satisfies Partial<CSSStyleDeclaration>);
    patienceBox.appendChild(
      this.uiManager.createText('Rival patience', {
        margin: '0',
        fontSize: '11px',
        opacity: '0.75',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      })
    );

    const patience = Math.max(0, Math.min(100, Math.floor(this.rivalAI.getPatience())));
    patienceBox.appendChild(
      this.uiManager.createText(`${patience}%`, {
        margin: '0',
        fontWeight: '900',
        fontSize: '22px',
      })
    );

    const patienceBarOuter = document.createElement('div');
    Object.assign(patienceBarOuter.style, {
      height: '10px',
      borderRadius: pixelUI ? '0px' : '999px',
      backgroundColor: 'rgba(255,255,255,0.10)',
      overflow: 'hidden',
    } satisfies Partial<CSSStyleDeclaration>);

    const patienceBarInner = document.createElement('div');
    Object.assign(patienceBarInner.style, {
      height: '100%',
      width: `${patience}%`,
      background: 'linear-gradient(135deg, #27ae60, #229954)',
    } satisfies Partial<CSSStyleDeclaration>);
    patienceBarOuter.appendChild(patienceBarInner);
    patienceBox.appendChild(patienceBarOuter);

    const bidBox = document.createElement('div');
    Object.assign(bidBox.style, {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: '6px',
      minWidth: '0',
    } satisfies Partial<CSSStyleDeclaration>);
    bidBox.appendChild(
      this.uiManager.createText('Current bid', {
        margin: '0',
        fontSize: '11px',
        opacity: '0.75',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      })
    );
    bidBox.appendChild(
      this.uiManager.createText(formatCurrency(this.currentBid), {
        margin: '0',
        fontWeight: '900',
        fontSize: '22px',
        color: '#ffd700',
        textAlign: 'right',
      })
    );

    statusStrip.appendChild(patienceBox);
    statusStrip.appendChild(bidBox);
    leftCol.appendChild(statusStrip);

    // LEFT: car showcase
    const marketValue = this.auctionMarketEstimateValue;
    const carPanel = this.uiManager.createCarInfoPanel(this.car, {
      showValue: false,
      showTags: false,
      showCondition: false,
      imageHeightPx: 240,
      titleColor: '#ecf0f1',
      style: { margin: '0' },
    });
    leftCol.appendChild(carPanel);

    // LEFT: quick stats row (reference: chips)
    const chips = this.uiManager.createPanel({
      padding: '12px 16px',
      display: 'grid',
      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
      gap: '10px',
    });

    const makeChip = (label: string, value: string, valueColor?: string): HTMLDivElement => {
      const chip = document.createElement('div');
      Object.assign(chip.style, {
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: pixelUI ? '0px' : '12px',
        padding: '10px 10px',
        backgroundColor: 'rgba(0,0,0,0.14)',
        minWidth: '0',
      } satisfies Partial<CSSStyleDeclaration>);
      chip.appendChild(
        this.uiManager.createText(label, {
          margin: '0 0 4px 0',
          fontSize: '11px',
          opacity: '0.75',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        })
      );
      chip.appendChild(
        this.uiManager.createText(value, {
          margin: '0',
          fontWeight: '800',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: valueColor ?? '#e0e6ed',
        })
      );
      return chip;
    };

    chips.appendChild(makeChip('Estimate', formatCurrency(marketValue), '#FFC107'));
    chips.appendChild(makeChip('Condition', `${Math.round(this.car.condition)}/100`, '#4CAF50'));
    chips.appendChild(makeChip('Increment', formatCurrency(AuctionScene.BID_INCREMENT)));
    chips.appendChild(makeChip('Rival budget', formatCurrency(Math.floor(this.rivalAI.getBudget())), '#ffd700'));
    leftCol.appendChild(chips);

    // LEFT: auctioneer callout (reference: auctioneer dialogue card)
    const auctioneerPanel = this.uiManager.createPanel({
      padding: '14px 16px',
    });
    const auctioneerRow = document.createElement('div');
    Object.assign(auctioneerRow.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      margin: '0 0 10px 0',
      minWidth: '0',
    } satisfies Partial<CSSStyleDeclaration>);

    const auctioneerPortrait = makePortraitAnchor(
      getCharacterPortraitUrlOrPlaceholder(this.auctioneerName),
      `${this.auctioneerName} portrait`,
      44
    );
    this.participantFlash.anchors.auctioneer = auctioneerPortrait;

    const auctioneerMeta = document.createElement('div');
    Object.assign(auctioneerMeta.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
      minWidth: '0',
    } satisfies Partial<CSSStyleDeclaration>);
    auctioneerMeta.appendChild(
      this.uiManager.createText(this.auctioneerName, {
        margin: '0',
        fontWeight: '900',
        color: '#ffd700',
      })
    );
    auctioneerMeta.appendChild(
      this.uiManager.createText('Auctioneer', {
        margin: '0',
        fontSize: '12px',
        opacity: '0.75',
      })
    );

    auctioneerRow.appendChild(auctioneerPortrait);
    auctioneerRow.appendChild(auctioneerMeta);
    auctioneerPanel.appendChild(auctioneerRow);

    const auctioneerText = this.lastAuctioneerLine || 'Opening bid—who wants it?';
    const quote = this.uiManager.createText(`"${auctioneerText}"`, {
      margin: '0',
      fontStyle: pixelUI ? 'normal' : 'italic',
      opacity: '0.95',
      lineHeight: '1.25',
    });
    this.auctioneerQuoteEl = quote;
    auctioneerPanel.appendChild(quote);
    leftCol.appendChild(auctioneerPanel);

    // LEFT: bidding controls (reference: quick increments + place bid)
    const biddingPanel = this.uiManager.createPanel({
      padding: '16px',
    });
    biddingPanel.appendChild(
      this.uiManager.createHeading('PLACE YOUR BID', 3, {
        margin: '0 0 12px 0',
        textAlign: 'left',
      })
    );

    const quickRow = document.createElement('div');
    Object.assign(quickRow.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gap: '10px',
      margin: '0 0 12px 0',
    } satisfies Partial<CSSStyleDeclaration>);

    const quickBtnStyle: Partial<CSSStyleDeclaration> = {
      padding: '12px 10px',
      fontSize: '14px',
    };

    const normalQuickText = openingBidMode
      ? `Opening\n${formatCurrency(this.currentBid)}`
      : `+${formatCurrency(AuctionScene.BID_INCREMENT)}`;
    const normalBtn = this.uiManager.createButton(normalQuickText, () => this.playerBid(AuctionScene.BID_INCREMENT), {
      variant: 'primary',
      style: quickBtnStyle,
    });
    const powerBtn = this.uiManager.createButton(
      `Power\n+${formatCurrency(AuctionScene.POWER_BID_INCREMENT)}`,
      () => this.playerBid(AuctionScene.POWER_BID_INCREMENT, { power: true }),
      { variant: 'warning', style: quickBtnStyle }
    );
    powerBtn.dataset.tutorialTarget = 'auction.power-bid';

    const endBtn = this.uiManager.createButton('End\nAuction', () => this.playerEndAuctionEarly(), {
      variant: 'danger',
      style: quickBtnStyle,
    });

    // Affordability gating
    if (player.money < normalBidTotal) {
      disableEncounterActionButton(normalBtn, formatEncounterNeedLabel('Bid', formatCurrency(normalBidTotal)));
    }
    if (player.money < powerBidTotal) {
      disableEncounterActionButton(powerBtn, formatEncounterNeedLabel('Power', formatCurrency(powerBidTotal)));
    }

    quickRow.appendChild(normalBtn);
    quickRow.appendChild(powerBtn);
    quickRow.appendChild(endBtn);
    biddingPanel.appendChild(quickRow);

    const bidDisplayRow = document.createElement('div');
    Object.assign(bidDisplayRow.style, {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto',
      gap: '10px',
      alignItems: 'center',
    } satisfies Partial<CSSStyleDeclaration>);

    const bidDisplay = document.createElement('div');
    bidDisplay.classList.add('auction-bid-display');
    Object.assign(bidDisplay.style, {
      border: '1px solid rgba(255,255,255,0.14)',
      borderRadius: pixelUI ? '0px' : '12px',
      padding: '12px 12px',
      backgroundColor: 'rgba(0,0,0,0.18)',
      minWidth: '0',
    } satisfies Partial<CSSStyleDeclaration>);
    bidDisplay.appendChild(
      this.uiManager.createText('Next bid', {
        margin: '0 0 2px 0',
        fontSize: '11px',
        opacity: '0.75',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      })
    );
    bidDisplay.appendChild(
      this.uiManager.createText(formatCurrency(normalBidTotal), {
        margin: '0',
        fontWeight: '900',
        fontSize: '20px',
      })
    );

    const placeBtn = this.uiManager.createButton('PLACE BID', () => this.playerBid(AuctionScene.BID_INCREMENT), {
      variant: 'success',
      style: {
        padding: '14px 16px',
        fontSize: '15px',
        whiteSpace: 'nowrap',
      },
    });

    // Mirror the same gating as normal bid.
    if (player.money < normalBidTotal) {
      disableEncounterActionButton(placeBtn, formatEncounterNeedLabel('Place', formatCurrency(normalBidTotal)));
    }

    // Turn gating: only allow actions on the player's turn.
    if (!this.isPlayerTurn) {
      disableEncounterActionButton(normalBtn, 'Bid\nWaiting');
      disableEncounterActionButton(powerBtn, 'Power\nWaiting');
      disableEncounterActionButton(endBtn, 'End\nWaiting');
      disableEncounterActionButton(placeBtn, 'Waiting');
    }

    bidDisplayRow.appendChild(bidDisplay);
    bidDisplayRow.appendChild(placeBtn);
    biddingPanel.appendChild(bidDisplayRow);

    const tacticsRow = document.createElement('div');
    Object.assign(tacticsRow.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: '10px',
      margin: '12px 0 0 0',
    } satisfies Partial<CSSStyleDeclaration>);

    const kickTiresBtn = this.uiManager.createButton(
      `Kick Tires\nEye ${AuctionScene.REQUIRED_EYE_LEVEL_FOR_KICK_TIRES}+ · Budget -${formatCurrency(AuctionScene.KICK_TIRES_BUDGET_REDUCTION)}`,
      () => this.playerKickTires(),
      { variant: 'info', style: { padding: '12px 10px', fontSize: '14px' } }
    );
    if (player.skills.eye < AuctionScene.REQUIRED_EYE_LEVEL_FOR_KICK_TIRES) {
      disableEncounterActionButton(
        kickTiresBtn,
        `Kick Tires\nRequires Eye ${AuctionScene.REQUIRED_EYE_LEVEL_FOR_KICK_TIRES}+`
      );
    }

    const maxStalls = player.skills.tongue;
    const stallsRemaining = Math.max(0, maxStalls - this.stallUsesThisAuction);
    const stallBtn = this.uiManager.createButton(
      `Stall\nUses left: ${stallsRemaining}`,
      () => this.playerStall(),
      { variant: 'special', style: { padding: '12px 10px', fontSize: '14px' } }
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

    if (!this.isPlayerTurn) {
      disableEncounterActionButton(kickTiresBtn, 'Kick Tires\nWaiting');
      disableEncounterActionButton(stallBtn, 'Stall\nWaiting');
    }

    tacticsRow.appendChild(kickTiresBtn);
    tacticsRow.appendChild(stallBtn);
    biddingPanel.appendChild(tacticsRow);

    biddingPanel.appendChild(
      this.uiManager.createText(
        `Minimum increment: ${formatCurrency(AuctionScene.BID_INCREMENT)} · Power bids reduce rival patience`,
        { margin: '12px 0 0 0', fontSize: '12px', opacity: '0.75' }
      )
    );
    leftCol.appendChild(biddingPanel);

    // RIGHT: bidders list (reference: rival bidders)
    const biddersPanel = this.uiManager.createPanel({ padding: '14px 16px' });
    biddersPanel.appendChild(
      this.uiManager.createHeading('BIDDERS', 3, { margin: '0 0 12px 0', textAlign: 'left' })
    );

    const biddersList = document.createElement('div');
    Object.assign(biddersList.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    } satisfies Partial<CSSStyleDeclaration>);

    const makeBidderRow = (params: {
      key: 'player' | 'rival';
      name: string;
      portraitUrl: string;
      isLeader: boolean;
    }): HTMLDivElement => {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 10px',
        border: `1px solid ${params.isLeader ? 'rgba(255,215,0,0.45)' : 'rgba(255,255,255,0.12)'}`,
        borderRadius: pixelUI ? '0px' : '12px',
        backgroundColor: 'rgba(0,0,0,0.14)',
      } satisfies Partial<CSSStyleDeclaration>);

      const anchor = makePortraitAnchor(params.portraitUrl, `${params.name} portrait`, 38);
      if (params.key === 'player') this.participantFlash.anchors.player = anchor;
      else this.participantFlash.anchors.rival = anchor;

      const meta = document.createElement('div');
      Object.assign(meta.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        minWidth: '0',
        flex: '1 1 auto',
      } satisfies Partial<CSSStyleDeclaration>);

      meta.appendChild(
        this.uiManager.createText(params.name, {
          margin: '0',
          fontWeight: '900',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        })
      );
      meta.appendChild(
        this.uiManager.createText(params.isLeader ? 'Current high bidder' : 'Outbid', {
          margin: '0',
          fontSize: '12px',
          opacity: '0.75',
        })
      );

      const amount = this.uiManager.createText(params.isLeader ? formatCurrency(this.currentBid) : '', {
        margin: '0',
        fontWeight: '900',
        color: params.isLeader ? '#ffd700' : '#ccc',
        whiteSpace: 'nowrap',
      });

      row.appendChild(anchor);
      row.appendChild(meta);
      row.appendChild(amount);
      return row;
    };

    biddersList.appendChild(
      makeBidderRow({
        key: 'player',
        name: 'You',
        portraitUrl: PLAYER_PORTRAIT_PLACEHOLDER_URL,
        isLeader: this.lastBidder === 'player',
      })
    );
    biddersList.appendChild(
      makeBidderRow({
        key: 'rival',
        name: this.rival.name,
        portraitUrl: getCharacterPortraitUrlOrPlaceholder(this.rival.name),
        isLeader: this.lastBidder === 'rival' || (!this.lastBidder && !this.hasAnyBids),
      })
    );

    biddersPanel.appendChild(biddersList);
    rightCol.appendChild(biddersPanel);

    // RIGHT: bid history (no narrative log)
    const bidHistoryPanel = this.uiManager.createPanel({ padding: '14px 16px' });
    bidHistoryPanel.appendChild(
      this.uiManager.createHeading('BID HISTORY', 3, { margin: '0 0 12px 0', textAlign: 'left' })
    );

    const bidHistoryScroll = document.createElement('div');
    Object.assign(bidHistoryScroll.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      overflowY: 'auto',
      overflowX: 'hidden',
      maxHeight: '520px',
      paddingRight: '6px',
      boxSizing: 'border-box',
    } satisfies Partial<CSSStyleDeclaration>);

    const makeHistoryRow = (entry: BidHistoryEntry): HTMLDivElement => {
      const isPlayer = entry.bidder === 'player';
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        gap: '10px',
        alignItems: 'center',
        padding: '10px 10px',
        border: `1px solid ${isPlayer ? 'rgba(76,175,80,0.35)' : 'rgba(255,255,255,0.12)'}`,
        borderRadius: pixelUI ? '0px' : '12px',
        backgroundColor: 'rgba(0,0,0,0.14)',
      } satisfies Partial<CSSStyleDeclaration>);

      const portraitUrl = isPlayer
        ? PLAYER_PORTRAIT_PLACEHOLDER_URL
        : getCharacterPortraitUrlOrPlaceholder(this.rival.name);
      const avatar = document.createElement('img');
      avatar.src = portraitUrl;
      avatar.alt = isPlayer ? 'You' : this.rival.name;
      Object.assign(avatar.style, {
        width: '28px',
        height: '28px',
        objectFit: 'cover',
        borderRadius: pixelUI ? '0px' : '6px',
        border: '2px solid rgba(255,255,255,0.18)',
        backgroundColor: 'rgba(0,0,0,0.18)',
        imageRendering: pixelUI ? 'pixelated' : 'auto',
        boxSizing: 'border-box',
      } satisfies Partial<CSSStyleDeclaration>);

      const meta = document.createElement('div');
      Object.assign(meta.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        minWidth: '0',
      } satisfies Partial<CSSStyleDeclaration>);

      const nameRow = document.createElement('div');
      Object.assign(nameRow.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        minWidth: '0',
      } satisfies Partial<CSSStyleDeclaration>);

      const name = this.uiManager.createText(isPlayer ? 'YOU' : this.rival.name, {
        margin: '0',
        fontWeight: '900',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      });
      nameRow.appendChild(name);

      const time = this.uiManager.createText(this.formatBidTimeAgo(entry.atMs), {
        margin: '0',
        fontSize: '11px',
        opacity: '0.65',
        whiteSpace: 'nowrap',
      });

      meta.appendChild(nameRow);
      meta.appendChild(time);

      const amount = this.uiManager.createText(formatCurrency(entry.totalBid), {
        margin: '0',
        fontWeight: '900',
        color: isPlayer ? '#4CAF50' : '#ffd700',
        whiteSpace: 'nowrap',
      });

      row.appendChild(avatar);
      row.appendChild(meta);
      row.appendChild(amount);
      return row;
    };

    const recent = this.bidHistory.slice(-50).slice().reverse();
    for (const entry of recent) {
      bidHistoryScroll.appendChild(makeHistoryRow(entry));
    }

    bidHistoryPanel.appendChild(bidHistoryScroll);
    rightCol.appendChild(bidHistoryPanel);

    mainGrid.appendChild(leftCol);
    mainGrid.appendChild(rightCol);
    layoutRoot.appendChild(mainGrid);

    this.uiManager.append(layoutRoot);
  }

  private showToastAndLog(
    toast: string,
    options?: { backgroundColor?: string; durationMs?: number },
    log?: string,
    _logKind: string = 'warning'
  ): void {
    void log;
    this.uiManager.showToast(toast, options);
  }

  private showRivalBark(trigger: BarkTrigger): void {
    const mood = this.rival.mood || 'Normal';
    const bark = getRivalBark(mood, trigger).trim();
    if (!bark) return;
    this.flashParticipant('rival');
    this.uiManager.showToast(`"${bark}"`, { durationMs: 2600 });
  }
  private showAuctioneerBark(trigger: 'start' | 'opening_prompt' | 'player_bid' | 'player_power_bid' | 'rival_bid' | 'stall' | 'kick_tires' | 'end_player_win' | 'end_player_lose'): void {
    const pick = (lines: readonly string[]): string => lines[Math.floor(Math.random() * lines.length)] ?? '';

    let text = '';
    switch (trigger) {
      case 'start':
        text = 'Alright folks—let\'s get this started.';
        break;
      case 'opening_prompt':
        text = pick([
          `Opening bid at ${formatCurrency(this.currentBid)}. Who wants it?`,
          `We\'re starting at ${formatCurrency(this.currentBid)}. Do I hear a bid?`,
        ]);
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

    this.lastAuctioneerLine = trimmed;
    if (this.auctioneerQuoteEl) {
      this.auctioneerQuoteEl.textContent = `"${trimmed}"`;
    }
    this.flashParticipant('auctioneer');
  }

  private playerBid(amount: number, options?: { power?: boolean }): void {
    const context: BiddingContext = {
      car: this.car,
      rival: this.rival,
      rivalAI: this.rivalAI,
      auctioneerName: this.auctioneerName,
      currentBid: this.currentBid,
      hasAnyBids: this.hasAnyBids,
      lastBidder: this.lastBidder,
      stallUsesThisAuction: this.stallUsesThisAuction,
      powerBidStreak: this.powerBidStreak,
      isPlayerTurn: this.isPlayerTurn,
      locationId: this.locationId
    };

    const callbacks: BiddingCallbacks = {
      gameManager: this.gameManager,
      uiManager: this.uiManager,
      onShowToastAndLog: (toast: string, opts?: { backgroundColor?: string }, log?: string, logKind?: string) => 
        this.showToastAndLog(toast, opts, log, logKind),
      onRecordBid: (bidder: 'player' | 'rival', totalBid: number) => this.recordBid(bidder, totalBid),
      onShowAuctioneerBark: (trigger: string) => this.showAuctioneerBark(trigger as any),
      onShowRivalBarkAfterAuctioneer: (trigger: BarkTrigger, delayMs?: number) => this.showRivalBarkAfterAuctioneer(trigger, delayMs),
      onSetupUI: () => this.setupUI(),
      onScheduleRivalTurn: (delayMs: number) => this.scheduleRivalTurn(delayMs),
      onScheduleEnablePlayerTurn: (delayMs?: number) => this.scheduleEnablePlayerTurn(delayMs),
      onEndAuction: (playerWon: boolean, message: string, rivalFinalBarkTrigger?: BarkTrigger) => this.endAuction(playerWon, message, rivalFinalBarkTrigger)
    };

    const updatedContext = playerBidInternal(amount, context, callbacks, options);

    // Sync updated state back
    this.currentBid = updatedContext.currentBid;
    this.hasAnyBids = updatedContext.hasAnyBids;
    this.lastBidder = updatedContext.lastBidder;
    this.stallUsesThisAuction = updatedContext.stallUsesThisAuction;
    this.powerBidStreak = updatedContext.powerBidStreak;
    this.isPlayerTurn = updatedContext.isPlayerTurn;
  }


  private playerKickTires(): void {
    const context: BiddingContext = {
      car: this.car,
      rival: this.rival,
      rivalAI: this.rivalAI,
      auctioneerName: this.auctioneerName,
      currentBid: this.currentBid,
      hasAnyBids: this.hasAnyBids,
      lastBidder: this.lastBidder,
      stallUsesThisAuction: this.stallUsesThisAuction,
      powerBidStreak: this.powerBidStreak,
      isPlayerTurn: this.isPlayerTurn,
      locationId: this.locationId
    };

    const callbacks: BiddingCallbacks = {
      gameManager: this.gameManager,
      uiManager: this.uiManager,
      onShowToastAndLog: (toast: string, opts?: { backgroundColor?: string }, log?: string, logKind?: string) => 
        this.showToastAndLog(toast, opts, log, logKind),
      onRecordBid: (bidder: 'player' | 'rival', totalBid: number) => this.recordBid(bidder, totalBid),
      onShowAuctioneerBark: (trigger: string) => this.showAuctioneerBark(trigger as any),
      onShowRivalBarkAfterAuctioneer: (trigger: BarkTrigger, delayMs?: number) => this.showRivalBarkAfterAuctioneer(trigger, delayMs),
      onSetupUI: () => this.setupUI(),
      onScheduleRivalTurn: (delayMs: number) => this.scheduleRivalTurn(delayMs),
      onScheduleEnablePlayerTurn: (delayMs?: number) => this.scheduleEnablePlayerTurn(delayMs),
      onEndAuction: (playerWon: boolean, message: string, rivalFinalBarkTrigger?: BarkTrigger) => this.endAuction(playerWon, message, rivalFinalBarkTrigger)
    };

    const updatedContext = playerKickTiresInternal(context, callbacks);

    // Sync updated state back
    this.currentBid = updatedContext.currentBid;
    this.hasAnyBids = updatedContext.hasAnyBids;
    this.lastBidder = updatedContext.lastBidder;
    this.stallUsesThisAuction = updatedContext.stallUsesThisAuction;
    this.powerBidStreak = updatedContext.powerBidStreak;
    this.isPlayerTurn = updatedContext.isPlayerTurn;
  }


  private playerStall(): void {
    const context: BiddingContext = {
      car: this.car,
      rival: this.rival,
      rivalAI: this.rivalAI,
      auctioneerName: this.auctioneerName,
      currentBid: this.currentBid,
      hasAnyBids: this.hasAnyBids,
      lastBidder: this.lastBidder,
      stallUsesThisAuction: this.stallUsesThisAuction,
      powerBidStreak: this.powerBidStreak,
      isPlayerTurn: this.isPlayerTurn,
      locationId: this.locationId
    };

    const callbacks: BiddingCallbacks = {
      gameManager: this.gameManager,
      uiManager: this.uiManager,
      onShowToastAndLog: (toast: string, opts?: { backgroundColor?: string }, log?: string, logKind?: string) => 
        this.showToastAndLog(toast, opts, log, logKind),
      onRecordBid: (bidder: 'player' | 'rival', totalBid: number) => this.recordBid(bidder, totalBid),
      onShowAuctioneerBark: (trigger: string) => this.showAuctioneerBark(trigger as any),
      onShowRivalBarkAfterAuctioneer: (trigger: BarkTrigger, delayMs?: number) => this.showRivalBarkAfterAuctioneer(trigger, delayMs),
      onSetupUI: () => this.setupUI(),
      onScheduleRivalTurn: (delayMs: number) => this.scheduleRivalTurn(delayMs),
      onScheduleEnablePlayerTurn: (delayMs?: number) => this.scheduleEnablePlayerTurn(delayMs),
      onEndAuction: (playerWon: boolean, message: string, rivalFinalBarkTrigger?: BarkTrigger) => this.endAuction(playerWon, message, rivalFinalBarkTrigger)
    };

    const updatedContext = playerStallInternal(context, callbacks);

    // Sync updated state back
    this.currentBid = updatedContext.currentBid;
    this.hasAnyBids = updatedContext.hasAnyBids;
    this.lastBidder = updatedContext.lastBidder;
    this.stallUsesThisAuction = updatedContext.stallUsesThisAuction;
    this.powerBidStreak = updatedContext.powerBidStreak;
    this.isPlayerTurn = updatedContext.isPlayerTurn;
  }


  private consumeOfferIfNeeded(): void {
    if (!this.encounterStarted) return;
    if (this.locationId) {
      this.gameManager.consumeDailyCarOfferForLocation(this.locationId);
      // Prevent accidental double-consumption across multiple resolution paths.
      this.locationId = undefined;
    }
  }

  private rivalTurnImmediate(): void {
    const context: BiddingContext = {
      car: this.car,
      rival: this.rival,
      rivalAI: this.rivalAI,
      auctioneerName: this.auctioneerName,
      currentBid: this.currentBid,
      hasAnyBids: this.hasAnyBids,
      lastBidder: this.lastBidder,
      stallUsesThisAuction: this.stallUsesThisAuction,
      powerBidStreak: this.powerBidStreak,
      isPlayerTurn: this.isPlayerTurn,
      locationId: this.locationId
    };

    const callbacks: BiddingCallbacks = {
      gameManager: this.gameManager,
      uiManager: this.uiManager,
      onShowToastAndLog: (toast: string, opts?: { backgroundColor?: string }, log?: string, logKind?: string) => 
        this.showToastAndLog(toast, opts, log, logKind),
      onRecordBid: (bidder: 'player' | 'rival', totalBid: number) => this.recordBid(bidder, totalBid),
      onShowAuctioneerBark: (trigger: string) => this.showAuctioneerBark(trigger as any),
      onShowRivalBarkAfterAuctioneer: (trigger: BarkTrigger, delayMs?: number) => this.showRivalBarkAfterAuctioneer(trigger, delayMs),
      onSetupUI: () => this.setupUI(),
      onScheduleRivalTurn: (delayMs: number) => this.scheduleRivalTurn(delayMs),
      onScheduleEnablePlayerTurn: (delayMs?: number) => this.scheduleEnablePlayerTurn(delayMs),
      onEndAuction: (playerWon: boolean, message: string, rivalFinalBarkTrigger?: BarkTrigger) => this.endAuction(playerWon, message, rivalFinalBarkTrigger)
    };

    const updatedContext = rivalTurnImmediateInternal(context, callbacks);

    // Sync updated state back
    this.currentBid = updatedContext.currentBid;
    this.hasAnyBids = updatedContext.hasAnyBids;
    this.lastBidder = updatedContext.lastBidder;
    this.stallUsesThisAuction = updatedContext.stallUsesThisAuction;
    this.powerBidStreak = updatedContext.powerBidStreak;
    this.isPlayerTurn = updatedContext.isPlayerTurn;
  }


  private endAuction(playerWon: boolean, message: string, rivalFinalBarkTrigger?: BarkTrigger): void {
    // Tutorial: the Sterling Vance encounter is meant to be a scripted loss beat.
    // If the player manages to "win" via tactics (patience/budget), force a loss so the
    // redemption flow remains deterministic and the tutorial cannot get stuck.
    let forceSterlingTutorialLoss = false;
    try {
      forceSterlingTutorialLoss =
        playerWon &&
        this.tutorialManager.isTutorialActive() &&
        this.tutorialManager.isOnFirstLossStep() &&
        this.rival.id === 'sterling_vance';
    } catch {
      forceSterlingTutorialLoss = false;
    }

    if (forceSterlingTutorialLoss) {
      playerWon = false;
      // Make the final call/readout coherent even if the rival "quit" in the underlying logic.
      this.hasAnyBids = true;
      this.lastBidder = 'rival';
      this.currentBid += AuctionScene.BID_INCREMENT;
      message = `${this.rival.name} outbids you at the last second.`;
    }

    // Prevent any scheduled UI refresh from wiping the final result modal.
    this.clearPendingUIRefresh();
    this.clearPendingRivalTurn();
    this.clearPendingRivalBark();
    this.clearPendingPlayerTurnEnable();
    this.clearPendingEndAuction();
    this.isPlayerTurn = false;

    // Rebuild UI so action buttons are visibly disabled post-auction.
    if (this.scene.isActive()) {
      this.setupUI();
    }

    // Show final bark
    if (playerWon) {
      this.showAuctioneerBark('end_player_win');
      this.showRivalBarkAfterAuctioneer(rivalFinalBarkTrigger ?? 'lose');
    } else {
      this.showAuctioneerBark('end_player_lose');
      this.showRivalBarkAfterAuctioneer('win');
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
            { text: 'Stay', onClick: () => {} },
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
                text: 'Stay',
                onClick: () => {},
              },
              {
                text: 'Back to Map',
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

        // Tutorial: after the first (tutorial) auction win, advance to the restore beat.
        try {
          if (this.tutorialManager.isTutorialActive() && this.tutorialManager.isOnFirstVisitAuctionStep()) {
            this.tutorialManager.onFirstTutorialCarPurchased();
          }
        } catch {
          // Ignore tutorial errors
        }
        
        // Award Tongue XP for winning an auction
        const tongueXPGain = GAME_CONFIG.player.skillProgression.xpGains.auction;
        const leveledUp = this.gameManager.addSkillXP('tongue', tongueXPGain);
        // XP toast + level-up celebration are handled by BaseGameScene via eventBus.
        
        // Tutorial: Show completion message AFTER auction win modal is dismissed
        let isTutorialComplete = false;
        try {
          isTutorialComplete = this.tutorialManager.isOnRedemptionStep();
        } catch (error) {
          errorLog('Tutorial error checking completion:', error);
        }
        
        this.uiManager.showModal(
          'You Won!',
          `${message}\n\nYou bought ${this.car.name} for ${formatCurrency(this.currentBid)}!${leveledUp ? '\n\n🎉 Your Tongue skill leveled up!' : ''}`,
          [
            {
              text: 'Stay',
              onClick: () => {},
            },
            {
              text: 'Back to Map',
              onClick: () => {
                if (isTutorialComplete) {
                  // Show tutorial completion dialogue before returning to map
                  this.tutorialManager.showDialogueWithCallback(
                    "Uncle Ray",
                    "🎉 Congratulations! 🎉\n\nYou've mastered the basics of car collecting:\n• Winning cars through auctions\n• Restoring cars to increase value\n• Bidding strategically\n• Reading rival behavior\n\nNow go build the world's greatest car collection! Remember: every car tells a story, and you're the curator.",
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
              this.uiManager.showModal(
                'Redemption Auction',
                'Uncle Ray found another car in the same sale. Want to jump straight into the next auction?',
                [
                  { text: 'Stay', onClick: () => {} },
                  {
                    text: 'Start Next Auction',
                    onClick: () => {
                      this.tutorialManager.onRedemptionPromptAccepted();
                      const boxywagon = getCarById('car_tutorial_boxy_wagon');
                      const scrappyJoe = getRivalById('scrapyard_joe');
                      if (boxywagon && scrappyJoe) {
                        const interest = calculateRivalInterest(scrappyJoe, boxywagon.tags);
                        this.scene.start('AuctionScene', { car: boxywagon, rival: scrappyJoe, interest });
                      }
                    },
                  },
                ]
              );
            }
          );
          return;
        }
      } catch (error) {
        errorLog('Tutorial error in redemption flow:', error);
        // Continue with normal loss flow
      }
      
      // Normal loss flow
      try {
        if (this.tutorialManager.isOnRedemptionStep()) {
          this.tutorialManager.showDialogueWithCallback(
            'Uncle Ray',
            'No worries—redemption means we keep coming back until we win. Head back to the Auction House and we\'ll run it again.',
            () => {
              this.uiManager.showModal(
                'Back to Map',
                'Head back to the Auction House and try again when you are ready.',
                [
                  { text: 'Stay', onClick: () => {} },
                  { text: 'Back to Map', onClick: () => this.scene.start('MapScene') },
                ]
              );
            }
          );
          return;
        }
      } catch (error) {
        errorLog('Tutorial error in redemption loss flow:', error);
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
            text: 'Stay',
            onClick: () => {},
          },
          {
            text: 'Back to Map',
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
          text: 'Close',
          onClick: () => {},
        },
        {
          text: 'Back to Map',
          onClick: () => this.scene.start('MapScene'),
        },
      ]
    );
  }

}
