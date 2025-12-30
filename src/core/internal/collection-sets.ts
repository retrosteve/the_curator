import type { Car } from '@/data/car-database';
import type { SetConfig } from '@/core/game-types';

export type CollectionQualityTier = {
  tier: 'Good' | 'Excellent' | 'Perfect';
  prestigePerDay: 1 | 2 | 4;
  color: string;
};

export function getGarageCarsFromInventory(inventory: readonly Car[]): Car[] {
  return inventory.filter((car) => car.inCollection !== true);
}

export function getCollectionCarsFromInventory(inventory: readonly Car[]): Car[] {
  return inventory.filter((car) => car.inCollection === true);
}

export function getCollectionQualityTier(condition: number): CollectionQualityTier {
  if (condition >= 100) {
    return { tier: 'Perfect', prestigePerDay: 4, color: '#f39c12' };
  }
  if (condition >= 90) {
    return { tier: 'Excellent', prestigePerDay: 2, color: '#3498db' };
  }
  return { tier: 'Good', prestigePerDay: 1, color: '#95a5a6' };
}

export function calculateCollectionPrestigeBonus(collectionCars: readonly Car[]): number {
  let totalPrestige = 0;
  for (const car of collectionCars) {
    totalPrestige += getCollectionQualityTier(car.condition).prestigePerDay;
  }
  return totalPrestige;
}

export function getCollectionPrestigeInfo(collectionCars: readonly Car[]): {
  totalPerDay: number;
  carCount: number;
  breakdown: { good: number; excellent: number; perfect: number };
} {
  const breakdown = { good: 0, excellent: 0, perfect: 0 };
  let totalPerDay = 0;

  for (const car of collectionCars) {
    const tier = getCollectionQualityTier(car.condition);
    totalPerDay += tier.prestigePerDay;

    if (tier.tier === 'Perfect') breakdown.perfect += 1;
    else if (tier.tier === 'Excellent') breakdown.excellent += 1;
    else breakdown.good += 1;
  }

  return {
    totalPerDay,
    carCount: collectionCars.length,
    breakdown,
  };
}

export function getMatchingCarsForSet(inventory: readonly Car[], set: SetConfig): Car[] {
  return inventory.filter((car) => set.requiredTags.some((tag) => car.tags.includes(tag)));
}

export function isSetComplete(inventory: readonly Car[], set: SetConfig): boolean {
  return getMatchingCarsForSet(inventory, set).length >= set.requiredCount;
}

export function getNewlyCompletedSetIds(params: {
  sets: Record<string, SetConfig>;
  inventory: readonly Car[];
  claimedSets: ReadonlySet<string>;
}): string[] {
  const { sets, inventory, claimedSets } = params;
  const newlyCompleted: string[] = [];

  for (const [setId, set] of Object.entries(sets)) {
    if (claimedSets.has(setId)) continue;
    if (isSetComplete(inventory, set)) {
      newlyCompleted.push(setId);
    }
  }

  return newlyCompleted;
}

export function getSetProgress(params: {
  set: SetConfig;
  inventory: readonly Car[];
  isClaimed: boolean;
}): {
  current: number;
  required: number;
  isComplete: boolean;
  isClaimed: boolean;
  matchingCars: Car[];
} {
  const matchingCars = getMatchingCarsForSet(params.inventory, params.set);
  const current = matchingCars.length;
  const required = params.set.requiredCount;
  const isComplete = current >= required;

  return {
    current,
    required,
    isComplete,
    isClaimed: params.isClaimed,
    matchingCars,
  };
}
