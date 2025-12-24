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

export interface BiddingContext {
  car: Car;
  rival: Rival;
  rivalAI: RivalAI;
  auctioneerName: string;
  currentBid: number;
  hasAnyBids: boolean;
  lastBidder?: 'player' | 'rival';
  stallUsesThisAuction: number;
  powerBidStreak: number;
  isPlayerTurn: boolean;
  locationId?: string;
}

export interface BiddingCallbacks {
  gameManager: GameManager;
  uiManager: UIManager;
  onShowToastAndLog: (toast: string, options?: { backgroundColor?: string }, log?: string, logKind?: string) => void;
  onAppendLog: (entry: string, kind?: string) => void;
  onShowAuctioneerBark: (trigger: string) => void;
  onShowRivalBarkAfterAuctioneer: (trigger: BarkTrigger, delayMs?: number) => void;
  onSetupUI: () => void;
  onScheduleRivalTurn: (delayMs: number) => void;
  onScheduleEnablePlayerTurn: (delayMs?: number) => void;
  onEndAuction: (playerWon: boolean, message: string, rivalFinalBarkTrigger?: BarkTrigger) => void;
}

const BID_INCREMENT = GAME_CONFIG.auction.bidIncrement;
const POWER_BID_INCREMENT = GAME_CONFIG.auction.powerBidIncrement;
const STALL_PATIENCE_PENALTY = GAME_CONFIG.auction.stallPatiencePenalty;
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
    callbacks.onAppendLog(`Opening bid → ${formatCurrency(openingBid)}.`, 'player');

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
      callbacks.onAppendLog(`Power bid +${formatCurrency(amount)} → ${formatCurrency(context.currentBid)}.`, 'player');
      callbacks.onShowAuctioneerBark('player_power_bid');

      context.powerBidStreak++;
      context.rivalAI.onPlayerPowerBid();

      // Check for patience reaction
      if (context.rivalAI.getPatience() < 30 && context.rivalAI.getPatience() > 0) {
        const reactionDelayMs = Math.max(0, Math.floor(GAME_CONFIG.ui.modalDelays.nextTurnAfterAuctioneer * 0.45));
        callbacks.onShowRivalBarkAfterAuctioneer('patience_low', reactionDelayMs);
      }

      if (context.rivalAI.getPatience() <= 0) {
        callbacks.onEndAuction(true, `${context.rival.name} lost patience and quit!`);
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

  if (options?.power) {
    callbacks.onAppendLog(`Power bid +${formatCurrency(amount)} → ${formatCurrency(context.currentBid)}.`, 'player');
  } else {
    callbacks.onAppendLog(`Bid +${formatCurrency(amount)} → ${formatCurrency(context.currentBid)}.`, 'player');
  }

  callbacks.onShowAuctioneerBark(options?.power ? 'player_power_bid' : 'player_bid');

  // Trigger rival reaction to being outbid
  if (!options?.power) {
    const reactionDelayMs = Math.max(0, Math.floor(GAME_CONFIG.ui.modalDelays.nextTurnAfterAuctioneer * 0.45));
    callbacks.onShowRivalBarkAfterAuctioneer('outbid', reactionDelayMs);
  }

  if (options?.power) {
    context.powerBidStreak++;
    context.rivalAI.onPlayerPowerBid();

    // Check for patience reaction
    if (context.rivalAI.getPatience() < 30 && context.rivalAI.getPatience() > 0) {
      const reactionDelayMs = Math.max(0, Math.floor(GAME_CONFIG.ui.modalDelays.nextTurnAfterAuctioneer * 0.45));
      callbacks.onShowRivalBarkAfterAuctioneer('patience_low', reactionDelayMs);
    }

    if (context.rivalAI.getPatience() <= 0) {
      callbacks.onEndAuction(true, `${context.rival.name} lost patience and quit!`);
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
  context.rivalAI.onPlayerKickTires(KICK_TIRES_BUDGET_REDUCTION);

  callbacks.onShowAuctioneerBark('kick_tires');
  callbacks.onAppendLog('Kick tires (pressure applied; they look less willing to spend).', 'player');

  if (context.currentBid > context.rivalAI.getBudget()) {
    const playerWon = context.lastBidder === 'player';
    callbacks.onEndAuction(playerWon, `${context.rival.name} is out of budget and quits!`);
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
  context.rivalAI.onPlayerStall();

  callbacks.onShowAuctioneerBark('stall');
  callbacks.onAppendLog(`Stall (-${STALL_PATIENCE_PENALTY} rival patience).`, 'player');

  // Check for patience reaction
  if (context.rivalAI.getPatience() < 30 && context.rivalAI.getPatience() > 0) {
    const reactionDelayMs = Math.max(0, Math.floor(GAME_CONFIG.ui.modalDelays.nextTurnAfterAuctioneer * 0.45));
    callbacks.onShowRivalBarkAfterAuctioneer('patience_low', reactionDelayMs);
  }

  if (context.rivalAI.getPatience() <= 0) {
    const playerWon = context.lastBidder === 'player';
    callbacks.onEndAuction(playerWon, `${context.rival.name} lost patience and quit!`);
  } else {
    // Stalling pressures the rival but hands them the turn.
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
  const decision = context.rivalAI.decideBid(context.currentBid);

  if (!decision.shouldBid) {
    const rivalIsHighBidder = context.hasAnyBids && context.lastBidder === 'rival';

    // If the rival is already the high bidder, they don't need to "bid again".
    // Avoid ending the auction with confusing dialogue like "Not worth it!" while they win.
    if (rivalIsHighBidder) {
      callbacks.onAppendLog(`Holding at ${formatCurrency(context.currentBid)}.`, 'rival');
      callbacks.onEndAuction(false, `${context.rival.name} holds at ${formatCurrency(context.currentBid)}.`);
      return context;
    }

    callbacks.onAppendLog(`${decision.reason}.`, 'rival');
    const playerWon = context.lastBidder === 'player';

    // Match the bark to the *reason* they fold.
    const rivalFinalBarkTrigger: BarkTrigger =
      decision.reason === 'Lost patience' ? 'patience_low' : 'outbid';

    callbacks.onEndAuction(playerWon, `${context.rival.name} ${decision.reason}!`, rivalFinalBarkTrigger);
  } else {
    const isFirstBid = !context.hasAnyBids;
    if (isFirstBid) {
      context.hasAnyBids = true;
      context.lastBidder = 'rival';
    } else {
      context.currentBid += decision.bidAmount;
      context.lastBidder = 'rival';
    }

    // Add flavor text based on rival's patience level
    const patience = context.rivalAI.getPatience();
    let flavorText = '';

    if (patience < 20) {
      // Avoid absolute promises like "final offer" since the rival may still bid after a counter.
      flavorText = "\n\nI'm near my limit.";
    } else if (patience < 30) {
      flavorText = '\n\nGetting tired of this...';
    } else if (patience < 50) {
      flavorText = '\n\nYou\'re really pushing it.';
    }

    const flavorInline = flavorText.replace(/\n+/g, ' ').trim();
    if (isFirstBid) {
      callbacks.onAppendLog(
        `Opening bid → ${formatCurrency(context.currentBid)}.${flavorInline ? ` ${flavorInline}` : ''}`,
        'rival'
      );
    } else {
      callbacks.onAppendLog(
        `Bid +${formatCurrency(decision.bidAmount)} → ${formatCurrency(context.currentBid)}.${flavorInline ? ` ${flavorInline}` : ''}`,
        'rival'
      );
    }

    // Auctioneer commentary should come AFTER the bid is logged so the log timeline reads correctly.
    callbacks.onShowAuctioneerBark('rival_bid');

    // Show rival bark for bidding (after auctioneer).
    callbacks.onShowRivalBarkAfterAuctioneer('bid');

    // Non-blocking update: refresh UI and keep momentum.
    callbacks.onSetupUI();

    // Auctioneer responded; now hand the turn back to the player.
    // Slightly delay enabling player input so the rival's post-bid bark lands first.
    callbacks.onScheduleEnablePlayerTurn(GAME_CONFIG.ui.modalDelays.rivalBarkAfterAuctioneer + 75);
  }

  return context;
}

export { BID_INCREMENT, POWER_BID_INCREMENT, KICK_TIRES_BUDGET_REDUCTION, REQUIRED_EYE_LEVEL_FOR_KICK_TIRES, REQUIRED_TONGUE_LEVEL_FOR_STALL };
