/**
 * EventBus - Central event system for decoupled communication
 */
export class EventBus {
  private events: Map<string, Set<Function>>;

  constructor() {
    this.events = new Map();
  }

  /**
   * Subscribe to an event
   */
  on(event: string, callback: Function): void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(callback);
  }

  /**
   * Unsubscribe from an event
   */
  off(event: string, callback: Function): void {
    if (this.events.has(event)) {
      this.events.get(event)!.delete(callback);
    }
  }

  /**
   * Emit an event with optional data
   */
  emit(event: string, data?: any): void {
    if (this.events.has(event)) {
      this.events.get(event)!.forEach((callback) => {
        callback(data);
      });
    }
  }

  /**
   * Clear all event listeners
   */
  clear(): void {
    this.events.clear();
  }
}

// Singleton instance
export const eventBus = new EventBus();
