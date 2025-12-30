import { debugLog, errorLog, warnLog } from '@/utils/log';
import Phaser from 'phaser';
import { BaseGameScene } from './base-game-scene';
import { eventBus } from '@/core/event-bus';
import { Economy } from '@/systems/Economy';
import { Car, getCarById } from '@/data/car-database';
import { GAME_CONFIG } from '@/config/game-config';
import { formatCurrency, formatNumber } from '@/utils/format';
import type { VictoryResult } from '@/core/game-manager';
import type { DeepReadonly } from '@/utils/types';
import { showRestorationChallenges, showRestorationOptions } from './internal/garage-restoration';
import { sellCar as sellCarInternal, sellCarAsIs as sellCarAsIsInternal } from './internal/garage-inventory';
import { createCarCard as createCarCardInternal } from './internal/garage-ui';
import { createGarageMenuInfo } from './internal/garage-menu-info';
import { showVictoryProgress as showVictoryProgressInternal } from './internal/garage-victory-progress';
import { createGarageCollectionPanel } from './internal/garage-collection-view';
import { createGarageRivalTierInfoPanel } from './internal/garage-rival-tier-info';
import { showFinanceModal as showFinanceModalInternal } from './internal/garage-finance';

/**
 * Garage Scene - Player's home base for managing cars.
 * Hub scene where players can manage their garage, restore cars, sell cars, and end the day.
 * Provides access to the map for exploring locations.
 */
export class GarageScene extends BaseGameScene {
  private autoEndDayOnEnter: boolean = false;
  private inventoryButton?: HTMLButtonElement;
  private currentView: 'menu' | 'inventory' | 'collection' | 'rival-info' = 'menu';

  private readonly handleGarageInventoryChanged = (): void => {
    const player = this.gameManager.getPlayerState();
    const garageCarCount = this.gameManager.getGarageCarCount();
    if (this.inventoryButton) {
      this.inventoryButton.textContent = `View Garage (${garageCarCount} cars)`;
    }

    // Update garage info in HUD
    this.uiManager.updateHUD({
      garage: {
        used: garageCarCount,
        total: player.garageSlots,
      },
    });

    if (this.currentView === 'inventory') this.showInventory();
    if (this.currentView === 'collection') this.showCollection();
  };

  private readonly handleVictory = (victoryResult: VictoryResult): void => {
    const { prestige, unicorns, collectionCars, skillLevel } = victoryResult;
    
    const message = `🏆 CONGRATULATIONS! 🏆\n\nYou've become the world's greatest car curator!\n\n` +
      `✓ Prestige: ${formatNumber(prestige.current)} (Required: ${formatNumber(prestige.required)})\n` +
      `✓ Unicorn Cars: ${unicorns.current} (Required: ${unicorns.required})\n` +
      `✓ Cars in Collection: ${collectionCars.current} cars (Required: ${collectionCars.required})\n` +
      `✓ Master Skill Level: ${skillLevel.current} (Required: ${skillLevel.required})\n\n` +
      `You've built an extraordinary private collection and mastered the art of car curation!\n\n` +
      `Days Played: ${this.gameManager.getWorldState().day}`;

    this.uiManager.showModal(
      '🎉 VICTORY! 🎉',
      message,
      [
        { text: 'Continue Playing', onClick: () => {} },
        { text: 'View Collection', onClick: () => this.showCollection() },
      ]
    );
  };

  private readonly handleTutorialComplete = (): void => {
    this.uiManager.showModal(
      '🎓 Tutorial Complete! 🎓',
      `Congratulations! You've mastered the basics of The Curator.\n\n` +
      `You now know how to:\n` +
      `✓ Find and inspect cars\n` +
      `✓ Restore cars to increase their value\n` +
      `✓ Win auctions against rivals\n` +
      `✓ Manage your time and budget\n\n` +
      `The world of car collecting awaits. Build your dream collection!`,
      [{ text: 'Start Collecting!', onClick: () => {} }]
    );
  };

  constructor() {
    super({ key: 'GarageScene' });
  }

  init(data?: { autoEndDay?: boolean }): void {
    this.autoEndDayOnEnter = Boolean(data?.autoEndDay);
  }

  create(): void {
    debugLog('Garage Scene: Loaded');

    this.initializeManagers('garage');
    this.setupBackground('THE GARAGE', {
      topColor: 0x2c3e50,
      bottomColor: 0x34495e,
      titleY: 50,
      titleSize: '48px',
      titleColor: '#ecf0f1',
    });
    this.setupUI();
    this.setupEventListeners();

    // Start tutorial for new players
    this.initializeTutorial();

    if (this.autoEndDayOnEnter) {
      // Reset the flag to avoid re-triggering if the scene is reused.
      this.autoEndDayOnEnter = false;
      this.endDay();
    }
  }

  private setupUI(): void {
    this.resetUIWithHUD();
    this.currentView = 'menu';

    const player = this.gameManager.getPlayerState();
    const garageCarCount = this.gameManager.getGarageCarCount();

    // Create main menu panel
    const menuPanel = this.uiManager.createPanel({
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 'min(980px, calc(100% - 40px))',
      minWidth: '0',
      maxHeight: '82%',
      overflowY: 'auto',
      padding: '18px',
    });
    menuPanel.classList.add('garage-menu-panel');

    const heading = this.uiManager.createHeading('What would you like to do?', 2, {
      textAlign: 'center',
      marginBottom: '12px',
    });
    menuPanel.appendChild(heading);

    // Garage status
    const garageStatus = this.uiManager.createText(
      `Garage: ${garageCarCount}/${player.garageSlots} slots used`,
      { textAlign: 'center', marginBottom: '10px', fontWeight: 'bold', opacity: '0.95' }
    );
    menuPanel.appendChild(garageStatus);

    // Buttons: show only primary actions up-front; tuck the rest under "More".
    const compactButtonStyle: Partial<CSSStyleDeclaration> = {
      width: '100%',
      padding: '10px 12px',
      fontSize: '13px',
      borderRadius: '10px',
    };

    const primaryActions = this.uiManager.createButtonContainer({
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: '10px',
      marginTop: '12px',
    });
    primaryActions.classList.add('garage-actions-primary');

    // Explore Map button (primary action)
    const mapBtn = this.uiManager.createButton(
      'Explore Map',
      () => this.goToMap(),
      { variant: 'primary', style: { ...compactButtonStyle, gridColumn: '1 / -1' } }
    );
    mapBtn.dataset.tutorialTarget = 'garage.explore-map';
    
    primaryActions.appendChild(mapBtn);

    // View Garage button
    const inventoryBtn = this.createTutorialAwareButton(
      `View Garage (${garageCarCount} cars)`,
      () => this.showInventory(),
      { variant: 'info', style: compactButtonStyle }
    );
    inventoryBtn.dataset.tutorialTarget = 'garage.view-garage';
    this.inventoryButton = inventoryBtn;
    primaryActions.appendChild(inventoryBtn);

    // View Collection button
    const collectionCars = this.gameManager.getCollectionCars();
    const collectionBtn = this.createTutorialAwareButton(
      `View Collection (${collectionCars.length} cars)`,
      () => this.showCollection(),
      { 
        variant: 'special', 
        style: compactButtonStyle
      }
    );
    primaryActions.appendChild(collectionBtn);

    // End Day button
    const endDayBtn = this.createTutorialAwareButton(
      'End Day',
      () => this.endDay(),
      { 
        variant: 'danger', 
        style: { ...compactButtonStyle, gridColumn: '1 / -1' }
      }
    );
    primaryActions.appendChild(endDayBtn);

    menuPanel.appendChild(primaryActions);

    const moreActions = document.createElement('details');
    moreActions.className = 'garage-collapsible garage-actions-more';
    const moreSummary = document.createElement('summary');
    moreSummary.textContent = 'More';
    moreActions.appendChild(moreSummary);

    const secondaryActions = document.createElement('div');
    secondaryActions.className = 'garage-actions-secondary';

    // Upgrade Garage button (if available)
    const upgradeCost = this.gameManager.getNextGarageSlotCost();
    if (upgradeCost !== null) {
      const upgradeBtn = this.createTutorialAwareButton(
        `Upgrade Garage (${upgradeCost} Prestige)`,
        () => this.upgradeGarage(),
        { 
          variant: 'info',
          style: compactButtonStyle,
        }
      );
      secondaryActions.appendChild(upgradeBtn);
    }

    const financeBtn = this.createTutorialAwareButton(
      '💳 Finance (Preston Banks)',
      () => this.showFinanceModal(),
      { variant: 'info', style: compactButtonStyle }
    );
    secondaryActions.appendChild(financeBtn);

    // Victory Progress button
    const victoryBtn = this.createTutorialAwareButton(
      'Check Victory Progress',
      () => this.showVictoryProgress(),
      { 
        variant: 'special',
        style: compactButtonStyle,
      }
    );
    secondaryActions.appendChild(victoryBtn);

    // Skills Reference button
    const skillsRefBtn = this.createTutorialAwareButton(
      '📚 Skills Reference',
      () => this.showSkillsReference(),
      { 
        variant: 'info',
        style: compactButtonStyle,
      }
    );
    secondaryActions.appendChild(skillsRefBtn);

    // Rival Info button
    const rivalInfoBtn = this.createTutorialAwareButton(
      '🏆 Rival Tiers',
      () => this.showRivalTierInfo(),
      { variant: 'info', style: compactButtonStyle }
    );
    secondaryActions.appendChild(rivalInfoBtn);

    // Game Menu button (Save, Load, Return to Main Menu)
    const menuBtn = this.createTutorialAwareButton(
      '⚙ Menu',
      () => this.showGameMenu(),
      { variant: 'info', style: compactButtonStyle }
    );
    secondaryActions.appendChild(menuBtn);

    moreActions.appendChild(secondaryActions);

    menuPanel.appendChild(
      createGarageMenuInfo({
        gameManager: this.gameManager,
        uiManager: this.uiManager,
        playerSkills: player.skills,
      })
    );
    menuPanel.appendChild(moreActions);
    this.uiManager.append(menuPanel);
  }

  private setupEventListeners(): void {
    // Clean up existing listeners first to avoid duplicates
    this.cleanupEventListeners();
    
    this.setupCommonEventListeners();
    eventBus.on('inventory-changed', this.handleGarageInventoryChanged);
    eventBus.on('victory', this.handleVictory);
    eventBus.on('tutorial-complete', this.handleTutorialComplete);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanupEventListeners();
    });
  }

  private cleanupEventListeners(): void {
    eventBus.off('inventory-changed', this.handleGarageInventoryChanged);
    eventBus.off('victory', this.handleVictory);
    eventBus.off('tutorial-complete', this.handleTutorialComplete);
  }

  /**
   * Create button with tutorial-based disabling logic.
  * During the first tutorial auction step, button is visually disabled and non-functional.
   * @param label - Button text
   * @param action - Click handler (disabled during tutorial)
   * @param options - Button styling options
   * @returns Button element
   */
  private createTutorialAwareButton(
    label: string,
    action: () => void,
    options: Parameters<typeof this.uiManager.createButton>[2] = {}
  ): HTMLButtonElement {
    const isTutorialFirstStep = this.tutorialManager?.isOnFirstVisitAuctionStep();
    return this.uiManager.createButton(
      label,
      isTutorialFirstStep ? () => {} : action,
      {
        ...options,
        style: {
          ...options.style,
          opacity: isTutorialFirstStep ? '0.5' : '1',
          cursor: isTutorialFirstStep ? 'not-allowed' : 'pointer'
        }
      }
    );
  }

  /**
   * Create a car card UI element with appropriate buttons based on context.
   * @param car - The car to display
   * @param context - 'inventory' or 'collection' to determine which buttons to show
   * @param refreshCallback - Callback to refresh the current view after actions
   * @returns Configured car panel element
   */
  private createCarCard(
    car: DeepReadonly<Car>,
    context: 'inventory' | 'collection',
    refreshCallback: () => void
  ): HTMLDivElement {
    return createCarCardInternal(car, context, {
      gameManager: this.gameManager,
      uiManager: this.uiManager,
      onRestore: (carId) => this.restoreCar(carId),
      onSell: (carId) => {
        if (context === 'collection') {
          sellCarInternal(carId, {
            gameManager: this.gameManager,
            uiManager: this.uiManager,
            tutorialManager: this.tutorialManager,
            onShowInventory: () => this.showCollection(),
            onShowTutorialBlockedModal: (message) => this.showTutorialBlockedActionModal(message),
          });
          return;
        }
        this.sellCar(carId);
      },
      onSellAsIs: (carId) => this.sellCarAsIs(carId),
      onRefresh: refreshCallback,
      getCarById,
    });
  }

  private initializeTutorial(): void {
    try {
      if (!this.tutorialManager) {
        warnLog('TutorialManager not initialized');
        return;
      }
      
      // Start tutorial for new players (day 1, no cars, no prestige, tutorial not started yet)
      const player = this.gameManager.getPlayerState();
      const world = this.gameManager.getWorldState();
      
      if (world.day === 1 && player.inventory.length === 0 && player.prestige === 0 && !this.tutorialManager.isTutorialActive()) {
        this.tutorialManager.startTutorial();
      }
    } catch (error) {
      errorLog('Error initializing tutorial:', error);
    }
  }

  private showInventory(): void {
    this.uiManager.clear();
    this.currentView = 'inventory';

    const garageCars = this.gameManager.getGarageCars();

    // Reuse cached HUD
    if (!this.cachedHUD) {
      this.cachedHUD = this.createStandardHUD();
    }
    this.uiManager.append(this.cachedHUD);

    const panel = this.uiManager.createPanel({
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 'min(960px, calc(100% - 40px))',
      minWidth: '0',
      maxHeight: '80%',
      overflowY: 'auto',
      padding: '18px',
    });
    panel.classList.add('garage-inventory-panel');

    const heading = this.uiManager.createHeading('Your Garage', 2, {
      textAlign: 'center',
    });
    panel.appendChild(heading);

    if (garageCars.length === 0) {
      const emptyText = this.uiManager.createText('No cars in the garage. Visit the map to find some!', {
        textAlign: 'center',
        fontSize: '16px',
      });
      panel.appendChild(emptyText);
    } else {
      const grid = document.createElement('div');
      grid.className = 'garage-inventory-grid';
      garageCars.forEach((car) => {
        const carPanel = this.createCarCard(car, 'inventory', () => this.showInventory());
        grid.appendChild(carPanel);
      });
      panel.appendChild(grid);
    }

    const backBtn = this.uiManager.createButton(
      'Back',
      () => this.setupUI(),
      { style: { width: '100%', marginTop: '20px' } }
    );
    backBtn.dataset.tutorialTarget = 'garage.back';
    panel.appendChild(backBtn);

    this.uiManager.append(panel);
  }

  private restoreCar(carId: string): void {
    const car = this.gameManager.getCar(carId);
    if (!car) return;

    if (car.condition >= 100) {
      this.uiManager.showInfo('Already Restored', 'This car is already in perfect condition.');
      return;
    }
    
    // Check for restoration challenges first
    const challenges = Economy.getRestorationChallenges(car);
    if (challenges.length > 0) {
      this.showRestorationChallenges(car, challenges);
      return;
    }
    
    this.showRestorationOptions(car);
  }
  
  /**
   * Show restoration challenges that must be completed before standard restoration.
   */
  private showRestorationChallenges(car: Car, challenges: ReturnType<typeof Economy.getRestorationChallenges>): void {
    showRestorationChallenges(car, challenges, {
      gameManager: this.gameManager,
      uiManager: this.uiManager,
      timeSystem: this.timeSystem,
      onShowInventory: () => this.showInventory(),
      onRestoreCar: (carId) => this.restoreCar(carId),
    });
  }
  
  /**
   * Show standard restoration options.
   */
  private showRestorationOptions(car: Car): void {
    showRestorationOptions(car, {
      gameManager: this.gameManager,
      uiManager: this.uiManager,
      timeSystem: this.timeSystem,
      tutorialManager: this.tutorialManager,
      onShowInventory: () => this.showInventory(),
    });
  }

  private sellCar(carId: string): void {
    sellCarInternal(carId, {
      gameManager: this.gameManager,
      uiManager: this.uiManager,
      tutorialManager: this.tutorialManager,
      onShowInventory: () => this.showInventory(),
      onShowTutorialBlockedModal: (message) => this.showTutorialBlockedActionModal(message),
    });
  }

  private showVictoryProgress(): void {
    showVictoryProgressInternal({ gameManager: this.gameManager, uiManager: this.uiManager });
  }

  /**
   * Show skills reference panel with all abilities and progression info.
   */
  private showSkillsReference(): void {
    const player = this.gameManager.getPlayerState();

    const skillsData = {
      eye: {
        name: '👁 Eye (Inspection)',
        color: '#3498db',
        abilities: [
          { level: 1, description: 'Basic inspection - see car condition' },
          { level: 2, description: 'Reveal car history (Flooded, Rust, Mint)' },
          { level: 3, description: 'Kick Tires in auctions (reduce rival budget)' },
          { level: 4, description: 'See exact damage percentages' },
          { level: 5, description: 'Appraisal mastery - predict market trends' },
        ],
      },
      tongue: {
        name: '💬 Tongue (Tactics)',
        color: '#9b59b6',
        abilities: [
          { level: 1, description: 'Basic bids and auction presence' },
          { level: 2, description: 'Unlock Stall (drain rival patience)' },
          { level: 3, description: 'Stall tactic in auctions (drain rival patience)' },
          { level: 4, description: 'Advanced tactics - stronger pressure tools' },
          { level: 5, description: 'Master tactician - maximum pressure potential' },
        ],
      },
      network: {
        name: '🌐 Network (Connections)',
        color: '#e67e22',
        abilities: [
          { level: 1, description: 'Access to public opportunities' },
          { level: 2, description: 'Spot special events more clearly' },
          { level: 3, description: 'Earlier visibility into special leads' },
          { level: 4, description: 'See rival movements and locations' },
          { level: 5, description: 'Underground deals and legendary cars' },
        ],
      },
    };

    let message = '';

    (['eye', 'tongue', 'network'] as const).forEach((skill) => {
      const data = skillsData[skill];
      const currentLevel = player.skills[skill];
      const progress = this.gameManager.getSkillProgress(skill);

      message += `${data.name} - Level ${currentLevel}/5\n`;
      if (currentLevel < 5) {
        message += `Next level: ${progress.current}/${progress.required} XP\n`;
      } else {
        message += `✨ MAX LEVEL \n`;
      }
      message += `\n`;

      data.abilities.forEach((ability) => {
        const unlocked = currentLevel >= ability.level;
        const isCurrent = currentLevel === ability.level - 1;
        const icon = unlocked ? '🔓' : '🔒';
        const style = unlocked ? '' : ' (locked)';
        const nextIndicator = isCurrent ? ' 👈 NEXT' : '';

        message += `  ${icon} Lvl ${ability.level}: ${ability.description}${style}${nextIndicator}\n`;
      });
      message += `\n`;
    });

    message += `\nEarn XP by:\n• Inspecting cars (+10 Eye XP)\n• Winning auctions (+15 Tongue XP)\n• Visiting new locations (+20 Network XP)`;

    this.uiManager.showModal('📚 Skills Reference', message, [
      { text: 'Close', onClick: () => {} },
    ]);
  }

  private sellCarAsIs(carId: string): void {
    sellCarAsIsInternal(carId, {
      gameManager: this.gameManager,
      uiManager: this.uiManager,
      tutorialManager: this.tutorialManager,
      onShowInventory: () => this.showInventory(),
      onShowTutorialBlockedModal: (message) => this.showTutorialBlockedActionModal(message),
    });
  }

  private showMorningBriefing(): void {
    const world = this.gameManager.getWorldState();
    const player = this.gameManager.getPlayerState();
    
    // Generate 2-3 intel hints
    const hints: string[] = [];
    
    // Hint 1: Market condition
    const marketStatus = this.gameManager.getMarketDescription();
    if (marketStatus) {
      hints.push(`📈 ${marketStatus}`);
    }
    
    // Hint 2: Rival activity (random rumor)
    const rivals = ['Sterling Vance', 'Marcus Kane', 'Scrapyard Joe', 'Elena Rossi'];
    const locations = ['Auction House', 'An Estate Sale', 'A Private Auction'];
    const randomRival = rivals[Math.floor(Math.random() * rivals.length)];
    const randomLocation = locations[Math.floor(Math.random() * locations.length)];
    hints.push(`🔍 Word on the street: ${randomRival} was spotted near ${randomLocation}`);
    
    // Hint 3: Special events
    const activeEvents = this.gameManager.getActiveSpecialEvents();
    if (activeEvents.length > 0) {
      const event = activeEvents[0];
      hints.push(`⭐ ${event.name} - ${event.description}`);
    } else if (player.skills.network >= 3) {
      // High network skill provides general tips
      hints.push(`💡 Network Tip: Visit different locations to find better leads`);
    }
    
    const message = `**Day ${world.day} - Morning Brief**\n\n${hints.join('\n\n')}\n\nGood hunting!`;
    
    setTimeout(() => {
      this.uiManager.showModal(
        '📰 Morning Intel',
        message,
        [{ text: 'Start Day', onClick: () => {} }]
      );
    }, 500);
  }

  private goToMap(): void {
    try {
      this.scene.start('MapScene');
    } catch (error) {
      errorLog('Error going to map:', error);
      // Fallback: still go to map even if tutorial fails
      this.scene.start('MapScene');
    }
  }

  private showTutorialBlockedActionModal(actionMessage: string): void {
    this.uiManager.showModal(
      'Tutorial In Progress',
      actionMessage,
      [
        { text: 'Continue Tutorial', onClick: () => {} },
        {
          text: 'Skip Tutorial',
          onClick: () => {
            // Delay so the current modal closes before we request another modal.
            setTimeout(() => this.tutorialManager.requestSkipTutorialPrompt(), 0);
          },
        },
      ]
    );
  }

  private endDay(): void {
    if (!this.tutorialManager.isSideActionAllowed('end-day')) {
      this.showTutorialBlockedActionModal(this.tutorialManager.getSideActionBlockedMessage('end-day'));
      return;
    }

    const playerBefore = this.gameManager.getPlayerState();
    const world = this.gameManager.getWorldState();
    const rent = this.gameManager.getDailyRent();
    const collectionPrestige = this.gameManager.getCollectionPrestigeInfo();

    const garageCarCount = this.gameManager.getGarageCarCount();
    const collectionCarCount = this.gameManager.getCollectionCars().length;

    // Pre-check: Can player afford rent?
    if (playerBefore.money < rent) {
      const canSellFromGarage = garageCarCount > 0;
      const canMoveFromCollectionToGarage = collectionCarCount > 0 && this.gameManager.hasGarageSpace();
      const hasAnyCars = canSellFromGarage || collectionCarCount > 0;
      const canBankLoan = this.gameManager.canTakeBankLoan();
      const canPrestonLoan = this.gameManager.canTakePrestonLoan();
      const canAnyLoan = canBankLoan || canPrestonLoan;

      if (!hasAnyCars && !canAnyLoan) {
        this.uiManager.showModal(
          'Bankrupt',
          `You can't pay today's rent (${formatCurrency(rent)}).\n\nGame Over.`,
          [
            {
              text: 'New Game',
              onClick: () => {
                this.gameManager.reset();
                this.setupUI();
              },
            },
          ]
        );
        return;
      }

      const shortfall = rent - playerBefore.money;
      const buttons: { text: string; onClick: () => void }[] = [];

      if (canSellFromGarage) {
        buttons.push({
          text: 'Sell a Car',
          onClick: () => this.showInventory(),
        });
      } else if (canMoveFromCollectionToGarage) {
        buttons.push({
          text: 'Go to Collection',
          onClick: () => this.showCollection(),
        });
      }

      if (canBankLoan) {
        const loanAmount = this.gameManager.getBankLoanAmount();
        buttons.push({
          text: `Take Bank Loan (+${formatCurrency(loanAmount)})`,
          onClick: () => {
            this.gameManager.takeBankLoan();
            this.endDay();
          },
        });
      }

      if (canPrestonLoan) {
        const terms = this.gameManager.getPrestonLoanTerms();
        buttons.push({
          text: `Take Finance Loan (+${formatCurrency(terms.principal)})`,
          onClick: () => {
            const result = this.gameManager.takePrestonLoan();
            if (!result.ok) {
              setTimeout(() => {
                this.uiManager.showInfo('Finance', result.reason);
              }, 0);
              return;
            }
            this.endDay();
          },
        });
      }

      buttons.push({
        text: 'Cancel',
        onClick: () => this.setupUI(),
      });

      this.uiManager.showModal(
        'Rent Due',
        `Daily rent is ${formatCurrency(rent)}, but you only have ${formatCurrency(playerBefore.money)} (short ${formatCurrency(shortfall)}).\n\nSell a car or take a loan to avoid bankruptcy.`,
        buttons
      );

      return;
    }

    // Show end-day confirmation with summary
    const confirmMessage = 
      `📊 END DAY ${world.day} SUMMARY:\n\n` +
      `💰 Current Money: ${formatCurrency(playerBefore.money)}\n` +
      `🏆 Current Prestige: ${formatNumber(playerBefore.prestige)}\n` +
      `💸 Rent Due: ${formatCurrency(rent)}\n` +
      `🏛️ Collection Prestige: +${collectionPrestige.totalPerDay} prestige (${collectionPrestige.carCount} cars)\n\n` +
      `After rent, you'll have ${formatCurrency(playerBefore.money - rent)}.\n\n` +
      `Ready to end the day?`;
    
    this.uiManager.confirmAction(
      '🌙 End Day?',
      confirmMessage,
      () => this.proceedWithEndDay(),
      () => {}, // Cancel does nothing
      { 
        confirmText: 'End Day', 
        confirmVariant: 'warning',
        cancelText: 'Keep Working'
      }
    );
  }

  /**
   * Actually end the day after confirmation.
   * Separated from endDay() to allow confirmation dialog.
   */
  private proceedWithEndDay(): void {
    const result = this.timeSystem.endDay();

    if (result.bankrupt) {
      this.uiManager.showModal(
        'Bankrupt',
        `You can't pay today's rent (${formatCurrency(result.requiredRent)}).\n\nGame Over.`,
        [
          {
            text: 'New Game',
            onClick: () => {
              this.gameManager.reset();
              this.setupUI();
            },
          },
        ]
      );
      return;
    }

    const dayStats = this.gameManager.getDayStatsAndReset();
    const player = this.gameManager.getPlayerState();
    const world = this.gameManager.getWorldState();
    const collectionPrestige = this.gameManager.getCollectionPrestigeInfo();
    const marketDesc = this.gameManager.getMarketDescription();

    // Build day summary
    let summary = `🌃 Day ${world.day - 1} Complete\n\n`;
    summary += `💼 ACTIVITY SUMMARY:\n`;
    summary += `• Cars Acquired: ${dayStats.carsAcquired}\n`;
    summary += `• Money Earned: ${formatCurrency(dayStats.moneyEarned)}\n`;
    summary += `• Money Spent: ${formatCurrency(dayStats.moneySpent)}\n`;
    summary += `• Rent Paid: ${formatCurrency(result.rentPaid)}\n`;
    
    const netMoney = dayStats.netMoney - result.rentPaid;
    const netColor = netMoney >= 0 ? '+' : '';
    summary += `• Net Income: ${netColor}${formatCurrency(netMoney)}\n\n`;
    
    if (collectionPrestige.carCount > 0) {
      summary += `🏛️ COLLECTION PRESTIGE:\n`;
      summary += `• Prestige from Collection: +${collectionPrestige.totalPerDay}\n`;
      if (dayStats.prestigeGained > collectionPrestige.totalPerDay) {
        summary += `• Other Prestige Gained: +${dayStats.prestigeGained - collectionPrestige.totalPerDay}\n`;
      }
      summary += `• Total Prestige Gained: +${dayStats.prestigeGained}\n\n`;
    } else if (dayStats.prestigeGained > 0) {
      summary += `🏆 Prestige Gained: +${dayStats.prestigeGained}\n\n`;
    }
    
    summary += `💰 Current Money: ${formatCurrency(player.money)}\n`;
    summary += `🏆 Total Prestige: ${player.prestige}\n\n`;
    summary += `🌅 DAY ${world.day} FORECAST:\n`;
    summary += `• ${marketDesc}\n`;
    summary += `• New opportunities await on the map`;

    this.uiManager.showModal(
      `🌃 End of Day ${world.day - 1}`,
      summary,
      [
        {
          text: 'Start New Day',
          onClick: () => {
            this.setupUI();
            // Show morning briefing after day transition (skip during tutorial)
            if (!this.tutorialManager.isTutorialActive() && world.day > 1) {
              this.showMorningBriefing();
            }
          },
        },
      ]
    );
  }

  private showGameMenu(): void {
    this.uiManager.showModal(
      'Game Menu',
      'Save your progress, load a previous game, or return to the main menu.',
      [
        {
          text: 'Save Game',
          onClick: () => {
            if (this.gameManager.save()) {
              this.uiManager.showInfo('Game Saved', 'Your progress has been saved successfully.');
            } else {
              this.uiManager.showInfo('Save Failed', 'Unable to save game. Check console for details.');
            }
          },
        },
        {
          text: 'Load Game',
          onClick: () => {
            this.uiManager.showModal(
              'Load Game?',
              'This will reload your last saved game. Any unsaved progress will be lost.',
              [
                {
                  text: 'Load',
                  onClick: () => this.loadSavedGame(),
                },
                { text: 'Cancel', onClick: () => {} },
              ]
            );
          },
        },
        {
          text: 'Main Menu',
          onClick: () => {
            this.scene.start('MainMenuScene');
          },
        },
        { text: 'Back', onClick: () => {} },
      ]
    );
  }

  private showFinanceModal(): void {
    showFinanceModalInternal({
      gameManager: this.gameManager,
      uiManager: this.uiManager,
      onReturnToGarage: () => this.setupUI(),
      onReopen: () => this.showFinanceModal(),
    });
  }

  private loadSavedGame(): void {
    if (this.gameManager.load()) {
      // Emit events to update UI
      this.gameManager.emitAllStateEvents();

      this.uiManager.showInfo('Game Loaded', 'Your saved game has been loaded successfully.', {
        onOk: () => this.setupUI(),
      });
    } else {
      this.uiManager.showInfo('Load Failed', 'No saved game found or load failed.');
    }
  }

  private upgradeGarage(): void {
    if (!this.tutorialManager.isSideActionAllowed('upgrade-garage')) {
      this.showTutorialBlockedActionModal(this.tutorialManager.getSideActionBlockedMessage('upgrade-garage'));
      return;
    }

    const cost = this.gameManager.getNextGarageSlotCost();
    const player = this.gameManager.getPlayerState();

    if (cost === null) {
      this.uiManager.showInfo('Max Capacity', 'Your garage is already at maximum capacity.');
      return;
    }

    if (player.prestige < cost) {
      this.uiManager.showInfo(
        'Insufficient Prestige',
        `You need ${cost} prestige to upgrade your garage. You have ${player.prestige}.`
      );
      return;
    }

    // Calculate rent change
    const currentRent = this.gameManager.getDailyRent();
    const newSlots = player.garageSlots + 1;
    const rentConfig = GAME_CONFIG.economy.rentByGarageSlots as Record<number, number>;
    const newRent = rentConfig[newSlots] || currentRent;
    const rentIncrease = newRent - currentRent;

    // Show confirmation with rent warning
    this.uiManager.confirmAction(
      '⚠️ Upgrade Garage?',
      `Upgrade to ${newSlots} garage slots for ${cost} prestige?\n\n💸 RENT WILL INCREASE:\nCurrent: ${formatCurrency(currentRent)}/day\nNew: ${formatCurrency(newRent)}/day\nIncrease: +${formatCurrency(rentIncrease)}/day\n\nMake sure you can afford the higher daily rent!`,
      () => {
        if (this.gameManager.upgradeGarageSlots()) {
          this.uiManager.showInfo(
            'Garage Upgraded!',
            `Your garage now has ${newSlots} slots.\n\nDaily rent is now ${formatCurrency(newRent)}.`,
            { onOk: () => this.setupUI() }
          );
        } else {
          this.uiManager.showInfo('Upgrade Failed', 'Unable to upgrade garage. Please try again.');
        }
      },
      () => {},
      { confirmText: 'Upgrade', confirmVariant: 'warning' }
    );
  }

  private showCollection(): void {
    this.uiManager.clear();
    this.currentView = 'collection';

    // Reuse cached HUD
    if (this.cachedHUD) {
      this.uiManager.append(this.cachedHUD);
    } else {
      const hud = this.createStandardHUD();
      this.uiManager.append(hud);
    }


    const panel = createGarageCollectionPanel({
      gameManager: this.gameManager,
      uiManager: this.uiManager,
      createCarCard: (car) => this.createCarCard(car, 'collection', () => this.showCollection()),
      onBack: () => this.setupUI(),
    });

    this.uiManager.append(panel);
  }

  private showRivalTierInfo(): void {
    this.currentView = 'rival-info';
    this.uiManager.clear();
    
    // Reuse cached HUD
    if (this.cachedHUD) {
      this.uiManager.append(this.cachedHUD);
    } else {
      const hud = this.createStandardHUD();
      this.uiManager.append(hud);
    }


    const panel = createGarageRivalTierInfoPanel({
      gameManager: this.gameManager,
      uiManager: this.uiManager,
      onBack: () => this.setupUI(),
    });

    this.uiManager.append(panel);
  }
}
