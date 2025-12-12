import { Car, calculateCarValue } from '@/data/car-database';

/**
 * Restoration option configuration.
 * Defines cost, time, quality, and risk for a specific restoration service.
 */
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
 * Economy System - Handles value calculations, restoration, and transactions.
 * All methods are static; no instance state is maintained.
 * Provides restoration options, value calculations, and market modifiers.
 */
export class Economy {
  /**
   * Get available restoration options for a car based on its current condition.
   * Charlie (Minor) available if condition < 100
   * Artisan (Major) available if condition < 90
   * @param car - The car to get restoration options for
   * @returns Array of available restoration options
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
   * Perform restoration on a car.
   * Charlie has a 10% chance to damage the car instead of improving it.
   * Artisan always succeeds and improves condition.
   * Condition is capped at 100.
   * @param car - The car to restore
   * @param option - The restoration option to apply
   * @returns Object with updated car, success flag, and message
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
   * Calculate sale price with optional market fluctuation.
   * @param car - The car to price
   * @param marketModifier - Market multiplier (default 1.0; 0.8-1.2 recommended)
   * @returns Final sale price as an integer
   */
  public static getSalePrice(car: Car, marketModifier: number = 1.0): number {
    const baseValue = calculateCarValue(car);
    return Math.floor(baseValue * marketModifier);
  }

  /**
   * Calculate net profit from a car flip.
   * @param purchasePrice - Original purchase cost
   * @param restorationCost - Total spent on restoration
   * @param salePrice - Final sale price
   * @returns Net profit (can be negative)
   */
  public static calculateProfit(
    purchasePrice: number,
    restorationCost: number,
    salePrice: number
  ): number {
    return salePrice - purchasePrice - restorationCost;
  }

  /**
   * Generate a random market modifier representing demand fluctuation.
   * @returns Random value between 0.8 and 1.2
   */
  public static getMarketModifier(): number {
    return 0.8 + Math.random() * 0.4;
  }
}
