import { Car } from '@/data/car-database';
import { eventBus } from './event-bus';
import { MarketFluctuationSystem } from '@/systems/market-fluctuation-system';
import { SpecialEventsSystem } from '@/systems/special-events-system';
import { TutorialManager } from '@/systems/tutorial-manager';
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
  skillXP: {
    eye: number;
    tongue: number;
    network: number;
  };
  visitedLocations: Set<string>; // Track locations for Network XP (first visit only)
}

/**
 * World State - Represents game day and action points.
 * Days advance via end-of-day transitions. AP refreshes each new day.
 */
export interface WorldState {
  day: number;
  currentAP: number; // Remaining Action Points for today
  currentLocation: string;
}

const DAILY_RENT = GAME_CONFIG.economy.dailyRent;
const BANK_LOAN_AMOUNT = GAME_CONFIG.economy.bankLoan.amount;
const MAX_AP = GAME_CONFIG.day.maxAP;

const SAVE_KEY = 'theCuratorSave';
const SAVE_DEBOUNCE_MS = 1000; // Debounce save calls by 1 second

/**
 * Saved game data structure.
 */
interface SavedGameData {
  player: PlayerState;
  world: WorldState;
  market?: any; // Market fluctuation state
  specialEvents?: any; // Special events state
  tutorial?: { currentStep: string; isActive: boolean }; // Tutorial state
  version: string; // For future compatibility
}

export type EndDayResult =
  | { bankrupt: true; requiredRent: number }
  | { bankrupt: false; rentPaid: number };

/**
 * Victory check result.
 */
export interface VictoryResult {
  hasWon: boolean;
  prestige: { current: number; required: number; met: boolean };
  unicorns: { current: number; required: number; met: boolean };
  museumCars: { current: number; required: number; met: boolean };
  skillLevel: { current: number; required: number; met: boolean };
}

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
  private saveDebounceTimer: number | null = null;

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
      skillXP: { eye: 0, tongue: 0, network: 0 },
      visitedLocations: new Set(['garage']), // Start with garage as visited
    };

    this.world = {
      day: 1,
      currentAP: MAX_AP,
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
    // Exponential progression as per design: Slot 2: 100, Slot 3: 200, Slot 4: 400, Slot 5: 800
    const costs = [100, 200, 400, 800];
    const costIndex = currentSlots - 1; // Current slots = 1 → index 0 (cost 100)
    
    if (currentSlots >= 5) return null;
    return costs[costIndex];
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
    this.debouncedSave(); // Auto-save on upgrade
    return true;
  }

  /**
   * Calculate daily prestige bonus from museum cars.
   * @returns Number of prestige points earned from museum
   */
  private calculateMuseumPrestigeBonus(): number {
    // Only count cars actively displayed in museum
    const museumCars = this.getMuseumCars();

    // 1 prestige per museum car per day
    return museumCars.length;
  }

  /**
   * Add car to inventory and emit inventory-changed event.
   * Enforces garage capacity - returns false if garage is full.
   * @param car - The car to add to inventory
   * @returns True if car was added, false if garage is full
   */
  public addCar(car: Car): boolean {
    if (this.player.inventory.length >= this.player.garageSlots) {
      return false;
    }
    this.player.inventory.push(car);
    eventBus.emit('inventory-changed', this.player.inventory);
    this.debouncedSave(); // Auto-save on inventory change
    return true;
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
    this.debouncedSave(); // Auto-save on car update
    return true;
  }

  /**
   * Toggle museum display status for a car.
   * Only cars with condition >= 80 can be displayed.
   * @param carId - The unique ID of the car
   * @returns Object with success flag and message
   */
  public toggleMuseumDisplay(carId: string): { success: boolean; message: string } {
    const car = this.player.inventory.find((c) => c.id === carId);
    if (!car) {
      return { success: false, message: 'Car not found' };
    }

    if (!car.displayInMuseum && car.condition < 80) {
      return { success: false, message: 'Car must be in excellent condition (80%+) to display in museum' };
    }

    car.displayInMuseum = !car.displayInMuseum;
    eventBus.emit('inventory-changed', this.player.inventory);
    this.debouncedSave(); // Auto-save on museum status change

    const action = car.displayInMuseum ? 'added to' : 'removed from';
    return { success: true, message: `${car.name} ${action} museum display` };
  }

  /**
   * Check if a car is eligible for museum display.
   * @param car - The car to check
   * @returns True if car meets museum requirements (condition >= 80)
   */
  public isMuseumEligible(car: Car): boolean {
    return car.condition >= 80;
  }

  /**
   * Get all cars currently displayed in museum.
   * @returns Array of cars with displayInMuseum flag set
   */
  public getMuseumCars(): Car[] {
    return this.player.inventory.filter((car) => car.displayInMuseum === true);
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
      this.debouncedSave(); // Auto-save on inventory change
      return true;
    }
    return false;
  }

  /**
   * Spend Action Points for an action.
   * @param cost - AP to spend
   */
  public spendAP(cost: number): void {
    this.world.currentAP = Math.max(0, this.world.currentAP - cost);
    eventBus.emit('ap-changed', this.world.currentAP);
  }

  /**
   * End the current day and start the next day with fresh AP.
   * Applies daily rent (DAILY_RENT). If rent cannot be paid, the player is bankrupt.
   */
  public endDay(): EndDayResult {
    if (this.player.money < DAILY_RENT) {
      return { bankrupt: true, requiredRent: DAILY_RENT };
    }

    this.world.day += 1;
    this.world.currentAP = MAX_AP;

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

    // Check for victory condition
    const victoryCheck = this.checkVictory();
    if (victoryCheck.hasWon) {
      eventBus.emit('victory', victoryCheck);
    }

    eventBus.emit('day-changed', this.world.day);
    eventBus.emit('ap-changed', this.world.currentAP);

    this.save(); // Immediate save on day end (critical checkpoint)
    return { bankrupt: false, rentPaid };
  }

  /**
   * Get current market description for UI display.
   */
  public getMarketDescription(): string {
    return this.marketSystem.getMarketDescription(this.world.day);
  }

  /**
   * Get detailed market info for a specific car.
   */
  public getCarMarketInfo(carTags: string[]): { modifier: number; factors: string[] } {
    return this.marketSystem.getCarMarketInfo(carTags, this.world.day);
  }

  /**
   * Get market modifier for a car (used by economy system).
   */
  public getMarketModifier(carTags: string[]): number {
    return this.marketSystem.getMarketModifier(carTags, this.world.day);
  }

  /**
   * Add XP to a skill and check for level-up.
   * @param skill - The skill to gain XP in ('eye' | 'tongue' | 'network')
   * @param amount - Amount of XP to gain
   * @returns True if player leveled up
   */
  public addSkillXP(skill: 'eye' | 'tongue' | 'network', amount: number): boolean {
    const config = GAME_CONFIG.player.skillProgression;
    const currentLevel = this.player.skills[skill];
    
    // Max level reached
    if (currentLevel >= config.maxLevel) return false;

    this.player.skillXP[skill] += amount;
    const requiredXP = config.xpPerLevel[currentLevel]; // XP needed for NEXT level

    // Check if leveled up
    if (this.player.skillXP[skill] >= requiredXP) {
      this.player.skills[skill] += 1;
      this.player.skillXP[skill] = 0; // Reset XP for next level
      eventBus.emit('skill-levelup', { skill, level: this.player.skills[skill] });
      this.debouncedSave(); // Auto-save on level-up
      return true;
    }

    return false;
  }

  /**
   * Get XP progress for a skill.
   * @returns Object with current XP and required XP for next level
   */
  public getSkillProgress(skill: 'eye' | 'tongue' | 'network'): { current: number; required: number; level: number } {
    const config = GAME_CONFIG.player.skillProgression;
    const level = this.player.skills[skill];
    const currentXP = this.player.skillXP[skill];
    const requiredXP = level >= config.maxLevel ? 0 : config.xpPerLevel[level];

    return {
      current: currentXP,
      required: requiredXP,
      level,
    };
  }

  /**
   * Visit a location and award Network XP if it's the first visit.
   * @param locationId - Unique identifier for the location
   * @returns True if this was a first visit (Network XP awarded)
   */
  public visitLocation(locationId: string): boolean {
    if (this.player.visitedLocations.has(locationId)) {
      return false; // Already visited
    }

    this.player.visitedLocations.add(locationId);
    
    // Award Network XP for discovering new location
    const networkXPGain = GAME_CONFIG.player.skillProgression.xpGains.travelNewLocation;
    const leveledUp = this.addSkillXP('network', networkXPGain);
    
    if (leveledUp) {
      eventBus.emit('network-levelup', this.player.skills.network as any);
    }

    return true; // First visit
  }

  /**
   * Check if player has met all victory conditions.
   * Victory requires: prestige threshold, Unicorn collection, museum quality, max skill.
   * @returns Victory result with breakdown of each condition
   */
  public checkVictory(): VictoryResult {
    const config = GAME_CONFIG.victory;
    
    // Check prestige
    const prestigeMet = this.player.prestige >= config.requiredPrestige;
    
    // Check Unicorn count in museum display
    const museumCars = this.getMuseumCars();
    const unicornCount = museumCars.filter(car => car.tier === 'Unicorn').length;
    const unicornsMet = unicornCount >= config.requiredUnicorns;
    
    // Check total museum cars (actively displayed)
    const museumCarsMet = museumCars.length >= config.requiredMuseumCars;
    
    // Check skill level (at least one skill at max)
    const maxSkill = Math.max(
      this.player.skills.eye,
      this.player.skills.tongue,
      this.player.skills.network
    );
    const skillMet = maxSkill >= config.requiredSkillLevel;
    
    const hasWon = prestigeMet && unicornsMet && museumCarsMet && skillMet;
    
    return {
      hasWon,
      prestige: {
        current: this.player.prestige,
        required: config.requiredPrestige,
        met: prestigeMet,
      },
      unicorns: {
        current: unicornCount,
        required: config.requiredUnicorns,
        met: unicornsMet,
      },
      museumCars: {
        current: museumCars.length,
        required: config.requiredMuseumCars,
        met: museumCarsMet,
      },
      skillLevel: {
        current: maxSkill,
        required: config.requiredSkillLevel,
        met: skillMet,
      },
    };
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
    // Reset tutorial state for new game
    const tutorialManager = TutorialManager.getInstance();
    tutorialManager.reset();
    this.emitAllStateEvents();
  }

  /**
   * Schedule a debounced save.
   * Multiple calls within the debounce window will result in a single save.
   */
  private debouncedSave(): void {
    if (this.saveDebounceTimer !== null) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = window.setTimeout(() => {
      this.save();
      this.saveDebounceTimer = null;
    }, SAVE_DEBOUNCE_MS);
  }

  /**
   * Save current game state to localStorage.
   * @returns True if save succeeded, false otherwise
   */
  public save(): boolean {
    try {
      const tutorialManager = TutorialManager.getInstance();
      const saveData: SavedGameData = {
        player: {
          ...this.player,
          visitedLocations: Array.from(this.player.visitedLocations) as any, // Convert Set to Array for JSON
        },
        world: this.world,
        market: this.marketSystem.getState(),
        specialEvents: this.specialEventsSystem.getState(),
        tutorial: tutorialManager.getState(),
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

      // Backwards compatibility: add skillXP if missing
      if (!this.player.skillXP) {
        this.player.skillXP = { eye: 0, tongue: 0, network: 0 };
      }

      // Backwards compatibility: convert visitedLocations array to Set or initialize
      if (!this.player.visitedLocations) {
        this.player.visitedLocations = new Set(['garage']);
      } else if (Array.isArray(this.player.visitedLocations)) {
        this.player.visitedLocations = new Set(this.player.visitedLocations as any);
      }

      // Load market state if available (backwards compatibility)
      if (saveData.market) {
        this.marketSystem.loadState(saveData.market);
      }

      // Load special events state if available (backwards compatibility)
      if (saveData.specialEvents) {
        this.specialEventsSystem.loadState(saveData.specialEvents);
      }

      // Load tutorial state if available (backwards compatibility)
      if (saveData.tutorial) {
        const tutorialManager = TutorialManager.getInstance();
        tutorialManager.loadState(saveData.tutorial as any);
      }

      console.log('Game loaded successfully');
      return true;
    } catch (error) {
      console.error('Failed to load game:', error);
      return false;
    }
  }

  /**
   * Emit all state-changed events.
   * Useful after loading a save or resetting the game.
   * Ensures UI is synchronized with current state.
   */
  public emitAllStateEvents(): void {
    eventBus.emit('money-changed', this.player.money);
    eventBus.emit('prestige-changed', this.player.prestige);
    eventBus.emit('inventory-changed', this.player.inventory);
    eventBus.emit('day-changed', this.world.day);
    eventBus.emit('ap-changed', this.world.currentAP);
    eventBus.emit('location-changed', this.world.currentLocation);
  }
}
