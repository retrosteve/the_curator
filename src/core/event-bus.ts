import type { Car } from '@/data/car-database';

/**
 * Central event contract for the game.
 * Defines all event types and their payload structures for type-safe event handling.
 * Keep keys aligned with `.github/copilot-instructions.md`.
 */
export type GameEvents = {
  'money-changed': number;
  'prestige-changed': number;
  'inventory-changed': Car[];
  'ap-changed': number;
  'day-changed': number;
  'location-changed': string;
  'victory': any; // VictoryResult from GameManager
  'tutorial-complete': void;
  'tutorial-step-changed': { step: string };
  'tutorial-dialogue-show': {
    speaker: string;
    text: string;
    onDismiss?: () => void;
  };
  'tutorial-dialogue-hide': void;
  'tutorial-skip-prompt': {
    onSkip: () => void;
    onContinue: () => void;
  };
  'collection-complete': {
    id: string;
    name: string;
    description: string;
    icon: string;
    prestigeReward: number;
  };
  'skill-levelup': { skill: string; level: number };
  'xp-gained': { 
    skill: 'eye' | 'tongue' | 'network'; 
    amount: number;
    currentXP?: number;
    requiredXP?: number;
    currentLevel?: number;
  };
};

export type EventMap = Record<string, unknown>;
export type EventHandler<T> = (payload: T) => void;

/**
 * EventBus - Type-safe pub-sub event system for decoupled communication.
 * Allows scenes and systems to communicate without direct dependencies.
 * All events are defined in the GameEvents type for compile-time type safety.
 */
export class EventBus<Events extends EventMap> {
  private events: Map<keyof Events, Set<EventHandler<Events[keyof Events]>>>;

  constructor() {
    this.events = new Map();
  }

  /**
   * Subscribe to an event.
   * @param event - The event name to listen for
   * @param callback - Handler function called when event is emitted
   */
  on<K extends keyof Events>(event: K, callback: EventHandler<Events[K]>): void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(callback as EventHandler<Events[keyof Events]>);
  }

  /**
   * Unsubscribe from an event.
   * @param event - The event name to stop listening to
   * @param callback - The specific handler function to remove
   */
  off<K extends keyof Events>(event: K, callback: EventHandler<Events[K]>): void {
    this.events.get(event)?.delete(callback as EventHandler<Events[keyof Events]>);
  }

  /**
   * Emit an event with data to all registered listeners.
   * @param event - The event name to emit
   * @param payload - The data to pass to event handlers
   */
  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const handlers = this.events.get(event);
    if (!handlers) return;

    handlers.forEach((callback) => {
      (callback as EventHandler<Events[K]>)(payload);
    });
  }

  /**
   * Clear all event listeners.
   * Warning: Use with caution as this removes all subscriptions.
   */
  clear(): void {
    this.events.clear();
  }
}

// Singleton instance
export const eventBus = new EventBus<GameEvents>();
