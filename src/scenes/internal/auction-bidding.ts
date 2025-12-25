import type { Car } from '@/data/car-database';
import type { BarkTrigger, Rival } from '@/data/rival-database';
import type { RivalAI } from '@/systems/rival-ai';
import type { GameManager } from '@/core/game-manager';
import type { UIManager } from '@/ui/ui-manager';
import { formatCurrency } from '@/utils/format';
import { GAME_CONFIG } from '@/config/game-config';

/**
 * Bidding mechanics for the AuctionScene.
 * Handles player actions (bid, power bid, stall, kick tires) and rival turns.
 * Extracted from AuctionScene to reduce file size and improve maintainability.
 */

export type BidderId = 'player' | `rival:${string}`;

export function makeRivalBidderId(rivalId: string): BidderId {
  return `rival:${rivalId}`;
}

function pickSpokespersonRivalId(context: BiddingContext): string | null {
  return context.activeRivalIds[0] ?? null;
}

function findRivalById(rivals: readonly Rival[], rivalId: string): Rival | null {
  return rivals.find((r) => r.id === rivalId) ?? null;
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export interface BiddingContext {
  car: Car;
  rivals: Rival[];
  rivalAIsById: Record<string, RivalAI>;
  auctioneerName: string;
  currentBid: number;
  hasAnyBids: boolean;
  lastBidder?: BidderId;
  stallUsesThisAuction: number;
  powerBidStreak: number;
  isPlayerTurn: boolean;
  locationId?: string;
  /** IDs of rivals still active in the auction (haven't folded/quit). */
  activeRivalIds: string[];
  /** Optional cap used by rival-only flows to prevent extreme overpaying. */
  maxBid?: number;
}

export interface BiddingCallbacks {
  gameManager: GameManager;
  uiManager: UIManager;
  onShowToastAndLog: (toast: string, options?: { backgroundColor?: string }, log?: string, logKind?: string) => void;
  onRecordBid: (bidderId: BidderId, totalBid: number) => void;
  onShowAuctioneerBark: (trigger: string) => void;
  onShowRivalBarkAfterAuctioneer: (rivalId: string, trigger: BarkTrigger, delayMs?: number) => void;
  onSetupUI: () => void;
  onScheduleRivalTurn: (delayMs: number) => void;
  onScheduleEnablePlayerTurn: (delayMs?: number) => void;
  onEndAuction: (winner: BidderId, message: string, rivalFinalBarkTrigger?: BarkTrigger) => void;
}

const BID_INCREMENT = GAME_CONFIG.auction.bidIncrement;
const POWER_BID_INCREMENT = GAME_CONFIG.auction.powerBidIncrement;
const KICK_TIRES_BUDGET_REDUCTION = GAME_CONFIG.auction.kickTires.rivalBudgetReduction;
const REQUIRED_EYE_LEVEL_FOR_KICK_TIRES = GAME_CONFIG.auction.kickTires.requiredEyeLevel;
const REQUIRED_TONGUE_LEVEL_FOR_STALL = GAME_CONFIG.auction.stall.requiredTongueLevel;

/**
 * Handle player bid action.
 */
export function playerBid(
  amount: number,
  context: BiddingContext,
  callbacks: BiddingCallbacks,
  options?: { power?: boolean }
): BiddingContext {
  if (!context.isPlayerTurn) return context;

  const isFirstBid = !context.hasAnyBids;
  const openingBid = context.currentBid;
  const nextBid = context.currentBid + amount;

  const player = callbacks.gameManager.getPlayerState();

  // Opening bid: first bid amount equals the opening price.
  if (isFirstBid) {
    if (player.money < openingBid) {
      callbacks.onShowToastAndLog(
        'Not enough money to place the opening bid.',
        { backgroundColor: '#f44336' },
        `Not enough money to bid ${formatCurrency(openingBid)} (you have ${formatCurrency(player.money)}).`,
        'error'
      );
      return context;
    }

    context.hasAnyBids = true;
    context.lastBidder = 'player';
    callbacks.onRecordBid('player', openingBid);

    // If the player clicked Power Bid as their first action, treat it as:
    // opening bid (logged) + immediate power raise.
    if (options?.power) {
      if (player.money < nextBid) {
        callbacks.onShowToastAndLog(
          'Not enough money to power bid that high.',
          { backgroundColor: '#f44336' },
          `Not enough money to bid ${formatCurrency(nextBid)} (you have ${formatCurrency(player.money)}).`,
          'error'
        );
        return context;
      }

      context.currentBid = nextBid;
      context.lastBidder = 'player';
      callbacks.onRecordBid('player', context.currentBid);
      callbacks.onShowAuctioneerBark('player_power_bid');

      context.powerBidStreak++;
      for (const rivalId of context.activeRivalIds.slice()) {
        const ai = context.rivalAIsById[rivalId];
        if (!ai) continue;
        ai.onPlayerPowerBid();
        if (ai.getPatience() <= 0) {
          const rival = findRivalById(context.rivals, rivalId);
          if (rival) {
            callbacks.onShowToastAndLog(`${rival.name} loses patience and quits!`, { backgroundColor: '#ff9800' });
          }
          context.activeRivalIds = context.activeRivalIds.filter((id) => id !== rivalId);
        }
      }

      const spokesperson = pickSpokespersonRivalId(context);
      if (spokesperson) {
        const ai = context.rivalAIsById[spokesperson];
        if (ai && ai.getPatience() < 30 && ai.getPatience() > 0) {
          const reactionDelayMs = Math.max(
            0,
            Math.floor(GAME_CONFIG.ui.modalDelays.nextTurnAfterAuctioneer * 0.45)
          );
          callbacks.onShowRivalBarkAfterAuctioneer(spokesperson, 'patience_low', reactionDelayMs);
        }
      }

      if (context.activeRivalIds.length === 0) {
        callbacks.onEndAuction('player', 'All rival bidders dropped out.');
        return context;
      }
    } else {
      // Normal opening bid.
      context.powerBidStreak = 0;
      callbacks.onShowAuctioneerBark('player_bid');
    }

    // Rival's turn
    context.isPlayerTurn = false;
    callbacks.onSetupUI();
    callbacks.onScheduleRivalTurn(GAME_CONFIG.ui.modalDelays.nextTurnAfterAuctioneer);
    return context;
  }

  if (player.money < nextBid) {
    callbacks.onShowToastAndLog(
      'Not enough money to bid that high.',
      { backgroundColor: '#f44336' },
      `Not enough money to bid ${formatCurrency(nextBid)} (you have ${formatCurrency(player.money)}).`,
      'error'
    );
    return context;
  }

  context.currentBid = nextBid;
  context.lastBidder = 'player';

  callbacks.onRecordBid('player', context.currentBid);

  callbacks.onShowAuctioneerBark(options?.power ? 'player_power_bid' : 'player_bid');

  // Trigger rival reaction to being outbid
  if (!options?.power) {
    const reactionDelayMs = Math.max(0, Math.floor(GAME_CONFIG.ui.modalDelays.nextTurnAfterAuctioneer * 0.45));
    const spokesperson = pickSpokespersonRivalId(context);
    if (spokesperson) {
      callbacks.onShowRivalBarkAfterAuctioneer(spokesperson, 'outbid', reactionDelayMs);
    }
  }

  if (options?.power) {
    context.powerBidStreak++;
    for (const rivalId of context.activeRivalIds.slice()) {
      const ai = context.rivalAIsById[rivalId];
      if (!ai) continue;
      ai.onPlayerPowerBid();
      if (ai.getPatience() <= 0) {
        const rival = findRivalById(context.rivals, rivalId);
        if (rival) {
          callbacks.onShowToastAndLog(`${rival.name} loses patience and quits!`, { backgroundColor: '#ff9800' });
        }
        context.activeRivalIds = context.activeRivalIds.filter((id) => id !== rivalId);
      }
    }

    const spokesperson = pickSpokespersonRivalId(context);
    if (spokesperson) {
      const ai = context.rivalAIsById[spokesperson];
      if (ai && ai.getPatience() < 30 && ai.getPatience() > 0) {
        const reactionDelayMs = Math.max(
          0,
          Math.floor(GAME_CONFIG.ui.modalDelays.nextTurnAfterAuctioneer * 0.45)
        );
        callbacks.onShowRivalBarkAfterAuctioneer(spokesperson, 'patience_low', reactionDelayMs);
      }
    }

    if (context.activeRivalIds.length === 0) {
      callbacks.onEndAuction('player', 'All rival bidders dropped out.');
      return context;
    }
  } else {
    context.powerBidStreak = 0; // Reset streak on normal bid
  }

  // Rival's turn
  context.isPlayerTurn = false;
  callbacks.onSetupUI();
  callbacks.onScheduleRivalTurn(GAME_CONFIG.ui.modalDelays.nextTurnAfterAuctioneer);
  return context;
}

/**
 * Handle player kick tires action.
 */
export function playerKickTires(
  context: BiddingContext,
  callbacks: BiddingCallbacks
): BiddingContext {
  if (!context.isPlayerTurn) return context;

  if (!context.hasAnyBids) {
    callbacks.onShowToastAndLog(
      'Place an opening bid before using tactics.',
      { backgroundColor: '#ff9800' },
      'Kick Tires blocked: place an opening bid first.',
      'warning'
    );
    return context;
  }

  const player = callbacks.gameManager.getPlayerState();
  if (player.skills.eye < REQUIRED_EYE_LEVEL_FOR_KICK_TIRES) {
    callbacks.onShowToastAndLog(
      `Requires Eye ${REQUIRED_EYE_LEVEL_FOR_KICK_TIRES}+ to Kick Tires.`,
      { backgroundColor: '#f44336' },
      `Kick Tires blocked: requires Eye ${REQUIRED_EYE_LEVEL_FOR_KICK_TIRES}+ (you have Eye ${player.skills.eye}).`,
      'error'
    );
    return context;
  }

  context.powerBidStreak = 0; // Reset streak
  for (const rivalId of context.activeRivalIds.slice()) {
    const ai = context.rivalAIsById[rivalId];
    if (!ai) continue;
    ai.onPlayerKickTires(KICK_TIRES_BUDGET_REDUCTION);
    if (context.currentBid > ai.getBudget()) {
      const rival = findRivalById(context.rivals, rivalId);
      if (rival) {
        callbacks.onShowToastAndLog(`${rival.name} is out of budget and quits!`, { backgroundColor: '#ff9800' });
      }
      context.activeRivalIds = context.activeRivalIds.filter((id) => id !== rivalId);
    }
  }

  callbacks.onShowAuctioneerBark('kick_tires');

  if (context.activeRivalIds.length === 0) {
    const winner: BidderId = context.lastBidder ?? 'player';
    callbacks.onEndAuction(winner, 'All rival bidders are out of budget and quit!');
    return context;
  }

  // Rival's turn
  context.isPlayerTurn = false;
  callbacks.onSetupUI();
  callbacks.onScheduleRivalTurn(GAME_CONFIG.ui.modalDelays.nextTurnAfterAuctioneer);
  return context;
}

/**
 * Handle player stall action.
 */
export function playerStall(
  context: BiddingContext,
  callbacks: BiddingCallbacks
): BiddingContext {
  if (!context.isPlayerTurn) return context;

  if (!context.hasAnyBids) {
    callbacks.onShowToastAndLog(
      'Place an opening bid before using tactics.',
      { backgroundColor: '#ff9800' },
      'Stall blocked: place an opening bid first.',
      'warning'
    );
    return context;
  }

  const player = callbacks.gameManager.getPlayerState();
  const tongue = player.skills.tongue;
  if (tongue < REQUIRED_TONGUE_LEVEL_FOR_STALL) {
    callbacks.onShowToastAndLog(
      `Requires Tongue ${REQUIRED_TONGUE_LEVEL_FOR_STALL}+ to Stall.`,
      { backgroundColor: '#f44336' },
      `Stall blocked: requires Tongue ${REQUIRED_TONGUE_LEVEL_FOR_STALL}+ (you have Tongue ${tongue}).`,
      'error'
    );
    return context;
  }

  if (context.stallUsesThisAuction >= tongue) {
    callbacks.onShowToastAndLog(
      'No Stall uses left this auction.',
      { backgroundColor: '#ff9800' },
      `No Stall uses left (${context.stallUsesThisAuction}/${tongue}).`,
      'warning'
    );
    return context;
  }

  context.stallUsesThisAuction += 1;
  context.powerBidStreak = 0; // Reset streak
  for (const rivalId of context.activeRivalIds.slice()) {
    const ai = context.rivalAIsById[rivalId];
    if (!ai) continue;
    ai.onPlayerStall();
    if (ai.getPatience() <= 0) {
      const rival = findRivalById(context.rivals, rivalId);
      if (rival) {
        callbacks.onShowToastAndLog(`${rival.name} loses patience and quits!`, { backgroundColor: '#ff9800' });
      }
      context.activeRivalIds = context.activeRivalIds.filter((id) => id !== rivalId);
    }
  }

  callbacks.onShowAuctioneerBark('stall');

  const spokesperson = pickSpokespersonRivalId(context);
  if (spokesperson) {
    const ai = context.rivalAIsById[spokesperson];
    if (ai && ai.getPatience() < 30 && ai.getPatience() > 0) {
      const reactionDelayMs = Math.max(0, Math.floor(GAME_CONFIG.ui.modalDelays.nextTurnAfterAuctioneer * 0.45));
      callbacks.onShowRivalBarkAfterAuctioneer(spokesperson, 'patience_low', reactionDelayMs);
    }
  }

  if (context.activeRivalIds.length === 0) {
    const winner: BidderId = context.lastBidder ?? 'player';
    callbacks.onEndAuction(winner, 'All rival bidders lost patience and quit!');
  } else {
    // Stalling pressures the rivals but hands them the turn.
    context.isPlayerTurn = false;
    callbacks.onSetupUI();
    callbacks.onScheduleRivalTurn(GAME_CONFIG.ui.modalDelays.nextTurnAfterAuctioneer);
  }

  return context;
}

/**
 * Execute rival's turn immediately.
 */
export function rivalTurnImmediate(
  context: BiddingContext,
  callbacks: BiddingCallbacks
): BiddingContext {
  // If the player didn't raise the bid and a rival is already the high bidder,
  // close out the auction in the rival's favor.
  if (context.lastBidder && context.lastBidder !== 'player') {
    callbacks.onEndAuction(context.lastBidder, 'You did not outbid the current high bidder.');
    return context;
  }

  if (context.activeRivalIds.length === 0) {
    callbacks.onEndAuction('player', 'No rival bidders remain.');
    return context;
  }

  const shuffled = context.activeRivalIds.slice();
  shuffleInPlace(shuffled);

  for (const rivalId of shuffled) {
    const ai = context.rivalAIsById[rivalId];
    const rival = findRivalById(context.rivals, rivalId);
    if (!ai || !rival) continue;

    const decision = ai.decideBid(context.currentBid);

    if (!decision.shouldBid) {
      // Rival drops out of this auction.
      context.activeRivalIds = context.activeRivalIds.filter((id) => id !== rivalId);
      continue;
    }

    const isFirstBid = !context.hasAnyBids;
    if (isFirstBid) {
      context.hasAnyBids = true;
      context.lastBidder = makeRivalBidderId(rivalId);
    } else {
      context.currentBid += decision.bidAmount;
      context.lastBidder = makeRivalBidderId(rivalId);
    }

    callbacks.onRecordBid(context.lastBidder, context.currentBid);

    // Auctioneer commentary should come AFTER the bid is logged.
    callbacks.onShowAuctioneerBark('rival_bid');

    // Show rival bark for bidding (after auctioneer).
    callbacks.onShowRivalBarkAfterAuctioneer(rivalId, 'bid');

    // Non-blocking update: refresh UI and keep momentum.
    callbacks.onSetupUI();

    // Auctioneer responded; now hand the turn back to the player.
    callbacks.onScheduleEnablePlayerTurn(GAME_CONFIG.ui.modalDelays.rivalBarkAfterAuctioneer + 75);
    return context;
  }

  // Nobody bid.
  callbacks.onEndAuction('player', 'No further bids.');

  return context;
}

/**
 * Execute a rival-only turn.
 *
 * Used when the player withdraws: rivals continue bidding between themselves until no further bids.
 * This differs from `rivalTurnImmediate` which assumes a player-vs-rival cadence and can end the
 * auction immediately when a rival is already the high bidder.
 */
export function rivalOnlyTurnImmediate(
  context: BiddingContext,
  callbacks: BiddingCallbacks
): BiddingContext {
  if (context.activeRivalIds.length === 0) {
    callbacks.onEndAuction('player', 'No rival bidders remain.');
    return context;
  }

  // If only one rival remains, they win at the current price.
  // Do NOT allow a single bidder to "bid against themselves".
  if (context.activeRivalIds.length === 1) {
    const soleRivalId = context.activeRivalIds[0];
    if (!soleRivalId) {
      callbacks.onEndAuction('player', 'No rival bidders remain.');
      return context;
    }

    // If we haven't recorded any bids for the rival-only sequence yet, record a single winning bid
    // so the bid history reflects what happened after the player withdrew.
    if (!context.hasAnyBids) {
      context.hasAnyBids = true;
      context.lastBidder = makeRivalBidderId(soleRivalId);
      callbacks.onRecordBid(context.lastBidder, context.currentBid);
      callbacks.onShowAuctioneerBark('rival_bid');
      callbacks.onShowRivalBarkAfterAuctioneer(soleRivalId, 'bid');
      callbacks.onSetupUI();
    }

    callbacks.onEndAuction(makeRivalBidderId(soleRivalId), 'No other bidders remain.');
    return context;
  }

  // Ensure the rivals actually "start" the auction at the current price.
  // When the player withdraws mid-auction, we re-open bidding at the last shown bid.
  if (!context.hasAnyBids) {
    const openingRivalId = pickSpokespersonRivalId(context) ?? context.activeRivalIds[0] ?? null;
    if (!openingRivalId) {
      callbacks.onEndAuction('player', 'No rival bidders remain.');
      return context;
    }

    context.hasAnyBids = true;
    context.lastBidder = makeRivalBidderId(openingRivalId);
    callbacks.onRecordBid(context.lastBidder, context.currentBid);
    callbacks.onShowAuctioneerBark('rival_bid');
    callbacks.onShowRivalBarkAfterAuctioneer(openingRivalId, 'bid');
    callbacks.onSetupUI();
    callbacks.onScheduleEnablePlayerTurn(GAME_CONFIG.ui.modalDelays.rivalBarkAfterAuctioneer + 75);
    return context;
  }

  const shuffled = context.activeRivalIds.slice();
  shuffleInPlace(shuffled);

  for (const rivalId of shuffled) {
    const ai = context.rivalAIsById[rivalId];
    const rival = findRivalById(context.rivals, rivalId);
    if (!ai || !rival) continue;

    const decision = ai.decideBid(context.currentBid);

    if (!decision.shouldBid) {
      context.activeRivalIds = context.activeRivalIds.filter((id) => id !== rivalId);
      continue;
    }

    const proposedBid = context.currentBid + decision.bidAmount;
    if (context.maxBid !== undefined && proposedBid > context.maxBid) {
      // Refuse to bid above the cap (but don't force-drop immediately).
      continue;
    }

    context.currentBid += decision.bidAmount;
    context.lastBidder = makeRivalBidderId(rivalId);

    callbacks.onRecordBid(context.lastBidder, context.currentBid);
    callbacks.onShowAuctioneerBark('rival_bid');
    callbacks.onShowRivalBarkAfterAuctioneer(rivalId, 'bid');
    callbacks.onSetupUI();
    callbacks.onScheduleEnablePlayerTurn(GAME_CONFIG.ui.modalDelays.rivalBarkAfterAuctioneer + 75);
    return context;
  }

  // Nobody bid this round.
  if (context.lastBidder && context.lastBidder !== 'player') {
    callbacks.onEndAuction(context.lastBidder, 'No further bids.');
  } else {
    callbacks.onEndAuction('player', 'No further bids.');
  }

  return context;
}

export { BID_INCREMENT, POWER_BID_INCREMENT, KICK_TIRES_BUDGET_REDUCTION, REQUIRED_EYE_LEVEL_FOR_KICK_TIRES, REQUIRED_TONGUE_LEVEL_FOR_STALL };
