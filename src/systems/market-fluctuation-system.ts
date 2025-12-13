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
   */
  public getMarketModifier(carTags: string[]): number {
    let modifier = 1.0;

    // Apply seasonal modifier
    const seasonalModifier = this.getSeasonalModifier(carTags);
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
   */
  public getMarketDescription(): string {
    const season = this.getCurrentSeason();
    let description = `Season: ${season}`;

    if (this.currentEvent) {
      description += ` | Event: ${this.currentEvent.description} (${this.currentEvent.daysRemaining} days left)`;
    }

    return description;
  }

  /**
   * Get detailed market info for a specific car.
   */
  public getCarMarketInfo(carTags: string[]): { modifier: number; factors: string[] } {
    const factors: string[] = [];
    let modifier = 1.0;

    // Seasonal factor
    const seasonalModifier = this.getSeasonalModifier(carTags);
    if (seasonalModifier !== 1.0) {
      const season = this.getCurrentSeason();
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
   * Get current season based on day of year (simplified).
   */
  private getCurrentSeason(): string {
    // For simplicity, we'll use a simple day-based calculation
    // In a real game, you'd want actual date-based seasons
    const dayOfYear = new Date().getDay(); // Simplified - using day of week as proxy
    const seasons = ['Winter', 'Spring', 'Summer', 'Fall'];
    return seasons[dayOfYear % 4];
  }

  /**
   * Get seasonal modifier for car tags.
   */
  private getSeasonalModifier(carTags: string[]): number {
    const season = this.getCurrentSeason().toLowerCase();
    const seasonalConfigs = GAME_CONFIG.economy.market.seasonal;
    const seasonalConfig = seasonalConfigs[season as keyof typeof seasonalConfigs] as any;

    if (!seasonalConfig) return 1.0;

    // Check if car has any of the affected tags
    const hasAffectedTag = carTags.some(tag => seasonalConfig.tags.includes(tag));
    return hasAffectedTag ? seasonalConfig.modifier : 1.0;
  }

  /**
   * Get event modifier for car tags.
   */
  private getEventModifier(carTags: string[]): number {
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
    const events = GAME_CONFIG.economy.market.events;
    const rand = Math.random();

    let cumulativeChance = 0;

    for (const [eventType, config] of Object.entries(events)) {
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
  private triggerEvent(type: MarketEventType, config: any): void {
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