import { GameManager } from '@/core/game-manager';

/**
 * TimeSystem - Manages game time and day/night cycle
 */
export class TimeSystem {
  private gameManager: GameManager;

  constructor() {
    this.gameManager = GameManager.getInstance();
  }

  /**
   * Advance time by specified hours
   */
  public advanceTime(hours: number): void {
    this.gameManager.advanceTime(hours);
  }

  /**
   * Get current time of day formatted
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
   * Get current day
   */
  public getCurrentDay(): number {
    return this.gameManager.getWorldState().day;
  }

  /**
   * Check if it's business hours (8 AM - 8 PM)
   */
  public isBusinessHours(): boolean {
    const time = this.gameManager.getWorldState().timeOfDay;
    return time >= 8 && time < 20;
  }

  /**
   * Get time remaining in day (until 20:00)
   */
  public getTimeRemainingInDay(): number {
    return 20 - this.gameManager.getWorldState().timeOfDay;
  }

  /**
   * Check if enough time for action
   */
  public hasEnoughTime(requiredHours: number): boolean {
    return this.getTimeRemainingInDay() >= requiredHours;
  }

  /**
   * End current day and start new day
   */
  public endDay(): void {
    // Advance to next day at 08:00 without directly mutating world state.
    // (24 - timeOfDay) brings us to midnight; +8 brings us to 08:00 next day.
    const timeOfDay = this.gameManager.getWorldState().timeOfDay;
    const hoursToNextMorning = (24 - timeOfDay) + 8;
    this.advanceTime(hoursToNextMorning);
  }
}
