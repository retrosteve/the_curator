import { eventBus } from '@/core/event-bus';

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

  public startTutorial(): void {
    this.isActive = true;
    this.currentStep = 'intro';
    console.log('Tutorial started');
    // Trigger intro dialogue
    this.showDialogue("Uncle Ray", "Welcome to the garage, kid. It's a dump, but it's ours. Let's get you started.");
  }

  public advanceStep(step: TutorialStep): void {
    if (!this.isActive) return;
    this.currentStep = step;
    console.log(`Tutorial advanced to: ${step}`);
    
    // Per-step dialogue/actions live here.
    // Note: only a subset of steps have bespoke behavior today.
    switch (step) {
      case 'first_visit_scrapyard':
        this.showDialogue("Uncle Ray", "Head over to Joe's Scrapyard. I heard he has a rusty sedan that might run.");
        break;
      default:
        break;
    }
  }

  private showDialogue(speaker: string, text: string): void {
    // Emit event for UI to handle
    eventBus.emit('show-dialogue', { speaker, text });
  }

  public isTutorialActive(): boolean {
    return this.isActive;
  }

  public getCurrentStep(): TutorialStep {
    return this.currentStep;
  }
}
