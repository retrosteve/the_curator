import type { Car } from '@/data/car-database';
import type { VictoryResult } from '@/core/game-manager';
import type { SkillKey } from '@/config/game-config';

/**
 * Central event contract for the game.
 * Defines all event types and their payload structures for type-safe event handling.
 * Keep keys aligned with `.github/copilot-instructions.md`.
 * Note: Some events may include callback functions in their payload; events are not intended
 * for persistence/serialization.
 */
export type GameEvents = {
  'money-changed': number;
  'prestige-changed': number;
  'inventory-changed': Car[];
  'ap-changed': number;
  'day-changed': number;
  'location-changed': string;
  'victory': VictoryResult;
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
  'skill-levelup': { skill: SkillKey; level: number };
  'xp-gained': { 
    skill: SkillKey; 
    amount: number;
    currentXP?: number;
    requiredXP?: number;
    currentLevel?: number;
  };
};

/** Generic map of event names to payload types used by EventBus. */
export type EventMap = Record<string, unknown>;

/** A strongly-typed handler for a specific event payload. */
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

/** Singleton instance used across scenes/systems for game events. */
export const eventBus = new EventBus<GameEvents>();
