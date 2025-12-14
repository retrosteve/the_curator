import { Car, calculateCarValue } from '@/data/car-database';
import { GAME_CONFIG } from '@/config/game-config';

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

    const charlie = GAME_CONFIG.economy.restoration.charlieMinor;
    const artisan = GAME_CONFIG.economy.restoration.artisanMajor;

    // Cheap Charlie - Minor Service
    // Low Cost, Fast, Risk of bad work
    if (car.condition < charlie.availableBelowCondition) {
      options.push({
        id: 'charlie_minor',
        name: "Cheap Charlie's Quick Fix",
        specialist: 'Charlie',
        type: 'Minor',
        cost: Math.floor(baseValue * charlie.costRateOfBaseValue),
        time: charlie.timeHours,
        conditionGain: charlie.conditionGain,
        description: "Fast and cheap. Don't ask questions.",
        risk: `${Math.round(charlie.failChance * 100)}% chance to damage car`,
      });
    }

    // The Artisan - Major Overhaul
    // High Cost, Slow, Quality work
    if (car.condition < artisan.availableBelowCondition) {
      options.push({
        id: 'artisan_major',
        name: "The Artisan's Restoration",
        specialist: 'Artisan',
        type: 'Major',
        cost: Math.floor(baseValue * artisan.costRateOfBaseValue),
        time: artisan.timeHours,
        conditionGain: artisan.conditionGain,
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
   * @param tutorialOverride - If true, always succeed (ignore Charlie's risk) for tutorial
   * @returns Object with updated car, success flag, and message
   */
  public static performRestoration(car: Car, option: RestorationOption, tutorialOverride: boolean = false): { car: Car; success: boolean; message: string } {
    let newCondition = car.condition;
    let message = "Restoration complete.";
    let success = true;

    const charlie = GAME_CONFIG.economy.restoration.charlieMinor;
    const conditionMax = GAME_CONFIG.economy.restoration.conditionMax;

    if (option.specialist === 'Charlie') {
      // Charlie has a risk factor (skip in tutorial override)
      if (!tutorialOverride && Math.random() < charlie.failChance) {
        newCondition -= charlie.failConditionPenalty;
        message = "Charlie botched the job! Condition worsened.";
        success = false;
      } else {
        newCondition += option.conditionGain;
        message = tutorialOverride ? "Charlie managed to fix it up perfectly!" : "Charlie managed to fix it up.";
      }
    } else {
      // Artisan always succeeds
      newCondition += option.conditionGain;
      message = "The Artisan did a magnificent job.";
    }

    const updatedCar = {
      ...car,
      condition: Math.min(newCondition, conditionMax),
    };
    
    // Recalculate value
    updatedCar.currentValue = calculateCarValue(updatedCar);

    return { car: updatedCar, success, message };
  }

  /**
   * Calculate sale price with market fluctuation based on car tags.
   * @param car - The car to price
   * @param gameManager - GameManager instance for market data
   * @returns Final sale price as an integer
   */
  public static getSalePrice(car: Car, gameManager?: any): number {
    const baseValue = calculateCarValue(car);
    const marketModifier = gameManager ? gameManager.getMarketModifier(car.tags) : 1.0;
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
   * @returns Random value between GAME_CONFIG.economy.market.modifierMin and modifierMax
   */
  public static getMarketModifier(): number {
    const min = GAME_CONFIG.economy.market.modifierMin;
    const max = GAME_CONFIG.economy.market.modifierMax;
    return min + Math.random() * (max - min);
  }
}
