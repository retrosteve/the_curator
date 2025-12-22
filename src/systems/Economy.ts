import { Car, calculateCarValue } from '@/data/car-database';
import type { GameManager } from '@/core/game-manager';
import { GAME_CONFIG } from '@/config/game-config';

/**
 * Restoration challenge for damaged cars.
 * Some cars require special treatment before standard restoration.
 */
export interface RestorationChallenge {
  id: string;
  name: string;
  cost: number;
  apCost: number;
  description: string;
  requiredFor: string[]; // History tags that require this challenge
}

/**
 * Restoration option configuration.
 * Defines cost, AP cost, quality, and risk for a specific restoration service.
 */
export interface RestorationOption {
  id: string;
  name: string;
  specialist: 'Charlie' | 'Artisan';
  type: 'Minor' | 'Major';
  cost: number;
  apCost: number;
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
   * Check if a car requires special restoration challenges before standard restoration.
   * @param car - The car to check
   * @returns Array of required challenges, empty if none needed
   */
  public static getRestorationChallenges(car: Car): RestorationChallenge[] {
    const challenges: RestorationChallenge[] = [];

    // Check for Rust damage
    if (car.history.includes('Rust')) {
      challenges.push({
        id: 'rust_removal',
        name: 'Rust Removal Treatment',
        cost: GAME_CONFIG.economy.challenges.rustRemoval.cost,
        apCost: GAME_CONFIG.economy.challenges.rustRemoval.apCost,
        description: 'Remove rust and treat metal surfaces before restoration.',
        requiredFor: ['Rust'],
      });
    }

    // Check for Flood damage
    if (car.history.includes('Flooded')) {
      challenges.push({
        id: 'engine_rebuild',
        name: 'Engine Rebuild',
        cost: GAME_CONFIG.economy.challenges.engineRebuild.cost,
        apCost: GAME_CONFIG.economy.challenges.engineRebuild.apCost,
        description: 'Rebuild engine to fix water damage before restoration.',
        requiredFor: ['Flooded'],
      });
    }

    return challenges;
  }

  /**
   * Complete a restoration challenge, removing the problematic history tag.
   * @param car - The car to fix
   * @param challenge - The challenge to complete
   * @returns Updated car with history tag removed
   */
  public static completeRestorationChallenge(car: Car, challenge: RestorationChallenge): Car {
    const updatedHistory = car.history.filter((tag) => !challenge.requiredFor.includes(tag));
    return {
      ...car,
      history: updatedHistory,
    };
  }

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
        apCost: charlie.apCost,
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
        apCost: artisan.apCost,
        conditionGain: artisan.conditionGain,
        description: 'Perfection takes time. Increases value significantly.',
      });
    }

    return options;
  }

  /**
   * Perform restoration on a car with chance of hidden discoveries.
   * Charlie has a 10% chance to damage the car instead of improving it.
   * Artisan always succeeds and improves condition.
   * Both have chance of hidden discoveries (positive or negative).
   * Condition is capped at 100.
   * @param car - The car to restore
   * @param option - The restoration option to apply
   * @param tutorialOverride - If true, always succeed (ignore Charlie's risk) for tutorial
   * @returns Object with updated car, success flag, message, and discovery info
   */
  public static performRestoration(
    car: Car,
    option: RestorationOption,
    tutorialOverride: boolean = false
  ): {
    car: Car;
    success: boolean;
    message: string;
    discovery?: {
      found: boolean;
      type: 'positive' | 'negative';
      name: string;
      valueChange: number;
    };
  } {
    type RestorationDiscovery = {
      found: boolean;
      type: 'positive' | 'negative';
      name: string;
      valueChange: number;
    };

    let newCondition = car.condition;
    let message = 'Restoration complete.';
    let success = true;
    let discovery: RestorationDiscovery | undefined;

    const charlie = GAME_CONFIG.economy.restoration.charlieMinor;
    const conditionMax = GAME_CONFIG.economy.restoration.conditionMax;

    // Check for hidden discoveries (10% chance for positive, 5% chance for negative)
    if (!tutorialOverride) {
      const discoveryRoll = Math.random();
      if (discoveryRoll < 0.10) {
        // Positive discovery
        discovery = {
          found: true,
          type: 'positive',
          name: 'Original Engine Block',
          valueChange: 5000,
        };
        message = '💎 DISCOVERY! Found original engine block! +$5,000 value.';
      } else if (discoveryRoll < 0.15) {
        // Negative discovery (5% chance: 0.10 to 0.15)
        discovery = {
          found: true,
          type: 'negative',
          name: 'Hidden Flood Damage',
          valueChange: -3000,
        };
        message = '⚠️ PROBLEM! Found hidden flood damage. -$3,000 value.';
      }
    }

    if (option.specialist === 'Charlie') {
      // Charlie has a risk factor (skip in tutorial override)
      if (!tutorialOverride && Math.random() < charlie.failChance) {
        newCondition -= charlie.failConditionPenalty;
        message = discovery ? `${message} AND Charlie botched the job!` : 'Charlie botched the job! Condition worsened.';
        success = false;
      } else {
        newCondition += option.conditionGain;
        if (!discovery) {
          message = tutorialOverride ? 'Charlie managed to fix it up perfectly!' : 'Charlie managed to fix it up.';
        }
      }
    } else {
      // Artisan always succeeds
      newCondition += option.conditionGain;
      if (!discovery) {
        message = 'The Artisan did a magnificent job.';
      }
    }

    let updatedCar = {
      ...car,
      condition: Math.min(newCondition, conditionMax),
    };

    // Apply discovery value change if found
    if (discovery) {
      updatedCar = {
        ...updatedCar,
        baseValue: Math.max(100, updatedCar.baseValue + discovery.valueChange), // Minimum $100
      };
    }

    return { car: updatedCar, success, message, discovery };
  }

  /**
   * Calculate sale price with market fluctuation based on car tags.
   * @param car - The car to price
   * @param gameManager - GameManager instance for market data
   * @returns Final sale price as an integer
   */
  public static getSalePrice(
    car: { baseValue: number; condition: number; history?: readonly string[]; tags: readonly string[] },
    gameManager?: Pick<GameManager, 'getMarketModifier'>
  ): number {
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
  public static calculateProfit(purchasePrice: number, restorationCost: number, salePrice: number): number {
    return salePrice - purchasePrice - restorationCost;
  }
}
