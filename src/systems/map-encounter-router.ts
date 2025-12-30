import { getRandomCarWithPreferences, type Car, type CarTier } from '@/data/car-database';
import { getBaseLocationDefinitionById } from '@/data/location-database';
import { calculateRivalInterest, getRivalByTierProgression, type Rival } from '@/data/rival-database';
import type { SpecialEvent } from '@/systems/special-events-system';

export type AuctionRivalEntry = { rival: Rival; interest: number };

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function rollAttendanceChanceFromInterest(interest: number): number {
  // Interest is 50 base, up to 100. Turn that into a reasonable attendance chance.
  // 50 -> ~0.35, 100 -> ~0.85.
  const t = clamp01((interest - 35) / 65);
  return 0.35 + t * 0.5;
}

export function pickAttendingRivals(params: {
  playerPrestige: number;
  day: number;
  carTags: readonly string[];
  minAttendees?: number;
  maxAttendees?: number;
  candidateCount?: number;
  excludeIds?: readonly string[];
}): AuctionRivalEntry[] {
  const minAttendees = Math.max(1, Math.floor(params.minAttendees ?? 2));
  const maxAttendees = Math.max(minAttendees, Math.floor(params.maxAttendees ?? 5));
  const candidateCount = Math.max(maxAttendees, Math.floor(params.candidateCount ?? 8));

  const exclude = new Set(params.excludeIds ?? []);
  const candidates: AuctionRivalEntry[] = [];

  for (let i = 0; i < candidateCount; i++) {
    const rival = getRivalByTierProgression(params.playerPrestige, params.day, {
      excludeIds: [...exclude],
    });
    exclude.add(rival.id);
    const interest = calculateRivalInterest(rival, [...params.carTags]);
    candidates.push({ rival, interest });
  }

  // Higher-interest rivals are more likely to show up.
  const attending: AuctionRivalEntry[] = [];
  for (const entry of candidates) {
    if (attending.length >= maxAttendees) break;
    const chance = rollAttendanceChanceFromInterest(entry.interest);
    if (Math.random() < chance) attending.push(entry);
  }

  // Ensure a minimum number of attendees by taking the highest-interest candidates.
  if (attending.length < minAttendees) {
    const sorted = candidates.slice().sort((a, b) => b.interest - a.interest);
    for (const entry of sorted) {
      if (attending.length >= minAttendees) break;
      if (attending.some((e) => e.rival.id === entry.rival.id)) continue;
      attending.push(entry);
    }
  }

  return attending.slice(0, maxAttendees);
}

/**
 * Result of routing a map exploration into the next playable encounter.
 * Used by scenes to decide which scene to start and what data to pass.
 */
export type RoutedEncounter =
  | {
      kind: 'auction';
      sceneKey: 'AuctionScene';
      sceneData: { car: Car; rivals: AuctionRivalEntry[]; locationId: string };
    };

/**
 * Routes a regular map exploration into an auction encounter.
 */
export function routeRegularEncounter(params: {
  locationId: string;
  car: Car;
  playerPrestige: number;
  day?: number;
}): RoutedEncounter {
  const { locationId, car, playerPrestige } = params;
  const day = Math.max(1, Math.floor(params.day ?? 1));

  const rivals = pickAttendingRivals({
    playerPrestige,
    day,
    carTags: car.tags,
  });

  return {
    kind: 'auction',
    sceneKey: 'AuctionScene',
    sceneData: { car, rivals, locationId },
  };
}

/**
 * Builds the car reward for a special event by starting from a random car
 * and applying any event-specific tag guarantees and value multipliers.
 */
export function buildSpecialEventCar(specialEvent: SpecialEvent, playerPrestige?: number): Car {
  const guaranteedTags = specialEvent.reward.guaranteedTags ?? [];

  const tierWeightMultipliers = inferTierBiasFromSpecialEventTags(guaranteedTags);

  let car = getRandomCarWithPreferences({
    preferredTags: guaranteedTags,
    tierWeightMultipliers,
    requirePreferredTagMatch: guaranteedTags.length > 0,
    playerPrestige,
  });

  if (guaranteedTags.length > 0) {
    car = {
      ...car,
      tags: [...new Set([...car.tags, ...guaranteedTags])],
    };
  }

  if (specialEvent.reward.carValueMultiplier) {
    car = {
      ...car,
      baseValue: Math.floor(car.baseValue * specialEvent.reward.carValueMultiplier),
    };
  }

  return car;
}

function inferTierBiasFromSpecialEventTags(
  guaranteedTags: readonly string[]
): Partial<Record<CarTier, number>> | undefined {
  if (guaranteedTags.length === 0) return undefined;

  // Map special events onto an existing auction “flavor” using the same biases
  // as the corresponding base auction location.
  const hasAny = (needles: readonly string[]): boolean => needles.some((t) => guaranteedTags.includes(t));

  const auctionId = hasAny(['Exotic', 'European'])
    ? 'auction_exotics'
    : hasAny(['Classic', 'Muscle'])
      ? 'auction_classics'
      : hasAny(['JDM'])
        ? 'auction_jdm'
        : null;

  if (!auctionId) return undefined;

  const location = getBaseLocationDefinitionById(auctionId);
  return location?.tierWeightMultipliers;
}
