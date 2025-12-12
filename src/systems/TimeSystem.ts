import { GameManager } from '@/core/GameManager';
import { eventBus } from '@/core/EventBus';

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
    const time = this.gameManager.world.timeOfDay;
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
    return this.gameManager.world.day;
  }

  /**
   * Check if it's business hours (8 AM - 6 PM)
   */
  public isBusinessHours(): boolean {
    const time = this.gameManager.world.timeOfDay;
    return time >= 8 && time < 18;
  }

  /**
   * Get time remaining in day
   */
  public getTimeRemainingInDay(): number {
    return 24 - this.gameManager.world.timeOfDay;
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
    const hoursToMidnight = this.getTimeRemainingInDay();
    this.advanceTime(hoursToMidnight);
    
    // Reset to morning
    if (this.gameManager.world.timeOfDay > 0) {
      this.gameManager.world.timeOfDay = 8;
    }
    
    eventBus.emit('day-ended', this.getCurrentDay());
  }
}
