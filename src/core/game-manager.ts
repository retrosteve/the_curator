import { Car } from '@/data/car-database';
import { eventBus } from './event-bus';

/**
 * Player State
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
 * World State
 */
export interface WorldState {
  day: number;
  timeOfDay: number; // 0-24 hours
  currentLocation: string;
}

/**
 * GameManager - Central singleton for managing game state
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
   * Add money to player
   */
  public addMoney(amount: number): void {
    this.player.money += amount;
    eventBus.emit('money-changed', this.player.money);
  }

  /**
   * Spend money
   * Allows debt up to -$500
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
   * Add prestige to player
   */
  public addPrestige(amount: number): void {
    this.player.prestige = Math.max(0, this.player.prestige + amount);
    eventBus.emit('prestige-changed', this.player.prestige);
  }

  /**
   * Add car to inventory
   */
  public addCar(car: Car): void {
    this.player.inventory.push(car);
    eventBus.emit('inventory-changed', this.player.inventory);
  }

  /**
   * Replace an existing car in inventory (by id).
   */
  public updateCar(updatedCar: Car): boolean {
    const index = this.player.inventory.findIndex((car) => car.id === updatedCar.id);
    if (index === -1) return false;

    this.player.inventory[index] = updatedCar;
    eventBus.emit('inventory-changed', this.player.inventory);
    return true;
  }

  /**
   * Remove car from inventory
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
   * Advance time
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
   * Set current location
   */
  public setLocation(location: string): void {
    this.world.currentLocation = location;
    eventBus.emit('location-changed', location);
  }

  /**
   * Get car by ID
   */
  public getCar(carId: string): Car | undefined {
    const car = this.player.inventory.find((c) => c.id === carId);
    return car ? { ...car } : undefined;
  }

  /**
   * Reset game state
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
