import { Car, calculateCarValue } from '@/data/car-database';

export interface RestorationOption {
  id: string;
  name: string;
  specialist: 'Charlie' | 'Artisan';
  type: 'Minor' | 'Major';
  cost: number;
  time: number;
  conditionGain: number;
  description: string;
  risk?: string;
}

/**
 * Economy System - Handles value calculations and transactions
 */
export class Economy {
  /**
   * Get available restoration options for a car
   */
  public static getRestorationOptions(car: Car): RestorationOption[] {
    const options: RestorationOption[] = [];
    const baseValue = car.baseValue;

    // Cheap Charlie - Minor Service
    // Low Cost, Fast, Risk of bad work
    if (car.condition < 100) {
      options.push({
        id: 'charlie_minor',
        name: "Cheap Charlie's Quick Fix",
        specialist: 'Charlie',
        type: 'Minor',
        cost: Math.floor(baseValue * 0.02), // Placeholder tuning: 2% of base value
        time: 4,
        conditionGain: 10,
        description: "Fast and cheap. Don't ask questions.",
        risk: "10% chance to damage car",
      });
    }

    // The Artisan - Major Overhaul
    // High Cost, Slow, Quality work
    if (car.condition < 90) {
      options.push({
        id: 'artisan_major',
        name: "The Artisan's Restoration",
        specialist: 'Artisan',
        type: 'Major',
        cost: Math.floor(baseValue * 0.15), // Placeholder tuning: 15% of base value
        time: 8,
        conditionGain: 30,
        description: "Perfection takes time. Increases value significantly.",
      });
    }

    return options;
  }

  /**
   * Perform restoration
   */
  public static performRestoration(car: Car, option: RestorationOption): { car: Car; success: boolean; message: string } {
    let newCondition = car.condition;
    let message = "Restoration complete.";
    let success = true;

    if (option.specialist === 'Charlie') {
      // Charlie has a risk factor
      if (Math.random() < 0.1) {
        // 10% fail rate
        newCondition -= 5;
        message = "Charlie botched the job! Condition worsened.";
        success = false;
      } else {
        newCondition += option.conditionGain;
        message = "Charlie managed to fix it up.";
      }
    } else {
      // Artisan always succeeds
      newCondition += option.conditionGain;
      message = "The Artisan did a magnificent job.";
    }

    const updatedCar = {
      ...car,
      condition: Math.min(newCondition, 100),
    };
    
    // Recalculate value
    updatedCar.currentValue = calculateCarValue(updatedCar);

    return { car: updatedCar, success, message };
  }

  /**
   * Calculate sale price with market fluctuation
   */
  public static getSalePrice(car: Car, marketModifier: number = 1.0): number {
    const baseValue = calculateCarValue(car);
    return Math.floor(baseValue * marketModifier);
  }

  /**
   * Calculate profit from a flip
   */
  public static calculateProfit(
    purchasePrice: number,
    restorationCost: number,
    salePrice: number
  ): number {
    return salePrice - purchasePrice - restorationCost;
  }

  /**
   * Generate a random market modifier (0.8 to 1.2)
   */
  public static getMarketModifier(): number {
    return 0.8 + Math.random() * 0.4;
  }
}
