/**
 * Car data structure
 */
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
 * Static car database - sample cars for the game
 */
export const CarDatabase: Car[] = [
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
 * Generate a random car from the database
 */
export function getRandomCar(): Car {
  const randomIndex = Math.floor(Math.random() * CarDatabase.length);
  const baseCar = CarDatabase[randomIndex];
  
  // Create a copy with a unique ID
  return {
    ...baseCar,
    id: `car_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    condition: Math.floor(Math.random() * 60) + 30, // Random condition 30-90
  };
}

/**
 * Calculate current value of a car based on condition and history
 */
export function calculateCarValue(car: Car): number {
  const conditionMultiplier = car.condition / 100;
  
  // Calculate history multiplier (worst tag wins)
  let historyMultiplier = 1.0;
  
  if (car.history && car.history.length > 0) {
    const multipliers: number[] = [];
    
    if (car.history.includes('Flooded')) multipliers.push(0.5);
    if (car.history.includes('Rust')) multipliers.push(0.7);
    if (car.history.includes('Mint')) multipliers.push(1.25);
    
    // If we found recognized tags, take the minimum
    if (multipliers.length > 0) {
      historyMultiplier = Math.min(...multipliers);
    }
  }
  
  const value = Math.floor(car.baseValue * conditionMultiplier * historyMultiplier);
  return value;
}

/**
 * Get cars by tag
 */
export function getCarsByTag(tag: string): Car[] {
  return CarDatabase.filter((car) => car.tags.includes(tag));
}
