import { Car, calculateCarValue } from '@/data/car-database';

/**
 * Economy System - Handles value calculations and transactions
 */
export class Economy {
  /**
   * Calculate restoration cost
   */
  public static getRestorationCost(car: Car, targetCondition: number): number {
    const conditionGain = targetCondition - car.condition;
    if (conditionGain <= 0) return 0;
    
    // Cost scales with base value and condition gain
    const costPerPoint = car.baseValue * 0.01;
    return Math.floor(conditionGain * costPerPoint);
  }

  /**
   * Calculate time required for restoration (in hours)
   */
  public static getRestorationTime(car: Car, targetCondition: number): number {
    const conditionGain = targetCondition - car.condition;
    if (conditionGain <= 0) return 0;
    
    // 0.5 hours per condition point
    return Math.ceil(conditionGain * 0.5);
  }

  /**
   * Restore a car to target condition
   */
  public static restoreCar(car: Car, targetCondition: number): Car {
    return {
      ...car,
      condition: Math.min(targetCondition, 100),
      currentValue: calculateCarValue({
        ...car,
        condition: Math.min(targetCondition, 100),
      }),
    };
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
