import { Car, getRandomCar } from '@/data/car-database';
import { eventBus } from './event-bus';
import { MarketFluctuationSystem } from '@/systems/market-fluctuation-system';
import { SpecialEventsSystem } from '@/systems/special-events-system';
import { TutorialManager } from '@/systems/tutorial-manager';
import { GAME_CONFIG } from '@/config/game-config';
import type { SpecialEvent } from '@/systems/special-events-system';
import { buildSaveData, hydrateLoadedState, readSaveData, writeSaveData, type SavedGameData } from '@/core/game-persistence';
import type { SkillKey } from '@/config/game-config';
import type { DeepReadonly } from '@/utils/types';

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
  claimedCollections: Set<string>; // Track completed collections to avoid duplicate rewards
}

/**
 * World State - Represents game day and action points.
 * Days advance via end-of-day transitions. AP refreshes each new day.
 */
export interface WorldState {
  day: number;
  currentAP: number; // Remaining Action Points for today
  currentLocation: string;
  /**
   * Per-day car offer for each location id.
   * - Missing key: not yet rolled for the day.
   * - null: rolled and consumed/cleared for the day.
   */
  carOfferByLocation: Record<string, Car | null>;
  /**
   * Rival presence roll for the current day, keyed by location id.
   * Stored in world state so it remains stable across scene transitions and reloads.
   */
  rivalPresenceByLocation: Record<string, boolean>;
  dayStats: {
    carsAcquired: number;
    moneyEarned: number;
    moneySpent: number;
    prestigeGained: number;
  };
}

const DAILY_RENT = GAME_CONFIG.economy.dailyRent;
const BANK_LOAN_AMOUNT = GAME_CONFIG.economy.bankLoan.amount;
const MAX_AP = GAME_CONFIG.day.maxAP;

const SAVE_DEBOUNCE_MS = 1000; // Debounce save calls by 1 second (only used for on-change autosave)

type AutosavePolicy = 'on-change' | 'end-of-day';

type CollectionConfig = {
  name: string;
  description: string;
  requiredTags: readonly string[];
  requiredCount: number;
  prestigeReward: number;
  icon: string;
};

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
  private readonly autosavePolicy: AutosavePolicy = 'end-of-day';

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
      claimedCollections: new Set<string>(), // Track completed collections (always initialized)
    };

    this.world = {
      day: 1,
      currentAP: MAX_AP,
      currentLocation: 'garage',
      carOfferByLocation: {},
      rivalPresenceByLocation: {},
      dayStats: {
        carsAcquired: 0,
        moneyEarned: 0,
        moneySpent: 0,
        prestigeGained: 0,
      },
    };
  }

  private resetDailyCarOffers(): void {
    this.world.carOfferByLocation = {};
  }

  private sanitizeDailyOfferMap(): void {
    const offerMap = this.world.carOfferByLocation;
    if (!offerMap || typeof offerMap !== 'object') {
      this.world.carOfferByLocation = {};
      return;
    }

    // Remove invalid entries and any garage key.
    for (const [locationId, offer] of Object.entries(offerMap)) {
      if (!locationId || locationId === 'garage') {
        delete offerMap[locationId];
        continue;
      }

      if (offer === null) continue;

      // Validate minimal Car shape; if invalid, delete key so it will reroll when accessed.
      const maybeCar = offer as Partial<Car> | undefined;
      const isValidCar =
        Boolean(maybeCar) &&
        typeof maybeCar === 'object' &&
        typeof maybeCar.id === 'string' &&
        typeof maybeCar.name === 'string' &&
        typeof maybeCar.baseValue === 'number' &&
        typeof maybeCar.condition === 'number' &&
        Array.isArray(maybeCar.tags) &&
        Array.isArray(maybeCar.history) &&
        typeof maybeCar.tier === 'string';

      if (!isValidCar) {
        delete offerMap[locationId];
      }
    }
  }

  private sanitizeDailyRivalPresenceMap(): void {
    const presenceMap = this.world.rivalPresenceByLocation;
    if (!presenceMap || typeof presenceMap !== 'object') {
      this.world.rivalPresenceByLocation = {};
      return;
    }

    for (const [locationId, present] of Object.entries(presenceMap)) {
      if (!locationId || locationId === 'garage') {
        delete presenceMap[locationId];
        continue;
      }

      if (typeof present !== 'boolean') {
        delete presenceMap[locationId];
      }
    }
  }

  private resetDailyRivalPresence(): void {
    this.world.rivalPresenceByLocation = {};
  }

  /**
   * Ensure daily car offers are rolled once per day for each location id.
   * Garage and special nodes should not be passed.
   */
  public ensureDailyCarOffersForLocations(locationIds: string[]): void {
    for (const locationId of locationIds) {
      if (!locationId || locationId === 'garage') continue;

      if (Object.prototype.hasOwnProperty.call(this.world.carOfferByLocation, locationId)) {
        continue;
      }

      this.world.carOfferByLocation[locationId] = getRandomCar();
    }
  }

  /**
   * Get the per-day car offer for a location.
   * If not yet rolled, it will roll and store a value.
   */
  public getDailyCarOfferForLocation(locationId: string): Car | null {
    if (!locationId || locationId === 'garage') return null;

    if (!Object.prototype.hasOwnProperty.call(this.world.carOfferByLocation, locationId)) {
      this.ensureDailyCarOffersForLocations([locationId]);
    }

    return this.world.carOfferByLocation[locationId] ?? null;
  }

  /**
   * Mark a location's daily offer as consumed (no more cars there today).
   */
  public consumeDailyCarOfferForLocation(locationId: string): void {
    if (!locationId || locationId === 'garage') return;
    if (!this.world.carOfferByLocation) {
      this.world.carOfferByLocation = {};
    }

    this.world.carOfferByLocation[locationId] = null;
    this.debouncedSave();
  }

  /**
   * Ensure rival presence is rolled once per day for each location id.
   * Garage and special nodes should not be passed.
   */
  public ensureRivalPresenceForLocations(locationIds: string[]): void {
    for (const locationId of locationIds) {
      if (!locationId) continue;
      if (Object.prototype.hasOwnProperty.call(this.world.rivalPresenceByLocation, locationId)) {
        continue;
      }
      this.world.rivalPresenceByLocation[locationId] =
        Math.random() < GAME_CONFIG.encounters.rivalPresenceChance;
    }
  }

  /**
   * Get rival presence for a location for the current day.
   * If not yet rolled, it will roll and store a value.
   */
  public hasRivalAtLocation(locationId: string): boolean {
    if (!locationId || locationId === 'garage') return false;

    if (!Object.prototype.hasOwnProperty.call(this.world.rivalPresenceByLocation, locationId)) {
      this.ensureRivalPresenceForLocations([locationId]);
    }

    return Boolean(this.world.rivalPresenceByLocation[locationId]);
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
  public getPlayerState(): DeepReadonly<PlayerState> {
    return this.player;
  }

  /**
   * Read-only snapshot of world state.
   * Treat returned objects as immutable.
   */
  public getWorldState(): DeepReadonly<WorldState> {
    return this.world;
  }

  /**
   * Add money to player and emit money-changed event.
   * @param amount - Amount to add (positive number)
   */
  public addMoney(amount: number): void {
    if (!Number.isFinite(amount) || amount === 0) return;
    if (amount < 0) {
      // Prefer spendMoney() for deductions; ignore here to prevent accidental exploits.
      console.warn('addMoney called with negative amount; ignoring.', amount);
      return;
    }
    this.player.money += amount;
    if (amount > 0) {
      this.world.dayStats.moneyEarned += amount;
    }
    eventBus.emit('money-changed', this.player.money);
    this.debouncedSave();
  }

  /**
   * Get current daily rent based on garage slots.
   * Rent scales with capacity via GAME_CONFIG.economy.rentByGarageSlots.
   */
  public getDailyRent(): number {
    const slots = this.player.garageSlots;
    const rentConfig = GAME_CONFIG.economy.rentByGarageSlots as Record<number, number>;
    return rentConfig[slots] || DAILY_RENT;
  }

  public getBankLoanAmount(): number {
    return BANK_LOAN_AMOUNT;
  }

  public canTakeBankLoan(): boolean {
    return !this.player.bankLoanTaken;
  }

  /**
   * Take a one-time bank loan.
   * This is an emergency cash injection.
   */
  public takeBankLoan(): boolean {
    if (!this.canTakeBankLoan()) return false;

    this.player.bankLoanTaken = true;
    this.player.money += BANK_LOAN_AMOUNT;
    eventBus.emit('money-changed', this.player.money);
    this.debouncedSave();
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
    this.world.dayStats.moneySpent += amount;
    eventBus.emit('money-changed', this.player.money);
    this.debouncedSave();
    return true;
  }

  /**
   * Apply daily rent (requires sufficient money).
   * @returns The amount paid.
   */
  private applyDailyRent(): number {
    const rent = this.getDailyRent();
    this.player.money -= rent;
    eventBus.emit('money-changed', this.player.money);
    return rent;
  }

  /**
   * Add prestige to player (cannot go below 0).
   * @param amount - Amount to add or subtract (can be negative)
   */
  public addPrestige(amount: number): void {
    if (!Number.isFinite(amount) || amount === 0) return;
    this.player.prestige = Math.max(0, this.player.prestige + amount);
    if (amount > 0) {
      this.world.dayStats.prestigeGained += amount;
    }
    eventBus.emit('prestige-changed', this.player.prestige);
    this.debouncedSave();
  }

  /**
   * Get the cost to upgrade to the next garage slot level.
   * @returns Cost in prestige points, or null if maxed out
   */
  public getNextGarageSlotCost(): number | null {
    const currentSlots = this.player.garageSlots;
    // Prestige progression for expanding storage (1->2, 2->3, ...).
    // Keep early upgrades familiar, then slow the ramp past 5 slots.
    const costs = [100, 200, 400, 800, 1000, 1200, 1400, 1600, 1800];
    const maxSlots = costs.length + 1;
    const costIndex = currentSlots - 1; // Current slots = 1 → index 0

    if (currentSlots >= maxSlots) return null;
    return costs[costIndex] ?? null;
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
   * Calculate daily prestige bonus from cars on display.
   * Quality tiers: 80-89% = 1 prestige, 90-99% = 2 prestige, 100% = 3 prestige
   * @returns Number of prestige points earned from cars on display
   */
  private calculateMuseumPrestigeBonus(): number {
    // Only count cars actively on display
    const museumCars = this.getMuseumCars();

    // Calculate prestige based on quality tiers
    let totalPrestige = 0;
    for (const car of museumCars) {
      if (car.condition >= 100) {
        totalPrestige += 3; // Perfect condition
      } else if (car.condition >= 90) {
        totalPrestige += 2; // Excellent condition
      } else {
        totalPrestige += 1; // Good condition (80-89%)
      }
    }

    return totalPrestige;
  }

  /**
   * Add car to inventory and emit inventory-changed event.
   * Enforces garage capacity - returns false if garage is full.
   * Also checks for collection completions and awards bonuses.
   * @param car - The car to add to inventory
   * @returns True if car was added, false if garage is full
   */
  public addCar(car: Car): boolean {
    if (!this.hasGarageSpace()) {
      return false;
    }

    // New cars always enter the garage first (not on display).
    car.displayInMuseum = false;
    this.player.inventory.push(car);
    this.world.dayStats.carsAcquired += 1;
    eventBus.emit('inventory-changed', this.player.inventory);
    
    // Check for collection completions
    this.checkNewCollectionCompletions();
    
    this.debouncedSave();
    return true;
  }

  /**
   * Get all cars currently in the garage (i.e., not on display).
   * Cars on display are still owned but do not consume garage slots.
   */
  public getGarageCars(): Car[] {
    return this.player.inventory.filter((car) => car.displayInMuseum !== true);
  }

  /**
   * Get the number of garage cars (not on display) currently occupying slots.
   */
  public getGarageCarCount(): number {
    return this.getGarageCars().length;
  }

  /**
   * Returns true if the player has at least one free garage slot.
   */
  public hasGarageSpace(): boolean {
    return this.getGarageCarCount() < this.player.garageSlots;
  }

  /**
   * Display capacity (gallery).
   * 
   * Current rule: display slots scale with garage slots (same number).
   * This keeps progression simple while still separating garage vs display storage.
   */
  public getMuseumSlots(): number {
    return this.player.garageSlots;
  }

  /**
   * Check if any new collections were just completed and award bonuses.
    * Collections are checked against full inventory, not just cars on display.
   * @private
   */
  private checkNewCollectionCompletions(): void {
    const collections: Record<string, CollectionConfig> = GAME_CONFIG.collections.sets;
    
    for (const [collectionId, collection] of Object.entries(collections)) {
      // Check against full inventory (not just display)
      const matchingCars = this.player.inventory.filter((car) =>
        collection.requiredTags.some((tag) => car.tags.includes(tag))
      );
      
      const isComplete = matchingCars.length >= collection.requiredCount;
      
      // Check if collection just completed
      if (isComplete && !this.hasCollectionBeenClaimed(collectionId)) {
        this.claimCollectionReward(collectionId, collection);
      }
    }
  }

  /**
   * Track claimed collections to avoid duplicate rewards.
   * Uses a Set stored in player state (added on-the-fly if missing).
   */
  private hasCollectionBeenClaimed(collectionId: string): boolean {
    // Initialize claimed collections set if it doesn't exist (for old saves)
    if (!this.player.claimedCollections) {
      this.player.claimedCollections = new Set<string>();
    }
    return this.player.claimedCollections.has(collectionId);
  }

  /**
   * Award collection completion bonus.
   */
  private claimCollectionReward(collectionId: string, collection: CollectionConfig): void {
    // Mark as claimed
    if (!this.player.claimedCollections) {
      this.player.claimedCollections = new Set<string>();
    }
    this.player.claimedCollections.add(collectionId);
    
    // Award prestige
    this.addPrestige(collection.prestigeReward);

    // Notify UI layer (scenes) to celebrate.
    eventBus.emit('collection-complete', {
      id: collectionId,
      name: collection.name,
      description: collection.description,
      icon: collection.icon,
      prestigeReward: collection.prestigeReward,
    });
  }

  /**
   * Get progress for a specific collection.
    * Collections track all inventory cars with matching tags, not just cars on display.
   * @param collectionId - The collection identifier from GAME_CONFIG
   * @returns Progress object with current count and completion status
   */
  public getCollectionProgress(collectionId: string): {
    current: number;
    required: number;
    isComplete: boolean;
    isClaimed: boolean;
    matchingCars: Car[];
  } {
    const collections: Record<string, CollectionConfig> = GAME_CONFIG.collections.sets;
    const collection = collections[collectionId];
    
    if (!collection) {
      return { current: 0, required: 0, isComplete: false, isClaimed: false, matchingCars: [] };
    }
    
    // Find all inventory cars that match the collection's required tags
    const matchingCars = this.player.inventory.filter((car) =>
      collection.requiredTags.some((tag) => car.tags.includes(tag))
    );
    
    const current = matchingCars.length;
    const required = collection.requiredCount;
    const isComplete = current >= required;
    const isClaimed = this.hasCollectionBeenClaimed(collectionId);
    
    return { current, required, isComplete, isClaimed, matchingCars };
  }

  /**
   * Get all collection progress data.
   * @returns Array of collection progress objects
   */
  public getAllCollectionsProgress(): Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
    current: number;
    required: number;
    isComplete: boolean;
    isClaimed: boolean;
    prestigeReward: number;
  }> {
    const collections: Record<string, CollectionConfig> = GAME_CONFIG.collections.sets;
    
    return Object.entries(collections).map(([id, collection]) => {
      const progress = this.getCollectionProgress(id);
      return {
        id,
        name: collection.name,
        description: collection.description,
        icon: collection.icon,
        current: progress.current,
        required: progress.required,
        isComplete: progress.isComplete,
        isClaimed: progress.isClaimed,
        prestigeReward: collection.prestigeReward,
      };
    });
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
    * Toggle on-display (gallery) status for a car.
    * Only cars with condition >= 80 can be displayed.
   * @param carId - The unique ID of the car
   * @returns Object with success flag and message
   */
  public toggleMuseumDisplay(carId: string): { success: boolean; message: string } {
    const car = this.player.inventory.find((c) => c.id === carId);
    if (!car) {
      return { success: false, message: 'Car not found' };
    }

    const currentlyDisplayed = car.displayInMuseum === true;

    if (!currentlyDisplayed && car.condition < 80) {
      return { success: false, message: 'Car must be in excellent condition (80%+) to put on display' };
    }

    if (!currentlyDisplayed) {
      // Moving Garage -> Display: enforce display capacity.
      const museumCount = this.getMuseumCars().length;
      if (museumCount >= this.getMuseumSlots()) {
        return {
          success: false,
          message: `Gallery is full (${museumCount}/${this.getMuseumSlots()} on display). Remove a car from display to make space.`,
        };
      }
      car.displayInMuseum = true;
    } else {
      // Moving Display -> Garage: enforce garage capacity.
      if (!this.hasGarageSpace()) {
        return {
          success: false,
          message: `Garage is full (${this.getGarageCarCount()}/${this.player.garageSlots} slots used). Sell a car or put another car on display before removing this one.`,
        };
      }
      car.displayInMuseum = false;
    }

    eventBus.emit('inventory-changed', this.player.inventory);
    this.debouncedSave(); // Auto-save on display status change

    const action = car.displayInMuseum ? 'added to' : 'removed from';
    return { success: true, message: `${car.name} ${action} display` };
  }

  /**
   * Check if a car is eligible to be put on display.
   * @param car - The car to check
   * @returns True if car meets display requirements (condition >= 80)
   */
  public isMuseumEligible(car: { condition: number }): boolean {
    return car.condition >= 80;
  }

  /**
   * Get all cars currently on display.
   * @returns Array of cars with displayInMuseum flag set
   */
  public getMuseumCars(): Car[] {
    return this.player.inventory.filter((car) => car.displayInMuseum === true);
  }

  /**
    * Get the quality tier for a displayed car.
   * @param condition - Car's condition percentage
   * @returns Object with tier name and prestige per day
   */
  public getMuseumQualityTier(condition: number): { tier: string; prestigePerDay: number; color: string } {
    if (condition >= 100) {
      return { tier: 'Perfect', prestigePerDay: 3, color: '#f39c12' };
    } else if (condition >= 90) {
      return { tier: 'Excellent', prestigePerDay: 2, color: '#3498db' };
    } else {
      return { tier: 'Good', prestigePerDay: 1, color: '#95a5a6' };
    }
  }

  /**
    * Get daily prestige information for the Gallery UI.
   * @returns Object with total daily prestige, car count, and breakdown by quality
   */
  public getMuseumIncomeInfo(): {
    totalPerDay: number;
    carCount: number;
    breakdown: { good: number; excellent: number; perfect: number };
  } {
    const museumCars = this.getMuseumCars();
    const breakdown = { good: 0, excellent: 0, perfect: 0 };
    let totalPerDay = 0;

    for (const car of museumCars) {
      if (car.condition >= 100) {
        breakdown.perfect += 1;
        totalPerDay += 3;
      } else if (car.condition >= 90) {
        breakdown.excellent += 1;
        totalPerDay += 2;
      } else {
        breakdown.good += 1;
        totalPerDay += 1;
      }
    }

    return {
      totalPerDay,
      carCount: museumCars.length,
      breakdown,
    };
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
   * Get current day statistics and reset for next day.
   * @returns Object with day stats before reset
   */
  public getDayStatsAndReset(): {
    carsAcquired: number;
    moneyEarned: number;
    moneySpent: number;
    prestigeGained: number;
    netMoney: number;
  } {
    const stats = { ...this.world.dayStats };
    const netMoney = stats.moneyEarned - stats.moneySpent;
    
    // Reset for next day
    this.world.dayStats = {
      carsAcquired: 0,
      moneyEarned: 0,
      moneySpent: 0,
      prestigeGained: 0,
    };
    
    return { ...stats, netMoney };
  }

  /**
   * Spend Action Points for an action.
   * @param cost - AP to spend
   */
  public spendAP(cost: number): void {
    if (!Number.isFinite(cost) || cost <= 0) {
      if (cost !== 0) {
        console.warn('spendAP called with non-positive/invalid cost; ignoring.', cost);
      }
      return;
    }
    this.world.currentAP = Math.max(0, this.world.currentAP - cost);
    eventBus.emit('ap-changed', this.world.currentAP);
    this.debouncedSave();
  }

  /**
   * End the current day and start the next day with fresh AP.
   * Applies daily rent (based on garage slots). If rent cannot be paid, the player is bankrupt.
   */
  public endDay(): EndDayResult {
    const rent = this.getDailyRent();
    if (this.player.money < rent) {
      return { bankrupt: true, requiredRent: rent };
    }

    this.world.day += 1;
    this.world.currentAP = MAX_AP;

    // New day: re-roll daily rival presence (but keep it stable within the day).
    this.resetDailyRivalPresence();

    // New day: re-roll per-location daily car offers.
    this.resetDailyCarOffers();

    const rentPaid = this.applyDailyRent();

    // Apply gallery prestige bonus
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
  public getCarMarketInfo(carTags: readonly string[]): { modifier: number; factors: string[] } {
    return this.marketSystem.getCarMarketInfo(carTags, this.world.day);
  }

  /**
   * Get market modifier for a car (used by economy system).
   */
  public getMarketModifier(carTags: readonly string[]): number {
    return this.marketSystem.getMarketModifier(carTags, this.world.day);
  }

  /**
   * Add XP to a skill and check for level-up.
   * Emits XP events for UI feedback with progress information.
   * @param skill - The skill to gain XP in
   * @param amount - Amount of XP to gain
   * @returns True if player leveled up
   */
  public addSkillXP(skill: SkillKey, amount: number): boolean {
    if (!Number.isFinite(amount) || amount <= 0) return false;
    const config = GAME_CONFIG.player.skillProgression;
    const currentLevel = this.player.skills[skill];
    
    // Max level reached
    if (currentLevel >= config.maxLevel) return false;

    this.player.skillXP[skill] += amount;
    const requiredXP = config.xpPerLevel[currentLevel]; // XP needed for NEXT level
    
    // Emit XP gain event with progress details for UI notification
    eventBus.emit('xp-gained', {
      skill,
      amount,
      currentXP: this.player.skillXP[skill],
      requiredXP,
      currentLevel,
    });

    // Check if leveled up
    if (this.player.skillXP[skill] >= requiredXP) {
      this.player.skills[skill] += 1;
      this.player.skillXP[skill] = 0; // Reset XP for next level
      eventBus.emit('skill-levelup', { skill, level: this.player.skills[skill] });
      this.debouncedSave();
      return true;
    }

    this.debouncedSave();
    return false;
  }

  /**
   * Get XP progress for a skill.
   * @returns Object with current XP and required XP for next level
   */
  public getSkillProgress(skill: SkillKey): { current: number; required: number; level: number } {
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
    
    // Award Network XP for discovering new location (addSkillXP emits xp-gained event)
    const networkXPGain = GAME_CONFIG.player.skillProgression.xpGains.travelNewLocation;
    this.addSkillXP('network', networkXPGain);

    // Ensure the new visited location persists even if XP is maxed.
    this.debouncedSave();

    return true; // First visit
  }

  /**
   * Check if player has met all victory conditions.
    * Victory requires: prestige threshold, Unicorn count on display, display quality, max skill.
   * @returns Victory result with breakdown of each condition
   */
  public checkVictory(): VictoryResult {
    const config = GAME_CONFIG.victory;
    
    // Check prestige
    const prestigeMet = this.player.prestige >= config.requiredPrestige;
    
    // Check Unicorn count on display
    const museumCars = this.getMuseumCars();
    const unicornCount = museumCars.filter(car => car.tier === 'Unicorn').length;
    const unicornsMet = unicornCount >= config.requiredUnicorns;
    
    // Check total cars on display
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
  public getActiveSpecialEvents(): SpecialEvent[] {
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
    if (this.autosavePolicy !== 'on-change') {
      if (this.saveDebounceTimer !== null) {
        clearTimeout(this.saveDebounceTimer);
        this.saveDebounceTimer = null;
      }
      return;
    }
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
      const saveData = buildSaveData({
        player: this.player,
        world: this.world,
        market: this.marketSystem.getState(),
        specialEvents: this.specialEventsSystem.getState(),
        tutorial: tutorialManager.getState(),
      });
      writeSaveData(saveData);
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
      const saveData: SavedGameData | null = readSaveData();
      if (!saveData) {
        // Could be no save, parse failure, or version mismatch.
        return false;
      }

      const hydrated = hydrateLoadedState(saveData);
      this.player = hydrated.player;
      this.world = hydrated.world;

      // Save hygiene: strip invalid or corrupted entries so the day can safely reroll them.
      this.sanitizeDailyRivalPresenceMap();
      this.sanitizeDailyOfferMap();

      // Load market state if available (backwards compatibility)
      if (hydrated.market) {
        this.marketSystem.loadState(hydrated.market);
      }

      // Load special events state if available (backwards compatibility)
      if (hydrated.specialEvents) {
        this.specialEventsSystem.loadState(hydrated.specialEvents);
      }

      // Load tutorial state if available (backwards compatibility)
      if (hydrated.tutorial) {
        const tutorialManager = TutorialManager.getInstance();
        tutorialManager.loadState(hydrated.tutorial);
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
