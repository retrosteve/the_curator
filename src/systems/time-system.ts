import { EndDayResult, GameManager } from '@/core/game-manager';
import { GAME_CONFIG } from '@/config/game-config';

/**
 * TimeSystem - Manages action points and day/night cycle.
 * Each day starts with a fresh pool of Action Points (AP).
 * Days advance for seasonal/market tracking when AP runs out.
 */
export class TimeSystem {
  private gameManager: GameManager;

  constructor() {
    this.gameManager = GameManager.getInstance();
  }

  /**
   * Spend Action Points for an action.
   * Delegates to GameManager which tracks AP internally.
   * @param cost - Action Points to spend
   */
  public spendAP(cost: number): void {
    this.gameManager.spendAP(cost);
  }

  /**
   * Get current Action Points remaining.
   * @returns AP remaining (0 to maxAP)
   */
  public getCurrentAP(): number {
    return this.gameManager.getWorldState().currentAP;
  }

  /**
   * Get maximum Action Points per day.
   * @returns Max AP from config
   */
  public getMaxAP(): number {
    return GAME_CONFIG.day.maxAP;
  }

  /**
   * Get formatted AP display string.
   * @returns Formatted string (e.g., '7/10 AP')
   */
  public getFormattedAP(): string {
    return `${this.getCurrentAP()}/${this.getMaxAP()} AP`;
  }

  /**
   * Get current day number.
   * @returns Current day (starts at 1)
   */
  public getCurrentDay(): number {
    return this.gameManager.getWorldState().day;
  }

  /**
   * Check if there are any Action Points remaining.
   * @returns True if currentAP > 0
   */
  public hasAPRemaining(): boolean {
    return this.getCurrentAP() > 0;
  }

  /**
   * Get Action Points remaining.
   * @returns AP remaining (0 to maxAP)
   */
  public getAPRemaining(): number {
    return this.getCurrentAP();
  }

  /**
   * Check if enough AP remains for an action.
   * @param required - AP needed for the action
   * @returns True if enough AP available
   */
  public hasEnoughAP(required: number): boolean {
    return this.getCurrentAP() >= required;
  }

  /**
   * Build a consistent modal title/message when insufficient AP for an action.
   * Returns null when enough AP remains.
   */
  public getAPBlockModal(
    required: number,
    actionLabel: string
  ): { title: string; message: string } | null {
    const apLeft = this.getCurrentAP();
    if (apLeft >= required) return null;

    if (apLeft === 0) {
      return {
        title: 'Day Complete',
        message: `You're out of Action Points for today.\n\nReturn to the garage to end your day and start fresh tomorrow.`,
      };
    }

    const apLabel = `${apLeft} AP`;
    const requiredLabel = `${required} AP`;

    return {
      title: 'Not Enough AP',
      message: `You only have ${apLabel} left today, but ${actionLabel} requires ${requiredLabel}.\n\nReturn to the garage to end your day.`,
    };
  }

  /**
   * End current day and start new day with fresh Action Points.
   * Daily rent (GAME_CONFIG.economy.dailyRent) is applied during the transition.
   */
  public endDay(): EndDayResult {
    return this.gameManager.endDay();
  }
}
