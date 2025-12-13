import { EndDayResult, GameManager } from '@/core/game-manager';
import { GAME_CONFIG } from '@/config/game-config';

/**
 * TimeSystem - Manages game time and day/night cycle.
 * Wraps GameManager time-related operations with helper methods.
 * Business hours are defined in GAME_CONFIG.day.
 */
export class TimeSystem {
  private gameManager: GameManager;

  constructor() {
    this.gameManager = GameManager.getInstance();
  }

  /**
   * Advance time by specified hours.
   * Delegates to GameManager.
   * @param hours - Hours to advance (can be fractional)
   */
  public advanceTime(hours: number): void {
    this.gameManager.advanceTime(hours);
  }

  /**
   * Get current time of day formatted as 12-hour clock.
   * @returns Formatted time string (e.g., '3:30 PM')
   */
  public getFormattedTime(): string {
    const time = this.gameManager.getWorldState().timeOfDay;
    const hours = Math.floor(time);
    const minutes = Math.floor((time - hours) * 60);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }

  /**
   * Get current day number.
   * @returns Current day (starts at 1)
   */
  public getCurrentDay(): number {
    return this.gameManager.getWorldState().day;
  }

  /**
    * Check if it's business hours.
    * @returns True if current time is between GAME_CONFIG.day.startHour and GAME_CONFIG.day.endHour
   */
  public isBusinessHours(): boolean {
    const time = this.gameManager.getWorldState().timeOfDay;
    return time >= GAME_CONFIG.day.startHour && time < GAME_CONFIG.day.endHour;
  }

  /**
    * Get time remaining in current day (until business day end).
    * @returns Hours remaining until GAME_CONFIG.day.endHour
   */
  public getTimeRemainingInDay(): number {
    const remaining = GAME_CONFIG.day.endHour - this.gameManager.getWorldState().timeOfDay;
    return Math.max(0, remaining);
  }

  /**
   * Check if enough time remains for an action.
   * @param requiredHours - Hours needed for the action
    * @returns True if action can be completed before GAME_CONFIG.day.endHour
   */
  public hasEnoughTime(requiredHours: number): boolean {
    return this.getTimeRemainingInDay() >= requiredHours;
  }

  /**
   * Build a consistent modal title/message when an action would exceed business hours.
   * Returns null when enough time remains.
   */
  public getTimeBlockModal(
    requiredHours: number,
    actionLabel: string
  ): { title: string; message: string } | null {
    const hoursLeft = this.getTimeRemainingInDay();
    if (hoursLeft >= requiredHours) return null;

    const currentTime = this.getFormattedTime();

    if (hoursLeft === 0) {
      return {
        title: 'Day Ending Soon',
        message: `It's ${currentTime} - the business day has ended.\n\nReturn to the garage to end your day.`,
      };
    }

    const hoursLeftLabel = `${hoursLeft.toFixed(1)} hour${hoursLeft !== 1 ? 's' : ''}`;
    const requiredLabel = `${requiredHours} hour${requiredHours !== 1 ? 's' : ''}`;

    return {
      title: 'Day Ending Soon',
      message: `You only have ${hoursLeftLabel} left today, but ${actionLabel} requires ${requiredLabel}.\n\nReturn to the garage to end your day.`,
    };
  }

  /**
   * End current day and start new day at GAME_CONFIG.day.startHour.
   * Daily rent (GAME_CONFIG.economy.dailyRent) is applied during the transition.
   */
  public endDay(): EndDayResult {
    return this.gameManager.endDay();
  }
}
