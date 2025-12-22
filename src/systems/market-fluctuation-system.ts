import { GAME_CONFIG } from '@/config/game-config';

/**
 * Market event types that can affect prices.
 */
export type MarketEventType = 'boom' | 'bust' | 'nicheBoom';

/**
 * Active market event with duration and effects.
 */
export interface ActiveMarketEvent {
  type: MarketEventType;
  description: string;
  modifier: number;
  daysRemaining: number;
  affectedTags?: string[];
}

/**
 * Market fluctuation data for persistence.
 */
export interface MarketFluctuationState {
  currentEvent?: ActiveMarketEvent;
  lastEventDay: number;
}

/**
 * Market Fluctuation System - Manages dynamic price changes based on seasons and events.
 * Handles seasonal trends, random market events, and provides current market conditions.
 */
export class MarketFluctuationSystem {
  private static instance: MarketFluctuationSystem;
  private currentEvent?: ActiveMarketEvent;
  private lastEventDay: number = 0;

  private constructor() {}

  /**
   * Get singleton instance.
   */
  public static getInstance(): MarketFluctuationSystem {
    if (!MarketFluctuationSystem.instance) {
      MarketFluctuationSystem.instance = new MarketFluctuationSystem();
    }
    return MarketFluctuationSystem.instance;
  }

  /**
   * Load market state from saved data.
   */
  public loadState(state: MarketFluctuationState): void {
    this.currentEvent = state.currentEvent;
    this.lastEventDay = state.lastEventDay;
  }

  /**
   * Get market state for saving.
   */
  public getState(): MarketFluctuationState {
    return {
      currentEvent: this.currentEvent,
      lastEventDay: this.lastEventDay,
    };
  }

  /**
   * Advance to next day, potentially triggering new market events.
   */
  public advanceDay(currentDay: number): void {
    // Update existing event duration
    if (this.currentEvent) {
      this.currentEvent.daysRemaining--;
      if (this.currentEvent.daysRemaining <= 0) {
        this.currentEvent = undefined;
      }
    }

    // Potentially trigger new event (but not too frequently)
    if (!this.currentEvent && currentDay - this.lastEventDay >= 2) {
      this.tryTriggerEvent();
      if (this.currentEvent) {
        this.lastEventDay = currentDay;
      }
    }
  }

  /**
   * Get current market modifier for a car based on its tags.
   * @param carTags - Car tags to check against market conditions
   * @param gameDay - Current game day for seasonal calculations
   */
  public getMarketModifier(carTags: readonly string[], gameDay?: number): number {
    let modifier = 1.0;

    // Apply seasonal modifier
    const seasonalModifier = this.getSeasonalModifier(carTags, gameDay);
    modifier *= seasonalModifier;

    // Apply event modifier
    if (this.currentEvent) {
      const eventModifier = this.getEventModifier(carTags);
      modifier *= eventModifier;
    }

    return modifier;
  }

  /**
   * Get current market description for UI display.
   * @param gameDay - Current game day for seasonal calculations
   */
  public getMarketDescription(gameDay?: number): string {
    const season = this.getCurrentSeason(gameDay);
    let description = `Season: ${season}`;

    if (this.currentEvent) {
      description += ` | Event: ${this.currentEvent.description} (${this.currentEvent.daysRemaining} days left)`;
    }

    return description;
  }

  /**
   * Get detailed market info for a specific car.
   * @param carTags - Car tags to check
   * @param gameDay - Current game day for seasonal calculations
   */
  public getCarMarketInfo(carTags: readonly string[], gameDay?: number): { modifier: number; factors: string[] } {
    const factors: string[] = [];
    let modifier = 1.0;

    // Seasonal factor
    const seasonalModifier = this.getSeasonalModifier(carTags, gameDay);
    if (seasonalModifier !== 1.0) {
      const season = this.getCurrentSeason(gameDay);
      factors.push(`${season}: ${this.formatModifier(seasonalModifier)}`);
      modifier *= seasonalModifier;
    }

    // Event factor
    if (this.currentEvent) {
      const eventModifier = this.getEventModifier(carTags);
      if (eventModifier !== 1.0) {
        factors.push(`${this.currentEvent.description}: ${this.formatModifier(eventModifier)}`);
        modifier *= eventModifier;
      }
    }

    return { modifier, factors };
  }

  /**
   * Get current season based on game day number.
   * Uses day ranges defined in GAME_CONFIG.economy.market.seasonal.
   * Seasons cycle through the year with winter wrapping around (335-365 and 1-59).
   * @param gameDay - Current game day (from GameManager)
   */
  private getCurrentSeason(gameDay?: number): string {
    // If no gameDay provided, we can't determine season (fallback to 'Spring')
    if (gameDay === undefined) return 'Spring';

    const seasonalConfig = GAME_CONFIG.economy.market.seasonal;
    
    // Normalize day to 1-365 cycle for seasonal calculations
    const normalizedDay = ((gameDay - 1) % 365) + 1;
    
    // Check each season's day range
    // Winter wraps around year end (335-365 and 1-59)
    if (normalizedDay >= seasonalConfig.winter.startDay || normalizedDay <= seasonalConfig.winter.endDay) {
      return 'Winter';
    } else if (normalizedDay >= seasonalConfig.spring.startDay && normalizedDay <= seasonalConfig.spring.endDay) {
      return 'Spring';
    } else if (normalizedDay >= seasonalConfig.summer.startDay && normalizedDay <= seasonalConfig.summer.endDay) {
      return 'Summer';
    } else if (normalizedDay >= seasonalConfig.fall.startDay && normalizedDay <= seasonalConfig.fall.endDay) {
      return 'Fall';
    }
    
    return 'Spring'; // Default fallback
  }

  /**
   * Get seasonal modifier for car tags.
   * @param carTags - Car tags to check
   * @param gameDay - Current game day for seasonal calculations
   */
  private getSeasonalModifier(carTags: readonly string[], gameDay?: number): number {
    const seasonalConfigs = GAME_CONFIG.economy.market.seasonal;
    const seasonKey = this.getCurrentSeason(gameDay).toLowerCase();
    if (seasonKey !== 'winter' && seasonKey !== 'spring' && seasonKey !== 'summer' && seasonKey !== 'fall') {
      return 1.0;
    }

    const seasonalConfig = seasonalConfigs[seasonKey];
    const affectedTags = seasonalConfig.tags as readonly string[];

    // Check if car has any of the affected tags
    const hasAffectedTag = carTags.some((tag) => affectedTags.includes(tag));
    return hasAffectedTag ? seasonalConfig.modifier : 1.0;
  }

  /**
   * Get event modifier for car tags.
   */
  private getEventModifier(carTags: readonly string[]): number {
    if (!this.currentEvent) return 1.0;

    // For niche boom events, randomly select affected tags
    if (this.currentEvent.type === 'nicheBoom' && this.currentEvent.affectedTags) {
      const hasAffectedTag = carTags.some(tag => this.currentEvent!.affectedTags!.includes(tag));
      return hasAffectedTag ? this.currentEvent.modifier : 1.0;
    }

    // For general events, apply to all cars
    return this.currentEvent.modifier;
  }

  /**
   * Try to trigger a random market event.
   */
  private tryTriggerEvent(): void {
    const events: Record<MarketEventType, { chance: number; duration: number; modifier: number; description: string }> =
      GAME_CONFIG.economy.market.events;
    const rand = Math.random();

    let cumulativeChance = 0;

    for (const [eventType, config] of Object.entries(events) as Array<[
      MarketEventType,
      { chance: number; duration: number; modifier: number; description: string }
    ]>) {
      cumulativeChance += config.chance;
      if (rand < cumulativeChance) {
        this.triggerEvent(eventType as MarketEventType, config);
        break;
      }
    }
  }

  /**
   * Trigger a specific market event.
   */
  private triggerEvent(
    type: MarketEventType,
    config: { description: string; modifier: number; duration: number }
  ): void {
    const affectedTags = type === 'nicheBoom' ? this.getRandomTags(2) : undefined;

    this.currentEvent = {
      type,
      description: config.description,
      modifier: config.modifier,
      daysRemaining: config.duration,
      affectedTags,
    };
  }

  /**
   * Get random car tags for niche events.
   */
  private getRandomTags(count: number): string[] {
    // This would ideally come from a central tag list, but for now we'll hardcode common tags
    const allTags = ['Sports', 'Muscle', 'JDM', 'Classic', 'Exotic', 'Convertible', 'Barn Find', 'Project Car'];
    const shuffled = [...allTags].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  /**
   * Format modifier as percentage string.
   */
  private formatModifier(modifier: number): string {
    const percent = Math.round((modifier - 1) * 100);
    return percent >= 0 ? `+${percent}%` : `${percent}%`;
  }
}