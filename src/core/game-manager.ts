import { Car } from '@/data/car-database';
import { eventBus } from './event-bus';
import { Economy } from '@/systems/economy';
import { MarketFluctuationSystem } from '@/systems/market-fluctuation-system';
import { SpecialEventsSystem } from '@/systems/special-events-system';
import { GAME_CONFIG } from '@/config/game-config';

/**
 * Player State - Represents all player-owned resources and progression.
 * Treat returned objects as immutable to prevent untracked state mutations.
 */
export interface PlayerState {
  money: number;
  inventory: Car[];
  garageSlots: number;
  prestige: number;
  bankLoanTaken: boolean;
  skills: {
    eye: number; // 1-5
    tongue: number; // 1-5
    network: number; // 1-5
  };
}

/**
 * World State - Represents game time and current location.
 * Time is tracked in 24-hour format; days advance only via end-of-day transitions.
 */
export interface WorldState {
  day: number;
  timeOfDay: number; // 0-24 hours
  currentLocation: string;
}

const DAY_START_HOUR = GAME_CONFIG.day.startHour;
const DAILY_RENT = GAME_CONFIG.economy.dailyRent;
const BANK_LOAN_AMOUNT = GAME_CONFIG.economy.bankLoan.amount;

const SAVE_KEY = 'theCuratorSave';

/**
 * Saved game data structure.
 */
interface SavedGameData {
  player: PlayerState;
  world: WorldState;
  market?: any; // Market fluctuation state
  specialEvents?: any; // Special events state
  version: string; // For future compatibility
}

export type EndDayResult =
  | { bankrupt: true; requiredRent: number }
  | { bankrupt: false; rentPaid: number };

/**
 * GameManager - Central singleton for managing game state.
 * Single source of truth for player and world state.
 * All state mutations must go through GameManager methods to ensure events are emitted.
 * Never mutate state objects directly; always use the provided mutation methods.
 */
export class GameManager {
  private static instance: GameManager;

  private player!: PlayerState;
  private world!: WorldState;
  private marketSystem: MarketFluctuationSystem;
  private specialEventsSystem: SpecialEventsSystem;

  private constructor() {
    this.marketSystem = MarketFluctuationSystem.getInstance();
    this.specialEventsSystem = SpecialEventsSystem.getInstance();

    // Try to load saved game first
    if (!this.load()) {
      // Initialize default state if no save or load failed
      this.initializeDefaultState();
    }
  }

  /**
   * Initialize default game state (used when no save exists).
   */
  private initializeDefaultState(): void {
    this.player = {
      money: GAME_CONFIG.player.startingMoney,
      inventory: [],
      garageSlots: GAME_CONFIG.player.startingGarageSlots,
      prestige: GAME_CONFIG.player.startingPrestige,
      bankLoanTaken: false,
      skills: { ...GAME_CONFIG.player.startingSkills },
    };

    this.world = {
      day: 1,
      timeOfDay: DAY_START_HOUR,
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

  public getDailyRent(): number {
    return DAILY_RENT;
  }

  public getBankLoanAmount(): number {
    return BANK_LOAN_AMOUNT;
  }

  public canTakeBankLoan(): boolean {
    return !this.player.bankLoanTaken;
  }

  /**
   * Take a one-time bank loan (MVP).
   * Loan repayment is not implemented yet; this is an emergency cash injection.
   */
  public takeBankLoan(): boolean {
    if (!this.canTakeBankLoan()) return false;

    this.player.bankLoanTaken = true;
    this.player.money += BANK_LOAN_AMOUNT;
    eventBus.emit('money-changed', this.player.money);
    return true;
  }

  /**
    * Attempt to spend money.
   * @param amount - Amount to spend (positive number)
   * @returns True if transaction succeeded, false if insufficient funds
   */
  public spendMoney(amount: number): boolean {
    if (amount <= 0) return true;
    if (this.player.money < amount) return false;

    this.player.money -= amount;
    eventBus.emit('money-changed', this.player.money);
    return true;
  }

  /**
   * Apply daily rent (requires sufficient money).
   * @returns The amount paid.
   */
  private applyDailyRent(): number {
    this.player.money -= DAILY_RENT;
    eventBus.emit('money-changed', this.player.money);
    return DAILY_RENT;
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
   * Get the cost to upgrade to the next garage slot level.
   * @returns Cost in prestige points, or null if maxed out
   */
  public getNextGarageSlotCost(): number | null {
    const currentSlots = this.player.garageSlots;
    // Simple progression: each slot costs 10 prestige more than the last
    // Max 5 slots for now
    if (currentSlots >= 5) return null;
    return currentSlots * 10; // Slot 1->2: 10, 2->3: 20, etc.
  }

  /**
   * Attempt to upgrade garage slots.
   * @returns True if upgrade succeeded, false if insufficient prestige or maxed
   */
  public upgradeGarageSlots(): boolean {
    const cost = this.getNextGarageSlotCost();
    if (cost === null || this.player.prestige < cost) return false;

    this.player.prestige -= cost;
    this.player.garageSlots += 1;
    eventBus.emit('prestige-changed', this.player.prestige);
    this.save(); // Auto-save on upgrade
    return true;
  }

  /**
   * Calculate daily prestige bonus from museum cars.
   * @returns Number of prestige points earned from museum
   */
  private calculateMuseumPrestigeBonus(): number {
    // Museum cars: condition >= 80 and value >= $50,000
    const museumCars = this.player.inventory.filter(car => {
      const value = Economy.getSalePrice(car, this);
      return car.condition >= 80 && value >= 50000;
    });

    // 1 prestige per museum car per day
    return museumCars.length;
  }

  /**
   * Add car to inventory and emit inventory-changed event.
   * Note: Does not check garage capacity; caller should verify before adding.
   * @param car - The car to add to inventory
   */
  public addCar(car: Car): void {
    this.player.inventory.push(car);
    eventBus.emit('inventory-changed', this.player.inventory);
    this.save(); // Auto-save on inventory change
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
      this.save(); // Auto-save on inventory change
      return true;
    }
    return false;
  }

  /**
    * Advance time.
   * @param hours - Hours to advance (can be fractional, e.g., 0.5 for 30 minutes)
   */
  public advanceTime(hours: number): void {
    this.world.timeOfDay += hours;

    // Game design: actions should be blocked from pushing time past DAY_END_HOUR.
    // Still clamp to a sensible range defensively.
    if (this.world.timeOfDay < 0) this.world.timeOfDay = 0;
    if (this.world.timeOfDay > 24) this.world.timeOfDay = 24;

    eventBus.emit('time-changed', this.world.timeOfDay);
  }

  /**
    * End the current day and start the next day at DAY_START_HOUR.
    * Applies daily rent (DAILY_RENT). If rent cannot be paid, the player is bankrupt.
   */
  public endDay(): EndDayResult {
    if (this.player.money < DAILY_RENT) {
      return { bankrupt: true, requiredRent: DAILY_RENT };
    }

    this.world.day += 1;
    this.world.timeOfDay = DAY_START_HOUR;

    const rentPaid = this.applyDailyRent();

    // Apply museum prestige bonus
    const museumBonus = this.calculateMuseumPrestigeBonus();
    if (museumBonus > 0) {
      this.addPrestige(museumBonus);
    }

    // Advance market system (potentially trigger new events)
    this.marketSystem.advanceDay(this.world.day);

    // Advance special events system (potentially generate new events)
    this.specialEventsSystem.advanceDay(this.world.day);

    eventBus.emit('day-changed', this.world.day);
    eventBus.emit('time-changed', this.world.timeOfDay);

    this.save(); // Auto-save on day end
    return { bankrupt: false, rentPaid };
  }

  /**
   * Get current market description for UI display.
   */
  public getMarketDescription(): string {
    return this.marketSystem.getMarketDescription();
  }

  /**
   * Get detailed market info for a specific car.
   */
  public getCarMarketInfo(carTags: string[]): { modifier: number; factors: string[] } {
    return this.marketSystem.getCarMarketInfo(carTags);
  }

  /**
   * Get market modifier for a car (used by economy system).
   */
  public getMarketModifier(carTags: string[]): number {
    return this.marketSystem.getMarketModifier(carTags);
  }

  /**
   * Get active special events for map display.
   */
  public getActiveSpecialEvents(): any[] {
    return this.specialEventsSystem.getActiveEvents();
  }

  /**
   * Remove a completed special event.
   */
  public removeSpecialEvent(eventId: string): void {
    this.specialEventsSystem.removeEvent(eventId);
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
    * Resets player to starting money, clears inventory, resets skills.
    * Resets world to day 1, business day start, at garage.
   * Emits all relevant change events.
   */
  public reset(): void {
    this.initializeDefaultState();

    eventBus.emit('money-changed', this.player.money);
    eventBus.emit('prestige-changed', this.player.prestige);
    eventBus.emit('inventory-changed', this.player.inventory);
    eventBus.emit('day-changed', this.world.day);
    eventBus.emit('time-changed', this.world.timeOfDay);
    eventBus.emit('location-changed', this.world.currentLocation);
  }

  /**
   * Save current game state to localStorage.
   * @returns True if save succeeded, false otherwise
   */
  public save(): boolean {
    try {
      const saveData: SavedGameData = {
        player: this.player,
        world: this.world,
        market: this.marketSystem.getState(),
        specialEvents: this.specialEventsSystem.getState(),
        version: '1.0',
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
      console.log('Game saved successfully');
      return true;
    } catch (error) {
      console.error('Failed to save game:', error);
      return false;
    }
  }

  /**
   * Load game state from localStorage.
   * @returns True if load succeeded, false otherwise
   */
  public load(): boolean {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (!saved) return false;

      const saveData: SavedGameData = JSON.parse(saved);

      // Basic version check (expand later if needed)
      if (saveData.version !== '1.0') {
        console.warn('Save version mismatch, starting fresh');
        return false;
      }

      this.player = saveData.player;
      this.world = saveData.world;

      // Load market state if available (backwards compatibility)
      if (saveData.market) {
        this.marketSystem.loadState(saveData.market);
      }

      // Load special events state if available (backwards compatibility)
      if (saveData.specialEvents) {
        this.specialEventsSystem.loadState(saveData.specialEvents);
      }

      console.log('Game loaded successfully');
      return true;
    } catch (error) {
      console.error('Failed to load game:', error);
      return false;
    }
  }
}
