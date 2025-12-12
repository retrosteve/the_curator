import { Car } from '@/data/car-database';
import { eventBus } from './event-bus';

/**
 * Player State - Represents all player-owned resources and progression.
 * Treat returned objects as immutable to prevent untracked state mutations.
 */
export interface PlayerState {
  money: number;
  inventory: Car[];
  garageSlots: number;
  prestige: number;
  skills: {
    eye: number; // 1-5
    tongue: number; // 1-5
    network: number; // 1-5
  };
}

/**
 * World State - Represents game time and current location.
 * Time is tracked in 24-hour format; days increment when time >= 24.
 */
export interface WorldState {
  day: number;
  timeOfDay: number; // 0-24 hours
  currentLocation: string;
}

/**
 * GameManager - Central singleton for managing game state.
 * Single source of truth for player and world state.
 * All state mutations must go through GameManager methods to ensure events are emitted.
 * Never mutate state objects directly; always use the provided mutation methods.
 */
export class GameManager {
  private static instance: GameManager;

  private player: PlayerState;
  private world: WorldState;

  private constructor() {
    // Initialize player state
    this.player = {
      money: 5000,
      inventory: [],
      garageSlots: 1,
      prestige: 0,
      skills: {
        eye: 1,
        tongue: 1,
        network: 1,
      },
    };

    // Initialize world state
    this.world = {
      day: 1,
      timeOfDay: 8, // Start at 8 AM
      currentLocation: 'garage',
    };
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): GameManager {
    if (!GameManager.instance) {
      GameManager.instance = new GameManager();
    }
    return GameManager.instance;
  }

  /**
   * Read-only snapshot of player state.
   * Treat returned objects as immutable.
   */
  public getPlayerState(): Readonly<PlayerState> {
    return this.player;
  }

  /**
   * Read-only snapshot of world state.
   * Treat returned objects as immutable.
   */
  public getWorldState(): Readonly<WorldState> {
    return this.world;
  }

  /**
   * Add money to player and emit money-changed event.
   * @param amount - Amount to add (positive number)
   */
  public addMoney(amount: number): void {
    this.player.money += amount;
    eventBus.emit('money-changed', this.player.money);
  }

  /**
   * Attempt to spend money with debt cap enforcement.
   * Allows debt up to -$500 as per game design.
   * @param amount - Amount to spend (positive number)
   * @returns True if transaction succeeded, false if it would exceed debt cap
   */
  public spendMoney(amount: number): boolean {
    if (this.player.money - amount >= -500) {
      this.player.money -= amount;
      eventBus.emit('money-changed', this.player.money);
      return true;
    }
    return false;
  }

  /**
   * Add prestige to player (cannot go below 0).
   * @param amount - Amount to add or subtract (can be negative)
   */
  public addPrestige(amount: number): void {
    this.player.prestige = Math.max(0, this.player.prestige + amount);
    eventBus.emit('prestige-changed', this.player.prestige);
  }

  /**
   * Add car to inventory and emit inventory-changed event.
   * Note: Does not check garage capacity; caller should verify before adding.
   * @param car - The car to add to inventory
   */
  public addCar(car: Car): void {
    this.player.inventory.push(car);
    eventBus.emit('inventory-changed', this.player.inventory);
  }

  /**
   * Replace an existing car in inventory (matched by id).
   * @param updatedCar - The car with updated properties
   * @returns True if car was found and updated, false otherwise
   */
  public updateCar(updatedCar: Car): boolean {
    const index = this.player.inventory.findIndex((car) => car.id === updatedCar.id);
    if (index === -1) return false;

    this.player.inventory[index] = updatedCar;
    eventBus.emit('inventory-changed', this.player.inventory);
    return true;
  }

  /**
   * Remove car from inventory by ID.
   * @param carId - The unique ID of the car to remove
   * @returns True if car was found and removed, false otherwise
   */
  public removeCar(carId: string): boolean {
    const index = this.player.inventory.findIndex((car) => car.id === carId);
    if (index !== -1) {
      this.player.inventory.splice(index, 1);
      eventBus.emit('inventory-changed', this.player.inventory);
      return true;
    }
    return false;
  }

  /**
   * Advance time and handle day transitions with daily rent.
   * When time reaches 24h, advances to next day and deducts $100 rent.
   * @param hours - Hours to advance (can be fractional, e.g., 0.5 for 30 minutes)
   */
  public advanceTime(hours: number): void {
    this.world.timeOfDay += hours;
    
    // If time exceeds 24 hours, advance to next day
    while (this.world.timeOfDay >= 24) {
      this.world.timeOfDay -= 24;
      this.world.day += 1;
      
      // Daily Rent: $100
      this.player.money -= 100;
      eventBus.emit('money-changed', this.player.money);
      
      eventBus.emit('day-changed', this.world.day);
    }
    
    eventBus.emit('time-changed', this.world.timeOfDay);
  }

  /**
   * Set current location and emit location-changed event.
   * @param location - Name of the location (e.g., 'garage', 'scrapyard')
   */
  public setLocation(location: string): void {
    this.world.currentLocation = location;
    eventBus.emit('location-changed', location);
  }

  /**
   * Get a copy of a car from inventory by ID.
   * Returns a copy to prevent unintended mutations.
   * @param carId - The unique ID of the car
   * @returns A copy of the car if found, undefined otherwise
   */
  public getCar(carId: string): Car | undefined {
    const car = this.player.inventory.find((c) => c.id === carId);
    return car ? { ...car } : undefined;
  }

  /**
   * Reset game state to initial values.
   * Resets player to starting money ($5000), clears inventory, resets skills to level 1.
   * Resets world to day 1, 8:00 AM, at garage.
   * Emits all relevant change events.
   */
  public reset(): void {
    this.player = {
      money: 5000,
      inventory: [],
      garageSlots: 1,
      prestige: 0,
      skills: {
        eye: 1,
        tongue: 1,
        network: 1,
      },
    };

    this.world = {
      day: 1,
      timeOfDay: 8,
      currentLocation: 'garage',
    };

    eventBus.emit('money-changed', this.player.money);
    eventBus.emit('prestige-changed', this.player.prestige);
    eventBus.emit('inventory-changed', this.player.inventory);
    eventBus.emit('day-changed', this.world.day);
    eventBus.emit('time-changed', this.world.timeOfDay);
    eventBus.emit('location-changed', this.world.currentLocation);
  }
}
