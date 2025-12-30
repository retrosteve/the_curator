import type { Car } from '@/data/car-database';

/**
 * Player State - Represents all player-owned resources and progression.
 * Treat returned objects as immutable to prevent untracked state mutations.
 */
export interface PlayerState {
  money: number;
  inventory: Car[];
  garageSlots: number;
  prestige: number;
  bankLoanTaken: boolean;
  activeLoan: FinanceLoan | null;
  skills: {
    eye: number; // 1-5
    tongue: number; // 1-5
    network: number; // 1-5
  };
  skillXP: {
    eye: number;
    tongue: number;
    network: number;
  };
  visitedLocations?: Set<string>; // Track locations for Network XP (first visit only)
  claimedSets?: Set<string>; // Track completed sets to avoid duplicate rewards
}

/**
 * World State - Represents the global day progression and per-day state.
 * Days advance via end-of-day transitions.
 */
export interface WorldState {
  day: number;
  currentLocation: string;
  /** Remaining time units in the current day. */
  timeRemaining: number;
  /**
   * Per-day car offer for each location id.
   * - Missing key: not yet rolled for the day.
   * - null: rolled and consumed/cleared for the day.
   */
  carOfferByLocation: Record<string, Car | null>;
  /**
   * Rival presence roll for the current day, keyed by location id.
   * Stored in world state so it remains stable across scene transitions and reloads.
   */
  rivalPresenceByLocation: Record<string, boolean>;
  dayStats: {
    carsAcquired: number;
    moneyEarned: number;
    moneySpent: number;
    prestigeGained: number;
  };
}

export interface FinanceLoan {
  lenderName: 'Preston Banks';
  principal: number;
  fee: number;
  takenDay: number;
}

export type AutosavePolicy = 'on-change' | 'end-of-day';

export type SetConfig = {
  name: string;
  description: string;
  requiredTags: readonly string[];
  requiredCount: number;
  prestigeReward: number;
  icon: string;
};

export type EndDayResult =
  | { bankrupt: true; requiredRent: number }
  | { bankrupt: false; rentPaid: number };

/**
 * Victory check result.
 */
export interface VictoryResult {
  hasWon: boolean;
  prestige: { current: number; required: number; met: boolean };
  unicorns: { current: number; required: number; met: boolean };
  collectionCars: { current: number; required: number; met: boolean };
  skillLevel: { current: number; required: number; met: boolean };
}
