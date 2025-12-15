import { Rival, BidDecision, getRivalBidDecision, getMoodModifiers } from '@/data/rival-database';
import { GAME_CONFIG } from '@/config/game-config';

/**
 * RivalAI - Manages rival behavior during auctions.
 * Tracks dynamic state (patience, budget) and makes bidding decisions.
 * Patience and budget decrease based on player actions and strategy.
 */
export class RivalAI {
  private rival: Rival;
  private carInterest: number;
  private currentPatience: number;
  private currentBudget: number;

  constructor(rival: Rival, carInterest: number) {
    this.rival = { ...rival };
    this.carInterest = carInterest;
    
    // Apply mood modifiers to starting values
    const moodModifiers = rival.mood ? getMoodModifiers(rival.mood) : { patienceMultiplier: 1, budgetMultiplier: 1 };
    
    this.currentPatience = Math.floor(rival.patience * moodModifiers.patienceMultiplier);
    this.currentBudget = Math.floor(rival.budget * moodModifiers.budgetMultiplier);
  }

  /**
   * Get rival's decision on whether to bid and how much.
   * @param currentBid - Current auction bid amount
   * @returns Bid decision with shouldBid flag, amount, and reason
   */
  public decideBid(currentBid: number): BidDecision {
    // Get decision from database function
    const decision = getRivalBidDecision(
      { ...this.rival, patience: this.currentPatience, budget: this.currentBudget },
      currentBid,
      this.carInterest
    );

    // Update patience based on strategy AFTER decision (for next turn)
    this.updatePatience();

    return decision;
  }

  /**
   * Update patience level based on strategy (called each turn).
   * Aggressive: -15, Passive: -5, Collector: -5 (high interest) or -10 (low interest)
   * Patience is capped at 0 minimum.
   */
  private updatePatience(): void {
    switch (this.rival.strategy) {
      case 'Aggressive':
        this.currentPatience -= GAME_CONFIG.rivalAI.patienceLossPerTurn.aggressive;
        break;
      case 'Passive':
        this.currentPatience -= GAME_CONFIG.rivalAI.patienceLossPerTurn.passive;
        break;
      case 'Collector':
        // Collectors lose less patience for cars they want
        this.currentPatience -=
          this.carInterest > GAME_CONFIG.rivalAI.collectorHighInterestThreshold
            ? GAME_CONFIG.rivalAI.patienceLossPerTurn.collectorHighInterest
            : GAME_CONFIG.rivalAI.patienceLossPerTurn.collectorLowInterest;
        break;
    }

    this.currentPatience = Math.max(0, this.currentPatience);
  }

  /**
   * React to player stall action by reducing patience.
   * Reduces patience by 20 points.
   */
  public onPlayerStall(): void {
    this.currentPatience -= GAME_CONFIG.auction.stallPatiencePenalty;
    this.currentPatience = Math.max(0, this.currentPatience);
  }

  /**
   * React to player power bid by reducing patience.
   * Reduces patience by 20 points.
   */
  public onPlayerPowerBid(): void {
    this.currentPatience -= GAME_CONFIG.auction.powerBidPatiencePenalty;
    this.currentPatience = Math.max(0, this.currentPatience);
  }

  /**
   * React to player kick tires action by reducing budget.
   * @param amount - Amount to reduce rival's available budget by
   */
  public onPlayerKickTires(amount: number): void {
    this.currentBudget -= amount;
    this.currentBudget = Math.max(0, this.currentBudget);
  }

  /**
   * Get current patience level.
   * @returns Current patience (0-100)
   */
  public getPatience(): number {
    return this.currentPatience;
  }

  /**
   * Get current rival budget.
   * @returns Current available budget
   */
  public getBudget(): number {
    return this.currentBudget;
  }

  /**
   * Get rival info (static properties).
   * @returns The rival's base configuration
   */
  public getRival(): Rival {
    return this.rival;
  }
}
