/**
 * Car data structure.
 * Represents a single vehicle with its condition, history, and metadata.
 * currentValue is typically calculated via calculateCarValue() and not stored in the database.
 */
import { GAME_CONFIG } from '@/config/game-config';

export interface Car {
  id: string;
  name: string;
  baseValue: number;
  condition: number; // 0-100
  tags: string[]; // e.g., "Muscle", "JDM", "Classic"
  history: string[]; // e.g., "Flooded", "Rust", "Barn Find"
  currentValue?: number; // Calculated based on condition
}

/**
 * Static car database - sample cars for the game.
 * These are template cars used to generate random encounters.
 * Each generated car gets a unique ID and randomized condition.
 * Organized by tiers: Daily Drivers (starter), Cult Classics, Icons, Unicorns.
 */
export const CarDatabase: Car[] = [
  // Tier 1: Daily Drivers (Starter Cars - $3,000-$8,000)
  {
    id: 'car_starter_001',
    name: '1998 Honda Civic',
    baseValue: 3500,
    condition: 50,
    tags: ['Daily Driver', 'Import', 'Reliable'],
    history: ['High Miles'],
  },
  {
    id: 'car_starter_002',
    name: '2005 Ford Focus',
    baseValue: 4000,
    condition: 45,
    tags: ['Daily Driver', 'Practical', 'Commuter'],
    history: ['Minor Accident'],
  },
  {
    id: 'car_starter_003',
    name: '1995 Mazda Miata',
    baseValue: 5500,
    condition: 55,
    tags: ['Daily Driver', 'Roadster', 'Fun'],
    history: ['Repainted'],
  },
  {
    id: 'car_starter_004',
    name: '2001 Volkswagen Golf',
    baseValue: 4500,
    condition: 48,
    tags: ['Daily Driver', 'Hatchback', 'European'],
    history: ['Rust'],
  },
  {
    id: 'car_starter_005',
    name: '1992 Toyota Corolla',
    baseValue: 3000,
    condition: 40,
    tags: ['Daily Driver', 'Reliable', 'Budget'],
    history: ['Rust'],
  },
  // Tier 2: Cult Classics ($25,000-$40,000)
  {
    id: 'car_001',
    name: '1969 Dodge Charger',
    baseValue: 25000,
    condition: 45,
    tags: ['Muscle', 'Classic', 'American'],
    history: ['Barn Find', 'Rust'],
  },
  {
    id: 'car_002',
    name: '1994 Toyota Supra',
    baseValue: 35000,
    condition: 60,
    tags: ['JDM', 'Sports', 'Turbo'],
    history: ['Modified', 'Track Car'],
  },
  {
    id: 'car_003',
    name: '1967 Ford Mustang',
    baseValue: 30000,
    condition: 50,
    tags: ['Muscle', 'Classic', 'American'],
    history: ['Original Paint', 'Numbers Matching'],
  },
  {
    id: 'car_004',
    name: '1999 Nissan Skyline GT-R',
    baseValue: 40000,
    condition: 70,
    tags: ['JDM', 'Sports', 'AWD'],
    history: ['Import', 'Clean Title'],
  },
  {
    id: 'car_005',
    name: '1970 Plymouth Barracuda',
    baseValue: 28000,
    condition: 40,
    tags: ['Muscle', 'Classic', 'Rare'],
    history: ['Project Car', 'No Engine'],
  },
  {
    id: 'car_006',
    name: '1995 Mazda RX-7',
    baseValue: 32000,
    condition: 55,
    tags: ['JDM', 'Sports', 'Rotary'],
    history: ['Low Miles', 'Original Owner'],
  },
  {
    id: 'car_007',
    name: '1968 Chevrolet Camaro',
    baseValue: 27000,
    condition: 48,
    tags: ['Muscle', 'Classic', 'American'],
    history: ['Restored Interior', 'Needs Paint'],
  },
  {
    id: 'car_008',
    name: '2002 Honda NSX',
    baseValue: 45000,
    condition: 80,
    tags: ['JDM', 'Exotic', 'Mid-Engine'],
    history: ['Dealer Maintained', 'Pristine'],
  },
];

/**
 * Generate a random car from the database.
 * Creates a new instance with a unique ID and random condition (see GAME_CONFIG.cars.randomConditionMin/max).
 * @returns A new car instance with randomized properties
 */
export function getRandomCar(): Car {
  const randomIndex = Math.floor(Math.random() * CarDatabase.length);
  const baseCar = CarDatabase[randomIndex];

  const minCondition = GAME_CONFIG.cars.randomConditionMin;
  const maxCondition = GAME_CONFIG.cars.randomConditionMax;
  const randomCondition =
    Math.floor(Math.random() * (maxCondition - minCondition + 1)) + minCondition;
  
  // Create a copy with a unique ID
  return {
    ...baseCar,
    id: `car_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
export function calculateCarValue(car: Car): number {
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
  
  const value = Math.floor(car.baseValue * conditionMultiplier * historyMultiplier);
  return value;
}

/**
 * Get all cars from database that match a specific tag.
 * @param tag - The tag to filter by (e.g., 'Muscle', 'JDM', 'Classic')
 * @returns Array of cars containing the specified tag
 */
export function getCarsByTag(tag: string): Car[] {
  return CarDatabase.filter((car) => car.tags.includes(tag));
}
