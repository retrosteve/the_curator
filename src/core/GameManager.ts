import { Car } from '@/data/CarDatabase';
import { eventBus } from './EventBus';

/**
 * Player State
 */
export interface PlayerState {
  money: number;
  inventory: Car[];
  reputation: number;
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

  public player: PlayerState;
  public world: WorldState;

  private constructor() {
    // Initialize player state
    this.player = {
      money: 5000,
      inventory: [],
      reputation: 0,
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
   * Add money to player
   */
  public addMoney(amount: number): void {
    this.player.money += amount;
    eventBus.emit('money-changed', this.player.money);
  }

  /**
   * Spend money
   */
  public spendMoney(amount: number): boolean {
    if (this.player.money >= amount) {
      this.player.money -= amount;
      eventBus.emit('money-changed', this.player.money);
      return true;
    }
    return false;
  }

  /**
   * Add car to inventory
   */
  public addCar(car: Car): void {
    this.player.inventory.push(car);
    eventBus.emit('inventory-changed', this.player.inventory);
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
    return this.player.inventory.find((car) => car.id === carId);
  }

  /**
   * Reset game state
   */
  public reset(): void {
    this.player = {
      money: 5000,
      inventory: [],
      reputation: 0,
    };

    this.world = {
      day: 1,
      timeOfDay: 8,
      currentLocation: 'garage',
    };

    eventBus.emit('game-reset');
  }
}
