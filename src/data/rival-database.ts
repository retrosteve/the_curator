/**
 * Rival AI strategy types
 */
export type RivalStrategy = 'Aggressive' | 'Passive' | 'Collector';

/**
 * Rival data structure
 */
export interface Rival {
  id: string;
  name: string;
  budget: number;
  patience: number; // 0-100
  wishlist: string[]; // Tags they target
  strategy: RivalStrategy;
  avatar?: string; // Optional avatar color/identifier
}

/**
 * Static rival database
 */
export const RivalDatabase: Rival[] = [
  {
    id: 'rival_001',
    name: 'Marcus "The Shark" Thompson',
    budget: 50000,
    patience: 30,
    wishlist: ['Muscle', 'American', 'Classic'],
    strategy: 'Aggressive',
    avatar: '#FF4444',
  },
  {
    id: 'rival_002',
    name: 'Yuki Tanaka',
    budget: 60000,
    patience: 70,
    wishlist: ['JDM', 'Sports', 'Turbo'],
    strategy: 'Collector',
    avatar: '#4444FF',
  },
  {
    id: 'rival_003',
    name: 'Sarah Mitchell',
    budget: 40000,
    patience: 50,
    wishlist: ['Classic', 'Rare', 'Original'],
    strategy: 'Passive',
    avatar: '#44FF44',
  },
  {
    id: 'rival_004',
    name: 'Victor "Fast Vic" Rodriguez',
    budget: 55000,
    patience: 40,
    wishlist: ['Sports', 'Modified', 'Track Car'],
    strategy: 'Aggressive',
    avatar: '#FF8800',
  },
  {
    id: 'rival_005',
    name: 'Eleanor Wright',
    budget: 45000,
    patience: 60,
    wishlist: ['Exotic', 'Pristine', 'Low Miles'],
    strategy: 'Collector',
    avatar: '#AA44FF',
  },
  {
    id: 'rival_006',
    name: 'Tommy "Rust Bucket" Chen',
    budget: 35000,
    patience: 80,
    wishlist: ['Project Car', 'Barn Find', 'Rust'],
    strategy: 'Passive',
    avatar: '#FFAA44',
  },
];

/**
 * Get a random rival
 */
export function getRandomRival(): Rival {
  const randomIndex = Math.floor(Math.random() * RivalDatabase.length);
  return RivalDatabase[randomIndex];
}

/**
 * Calculate rival interest in a car (0-100)
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
 * Determine if rival should continue bidding
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
  
  switch (rival.strategy) {
    case 'Aggressive':
      bidAmount = 500;
      break;
    case 'Passive':
      bidAmount = 100;
      break;
    case 'Collector':
      bidAmount = carInterest > 70 ? 500 : 200;
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
