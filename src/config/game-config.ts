/**
 * Centralized skill metadata to avoid duplication across UI components.
 */
export const SKILL_METADATA = {
  eye: {
    name: 'Eye',
    icon: '👁️',
    color: '#3498db',
    description: 'Spot details and hidden damage',
  },
  tongue: {
    name: 'Tongue',
    icon: '💬',
    color: '#9b59b6',
    description: 'Auction tactics and pressure',
  },
  network: {
    name: 'Network',
    icon: '🌐',
    color: '#e67e22',
    description: 'Discover opportunities',
  },
} as const;

/** Union of all supported player skill keys (derived from SKILL_METADATA). */
export type SkillKey = keyof typeof SKILL_METADATA;

/** Central gameplay tuning configuration (economy, progression, encounters, etc.). */
export const GAME_CONFIG = {
  time: {
    // Lightweight per-day time budget (in abstract units).
    // Certain actions consume time; when you're out of time, you must End Day.
    unitsPerDay: 8,

    // Time costs for "normal" (non-special-event) gameplay loops.
    // - Travel is charged when committing to start an encounter from the map.
    // - Auction participation is charged on top of travel for base-location auctions.
    travelCost: 1,
    auctionParticipationCost: 1,
  },
  save: {
    /**
     * Autosave policy:
     * - 'on-change': debounce-save after state mutations (recommended)
     * - 'end-of-day': only save at end-of-day checkpoints
     */
    autosavePolicy: 'on-change',
  },

  cars: {
    // Random condition range for generated encounter cars (inclusive).
    randomConditionMin: 30,
    randomConditionMax: 90,

    // Tier spawn weights (higher = more common)
    tierWeights: {
      'Daily Driver': 50,   // Most common
      'Cult Classic': 30,   // Common
      'Icon': 15,           // Uncommon
      'Unicorn': 5,         // Rare
    },

    /**
     * Progression-aware tier weights.
     * Keeps early-game offers affordable and reduces extreme windfalls,
     * while preserving the late-game distribution.
     */
    tierWeightsByPrestige: {
      early: {
        maxPrestigeExclusive: 50,
        weights: {
          'Daily Driver': 70,
          'Cult Classic': 27,
          'Icon': 3,
          'Unicorn': 0,
        },
      },
      mid: {
        maxPrestigeExclusive: 150,
        weights: {
          'Daily Driver': 55,
          'Cult Classic': 30,
          'Icon': 15,
          'Unicorn': 0,
        },
      },
      lateMid: {
        maxPrestigeExclusive: 300,
        weights: {
          'Daily Driver': 45,
          'Cult Classic': 30,
          'Icon': 23,
          'Unicorn': 2,
        },
      },
    },
  },

  progression: {
    unlocks: {
      auction: 150,   // Prestige required to access Auction House
    }
  },

  player: {
    startingMoney: 8000,
    startingGarageSlots: 1,
    startingPrestige: 0,
    startingSkills: {
      eye: 1,
      tongue: 1,
      network: 1,
    },

    // XP progression: each level requires more XP
    skillProgression: {
      xpPerLevel: [0, 100, 250, 500, 1000], // Level 1 = 0, Level 2 = 100, Level 3 = 250, etc.
      maxLevel: 5,
      
      // XP gains per action
      xpGains: {
        inspect: 10, // Eye XP
        auction: 15, // Tongue XP
        travelNewLocation: 20, // Network XP
      },
    },
  },

  victory: {
    // Win conditions: must meet ALL of these
    requiredPrestige: 500, // Reduced from 1000 with earlier pacing and more content
    requiredUnicorns: 2, // Reduced from 3 (more achievable)
    requiredCollectionCars: 5, // Must be achievable with collection capacity (currently scales with garage slots)
    requiredSkillLevel: 4, // Reduced from 5 (max level still valuable but not required)
  },

  // Car sets that award one-time prestige bonuses when completed.
  sets: {
      jdmLegends: {
        name: 'JDM Legends',
        description: 'Collect iconic Japanese sports cars',
        requiredTags: ['JDM'],
        requiredCount: 5,
        prestigeReward: 50,
        icon: '🇯🇵',
      },
      muscleMasters: {
        name: 'Muscle Masters',
        description: 'Own the kings of American muscle',
        requiredTags: ['Muscle'],
        requiredCount: 5,
        prestigeReward: 50,
        icon: '👊',
      },
      europeanElite: {
        name: 'European Elite',
        description: 'Curate finest European automobiles',
        requiredTags: ['European'],
        requiredCount: 5,
        prestigeReward: 50,
        icon: '🇪🇺',
      },
      exoticCollection: {
        name: 'Exotic Collection',
        description: 'Acquire rare exotic supercars',
        requiredTags: ['Exotic'],
        requiredCount: 4,
        prestigeReward: 75,
        icon: '💎',
      },
      classicsCurator: {
        name: 'Classics Curator',
        description: 'Preserve automotive history',
        requiredTags: ['Classic'],
        requiredCount: 6,
        prestigeReward: 60,
        icon: '🏛️',
      },
  },

  economy: {
    dailyRent: 100, // Base rent for 1 slot
    
    // Rent scales with garage slots to add progression challenge
    // Rebalanced to be less punishing in early progression
    rentByGarageSlots: {
      1: 100,
      2: 150,  // Was 200
      3: 250,  // Was 400
      4: 400,  // Was 800
      5: 600,  // Was 1600
      6: 850,
      7: 1150,
      8: 1500,
      9: 1900,
      10: 2400,
    },

    // Restoration challenge costs
    challenges: {
      rustRemoval: {
        // Minimum cost; actual cost scales with car value.
        cost: 500,
        costRateOfBaseValue: 0.05,
        timeCost: 1,
      },
      engineRebuild: {
        cost: 1500,
        timeCost: 2,
      },
    },

    // Emergency cash injection - one-time use only
    bankLoan: {
      amount: 500,
      oneTime: true,
    },

    // Finance system (risk-free for now; only one active loan at a time).
    finance: {
      prestonLoan: {
        amount: 10000,
        feeRate: 0.1,
      },
    },

    sellAsIsMultiplier: 0.7,

    restoration: {
      conditionMax: 100,

      charlieMinor: {
        availableBelowCondition: 100,
        // Rebalanced: no longer a guaranteed-profit button.
        costRateOfBaseValue: 0.08,
        conditionGain: 6,
        timeCost: 1,
        failChance: 0.12,
        failConditionPenalty: 6,
      },

      artisanMajor: {
        availableBelowCondition: 90,
        costRateOfBaseValue: 0.15,
        conditionGain: 30,
        timeCost: 2,
      },
    },

    market: {
      modifierMin: 0.8,
      modifierMax: 1.2,

      // Seasonal fluctuations (based on day of year)
      seasonal: {
        winter: { startDay: 335, endDay: 59, tags: ['Convertible', 'Sports'], modifier: 0.85 },
        summer: { startDay: 152, endDay: 243, tags: ['Sports', 'Muscle'], modifier: 1.15 },
        spring: { startDay: 60, endDay: 151, tags: ['Classic', 'Barn Find'], modifier: 1.1 },
        fall: { startDay: 244, endDay: 334, tags: ['JDM', 'Exotic'], modifier: 1.05 },
      },

      // Random market events
      events: {
        boom: { chance: 0.1, duration: 3, modifier: 1.3, description: "Market Boom!" },
        bust: { chance: 0.1, duration: 2, modifier: 0.7, description: "Market Bust!" },
        nicheBoom: { chance: 0.15, duration: 2, modifier: 1.25, description: "Niche Demand Spike" },
      },
    },
  },

  encounters: {
    rivalPresenceChance: 0.5,
  },

  valuation: {
    historyMultipliers: {
      standard: 1.0,
      flooded: 0.5,
      rust: 0.7,
      mint: 1.25,
    },
  },

  auction: {
    startingBidMultiplier: 0.65,

    bidIncrement: 200,
    powerBidIncrement: 500,

    powerBidPatiencePenalty: 20,
    stallPatiencePenalty: 20,

    stall: {
      requiredTongueLevel: 2,
    },

    kickTires: {
      requiredEyeLevel: 2,
      rivalBudgetReduction: 300,
    },

    rivalBidIncrements: {
      aggressive: 500,
      passive: 100,
      collectorLowInterest: 200,
      collectorHighInterest: 500,
    },

    rivalBidModalDelayMs: 500,

    // Patience bar UI thresholds
    patienceThresholds: {
      critical: 20,  // Red zone - rival about to quit
      low: 30,       // Orange zone - rival sweating
      medium: 50,    // Yellow zone - rival getting annoyed
    },
  },

  rivalAI: {
    // Applied each rival turn depending on strategy.
    patienceLossPerTurn: {
      aggressive: 15,
      passive: 5,
      collectorHighInterest: 5,
      collectorLowInterest: 10,
    },
    collectorHighInterestThreshold: 70,

    // Tier progression based on player prestige
    tierProgression: {
      // Prestige thresholds for unlocking tiers (higher prestige = lower tier numbers)
      tier3MaxPrestige: 50,  // Tier 3 (Scrappers) available up to 50 prestige
      tier2MaxPrestige: 150, // Tier 2 (Enthusiasts) available up to 150 prestige
      tier1MinPrestige: 150, // Tier 1 (Tycoons) available from 150+ prestige
    },
  },

  ui: {
    // Toast notification positioning
    toast: {
      baseTopPosition: 80,     // Starting Y position for first toast (px)
      heightWithMargin: 60,    // Height of each toast including margin (px)
      durationMs: 4000,        // How long top-right toasts stay on screen (ms)
    },

    // Modal delays
    modalDelays: {
      rivalBid: 900, // Delay before showing rival bid result (ms)
      rivalBarkAfterAuctioneer: 650, // Delay between auctioneer bark and rival bark (ms)
      auctionLogLine: 650, // Delay between bursty auction log lines (ms)
      openingPromptAfterStart: 800, // Delay after auctioneer intro before prompting opening bid (ms)
      nextTurnAfterAuctioneer: 650, // Delay after auctioneer response before the next bidder can act (ms)
    },
  },
} as const;
