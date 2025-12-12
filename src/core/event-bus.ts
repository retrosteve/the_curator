import type { Car } from '@/data/car-database';

/**
 * Central event contract for the game.
 * Keep keys aligned with `.github/copilot-instructions.md`.
 */
export type GameEvents = {
  'money-changed': number;
  'prestige-changed': number;
  'inventory-changed': Car[];
  'time-changed': number;
  'day-changed': number;
  'location-changed': string;
  'show-dialogue': { speaker: string; text: string };
};

export type EventMap = Record<string, unknown>;
export type EventHandler<T> = (payload: T) => void;

/**
 * EventBus - Central event system for decoupled communication
 */
export class EventBus<Events extends EventMap> {
  private events: Map<keyof Events, Set<EventHandler<Events[keyof Events]>>>;

  constructor() {
    this.events = new Map();
  }

  /**
   * Subscribe to an event
   */
  on<K extends keyof Events>(event: K, callback: EventHandler<Events[K]>): void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(callback as EventHandler<Events[keyof Events]>);
  }

  /**
   * Unsubscribe from an event
   */
  off<K extends keyof Events>(event: K, callback: EventHandler<Events[K]>): void {
    this.events.get(event)?.delete(callback as EventHandler<Events[keyof Events]>);
  }

  /**
   * Emit an event with data
   */
  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const handlers = this.events.get(event);
    if (!handlers) return;

    handlers.forEach((callback) => {
      (callback as EventHandler<Events[K]>)(payload);
    });
  }

  /**
   * Clear all event listeners
   */
  clear(): void {
    this.events.clear();
  }
}

// Singleton instance
export const eventBus = new EventBus<GameEvents>();
