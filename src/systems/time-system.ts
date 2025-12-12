import { GameManager } from '@/core/game-manager';

/**
 * TimeSystem - Manages game time and day/night cycle.
 * Wraps GameManager time-related operations with helper methods.
 * Business hours: 8:00 AM - 8:00 PM (08:00 - 20:00)
 */
export class TimeSystem {
  private gameManager: GameManager;

  constructor() {
    this.gameManager = GameManager.getInstance();
  }

  /**
   * Advance time by specified hours.
   * Delegates to GameManager which handles day transitions and rent.
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
   * Check if it's business hours (8 AM - 8 PM).
   * @returns True if current time is between 08:00 and 20:00
   */
  public isBusinessHours(): boolean {
    const time = this.gameManager.getWorldState().timeOfDay;
    return time >= 8 && time < 20;
  }

  /**
   * Get time remaining in current day (until 20:00).
   * @returns Hours remaining until 8 PM
   */
  public getTimeRemainingInDay(): number {
    return 20 - this.gameManager.getWorldState().timeOfDay;
  }

  /**
   * Check if enough time remains for an action.
   * @param requiredHours - Hours needed for the action
   * @returns True if action can be completed before 8 PM
   */
  public hasEnoughTime(requiredHours: number): boolean {
    return this.getTimeRemainingInDay() >= requiredHours;
  }

  /**
   * End current day and start new day at 08:00.
   * Advances time to midnight, then to 8 AM next day.
   * Daily rent ($100) is automatically deducted by GameManager.
   */
  public endDay(): void {
    // Advance to next day at 08:00 without directly mutating world state.
    // (24 - timeOfDay) brings us to midnight; +8 brings us to 08:00 next day.
    const timeOfDay = this.gameManager.getWorldState().timeOfDay;
    const hoursToNextMorning = (24 - timeOfDay) + 8;
    this.advanceTime(hoursToNextMorning);
  }
}
