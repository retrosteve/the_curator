import type { Car } from '@/data/car-database';

export type ToggleCollectionDecision =
  | { ok: false; message: string }
  | { ok: true; nextInCollection: boolean };

export function decideToggleCollectionStatus(params: {
  car: Pick<Car, 'condition'>;
  currentlyInCollection: boolean;
  collectionCount: number;
  collectionSlots: number;
  garageCarCount: number;
  garageSlots: number;
}): ToggleCollectionDecision {
  if (!params.currentlyInCollection && params.car.condition < 80) {
    return {
      ok: false,
      message: 'Car must be in excellent condition (80%+) to add to your collection',
    };
  }

  if (!params.currentlyInCollection) {
    // Moving Garage -> Collection
    if (params.collectionCount >= params.collectionSlots) {
      return {
        ok: false,
        message: `Collection is full (${params.collectionCount}/${params.collectionSlots} items). Remove a car from the collection to make space.`,
      };
    }

    return { ok: true, nextInCollection: true };
  }

  // Moving Collection -> Garage
  if (params.garageCarCount >= params.garageSlots) {
    return {
      ok: false,
      message: `Garage is full (${params.garageCarCount}/${params.garageSlots} slots used). Sell a car or add another car to your collection before removing this one.`,
    };
  }

  return { ok: true, nextInCollection: false };
}
