import type { Car } from '@/data/car-database';

export function resetDailyCarOffers(): Record<string, Car | null> {
  return {};
}

export function resetDailyRivalPresence(): Record<string, boolean> {
  return {};
}

export function sanitizeDailyOfferMap(offerMap: unknown): Record<string, Car | null> {
  if (!offerMap || typeof offerMap !== 'object') {
    return {};
  }

  // Mutate a shallow-copied object so callers can safely replace the reference.
  const sanitized: Record<string, Car | null> = { ...(offerMap as Record<string, Car | null>) };

  for (const [locationId, offer] of Object.entries(sanitized)) {
    if (!locationId || locationId === 'garage') {
      delete sanitized[locationId];
      continue;
    }

    if (offer === null) continue;

    const maybeCar = offer as Partial<Car> | undefined;
    const isValidCar =
      Boolean(maybeCar) &&
      typeof maybeCar === 'object' &&
      typeof maybeCar.id === 'string' &&
      typeof maybeCar.name === 'string' &&
      typeof maybeCar.baseValue === 'number' &&
      typeof maybeCar.condition === 'number' &&
      Array.isArray(maybeCar.tags) &&
      Array.isArray(maybeCar.history) &&
      typeof maybeCar.tier === 'string';

    if (!isValidCar) {
      delete sanitized[locationId];
    }
  }

  return sanitized;
}

export function sanitizeDailyRivalPresenceMap(presenceMap: unknown): Record<string, boolean> {
  if (!presenceMap || typeof presenceMap !== 'object') {
    return {};
  }

  const sanitized: Record<string, boolean> = { ...(presenceMap as Record<string, boolean>) };

  for (const [locationId, present] of Object.entries(sanitized)) {
    if (!locationId || locationId === 'garage') {
      delete sanitized[locationId];
      continue;
    }

    if (typeof present !== 'boolean') {
      delete sanitized[locationId];
    }
  }

  return sanitized;
}

export function ensureDailyCarOffersForLocations(params: {
  offerMap: Record<string, Car | null>;
  locationIds: readonly string[];
  rollCar: (locationId: string) => Car;
}): void {
  for (const locationId of params.locationIds) {
    if (!locationId || locationId === 'garage') continue;
    if (Object.prototype.hasOwnProperty.call(params.offerMap, locationId)) continue;
    params.offerMap[locationId] = params.rollCar(locationId);
  }
}

export function consumeDailyCarOfferForLocation(params: {
  offerMap: Record<string, Car | null>;
  locationId: string;
}): void {
  if (!params.locationId || params.locationId === 'garage') return;
  params.offerMap[params.locationId] = null;
}

export function ensureRivalPresenceForLocations(params: {
  presenceMap: Record<string, boolean>;
  locationIds: readonly string[];
  rollIsPresent: () => boolean;
}): void {
  for (const locationId of params.locationIds) {
    if (!locationId || locationId === 'garage') continue;
    if (Object.prototype.hasOwnProperty.call(params.presenceMap, locationId)) continue;
    params.presenceMap[locationId] = params.rollIsPresent();
  }
}

export function hasRivalAtLocation(params: {
  presenceMap: Record<string, boolean>;
  locationId: string;
  rollIsPresent: () => boolean;
}): boolean {
  if (!params.locationId || params.locationId === 'garage') return false;

  if (!Object.prototype.hasOwnProperty.call(params.presenceMap, params.locationId)) {
    params.presenceMap[params.locationId] = params.rollIsPresent();
  }

  return Boolean(params.presenceMap[params.locationId]);
}
