import type { UIManager } from '@/ui/ui-manager';
import type { Rival } from '@/data/rival-database';
import { getRivalBark } from '@/data/rival-database';
import type { BarkTrigger } from '@/data/rival-database';
import { formatCurrency } from '@/utils/format';
import { GAME_CONFIG } from '@/config/game-config';

/**
 * Speech bubble dialogue system for AuctionScene.
 * Manages rival and auctioneer speech bubbles with animations.
 * Extracted from AuctionScene to reduce file size and improve maintainability.
 */

export interface DialogueState {
  activeRivalBubble?: HTMLDivElement;
  activeRivalBubbleText?: HTMLSpanElement;
  activeRivalBubbleHideTimeoutId?: number;
  activeRivalBubbleRemoveTimeoutId?: number;
  lastRivalBarkText?: string;
  
  activeAuctioneerBubble?: HTMLDivElement;
  activeAuctioneerBubbleText?: HTMLSpanElement;
  activeAuctioneerBubbleHideTimeoutId?: number;
  activeAuctioneerBubbleRemoveTimeoutId?: number;
  lastAuctioneerBarkText?: string;
  
  rivalPortraitAnchor?: HTMLDivElement;
  auctioneerPortraitAnchor?: HTMLDivElement;
}

/**
 * Create a speech bubble element.
 */
function createSpeechBubble(
  anchoredToPortrait: boolean,
  anchorType: 'rival' | 'auctioneer'
): { bubble: HTMLDivElement; messageSpan: HTMLSpanElement } {
  const bubble = document.createElement('div');

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
    const topPosition = anchorType === 'auctioneer' ? '24%' : '30%';
    const horizontalAlign = anchorType === 'auctioneer' ? 'left: 25%; transform: translateX(-50%);' : 'right: 25%; transform: translateX(50%);';
    
    bubble.style.cssText = `
      position: absolute;
      top: ${topPosition};
      ${horizontalAlign}
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
    const tailPosition = anchorType === 'auctioneer'
      ? 'bottom: -8px; right: 0; border-right: 10px solid #fff;'
      : 'bottom: -8px; left: 0; border-left: 10px solid #fff;';
    
    tail.style.cssText = `
      position: absolute;
      ${tailPosition}
      width: 0;
      height: 0;
      border-bottom: 10px solid transparent;
    `;
  }
  bubble.appendChild(tail);

  return { bubble, messageSpan };
}

/**
 * Animate a speech bubble into view.
 */
function animateBubble(
  bubble: HTMLDivElement,
  anchoredToPortrait: boolean,
  anchorType: 'rival' | 'auctioneer',
  shouldAnimate: boolean
): void {
  if (shouldAnimate) {
    bubble.style.opacity = '0';
    if (anchoredToPortrait) {
      bubble.style.transform = 'translateX(12px) translateY(-50%)';
      requestAnimationFrame(() => {
        bubble.style.opacity = '1';
        bubble.style.transform = 'translateX(0px) translateY(-50%)';
      });
    } else {
      const startTop = anchorType === 'auctioneer' ? '26%' : '30%';
      const endTop = anchorType === 'auctioneer' ? '24%' : '28%';
      bubble.style.top = startTop;
      requestAnimationFrame(() => {
        bubble.style.opacity = '1';
        bubble.style.top = endTop;
      });
    }
  } else {
    bubble.style.opacity = '1';
    if (anchoredToPortrait) {
      bubble.style.transform = 'translateX(0px) translateY(-50%)';
    } else {
      bubble.style.top = anchorType === 'auctioneer' ? '24%' : '28%';
    }
  }
}

/**
 * Clear rival speech bubble and timeouts.
 */
export function clearActiveRivalBubble(state: DialogueState): void {
  if (state.activeRivalBubbleHideTimeoutId !== undefined) {
    clearTimeout(state.activeRivalBubbleHideTimeoutId);
    state.activeRivalBubbleHideTimeoutId = undefined;
  }
  if (state.activeRivalBubbleRemoveTimeoutId !== undefined) {
    clearTimeout(state.activeRivalBubbleRemoveTimeoutId);
    state.activeRivalBubbleRemoveTimeoutId = undefined;
  }
  if (state.activeRivalBubble) {
    state.activeRivalBubble.remove();
    state.activeRivalBubble = undefined;
    state.activeRivalBubbleText = undefined;
  }
}

/**
 * Clear auctioneer speech bubble and timeouts.
 */
export function clearActiveAuctioneerBubble(state: DialogueState): void {
  if (state.activeAuctioneerBubbleHideTimeoutId !== undefined) {
    clearTimeout(state.activeAuctioneerBubbleHideTimeoutId);
    state.activeAuctioneerBubbleHideTimeoutId = undefined;
  }
  if (state.activeAuctioneerBubbleRemoveTimeoutId !== undefined) {
    clearTimeout(state.activeAuctioneerBubbleRemoveTimeoutId);
    state.activeAuctioneerBubbleRemoveTimeoutId = undefined;
  }
  if (state.activeAuctioneerBubble) {
    state.activeAuctioneerBubble.remove();
    state.activeAuctioneerBubble = undefined;
    state.activeAuctioneerBubbleText = undefined;
  }
}

/**
 * Render rival bark text in a speech bubble.
 */
export function renderRivalBarkText(
  text: string,
  state: DialogueState,
  context: {
    rival: Rival;
    uiManager: UIManager;
    onAppendLog: (text: string, kind: string) => void;
  },
  options?: { suppressLog?: boolean; animate?: boolean }
): void {
  const trimmed = text.trim();
  if (!trimmed) return;

  state.lastRivalBarkText = trimmed;

  if (!options?.suppressLog) {
    context.onAppendLog(`${context.rival.name}: "${trimmed}"`, 'rival');
  }

  // Check if bubble needs recreation (orphaned by UI rebuild)
  if (state.activeRivalBubble && !state.activeRivalBubble.isConnected) {
    clearActiveRivalBubble(state);
  }

  if (!state.activeRivalBubble) {
    const anchoredToPortrait = state.rivalPortraitAnchor !== undefined;
    const { bubble, messageSpan } = createSpeechBubble(anchoredToPortrait, 'rival');

    state.activeRivalBubble = bubble;
    state.activeRivalBubbleText = messageSpan;

    if (state.rivalPortraitAnchor) {
      state.rivalPortraitAnchor.appendChild(bubble);
    } else {
      context.uiManager.appendToOverlay(bubble);
    }
  }

  if (state.activeRivalBubbleText) {
    state.activeRivalBubbleText.textContent = trimmed;
  }

  if (state.activeRivalBubbleHideTimeoutId !== undefined) {
    clearTimeout(state.activeRivalBubbleHideTimeoutId);
    state.activeRivalBubbleHideTimeoutId = undefined;
  }
  if (state.activeRivalBubbleRemoveTimeoutId !== undefined) {
    clearTimeout(state.activeRivalBubbleRemoveTimeoutId);
    state.activeRivalBubbleRemoveTimeoutId = undefined;
  }

  const bubble = state.activeRivalBubble;
  if (!bubble) return;

  const shouldAnimate = options?.animate ?? true;
  const anchoredToPortrait = state.rivalPortraitAnchor !== undefined;
  animateBubble(bubble, anchoredToPortrait, 'rival', shouldAnimate);
}

/**
 * Show rival bark based on trigger.
 */
export function showRivalBark(
  trigger: BarkTrigger,
  state: DialogueState,
  context: {
    rival: Rival;
    uiManager: UIManager;
    onAppendLog: (text: string, kind: string) => void;
  }
): void {
  const mood = context.rival.mood || 'Normal';
  const bark = getRivalBark(mood, trigger);
  renderRivalBarkText(bark.trim(), state, context);
}

/**
 * Render auctioneer bark text in a speech bubble.
 */
export function renderAuctioneerBarkText(
  text: string,
  state: DialogueState,
  context: {
    auctioneerName: string;
    uiManager: UIManager;
    onAppendLog: (text: string, kind: string) => void;
  },
  options?: { suppressLog?: boolean; animate?: boolean }
): void {
  const trimmed = text.trim();
  if (!trimmed) return;

  state.lastAuctioneerBarkText = trimmed;

  if (!options?.suppressLog) {
    context.onAppendLog(`${context.auctioneerName}: "${trimmed}"`, 'auctioneer');
  }

  // Check if bubble needs recreation (orphaned by UI rebuild)
  if (state.activeAuctioneerBubble && !state.activeAuctioneerBubble.isConnected) {
    clearActiveAuctioneerBubble(state);
  }

  if (!state.activeAuctioneerBubble) {
    const anchoredToPortrait = state.auctioneerPortraitAnchor !== undefined;
    const { bubble, messageSpan } = createSpeechBubble(anchoredToPortrait, 'auctioneer');

    state.activeAuctioneerBubble = bubble;
    state.activeAuctioneerBubbleText = messageSpan;

    if (state.auctioneerPortraitAnchor) {
      state.auctioneerPortraitAnchor.appendChild(bubble);
    } else {
      context.uiManager.appendToOverlay(bubble);
    }
  }

  if (state.activeAuctioneerBubbleText) {
    state.activeAuctioneerBubbleText.textContent = trimmed;
  }

  if (state.activeAuctioneerBubbleHideTimeoutId !== undefined) {
    clearTimeout(state.activeAuctioneerBubbleHideTimeoutId);
    state.activeAuctioneerBubbleHideTimeoutId = undefined;
  }
  if (state.activeAuctioneerBubbleRemoveTimeoutId !== undefined) {
    clearTimeout(state.activeAuctioneerBubbleRemoveTimeoutId);
    state.activeAuctioneerBubbleRemoveTimeoutId = undefined;
  }

  const bubble = state.activeAuctioneerBubble;
  if (!bubble) return;

  const shouldAnimate = options?.animate ?? true;
  const anchoredToPortrait = state.auctioneerPortraitAnchor !== undefined;
  animateBubble(bubble, anchoredToPortrait, 'auctioneer', shouldAnimate);
}

/**
 * Show auctioneer bark based on trigger.
 */
export function showAuctioneerBark(
  trigger: 'start' | 'opening_prompt' | 'player_bid' | 'player_power_bid' | 'rival_bid' | 'stall' | 'kick_tires' | 'end_player_win' | 'end_player_lose',
  state: DialogueState,
  context: {
    auctioneerName: string;
    currentBid: number;
    rivalName: string;
    uiManager: UIManager;
    onAppendLog: (text: string, kind: string) => void;
  }
): void {
  const pick = (lines: readonly string[]): string => lines[Math.floor(Math.random() * lines.length)] ?? '';

  let text = '';
  const BID_INCREMENT = GAME_CONFIG.auction.bidIncrement;

  switch (trigger) {
    case 'start':
      text = 'Alright folks—let\'s get this started.';
      break;
    case 'opening_prompt':
      text = pick([
        `Opening bid at ${formatCurrency(context.currentBid)}. Who wants it?`,
        `We\'re starting at ${formatCurrency(context.currentBid)}. Do I hear a bid?`,
      ]);
      break;
    case 'player_bid':
      text = pick([
        `I have ${formatCurrency(context.currentBid)}! Do I hear ${formatCurrency(context.currentBid + BID_INCREMENT)}?`,
        `New bid at ${formatCurrency(context.currentBid)}!`,
      ]);
      break;
    case 'player_power_bid':
      text = pick([
        `Big jump! ${formatCurrency(context.currentBid)} on the floor!`,
        `Power move—${formatCurrency(context.currentBid)}!`,
      ]);
      break;
    case 'rival_bid':
      text = pick([
        `We\'re at ${formatCurrency(context.currentBid)}!`,
        `Bid is ${formatCurrency(context.currentBid)}—who\'s next?`,
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
      text = `Sold! To you for ${formatCurrency(context.currentBid)}.`;
      break;
    case 'end_player_lose':
      text = `Sold! To ${context.rivalName} for ${formatCurrency(context.currentBid)}.`;
      break;
    default:
      text = '';
      break;
  }

  const trimmed = text.trim();
  if (!trimmed) return;

  renderAuctioneerBarkText(trimmed, state, context);
}
