import { UIManager } from '@/ui/ui-manager';

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
 * Tutorial follows the script defined in docs/game-design.md.
 * Tutorial dialogues use a dedicated UI system separate from game modals.
 */
export class TutorialManager {
  private static instance: TutorialManager;
  private currentStep: TutorialStep = 'intro';
  private isActive: boolean = false;
  private uiManager: UIManager;

  private constructor() {
    this.uiManager = UIManager.getInstance();
  }

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
    // Trigger intro dialogue with callback to advance to next step
    this.showDialogueWithCallback(
      "Uncle Ray", 
      "Welcome to the garage, kid. It's a dump, but it's ours. Let's get you started in the car collecting business.",
      () => this.advanceStep('first_visit_scrapyard')
    );
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
    
    // Per-step dialogue/actions according to design document
    switch (step) {
      case 'first_visit_scrapyard':
        this.showDialogue(
          "Uncle Ray",
          "Now click the 'Go to Map' button, then click on 'Joe's Scrapyard' to find your first car. Traveling costs 1 hour."
        );
        break;
      
      case 'first_inspect':
        this.showDialogue(
          "Uncle Ray",
          "This is a Rusty Sedan. Use your Eye skill to inspect it - look for issues like bald tires. If the price is right, buy it for around $1,500."
        );
        break;
      
      case 'first_buy':
        this.showDialogue(
          "Uncle Ray",
          "Good purchase! Click 'Inventory' in the garage to see your new car, then restore it to increase its value."
        );
        break;
      
      case 'first_restore':
        this.showDialogue(
          "Uncle Ray",
          "Great! The car's condition improved. Now let's flip it for profit - an NPC buyer is interested and will make you an offer."
        );
        break;
      
      case 'first_flip':
        // No dialogue here - the flip happens automatically via NPC buyer
        // Next dialogue comes when player goes back to map and encounters Sterling
        break;
      
      case 'first_loss':
        this.showDialogue(
          "Sterling Vance",
          "*smirks* Sorry kid, but this Muscle Car is mine. You'll need more than just money to beat me in a bidding war. Watch and learn."
        );
        break;
      
      case 'redemption':
        this.showDialogue(
          "Uncle Ray",
          "Don't let that loss get you down! Look - there's another car here nobody else noticed: a Boxy Wagon. This time you're facing a weaker rival. Use aggressive tactics like Power Bid to make them quit early!"
        );
        break;
      
      case 'complete':
        this.showDialogue(
          "Uncle Ray",
          "🎉 Congratulations! 🎉\n\nYou've mastered the basics of car collecting:\n• Inspecting cars with your Eye skill\n• Restoring cars to increase value\n• Bidding strategically in auctions\n• Reading rival behavior\n\nNow go build the world's greatest car museum! Remember: every car tells a story, and you're the curator."
        );
        this.isActive = false; // End tutorial
        eventBus.emit('tutorial-complete'); // Emit completion event
        break;
      
      default:
        break;
    }
  }

  /**
   * Show tutorial dialogue to the player.
   * Displays in dedicated tutorial UI separate from game modals.
   * @param speaker - Name of the character speaking
   * @param text - Dialogue text to display
   */
  private showDialogue(speaker: string, text: string): void {
    this.uiManager.showTutorialDialogue(speaker, text);
  }

  /**
   * Show tutorial dialogue with a callback when dismissed.
   * @param speaker - Name of the character speaking
   * @param text - Dialogue text to display
   * @param onDismiss - Callback to execute when dialogue is dismissed
   */
  private showDialogueWithCallback(speaker: string, text: string, onDismiss: () => void): void {
    this.uiManager.showTutorialDialogue(speaker, text, onDismiss);
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

  /**
   * Check if the tutorial is active and on a specific step.
   * Convenience method to reduce boilerplate in scenes.
   * @param step - The tutorial step to check
   * @returns True if tutorial is active and on the specified step
   */
  public isCurrentStep(step: TutorialStep): boolean {
    return this.isActive && this.currentStep === step;
  }

  /**
   * Get tutorial state for saving.
   * @returns Object with tutorial state
   */
  public getState(): { currentStep: TutorialStep; isActive: boolean } {
    return {
      currentStep: this.currentStep,
      isActive: this.isActive,
    };
  }

  /**
   * Load tutorial state from save.
   * @param state - Saved tutorial state
   */
  public loadState(state: { currentStep: TutorialStep; isActive: boolean }): void {
    this.currentStep = state.currentStep;
    this.isActive = state.isActive;
    console.log(`Tutorial state loaded: step=${state.currentStep}, active=${state.isActive}`);
  }

  /**
   * Hide the current tutorial dialogue.
   */
  public hideTutorialDialogue(): void {
    this.uiManager.hideTutorialDialogue();
  }

  /**
   * Complete the tutorial (called manually or when reaching 'complete' step).
   */
  public completeTutorial(): void {
    this.isActive = false;
    this.currentStep = 'complete';
    this.hideTutorialDialogue();
    console.log('Tutorial completed');
  }
}
