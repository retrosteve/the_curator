import Phaser from 'phaser';
import { GameManager } from '@/core/game-manager';
import { UIManager } from '@/ui/ui-manager';
import { TimeSystem } from '@/systems/time-system';
import { TutorialManager } from '@/systems/tutorial-manager';
import { eventBus } from '@/core/event-bus';
import type { SkillKey } from '@/config/game-config';

/**
 * BaseGameScene - Abstract base class for all gameplay scenes.
 * Provides common event handlers, managers, and setup patterns.
 * Eliminates code duplication across Garage, Map, Auction, and Negotiation scenes.
 */
export abstract class BaseGameScene extends Phaser.Scene {
  protected gameManager!: GameManager;
  protected uiManager!: UIManager;
  protected timeSystem!: TimeSystem;
  protected tutorialManager!: TutorialManager;
  protected cachedHUD?: HTMLElement; // Cache HUD to avoid recreation

  // Shared event handlers for HUD updates
  protected readonly handleMoneyChanged = (money: number): void => {
    this.uiManager.updateHUD({ money });
  };

  protected readonly handlePrestigeChanged = (prestige: number): void => {
    this.uiManager.updateHUD({ prestige });
  };

  protected readonly handleAPChanged = (_currentAP: number): void => {
    this.uiManager.updateHUD({ ap: this.timeSystem.getFormattedAP() });
  };

  protected readonly handleDayChanged = (day: number): void => {
    this.uiManager.updateHUD({ day });
  };

  protected readonly handleLocationChanged = (location: string): void => {
    this.uiManager.updateHUD({ location });
  };

  protected readonly handleEscapeKey = (): void => {
    if (!this.tutorialManager.isTutorialActive()) return;
    if (this.tutorialManager.getCurrentStep() === 'complete') return;
    this.tutorialManager.requestSkipTutorialPrompt();
  };

  /**
   * Initialize common managers used by all gameplay scenes.
   * Call this in your scene's create() method before setupBackground() and setupUI().
   * @param locationKey - The location identifier for this scene (e.g., 'garage', 'map')
   */
  protected initializeManagers(locationKey: string): void {
    this.gameManager = GameManager.getInstance();
    this.gameManager.setLocation(locationKey);
    this.uiManager = UIManager.getInstance();
    this.timeSystem = new TimeSystem();
    this.tutorialManager = TutorialManager.getInstance();
  }

  /**
    * Setup common event listeners for HUD updates and cross-scene UI notifications.
   * Call this in your scene's create() method after setupUI().
   * Automatically cleans up on scene shutdown.
   */
  protected setupCommonEventListeners(): void {
    eventBus.on('money-changed', this.handleMoneyChanged);
    eventBus.on('prestige-changed', this.handlePrestigeChanged);
    eventBus.on('ap-changed', this.handleAPChanged);
    eventBus.on('day-changed', this.handleDayChanged);
    eventBus.on('location-changed', this.handleLocationChanged);
    
    // XP gain and level-up notifications
    eventBus.on('xp-gained', this.handleXPGained);
    eventBus.on('skill-levelup', this.handleSkillLevelUp);
    eventBus.on('collection-complete', this.handleCollectionComplete);
    eventBus.on('tutorial-dialogue-show', this.handleTutorialDialogueShow);
    eventBus.on('tutorial-dialogue-hide', this.handleTutorialDialogueHide);
    eventBus.on('tutorial-skip-prompt', this.handleTutorialSkipPrompt);

    this.input.keyboard?.on('keydown-ESC', this.handleEscapeKey);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanupCommonEventListeners();
    });
  }
  
  /**
   * Handle XP gained event - show toast notification.
   */
  protected readonly handleXPGained = (data: {
    skill: SkillKey;
    amount: number;
    currentXP?: number;
    requiredXP?: number;
    currentLevel?: number;
  }): void => {
    this.uiManager.showXPGain(
      data.skill,
      data.amount,
      data.currentXP,
      data.requiredXP,
      data.currentLevel
    );
  };
  
  /**
   * Handle skill level-up event - show celebration modal.
   */
  protected readonly handleSkillLevelUp = (data: {
    skill: SkillKey;
    level: number;
  }): void => {
    this.uiManager.showSkillLevelUp(data.skill, data.level);
  };

  protected readonly handleCollectionComplete = (data: {
    id: string;
    name: string;
    description: string;
    icon: string;
    prestigeReward: number;
  }): void => {
    this.uiManager.showModal(
      `${data.icon} Set Complete!`,
      `${data.name}\n${data.description}\n\n+${data.prestigeReward} Prestige Awarded!`,
      [{ text: 'Excellent!', onClick: () => {} }]
    );
  };

  protected readonly handleTutorialDialogueShow = (data: {
    speaker: string;
    text: string;
    onDismiss?: () => void;
  }): void => {
    this.uiManager.showTutorialDialogue(data.speaker, data.text, data.onDismiss);
  };

  protected readonly handleTutorialDialogueHide = (): void => {
    this.uiManager.hideTutorialDialogue();
  };

  protected readonly handleTutorialSkipPrompt = (data: {
    onSkip: () => void;
    onContinue: () => void;
  }): void => {
    if (this.uiManager.isModalOpen()) return;

    this.uiManager.showModal(
      'Skip Tutorial?',
      'Are you sure you want to skip the tutorial? You can always replay it by starting a new game.',
      [
        { text: 'Skip Tutorial', onClick: data.onSkip },
        { text: 'Continue Tutorial', onClick: data.onContinue },
      ]
    );
  };

  /**
   * Cleanup common event listeners.
   * Automatically called on scene shutdown.
   */
  protected cleanupCommonEventListeners(): void {
    eventBus.off('money-changed', this.handleMoneyChanged);
    eventBus.off('prestige-changed', this.handlePrestigeChanged);
    eventBus.off('ap-changed', this.handleAPChanged);
    eventBus.off('day-changed', this.handleDayChanged);
    eventBus.off('location-changed', this.handleLocationChanged);
    eventBus.off('xp-gained', this.handleXPGained);
    eventBus.off('skill-levelup', this.handleSkillLevelUp);
    eventBus.off('collection-complete', this.handleCollectionComplete);
    eventBus.off('tutorial-dialogue-show', this.handleTutorialDialogueShow);
    eventBus.off('tutorial-dialogue-hide', this.handleTutorialDialogueHide);
    eventBus.off('tutorial-skip-prompt', this.handleTutorialSkipPrompt);

    this.input.keyboard?.off('keydown-ESC', this.handleEscapeKey);
    
    // Clear cached HUD on cleanup
    this.clearCachedHUD();
  }

  /**
   * Setup a standard gradient background with title text.
   * @param title - Scene title to display
   * @param options - Optional configuration for background colors and text styling
   */
  protected setupBackground(
    title: string,
    options?: {
      topColor?: number;
      bottomColor?: number;
      titleY?: number;
      titleSize?: string;
      titleColor?: string;
    }
  ): void {
    const { width, height } = this.cameras.main;
    
    const topColor = options?.topColor ?? 0x0f0c29;
    const bottomColor = options?.bottomColor ?? 0x24243e;
    const titleY = options?.titleY ?? 30;
    const titleSize = options?.titleSize ?? '48px';
    const titleColor = options?.titleColor ?? '#64b5f6';

    const graphics = this.add.graphics();
    graphics.fillGradientStyle(topColor, topColor, bottomColor, bottomColor, 1);
    graphics.fillRect(0, 0, width, height);

    this.add.text(width / 2, titleY, title, {
      fontSize: titleSize,
      color: titleColor,
      fontFamily: 'Orbitron',
      fontStyle: 'bold',
    }).setOrigin(0.5);
  }

  /**
   * Create standard HUD with current game state.
   * Automatically gathers player, world, and market data.
   * Uses cached HUD if available, otherwise creates new one.
   * @param forceRecreate - Force recreation of HUD even if cached
   * @returns HUD element ready to be appended to UI overlay
   */
  protected createStandardHUD(forceRecreate: boolean = false): HTMLElement {
    // Return cached HUD if available and not forcing recreation
    if (this.cachedHUD && !forceRecreate) {
      return this.cachedHUD;
    }

    const player = this.gameManager.getPlayerState();
    const world = this.gameManager.getWorldState();
    const victoryResult = this.gameManager.checkVictory();
    const museumIncome = this.gameManager.getMuseumIncomeInfo();
    const dailyRent = this.gameManager.getDailyRent();

    this.cachedHUD = this.uiManager.createHUD({
      money: player.money,
      prestige: player.prestige,
      skills: player.skills,
      day: world.day,
      ap: this.timeSystem.getFormattedAP(),
      location: world.currentLocation,
      garage: {
        used: this.gameManager.getGarageCarCount(),
        total: player.garageSlots,
      },
      dailyRent,
      market: this.gameManager.getMarketDescription(),
      museumIncome: museumIncome.carCount > 0 ? museumIncome : undefined,
      victoryProgress: {
        prestige: victoryResult.prestige,
        unicorns: victoryResult.unicorns,
        museumCars: victoryResult.museumCars,
        skillLevel: victoryResult.skillLevel,
        onClickProgress: () => {
          this.scene.pause();
          const allMet = victoryResult.prestige.met && victoryResult.unicorns.met && victoryResult.museumCars.met && victoryResult.skillLevel.met;
          const statusMsg = allMet ? '\n\n🎉 ALL CONDITIONS MET! You can win now!' : '\n\nKeep working toward these goals!';

          const nextSteps: string[] = [];
          if (!victoryResult.prestige.met) {
            nextSteps.push('Earn Prestige by putting cars on display (80%+), completing sets, and profiting from flips.');
          }
          if (!victoryResult.unicorns.met) {
            nextSteps.push('Find Unicorn-tier cars via auctions and special events, then keep them on display.');
          }
          if (!victoryResult.museumCars.met) {
            nextSteps.push('Put more cars on display (toggle display on any car at 80%+ condition).');
          }
          if (!victoryResult.skillLevel.met) {
            nextSteps.push('Level skills: Inspect (Eye), Haggle/Auction (Tongue), Visit new locations (Network).');
          }

          const nextStepsText = nextSteps.length > 0 ? `\n\nNext steps:\n- ${nextSteps.join('\n- ')}` : '';
          this.uiManager.showModal(
            '🏆 Victory Progress - Details',
            `**Win Conditions:**\n\nPrestige: ${victoryResult.prestige.current}/${victoryResult.prestige.required} ${victoryResult.prestige.met ? '✅' : '⬜'}\nUnicorn Cars: ${victoryResult.unicorns.current}/${victoryResult.unicorns.required} ${victoryResult.unicorns.met ? '✅' : '⬜'}\nCars on Display: ${victoryResult.museumCars.current}/${victoryResult.museumCars.required} ${victoryResult.museumCars.met ? '✅' : '⬜'}\nMax Skill Level: ${victoryResult.skillLevel.current}/${victoryResult.skillLevel.required} ${victoryResult.skillLevel.met ? '✅' : '⬜'}${statusMsg}${nextStepsText}`,
            [{ text: 'Close', onClick: () => this.scene.resume() }]
          );
        },
      },
    });

    return this.cachedHUD;
  }

  /**
   * Clear cached HUD. Call this when scene is shutdown or HUD needs full recreation.
   */
  protected clearCachedHUD(): void {
    this.cachedHUD = undefined;
  }

  /**
   * Reset UI and append standard HUD.
   * Convenience method that combines the common pattern:
   * - Clear existing UI
   - Create/reuse standard HUD
   * - Append HUD to overlay
   * Most scenes should call this at the start of setupUI().
   */
  protected resetUIWithHUD(): void {
    this.uiManager.clear();
    // Force recreation to ensure HUD-only computed fields (rent/market/gallery/victory) stay current.
    const hud = this.createStandardHUD(true);
    this.uiManager.append(hud);
  }
}
