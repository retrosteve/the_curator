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

export type TutorialSideAction = 'end-day' | 'upgrade-garage' | 'sell-car';

export type TutorialHighlightTarget =
  | 'garage.explore-map'
  | 'garage.view-garage'
  | 'garage.back'
  | 'garage.restore'
  | 'map.location.garage'
  | 'map.location.scrapyard_1'
  | 'map.location.auction_1'
  | 'negotiation.accept-offer'
  | 'auction.power-bid';

/**
 * TutorialManager - Singleton managing tutorial progression.
 * Tracks tutorial state and triggers appropriate dialogue/guidance.
 * Tutorial follows the script defined in docs/game-design.md.
 * Tutorial UI is emitted via EventBus events and rendered by the scene/UI layer.
 * Tutorial dialogues are visually distinct and positioned separately from game modals.
 */
export class TutorialManager {
  private static instance: TutorialManager;
  private currentStep: TutorialStep = 'intro';
  private isActive: boolean = false;

  // ---- Step-set helpers (reduce step-string conditionals in scenes) ----

  public isTutorialComplete(): boolean {
    return this.currentStep === 'complete';
  }

  public isOnFirstVisitScrapyardStep(): boolean {
    return this.isActive && this.currentStep === 'first_visit_scrapyard';
  }

  public isOnFirstInspectStep(): boolean {
    return this.isActive && this.currentStep === 'first_inspect';
  }

  public isOnFirstLossStep(): boolean {
    return this.isActive && this.currentStep === 'first_loss';
  }

  public isOnRedemptionStep(): boolean {
    return this.isActive && this.currentStep === 'redemption';
  }

  /**
   * Scrapyard loop covers the pre-purchase beats of the first car.
   * Used for deterministic tutorial encounter forcing and soft-lock prevention.
   */
  public isInScrapyardTutorialLoop(): boolean {
    if (!this.isActive) return false;
    return (
      this.currentStep === 'first_visit_scrapyard' ||
      this.currentStep === 'first_inspect'
    );
  }

  /**
   * Early scrapyard beat before the first car is successfully purchased.
   * Used to avoid consuming the daily offer when backing out (prevents a soft-lock).
   */
  public isInEarlyScrapyardBeatBeforePurchase(): boolean {
    if (!this.isActive) return false;
    return (
      this.currentStep === 'first_visit_scrapyard' ||
      this.currentStep === 'first_inspect'
    );
  }

  /**
   * The Sterling encounter is driven from the Auction House node during the first flip beat.
   */
  public isInSterlingAuctionIntroBeat(): boolean {
    return this.isActive && this.currentStep === 'first_flip';
  }

  /**
   * Tutorial: first restoration should be deterministic (ignore risk).
   */
  public shouldForceFirstRestorationSuccess(): boolean {
    return this.isActive && this.currentStep === 'first_buy';
  }

  /**
   * Tutorial: after the first restoration, auto-sell the first car.
   */
  public shouldAutoSellAfterFirstRestoration(): boolean {
    return this.isActive && this.currentStep === 'first_restore';
  }

  public getHighlightTargetsForCurrentStep(): TutorialHighlightTarget[] {
    if (!this.isActive) return [];

    switch (this.currentStep) {
      case 'first_visit_scrapyard':
        // Highlight scrapyard on the map if present; otherwise guide the player to the map.
        return ['map.location.scrapyard_1', 'garage.explore-map', 'garage.back'];
      case 'first_inspect':
        // If the player backs out of negotiation, keep guiding them back to Joe's Scrapyard.
        return [
          'negotiation.accept-offer',
          'map.location.scrapyard_1',
          'garage.explore-map',
          'garage.back',
        ];
      case 'first_buy':
        // Player should restore the first car; if they're still on the map, highlight returning home.
        return ['garage.restore', 'garage.view-garage', 'map.location.garage', 'garage.back'];
      case 'first_restore':
        // The flip is driven by the scripted NPC buyer modal.
        return [];
      case 'first_flip':
        // Prefer highlighting the actual destination if the player is already on the Map.
        // Otherwise, fall back to the Garage's Explore Map button.
        return ['map.location.auction_1', 'garage.explore-map', 'garage.back'];
      case 'redemption':
        // If the player backs out of the auction, guide them back to the Auction House.
        return ['auction.power-bid', 'map.location.auction_1', 'garage.explore-map', 'garage.back'];
      case 'intro':
      case 'first_loss':
      case 'complete':
      default:
        return [];
    }
  }

  /**
   * Tutorial-only map gating.
   * Returns null when no map restriction should be applied.
   */
  public getAllowedMapLocationIds(): ReadonlySet<string> | null {
    if (!this.isActive) return null;

    switch (this.currentStep) {
      // Early loop: only the scrapyard path is relevant.
      case 'first_visit_scrapyard':
      case 'first_inspect':
        return new Set(['garage', 'scrapyard_1']);

      // After purchasing the first car, funnel the player back to the Garage to restore it.
      case 'first_buy':
      case 'first_restore':
        return new Set(['garage']);

      // Auction beat: funnel to the estate sale / auction house.
      case 'first_flip':
      case 'first_loss':
      case 'redemption':
        return new Set(['garage', 'auction_1']);

      case 'intro':
      case 'complete':
      default:
        return null;
    }
  }

  /**
   * Tutorial safety: allow Auction House access even if the Prestige gate isn't met yet.
   */
  public shouldBypassAuctionPrestigeLock(): boolean {
    if (!this.isActive) return false;
    return this.currentStep === 'first_flip' || this.currentStep === 'first_loss' || this.currentStep === 'redemption';
  }

  /**
   * Returns whether the player is allowed to perform optional/side actions.
   * During the tutorial we intentionally constrain the player to the scripted loop.
   */
  public isSideActionAllowed(action: TutorialSideAction): boolean {
    if (!this.isActive) return true;
    if (this.currentStep === 'complete') return true;

    switch (action) {
      case 'end-day':
        // Allow ending the day at any time during the tutorial.
        // This prevents AP-burning deviations (e.g., leaving encounters) from soft-locking progress.
        return true;
      case 'upgrade-garage':
      case 'sell-car':
        return false;
      default:
        return true;
    }
  }

  public getSideActionBlockedMessage(action: TutorialSideAction): string {
    switch (action) {
      case 'end-day':
        return 'Finish the tutorial steps before ending the day, or skip the tutorial if you want to play freely.';
      case 'upgrade-garage':
        return 'Garage upgrades are disabled during the tutorial. Finish or skip the tutorial to upgrade.';
      case 'sell-car':
        return 'Selling cars is disabled during the tutorial. Finish or skip the tutorial to sell freely.';
      default:
        return 'This action is disabled during the tutorial.';
    }
  }

  // ---- Intent-level step transitions (keeps scene code from directly naming steps everywhere) ----

  public onEnteredFirstScrapyardInspection(): void {
    if (!this.isActive) return;
    if (this.currentStep === 'first_visit_scrapyard') {
      this.advanceStep('first_inspect');
    }
  }

  public onFirstTutorialCarPurchased(): void {
    if (!this.isActive) return;
    if (this.currentStep === 'first_inspect') {
      this.advanceStep('first_buy');
    }
  }

  public onFirstTutorialRestorationCompleted(): void {
    if (!this.isActive) return;
    if (this.currentStep === 'first_buy') {
      this.advanceStep('first_restore');
    }
  }

  public onFirstTutorialCarSold(): void {
    if (!this.isActive) return;
    if (this.currentStep === 'first_restore') {
      this.advanceStep('first_flip');
    }
  }

  public onSterlingEncounterStarted(): void {
    if (!this.isActive) return;
    if (this.currentStep === 'first_flip') {
      // This step represents the "defeat beat" (Sterling encounter), even though the auction outcome may vary.
      this.advanceStep('first_loss');
    }
  }

  public onRedemptionPromptAccepted(): void {
    if (!this.isActive) return;
    if (this.currentStep === 'first_loss') {
      this.advanceStep('redemption');
    }
  }

  public onTutorialCompleted(): void {
    if (!this.isActive) return;
    this.advanceStep('complete');
  }

  private constructor() {
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

  /**
   * Request the skip tutorial prompt.
   * UI is handled elsewhere; this only emits an event when appropriate.
   */
  public requestSkipTutorialPrompt(): void {
    if (!this.isActive || this.currentStep === 'complete') return;
    this.showSkipTutorialPrompt();
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

    // Emit highlight target(s) for this step (UI will highlight the first one it finds).
    eventBus.emit('tutorial-highlight-changed', { targets: [...this.getHighlightTargetsForCurrentStep()] });
    
    // Per-step dialogue/actions according to design document
    switch (step) {
      case 'first_visit_scrapyard':
        this.showDialogue(
          "Uncle Ray",
          "Now click \"Explore Map\", then select \"Joe's Scrapyard\" to find your first car. Exploring costs Action Points, so keep an eye on your AP."
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
        eventBus.emit('tutorial-highlight-changed', { targets: [] });
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

    // Refresh UI hinting after loading.
    eventBus.emit('tutorial-highlight-changed', { targets: [...this.getHighlightTargetsForCurrentStep()] });
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
    eventBus.emit('tutorial-highlight-changed', { targets: [] });
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
    eventBus.emit('tutorial-highlight-changed', { targets: [] });
    console.log('Tutorial reset to initial state');
  }
}
