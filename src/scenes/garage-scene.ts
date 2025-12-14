import Phaser from 'phaser';
import { BaseGameScene } from './base-game-scene';
import { eventBus } from '@/core/event-bus';
import { Economy } from '@/systems/Economy';
import { Car } from '@/data/car-database';
import { GAME_CONFIG } from '@/config/game-config';
import { formatCurrency, formatNumber } from '@/utils/format';

/**
 * Garage Scene - Player's home base for managing cars.
 * Hub scene where players can view inventory, restore cars, sell cars, and end the day.
 * Provides access to the map for exploring locations.
 */
export class GarageScene extends BaseGameScene {
  private autoEndDayOnEnter: boolean = false;
  private inventoryButton?: HTMLButtonElement;
  private currentView: 'menu' | 'inventory' | 'museum' | 'rival-info' = 'menu';

  private readonly handleInventoryChanged = (): void => {
    const player = this.gameManager.getPlayerState();
    if (this.inventoryButton) {
      this.inventoryButton.textContent = `View Inventory (${player.inventory.length} cars)`;
    }

    // Update garage info in HUD
    this.uiManager.updateHUD({
      garage: {
        used: player.inventory.length,
        total: player.garageSlots,
      },
    });

    if (this.currentView === 'inventory') {
      this.showInventory();
    }
  };

  private readonly handleVictory = (victoryResult: any): void => {
    const { prestige, unicorns, museumCars, skillLevel } = victoryResult;
    
    const message = `🏆 CONGRATULATIONS! 🏆\n\nYou've become the world's greatest car curator!\n\n` +
      `✓ Prestige: ${formatNumber(prestige.current)} (Required: ${formatNumber(prestige.required)})\n` +
      `✓ Unicorn Cars: ${unicorns.current} (Required: ${unicorns.required})\n` +
      `✓ Museum Collection: ${museumCars.current} cars (Required: ${museumCars.required})\n` +
      `✓ Master Skill Level: ${skillLevel.current} (Required: ${skillLevel.required})\n\n` +
      `You've built an extraordinary museum and mastered the art of car curation!\n\n` +
      `Days Played: ${this.gameManager.getWorldState().day}`;

    this.uiManager.showModal(
      '🎉 VICTORY! 🎉',
      message,
      [
        { text: 'Continue Playing', onClick: () => {} },
        { text: 'View Museum', onClick: () => this.showMuseum() },
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
      `The world of car collecting awaits. Build your dream museum!`,
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
    console.log('Garage Scene: Loaded');

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

    // Create main menu panel
    const menuPanel = this.uiManager.createPanel({
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      minWidth: '400px',
    });

    const heading = this.uiManager.createHeading('What would you like to do?', 2, {
      textAlign: 'center',
      marginBottom: '20px',
    });
    menuPanel.appendChild(heading);

    // Garage status
    const garageStatus = this.uiManager.createText(
      `Garage: ${player.inventory.length}/${player.garageSlots} slots used`,
      { textAlign: 'center', marginBottom: '10px', fontWeight: 'bold' }
    );
    menuPanel.appendChild(garageStatus);

    // Skill XP Progress Bars
    const skillsPanel = document.createElement('div');
    skillsPanel.style.cssText = 'margin: 15px 0; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px;';
    
    const skillsHeading = this.uiManager.createText('Skills', { fontWeight: 'bold', marginBottom: '8px' });
    skillsPanel.appendChild(skillsHeading);

    const skills: Array<'eye' | 'tongue' | 'network'> = ['eye', 'tongue', 'network'];
    const skillNames = { eye: '👁 Eye', tongue: '💬 Tongue', network: '🌐 Network' };
    
    skills.forEach(skill => {
      const progress = this.gameManager.getSkillProgress(skill);
      const isMaxLevel = progress.level >= 5;
      
      const skillRow = document.createElement('div');
      skillRow.style.cssText = 'margin-bottom: 8px;';
      
      // Skill label with level and XP
      const label = document.createElement('div');
      label.style.cssText = 'display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 3px;';
      label.innerHTML = `
        <span>${skillNames[skill]} Lvl ${progress.level}</span>
        <span>${isMaxLevel ? 'MAX' : `${progress.current}/${progress.required} XP`}</span>
      `;
      skillRow.appendChild(label);
      
      // Progress bar
      if (!isMaxLevel) {
        const progressBar = document.createElement('div');
        progressBar.style.cssText = 'width: 100%; height: 8px; background: rgba(0,0,0,0.3); border-radius: 4px; overflow: hidden;';
        
        const progressFill = document.createElement('div');
        const percentage = (progress.current / progress.required) * 100;
        progressFill.style.cssText = `width: ${percentage}%; height: 100%; background: linear-gradient(90deg, #3498db, #2ecc71); transition: width 0.3s ease;`;
        
        progressBar.appendChild(progressFill);
        skillRow.appendChild(progressBar);
      }
      
      skillsPanel.appendChild(skillRow);
    });
    
    menuPanel.appendChild(skillsPanel);

    // Button container
    const buttonContainer = this.uiManager.createButtonContainer();

    // Explore Map button (primary action)
    const mapBtn = this.uiManager.createButton(
      'Explore Map',
      () => this.goToMap(),
      { style: { width: '100%' } }
    );
    buttonContainer.appendChild(mapBtn);

    // View Inventory button
    const inventoryBtn = this.uiManager.createButton(
      `View Inventory (${player.inventory.length} cars)`,
      () => this.showInventory(),
      { style: { width: '100%' } }
    );
    this.inventoryButton = inventoryBtn;
    buttonContainer.appendChild(inventoryBtn);

    // View Museum button
    const museumCars = this.getMuseumCars();
    const museumBtn = this.uiManager.createButton(
      `View Museum (${museumCars.length} cars)`,
      () => this.showMuseum(),
      { variant: 'special', style: { width: '100%' } }
    );
    buttonContainer.appendChild(museumBtn);

    // End Day button
    const endDayBtn = this.uiManager.createButton(
      'End Day',
      () => this.endDay(),
      { variant: 'danger', style: { width: '100%' } }
    );
    buttonContainer.appendChild(endDayBtn);

    // Upgrade Garage button (if available)
    const upgradeCost = this.gameManager.getNextGarageSlotCost();
    if (upgradeCost !== null) {
      const upgradeBtn = this.uiManager.createButton(
        `Upgrade Garage (${upgradeCost} Prestige)`,
        () => this.upgradeGarage(),
        { style: { width: '100%', backgroundColor: '#9b59b6' } }
      );
      buttonContainer.appendChild(upgradeBtn);
    }

    // Victory Progress button
    const victoryBtn = this.uiManager.createButton(
      'Check Victory Progress',
      () => this.showVictoryProgress(),
      { style: { width: '100%', backgroundColor: '#f39c12' } }
    );
    buttonContainer.appendChild(victoryBtn);

    // Rival Info button
    const rivalInfoBtn = this.uiManager.createButton(
      '🏆 Rival Tiers',
      () => this.showRivalTierInfo(),
      { style: { width: '100%', backgroundColor: '#3498db' } }
    );
    buttonContainer.appendChild(rivalInfoBtn);

    // Game Menu button (Save, Load, Return to Main Menu)
    const menuBtn = this.uiManager.createButton(
      '⚙ Menu',
      () => this.showGameMenu(),
      { style: { width: '100%', backgroundColor: '#34495e' } }
    );
    buttonContainer.appendChild(menuBtn);

    menuPanel.appendChild(buttonContainer);
    this.uiManager.append(menuPanel);
  }

  private setupEventListeners(): void {
    // Clean up existing listeners first to avoid duplicates
    this.cleanupEventListeners();
    
    this.setupCommonEventListeners();
    eventBus.on('inventory-changed', this.handleInventoryChanged);
    eventBus.on('victory', this.handleVictory);
    eventBus.on('tutorial-complete', this.handleTutorialComplete);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanupEventListeners();
    });
  }

  private cleanupEventListeners(): void {
    eventBus.off('inventory-changed', this.handleInventoryChanged);
    eventBus.off('victory', this.handleVictory);
    eventBus.off('tutorial-complete', this.handleTutorialComplete);
  }

  /**
   * Create a car card UI element with appropriate buttons based on context.
   * @param car - The car to display
   * @param context - 'inventory' or 'museum' to determine which buttons to show
   * @param refreshCallback - Callback to refresh the current view after actions
   * @returns Configured car panel element
   */
  private createCarCard(
    car: Car,
    context: 'inventory' | 'museum',
    refreshCallback: () => void
  ): HTMLDivElement {
    const carPanel = this.uiManager.createPanel({
      margin: context === 'inventory' ? '10px 0' : '15px 0',
      backgroundColor: context === 'inventory' 
        ? 'rgba(52, 73, 94, 0.6)' 
        : 'rgba(243, 156, 18, 0.1)',
      border: context === 'museum' ? '2px solid #f39c12' : undefined,
    });

    const carName = this.uiManager.createHeading(car.name, 3, {
      color: context === 'museum' ? '#f39c12' : undefined,
    });

    const salePrice = Economy.getSalePrice(car, this.gameManager);

    if (context === 'inventory') {
      const carCondition = this.uiManager.createText(`Condition: ${car.condition}/100`);
      const carValue = this.uiManager.createText(`Value: ${formatCurrency(salePrice)}`);
      carPanel.appendChild(carName);
      carPanel.appendChild(carCondition);
      carPanel.appendChild(carValue);
    } else {
      const carDetails = this.uiManager.createText(
        `Tier: ${car.tier} | Condition: ${car.condition}/100 | Value: ${formatCurrency(salePrice)}`,
        { fontSize: '14px' }
      );
      const carTags = this.uiManager.createText(
        `Tags: ${car.tags.join(', ')}`,
        { fontSize: '13px', color: '#bdc3c7', marginTop: '5px' }
      );
      carPanel.appendChild(carName);
      carPanel.appendChild(carDetails);
      carPanel.appendChild(carTags);
    }

    if (context === 'inventory') {
      const buttonContainer = this.uiManager.createButtonContainer({
        marginTop: '10px',
        flexWrap: 'wrap',
      });

      const restoreBtn = this.uiManager.createButton(
        'Restore',
        () => this.restoreCar(car.id)
      );
      buttonContainer.appendChild(restoreBtn);

      const isMuseumEligible = this.gameManager.isMuseumEligible(car);
      const isDisplayed = car.displayInMuseum === true;

      if (isMuseumEligible) {
        const museumBtn = this.uiManager.createButton(
          isDisplayed ? '✓ In Museum' : 'Display in Museum',
          () => {
            const result = this.gameManager.toggleMuseumDisplay(car.id);
            if (result.success) {
              refreshCallback();
            } else {
              this.uiManager.showModal('Cannot Display', result.message, [
                { text: 'OK', onClick: () => {} },
              ]);
            }
          },
          {
            variant: isDisplayed ? 'special' : undefined,
          }
        );
        buttonContainer.appendChild(museumBtn);
      }

      const sellBtn = this.uiManager.createButton(
        'Sell',
        () => this.sellCar(car.id),
        { variant: 'success' }
      );
      const sellAsIsBtn = this.uiManager.createButton(
        'Sell As-Is',
        () => this.sellCarAsIs(car.id),
        { variant: 'warning' }
      );
      buttonContainer.appendChild(sellBtn);
      buttonContainer.appendChild(sellAsIsBtn);

      carPanel.appendChild(buttonContainer);

      // Show eligibility message if not museum eligible
      if (!isMuseumEligible) {
        const notEligibleText = this.uiManager.createText(
          `Requires 80%+ condition for museum display (currently ${car.condition}%)`,
          { fontSize: '12px', color: '#95a5a6', fontStyle: 'italic', marginTop: '5px' }
        );
        carPanel.appendChild(notEligibleText);
      }
    } else {
      // Museum context - only remove button
      const removeBtn = this.uiManager.createButton(
        'Remove from Display',
        () => {
          this.gameManager.toggleMuseumDisplay(car.id);
          refreshCallback();
        },
        { variant: 'danger', style: { marginTop: '10px' } }
      );
      carPanel.appendChild(removeBtn);
    }

    return carPanel;
  }

  private initializeTutorial(): void {
    try {
      if (!this.tutorialManager) {
        console.warn('TutorialManager not initialized');
        return;
      }
      
      // Start tutorial for new players (day 1, no cars, no prestige, tutorial not started yet)
      const player = this.gameManager.getPlayerState();
      const world = this.gameManager.getWorldState();
      
      if (world.day === 1 && player.inventory.length === 0 && player.prestige === 0 && !this.tutorialManager.isTutorialActive()) {
        this.tutorialManager.startTutorial();
      }
    } catch (error) {
      console.error('Error initializing tutorial:', error);
    }
  }

  private showInventory(): void {
    this.uiManager.clear();
    this.currentView = 'inventory';

    const player = this.gameManager.getPlayerState();

    // Reuse cached HUD
    if (this.cachedHUD) {
      this.uiManager.append(this.cachedHUD);
    } else {
      const hud = this.createStandardHUD();
      this.uiManager.append(hud);
    }

    const panel = this.uiManager.createPanel({
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      minWidth: '600px',
      maxHeight: '80vh',
      overflowY: 'auto',
    });

    const heading = this.uiManager.createHeading('Your Inventory', 2, {
      textAlign: 'center',
    });
    panel.appendChild(heading);

    if (player.inventory.length === 0) {
      const emptyText = this.uiManager.createText('No cars in inventory. Visit the map to find some!', {
        textAlign: 'center',
        fontSize: '16px',
      });
      panel.appendChild(emptyText);
    } else {
      player.inventory.forEach((car) => {
        const carPanel = this.createCarCard(car, 'inventory', () => this.showInventory());
        panel.appendChild(carPanel);
      });
    }

    const backBtn = this.uiManager.createButton(
      'Back',
      () => this.setupUI(),
      { style: { width: '100%', marginTop: '20px' } }
    );
    panel.appendChild(backBtn);

    this.uiManager.append(panel);
  }

  private restoreCar(carId: string): void {
    const car = this.gameManager.getCar(carId);
    if (!car) return;

    if (car.condition >= 100) {
      this.uiManager.showModal(
        'Already Restored',
        'This car is already in perfect condition.',
        [{ text: 'OK', onClick: () => {} }]
      );
      return;
    }

    const options = Economy.getRestorationOptions(car);
    
    // Calculate profit preview for each option
    const currentValue = Economy.getSalePrice(car, this.gameManager);
    
    const modalOptions = options.map(opt => {
      // Simulate restoration result
      const simulatedCar = { ...car, condition: Math.min(100, car.condition + opt.conditionGain) };
      const futureValue = Economy.getSalePrice(simulatedCar, this.gameManager);
      const profit = futureValue - currentValue - opt.cost;
      const roi = ((profit / opt.cost) * 100).toFixed(0);
      
      return {
        name: opt.name,
        cost: opt.cost,
        apCost: opt.apCost,
        description: opt.description,
        conditionGain: opt.conditionGain,
        profit,
        roi,
        risk: opt.risk,
        onClick: () => {
          const block = this.timeSystem.getAPBlockModal(opt.apCost, `restoring ${car.name}`);
          if (block) {
            this.uiManager.showModal(block.title, block.message, [{ text: 'OK', onClick: () => {} }]);
            return;
          }
          if (this.gameManager.spendMoney(opt.cost)) {
            this.timeSystem.spendAP(opt.apCost);
            
            // Tutorial override: first restoration always succeeds (ignore Cheap Charlie risk)
            const isTutorialFirstRestore = this.tutorialManager.isCurrentStep('first_buy');
            const result = Economy.performRestoration(car, opt, isTutorialFirstRestore);
            this.gameManager.updateCar(result.car);
            
            // Tutorial trigger: advance to first_restore immediately after restoration
            if (isTutorialFirstRestore) {
              this.tutorialManager.advanceStep('first_restore');
            }
            
            // Tutorial: Auto-sell the first car after restoration
            if (this.tutorialManager.isCurrentStep('first_restore')) {
              this.showInventory();
              // Auto-trigger the sale
              setTimeout(() => {
                const restoredCar = this.gameManager.getCar(car.id);
                if (restoredCar) {
                  const salePrice = Economy.getSalePrice(restoredCar, this.gameManager);
                  this.uiManager.showModal(
                    'Tutorial: Your First Sale',
                    `An NPC buyer saw your ${restoredCar.name} and wants to buy it immediately for ${formatCurrency(salePrice)}!\n\nThis is how you flip cars for profit: Buy low, restore, sell high.`,
                    [{
                      text: 'Sell to Buyer',
                      onClick: () => {
                        this.gameManager.addMoney(salePrice);
                        this.gameManager.removeCar(car.id);
                        this.tutorialManager.advanceStep('first_flip');
                        
                        // Show next tutorial guidance
                        setTimeout(() => {
                          this.tutorialManager.showDialogueWithCallback(
                            'Uncle Ray',
                            `Great work! You've completed your first car deal and made a profit.\n\nNow let's try something more challenging. Click "Explore Map" to find another opportunity - but this time, you'll face competition from other collectors!`,
                            () => this.setupUI()
                          );
                        }, 300);
                      }
                    }]
                  );
                }
              }, 500);
            } else {
              this.showInventory();
            }
          } else {
            this.uiManager.showInsufficientFundsModal();
          }
        },
      };
    });

    this.uiManager.showRestorationModal(
      car.name,
      car.condition,
      modalOptions,
      () => this.showInventory()
    );
  }

  private sellCar(carId: string): void {
    const car = this.gameManager.getCar(carId);
    if (!car) return;

    const salePrice = Economy.getSalePrice(car, this.gameManager);

    this.uiManager.confirmAction(
      'Sell Car',
      `Sell ${car.name} for ${formatCurrency(salePrice)}?`,
      () => {
        this.gameManager.addMoney(salePrice);
        this.gameManager.removeCar(carId);
        this.uiManager.showFloatingMoney(salePrice, true);
        
        // Tutorial trigger: first flip
        if (this.tutorialManager.isCurrentStep('first_restore')) {
          this.tutorialManager.advanceStep('first_flip');
        }
        
        this.showInventory();
      },
      () => this.showInventory(),
      { confirmText: 'Sell', confirmVariant: 'success' }
    );
  }

  private showVictoryProgress(): void {
    const victoryResult = this.gameManager.checkVictory();
    const { prestige, unicorns, museumCars, skillLevel } = victoryResult;

    // Create custom modal content with progress bars
    const modalContent = document.createElement('div');
    modalContent.style.cssText = 'padding: 10px;';

    const createProgressRow = (label: string, current: number, required: number, met: boolean) => {
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom: 15px;';
      
      const labelDiv = document.createElement('div');
      labelDiv.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 5px; font-weight: bold;';
      labelDiv.innerHTML = `
        <span>${met ? '✅' : '⬜'} ${label}</span>
        <span>${current} / ${required}</span>
      `;
      row.appendChild(labelDiv);
      
      const progressBar = document.createElement('div');
      progressBar.style.cssText = 'width: 100%; height: 20px; background: rgba(0,0,0,0.3); border-radius: 10px; overflow: hidden;';
      
      const progressFill = document.createElement('div');
      const percentage = Math.min((current / required) * 100, 100);
      const color = met ? '#2ecc71' : (percentage >= 75 ? '#f39c12' : '#3498db');
      progressFill.style.cssText = `width: ${percentage}%; height: 100%; background: ${color}; transition: width 0.5s ease;`;
      
      progressBar.appendChild(progressFill);
      row.appendChild(progressBar);
      
      return row;
    };

    modalContent.appendChild(createProgressRow('Prestige', prestige.current, prestige.required, prestige.met));
    modalContent.appendChild(createProgressRow('Unicorns in Museum', unicorns.current, unicorns.required, unicorns.met));
    modalContent.appendChild(createProgressRow('Museum Cars (80%+)', museumCars.current, museumCars.required, museumCars.met));
    modalContent.appendChild(createProgressRow('Max Skill Level', skillLevel.current, skillLevel.required, skillLevel.met));

    const statusText = document.createElement('div');
    statusText.style.cssText = `margin-top: 20px; text-align: center; font-weight: bold; font-size: 16px; color: ${victoryResult.hasWon ? '#2ecc71' : '#f39c12'};`;
    statusText.textContent = victoryResult.hasWon 
      ? '🎉 ALL CONDITIONS MET! End the day to claim victory!' 
      : 'Keep building your collection to achieve victory!';
    modalContent.appendChild(statusText);

    this.uiManager.showModal(
      '🏆 Victory Progress',
      modalContent.outerHTML,
      [{ text: 'Close', onClick: () => {} }]
    );
  }

  private sellCarAsIs(carId: string): void {
    const car = this.gameManager.getCar(carId);
    if (!car) return;

    const salePrice = Math.floor(Economy.getSalePrice(car, this.gameManager) * GAME_CONFIG.economy.sellAsIsMultiplier);

    this.uiManager.confirmAction(
      'Sell As-Is',
      `Quick sell ${car.name} for ${formatCurrency(salePrice)}? (70% Value)`,
      () => {
        this.gameManager.addMoney(salePrice);
        this.gameManager.removeCar(carId);
        this.uiManager.showFloatingMoney(salePrice, true);
        this.showInventory();
      },
      () => this.showInventory(),
      { confirmText: 'Sell', confirmVariant: 'warning' }
    );
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
    const locations = ["Joe's Scrapyard", 'Classic Car Dealership', 'Weekend Auction House'];
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
      console.error('Error going to map:', error);
      // Fallback: still go to map even if tutorial fails
      this.scene.start('MapScene');
    }
  }

  private endDay(): void {
    const playerBefore = this.gameManager.getPlayerState();
    const rent = this.gameManager.getDailyRent();

    if (playerBefore.money < rent) {
      const canSell = playerBefore.inventory.length > 0;
      const canLoan = this.gameManager.canTakeBankLoan();

      if (!canSell && !canLoan) {
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

      if (canSell) {
        buttons.push({
          text: 'Sell a Car',
          onClick: () => this.showInventory(),
        });
      }

      if (canLoan) {
        const loanAmount = this.gameManager.getBankLoanAmount();
        buttons.push({
          text: `Take Bank Loan (+${formatCurrency(loanAmount)})`,
          onClick: () => {
            this.gameManager.takeBankLoan();
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
        `Daily rent is ${formatCurrency(rent)}, but you only have ${formatCurrency(playerBefore.money)} (short ${formatCurrency(shortfall)}).\n\nSell a car or take a bank loan to avoid bankruptcy.`,
        buttons
      );

      return;
    }

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

    const player = this.gameManager.getPlayerState();
    const world = this.gameManager.getWorldState();

    this.uiManager.showModal(
      'Day Ended',
      `Welcome to Day ${world.day}!\nDaily Rent Paid: ${formatCurrency(result.rentPaid)}\n\nMoney: ${formatCurrency(player.money)}\nCars: ${player.inventory.length}`,
      [
        {
          text: 'Continue',
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
              this.uiManager.showModal(
                'Game Saved',
                'Your progress has been saved successfully.',
                [{ text: 'OK', onClick: () => {} }]
              );
            } else {
              this.uiManager.showModal(
                'Save Failed',
                'Unable to save game. Check console for details.',
                [{ text: 'OK', onClick: () => {} }]
              );
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
            this.uiManager.showModal(
              'Return to Main Menu?',
              'Make sure to save your game first! Any unsaved progress will be lost.',
              [
                {
                  text: 'Return to Menu',
                  onClick: () => {
                    this.scene.start('MainMenuScene');
                  },
                },
                { text: 'Cancel', onClick: () => {} },
              ]
            );
          },
        },
        { text: 'Back', onClick: () => {} },
      ]
    );
  }

  private loadSavedGame(): void {
    if (this.gameManager.load()) {
      // Emit events to update UI
      this.gameManager.emitAllStateEvents();

      this.uiManager.showModal(
        'Game Loaded',
        'Your saved game has been loaded successfully.',
        [{ text: 'OK', onClick: () => this.setupUI() }]
      );
    } else {
      this.uiManager.showModal(
        'Load Failed',
        'No saved game found or load failed.',
        [{ text: 'OK', onClick: () => {} }]
      );
    }
  }

  private upgradeGarage(): void {
    const cost = this.gameManager.getNextGarageSlotCost();
    const player = this.gameManager.getPlayerState();

    if (cost === null) {
      this.uiManager.showModal(
        'Max Capacity',
        'Your garage is already at maximum capacity.',
        [{ text: 'OK', onClick: () => {} }]
      );
      return;
    }

    if (player.prestige < cost) {
      this.uiManager.showModal(
        'Insufficient Prestige',
        `You need ${cost} prestige to upgrade your garage. You have ${player.prestige}.`,
        [{ text: 'OK', onClick: () => {} }]
      );
      return;
    }

    if (this.gameManager.upgradeGarageSlots()) {
      this.uiManager.showModal(
        'Garage Upgraded!',
        `Your garage now has ${player.garageSlots + 1} slots.`,
        [{ text: 'OK', onClick: () => this.setupUI() }]
      );
    } else {
      this.uiManager.showModal(
        'Upgrade Failed',
        'Unable to upgrade garage. Please try again.',
        [{ text: 'OK', onClick: () => {} }]
      );
    }
  }

  private getMuseumCars(): Car[] {
    return this.gameManager.getMuseumCars();
  }

  private getMuseumPrestigeBonus(): number {
    const museumCars = this.getMuseumCars();
    // Simple bonus: 1 prestige per museum car per day
    return museumCars.length;
  }

  private getMuseumEligibleCars(): Car[] {
    const player = this.gameManager.getPlayerState();
    // Cars eligible for museum: condition >= 80%
    return player.inventory.filter(car => this.gameManager.isMuseumEligible(car));
  }

  private showMuseum(): void {
    this.uiManager.clear();
    this.currentView = 'museum';

    const museumCars = this.getMuseumCars();
    const prestigeBonus = this.getMuseumPrestigeBonus();

    // Reuse cached HUD
    if (this.cachedHUD) {
      this.uiManager.append(this.cachedHUD);
    } else {
      const hud = this.createStandardHUD();
      this.uiManager.append(hud);
    }

    const panel = this.uiManager.createPanel({
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      minWidth: '700px',
      maxHeight: '80vh',
      overflowY: 'auto',
    });

    const heading = this.uiManager.createHeading('Your Car Museum', 2, {
      textAlign: 'center',
      color: '#f39c12',
    });
    panel.appendChild(heading);

    // Museum stats
    const eligibleCars = this.getMuseumEligibleCars();
    const statsText = this.uiManager.createText(
      `Displayed: ${museumCars.length} | Eligible: ${eligibleCars.length} | Daily Prestige Bonus: +${prestigeBonus}`,
      { textAlign: 'center', fontWeight: 'bold', marginBottom: '10px' }
    );
    panel.appendChild(statsText);

    const infoText = this.uiManager.createText(
      'Quality Tiers: Good (80-89%) = +1/day | Excellent (90-99%) = +2/day | Perfect (100%) = +3/day',
      { textAlign: 'center', fontSize: '13px', color: '#95a5a6', marginBottom: '20px' }
    );
    panel.appendChild(infoText);

    if (museumCars.length === 0) {
      const emptyText = this.uiManager.createText(
        'No cars displayed yet. Restore cars to excellent condition (80%+) and display them from your inventory!',
        { textAlign: 'center', fontSize: '16px', color: '#7f8c8d' }
      );
      panel.appendChild(emptyText);
    } else {
      museumCars.forEach((car) => {
        const qualityTier = this.gameManager.getMuseumQualityTier(car.condition);
        const carPanel = this.createCarCard(car, 'museum', () => this.showMuseum());
        
        // Add quality tier badge to card
        const tierBadge = document.createElement('div');
        tierBadge.style.cssText = `
          position: absolute;
          top: 10px;
          right: 10px;
          background: ${qualityTier.color};
          color: #fff;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: bold;
        `;
        tierBadge.textContent = `${qualityTier.tier}: +${qualityTier.prestigePerDay}/day`;
        carPanel.style.position = 'relative';
        carPanel.appendChild(tierBadge);
        
        panel.appendChild(carPanel);
      });
    }

    // Back button
    const backBtn = this.uiManager.createButton(
      'Back to Garage',
      () => this.setupUI(),
      { style: { marginTop: '20px' } }
    );
    panel.appendChild(backBtn);

    this.uiManager.append(panel);
  }

  private showRivalTierInfo(): void {
    this.currentView = 'rival-info';
    this.uiManager.clear();

    const player = this.gameManager.getPlayerState();
    
    // Reuse cached HUD
    if (this.cachedHUD) {
      this.uiManager.append(this.cachedHUD);
    } else {
      const hud = this.createStandardHUD();
      this.uiManager.append(hud);
    }

    const panel = this.uiManager.createPanel({
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      minWidth: '700px',
      maxHeight: '80vh',
      overflowY: 'auto',
    });

    const heading = this.uiManager.createHeading('Rival Tier Progression', 2, {
      textAlign: 'center',
      color: '#3498db',
    });
    panel.appendChild(heading);

    const introText = this.uiManager.createText(
      `As you gain prestige, you'll face tougher rivals in auctions. Your current prestige: ${player.prestige}`,
      { textAlign: 'center', marginBottom: '20px', fontSize: '16px' }
    );
    panel.appendChild(introText);

    // Tier 3 - Scrappers (Early Game)
    const tier3Panel = this.uiManager.createPanel({
      margin: '15px 0',
      backgroundColor: player.prestige < 50 ? 'rgba(46, 204, 113, 0.2)' : 'rgba(127, 140, 141, 0.1)',
      border: player.prestige < 50 ? '2px solid #2ecc71' : '1px solid #7f8c8d',
    });

    const tier3Name = this.uiManager.createHeading('Tier 3: Scrappers', 3, {
      color: player.prestige < 50 ? '#2ecc71' : '#7f8c8d',
    });
    const tier3Details = this.uiManager.createText(
      `Prestige Range: 0-49 ${player.prestige < 50 ? '(CURRENT)' : ''}\\n` +
      `Difficulty: ★☆☆☆☆ (Easiest)\\n` +
      `Budget: Low ($2,000-$5,000)\\n` +
      `Tactics: Simple bidding, easy to outmaneuver`,
      { fontSize: '14px', whiteSpace: 'pre-line' }
    );
    tier3Panel.appendChild(tier3Name);
    tier3Panel.appendChild(tier3Details);
    panel.appendChild(tier3Panel);

    // Tier 2 - Enthusiasts (Mid Game)
    const tier2Panel = this.uiManager.createPanel({
      margin: '15px 0',
      backgroundColor: player.prestige >= 50 && player.prestige < 150 ? 'rgba(52, 152, 219, 0.2)' : 'rgba(127, 140, 141, 0.1)',
      border: player.prestige >= 50 && player.prestige < 150 ? '2px solid #3498db' : '1px solid #7f8c8d',
    });

    const tier2Name = this.uiManager.createHeading('Tier 2: Enthusiasts', 3, {
      color: player.prestige >= 50 && player.prestige < 150 ? '#3498db' : '#7f8c8d',
    });
    const tier2Status = player.prestige < 50 ? '🔒 LOCKED' : (player.prestige < 150 ? '(CURRENT)' : '');
    const tier2Details = this.uiManager.createText(
      `Prestige Range: 50-149 ${tier2Status}\\n` +
      `Difficulty: ★★★☆☆ (Medium)\\n` +
      `Budget: Medium ($8,000-$15,000)\\n` +
      `Tactics: Niche collectors, may overpay for preferred cars`,
      { fontSize: '14px', whiteSpace: 'pre-line' }
    );
    tier2Panel.appendChild(tier2Name);
    tier2Panel.appendChild(tier2Details);
    panel.appendChild(tier2Panel);

    // Tier 1 - Tycoons (Late Game)
    const tier1Panel = this.uiManager.createPanel({
      margin: '15px 0',
      backgroundColor: player.prestige >= 150 ? 'rgba(231, 76, 60, 0.2)' : 'rgba(127, 140, 141, 0.1)',
      border: player.prestige >= 150 ? '2px solid #e74c3c' : '1px solid #7f8c8d',
    });

    const tier1Name = this.uiManager.createHeading('Tier 1: Tycoons', 3, {
      color: player.prestige >= 150 ? '#e74c3c' : '#7f8c8d',
    });
    const tier1Status = player.prestige < 150 ? '🔒 LOCKED' : '(CURRENT)';
    const tier1Details = this.uiManager.createText(
      `Prestige Range: 150+ ${tier1Status}\\n` +
      `Difficulty: ★★★★★ (Hardest)\\n` +
      `Budget: High ($20,000-$50,000)\\n` +
      `Tactics: Deep pockets, strategic bidding, may control Unicorns`,
      { fontSize: '14px', whiteSpace: 'pre-line' }
    );
    tier1Panel.appendChild(tier1Name);
    tier1Panel.appendChild(tier1Details);
    panel.appendChild(tier1Panel);

    const tipText = this.uiManager.createText(
      '💡 Tip: Use skills like Kick Tires and Stall to reduce rival budgets and patience. Strategy beats pure money!',
      { textAlign: 'center', fontSize: '14px', color: '#f39c12', marginTop: '20px', fontStyle: 'italic' }
    );
    panel.appendChild(tipText);

    // Back button
    const backBtn = this.uiManager.createButton(
      'Back to Garage',
      () => this.setupUI(),
      { style: { marginTop: '20px', width: '100%' } }
    );
    panel.appendChild(backBtn);

    this.uiManager.append(panel);
  }
}
