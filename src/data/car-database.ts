/**
 * Car data structure.
 * Represents a single vehicle with its condition, history, and metadata.
 */
import { GAME_CONFIG } from '@/config/game-config';

export type CarTier = 'Daily Driver' | 'Cult Classic' | 'Icon' | 'Unicorn';

export interface Car {
  id: string;
  /**
   * Template ID from `CarDatabase` used to generate this car.
   * Runtime car instances typically have a unique `id`, while `templateId` stays stable for lookups (e.g., images).
   */
  templateId?: string;
  name: string;
  baseValue: number;
  condition: number; // 0-100 (percentage)
  tags: string[]; // e.g., "Muscle", "JDM", "Classic"
  history: string[]; // e.g., "Flooded", "Rust", "Barn Find"
  tier: CarTier; // Car's rarity tier
  inCollection?: boolean; // Whether car is in the private collection (requires condition >= 80)

  /**
   * The price the player paid to acquire the car (e.g., winning auction bid).
   * Optional for backwards compatibility with older saves.
   */
  purchasePrice?: number;
  /**
   * Total money spent restoring/repairing this specific car.
   * Optional for backwards compatibility with older saves.
   */
  restorationSpent?: number;
}

/**
 * Static car database - sample cars for the game.
 * These are template cars used to generate random encounters.
 * Each generated car gets a unique ID and randomized condition.
 * Organized by tiers: Daily Drivers (starter), Cult Classics, Icons, Unicorns.
 */
export const CarDatabase: Car[] = [
  // Tutorial Cars (Specific cars for tutorial sequence)
  {
    id: 'car_tutorial_rusty_sedan',
    name: 'Rusty Sedan',
    baseValue: 1500,
    condition: 30,
    tags: ['Daily Driver', 'Beater'],
    history: ['Rust', 'Bald Tires'],
    tier: 'Daily Driver',
  },
  {
    id: 'car_tutorial_muscle_car',
    name: 'Muscle Car',
    baseValue: 28000,
    condition: 55,
    tags: ['Muscle', 'Classic', 'American'],
    history: ['Original Paint'],
    tier: 'Cult Classic',
  },
  {
    id: 'car_tutorial_boxy_wagon',
    name: 'Boxy Wagon',
    baseValue: 4000,
    condition: 45,
    tags: ['Daily Driver', 'Practical', 'Wagon'],
    history: ['Minor Dents'],
    tier: 'Daily Driver',
  },
  // Tier 1: Daily Drivers (Starter Cars - $3,000-$8,000)
  {
    id: 'car_daily_001',
    name: '1998 Honda Civic',
    baseValue: 3500,
    condition: 50,
    tags: ['Daily Driver', 'Import', 'Reliable'],
    history: ['High Miles'],
    tier: 'Daily Driver',
  },
  {
    id: 'car_daily_002',
    name: '2005 Ford Focus',
    baseValue: 4000,
    condition: 45,
    tags: ['Daily Driver', 'Practical', 'Commuter'],
    history: ['Minor Accident'],
    tier: 'Daily Driver',
  },
  {
    id: 'car_daily_003',
    name: '1995 Mazda Miata',
    baseValue: 5500,
    condition: 55,
    tags: ['Daily Driver', 'Roadster', 'Fun'],
    history: ['Repainted'],
    tier: 'Daily Driver',
  },
  {
    id: 'car_daily_004',
    name: '2001 Volkswagen Golf',
    baseValue: 4500,
    condition: 48,
    tags: ['Daily Driver', 'Hatchback', 'European'],
    history: ['Rust'],
    tier: 'Daily Driver',
  },
  {
    id: 'car_daily_005',
    name: '1992 Toyota Corolla',
    baseValue: 3000,
    condition: 40,
    tags: ['Daily Driver', 'Reliable', 'Budget'],
    history: ['Rust'],
    tier: 'Daily Driver',
  },
  {
    id: 'car_daily_006',
    name: '2003 Subaru Impreza',
    baseValue: 5000,
    condition: 52,
    tags: ['Daily Driver', 'AWD', 'Rally'],
    history: ['High Miles'],
    tier: 'Daily Driver',
  },
  {
    id: 'car_daily_007',
    name: '1999 Acura Integra',
    baseValue: 4800,
    condition: 48,
    tags: ['Daily Driver', 'Import', 'Fun'],
    history: ['Minor Accident'],
    tier: 'Daily Driver',
  },
  {
    id: 'car_daily_008',
    name: '2000 BMW 3-Series',
    baseValue: 5500,
    condition: 45,
    tags: ['Daily Driver', 'European', 'Sporty'],
    history: ['Maintenance Issues'],
    tier: 'Daily Driver',
  },
  {
    id: 'car_daily_009',
    name: '1996 Honda Accord',
    baseValue: 3200,
    condition: 42,
    tags: ['Daily Driver', 'Reliable', 'Sedan'],
    history: ['High Miles'],
    tier: 'Daily Driver',
  },
  {
    id: 'car_daily_010',
    name: '2004 Mazda 3',
    baseValue: 4200,
    condition: 50,
    tags: ['Daily Driver', 'Practical', 'Hatchback'],
    history: ['One Owner'],
    tier: 'Daily Driver',
  },
  // Tier 2: Cult Classics ($25,000-$40,000)
  {
    id: 'car_cult_001',
    name: '1969 Dodge Charger',
    baseValue: 25000,
    condition: 45,
    tags: ['Muscle', 'Classic', 'American'],
    history: ['Barn Find', 'Rust'],
    tier: 'Cult Classic',
  },
  {
    id: 'car_cult_002',
    name: '1994 Toyota Supra',
    baseValue: 35000,
    condition: 60,
    tags: ['JDM', 'Sports', 'Turbo'],
    history: ['Modified', 'Track Car'],
    tier: 'Cult Classic',
  },
  {
    id: 'car_cult_003',
    name: '1967 Ford Mustang',
    baseValue: 30000,
    condition: 50,
    tags: ['Muscle', 'Classic', 'American'],
    history: ['Original Paint', 'Numbers Matching'],
    tier: 'Cult Classic',
  },
  {
    id: 'car_cult_004',
    name: '1999 Nissan Skyline GT-R',
    baseValue: 40000,
    condition: 70,
    tags: ['JDM', 'Sports', 'AWD'],
    history: ['Import', 'Clean Title'],
    tier: 'Cult Classic',
  },
  {
    id: 'car_cult_005',
    name: '1970 Plymouth Barracuda',
    baseValue: 28000,
    condition: 40,
    tags: ['Muscle', 'Classic', 'Rare'],
    history: ['Project Car', 'No Engine'],
    tier: 'Cult Classic',
  },
  {
    id: 'car_cult_006',
    name: '1995 Mazda RX-7',
    baseValue: 32000,
    condition: 55,
    tags: ['JDM', 'Sports', 'Rotary'],
    history: ['Low Miles', 'Original Owner'],
    tier: 'Cult Classic',
  },
  {
    id: 'car_cult_007',
    name: '1968 Chevrolet Camaro',
    baseValue: 27000,
    condition: 48,
    tags: ['Muscle', 'Classic', 'American'],
    history: ['Restored Interior', 'Needs Paint'],
    tier: 'Cult Classic',
  },
  {
    id: 'car_cult_009',
    name: '1998 Mitsubishi 3000GT VR-4',
    baseValue: 26000,
    condition: 58,
    tags: ['JDM', 'Sports', 'AWD', 'Twin-Turbo'],
    history: ['Modified', 'Clean Title'],
    tier: 'Cult Classic',
  },
  {
    id: 'car_cult_010',
    name: '1986 Toyota MR2',
    baseValue: 18000,
    condition: 62,
    tags: ['JDM', 'Sports', 'Mid-Engine', 'Lightweight'],
    history: ['Original Paint', 'Garage Kept'],
    tier: 'Cult Classic',
  },
  {
    id: 'car_cult_011',
    name: '1971 Datsun 240Z',
    baseValue: 32000,
    condition: 55,
    tags: ['JDM', 'Classic', 'Sports'],
    history: ['Rust', 'Original Engine'],
    tier: 'Cult Classic',
  },
  {
    id: 'car_cult_012',
    name: '2006 Pontiac GTO',
    baseValue: 24000,
    condition: 68,
    tags: ['Muscle', 'Modern', 'American'],
    history: ['Clean Title', 'Low Miles'],
    tier: 'Cult Classic',
  },
  {
    id: 'car_cult_013',
    name: '1993 Ford Mustang Cobra',
    baseValue: 22000,
    condition: 60,
    tags: ['Muscle', 'Classic', 'American'],
    history: ['Modified', 'Service Records'],
    tier: 'Cult Classic',
  },
  // Tier 3: Icons ($50,000-$120,000)
  {
    id: 'car_icon_001',
    name: '1967 Shelby GT500',
    baseValue: 85000,
    condition: 60,
    tags: ['Muscle', 'Classic', 'Shelby', 'American'],
    history: ['Matching Numbers', 'Original Paint'],
    tier: 'Icon',
  },
  {
    id: 'car_icon_002',
    name: '1987 Porsche 959',
    baseValue: 95000,
    condition: 75,
    tags: ['Exotic', 'European', 'AWD', 'Rare'],
    history: ['Limited Production', 'Service Records'],
    tier: 'Icon',
  },
  {
    id: 'car_icon_003',
    name: '1970 Plymouth Hemi \'Cuda',
    baseValue: 110000,
    condition: 55,
    tags: ['Muscle', 'Classic', 'American', 'Rare'],
    history: ['Barn Find', 'Numbers Matching'],
    tier: 'Icon',
  },
  {
    id: 'car_icon_004',
    name: '2005 Ford GT',
    baseValue: 105000,
    condition: 85,
    tags: ['Exotic', 'American', 'Supercar', 'Modern'],
    history: ['Low Miles', 'Collector Owned'],
    tier: 'Icon',
  },
  {
    id: 'car_icon_005',
    name: '1963 Chevrolet Corvette Stingray',
    baseValue: 78000,
    condition: 70,
    tags: ['Classic', 'American', 'Sports', 'Iconic'],
    history: ['Split Window', 'Restored'],
    tier: 'Icon',
  },
  {
    id: 'car_icon_006',
    name: '1973 BMW 3.0 CSL',
    baseValue: 72000,
    condition: 65,
    tags: ['Classic', 'European', 'Racing', 'Rare'],
    history: ['Homologation Special', 'Original Engine'],
    tier: 'Icon',
  },
  {
    id: 'car_icon_007',
    name: '1969 Chevrolet Camaro ZL1',
    baseValue: 98000,
    condition: 58,
    tags: ['Muscle', 'Classic', 'American', 'Rare'],
    history: ['All-Aluminum Engine', 'Documented'],
    tier: 'Icon',
  },
  {
    id: 'car_icon_008',
    name: '1991 Acura NSX',
    baseValue: 68000,
    condition: 78,
    tags: ['JDM', 'Exotic', 'Sports', 'Mid-Engine'],
    history: ['Mint', 'One Owner'],
    tier: 'Icon',
  },
  {
    id: 'car_icon_018',
    name: '2002 Honda NSX',
    baseValue: 45000,
    condition: 80,
    tags: ['JDM', 'Exotic', 'Mid-Engine'],
    history: ['Dealer Maintained', 'Pristine'],
    tier: 'Icon',
  },
  {
    id: 'car_icon_009',
    name: '1961 Ferrari 250 GT SWB',
    baseValue: 115000,
    condition: 68,
    tags: ['Exotic', 'Italian', 'Classic', 'Ferrari'],
    history: ['Competition History', 'Restored'],
    tier: 'Icon',
  },
  {
    id: 'car_icon_010',
    name: '1993 Mazda RX-7 FD Spirit R',
    baseValue: 65000,
    condition: 82,
    tags: ['JDM', 'Sports', 'Rotary', 'Limited Edition'],
    history: ['Final Edition', 'Mint'],
    tier: 'Icon',
  },
  {
    id: 'car_icon_011',
    name: '1970 Chevrolet Chevelle SS 454',
    baseValue: 82000,
    condition: 63,
    tags: ['Muscle', 'Classic', 'American', 'Big Block'],
    history: ['LS6 Engine', 'Cowl Induction'],
    tier: 'Icon',
  },
  {
    id: 'car_icon_012',
    name: '1967 Jaguar E-Type Series 1',
    baseValue: 88000,
    condition: 72,
    tags: ['Classic', 'European', 'Sports', 'Iconic'],
    history: ['Original Interior', 'Matching Numbers'],
    tier: 'Icon',
  },
  {
    id: 'car_icon_013',
    name: '1985 Ferrari 288 GTO',
    baseValue: 118000,
    condition: 76,
    tags: ['Exotic', 'Italian', 'Ferrari', 'Rare'],
    history: ['Limited Production', 'Service Records'],
    tier: 'Icon',
  },
  {
    id: 'car_icon_014',
    name: '1987 Buick GNX',
    baseValue: 92000,
    condition: 70,
    tags: ['Muscle', 'American', 'Turbo', 'Rare'],
    history: ['1 of 547', 'Documentation'],
    tier: 'Icon',
  },
  {
    id: 'car_icon_015',
    name: '2002 Lamborghini Murciélago',
    baseValue: 105000,
    condition: 78,
    tags: ['Exotic', 'Italian', 'Supercar'],
    history: ['Dealer Serviced', 'Clean Title'],
    tier: 'Icon',
  },
  {
    id: 'car_icon_016',
    name: '1969 Pontiac GTO Judge',
    baseValue: 89000,
    condition: 64,
    tags: ['Muscle', 'Classic', 'American', 'Rare'],
    history: ['Original Paint', 'Numbers Matching'],
    tier: 'Icon',
  },
  {
    id: 'car_icon_017',
    name: '1998 Dodge Viper GTS',
    baseValue: 75000,
    condition: 73,
    tags: ['Muscle', 'American', 'Supercar'],
    history: ['Low Miles', 'Clean Title'],
    tier: 'Icon',
  },
  // Tier 4: Unicorns ($150,000+)
  {
    id: 'car_unicorn_001',
    name: '1962 Ferrari 250 GTO',
    baseValue: 350000,
    condition: 85,
    tags: ['Exotic', 'Italian', 'Ferrari', 'Legendary', 'Racing'],
    history: ['Competition History', 'Matching Numbers', 'Mint'],
    tier: 'Unicorn',
  },
  {
    id: 'car_unicorn_002',
    name: '1954 Mercedes-Benz 300SL Gullwing',
    baseValue: 280000,
    condition: 78,
    tags: ['Exotic', 'European', 'Classic', 'Legendary', 'Gullwing'],
    history: ['Original Paint', 'Documented History'],
    tier: 'Unicorn',
  },
  {
    id: 'car_unicorn_003',
    name: '1967 Toyota 2000GT',
    baseValue: 220000,
    condition: 82,
    tags: ['JDM', 'Exotic', 'Classic', 'Legendary', 'Rare'],
    history: ['One of 351 Built', 'Collection Quality'],
    tier: 'Unicorn',
  },
  {
    id: 'car_unicorn_004',
    name: '1995 McLaren F1',
    baseValue: 380000,
    condition: 88,
    tags: ['Exotic', 'Supercar', 'British', 'Legendary', 'Mid-Engine'],
    history: ['Low Miles', 'Full Service History', 'Mint'],
    tier: 'Unicorn',
  },
  {
    id: 'car_unicorn_005',
    name: '1971 Plymouth Hemi \'Cuda Convertible',
    baseValue: 250000,
    condition: 75,
    tags: ['Muscle', 'Classic', 'American', 'Legendary', 'Convertible'],
    history: ['One of 11 Built', 'Matching Numbers'],
    tier: 'Unicorn',
  },
  {
    id: 'car_unicorn_006',
    name: '1955 Porsche 550 Spyder',
    baseValue: 320000,
    condition: 80,
    tags: ['Exotic', 'European', 'Classic', 'Legendary', 'Racing'],
    history: ['Competition History', 'Documented Provenance'],
    tier: 'Unicorn',
  },
  {
    id: 'car_unicorn_007',
    name: '1970 Dodge Charger R/T Hemi',
    baseValue: 260000,
    condition: 77,
    tags: ['Muscle', 'Classic', 'American', 'Legendary'],
    history: ['Numbers Matching', 'Rare Color Combo'],
    tier: 'Unicorn',
  },
  {
    id: 'car_unicorn_008',
    name: '1964 Aston Martin DB5',
    baseValue: 290000,
    condition: 83,
    tags: ['Exotic', 'European', 'Classic', 'Legendary', 'Bond Car'],
    history: ['Original Interior', 'Matching Numbers', 'Mint'],
    tier: 'Unicorn',
  },
];

/**
 * Generate a random car from the database using weighted tier selection.
 * Daily Drivers are most common, Unicorns are rare.
 * Creates a new instance with a unique ID and random condition (see GAME_CONFIG.cars.randomConditionMin/max).
 * @returns A new car instance with randomized properties
 */
export function getRandomCar(): Car {
  return getRandomCarWithPreferences();
}

export function getRandomCarWithPreferences(params?: {
  /** Tags that should be more likely to appear in the rolled car. */
  preferredTags?: readonly string[];
  /** Multiplier applied when a car matches any preferred tag. */
  preferredTagBoost?: number;
}): Car {
  const preferredTags = (params?.preferredTags ?? []).filter(Boolean);
  const preferredTagBoost = Math.max(1, params?.preferredTagBoost ?? 4);

  // Use weighted random selection based on tier
  const weights = GAME_CONFIG.cars.tierWeights;
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  let random = Math.random() * totalWeight;

  let selectedTier: CarTier = 'Daily Driver';
  for (const [tier, weight] of Object.entries(weights)) {
    random -= weight;
    if (random <= 0) {
      selectedTier = tier as CarTier;
      break;
    }
  }

  // Filter cars by selected tier
  const tierCars = CarDatabase.filter((car) => car.tier === selectedTier);

  // Fallback to all cars if no cars in tier (shouldn't happen)
  const pool = tierCars.length > 0 ? tierCars : CarDatabase;

  // Optional tag preference bias within the selected tier pool.
  const hasPreferences = preferredTags.length > 0;
  const poolWeights = pool.map((car) => {
    if (!hasPreferences) return 1;
    const matchesAny = car.tags.some((t) => preferredTags.includes(t));
    return matchesAny ? preferredTagBoost : 1;
  });

  const poolTotal = poolWeights.reduce((sum, w) => sum + w, 0);
  let pick = Math.random() * poolTotal;
  let selectedIndex = 0;
  for (let i = 0; i < pool.length; i++) {
    pick -= poolWeights[i];
    if (pick <= 0) {
      selectedIndex = i;
      break;
    }
  }

  const baseCar = pool[selectedIndex];

  const minCondition = GAME_CONFIG.cars.randomConditionMin;
  const maxCondition = GAME_CONFIG.cars.randomConditionMax;
  const randomCondition =
    Math.floor(Math.random() * (maxCondition - minCondition + 1)) + minCondition;
  
  // Create a copy with a unique ID (use crypto.randomUUID if available, fallback to timestamp)
  const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID 
    ? `car_${crypto.randomUUID()}`
    : `car_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  return {
    ...baseCar,
    templateId: baseCar.id,
    id: uniqueId,
    condition: randomCondition,
  };
}

/**
 * Calculate current value of a car based on condition and history.
 * Formula: baseValue × (condition/100) × historyMultiplier
 * History multipliers are defined in GAME_CONFIG.valuation.historyMultipliers.
 * When multiple history tags exist, the worst multiplier applies ("worst tag wins").
 * @param car - The car to evaluate
 * @returns Calculated market value as an integer
 */
export function calculateCarValue(car: { baseValue: number; condition: number; history?: readonly string[] }): number {
  const conditionMultiplier = car.condition / 100;
  
  // Calculate history multiplier (worst tag wins)
  let historyMultiplier: number = GAME_CONFIG.valuation.historyMultipliers.standard;
  
  if (car.history && car.history.length > 0) {
    const multipliers: number[] = [];
    
    if (car.history.includes('Flooded')) {
      multipliers.push(GAME_CONFIG.valuation.historyMultipliers.flooded);
    }
    if (car.history.includes('Rust')) {
      multipliers.push(GAME_CONFIG.valuation.historyMultipliers.rust);
    }
    if (car.history.includes('Mint')) {
      multipliers.push(GAME_CONFIG.valuation.historyMultipliers.mint);
    }
    
    // If we found recognized tags, take the minimum
    if (multipliers.length > 0) {
      historyMultiplier = Math.min(...multipliers);
    }
  }
  
  return Math.floor(car.baseValue * conditionMultiplier * historyMultiplier);
}

/**
 * Get a specific car from database by ID.
 * @param id - The unique ID of the car to retrieve
 * @returns The car if found, undefined otherwise
 */
export function getCarById(id: string): Car | undefined {
  return CarDatabase.find((car) => car.id === id);
}

/**
 * Get all cars from database that match a specific tag.
 * @param tag - The tag to filter by (e.g., 'Muscle', 'JDM', 'Classic')
 * @returns Array of cars containing the specified tag
 */
export function getCarsByTag(tag: string): Car[] {
  return CarDatabase.filter((car) => car.tags.includes(tag));
}
