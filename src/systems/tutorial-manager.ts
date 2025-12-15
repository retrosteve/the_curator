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
 * Tutorial follows the script defined in docs/game-design.md.
 * Tutorial dialogues use a dedicated UI system separate from game modals.
 */
export class TutorialManager {
  private static instance: TutorialManager;
  private currentStep: TutorialStep = 'intro';
  private isActive: boolean = false;

  private constructor() {
    this.setupKeyboardListener();
  }

  /**
   * Setup ESC key listener to skip tutorial.
   */
  private setupKeyboardListener(): void {
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isActive && this.currentStep !== 'complete') {
        this.showSkipTutorialPrompt();
      }
    });
  }

  /**
   * Show prompt to confirm skipping tutorial.
   */
  private showSkipTutorialPrompt(): void {
    eventBus.emit('tutorial-skip-prompt', {
      onSkip: () => {
        this.completeTutorial();
        console.log('Tutorial skipped by user');
      },
      onContinue: () => {},
    });
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
   * Does nothing if tutorial has already been started or completed.
   */
  public startTutorial(): void {
    // Prevent restarting if already active or completed
    if (this.isActive || this.currentStep !== 'intro') {
      console.log('Tutorial already started or completed, skipping restart');
      return;
    }
    
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
    
    // Emit event so scenes can react to step changes
    eventBus.emit('tutorial-step-changed', { step });
    
    // Per-step dialogue/actions according to design document
    switch (step) {
      case 'first_visit_scrapyard':
        this.showDialogue(
          "Uncle Ray",
          "Now click the 'Explore Map' button, then click on 'Joe's Scrapyard' to find your first car. Traveling costs 1 Action Point."
        );
        break;
      
      case 'first_inspect':
        this.showDialogue(
          "Uncle Ray",
          "You're now inspecting this Rusty Sedan. Your Eye skill (currently level 1) shows you the basics - condition is 30%, which is pretty rough. At higher levels, you'll see hidden damage details. The asking price should be under $400 for a car this beat up. Go ahead and accept if that matches."
        );
        break;
      
      case 'first_buy':
        // Dialogue shown in NegotiationScene before scene transition
        break;
      
      case 'first_restore':
        this.showDialogue(
          "Uncle Ray",
          "Great! The car's condition improved. Notice the Victory Progress tracker in your HUD showing your path to becoming a master curator. Also watch that daily rent - it increases when you upgrade your garage! Now let's flip this car for profit - an NPC buyer is interested."
        );
        break;
      
      case 'first_flip':
        // No dialogue here - the flip happens automatically via NPC buyer
        // Next dialogue comes when player goes back to map and encounters Sterling
        break;
      
      case 'first_loss':
        // Dialogue already shown in MapScene before auction starts
        // This step tracks that the player has been introduced to Sterling
        break;
      
      case 'redemption':
        // Dialogue shown in AuctionScene after first_loss before starting second auction
        break;
      
      case 'complete':
        // Dialogue shown in AuctionScene before scene transition
        this.isActive = false; // End tutorial
        eventBus.emit('tutorial-complete', undefined); // Emit completion event
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
    eventBus.emit('tutorial-dialogue-show', { speaker, text });
  }

  /**
   * Show tutorial dialogue with a callback when dismissed.
   * @param speaker - Name of the character speaking
   * @param text - Dialogue text to display
   * @param onDismiss - Callback to execute when dialogue is dismissed
   */
  public showDialogueWithCallback(speaker: string, text: string, onDismiss: () => void): void {
    eventBus.emit('tutorial-dialogue-show', { speaker, text, onDismiss });
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
    eventBus.emit('tutorial-dialogue-hide', undefined);
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

  /**
   * Reset tutorial to initial state.
   * Called when starting a new game.
   */
  public reset(): void {
    this.currentStep = 'intro';
    this.isActive = false;
    this.hideTutorialDialogue();
    console.log('Tutorial reset to initial state');
  }
}
