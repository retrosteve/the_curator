import Phaser from 'phaser';
import { GameManager } from '@/core/game-manager';
import { UIManager } from '@/ui/ui-manager';
import { TimeSystem } from '@/systems/time-system';
import { TutorialManager } from '@/systems/tutorial-manager';
import { eventBus } from '@/core/event-bus';

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

  protected readonly handleTimeChanged = (_timeOfDay: number): void => {
    this.uiManager.updateHUD({ time: this.timeSystem.getFormattedTime() });
  };

  protected readonly handleDayChanged = (day: number): void => {
    this.uiManager.updateHUD({ day });
  };

  protected readonly handleLocationChanged = (location: string): void => {
    this.uiManager.updateHUD({ location });
  };

  protected readonly handleShowDialogue = (data: { speaker: string; text: string }): void => {
    try {
      this.uiManager.showModal(data.speaker, data.text, [{ text: 'OK', onClick: () => {} }]);
    } catch (error) {
      console.error('Error showing tutorial dialogue:', error);
    }
  };

  /**
   * Initialize common managers used by all gameplay scenes.
   * Call this in your scene's create() method before setupBackground() and setupUI().
   * @param locationKey - The location identifier for this scene (e.g., 'garage', 'map')
   */
  protected initializeManagers(locationKey: string): void {
    this.gameManager = GameManager.getInstance();
    this.gameManager.setLocation(locationKey);
    this.uiManager = new UIManager();
    this.timeSystem = new TimeSystem();
    this.tutorialManager = TutorialManager.getInstance();
  }

  /**
   * Setup common event listeners for HUD updates.
   * Call this in your scene's create() method after setupUI().
   * Automatically cleans up on scene shutdown.
   */
  protected setupCommonEventListeners(): void {
    eventBus.on('money-changed', this.handleMoneyChanged);
    eventBus.on('prestige-changed', this.handlePrestigeChanged);
    eventBus.on('time-changed', this.handleTimeChanged);
    eventBus.on('day-changed', this.handleDayChanged);
    eventBus.on('location-changed', this.handleLocationChanged);
    eventBus.on('show-dialogue', this.handleShowDialogue);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanupCommonEventListeners();
    });
  }

  /**
   * Cleanup common event listeners.
   * Automatically called on scene shutdown.
   */
  protected cleanupCommonEventListeners(): void {
    eventBus.off('money-changed', this.handleMoneyChanged);
    eventBus.off('prestige-changed', this.handlePrestigeChanged);
    eventBus.off('time-changed', this.handleTimeChanged);
    eventBus.off('day-changed', this.handleDayChanged);
    eventBus.off('location-changed', this.handleLocationChanged);
    eventBus.off('show-dialogue', this.handleShowDialogue);
    
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
    
    const topColor = options?.topColor ?? 0x1a1a2e;
    const bottomColor = options?.bottomColor ?? 0x16213e;
    const titleY = options?.titleY ?? 30;
    const titleSize = options?.titleSize ?? '36px';
    const titleColor = options?.titleColor ?? '#eee';

    const graphics = this.add.graphics();
    graphics.fillGradientStyle(topColor, topColor, bottomColor, bottomColor, 1);
    graphics.fillRect(0, 0, width, height);

    this.add.text(width / 2, titleY, title, {
      fontSize: titleSize,
      color: titleColor,
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

    this.cachedHUD = this.uiManager.createHUD({
      money: player.money,
      prestige: player.prestige,
      skills: player.skills,
      day: world.day,
      time: this.timeSystem.getFormattedTime(),
      location: world.currentLocation,
      garage: {
        used: player.inventory.length,
        total: player.garageSlots,
      },
      market: this.gameManager.getMarketDescription(),
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
    const hud = this.createStandardHUD();
    this.uiManager.append(hud);
  }
}
