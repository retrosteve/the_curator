/**
 * Rival AI strategy types.
 * Aggressive: Bids often, spends patience quickly
 * Passive: Conservative bidding, maintains patience
 * Collector: Overpays for wishlist items, passive otherwise
 */
import { GAME_CONFIG } from '@/config/game-config';

export type RivalStrategy = 'Aggressive' | 'Passive' | 'Collector';

/**
 * Rival data structure.
 * Tiers: 1=Tycoon (late-game, hardest), 2=Enthusiast (mid-game), 3=Scrapper (early-game, easiest)
 * Note: Tier numbering is intentionally inverted from difficulty.
 */
export interface Rival {
  id: string;
  name: string;
  tier: 1 | 2 | 3; // 1 = Tycoon, 2 = Enthusiast, 3 = Scrapper
  budget: number;
  patience: number; // 0-100
  wishlist: string[]; // Tags they target
  strategy: RivalStrategy;
  avatar?: string; // Optional avatar color/identifier
}

/**
 * Static rival database.
 * Defines all rival NPCs with their budgets, strategies, and preferences.
 * Each rival has a unique personality and collection focus.
 */
export const RivalDatabase: Rival[] = [
  // Named Tutorial Rivals
  {
    id: 'sterling_vance',
    name: 'Sterling Vance',
    tier: 1,
    budget: 75000,
    patience: 50,
    wishlist: ['Muscle', 'Classic', 'American', 'Iconic'],
    strategy: 'Aggressive',
    avatar: '#8B0000',
  },
  {
    id: 'scrapyard_joe',
    name: 'Scrapyard Joe',
    tier: 3,
    budget: 8000,
    patience: 30,
    wishlist: ['Daily Driver', 'Budget', 'Rust'],
    strategy: 'Passive',
    avatar: '#8B4513',
  },
  // Regular Rivals
  {
    id: 'rival_001',
    name: 'Marcus "The Shark" Thompson',
    tier: 1,
    budget: 50000,
    patience: 30,
    wishlist: ['Muscle', 'American', 'Classic'],
    strategy: 'Aggressive',
    avatar: '#FF4444',
  },
  {
    id: 'rival_002',
    name: 'Yuki Tanaka',
    tier: 2,
    budget: 60000,
    patience: 70,
    wishlist: ['JDM', 'Sports', 'Turbo'],
    strategy: 'Collector',
    avatar: '#4444FF',
  },
  {
    id: 'rival_003',
    name: 'Sarah Mitchell',
    tier: 2,
    budget: 40000,
    patience: 50,
    wishlist: ['Classic', 'Rare', 'Original'],
    strategy: 'Passive',
    avatar: '#44FF44',
  },
  {
    id: 'rival_004',
    name: 'Victor "Fast Vic" Rodriguez',
    tier: 1,
    budget: 55000,
    patience: 40,
    wishlist: ['Sports', 'Modified', 'Track Car'],
    strategy: 'Aggressive',
    avatar: '#FF8800',
  },
  {
    id: 'rival_005',
    name: 'Eleanor Wright',
    tier: 1,
    budget: 45000,
    patience: 60,
    wishlist: ['Exotic', 'Pristine', 'Low Miles'],
    strategy: 'Collector',
    avatar: '#AA44FF',
  },
  {
    id: 'rival_006',
    name: 'Tommy "Rust Bucket" Chen',
    tier: 3,
    budget: 35000,
    patience: 80,
    wishlist: ['Project Car', 'Barn Find', 'Rust'],
    strategy: 'Passive',
    avatar: '#FFAA44',
  },
];

/**
 * Get a random rival from the database.
 * @returns A rival selected randomly from the database
 */
export function getRandomRival(): Rival {
  const randomIndex = Math.floor(Math.random() * RivalDatabase.length);
  return RivalDatabase[randomIndex];
}

/**
 * Get a specific rival by ID (useful for tutorial/story encounters).
 * @param id - The unique ID of the rival
 * @returns The rival if found, or a random rival as fallback
 */
export function getRivalById(id: string): Rival {
  const rival = RivalDatabase.find(r => r.id === id);
  if (!rival) {
    console.warn(`Rival with ID "${id}" not found, returning random rival`);
    return getRandomRival();
  }
  return rival;
}

/**
 * Get a random rival based on player prestige tier progression.
 * Tier 3 (Scrappers): Early game, easiest - available up to 50 prestige
 * Tier 2 (Enthusiasts): Mid game - available up to 150 prestige
 * Tier 1 (Tycoons): Late game, hardest - available from 150+ prestige
 * @param playerPrestige - Current player prestige level
 * @returns A rival appropriate for the player's current prestige level
 */
export function getRivalByTierProgression(playerPrestige: number): Rival {
  const { tierProgression } = GAME_CONFIG.rivalAI;

  let availableTiers: (1 | 2 | 3)[];

  if (playerPrestige >= tierProgression.tier1MinPrestige) {
    // High prestige: All tiers available, but favor Tier 1
    availableTiers = [1, 1, 1, 2, 3]; // 60% Tier 1, 20% Tier 2, 20% Tier 3
  } else if (playerPrestige >= tierProgression.tier2MaxPrestige) {
    // Medium prestige: Tier 2 and 3 available
    availableTiers = [2, 2, 2, 3]; // 75% Tier 2, 25% Tier 3
  } else {
    // Low prestige: Only Tier 3 available
    availableTiers = [3];
  }

  const selectedTier = availableTiers[Math.floor(Math.random() * availableTiers.length)];
  const tierRivals = RivalDatabase.filter(rival => rival.tier === selectedTier);

  if (tierRivals.length === 0) {
    // Fallback to any rival if no rivals match the selected tier
    console.warn(`No rivals found for tier ${selectedTier}, falling back to random rival`);
    return getRandomRival();
  }

  const randomIndex = Math.floor(Math.random() * tierRivals.length);
  return tierRivals[randomIndex];
}

/**
 * Calculate rival interest in a car based on wishlist matching.
 * Base interest is 50; each matching tag adds 15 points.
 * @param rival - The rival to evaluate
 * @param carTags - Tags of the car being considered
 * @returns Interest level (0-100, capped at 100)
 */
export function calculateRivalInterest(rival: Rival, carTags: string[]): number {
  let interest = 50; // Base interest
  
  // Check wishlist match
  const matches = carTags.filter((tag) => rival.wishlist.includes(tag));
  interest += matches.length * 15;
  
  // Cap at 100
  return Math.min(interest, 100);
}

/**
 * Determine if rival should continue bidding and calculate bid amount.
 * Factors: budget constraint, patience level, strategy type, car interest.
 * @param rival - The rival making the decision
 * @param currentBid - Current auction bid amount
 * @param carInterest - Rival's interest level in the car (0-100)
 * @returns Decision object with shouldBid flag, bid amount, and reason
 */
/**
 * Bid decision result from rival AI.
 * Used to communicate rival's bidding choice and reasoning.
 */
export interface BidDecision {
  shouldBid: boolean;
  bidAmount: number;
  reason: string;
}

export function getRivalBidDecision(
  rival: Rival,
  currentBid: number,
  carInterest: number
): BidDecision {
  // Check budget constraint
  if (currentBid > rival.budget) {
    return {
      shouldBid: false,
      bidAmount: 0,
      reason: 'Out of budget',
    };
  }

  // Check patience
  if (rival.patience <= 0) {
    return {
      shouldBid: false,
      bidAmount: 0,
      reason: 'Lost patience',
    };
  }

  // Calculate bid amount based on strategy
  let bidAmount = 0;
  const collectorHighInterestThreshold =
    GAME_CONFIG.rivalAI.collectorHighInterestThreshold;
  
  switch (rival.strategy) {
    case 'Aggressive':
      bidAmount = GAME_CONFIG.auction.rivalBidIncrements.aggressive;
      break;
    case 'Passive':
      bidAmount = GAME_CONFIG.auction.rivalBidIncrements.passive;
      break;
    case 'Collector':
      bidAmount =
        carInterest > collectorHighInterestThreshold
          ? GAME_CONFIG.auction.rivalBidIncrements.collectorHighInterest
          : GAME_CONFIG.auction.rivalBidIncrements.collectorLowInterest;
      break;
  }

  // Make sure we don't exceed budget
  if (currentBid + bidAmount > rival.budget) {
    bidAmount = rival.budget - currentBid;
  }

  return {
    shouldBid: true,
    bidAmount,
    reason: `${rival.strategy} strategy`,
  };
}
