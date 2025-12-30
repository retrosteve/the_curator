import { debugLog, errorLog } from '@/utils/log';
import { BaseGameScene } from './base-game-scene';
import { Car, calculateCarValue, getCarById } from '@/data/car-database';
import { Rival, getRivalById, calculateRivalInterest, BarkTrigger, getRivalBark } from '@/data/rival-database';
import { BASE_LOCATIONS } from '@/data/location-database';
import { getCharacterPortraitUrlOrPlaceholder } from '@/assets/character-portraits';
import { getCarImageUrlOrPlaceholder } from '@/assets/car-images';
import { RivalAI } from '@/systems/rival-ai';
import { GAME_CONFIG } from '@/config/game-config';
import { formatCurrency } from '@/utils/format';
import type { AuctionRivalEntry } from '@/systems/map-encounter-router';
import type { SpecialEvent } from '@/systems/special-events-system';
import {
  createEncounterCenteredLayoutRoot,
  disableEncounterActionButton,
  formatEncounterNeedLabel,
  ensureEncounterLayoutStyles,
} from '@/ui/internal/ui-encounter';
import { ensureStyleElement, isPixelUIEnabled } from '@/ui/internal/ui-style';
import {
  type BiddingContext,
  type BiddingCallbacks,
  type BidderId,
  makeRivalBidderId,
  playerBid as playerBidInternal,
  playerKickTires as playerKickTiresInternal,
  playerStall as playerStallInternal,
  rivalTurnImmediate as rivalTurnImmediateInternal,
  rivalOnlyTurnImmediate as rivalOnlyTurnImmediateInternal,
} from './internal/auction-bidding';

type BidHistoryEntry = {
  bidderId: BidderId;
  totalBid: number;
  atMs: number;
};

type AuctionParticipantKey = 'auctioneer' | BidderId;

type ParticipantFlashState = {
  anchors: Partial<Record<AuctionParticipantKey, HTMLDivElement>>;
  clearTimeoutIds: Partial<Record<AuctionParticipantKey, number>>;
};

type ParticipantBarkState = {
  active: Partial<Record<AuctionParticipantKey, { text: string; tone: 'bid' | 'comment' | 'drop'; expiresAtMs: number; durationMs: number }>>;
  bubbles: Partial<Record<AuctionParticipantKey, HTMLDivElement>>;
  clearTimeoutIds: Partial<Record<AuctionParticipantKey, number>>;
};

type ParticipantTurnFocusState = {
  rows: Partial<Record<BidderId, HTMLDivElement>>;
  appliedBidderId?: BidderId;
  desiredBidderId?: BidderId;
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
  private rivals: Rival[] = [];
  private rivalAIsById: Record<string, RivalAI> = {};
  private activeRivalIds: string[] = [];
  private locationId?: string;
  private specialEvent?: SpecialEvent;
  private specialEventBonusesApplied: boolean = false;
  private auctioneerName!: string;
  private encounterStarted: boolean = false;
  private auctionResolved: boolean = false;
  private currentBid: number = 0;
  private stallUsesThisAuction: number = 0;
  private powerBidStreak: number = 0;
  private auctionMarketEstimateValue: number = 0;
  private playerHasWithdrawn: boolean = false;

  // Participant portrait anchors + flash timers.
  private participantFlash: ParticipantFlashState = { anchors: {}, clearTimeoutIds: {} };
  private participantBark: ParticipantBarkState = { active: {}, bubbles: {}, clearTimeoutIds: {} };
  private participantTurnFocus: ParticipantTurnFocusState = { rows: {}, appliedBidderId: undefined, desiredBidderId: undefined };

  private pendingUIRefreshTimeoutId?: number;
  private pendingRivalBarkTimeoutId?: number;
  private pendingRivalTurnTimeoutId?: number;
  private pendingPlayerTurnEnableTimeoutId?: number;
  private pendingEndAuctionTimeoutId?: number;

  private isPlayerTurn: boolean = false;
  private lastBidder?: BidderId;

  private bidHistory: BidHistoryEntry[] = [];
  private auctioneerQuoteEl?: HTMLElement;
  private hasAnyBids: boolean = false;

  private lastRenderedCurrentBid?: number;

  private pendingRivalConsiderationStepTimeoutId?: number;

  private static readonly STARTING_BID_MULTIPLIER = GAME_CONFIG.auction.startingBidMultiplier;
  private static readonly BID_INCREMENT = GAME_CONFIG.auction.bidIncrement;
  private static readonly POWER_BID_INCREMENT = GAME_CONFIG.auction.powerBidIncrement;

  // Pacing controls (AuctionScene-only).
  // Increase these to make auctions feel less "snappy".
  private static readonly TURN_DELAY_MULTIPLIER = 1.6;
  private static readonly RIVAL_CONSIDERATION_MULTIPLIER = 1.35;

  // After the player withdraws, the auction is informational only.
  // Speed it up so the player isn't waiting through full "thinking" cadence.
  private static readonly WITHDRAWN_TURN_DELAY_MULTIPLIER = 0.35;
  private static readonly WITHDRAWN_RIVAL_CONSIDERATION_MULTIPLIER = 0.35;
  private static readonly WITHDRAWN_BARK_DELAY_MULTIPLIER = 0.4;

  private static readonly KICK_TIRES_BUDGET_REDUCTION = GAME_CONFIG.auction.kickTires.rivalBudgetReduction;
  private static readonly REQUIRED_EYE_LEVEL_FOR_KICK_TIRES = GAME_CONFIG.auction.kickTires.requiredEyeLevel;

  private static readonly REQUIRED_TONGUE_LEVEL_FOR_STALL = GAME_CONFIG.auction.stall.requiredTongueLevel;

  constructor() {
    super({ key: 'AuctionScene' });
  }

  init(
    data:
      | { car: Car; rivals: AuctionRivalEntry[]; locationId?: string; specialEvent?: SpecialEvent }
      | { car: Car; rival: Rival; interest: number; locationId?: string; specialEvent?: SpecialEvent }
  ): void {
    // This scene instance is reused across runs; aggressively reset any transient state
    // so a previous auction attempt (e.g., player withdrawal) can't leak into a retry.
    this.clearPendingUIRefresh();
    this.clearPendingRivalTurn();
    this.clearPendingRivalBark();
    this.clearPendingPlayerTurnEnable();
    this.clearPendingEndAuction();
    this.clearAllParticipantFlashTimeouts();
    this.clearAllParticipantBarkTimeouts();

    this.car = data.car;

    const rivalEntries: AuctionRivalEntry[] =
      'rivals' in data && Array.isArray(data.rivals)
        ? data.rivals
        : 'rival' in data && data.rival
          ? [
              {
                rival: data.rival,
                interest: Number.isFinite(data.interest)
                  ? data.interest
                  : calculateRivalInterest(data.rival, data.car.tags),
              },
            ]
          : [];
    if (rivalEntries.length === 0) {
      errorLog('AuctionScene.init: missing rivals in scene start data', data);
    }

    this.rivals = rivalEntries.map((e) => e.rival);
    this.rivalAIsById = {};
    for (const entry of rivalEntries) {
      this.rivalAIsById[entry.rival.id] = new RivalAI(entry.rival, entry.interest);
    }
    this.activeRivalIds = this.rivals.map((r) => r.id);
    this.locationId = data.locationId;
    this.specialEvent = data.specialEvent;
    this.specialEventBonusesApplied = false;
    this.auctioneerName = AUCTIONEER_NAMES[Math.floor(Math.random() * AUCTIONEER_NAMES.length)];
    this.encounterStarted = false;
    this.auctionResolved = false;
    this.playerHasWithdrawn = false;
    this.isPlayerTurn = false;
    this.lastBidder = undefined;
    // Initialize with non-market value; we'll re-evaluate once managers are ready.
    this.currentBid = Math.floor(calculateCarValue(this.car) * AuctionScene.STARTING_BID_MULTIPLIER);
    this.stallUsesThisAuction = 0;
    this.powerBidStreak = 0;
    this.bidHistory = [];
    this.auctioneerQuoteEl = undefined;
    this.auctionMarketEstimateValue = 0;

    this.participantFlash = { anchors: {}, clearTimeoutIds: {} };
    this.participantBark = { active: {}, bubbles: {}, clearTimeoutIds: {} };
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
      this.uiManager.showGarageFullGate({
        message: 'Your garage is full. Sell or scrap a car before entering an auction.',
        primary: { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
        secondary: { text: 'Back to Map', onClick: () => this.scene.start('MapScene') },
      });
      return;
    }

    // Defensive guard: don't start an auction if the player can't even afford the opening bid.
    // Important: do NOT consume the daily offer in this case (player never meaningfully participated).
    if (player.money < this.currentBid) {
      this.uiManager.showCannotAffordAuctionModal({
        context: 'auction-entry',
        openingBid: this.currentBid,
        playerMoney: player.money,
        onGoToGarage: () => this.scene.start('GarageScene'),
        onBackToMap: () => this.scene.start('MapScene'),
      });
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
      this.clearAllParticipantBarkTimeouts();
    });
  }

  private clearAllParticipantFlashTimeouts(): void {
    for (const id of Object.values(this.participantFlash.clearTimeoutIds)) {
      if (id !== undefined) window.clearTimeout(id);
    }
    this.participantFlash.clearTimeoutIds = {};
  }

  private clearAllParticipantBarkTimeouts(): void {
    for (const id of Object.values(this.participantBark.clearTimeoutIds)) {
      if (id !== undefined) window.clearTimeout(id);
    }
    this.participantBark.clearTimeoutIds = {};
    this.participantBark.bubbles = {};
    this.participantBark.active = {};
  }

  private attachParticipantBarkBubble(participant: AuctionParticipantKey): void {
    const active = this.participantBark.active[participant];
    if (!active) return;
    if (Date.now() >= active.expiresAtMs) {
      this.participantBark.active[participant] = undefined;
      const existing = this.participantBark.bubbles[participant];
      if (existing && existing.isConnected) existing.remove();
      this.participantBark.bubbles[participant] = undefined;
      return;
    }

    const anchor = this.participantFlash.anchors[participant];
    if (!anchor || !anchor.isConnected) return;

    const pixelUI = isPixelUIEnabled();

    const toneColors = (() => {
      switch (active.tone) {
        case 'bid':
          return {
            border: 'rgba(76, 175, 80, 0.65)',
            bg: 'rgba(10, 30, 14, 0.92)',
          };
        case 'drop':
          return {
            border: 'rgba(244, 67, 54, 0.70)',
            bg: 'rgba(36, 10, 10, 0.92)',
          };
        case 'comment':
        default:
          return {
            border: 'rgba(33, 150, 243, 0.65)',
            bg: 'rgba(8, 16, 34, 0.92)',
          };
      }
    })();

    let bubble = this.participantBark.bubbles[participant];
    if (!bubble || !bubble.isConnected) {
      bubble = document.createElement('div');
      this.participantBark.bubbles[participant] = bubble;

      Object.assign(bubble.style, {
        position: 'absolute',
        left: '50%',
        bottom: '100%',
        transform: 'translate(-50%, -12px)',
        maxWidth: '320px',
        padding: '8px 10px',
        fontSize: '12px',
        lineHeight: '1.25',
        backgroundColor: toneColors.bg,
        border: `1px solid ${toneColors.border}`,
        borderRadius: pixelUI ? '0px' : '14px',
        color: '#f0f0f0',
        whiteSpace: 'normal',
        zIndex: '30',
        pointerEvents: 'none',
        boxSizing: 'border-box',
        textAlign: 'center',
      } satisfies Partial<CSSStyleDeclaration>);

      const textEl = document.createElement('div');
      textEl.dataset['role'] = 'bark-text';
      bubble.appendChild(textEl);

      // Tail with an outline: border triangle + inner fill triangle.
      const tailBorder = document.createElement('div');
      tailBorder.dataset['role'] = 'bark-tail-border';
      Object.assign(tailBorder.style, {
        position: 'absolute',
        left: '50%',
        top: '100%',
        transform: 'translateX(-50%)',
        width: '0',
        height: '0',
        borderLeft: '8px solid transparent',
        borderRight: '8px solid transparent',
        borderTop: `8px solid ${toneColors.border}`,
      } satisfies Partial<CSSStyleDeclaration>);

      const tailFill = document.createElement('div');
      tailFill.dataset['role'] = 'bark-tail-fill';
      Object.assign(tailFill.style, {
        position: 'absolute',
        left: '50%',
        top: '100%',
        transform: 'translateX(-50%) translateY(-1px)',
        width: '0',
        height: '0',
        borderLeft: '7px solid transparent',
        borderRight: '7px solid transparent',
        borderTop: `7px solid ${toneColors.bg}`,
      } satisfies Partial<CSSStyleDeclaration>);

      bubble.appendChild(tailBorder);
      bubble.appendChild(tailFill);

      anchor.appendChild(bubble);
    }

    const textEl = bubble.querySelector<HTMLDivElement>('div[data-role="bark-text"]');
    if (textEl) textEl.textContent = `"${active.text}"`;

    // Keep tone styling in sync if the bubble was reused.
    bubble.style.backgroundColor = toneColors.bg;
    bubble.style.border = `1px solid ${toneColors.border}`;
    const tailBorder = bubble.querySelector<HTMLDivElement>('div[data-role="bark-tail-border"]');
    if (tailBorder) tailBorder.style.borderTopColor = toneColors.border;
    const tailFill = bubble.querySelector<HTMLDivElement>('div[data-role="bark-tail-fill"]');
    if (tailFill) tailFill.style.borderTopColor = toneColors.bg;
  }

  private renderActiveParticipantBarkBubbles(): void {
    const now = Date.now();
    for (const key of Object.keys(this.participantBark.active) as AuctionParticipantKey[]) {
      const active = this.participantBark.active[key];
      if (!active) continue;
      if (now >= active.expiresAtMs) {
        this.participantBark.active[key] = undefined;
        continue;
      }
      this.attachParticipantBarkBubble(key);
    }
  }

  private showParticipantBarkBubble(
    participant: AuctionParticipantKey,
    text: string,
    options?: { durationMs?: number; tone?: 'bid' | 'comment' | 'drop' }
  ): void {
    const durationMs = options?.durationMs ?? 2400;

    const now = Date.now();
    this.participantBark.active[participant] = {
      text,
      tone: options?.tone ?? 'comment',
      durationMs,
      expiresAtMs: now + durationMs,
    };

    const existingTimeout = this.participantBark.clearTimeoutIds[participant];
    if (existingTimeout !== undefined) {
      window.clearTimeout(existingTimeout);
      this.participantBark.clearTimeoutIds[participant] = undefined;
    }

    // Render immediately if we have an anchor; otherwise it will render on the next setupUI.
    this.attachParticipantBarkBubble(participant);

    this.participantBark.clearTimeoutIds[participant] = window.setTimeout(() => {
      this.participantBark.clearTimeoutIds[participant] = undefined;
      this.participantBark.active[participant] = undefined;
      const bubble = this.participantBark.bubbles[participant];
      if (bubble && bubble.isConnected) bubble.remove();
      this.participantBark.bubbles[participant] = undefined;
    }, durationMs);
  }

  private flashParticipant(participant: AuctionParticipantKey): void {
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
    const scaledDelayMs = Math.max(0, Math.round(delayMs * AuctionScene.TURN_DELAY_MULTIPLIER));
    this.pendingPlayerTurnEnableTimeoutId = window.setTimeout(() => {
      this.pendingPlayerTurnEnableTimeoutId = undefined;
      if (!this.scene.isActive()) return;
      this.isPlayerTurn = true;
      this.setTurnFocusBidder('player');
      this.setupUI();
    }, scaledDelayMs);
  }

  private setTurnFocusBidder(bidderId?: BidderId): void {
    this.participantTurnFocus.desiredBidderId = bidderId;
    this.applyTurnFocusBidder();
  }

  private applyTurnFocusBidder(): void {
    const next = this.participantTurnFocus.desiredBidderId;
    const prev = this.participantTurnFocus.appliedBidderId;

    if (prev && prev !== next) {
      const prevRow = this.participantTurnFocus.rows[prev];
      if (prevRow) prevRow.classList.remove('auction-bidder-row--turn');
    }

    if (next) {
      const nextRow = this.participantTurnFocus.rows[next];
      if (nextRow) nextRow.classList.add('auction-bidder-row--turn');
    }

    this.participantTurnFocus.appliedBidderId = next;
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
    this.setTurnFocusBidder(undefined);
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

    // From here on, the player is withdrawn: rivals should continue bidding until a winner.
    this.playerHasWithdrawn = true;
    this.isPlayerTurn = false;
    this.setTurnFocusBidder(undefined);
    this.setupUI();

    // If there are no rivals left, the player wins by default (rare edge-case).
    if (this.activeRivalIds.length === 0) {
      this.endAuction('player', 'All rival bidders dropped out.');
      return;
    }

    // Continue bidding among rivals. Preserve the current high bidder unless:
    // - the player was the current high bidder (player withdrew), or
    // - the stored rival high bidder is no longer active.
    const lastBidderRivalId =
      this.lastBidder && this.lastBidder.startsWith('rival:') ? this.lastBidder.slice('rival:'.length) : null;
    const lastBidderIsInactiveRival = !!lastBidderRivalId && !this.activeRivalIds.includes(lastBidderRivalId);
    if (this.lastBidder === 'player' || this.lastBidder === undefined || lastBidderIsInactiveRival) {
      // Re-open bidding at the current price without a current leader.
      this.hasAnyBids = false;
      this.lastBidder = undefined;
    }
    this.showToastAndLog('You withdraw. Bidding continues without you.', { backgroundColor: '#607d8b' });

    // Kick off the rival-only sequence.
    this.scheduleRivalTurn(Math.max(0, Math.floor(GAME_CONFIG.ui.modalDelays.nextTurnAfterAuctioneer * 0.6)));
    return;
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
    if (this.pendingRivalConsiderationStepTimeoutId !== undefined) {
      window.clearTimeout(this.pendingRivalConsiderationStepTimeoutId);
      this.pendingRivalConsiderationStepTimeoutId = undefined;
    }
  }

  private shuffleInPlace<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  private runRivalTurnWithConsideration(isRivalOnly: boolean): void {
    if (!this.scene.isActive()) return;

    const active = this.activeRivalIds.slice();
    if (active.length === 0) {
      this.endAuction('player', 'No rival bidders remain.');
      return;
    }

    const order = active.slice();
    this.shuffleInPlace(order);

    const considerationMultiplier = isRivalOnly
      ? AuctionScene.WITHDRAWN_RIVAL_CONSIDERATION_MULTIPLIER
      : AuctionScene.RIVAL_CONSIDERATION_MULTIPLIER;

    // Provide a visible "thinking" cadence.
    // Cap total delay so auctions don't feel sluggish with many rivals.
    const maxTotalMs = Math.round(2600 * considerationMultiplier);
    const minStepMs = Math.round(340 * considerationMultiplier);
    const maxStepMs = Math.round(650 * considerationMultiplier);
    const stepMs = Math.min(maxStepMs, Math.max(minStepMs, Math.floor(maxTotalMs / Math.max(1, order.length))));

    type RivalTurnDecision = ReturnType<RivalAI['decideBid']>;
    const decisions: Record<string, RivalTurnDecision> = {};

    let idx = 0;
    const step = (): void => {
      if (!this.scene.isActive()) return;

      // If the auction state changed mid-chain (e.g., someone quit), skip missing ids.
      while (idx < order.length && !this.activeRivalIds.includes(order[idx]!)) {
        idx++;
      }

      if (idx >= order.length) {
        // Execute the actual rival turn using the precomputed decisions.
        if (isRivalOnly) {
          this.rivalOnlyTurnImmediate(order, decisions);
        } else {
          this.rivalTurnImmediate(order, decisions);
        }
        return;
      }

      const rivalId = order[idx]!;
      idx++;

      // Highlight the rival portrait so the player sees who is "thinking".
      this.setTurnFocusBidder(makeRivalBidderId(rivalId));
      this.flashParticipant(makeRivalBidderId(rivalId));

      const ai = this.rivalAIsById[rivalId];
      if (ai) {
        const decision = ai.decideBid(this.currentBid);
        decisions[rivalId] = decision;

        if (!decision.shouldBid) {
          const currentHigh = this.lastBidder && this.lastBidder.startsWith('rival:')
            ? this.lastBidder.slice('rival:'.length)
            : null;

          const outOfPatience = ai.getPatience() <= 0;
          const outOfBudget = this.currentBid > ai.getBudget();
          const willDrop = (outOfPatience || outOfBudget) && (!currentHigh || rivalId !== currentHigh);

          const message = outOfPatience ? "I'm out." : outOfBudget ? "Can't afford it." : 'Pass.';

          const bubbleMs = Math.min(1800, Math.max(550, stepMs + 350));
          this.showParticipantBarkBubble(makeRivalBidderId(rivalId), message, {
            durationMs: bubbleMs,
            tone: willDrop ? 'drop' : 'comment',
          });
        }
      }

      this.pendingRivalConsiderationStepTimeoutId = window.setTimeout(() => {
        this.pendingRivalConsiderationStepTimeoutId = undefined;
        step();
      }, stepMs);
    };

    step();
  }

  private scheduleRivalTurn(delayMs: number = GAME_CONFIG.ui.modalDelays.rivalBid): void {
    this.clearPendingRivalTurn();
    const multiplier = this.playerHasWithdrawn
      ? AuctionScene.WITHDRAWN_TURN_DELAY_MULTIPLIER
      : AuctionScene.TURN_DELAY_MULTIPLIER;
    const scaledDelayMs = Math.max(0, Math.round(delayMs * multiplier));
    this.pendingRivalTurnTimeoutId = window.setTimeout(() => {
      this.pendingRivalTurnTimeoutId = undefined;
      if (!this.scene.isActive()) return;
      this.runRivalTurnWithConsideration(this.playerHasWithdrawn);
    }, scaledDelayMs);
  }

  private rivalOnlyTurnImmediate(
    rivalTurnOrder?: string[],
    rivalTurnDecisions?: Record<string, ReturnType<RivalAI['decideBid']>>
  ): void {
    // Cap rival-vs-rival bidding after the player withdraws to avoid extreme overpaying.
    // Allow a modest premium over the estimate so outcomes still feel competitive.
    const rivalOnlyMaxBid = Math.floor(this.auctionMarketEstimateValue * 1.05);

    const context: BiddingContext = {
      car: this.car,
      rivals: this.rivals,
      rivalAIsById: this.rivalAIsById,
      auctioneerName: this.auctioneerName,
      currentBid: this.currentBid,
      hasAnyBids: this.hasAnyBids,
      lastBidder: this.lastBidder,
      stallUsesThisAuction: this.stallUsesThisAuction,
      powerBidStreak: this.powerBidStreak,
      isPlayerTurn: false,
      locationId: this.locationId,
      activeRivalIds: this.activeRivalIds,
      maxBid: rivalOnlyMaxBid,
      rivalTurnOrder,
      rivalTurnDecisions,
    };

    const callbacks: BiddingCallbacks = {
      gameManager: this.gameManager,
      uiManager: this.uiManager,
      onShowToastAndLog: (toast: string, opts?: { backgroundColor?: string }, log?: string, logKind?: string) =>
        this.showToastAndLog(toast, opts, log, logKind),
      onRivalDroppedOut: (rivalId: string, reason: 'patience' | 'budget') => {
        const message = this.getRivalQuickStatusBubbleText(rivalId, {
          willDrop: true,
          outOfPatience: reason === 'patience',
          outOfBudget: reason === 'budget',
        });
        this.showParticipantBarkBubble(makeRivalBidderId(rivalId), message, { durationMs: 1800, tone: 'drop' });
      },
      onRecordBid: (bidderId: BidderId, totalBid: number) => {
        this.currentBid = totalBid;
        this.recordBid(bidderId, totalBid);
      },
      onShowAuctioneerBark: (trigger: string) => {
        // Keep barks aligned to the latest context bid.
        this.currentBid = context.currentBid;
        this.showAuctioneerBark(trigger as any);
      },
      onShowRivalBarkAfterAuctioneer: (rivalId: string, trigger: BarkTrigger, delayMs?: number) =>
        this.showRivalBarkAfterAuctioneer(rivalId, trigger, delayMs),
      onSetupUI: () => this.setupUI(),
      onScheduleRivalTurn: (delayMs: number) => this.scheduleRivalTurn(delayMs),
      // In rival-only mode, "enable player" means "continue the rival bidding cadence".
      onScheduleEnablePlayerTurn: (delayMs?: number) =>
        this.scheduleRivalTurn(delayMs ?? GAME_CONFIG.ui.modalDelays.nextTurnAfterAuctioneer),
      onEndAuction: (winner: BidderId, message: string, rivalFinalBarkTrigger?: BarkTrigger) => {
        // Ensure the final message reflects the latest bid from the bidding context.
        this.currentBid = context.currentBid;
        const finalMessage = `${message}\n\nYou left early. ${this.getBidderDisplayName(winner)} wins for ${formatCurrency(context.currentBid)}.`;
        this.endAuction(winner, finalMessage, rivalFinalBarkTrigger);
      },
    };

    const updatedContext = rivalOnlyTurnImmediateInternal(context, callbacks);

    this.currentBid = updatedContext.currentBid;
    this.hasAnyBids = updatedContext.hasAnyBids;
    this.lastBidder = updatedContext.lastBidder;
    this.stallUsesThisAuction = updatedContext.stallUsesThisAuction;
    this.powerBidStreak = updatedContext.powerBidStreak;
    this.isPlayerTurn = false;
    this.activeRivalIds = updatedContext.activeRivalIds;
  }

  private clearPendingRivalBark(): void {
    if (this.pendingRivalBarkTimeoutId !== undefined) {
      window.clearTimeout(this.pendingRivalBarkTimeoutId);
      this.pendingRivalBarkTimeoutId = undefined;
    }
  }

  private showRivalBarkAfterAuctioneer(
    rivalId: string,
    trigger: BarkTrigger,
    delayMs: number = GAME_CONFIG.ui.modalDelays.rivalBarkAfterAuctioneer
  ): void {
    this.clearPendingRivalBark();
    const effectiveDelayMs = this.playerHasWithdrawn
      ? Math.max(0, Math.round(delayMs * AuctionScene.WITHDRAWN_BARK_DELAY_MULTIPLIER))
      : delayMs;
    this.pendingRivalBarkTimeoutId = window.setTimeout(() => {
      this.pendingRivalBarkTimeoutId = undefined;
      if (!this.scene.isActive()) return;
      this.showRivalBark(rivalId, trigger);
    }, effectiveDelayMs);
  }

  private recordBid(bidderId: BidderId, totalBid: number): void {
    this.bidHistory.push({ bidderId, totalBid, atMs: Date.now() });
    if (this.bidHistory.length > 50) {
      this.bidHistory.splice(0, this.bidHistory.length - 50);
    }
    this.flashParticipant(bidderId);
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
    // Do not clear active bark timers here: setupUI is called frequently (e.g., enabling player turn).
    // Instead, drop only DOM refs; we will re-attach active bubbles after the new UI mounts.
    this.participantBark.bubbles = {};
    this.participantFlash.anchors = {};
    this.participantTurnFocus.rows = {};
    this.participantTurnFocus.appliedBidderId = undefined;
    this.auctioneerQuoteEl = undefined;

    this.resetUIWithHUD();

    // Ensure we never show a stale "turn" outline on resolved encounters.
    if (this.auctionResolved) {
      this.setTurnFocusBidder(undefined);
    } else if (this.isPlayerTurn) {
      this.setTurnFocusBidder('player');
    }

    const player = this.gameManager.getPlayerState();

    // Minimal responsive layout tweaks for the auction UI.
    ensureEncounterLayoutStyles({
      styleId: 'auctionLayoutStyles',
      rootClass: 'auction-layout',
      topClass: 'auction-layout__main',
      bottomClass: 'auction-layout__main',
    });

    ensureStyleElement(
      'auctionBidPopStyles',
      `
        @keyframes auctionBidPop {
          0% { transform: scale(1); }
          45% { transform: scale(1.18); }
          100% { transform: scale(1); }
        }
        .auction-bid-pop {
          animation: auctionBidPop 180ms ease-out;
          transform-origin: center center;
          will-change: transform;
        }
      `
    );

    const layoutRoot = createEncounterCenteredLayoutRoot('auction-layout');
    Object.assign(layoutRoot.style, {
      top: '64px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(1180px, calc(100% - 40px))',
      height: 'calc(100% - 76px)',
      maxHeight: 'none',
      // Keep overflow visible so anchored bark bubbles aren't clipped.
      overflowY: 'visible',
      overflowX: 'visible',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      boxSizing: 'border-box',
    } satisfies Partial<CSSStyleDeclaration>);

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
      padding: '10px 12px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
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

      // Special event encounters remove the event from the active list when started,
      // so keep the name around from the scene start payload.
      if (this.specialEvent && this.specialEvent.id === this.locationId) return this.specialEvent.name;

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

    header.appendChild(headerLeft);
    layoutRoot.appendChild(header);

    // Bid bar: sits directly under the header and spans the full layout width.
    const bidBar = this.uiManager.createPanel({
      padding: '8px 10px',
      display: 'grid',
      gridTemplateColumns: 'auto minmax(0, 1fr) auto',
      alignItems: 'center',
      gap: '12px',
    });
    Object.assign(bidBar.style, {
      // Bubbles are positioned above portrait anchors; don't clip them.
      overflow: 'visible',
    } satisfies Partial<CSSStyleDeclaration>);

    const auctioneerBox = document.createElement('div');
    Object.assign(auctioneerBox.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      flex: '0 0 auto',
      minWidth: '0',
    } satisfies Partial<CSSStyleDeclaration>);

    const statusAuctioneerPortrait = makePortraitAnchor(
      getCharacterPortraitUrlOrPlaceholder(this.auctioneerName),
      `${this.auctioneerName} portrait`,
      34
    );
    this.participantFlash.anchors.auctioneer = statusAuctioneerPortrait;

    const statusAuctioneerMeta = document.createElement('div');
    Object.assign(statusAuctioneerMeta.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
      minWidth: '0',
      alignItems: 'flex-start',
    } satisfies Partial<CSSStyleDeclaration>);
    statusAuctioneerMeta.appendChild(
      this.uiManager.createText('Auctioneer', {
        margin: '0',
        fontSize: '11px',
        opacity: '0.75',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        textAlign: 'left',
      })
    );
    statusAuctioneerMeta.appendChild(
      this.uiManager.createText(this.auctioneerName, {
        margin: '0',
        fontWeight: '900',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        textAlign: 'left',
        color: '#ffd700',
      })
    );

    auctioneerBox.appendChild(statusAuctioneerPortrait);
    auctioneerBox.appendChild(statusAuctioneerMeta);

    const currentBidBox = document.createElement('div');
    Object.assign(currentBidBox.style, {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4px',
      minWidth: '0',
    } satisfies Partial<CSSStyleDeclaration>);
    currentBidBox.appendChild(
      this.uiManager.createText('Current bid', {
        margin: '0',
        fontSize: '11px',
        opacity: '0.75',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        textAlign: 'center',
      })
    );
    currentBidBox.appendChild(
      this.uiManager.createText(formatCurrency(this.currentBid), {
        margin: '0',
        fontWeight: '900',
        fontSize: '16px',
        color: '#ffd700',
        textAlign: 'center',
        whiteSpace: 'nowrap',
      })
    );

    const currentBidValueEl = currentBidBox.lastElementChild as HTMLElement | null;

    const nextBidBox = document.createElement('div');
    Object.assign(nextBidBox.style, {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      justifyContent: 'center',
      gap: '4px',
      minWidth: '0',
    } satisfies Partial<CSSStyleDeclaration>);
    nextBidBox.appendChild(
      this.uiManager.createText('Next bid', {
        margin: '0',
        fontSize: '11px',
        opacity: '0.75',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        textAlign: 'right',
      })
    );
    nextBidBox.appendChild(
      this.uiManager.createText(formatCurrency(normalBidTotal), {
        margin: '0',
        fontWeight: '800',
        fontSize: '12px',
        opacity: '0.9',
        textAlign: 'right',
        whiteSpace: 'nowrap',
      })
    );

    bidBar.appendChild(auctioneerBox);
    bidBar.appendChild(currentBidBox);
    bidBar.appendChild(nextBidBox);
    layoutRoot.appendChild(bidBar);

    const shouldPopCurrentBid =
      this.lastRenderedCurrentBid !== undefined && this.currentBid > this.lastRenderedCurrentBid;
    if (shouldPopCurrentBid && currentBidValueEl) {
      currentBidValueEl.classList.remove('auction-bid-pop');
      // Force reflow so the animation reliably restarts.
      void currentBidValueEl.offsetWidth;
      currentBidValueEl.classList.add('auction-bid-pop');
    }

    const mainGrid = document.createElement('div');
    mainGrid.classList.add('auction-layout__main');
    Object.assign(mainGrid.style, {
      display: 'grid',
      // Swap columns: info/status column on the left, car/bidding column on the right.
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)',
      gap: '10px',
      alignItems: 'stretch',
      flex: '1 1 auto',
      minHeight: '0',
    } satisfies Partial<CSSStyleDeclaration>);

    const leftCol = document.createElement('div');
    Object.assign(leftCol.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      minWidth: '0',
      minHeight: '0',
      // Allow bark bubbles to extend beyond panels.
      overflow: 'visible',
    } satisfies Partial<CSSStyleDeclaration>);

    const rightCol = document.createElement('div');
    Object.assign(rightCol.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      minWidth: '0',
      minHeight: '0',
      // Allow bark bubbles to extend beyond panels.
      overflow: 'visible',
    } satisfies Partial<CSSStyleDeclaration>);

    // LEFT: car + quick stats (compact; uses width instead of height)
    const marketValue = this.auctionMarketEstimateValue;
    const carStatsPanel = this.uiManager.createPanel({
      margin: '0',
      padding: '8px 10px',
    });

    const carStatsTitle = this.uiManager.createHeading(this.car.name, 3, {
      margin: '0 0 6px 0',
      color: '#ecf0f1',
      textAlign: 'left',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });
    carStatsPanel.appendChild(carStatsTitle);

    const carStatsRow = document.createElement('div');
    Object.assign(carStatsRow.style, {
      display: 'flex',
      alignItems: 'stretch',
      gap: '10px',
      minWidth: '0',
    } satisfies Partial<CSSStyleDeclaration>);

    const templateId = this.car.templateId ?? this.car.id;
    const imageUrl = getCarImageUrlOrPlaceholder(templateId);
    const carImg = document.createElement('img');
    carImg.src = imageUrl;
    carImg.alt = this.car.name;
    carImg.loading = 'lazy';
    carImg.className = 'car-info-image';
    Object.assign(carImg.style, {
      width: '220px',
      height: '120px',
      objectFit: 'cover',
      flex: '0 0 auto',
      borderRadius: pixelUI ? '0px' : '12px',
      border: '2px solid rgba(255,255,255,0.16)',
      backgroundColor: 'rgba(0,0,0,0.18)',
      imageRendering: pixelUI ? 'pixelated' : 'auto',
      boxSizing: 'border-box',
    } satisfies Partial<CSSStyleDeclaration>);

    const statsGrid = document.createElement('div');
    Object.assign(statsGrid.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: '6px',
      flex: '1 1 auto',
      minWidth: '0',
      alignContent: 'start',
    } satisfies Partial<CSSStyleDeclaration>);

    const makeStatChip = (label: string, value: string, valueColor?: string): HTMLDivElement => {
      const chip = document.createElement('div');
      Object.assign(chip.style, {
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: pixelUI ? '0px' : '12px',
        padding: '6px 6px',
        backgroundColor: 'rgba(0,0,0,0.14)',
        minWidth: '0',
      } satisfies Partial<CSSStyleDeclaration>);

      chip.appendChild(
        this.uiManager.createText(label, {
          margin: '0 0 3px 0',
          fontSize: '10px',
          opacity: '0.75',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        })
      );
      chip.appendChild(
        this.uiManager.createText(value, {
          margin: '0',
          fontWeight: '800',
          fontSize: '13px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: valueColor ?? '#e0e6ed',
        })
      );

      return chip;
    };

    statsGrid.appendChild(makeStatChip('Estimate', formatCurrency(marketValue), '#FFC107'));
    statsGrid.appendChild(makeStatChip('Condition', `${Math.round(this.car.condition)}/100`, '#4CAF50'));

    carStatsRow.appendChild(carImg);
    carStatsRow.appendChild(statsGrid);
    carStatsPanel.appendChild(carStatsRow);
    leftCol.appendChild(carStatsPanel);

    // LEFT: bidding controls (reference: quick increments + place bid)
    const biddingPanel = this.uiManager.createPanel({
      padding: '10px',
    });
    biddingPanel.appendChild(
      this.uiManager.createHeading('PLACE YOUR BID', 3, {
        margin: '0 0 6px 0',
        textAlign: 'left',
      })
    );

    const reservedFunds = this.lastBidder === 'player' && !this.playerHasWithdrawn ? this.currentBid : 0;
    const availableFunds = Math.max(0, player.money - reservedFunds);

    const fundsBox = document.createElement('div');
    Object.assign(fundsBox.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      margin: '0 0 8px 0',
    } satisfies Partial<CSSStyleDeclaration>);

    const makeFundsRow = (label: string, value: string): HTMLDivElement => {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: '10px',
      } satisfies Partial<CSSStyleDeclaration>);
      row.appendChild(
        this.uiManager.createText(label, {
          margin: '0',
          fontSize: '11px',
          opacity: '0.75',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        })
      );
      row.appendChild(
        this.uiManager.createText(value, {
          margin: '0',
          fontWeight: '900',
          color: '#ffd700',
          whiteSpace: 'nowrap',
        })
      );
      return row;
    };

    fundsBox.appendChild(makeFundsRow('Funds', formatCurrency(player.money)));
    if (reservedFunds > 0) {
      fundsBox.appendChild(makeFundsRow('Committed', formatCurrency(reservedFunds)));
    }
    fundsBox.appendChild(makeFundsRow('Available', formatCurrency(availableFunds)));
    biddingPanel.appendChild(fundsBox);

    const quickRow = document.createElement('div');
    Object.assign(quickRow.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gap: '6px',
      margin: '0 0 6px 0',
    } satisfies Partial<CSSStyleDeclaration>);

    const quickBtnStyle: Partial<CSSStyleDeclaration> = {
      padding: '9px 8px',
      fontSize: '12px',
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

    const endBtn = this.auctionResolved
      ? this.uiManager.createButton('Back\nTo Map', () => this.scene.start('MapScene'), {
          variant: 'danger',
          style: quickBtnStyle,
        })
      : this.uiManager.createButton('Drop\nOut', () => this.playerEndAuctionEarly(), {
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

    // Turn gating: only allow actions on the player's turn.
    if (!this.isPlayerTurn) {
      disableEncounterActionButton(normalBtn, 'Bid\nWaiting');
      disableEncounterActionButton(powerBtn, 'Power\nWaiting');
      if (!this.auctionResolved) {
        disableEncounterActionButton(endBtn, 'Drop\nWaiting');
      }
    }

    const tacticsRow = document.createElement('div');
    Object.assign(tacticsRow.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: '6px',
      margin: '6px 0 0 0',
    } satisfies Partial<CSSStyleDeclaration>);

    const kickTiresBtn = this.uiManager.createButton(
      `Kick Tires\nEye ${AuctionScene.REQUIRED_EYE_LEVEL_FOR_KICK_TIRES}+ · Budget -${formatCurrency(AuctionScene.KICK_TIRES_BUDGET_REDUCTION)}`,
      () => this.playerKickTires(),
      { variant: 'info', style: { padding: '9px 8px', fontSize: '12px' } }
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
      { variant: 'special', style: { padding: '9px 8px', fontSize: '12px' } }
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
        { margin: '10px 0 0 0', fontSize: '11px', opacity: '0.75' }
      )
    );
    leftCol.appendChild(biddingPanel);

    // INFO COLUMN: combined panel (bidder portrait grid + bid history)
    const rightPanel = this.uiManager.createPanel({ padding: '10px 12px' });
    Object.assign(rightPanel.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      flex: '1 1 auto',
      minHeight: '0',
      // Bubbles are positioned above portrait anchors; don't clip them.
      overflow: 'visible',
    } satisfies Partial<CSSStyleDeclaration>);

    const activeBidderCount = (this.playerHasWithdrawn ? 0 : 1) + this.activeRivalIds.length;
    const totalBidderCount = 1 + this.rivals.length;
    rightPanel.appendChild(
      this.uiManager.createText(`Active Bidders: ${activeBidderCount}/${totalBidderCount}`, {
        margin: '0',
        fontSize: '12px',
        fontWeight: '800',
        opacity: '0.85',
      })
    );

    const biddersGrid = document.createElement('div');
    Object.assign(biddersGrid.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(44px, 1fr))',
      gap: '6px',
      alignItems: 'center',
      flex: '0 0 auto',
    } satisfies Partial<CSSStyleDeclaration>);

    const activeRivalIdSet = new Set(this.activeRivalIds);
    const makeBidderCell = (params: {
      bidderId: BidderId;
      name: string;
      portraitUrl: string;
      isLeader: boolean;
      isActive: boolean;
    }): HTMLDivElement => {
      const cell = document.createElement('div');
      cell.classList.add('auction-bidder-row');
      Object.assign(cell.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px',
        border: `1px solid ${params.isLeader ? 'rgba(255,215,0,0.55)' : 'rgba(255,255,255,0.12)'}`,
        borderRadius: pixelUI ? '0px' : '12px',
        backgroundColor: 'rgba(0,0,0,0.14)',
        boxSizing: 'border-box',
        minWidth: '0',
        opacity: params.isActive ? '1' : '0.45',
        filter: params.isActive ? 'none' : 'grayscale(0.9)',
      } satisfies Partial<CSSStyleDeclaration>);

      cell.title = params.name;

      this.participantTurnFocus.rows[params.bidderId] = cell;

      const anchor = makePortraitAnchor(params.portraitUrl, `${params.name} portrait`, 34);
      this.participantFlash.anchors[params.bidderId] = anchor;

      cell.appendChild(anchor);
      return cell;
    };

    biddersGrid.appendChild(
      makeBidderCell({
        bidderId: 'player',
        name: 'You',
        portraitUrl: PLAYER_PORTRAIT_PLACEHOLDER_URL,
        isLeader: this.lastBidder === 'player',
        isActive: !this.playerHasWithdrawn,
      })
    );
    for (const rival of this.rivals) {
      const bidderId = makeRivalBidderId(rival.id);
      const isActive = activeRivalIdSet.has(rival.id);
      biddersGrid.appendChild(
        makeBidderCell({
          bidderId,
          name: rival.name,
          portraitUrl: getCharacterPortraitUrlOrPlaceholder(rival.name),
          isLeader: this.lastBidder === bidderId,
          isActive,
        })
      );
    }

    rightPanel.appendChild(biddersGrid);
    rightPanel.appendChild(this.uiManager.createHeading('BID HISTORY', 3, { margin: '0', textAlign: 'left' }));

    const bidHistoryScroll = document.createElement('div');
    Object.assign(bidHistoryScroll.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      overflowY: 'auto',
      overflowX: 'hidden',
      flex: '1 1 auto',
      minHeight: '0',
      paddingRight: '4px',
      boxSizing: 'border-box',
    } satisfies Partial<CSSStyleDeclaration>);

    const makeHistoryRow = (entry: BidHistoryEntry): HTMLDivElement => {
      const isPlayer = entry.bidderId === 'player';
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        gap: '10px',
        alignItems: 'center',
        padding: '8px 8px',
        border: `1px solid ${isPlayer ? 'rgba(76,175,80,0.35)' : 'rgba(255,255,255,0.12)'}`,
        borderRadius: pixelUI ? '0px' : '12px',
        backgroundColor: 'rgba(0,0,0,0.14)',
      } satisfies Partial<CSSStyleDeclaration>);

      const portraitUrl = this.getBidderPortraitUrl(entry.bidderId);
      const avatar = document.createElement('img');
      avatar.src = portraitUrl;
      avatar.alt = this.getBidderDisplayName(entry.bidderId);
      Object.assign(avatar.style, {
        width: '32px',
        height: '32px',
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

      const name = this.uiManager.createText(isPlayer ? 'YOU' : this.getBidderDisplayName(entry.bidderId), {
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

    rightPanel.appendChild(bidHistoryScroll);
    rightCol.appendChild(rightPanel);

    // Append in swapped order so the "info" column is on the left.
    mainGrid.appendChild(rightCol);
    mainGrid.appendChild(leftCol);
    layoutRoot.appendChild(mainGrid);

    this.uiManager.append(layoutRoot);

    this.lastRenderedCurrentBid = this.currentBid;

    // Re-apply current turn highlight to the newly created bidder row nodes.
    this.applyTurnFocusBidder();

    // Re-attach any active speech bubbles to the newly created portrait anchors.
    this.renderActiveParticipantBarkBubbles();
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

  private getRivalByIdInAuction(rivalId: string): Rival | null {
    return this.rivals.find((r) => r.id === rivalId) ?? null;
  }

  private getBidderDisplayName(bidderId: BidderId): string {
    if (bidderId === 'player') return 'You';
    const rivalId = bidderId.slice('rival:'.length);
    return this.getRivalByIdInAuction(rivalId)?.name ?? 'Rival';
  }

  private getBidderPortraitUrl(bidderId: BidderId): string {
    if (bidderId === 'player') return PLAYER_PORTRAIT_PLACEHOLDER_URL;
    const rivalId = bidderId.slice('rival:'.length);
    const name = this.getRivalByIdInAuction(rivalId)?.name;
    return name ? getCharacterPortraitUrlOrPlaceholder(name) : PLAYER_PORTRAIT_PLACEHOLDER_URL;
  }

  private getAnyRivalId(): string | null {
    return this.activeRivalIds[0] ?? this.rivals[0]?.id ?? null;
  }

  private getRivalQuickStatusBubbleText(
    rivalId: string,
    params: {
      willDrop: boolean;
      outOfPatience: boolean;
      outOfBudget: boolean;
    }
  ): string {
    const rival = this.getRivalByIdInAuction(rivalId);
    const mood = rival?.mood ?? 'Normal';

    if (!params.willDrop) {
      switch (mood) {
        case 'Desperate':
          return 'Not yet…';
        case 'Cautious':
          return 'I’ll wait.';
        case 'Confident':
          return 'Pass.';
        case 'Normal':
        default:
          return 'Pass.';
      }
    }

    if (params.outOfBudget) {
      switch (mood) {
        case 'Desperate':
          return "I can't afford it!";
        case 'Cautious':
          return 'Too expensive.';
        case 'Confident':
          return 'Not worth it.';
        case 'Normal':
        default:
          return "Can't afford it.";
      }
    }

    // Default: dropping due to patience.
    switch (mood) {
      case 'Desperate':
        return "I can't take this!";
      case 'Cautious':
        return "I'm out.";
      case 'Confident':
        return 'I’m done.';
      case 'Normal':
      default:
        return "I'm out.";
    }
  }

  private showRivalBark(rivalId: string, trigger: BarkTrigger): void {
    const rival = this.getRivalByIdInAuction(rivalId);
    if (!rival) return;
    const mood = rival.mood || 'Normal';
    const bark = getRivalBark(mood, trigger).trim();
    if (!bark) return;
    this.flashParticipant(makeRivalBidderId(rivalId));
    this.showParticipantBarkBubble(makeRivalBidderId(rivalId), bark, {
      durationMs: 2600,
      tone: trigger === 'bid' ? 'bid' : 'comment',
    });
  }

  private showAuctioneerBark(
    trigger:
      | 'start'
      | 'opening_prompt'
      | 'player_bid'
      | 'player_power_bid'
      | 'rival_bid'
      | 'stall'
      | 'kick_tires'
      | 'end_player_win'
      | 'end_player_lose',
    options?: { winnerBidderId?: BidderId }
  ): void {
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
        text = `Sold! To ${this.getBidderDisplayName(options?.winnerBidderId ?? (this.lastBidder ?? 'player'))} for ${formatCurrency(this.currentBid)}.`;
        break;
      default:
        text = '';
        break;
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    if (this.auctioneerQuoteEl) {
      this.auctioneerQuoteEl.textContent = `"${trimmed}"`;
    }
    this.showParticipantBarkBubble('auctioneer', trimmed, { durationMs: 2400, tone: 'comment' });
    this.flashParticipant('auctioneer');
  }

  private playerBid(amount: number, options?: { power?: boolean }): void {
    const context: BiddingContext = {
      car: this.car,
      rivals: this.rivals,
      rivalAIsById: this.rivalAIsById,
      auctioneerName: this.auctioneerName,
      currentBid: this.currentBid,
      hasAnyBids: this.hasAnyBids,
      lastBidder: this.lastBidder,
      stallUsesThisAuction: this.stallUsesThisAuction,
      powerBidStreak: this.powerBidStreak,
      isPlayerTurn: this.isPlayerTurn,
      locationId: this.locationId,
      activeRivalIds: this.activeRivalIds,
    };

    const callbacks: BiddingCallbacks = {
      gameManager: this.gameManager,
      uiManager: this.uiManager,
      onShowToastAndLog: (toast: string, opts?: { backgroundColor?: string }, log?: string, logKind?: string) => 
        this.showToastAndLog(toast, opts, log, logKind),
      onRivalDroppedOut: (rivalId: string, reason: 'patience' | 'budget') => {
        const message = this.getRivalQuickStatusBubbleText(rivalId, {
          willDrop: true,
          outOfPatience: reason === 'patience',
          outOfBudget: reason === 'budget',
        });
        this.showParticipantBarkBubble(makeRivalBidderId(rivalId), message, { durationMs: 1800, tone: 'drop' });
      },
      onRecordBid: (bidderId: BidderId, totalBid: number) => {
        this.currentBid = totalBid;
        this.recordBid(bidderId, totalBid);
      },
      onShowAuctioneerBark: (trigger: string) => {
        this.currentBid = context.currentBid;
        this.showAuctioneerBark(trigger as any);
      },
      onShowRivalBarkAfterAuctioneer: (rivalId: string, trigger: BarkTrigger, delayMs?: number) =>
        this.showRivalBarkAfterAuctioneer(rivalId, trigger, delayMs),
      onSetupUI: () => {
        this.currentBid = context.currentBid;
        this.isPlayerTurn = context.isPlayerTurn;
        this.setTurnFocusBidder(context.isPlayerTurn ? 'player' : undefined);
        this.setupUI();
      },
      onScheduleRivalTurn: (delayMs: number) => this.scheduleRivalTurn(delayMs),
      onScheduleEnablePlayerTurn: (delayMs?: number) => this.scheduleEnablePlayerTurn(delayMs),
      onEndAuction: (winner: BidderId, message: string, rivalFinalBarkTrigger?: BarkTrigger) => {
        this.currentBid = context.currentBid;
        this.endAuction(winner, message, rivalFinalBarkTrigger);
      },
    };

    const updatedContext = playerBidInternal(amount, context, callbacks, options);

    // Sync updated state back
    this.currentBid = updatedContext.currentBid;
    this.hasAnyBids = updatedContext.hasAnyBids;
    this.lastBidder = updatedContext.lastBidder;
    this.stallUsesThisAuction = updatedContext.stallUsesThisAuction;
    this.powerBidStreak = updatedContext.powerBidStreak;
    this.isPlayerTurn = updatedContext.isPlayerTurn;
    this.activeRivalIds = updatedContext.activeRivalIds;
  }


  private playerKickTires(): void {
    const context: BiddingContext = {
      car: this.car,
      rivals: this.rivals,
      rivalAIsById: this.rivalAIsById,
      auctioneerName: this.auctioneerName,
      currentBid: this.currentBid,
      hasAnyBids: this.hasAnyBids,
      lastBidder: this.lastBidder,
      stallUsesThisAuction: this.stallUsesThisAuction,
      powerBidStreak: this.powerBidStreak,
      isPlayerTurn: this.isPlayerTurn,
      locationId: this.locationId,
      activeRivalIds: this.activeRivalIds,
    };

    const callbacks: BiddingCallbacks = {
      gameManager: this.gameManager,
      uiManager: this.uiManager,
      onShowToastAndLog: (toast: string, opts?: { backgroundColor?: string }, log?: string, logKind?: string) => 
        this.showToastAndLog(toast, opts, log, logKind),
      onRivalDroppedOut: (rivalId: string, reason: 'patience' | 'budget') => {
        const message = this.getRivalQuickStatusBubbleText(rivalId, {
          willDrop: true,
          outOfPatience: reason === 'patience',
          outOfBudget: reason === 'budget',
        });
        this.showParticipantBarkBubble(makeRivalBidderId(rivalId), message, { durationMs: 1800, tone: 'drop' });
      },
      onRecordBid: (bidderId: BidderId, totalBid: number) => {
        this.currentBid = totalBid;
        this.recordBid(bidderId, totalBid);
      },
      onShowAuctioneerBark: (trigger: string) => {
        this.currentBid = context.currentBid;
        this.showAuctioneerBark(trigger as any);
      },
      onShowRivalBarkAfterAuctioneer: (rivalId: string, trigger: BarkTrigger, delayMs?: number) =>
        this.showRivalBarkAfterAuctioneer(rivalId, trigger, delayMs),
      onSetupUI: () => {
        this.currentBid = context.currentBid;
        this.isPlayerTurn = context.isPlayerTurn;
        this.setTurnFocusBidder(context.isPlayerTurn ? 'player' : undefined);
        this.setupUI();
      },
      onScheduleRivalTurn: (delayMs: number) => this.scheduleRivalTurn(delayMs),
      onScheduleEnablePlayerTurn: (delayMs?: number) => this.scheduleEnablePlayerTurn(delayMs),
      onEndAuction: (winner: BidderId, message: string, rivalFinalBarkTrigger?: BarkTrigger) => {
        this.currentBid = context.currentBid;
        this.endAuction(winner, message, rivalFinalBarkTrigger);
      },
    };

    const updatedContext = playerKickTiresInternal(context, callbacks);

    // Sync updated state back
    this.currentBid = updatedContext.currentBid;
    this.hasAnyBids = updatedContext.hasAnyBids;
    this.lastBidder = updatedContext.lastBidder;
    this.stallUsesThisAuction = updatedContext.stallUsesThisAuction;
    this.powerBidStreak = updatedContext.powerBidStreak;
    this.isPlayerTurn = updatedContext.isPlayerTurn;
    this.activeRivalIds = updatedContext.activeRivalIds;
  }


  private playerStall(): void {
    const context: BiddingContext = {
      car: this.car,
      rivals: this.rivals,
      rivalAIsById: this.rivalAIsById,
      auctioneerName: this.auctioneerName,
      currentBid: this.currentBid,
      hasAnyBids: this.hasAnyBids,
      lastBidder: this.lastBidder,
      stallUsesThisAuction: this.stallUsesThisAuction,
      powerBidStreak: this.powerBidStreak,
      isPlayerTurn: this.isPlayerTurn,
      locationId: this.locationId,
      activeRivalIds: this.activeRivalIds,
    };

    const callbacks: BiddingCallbacks = {
      gameManager: this.gameManager,
      uiManager: this.uiManager,
      onShowToastAndLog: (toast: string, opts?: { backgroundColor?: string }, log?: string, logKind?: string) => 
        this.showToastAndLog(toast, opts, log, logKind),
      onRivalDroppedOut: (rivalId: string, reason: 'patience' | 'budget') => {
        const message = this.getRivalQuickStatusBubbleText(rivalId, {
          willDrop: true,
          outOfPatience: reason === 'patience',
          outOfBudget: reason === 'budget',
        });
        this.showParticipantBarkBubble(makeRivalBidderId(rivalId), message, { durationMs: 1800, tone: 'drop' });
      },
      onRecordBid: (bidderId: BidderId, totalBid: number) => {
        this.currentBid = totalBid;
        this.recordBid(bidderId, totalBid);
      },
      onShowAuctioneerBark: (trigger: string) => {
        this.currentBid = context.currentBid;
        this.showAuctioneerBark(trigger as any);
      },
      onShowRivalBarkAfterAuctioneer: (rivalId: string, trigger: BarkTrigger, delayMs?: number) =>
        this.showRivalBarkAfterAuctioneer(rivalId, trigger, delayMs),
      onSetupUI: () => {
        this.currentBid = context.currentBid;
        this.isPlayerTurn = context.isPlayerTurn;
        this.setTurnFocusBidder(context.isPlayerTurn ? 'player' : undefined);
        this.setupUI();
      },
      onScheduleRivalTurn: (delayMs: number) => this.scheduleRivalTurn(delayMs),
      onScheduleEnablePlayerTurn: (delayMs?: number) => this.scheduleEnablePlayerTurn(delayMs),
      onEndAuction: (winner: BidderId, message: string, rivalFinalBarkTrigger?: BarkTrigger) => {
        this.currentBid = context.currentBid;
        this.endAuction(winner, message, rivalFinalBarkTrigger);
      },
    };

    const updatedContext = playerStallInternal(context, callbacks);

    // Sync updated state back
    this.currentBid = updatedContext.currentBid;
    this.hasAnyBids = updatedContext.hasAnyBids;
    this.lastBidder = updatedContext.lastBidder;
    this.stallUsesThisAuction = updatedContext.stallUsesThisAuction;
    this.powerBidStreak = updatedContext.powerBidStreak;
    this.isPlayerTurn = updatedContext.isPlayerTurn;
    this.activeRivalIds = updatedContext.activeRivalIds;
  }


  private consumeOfferIfNeeded(): void {
    if (!this.encounterStarted) return;
    if (!this.locationId) return;

    // Only base locations participate in the per-day offer system.
    // Special events reuse AuctionScene but are tracked separately.
    const isBaseLocation = BASE_LOCATIONS.some((loc) => loc.id === this.locationId);
    if (!isBaseLocation) return;

    this.gameManager.consumeDailyCarOfferForLocation(this.locationId);
    // Prevent accidental double-consumption across multiple resolution paths.
    this.locationId = undefined;
  }

  private rivalTurnImmediate(
    rivalTurnOrder?: string[],
    rivalTurnDecisions?: Record<string, ReturnType<RivalAI['decideBid']>>
  ): void {
    const context: BiddingContext = {
      car: this.car,
      rivals: this.rivals,
      rivalAIsById: this.rivalAIsById,
      auctioneerName: this.auctioneerName,
      currentBid: this.currentBid,
      hasAnyBids: this.hasAnyBids,
      lastBidder: this.lastBidder,
      stallUsesThisAuction: this.stallUsesThisAuction,
      powerBidStreak: this.powerBidStreak,
      isPlayerTurn: this.isPlayerTurn,
      locationId: this.locationId,
      activeRivalIds: this.activeRivalIds,
      rivalTurnOrder,
      rivalTurnDecisions,
    };

    const callbacks: BiddingCallbacks = {
      gameManager: this.gameManager,
      uiManager: this.uiManager,
      onShowToastAndLog: (toast: string, opts?: { backgroundColor?: string }, log?: string, logKind?: string) => 
        this.showToastAndLog(toast, opts, log, logKind),
      onRivalDroppedOut: (rivalId: string, reason: 'patience' | 'budget') => {
        const message = this.getRivalQuickStatusBubbleText(rivalId, {
          willDrop: true,
          outOfPatience: reason === 'patience',
          outOfBudget: reason === 'budget',
        });
        this.showParticipantBarkBubble(makeRivalBidderId(rivalId), message, { durationMs: 1800, tone: 'drop' });
      },
      onRecordBid: (bidderId: BidderId, totalBid: number) => {
        this.currentBid = totalBid;
        this.recordBid(bidderId, totalBid);
      },
      onShowAuctioneerBark: (trigger: string) => {
        this.currentBid = context.currentBid;
        this.showAuctioneerBark(trigger as any);
      },
      onShowRivalBarkAfterAuctioneer: (rivalId: string, trigger: BarkTrigger, delayMs?: number) =>
        this.showRivalBarkAfterAuctioneer(rivalId, trigger, delayMs),
      onSetupUI: () => {
        this.currentBid = context.currentBid;
        this.setupUI();
      },
      onScheduleRivalTurn: (delayMs: number) => this.scheduleRivalTurn(delayMs),
      onScheduleEnablePlayerTurn: (delayMs?: number) => this.scheduleEnablePlayerTurn(delayMs),
      onEndAuction: (winner: BidderId, message: string, rivalFinalBarkTrigger?: BarkTrigger) => {
        this.currentBid = context.currentBid;
        this.endAuction(winner, message, rivalFinalBarkTrigger);
      },
    };

    const updatedContext = rivalTurnImmediateInternal(context, callbacks);

    // Sync updated state back
    this.currentBid = updatedContext.currentBid;
    this.hasAnyBids = updatedContext.hasAnyBids;
    this.lastBidder = updatedContext.lastBidder;
    this.stallUsesThisAuction = updatedContext.stallUsesThisAuction;
    this.powerBidStreak = updatedContext.powerBidStreak;
    this.isPlayerTurn = updatedContext.isPlayerTurn;
    this.activeRivalIds = updatedContext.activeRivalIds;
  }


  private endAuction(winnerBidderId: BidderId, message: string, rivalFinalBarkTrigger?: BarkTrigger): void {
    let playerWon = winnerBidderId === 'player';

    // Tutorial: the Sterling Vance encounter is meant to be a scripted loss beat.
    // If the player manages to "win" via tactics (patience/budget), force a loss so the
    // redemption flow remains deterministic and the tutorial cannot get stuck.
    let forceSterlingTutorialLoss = false;
    try {
      forceSterlingTutorialLoss =
        playerWon &&
        this.tutorialManager.isTutorialActive() &&
        this.tutorialManager.isOnFirstLossStep() &&
        this.rivals.some((r) => r.id === 'sterling_vance');
    } catch {
      forceSterlingTutorialLoss = false;
    }

    if (forceSterlingTutorialLoss) {
      playerWon = false;

      const sterlingId = 'sterling_vance';
      const sterling = this.rivals.find((r) => r.id === sterlingId);
      const forcedWinner = sterling ? makeRivalBidderId(sterlingId) : (this.lastBidder && this.lastBidder !== 'player' ? this.lastBidder : undefined);
      winnerBidderId = forcedWinner ?? makeRivalBidderId(this.getAnyRivalId() ?? sterlingId);

      // Make the final call/readout coherent even if the rival "quit" in the underlying logic.
      this.hasAnyBids = true;
      this.lastBidder = winnerBidderId;
      this.currentBid += AuctionScene.BID_INCREMENT;
      message = `${sterling?.name ?? 'Sterling Vance'} outbids you at the last second.`;
    }

    // Prevent any scheduled UI refresh from wiping the final result modal.
    this.clearPendingUIRefresh();
    this.clearPendingRivalTurn();
    this.clearPendingRivalBark();
    this.clearPendingPlayerTurnEnable();
    this.clearPendingEndAuction();
    this.isPlayerTurn = false;
    this.auctionResolved = true;

    // Final-state normalization for the bidders panel.
    // It's possible for a rival to be the last recorded bidder and then drop out via tactics.
    // Once the auction is resolved, the winner should always be shown as the leader and all
    // non-winning rivals should appear as dropped (inactive).
    this.lastBidder = winnerBidderId;
    if (winnerBidderId === 'player') {
      this.activeRivalIds = [];
    } else if (typeof winnerBidderId === 'string' && winnerBidderId.startsWith('rival:')) {
      this.activeRivalIds = [winnerBidderId.slice('rival:'.length)];
    }

    // Rebuild UI so action buttons are visibly disabled post-auction.
    if (this.scene.isActive()) {
      this.setupUI();
    }

    // Show final bark
    const estimate = Math.max(0, Math.floor(this.auctionMarketEstimateValue ?? 0));
    const finalBid = Math.max(0, Math.floor(this.currentBid));
    const isMeaningfulOverpay =
      estimate > 0 && finalBid >= estimate * 1.05 && finalBid - estimate >= 2000;
    const isMeaningfulValue =
      estimate > 0 && finalBid <= estimate * 0.95 && estimate - finalBid >= 2000;

    if (playerWon) {
      this.showAuctioneerBark('end_player_win');
      const anyRivalId = this.getAnyRivalId();
      if (anyRivalId) {
        const effectiveLoserTrigger =
          rivalFinalBarkTrigger && rivalFinalBarkTrigger !== 'lose'
            ? rivalFinalBarkTrigger
            : isMeaningfulOverpay
              ? 'lose_overpay'
              : 'lose';
        this.showRivalBarkAfterAuctioneer(anyRivalId, effectiveLoserTrigger);
      }
    } else {
      this.showAuctioneerBark('end_player_lose', { winnerBidderId });
      const winnerRivalId = typeof winnerBidderId === 'string' && winnerBidderId.startsWith('rival:') ? winnerBidderId.slice('rival:'.length) : undefined;
      const barkRivalId = winnerRivalId ?? this.getAnyRivalId();
      if (barkRivalId) {
        const winnerTrigger: BarkTrigger = isMeaningfulOverpay
          ? 'win_overpay'
          : isMeaningfulValue
            ? 'win_value'
            : 'win';
        this.showRivalBarkAfterAuctioneer(barkRivalId, winnerTrigger);
      }
    }

    if (playerWon) {
      const player = this.gameManager.getPlayerState();

      // Important edge-case: the rival can outbid you, then quit due to tactics (Kick Tires / Stall)
      // leaving the winning bid above your available money.
      if (player.money < this.currentBid) {
        this.consumeOfferIfNeeded();
        this.uiManager.showModal(
          "Won But Can't Pay",
          `${message}\n\nYou pressured the other bidders into quitting, but the winning bid is ${formatCurrency(this.currentBid)} and you only have ${formatCurrency(player.money)}.\n\nYou forfeit the car.`,
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
        const purchasedCar: Car = {
          ...this.car,
          purchasePrice: this.currentBid,
          restorationSpent: this.car.restorationSpent ?? 0,
        };

        if (!this.gameManager.addCar(purchasedCar)) {
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

        // Apply special event bonuses only if the player successfully acquires the car.
        if (this.specialEvent && !this.specialEventBonusesApplied) {
          const moneyBonus = this.specialEvent.reward.moneyBonus ?? 0;
          const prestigeBonus = this.specialEvent.reward.prestigeBonus ?? 0;

          if (moneyBonus > 0) {
            this.gameManager.addMoney(moneyBonus);
            this.uiManager.showToast(`Special event bonus: +${formatCurrency(moneyBonus)}`, { durationMs: 2500 });
          }

          if (prestigeBonus > 0) {
            this.gameManager.addPrestige(prestigeBonus);
            this.uiManager.showToast(`Special event bonus: +${prestigeBonus} prestige`, { durationMs: 2500 });
          }

          // One-shot application guard.
          this.specialEventBonusesApplied = true;
        }

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
                  {
                    text: 'Back to Map',
                    onClick: () => {
                      // If the player doesn't jump straight in, still advance the tutorial so
                      // returning to the Auction House node reliably offers the redemption auction.
                      this.tutorialManager.onRedemptionPromptAccepted();
                      this.scene.start('MapScene');
                    },
                  },
                  {
                    text: 'Start Next Auction',
                    onClick: () => {
                      this.tutorialManager.onRedemptionPromptAccepted();
                      const boxywagon = getCarById('car_tutorial_boxy_wagon');
                      const scrappyJoe = getRivalById('scrapyard_joe');
                      if (boxywagon && scrappyJoe) {
                        const baseValue = calculateCarValue(boxywagon);
                        const marketInfo = this.gameManager.getCarMarketInfo(boxywagon.tags);
                        const estimate = Math.floor(baseValue * marketInfo.modifier);
                        const openingBid = Math.floor(estimate * GAME_CONFIG.auction.startingBidMultiplier);
                        const minMoneyToParticipate = openingBid + GAME_CONFIG.auction.powerBidIncrement;

                        const beforeTopUp = this.gameManager.getPlayerState();
                        if (beforeTopUp.money < minMoneyToParticipate) {
                          const delta = minMoneyToParticipate - beforeTopUp.money;
                          this.gameManager.addMoney(delta);
                          this.uiManager.showToast('Tutorial: Uncle Ray covers your first power bid.');
                        }

                        const interest = calculateRivalInterest(scrappyJoe, boxywagon.tags);
                        const rivals: AuctionRivalEntry[] = [{ rival: scrappyJoe, interest }];
                        this.scene.start('AuctionScene', { car: boxywagon, rivals });
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
    const losingRivalId = this.lastBidder && this.lastBidder.startsWith('rival:') ? this.lastBidder.slice('rival:'.length) : undefined;
    const losingRival = losingRivalId ? this.getRivalByIdInAuction(losingRivalId) : undefined;
    const losingAI = losingRivalId ? this.rivalAIsById[losingRivalId] : undefined;

    const patience = losingAI?.getPatience() ?? 0;
    const budget = losingAI?.getBudget() ?? 0;
    const player = this.gameManager.getPlayerState();

    let analysis = `📈 AUCTION ANALYSIS\n\n`;
    analysis += `YOUR BID: ${formatCurrency(this.currentBid)}\n`;
    analysis += `RIVAL BID: Won the auction\n\n`;
    
    analysis += `👤 RIVAL STATUS${losingRival ? ` (${losingRival.name})` : ''}:\n`;
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
