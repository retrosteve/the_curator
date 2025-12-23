import { Car, getRandomCar } from '@/data/car-database';
import { eventBus } from './event-bus';
import { MarketFluctuationSystem } from '@/systems/market-fluctuation-system';
import { SpecialEventsSystem } from '@/systems/special-events-system';
import { TutorialManager } from '@/systems/tutorial-manager';
import { GAME_CONFIG } from '@/config/game-config';
import type { SpecialEvent } from '@/systems/special-events-system';
import type { SkillKey } from '@/config/game-config';
import type { DeepReadonly } from '@/utils/types';
import { debugLog, errorLog, warnLog } from '@/utils/log';
import { DebouncedSaver } from '@/core/internal/debounced-saver';
import { readAndHydrateCurrentGameSave, writeCurrentGameSave } from '@/core/internal/save-load';
import {
  calculateCollectionPrestigeBonus as calculateCollectionPrestigeBonusInternal,
  getCollectionCarsFromInventory,
  getCollectionPrestigeInfo as getCollectionPrestigeInfoInternal,
  getCollectionQualityTier as getCollectionQualityTierInternal,
  getGarageCarsFromInventory,
  getNewlyCompletedSetIds,
  getSetProgress as getSetProgressInternal,
} from '@/core/internal/collection-sets';
import {
  consumeDailyCarOfferForLocation as consumeDailyCarOfferForLocationInternal,
  ensureDailyCarOffersForLocations as ensureDailyCarOffersForLocationsInternal,
  ensureRivalPresenceForLocations as ensureRivalPresenceForLocationsInternal,
  hasRivalAtLocation as hasRivalAtLocationInternal,
  resetDailyCarOffers as resetDailyCarOffersInternal,
  resetDailyRivalPresence as resetDailyRivalPresenceInternal,
  sanitizeDailyOfferMap as sanitizeDailyOfferMapInternal,
  sanitizeDailyRivalPresenceMap as sanitizeDailyRivalPresenceMapInternal,
} from '@/core/internal/daily-rolls';
import {
  calculatePrestonLoanTerms,
  calculateTotalDue,
  canRepayLoan,
  canTakeBankLoan as canTakeBankLoanInternal,
  canTakePrestonLoan as canTakePrestonLoanInternal,
} from '@/core/internal/finance-loans';
import {
  computeXPAward,
  getRequiredXPForNextLevel,
  isMaxLevel,
  isValidXPGain,
} from '@/core/internal/skill-progression';
import { decideToggleCollectionStatus } from '@/core/internal/inventory-collection';
import { removeCarById, replaceCarById } from '@/core/internal/inventory-mutations';
import { cloneCar, cloneInventory, clonePlayerState, cloneWorldState } from '@/core/internal/state-clone';
import type {
  AutosavePolicy,
  EndDayResult,
  FinanceLoan,
  PlayerState,
  SetConfig,
  VictoryResult,
  WorldState,
} from '@/core/game-types';

export type {
  AutosavePolicy,
  EndDayResult,
  FinanceLoan,
  PlayerState,
  SetConfig,
  VictoryResult,
  WorldState,
} from '@/core/game-types';


const DAILY_RENT = GAME_CONFIG.economy.dailyRent;
const BANK_LOAN_AMOUNT = GAME_CONFIG.economy.bankLoan.amount;
const PRESTON_LOAN_AMOUNT = GAME_CONFIG.economy.finance.prestonLoan.amount;
const PRESTON_LOAN_FEE_RATE = GAME_CONFIG.economy.finance.prestonLoan.feeRate;
const MAX_AP = GAME_CONFIG.day.maxAP;

const SAVE_DEBOUNCE_MS = 1000; // Debounce save calls by 1 second (only used for on-change autosave)

// (types moved to `src/core/game-types.ts`)

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
  private readonly autosavePolicy: AutosavePolicy = GAME_CONFIG.save.autosavePolicy;
  private readonly saver: DebouncedSaver;

  private constructor() {
    this.marketSystem = MarketFluctuationSystem.getInstance();
    this.specialEventsSystem = SpecialEventsSystem.getInstance();
    this.saver = new DebouncedSaver(() => this.save(), this.autosavePolicy, SAVE_DEBOUNCE_MS);

    // Try to load saved game first
    if (!this.load()) {
      // Initialize default state if no save or load failed
      this.initializeDefaultState();
    }
  }

  private ensureSaveCompatPlayerState(): void {
    // Backwards compatibility: old saves may be missing these Set fields.
    this.player.visitedLocations ??= new Set(['garage']);
    this.player.claimedSets ??= new Set<string>();
  }

  private emitMoneyChanged(): void {
    eventBus.emit('money-changed', this.player.money);
  }

  private emitPrestigeChanged(): void {
    eventBus.emit('prestige-changed', this.player.prestige);
  }

  private emitInventoryChanged(): void {
    eventBus.emit('inventory-changed', cloneInventory(this.player.inventory));
  }

  private emitAPChanged(): void {
    eventBus.emit('ap-changed', this.world.currentAP);
  }

  private emitDayChanged(): void {
    eventBus.emit('day-changed', this.world.day);
  }

  private emitLocationChanged(location: string): void {
    eventBus.emit('location-changed', location);
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
      activeLoan: null,
      skills: { ...GAME_CONFIG.player.startingSkills },
      skillXP: { eye: 0, tongue: 0, network: 0 },
      visitedLocations: new Set(['garage']), // Start with garage as visited
      claimedSets: new Set<string>(), // Track completed sets (always initialized)
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
    this.world.carOfferByLocation = resetDailyCarOffersInternal();
  }

  private sanitizeDailyOfferMap(): void {
    this.world.carOfferByLocation = sanitizeDailyOfferMapInternal(this.world.carOfferByLocation);
  }

  private sanitizeDailyRivalPresenceMap(): void {
    this.world.rivalPresenceByLocation = sanitizeDailyRivalPresenceMapInternal(this.world.rivalPresenceByLocation);
  }

  private resetDailyRivalPresence(): void {
    this.world.rivalPresenceByLocation = resetDailyRivalPresenceInternal();
  }

  /**
   * Ensure daily car offers are rolled once per day for each location id.
   * Garage and special nodes should not be passed.
   */
  public ensureDailyCarOffersForLocations(locationIds: string[]): void {
    ensureDailyCarOffersForLocationsInternal({
      offerMap: this.world.carOfferByLocation,
      locationIds,
      rollCar: () => getRandomCar(),
    });
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

    const offer = this.world.carOfferByLocation[locationId] ?? null;
    return offer ? cloneCar(offer) : null;
  }

  /**
   * Mark a location's daily offer as consumed (no more cars there today).
   */
  public consumeDailyCarOfferForLocation(locationId: string): void {
    if (!locationId || locationId === 'garage') return;

    consumeDailyCarOfferForLocationInternal({
      offerMap: this.world.carOfferByLocation,
      locationId,
    });
    this.debouncedSave();
  }

  /**
   * Ensure rival presence is rolled once per day for each location id.
   * Garage and special nodes should not be passed.
   */
  public ensureRivalPresenceForLocations(locationIds: string[]): void {
    ensureRivalPresenceForLocationsInternal({
      presenceMap: this.world.rivalPresenceByLocation,
      locationIds,
      rollIsPresent: () => Math.random() < GAME_CONFIG.encounters.rivalPresenceChance,
    });
  }

  /**
   * Get rival presence for a location for the current day.
   * If not yet rolled, it will roll and store a value.
   */
  public hasRivalAtLocation(locationId: string): boolean {
    return hasRivalAtLocationInternal({
      presenceMap: this.world.rivalPresenceByLocation,
      locationId,
      rollIsPresent: () => Math.random() < GAME_CONFIG.encounters.rivalPresenceChance,
    });
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
    return clonePlayerState(this.player);
  }

  /**
   * Read-only snapshot of world state.
   * Treat returned objects as immutable.
   */
  public getWorldState(): DeepReadonly<WorldState> {
    return cloneWorldState(this.world);
  }

  /**
   * Add money to player and emit money-changed event.
   * @param amount - Amount to add (positive number)
   */
  public addMoney(amount: number): void {
    if (!Number.isFinite(amount) || amount === 0) return;
    if (amount < 0) {
      // Prefer spendMoney() for deductions; ignore here to prevent accidental exploits.
      warnLog('addMoney called with negative amount; ignoring.', amount);
      return;
    }
    this.player.money += amount;
    if (amount > 0) {
      this.world.dayStats.moneyEarned += amount;
    }
    this.emitMoneyChanged();
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
    return canTakeBankLoanInternal(this.player);
  }

  /**
   * Take a one-time bank loan.
   * This is an emergency cash injection.
   */
  public takeBankLoan(): boolean {
    if (!this.canTakeBankLoan()) return false;

    this.player.bankLoanTaken = true;
    this.player.money += BANK_LOAN_AMOUNT;
    this.emitMoneyChanged();
    this.debouncedSave({ critical: true });
    return true;
  }

  public getActiveLoan(): DeepReadonly<FinanceLoan | null> {
    return this.player.activeLoan ? { ...this.player.activeLoan } : null;
  }

  public canTakePrestonLoan(): boolean {
    return canTakePrestonLoanInternal(this.player);
  }

  public getPrestonLoanTerms(): { principal: number; fee: number; totalDue: number } {
    return calculatePrestonLoanTerms({ principal: PRESTON_LOAN_AMOUNT, feeRate: PRESTON_LOAN_FEE_RATE });
  }

  public takePrestonLoan(): { ok: true; loan: FinanceLoan } | { ok: false; reason: string } {
    if (!this.canTakePrestonLoan()) {
      return { ok: false, reason: 'You already have an active loan.' };
    }

    const terms = this.getPrestonLoanTerms();
    const loan: FinanceLoan = {
      lenderName: 'Preston Banks',
      principal: terms.principal,
      fee: terms.fee,
      takenDay: this.world.day,
    };

    this.player.activeLoan = loan;
    // Do not count as “money earned” in day stats.
    this.player.money += terms.principal;
    this.emitMoneyChanged();
    this.debouncedSave({ critical: true });

    return { ok: true, loan };
  }

  public repayActiveLoan():
    | { ok: true; totalPaid: number }
    | { ok: false; reason: string; totalDue: number } {
    const loan = this.player.activeLoan;
    if (!loan) {
      return { ok: false, reason: 'No active loan to repay.', totalDue: 0 };
    }

    const totalDue = calculateTotalDue(loan);
    if (!canRepayLoan(this.player, loan)) {
      return { ok: false, reason: 'Not enough money to repay the loan.', totalDue };
    }

    // Do not count as “money spent” in day stats.
    this.player.money -= totalDue;
    this.player.activeLoan = null;
    this.emitMoneyChanged();
    this.debouncedSave({ critical: true });

    return { ok: true, totalPaid: totalDue };
  }

  /**
   * Attempt to spend money.
   * @param amount - Amount to spend (positive number)
   * @returns True if transaction succeeded, false if insufficient funds
   */
  public spendMoney(amount: number): boolean {
    if (!Number.isFinite(amount)) {
      warnLog('spendMoney called with invalid amount; rejecting.', amount);
      return false;
    }
    if (amount <= 0) return true;
    if (this.player.money < amount) return false;

    this.player.money -= amount;
    this.world.dayStats.moneySpent += amount;
    this.emitMoneyChanged();
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
    this.emitMoneyChanged();
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
    this.emitPrestigeChanged();
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
    this.emitPrestigeChanged();
    this.debouncedSave({ critical: true });
    return true;
  }

  /**
   * Calculate daily prestige bonus from cars in the private collection.
   * Quality tiers: 80-89% = 1 prestige, 90-99% = 2 prestige, 100% = 3 prestige
   * @returns Number of prestige points earned from the collection
   */
  private calculateCollectionPrestigeBonus(): number {
    // Only count cars currently in the private collection.
    // Note: getCollectionCars() returns cloned cars; compute prestige off clones to keep behavior unchanged.
    return calculateCollectionPrestigeBonusInternal(this.getCollectionCars());
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

    // New cars always enter the garage first (not in the collection).
    // Clone at the boundary to avoid external references mutating internal state.
    const storedCar: Car = {
      ...cloneCar(car),
      inCollection: false,
    };
    this.player.inventory.push(storedCar);
    this.world.dayStats.carsAcquired += 1;
    this.emitInventoryChanged();
    
    // Check for set completions
    this.checkNewSetCompletions();
    
    this.debouncedSave({ critical: true });
    return true;
  }

  /**
   * Get all cars currently in the garage (i.e., not in the collection).
   * Cars in the collection are still owned but do not consume garage slots.
   */
  public getGarageCars(): Car[] {
    return getGarageCarsFromInventory(this.player.inventory).map((car) => cloneCar(car));
  }

  /**
   * Get the number of garage cars (not in the collection) currently occupying slots.
   */
  public getGarageCarCount(): number {
    return getGarageCarsFromInventory(this.player.inventory).length;
  }

  /**
   * Returns true if the player has at least one free garage slot.
   */
  public hasGarageSpace(): boolean {
    return this.getGarageCarCount() < this.player.garageSlots;
  }

  /**
   * Collection capacity.
   * 
   * Current rule: collection capacity scales with garage slots (same number).
   * This keeps progression simple while still separating garage vs collection storage.
   */
  public getCollectionSlots(): number {
    return this.player.garageSlots;
  }

  /**
   * Check if any new sets were just completed and award bonuses.
   * Sets are checked against full inventory, not just cars in the private collection.
   * @private
   */
  private checkNewSetCompletions(): void {
    const sets = GAME_CONFIG.sets as Record<string, SetConfig>;
    const newlyCompleted = getNewlyCompletedSetIds({
      sets,
      inventory: this.player.inventory,
      claimedSets: this.getClaimedSets(),
    });

    for (const setId of newlyCompleted) {
      const set = sets[setId];
      if (!set) continue;
      this.claimSetReward(setId, set);
    }
  }

  private getClaimedSets(): Set<string> {
    this.player.claimedSets ??= new Set<string>();
    return this.player.claimedSets;
  }

  private getVisitedLocations(): Set<string> {
    this.player.visitedLocations ??= new Set(['garage']);
    return this.player.visitedLocations;
  }

  /**
   * Track claimed sets to avoid duplicate rewards.
   * Uses a Set stored in player state (added on-the-fly if missing).
   */
  private hasSetBeenClaimed(setId: string): boolean {
    return this.getClaimedSets().has(setId);
  }

  /**
   * Award set completion bonus.
   */
  private claimSetReward(setId: string, set: SetConfig): void {
    // Mark as claimed
    this.getClaimedSets().add(setId);
    
    // Award prestige
    this.addPrestige(set.prestigeReward);

    // Notify UI layer (scenes) to celebrate.
    eventBus.emit('set-complete', {
      id: setId,
      name: set.name,
      description: set.description,
      icon: set.icon,
      prestigeReward: set.prestigeReward,
    });
  }

  /**
   * Get progress for a specific set.
   * Sets track all inventory cars with matching tags, not just cars in the private collection.
   * @param setId - The set identifier from GAME_CONFIG
   * @returns Progress object with current count and completion status
   */
  public getSetProgress(setId: string): {
    current: number;
    required: number;
    isComplete: boolean;
    isClaimed: boolean;
    matchingCars: Car[];
  } {
    const sets = GAME_CONFIG.sets as Record<string, SetConfig>;
    const set = sets[setId];
    
    if (!set) {
      return { current: 0, required: 0, isComplete: false, isClaimed: false, matchingCars: [] };
    }

    return getSetProgressInternal({
      set,
      inventory: this.player.inventory,
      isClaimed: this.hasSetBeenClaimed(setId),
    });
  }

  /**
   * Get all set progress data.
   * @returns Array of set progress objects
   */
  public getAllSetsProgress(): Array<{
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
    const sets = GAME_CONFIG.sets as Record<string, SetConfig>;

    return Object.entries(sets).map(([id, set]) => {
      const progress = this.getSetProgress(id);
      return {
        id,
        name: set.name,
        description: set.description,
        icon: set.icon,
        current: progress.current,
        required: progress.required,
        isComplete: progress.isComplete,
        isClaimed: progress.isClaimed,
        prestigeReward: set.prestigeReward,
      };
    });
  }

  /**
   * Replace an existing car in inventory (matched by id).
   * @param updatedCar - The car with updated properties
   * @returns True if car was found and updated, false otherwise
   */
  public updateCar(updatedCar: Car): boolean {
    const updated = replaceCarById({
      inventory: this.player.inventory,
      updatedCar,
    });
    if (!updated) return false;

    this.emitInventoryChanged();
    this.debouncedSave({ critical: true });
    return true;
  }

  /**
   * Toggle collection status for a car.
   * Only cars with condition >= 80 can be added.
   * @param carId - The unique ID of the car
   * @returns Object with success flag and message
   */
  public toggleCollectionStatus(carId: string): { success: boolean; message: string } {
    const car = this.player.inventory.find((c) => c.id === carId);
    if (!car) {
      return { success: false, message: 'Car not found' };
    }

    const currentlyInCollection = car.inCollection === true;

    const collectionCount = getCollectionCarsFromInventory(this.player.inventory).length;
    const garageCarCount = getGarageCarsFromInventory(this.player.inventory).length;
    const collectionSlots = this.getCollectionSlots();
    const garageSlots = this.player.garageSlots;

    const decision = decideToggleCollectionStatus({
      car,
      currentlyInCollection,
      collectionCount,
      collectionSlots,
      garageCarCount,
      garageSlots,
    });

    if (!decision.ok) {
      return { success: false, message: decision.message };
    }

    car.inCollection = decision.nextInCollection;

    this.emitInventoryChanged();
    this.debouncedSave({ critical: true });

    const action = car.inCollection ? 'added to' : 'removed from';
    return { success: true, message: `${car.name} ${action} collection` };
  }

  /**
   * Check if a car is eligible to be added to the collection.
   * @param car - The car to check
   * @returns True if car meets collection requirements (condition >= 80)
   */
  public isCollectionEligible(car: { condition: number }): boolean {
    return car.condition >= 80;
  }

  /**
   * Get all cars currently in the collection.
   * @returns Array of cars with inCollection flag set
   */
  public getCollectionCars(): Car[] {
    return getCollectionCarsFromInventory(this.player.inventory).map((car) => cloneCar(car));
  }

  /**
   * Get the quality tier for a collection-eligible car.
   * @param condition - Car's condition percentage
   * @returns Object with tier name and prestige per day
   */
  public getCollectionQualityTier(condition: number): { tier: string; prestigePerDay: number; color: string } {
    const tier = getCollectionQualityTierInternal(condition);
    return { tier: tier.tier, prestigePerDay: tier.prestigePerDay, color: tier.color };
  }

  /**
   * Get daily prestige information for the Collection UI.
   * @returns Object with total daily prestige, car count, and breakdown by quality
   */
  public getCollectionPrestigeInfo(): {
    totalPerDay: number;
    carCount: number;
    breakdown: { good: number; excellent: number; perfect: number };
  } {
    return getCollectionPrestigeInfoInternal(this.getCollectionCars());
  }

  /**
   * Remove car from inventory by ID.
   * @param carId - The unique ID of the car to remove
   * @returns True if car was found and removed, false otherwise
   */
  public removeCar(carId: string): boolean {
    const removed = removeCarById(this.player.inventory, carId);
    if (!removed) return false;

    this.emitInventoryChanged();
    this.debouncedSave({ critical: true });
    return true;
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
        warnLog('spendAP called with non-positive/invalid cost; ignoring.', cost);
      }
      return;
    }
    this.world.currentAP = Math.max(0, this.world.currentAP - cost);
    this.emitAPChanged();
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

    // Apply collection prestige bonus
    const collectionBonus = this.calculateCollectionPrestigeBonus();
    if (collectionBonus > 0) {
      this.addPrestige(collectionBonus);
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

    this.emitDayChanged();
    this.emitAPChanged();

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
    const config = GAME_CONFIG.player.skillProgression;
    const currentLevel = this.player.skills[skill];
    
    // Max level reached
    if (!isValidXPGain(amount) || isMaxLevel(config, currentLevel)) return false;

    const requiredXP = getRequiredXPForNextLevel(config, currentLevel); // XP needed for NEXT level
    const { newXP, shouldLevelUp } = computeXPAward({
      currentXP: this.player.skillXP[skill],
      amount,
      requiredXP,
    });

    this.player.skillXP[skill] = newXP;
    
    // Emit XP gain event with progress details for UI notification
    eventBus.emit('xp-gained', {
      skill,
      amount,
      currentXP: this.player.skillXP[skill],
      requiredXP,
      currentLevel,
    });

    // Check if leveled up
    if (shouldLevelUp) {
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
    const requiredXP = getRequiredXPForNextLevel(config, level);

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
    const visitedLocations = this.getVisitedLocations();

    if (visitedLocations.has(locationId)) {
      return false; // Already visited
    }

    visitedLocations.add(locationId);
    
    // Award Network XP for discovering new location (addSkillXP emits xp-gained event)
    const networkXPGain = GAME_CONFIG.player.skillProgression.xpGains.travelNewLocation;
    this.addSkillXP('network', networkXPGain);

    // Ensure the new visited location persists even if XP is maxed.
    this.debouncedSave();

    return true; // First visit
  }

  /**
   * Check if player has met all victory conditions.
   * Victory requires: prestige threshold, Unicorn count in collection, collection quality, max skill.
   * @returns Victory result with breakdown of each condition
   */
  public checkVictory(): VictoryResult {
    const config = GAME_CONFIG.victory;
    
    // Check prestige
    const prestigeMet = this.player.prestige >= config.requiredPrestige;
    
    // Check Unicorn count in collection
    const collectionCars = this.getCollectionCars();
    const unicornCount = collectionCars.filter(car => car.tier === 'Unicorn').length;
    const unicornsMet = unicornCount >= config.requiredUnicorns;
    
    // Check total cars in collection
    const collectionCarsMet = collectionCars.length >= config.requiredCollectionCars;
    
    // Check skill level (at least one skill at max)
    const maxSkill = Math.max(
      this.player.skills.eye,
      this.player.skills.tongue,
      this.player.skills.network
    );
    const skillMet = maxSkill >= config.requiredSkillLevel;
    
    const hasWon = prestigeMet && unicornsMet && collectionCarsMet && skillMet;
    
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
      collectionCars: {
        current: collectionCars.length,
        required: config.requiredCollectionCars,
        met: collectionCarsMet,
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
    this.emitLocationChanged(location);
  }

  /**
   * Get a copy of a car from inventory by ID.
   * Returns a copy to prevent unintended mutations.
   * @param carId - The unique ID of the car
   * @returns A copy of the car if found, undefined otherwise
   */
  public getCar(carId: string): Car | undefined {
    const car = this.player.inventory.find((c) => c.id === carId);
    return car ? cloneCar(car) : undefined;
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
  private debouncedSave(options?: { critical?: boolean }): void {
    this.saver.requestSave(options);
  }

  /**
   * Save current game state to localStorage.
   * @returns True if save succeeded, false otherwise
   */
  public save(): boolean {
    try {
      const tutorialManager = TutorialManager.getInstance();
      writeCurrentGameSave({
        player: this.player,
        world: this.world,
        market: this.marketSystem.getState(),
        specialEvents: this.specialEventsSystem.getState(),
        tutorial: tutorialManager.getState(),
      });
      debugLog('Game saved successfully');
      return true;
    } catch (error) {
      errorLog('Failed to save game:', error);
      return false;
    }
  }

  /**
   * Load game state from localStorage.
   * @returns True if load succeeded, false otherwise
   */
  public load(): boolean {
    try {
      const loaded = readAndHydrateCurrentGameSave();
      if (!loaded) {
        // Could be no save, parse failure, or version mismatch.
        return false;
      }

      this.player = loaded.player;
      this.world = loaded.world;

      this.ensureSaveCompatPlayerState();

      // Save hygiene: strip invalid or corrupted entries so the day can safely reroll them.
      this.sanitizeDailyRivalPresenceMap();
      this.sanitizeDailyOfferMap();

      // Load market state if available (backwards compatibility)
      if (loaded.market) {
        this.marketSystem.loadState(loaded.market);
      }

      // Load special events state if available (backwards compatibility)
      if (loaded.specialEvents) {
        this.specialEventsSystem.loadState(loaded.specialEvents);
      }

      // Load tutorial state if available (backwards compatibility)
      if (loaded.tutorial) {
        const tutorialManager = TutorialManager.getInstance();
        tutorialManager.loadState(loaded.tutorial);

        // Save-load reconciliation: if the tutorial is stuck on redemption but the player already
        // owns the Boxy Wagon, silently complete the tutorial so the map doesn't force re-entry.
        if (tutorialManager.isOnRedemptionStep()) {
          const alreadyOwnsBoxyWagon = this.player.inventory.some((car) => car.id === 'car_tutorial_boxy_wagon');
          if (alreadyOwnsBoxyWagon) {
            tutorialManager.completeTutorial();
          }
        }
      }

      debugLog('Game loaded successfully');
      return true;
    } catch (error) {
      errorLog('Failed to load game:', error);
      return false;
    }
  }

  /**
   * Emit all state-changed events.
   * Useful after loading a save or resetting the game.
   * Ensures UI is synchronized with current state.
   */
  public emitAllStateEvents(): void {
    this.emitMoneyChanged();
    this.emitPrestigeChanged();
    this.emitInventoryChanged();
    this.emitDayChanged();
    this.emitAPChanged();
    this.emitLocationChanged(this.world.currentLocation);
  }
}
