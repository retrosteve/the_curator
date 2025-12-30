/**
 * Rival AI strategy types.
 * Aggressive: Bids often, spends patience quickly
 * Passive: Conservative bidding, maintains patience
 * Collector: Overpays for wishlist items, passive otherwise
 */
import { GAME_CONFIG } from '@/config/game-config';
import { warnLog } from '@/utils/log';

export type RivalStrategy = 'Aggressive' | 'Passive' | 'Collector';

/**
 * Rival mood types affecting daily behavior.
 * Moods change daily and modify bidding patterns.
 */
export type RivalMood = 'Desperate' | 'Cautious' | 'Confident' | 'Normal';

/**
 * Rival Bark Triggers
 */
export type BarkTrigger =
  | 'bid'
  | 'outbid'
  | 'win'
  | 'win_value'
  | 'win_overpay'
  | 'lose'
  | 'lose_overpay'
  | 'patience_low';

/**
 * Get a bark (dialogue line) for a rival based on their mood and the situation.
 * @param mood - The rival's current mood
 * @param trigger - The event triggering the bark
 * @returns A string of dialogue
 */
export function getRivalBark(mood: RivalMood, trigger: BarkTrigger): string {
  const barks: Record<RivalMood, Record<BarkTrigger, string[]>> = {
    Desperate: {
      bid: ["I... I really need this win!", "Don't push me!", "I'm all in on this one!"],
      outbid: ["No! That's too much!", "You're ruining me!", "Please, just let me have it!", "This is killing me!"],
      win: ["Finally! A win!", "Thank goodness...", "I needed that."],
      win_value: ["Finally—something went my way.", "Okay... that was actually a deal.", "Thank goodness... a fair price."],
      win_overpay: ["I paid too much... but I had to.", "That was expensive—still worth it.", "Ugh. Over estimate, but it's mine."],
      lose: ["Disaster... absolute disaster.", "What am I going to do now?", "You'll regret this!"],
      lose_overpay: ["You paid way too much!", "That's insane money!", "You overpaid—badly."],
      patience_low: ["I can't take this anymore!", "My nerves are shot!", "Just end it already!", "Stop dragging this out!", "Please—just call it!"]
    },
    Cautious: {
      bid: ["Let's be reasonable here.", "A calculated offer.", "I'm watching the margins."],
      outbid: ["That's getting expensive.", "Is it really worth that much?", "I might have to fold.", "That's near my limit."],
      win: ["A sensible acquisition.", "Good value for money."],
      win_value: ["Glad we didn't overpay.", "That's a clean buy.", "The numbers actually make sense."],
      win_overpay: ["Paid a premium... but acceptable.", "Over estimate, but I can live with it.", "Not my favorite price, but it'll do."],
      lose: ["Too rich for my blood.", "I'll find a better deal elsewhere."],
      lose_overpay: ["You overpaid.", "That was above estimate—good luck.", "Enjoy paying a premium."],
      patience_low: ["This is taking too long.", "I'm losing interest.", "Time is money.", "Let's wrap this up.", "I don't have all day."]
    },
    Confident: {
      bid: ["Is that all you've got?", "Top that!", "I'm just getting started."],
      outbid: ["Cute.", "You're playing with the big dogs now.", "Pocket change.", "Still not enough."],
      win: ["Too easy!", "Another trophy for the collection.", "Knew I'd win."],
      win_value: ["Too easy—and I got a deal.", "They practically gave it away.", "Deal of the day."],
      win_overpay: ["Worth every dollar.", "Price doesn't matter—winning does.", "I paid up. Still mine."],
      lose: ["Whatever, I didn't want it anyway.", "Enjoy it.", "I have better cars at home."],
      lose_overpay: ["You overpaid.", "Ha—paid a premium for that?", "Enjoy your expensive mistake."],
      patience_low: ["You're boring me.", "Are we done yet?", "Stop wasting my time.", "Say the number or walk away.", "Last chance—make it count."]
    },
    Normal: {
      bid: ["Still in.", "Beat that.", "Let's keep it moving."],
      outbid: ["Higher, huh.", "I might match that.", "Alright then.", "Not bad—try again."],
      win: ["Good auction.", "I'll take it.", "Nice doing business."],
      win_value: ["That's a good price.", "I'll take it—nice and clean.", "Solid value."],
      win_overpay: ["Paid more than I wanted, but okay.", "Not cheap—still a win.", "Price stings, trophy doesn't."],
      lose: ["Fair play.", "It's yours.", "All yours."],
      lose_overpay: ["You overpaid.", "Over estimate—yikes.", "That's a pricey win."],
      patience_low: ["Getting tired of this.", "Make up your mind.", "Last chance.", "Call it already.", "Let's finish this."]
    }
  };

  const options = barks[mood][trigger];
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Get mood modifiers for rival behavior.
 * @param mood - The rival's current mood
 * @returns Object with patience and budget modifiers
 */
export function getMoodModifiers(mood: RivalMood): {
  patienceMultiplier: number;
  budgetMultiplier: number;
  bidAggressiveness: number;
  description: string;
} {
  switch (mood) {
    case 'Desperate':
      return {
        patienceMultiplier: 0.7, // Lower patience (quits faster)
        budgetMultiplier: 1.2, // Higher bids
        bidAggressiveness: 1.5, // More aggressive
        description: 'looks desperate - bidding aggressively but losing patience',
      };
    case 'Cautious':
      return {
        patienceMultiplier: 1.3, // Higher patience
        budgetMultiplier: 0.8, // Lower bids
        bidAggressiveness: 0.7, // Less aggressive
        description: 'seems cautious - bidding conservatively',
      };
    case 'Confident':
      return {
        patienceMultiplier: 1.0,
        budgetMultiplier: 1.1,
        bidAggressiveness: 1.2,
        description: 'looks confident - using aggressive tactics',
      };
    case 'Normal':
    default:
      return {
        patienceMultiplier: 1.0,
        budgetMultiplier: 1.0,
        bidAggressiveness: 1.0,
        description: 'seems focused',
      };
  }
}

/**
 * Generate random mood for a rival based on the current day.
 * Uses full rival ID string for better seed variation.
 * @param rivalId - Unique rival identifier
 * @param day - Current game day
 * @returns Random mood for this rival on this day
 */
export function getRivalMood(rivalId: string, day: number): RivalMood {
  // Use full rival ID string for better seed variation (not just first character)
  const idSum = rivalId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const seed = (idSum + day * 7) % 100; // Multiply day by prime to vary patterns
  
  if (seed < 20) return 'Desperate';
  if (seed < 40) return 'Cautious';
  if (seed < 55) return 'Confident';
  return 'Normal';
}

/**
 * Get human-readable tier name from tier number.
 * @param tier - The tier number (1, 2, or 3)
 * @returns Human-readable tier name
 */
export function getTierName(tier: 1 | 2 | 3): string {
  switch (tier) {
    case 1:
      return 'Tycoon';
    case 2:
      return 'Enthusiast';
    case 3:
      return 'Scrapper';
    default:
      return 'Unknown';
  }
}

/**
 * Rival data structure.
 * Tiers: 1=Tycoon (late-game, hardest), 2=Enthusiast (mid-game), 3=Scrapper (early-game, easiest)
 * Note: Tier numbering is intentionally inverted from difficulty.
 */
export interface Rival {
  id: string;
  name: string;
  bio: string;
  tier: 1 | 2 | 3; // 1 = Tycoon, 2 = Enthusiast, 3 = Scrapper
  budget: number;
  patience: number; // 0-100
  wishlist: string[]; // Tags they target
  strategy: RivalStrategy;
  mood?: RivalMood; // Daily mood affecting behavior (optional, set at runtime)
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
    bio: 'A high-rolling blue-blood collector who treats auctions like conquest; impatient, dominant, and convinced premium taste is the same thing as superiority.',
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
    bio: 'A grease-under-the-nails bargain hunter who knows every trick for spotting value in junk; cautious spender, stubborn, and quietly proud of winning on fundamentals.',
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
    bio: 'A predatory dealmaker who smells hesitation and punishes it; aggressive, pressure-driven, and always trying to make you overpay just to prove he can.',
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
    bio: 'A disciplined enthusiast with a laser focus on specific builds (especially performance/JDM); calm, methodical, and willing to splurge when the car matches her “perfect spec.”',
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
    bio: 'A patient, detail-obsessed purist who cares about provenance and originality; conservative bidder, hard to rattle, and more satisfied walking away than buying the wrong example.',
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
    bio: 'An adrenaline-first tuner who chases track-ready cars and bragging rights; loud confidence, quick bids, and a tendency to escalate just to keep the spotlight.',
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
    bio: 'A luxury-minded curator who collects pristine, low-mile “museum pieces”; polished and selective, but brutally competitive when a true trophy appears.',
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
    bio: 'A romantic project-car rescuer who sees potential where others see rot; laid-back and patient, but emotionally attached to barn finds and stubborn about “saving” them.',
    tier: 3,
    budget: 35000,
    patience: 80,
    wishlist: ['Project Car', 'Barn Find', 'Rust'],
    strategy: 'Passive',
    avatar: '#FFAA44',
  },
  {
    id: 'rival_007',
    name: 'Teddy Rosso',
    bio: 'A fast-talking used car dealer with a showroom smile and a razor-sharp nose for margin. Friendly on the surface, ruthless when the bidding starts.',
    tier: 2,
    budget: 42000,
    patience: 55,
    wishlist: ['Daily Driver', 'Budget', 'American', 'Practical'],
    strategy: 'Aggressive',
    avatar: '#C0392B',
  },
  {
    id: 'rival_008',
    name: 'Anya Petrova',
    bio: 'A sharp and calculating broker who deals exclusively in high-end, imported vehicles. Her cold, professional demeanor hides a fierce negotiator.',
    tier: 1,
    budget: 85000,
    patience: 65,
    wishlist: ['Exotic', 'European', 'Italian', 'Supercar', 'Rare'],
    strategy: 'Collector',
    avatar: '#2C3E50',
  },
];

/**
 * Get a random rival from the database with mood assigned.
 * @param day - Current game day (for mood generation)
 * @returns A rival selected randomly from the database with mood
 */
export function getRandomRival(day: number = 1): Rival {
  const randomIndex = Math.floor(Math.random() * RivalDatabase.length);
  const rival = { ...RivalDatabase[randomIndex] };
  rival.mood = getRivalMood(rival.id, day);
  return rival;
}

/**
 * Get a specific rival by ID with mood assigned (useful for tutorial/story encounters).
 * @param id - The unique ID of the rival
 * @param day - Current game day (for mood generation)
 * @returns The rival if found, or a random rival as fallback
 */
export function getRivalById(id: string, day: number = 1): Rival {
  // Backward-compatible ID normalization.
  // Earlier builds used IDs like "rival_1" / "rival_2"; current DB uses "rival_001" style.
  const normalizedId = id.replace(/^rival_(\d{1,3})$/i, (_m, digits: string) => {
    const n = Number(digits);
    if (!Number.isFinite(n)) return id;
    return `rival_${String(n).padStart(3, '0')}`;
  });

  const rival = RivalDatabase.find((r) => r.id === normalizedId);
  if (!rival) {
    warnLog(`Rival with ID "${id}" not found, returning random rival`);
    return getRandomRival(day);
  }
  const rivalWithMood = { ...rival };
  rivalWithMood.mood = getRivalMood(rival.id, day);
  return rivalWithMood;
}

/**
 * Get a random rival based on player prestige tier progression with mood.
 * Tier 3 (Scrappers): Early game, easiest - available up to 50 prestige
 * Tier 2 (Enthusiasts): Mid game - available up to 150 prestige
 * Tier 1 (Tycoons): Late game, hardest - available from 150+ prestige
 * @param playerPrestige - Current player prestige level
 * @param day - Current game day (for mood generation)
 * @returns A rival appropriate for the player's current prestige level with mood
 */
export function getRivalByTierProgression(
  playerPrestige: number,
  day: number = 1,
  options?: { excludeIds?: readonly string[] }
): Rival {
  const { tierProgression } = GAME_CONFIG.rivalAI;
  const excludeIds = new Set(options?.excludeIds ?? []);

  let availableTiers: (1 | 2 | 3)[];

  if (playerPrestige >= tierProgression.tier1MinPrestige) {
    // High prestige: All tiers available, but favor Tier 1
    availableTiers = [1, 1, 1, 2, 3]; // 60% Tier 1, 20% Tier 2, 20% Tier 3
  } else if (playerPrestige >= tierProgression.tier3MaxPrestige) {
    // Medium prestige: Tier 2 and 3 available
    availableTiers = [2, 2, 2, 3]; // 75% Tier 2, 25% Tier 3
  } else {
    // Low prestige: Only Tier 3 available
    availableTiers = [3];
  }

  const selectedTier = availableTiers[Math.floor(Math.random() * availableTiers.length)];
  const tierRivals = RivalDatabase.filter(
    (rival) => rival.tier === selectedTier && !excludeIds.has(rival.id)
  );

  if (tierRivals.length === 0) {
    // Fallback: try any rival within the allowed tiers, respecting exclusions.
    const allowedTierSet = new Set<(1 | 2 | 3)>(availableTiers);
    const allowedTierCandidates = RivalDatabase.filter(
      (rival) => allowedTierSet.has(rival.tier) && !excludeIds.has(rival.id)
    );

    if (allowedTierCandidates.length > 0) {
      const randomIndex = Math.floor(Math.random() * allowedTierCandidates.length);
      const rival = { ...allowedTierCandidates[randomIndex] };
      rival.mood = getRivalMood(rival.id, day);
      return rival;
    }

    // Final fallback: any rival not excluded.
    const anyCandidates = RivalDatabase.filter((rival) => !excludeIds.has(rival.id));
    if (anyCandidates.length > 0) {
      const randomIndex = Math.floor(Math.random() * anyCandidates.length);
      const rival = { ...anyCandidates[randomIndex] };
      rival.mood = getRivalMood(rival.id, day);
      return rival;
    }

    warnLog(
      `No rivals found for tier ${selectedTier} (or all excluded), falling back to random rival`
    );
    return getRandomRival(day);
  }

  const randomIndex = Math.floor(Math.random() * tierRivals.length);
  const rival = { ...tierRivals[randomIndex] };
  rival.mood = getRivalMood(rival.id, day);
  return rival;
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
  carInterest: number,
  bidAggressiveness: number = 1
): BidDecision {
  const interest = Math.max(0, Math.min(100, carInterest));
  const bidStep = GAME_CONFIG.auction.bidIncrement;
  const aggressiveness = Number.isFinite(bidAggressiveness)
    ? Math.max(0.25, Math.min(2, bidAggressiveness))
    : 1;

  // Check budget constraint
  if (currentBid > rival.budget) {
    return {
      shouldBid: false,
      bidAmount: 0,
      reason: 'Out of budget',
    };
  }

  // If they can't increase the bid at all, they can't meaningfully continue.
  if (currentBid >= rival.budget) {
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

  // Interest-based willingness to pay.
  // This prevents every rival from always bidding until budget/patience are exhausted,
  // and makes strategy/interest matter.
  const baseWillingness = 0.35 + 0.65 * (interest / 100); // 35%..100% of budget
  const strategyWillingnessMultiplier: Record<RivalStrategy, number> = {
    Aggressive: 0.95,
    Passive: 0.85,
    Collector: interest > GAME_CONFIG.rivalAI.collectorHighInterestThreshold ? 1.10 : 0.90,
  };

  const maxWillingBid = Math.floor(rival.budget * baseWillingness * strategyWillingnessMultiplier[rival.strategy]);

  // If the price is already beyond what they consider "worth it", fold.
  if (currentBid > maxWillingBid) {
    return {
      shouldBid: false,
      bidAmount: 0,
      reason: 'Not worth it',
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

  // Scale increments by interest so low-interest bidding feels less sticky.
  // Clamp keeps increments within a sane band.
  const interestScale = 0.75 + 0.5 * (interest / 100); // 0.75..1.25
  const rawIncrement = Math.floor(bidAmount * interestScale * aggressiveness);

  // Compute the maximum raise they are willing/able to make.
  const maxRaiseByBudget = rival.budget - currentBid;
  const maxRaiseByWilling = maxWillingBid - currentBid;
  const maxRaise = Math.min(maxRaiseByBudget, maxRaiseByWilling);

  if (maxRaise < bidStep) {
    return {
      shouldBid: false,
      bidAmount: 0,
      reason: maxRaiseByBudget < bidStep ? 'Out of budget' : 'Not worth it',
    };
  }

  bidAmount = Math.min(rawIncrement, maxRaise);

  // Keep bids aligned to the configured auction increment to avoid oddball raises.
  bidAmount = Math.floor(bidAmount / bidStep) * bidStep;

  if (bidAmount < bidStep) {
    return {
      shouldBid: false,
      bidAmount: 0,
      reason: maxRaiseByBudget < bidStep ? 'Out of budget' : 'Not worth it',
    };
  }

  return {
    shouldBid: true,
    bidAmount,
    reason: `${rival.strategy} strategy`,
  };
}
