import { EndDayResult, GameManager } from '@/core/game-manager';

/**
 * TimeSystem - Manages day/night cycle and day transitions.
 */
export class TimeSystem {
  private gameManager: GameManager;

  constructor() {
    this.gameManager = GameManager.getInstance();
  }

  /**
   * Get current day number.
   * @returns Current day (starts at 1)
   */
  public getCurrentDay(): number {
    return this.gameManager.getWorldState().day;
  }

  /**
   * End current day and start a new day.
   * Daily rent (GAME_CONFIG.economy.dailyRent) is applied during the transition.
   */
  public endDay(): EndDayResult {
    return this.gameManager.endDay();
  }
}
