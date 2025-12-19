import { getRandomCar, type Car } from '@/data/car-database';
import { calculateRivalInterest, getRivalByTierProgression, type Rival } from '@/data/rival-database';
import type { SpecialEvent } from '@/systems/special-events-system';

/**
 * Result of routing a map exploration into the next playable encounter.
 * Used by scenes to decide which scene to start and what data to pass.
 */
export type RoutedEncounter =
  | {
      kind: 'auction';
      apCost: number;
      sceneKey: 'AuctionScene';
      sceneData: { car: Car; rival: Rival; interest: number; locationId: string };
    }
  | {
      kind: 'negotiation';
      apCost: number;
      sceneKey: 'NegotiationScene';
      sceneData: { car: Car; locationId: string };
    };

/**
 * Routes a regular map exploration into either an auction (rival present) or negotiation.
 */
export function routeRegularEncounter(params: {
  locationId: string;
  car: Car;
  hasRival: boolean;
  playerPrestige: number;
  auctionApCost: number;
  inspectApCost: number;
}): RoutedEncounter {
  const { locationId, car, hasRival, playerPrestige, auctionApCost, inspectApCost } = params;

  if (hasRival) {
    const rival =
      locationId === 'scrapyard_1'
        ? getRivalByTierProgression(playerPrestige, 1, { excludeIds: ['scrapyard_joe'] })
        : getRivalByTierProgression(playerPrestige);
    const interest = calculateRivalInterest(rival, car.tags);

    return {
      kind: 'auction',
      apCost: auctionApCost,
      sceneKey: 'AuctionScene',
      sceneData: { car, rival, interest, locationId },
    };
  }

  return {
    kind: 'negotiation',
    apCost: inspectApCost,
    sceneKey: 'NegotiationScene',
    sceneData: { car, locationId },
  };
}

/**
 * Builds the car reward for a special event by starting from a random car
 * and applying any event-specific tag guarantees and value multipliers.
 */
export function buildSpecialEventCar(specialEvent: SpecialEvent): Car {
  let car = getRandomCar();

  if (specialEvent.reward.guaranteedTags && specialEvent.reward.guaranteedTags.length > 0) {
    car = {
      ...car,
      tags: [...new Set([...car.tags, ...specialEvent.reward.guaranteedTags])],
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
