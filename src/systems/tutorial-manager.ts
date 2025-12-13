import { eventBus } from '@/core/event-bus';

/**
 * Tutorial step identifiers.
 * Tracks player progression through the tutorial sequence.
 */
export type TutorialStep = 
  | 'intro'
  | 'first_visit_scrapyard'
  | 'first_inspect'
  | 'first_buy'
  | 'first_restore'
  | 'first_flip'
  | 'first_loss'
  | 'redemption'
  | 'complete';

/**
 * TutorialManager - Singleton managing tutorial progression.
 * Tracks tutorial state and triggers appropriate dialogue/guidance.
 * Tutorial follows the script defined in game-design.instructions.md.
 */
export class TutorialManager {
  private static instance: TutorialManager;
  private currentStep: TutorialStep = 'intro';
  private isActive: boolean = false;

  private constructor() {}

  public static getInstance(): TutorialManager {
    if (!TutorialManager.instance) {
      TutorialManager.instance = new TutorialManager();
    }
    return TutorialManager.instance;
  }

  /**
   * Start the tutorial from the beginning.
   * Sets state to active and shows intro dialogue.
   */
  public startTutorial(): void {
    this.isActive = true;
    this.currentStep = 'intro';
    console.log('Tutorial started');
    // Trigger intro dialogue
    this.showDialogue("Uncle Ray", "Welcome to the garage, kid. It's a dump, but it's ours. Let's get you started in the car collecting business.");
  }

  /**
   * Advance to the next tutorial step.
   * Only advances if tutorial is active.
   * Triggers step-specific dialogue/actions.
   * @param step - The tutorial step to advance to
   */
  public advanceStep(step: TutorialStep): void {
    if (!this.isActive) return;
    this.currentStep = step;
    console.log(`Tutorial advanced to: ${step}`);
    
    // Per-step dialogue/actions live here.
    // Note: only a subset of steps have bespoke behavior today.
    switch (step) {
      case 'first_visit_scrapyard':
        this.showDialogue("Uncle Ray", "Click the 'Go to Map' button below, then click on 'Joe's Scrapyard' to find your first car. It costs 1 hour to travel there.");
        break;
      default:
        break;
    }
  }

  /**
   * Show tutorial dialogue to the player.
   * Emits show-dialogue event for UI to handle.
   * @param speaker - Name of the character speaking
   * @param text - Dialogue text to display
   */
  private showDialogue(speaker: string, text: string): void {
    // Emit event for UI to handle
    eventBus.emit('show-dialogue', { speaker, text });
  }

  /**
   * Check if tutorial is currently active.
   * @returns True if tutorial is running
   */
  public isTutorialActive(): boolean {
    return this.isActive;
  }

  /**
   * Get the current tutorial step.
   * @returns The active tutorial step identifier
   */
  public getCurrentStep(): TutorialStep {
    return this.currentStep;
  }
}
