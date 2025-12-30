import type { CarTier } from './car-database';

export type LocationType = 'garage' | 'auction';

export type BaseLocationId =
  | 'garage'
  | 'auction_1'
  | 'auction_jdm'
  | 'auction_classics'
  | 'auction_exotics';

export interface BaseLocationDefinition {
  id: BaseLocationId;
  name: string;
  type: LocationType;
  color: number;

  /** Optional prestige gate (0/undefined = unlocked). */
  unlockPrestige?: number;

  /** Optional short description used by Map UI. */
  description?: string;

  /** Auction specialization: tags that are more likely to appear in daily offers. */
  focusTags?: readonly string[];

  /** Optional tier bias applied on top of prestige-based tier weights. */
  tierWeightMultipliers?: Partial<Record<CarTier, number>>;
}

export const BASE_LOCATIONS = [
  {
    id: 'garage',
    name: 'Your Garage',
    type: 'garage',
    color: 0x2ecc71,
  },
  {
    id: 'auction_1',
    name: 'Auction House',
    type: 'auction',
    color: 0xffd700,
    description: 'Competitive bidding. A balanced mix of cars.',
  },
  {
    id: 'auction_jdm',
    name: 'JDM Night Auction',
    type: 'auction',
    color: 0x00d1b2,
    focusTags: ['JDM'],
    description: 'Specialty night featuring Japanese performance and tuner culture.',
    tierWeightMultipliers: {
      'Daily Driver': 0.9,
      'Cult Classic': 1.2,
      Icon: 1.2,
      Unicorn: 0.8,
    },
  },
  {
    id: 'auction_classics',
    name: 'Heritage Auction',
    type: 'auction',
    color: 0xe67e22,
    focusTags: ['Classic', 'Muscle'],
    description: 'Curated classics and muscle icons. Chrome, history, and big torque.',
    tierWeightMultipliers: {
      'Daily Driver': 0.8,
      'Cult Classic': 1.3,
      Icon: 1.3,
      Unicorn: 1.0,
    },
  },
  {
    id: 'auction_exotics',
    name: 'Exotic Showcase',
    type: 'auction',
    color: 0x9b59b6,
    focusTags: ['Exotic'],
    description: 'High-end exotics and European legends. Expect higher stakes.',
    tierWeightMultipliers: {
      'Daily Driver': 0.5,
      'Cult Classic': 0.9,
      Icon: 1.5,
      Unicorn: 1.6,
    },
  },
] as const satisfies readonly BaseLocationDefinition[];

export function getBaseLocationDefinitionById(id: string): BaseLocationDefinition | null {
  return (BASE_LOCATIONS as readonly BaseLocationDefinition[]).find((loc) => loc.id === id) ?? null;
}

export function isBaseLocationId(value: string): value is BaseLocationId {
  return (BASE_LOCATIONS as readonly BaseLocationDefinition[]).some((loc) => loc.id === value);
}
