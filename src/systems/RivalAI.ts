import { Rival, BidDecision, getRivalBidDecision } from '@/data/RivalDatabase';

/**
 * RivalAI - Manages rival behavior during auctions
 */
export class RivalAI {
  private rival: Rival;
  private carInterest: number;
  private currentPatience: number;
  private currentBudget: number;

  constructor(rival: Rival, carInterest: number) {
    this.rival = { ...rival };
    this.carInterest = carInterest;
    this.currentPatience = rival.patience;
    this.currentBudget = rival.budget;
  }

  /**
   * Get rival's decision on whether to bid
   */
  public decideBid(currentBid: number): BidDecision {
    // Update patience based on strategy
    this.updatePatience();

    // Get decision from database function
    const decision = getRivalBidDecision(
      { ...this.rival, patience: this.currentPatience, budget: this.currentBudget },
      currentBid,
      this.carInterest
    );

    return decision;
  }

  /**
   * Update patience level based on strategy
   */
  private updatePatience(): void {
    switch (this.rival.strategy) {
      case 'Aggressive':
        this.currentPatience -= 15;
        break;
      case 'Passive':
        this.currentPatience -= 5;
        break;
      case 'Collector':
        // Collectors lose less patience for cars they want
        this.currentPatience -= this.carInterest > 70 ? 5 : 10;
        break;
    }

    this.currentPatience = Math.max(0, this.currentPatience);
  }

  /**
   * React to player stall action
   */
  public onPlayerStall(): void {
    this.currentPatience -= 20;
    this.currentPatience = Math.max(0, this.currentPatience);
  }

  /**
   * React to player power bid (reduces rival patience)
   */
  public onPlayerPowerBid(): void {
    this.currentPatience -= 20;
    this.currentPatience = Math.max(0, this.currentPatience);
  }

  /**
   * React to player kick tires (reduces rival budget)
   */
  public onPlayerKickTires(amount: number): void {
    this.currentBudget -= amount;
    this.currentBudget = Math.max(0, this.currentBudget);
  }

  /**
   * Get current patience level
   */
  public getPatience(): number {
    return this.currentPatience;
  }

  /**
   * Get current rival budget
   */
  public getBudget(): number {
    return this.currentBudget;
  }

  /**
   * Get rival info
   */
  public getRival(): Rival {
    return this.rival;
  }
}
