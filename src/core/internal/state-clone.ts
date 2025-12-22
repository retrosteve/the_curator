import type { Car } from '@/data/car-database';
import type { PlayerState, WorldState } from '@/core/game-types';

export function cloneCar(car: Car): Car {
  return {
    ...car,
    tags: Array.isArray(car.tags) ? [...car.tags] : [],
    history: Array.isArray(car.history) ? [...car.history] : [],
  };
}

export function cloneInventory(inventory: Car[]): Car[] {
  return inventory.map((car) => cloneCar(car));
}

export function clonePlayerState(player: PlayerState): PlayerState {
  return {
    ...player,
    inventory: cloneInventory(player.inventory),
    activeLoan: player.activeLoan ? { ...player.activeLoan } : null,
    skills: { ...player.skills },
    skillXP: { ...player.skillXP },
    visitedLocations: player.visitedLocations ? new Set(player.visitedLocations) : new Set(['garage']),
    claimedSets: player.claimedSets ? new Set(player.claimedSets) : new Set<string>(),
  };
}

export function cloneWorldState(world: WorldState): WorldState {
  const carOfferByLocation: Record<string, Car | null> = {};
  for (const [locationId, offer] of Object.entries(world.carOfferByLocation ?? {})) {
    carOfferByLocation[locationId] = offer ? cloneCar(offer) : null;
  }

  return {
    ...world,
    carOfferByLocation,
    rivalPresenceByLocation: { ...(world.rivalPresenceByLocation ?? {}) },
    dayStats: { ...world.dayStats },
  };
}
