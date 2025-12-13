/**
 * Special event types that can occur on the map.
 */
export type SpecialEventType = 'policeAuction' | 'barnFind' | 'vipEvent' | 'dealerClearance';

/**
 * Active special event with location and properties.
 */
export interface SpecialEvent {
  id: string;
  type: SpecialEventType;
  name: string;
  description: string;
  x: number;
  y: number;
  color: number;
  timeCost: number;
  reward: {
    carValueMultiplier?: number;
    prestigeBonus?: number;
    moneyBonus?: number;
    guaranteedTags?: string[];
  };
  expiresInDays: number;
}

/**
 * Special events state for persistence.
 */
export interface SpecialEventsState {
  activeEvents: SpecialEvent[];
  lastEventDay: number;
}

/**
 * Special Events System - Manages random special events that appear on the map.
 * Creates dynamic map nodes with unique encounters and rewards.
 */
export class SpecialEventsSystem {
  private static instance: SpecialEventsSystem;
  private activeEvents: SpecialEvent[] = [];
  private lastEventDay: number = 0;

  private constructor() {}

  /**
   * Get singleton instance.
   */
  public static getInstance(): SpecialEventsSystem {
    if (!SpecialEventsSystem.instance) {
      SpecialEventsSystem.instance = new SpecialEventsSystem();
    }
    return SpecialEventsSystem.instance;
  }

  /**
   * Load special events state from saved data.
   */
  public loadState(state: SpecialEventsState): void {
    this.activeEvents = state.activeEvents;
    this.lastEventDay = state.lastEventDay;
  }

  /**
   * Get special events state for saving.
   */
  public getState(): SpecialEventsState {
    return {
      activeEvents: this.activeEvents,
      lastEventDay: this.lastEventDay,
    };
  }

  /**
   * Advance to next day, potentially generating new events and expiring old ones.
   */
  public advanceDay(currentDay: number): void {
    // Expire old events
    this.activeEvents = this.activeEvents.filter(event => {
      event.expiresInDays--;
      return event.expiresInDays > 0;
    });

    // Potentially generate new events (but not too frequently)
    if (currentDay - this.lastEventDay >= 3) { // Minimum 3 days between event generations
      this.tryGenerateEvent();
      if (this.activeEvents.length > 0) {
        this.lastEventDay = currentDay;
      }
    }
  }

  /**
   * Get all currently active special events.
   */
  public getActiveEvents(): SpecialEvent[] {
    return [...this.activeEvents];
  }

  /**
   * Remove a special event (when it's completed).
   */
  public removeEvent(eventId: string): void {
    this.activeEvents = this.activeEvents.filter(event => event.id !== eventId);
  }

  /**
   * Try to generate a random special event.
   */
  private tryGenerateEvent(): void {
    // 25% chance to generate an event each day
    if (Math.random() < 0.25) {
      const eventType = this.getRandomEventType();
      const event = this.createEvent(eventType);
      this.activeEvents.push(event);
    }
  }

  /**
   * Get a random event type based on weights.
   */
  private getRandomEventType(): SpecialEventType {
    const events: { type: SpecialEventType; weight: number }[] = [
      { type: 'policeAuction', weight: 30 },
      { type: 'barnFind', weight: 25 },
      { type: 'vipEvent', weight: 15 },
      { type: 'dealerClearance', weight: 30 },
    ];

    const totalWeight = events.reduce((sum, event) => sum + event.weight, 0);
    let random = Math.random() * totalWeight;

    for (const event of events) {
      random -= event.weight;
      if (random <= 0) {
        return event.type;
      }
    }

    return 'policeAuction'; // Fallback
  }

  /**
   * Create a special event of the given type.
   */
  private createEvent(type: SpecialEventType): SpecialEvent {
    const baseId = `special_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    switch (type) {
      case 'policeAuction':
        return {
          id: baseId,
          type,
          name: 'Police Impound Auction',
          description: 'Seized vehicles from recent busts. High risk, high reward.',
          x: 200 + Math.random() * 400, // Random position
          y: 150 + Math.random() * 200,
          color: 0x000080, // Dark blue
          timeCost: 3, // 3 hours
          reward: {
            carValueMultiplier: 0.7, // Cars are cheaper but may have issues
            prestigeBonus: 2,
            guaranteedTags: ['Barn Find', 'Project Car'],
          },
          expiresInDays: 2,
        };

      case 'barnFind':
        return {
          id: baseId,
          type,
          name: 'Abandoned Barn Discovery',
          description: 'Local farmer found vintage cars in an old barn. Rare finds!',
          x: 150 + Math.random() * 500,
          y: 200 + Math.random() * 150,
          color: 0x8b4513, // Brown
          timeCost: 2,
          reward: {
            carValueMultiplier: 1.2, // Premium cars
            prestigeBonus: 3,
            guaranteedTags: ['Barn Find', 'Classic'],
          },
          expiresInDays: 3,
        };

      case 'vipEvent':
        return {
          id: baseId,
          type,
          name: 'VIP Collector Showcase',
          description: 'Exclusive event for serious collectors. Premium vehicles only.',
          x: 300 + Math.random() * 300,
          y: 100 + Math.random() * 250,
          color: 0xffd700, // Gold
          timeCost: 4,
          reward: {
            carValueMultiplier: 1.5, // Very expensive cars
            prestigeBonus: 5,
            guaranteedTags: ['Exotic', 'Pristine'],
          },
          expiresInDays: 1, // Very limited time
        };

      case 'dealerClearance':
        return {
          id: baseId,
          type,
          name: 'Dealer Liquidation Sale',
          description: 'Overstock clearance! Great deals on quality vehicles.',
          x: 250 + Math.random() * 400,
          y: 180 + Math.random() * 170,
          color: 0x228b22, // Forest green
          timeCost: 1,
          reward: {
            carValueMultiplier: 0.85, // Good deals
            moneyBonus: 500, // Extra cash reward
            guaranteedTags: ['Classic', 'Low Miles'],
          },
          expiresInDays: 4,
        };

      default:
        throw new Error(`Unknown special event type: ${type}`);
    }
  }
}