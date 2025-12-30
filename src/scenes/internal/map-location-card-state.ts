import type { LocationType } from '@/data/location-database';

export type MapLocationCardNode = {
  id: string;
  type: LocationType | 'special' | 'garage';
  unlockPrestige?: number;
  specialEvent?: { timeCost: number } | null;
};

export type MapLocationCardState = {
  isGarage: boolean;
  isLocked: boolean;
  lockReason: string;
  isExhaustedToday: boolean;
  timeCost: number;
};

export type MapLocationVisitGate =
  | { kind: 'allow' }
  | { kind: 'allow-with-toast'; toastMessage: string }
  | { kind: 'block'; title: string; message: string };

type ExhaustedTodayDecision =
  | { kind: 'not-exhausted' }
  | { kind: 'allow' }
  | { kind: 'allow-with-toast'; toastMessage: string }
  | { kind: 'block' };

type LockDecision = { isLocked: boolean; lockReason: string };

function computeLockDecision(params: {
  nodeId: string;
  unlockPrestige?: number;

  playerPrestige: number;

  isTutorialActive: boolean;
  allowedLocationIds: ReadonlySet<string> | null;
}): LockDecision {
  const { nodeId, unlockPrestige, playerPrestige, isTutorialActive, allowedLocationIds } = params;

  const isTutorialRestricted = isTutorialActive && allowedLocationIds !== null;
  const isDisallowedByTutorial =
    isTutorialRestricted && allowedLocationIds !== null && !allowedLocationIds.has(nodeId);

  if (isDisallowedByTutorial) {
    return {
      isLocked: true,
      lockReason: 'Tutorial: Follow the current step to continue.',
    };
  }

  const requiredPrestige = unlockPrestige ?? 0;
  if (requiredPrestige > 0 && playerPrestige < requiredPrestige) {
    return {
      isLocked: true,
      lockReason: `Requires ${requiredPrestige} Prestige`,
    };
  }

  return { isLocked: false, lockReason: '' };
}

function computeExhaustedTodayDecision(params: {
  nodeId: string;
  nodeType: MapLocationCardNode['type'];

  isTutorialActive: boolean;
  isOnRedemptionStep: boolean;
  isOnFirstVisitAuctionStep: boolean;

  offerMap: Record<string, unknown>;
}): ExhaustedTodayDecision {
  const {
    nodeId,
    nodeType,
    isTutorialActive,
    isOnRedemptionStep,
    isOnFirstVisitAuctionStep,
    offerMap,
  } = params;

  if (nodeType === 'special' || nodeId === 'garage') return { kind: 'not-exhausted' };

  const isTutorialFirstAuctionVisit =
    nodeId === 'auction_1' && isTutorialActive && isOnFirstVisitAuctionStep;
  const isTutorialRedemptionAuctionVisit =
    nodeId === 'auction_1' && isTutorialActive && isOnRedemptionStep;

  const isExhaustedTodayRaw =
    Object.prototype.hasOwnProperty.call(offerMap, nodeId) &&
    (offerMap as Record<string, unknown>)[nodeId] === null;

  if (!isExhaustedTodayRaw) return { kind: 'not-exhausted' };

  if (isTutorialFirstAuctionVisit) {
    // Allowed: tutorial loop protection.
    return { kind: 'allow' };
  }

  if (isTutorialRedemptionAuctionVisit) {
    // Allowed: redemption replays until the player wins.
    return { kind: 'allow-with-toast', toastMessage: 'Tutorial: redemption auction is still running.' };
  }

  return { kind: 'block' };
}

export function computeMapLocationVisitGate(params: {
  node: Pick<MapLocationCardNode, 'id' | 'type'>;

  isTutorialActive: boolean;
  isOnRedemptionStep: boolean;
  isOnFirstVisitAuctionStep: boolean;

  offerMap: Record<string, unknown>;
  nodeName: string;
}): MapLocationVisitGate {
  const { node, isTutorialActive, isOnRedemptionStep, isOnFirstVisitAuctionStep, offerMap, nodeName } =
    params;

  const decision = computeExhaustedTodayDecision({
    nodeId: node.id,
    nodeType: node.type,
    isTutorialActive,
    isOnRedemptionStep,
    isOnFirstVisitAuctionStep,
    offerMap,
  });

  if (decision.kind === 'block') {
    return {
      kind: 'block',
      title: 'Exhausted Today',
      message: `${nodeName} has already been picked clean today. Check back tomorrow.`,
    };
  }

  if (decision.kind === 'allow-with-toast') {
    return { kind: 'allow-with-toast', toastMessage: decision.toastMessage };
  }

  return { kind: 'allow' };
}

export function computeMapLocationCardState(params: {
  node: MapLocationCardNode;
  playerPrestige: number;

  isTutorialActive: boolean;
  allowedLocationIds: ReadonlySet<string> | null;
  isOnRedemptionStep: boolean;
  isOnFirstVisitAuctionStep: boolean;

  offerMap: Record<string, unknown>;

  travelCost: number;
  auctionParticipationCost: number;
}): MapLocationCardState {
  const {
    node,
    playerPrestige,
    isTutorialActive,
    allowedLocationIds,
    isOnRedemptionStep,
    isOnFirstVisitAuctionStep,
    offerMap,
    travelCost,
    auctionParticipationCost,
  } = params;

  const isGarage = node.id === 'garage' || node.type === 'garage';

  const { isLocked, lockReason } = computeLockDecision({
    nodeId: node.id,
    unlockPrestige: node.unlockPrestige,
    playerPrestige,
    isTutorialActive,
    allowedLocationIds,
  });

  const exhaustedDecision = computeExhaustedTodayDecision({
    nodeId: node.id,
    nodeType: node.type,
    isTutorialActive,
    isOnRedemptionStep,
    isOnFirstVisitAuctionStep,
    offerMap,
  });

  const isExhaustedToday = exhaustedDecision.kind === 'block';

  const timeCost = (() => {
    if (isGarage) return 0;
    if (node.specialEvent) return node.specialEvent.timeCost;
    // Tutorial flow currently waives this cost to avoid soft-locks.
    if (isTutorialActive) return 0;
    return travelCost + auctionParticipationCost;
  })();

  return { isGarage, isLocked, lockReason, isExhaustedToday, timeCost };
}
