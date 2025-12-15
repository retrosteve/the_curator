import Phaser from 'phaser';
import { BaseGameScene } from './base-game-scene';
import { eventBus } from '@/core/event-bus';
import { Economy } from '@/systems/Economy';
import { Car } from '@/data/car-database';
import { GAME_CONFIG, SKILL_METADATA } from '@/config/game-config';
import { formatCurrency, formatNumber } from '@/utils/format';

/**
 * Garage Scene - Player's home base for managing cars.
 * Hub scene where players can view inventory, restore cars, sell cars, and end the day.
 * Provides access to the map for exploring locations.
 */
export class GarageScene extends BaseGameScene {
  private autoEndDayOnEnter: boolean = false;
  private inventoryButton?: HTMLButtonElement;
  private mapButton?: HTMLButtonElement;
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

  private readonly handleTutorialStepChanged = (data: { step: string }): void => {
    // When tutorial advances to first_visit_scrapyard, apply pulse animation to map button
    if (data.step === 'first_visit_scrapyard' && this.mapButton) {
      this.mapButton.style.cssText += `
        animation: pulse 1.5s ease-in-out infinite;
        box-shadow: 0 0 20px #4CAF50;
        transform: scale(1.05);
      `;
    }
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
    const skillTooltips = {
      eye: 'Lvl 1: See basic car info\nLvl 2: Reveal hidden damage\nLvl 3: See accurate market value\nLvl 4: Unlock Kick Tires tactic\nLvl 5: Predict market trends',
      tongue: 'Lvl 1: Basic negotiation\nLvl 2: Unlock Stall tactic\nLvl 3: +1 Stall use per auction\nLvl 4: +1 Stall use per auction\nLvl 5: Master negotiator (max Stall uses)',
      network: 'Lvl 1: Access public opportunities\nLvl 2: See rival movements\nLvl 3: Unlock private sales\nLvl 4: Earlier event notifications\nLvl 5: Insider deals & exclusive leads'
    };
    
    skills.forEach(skill => {
      const progress = this.gameManager.getSkillProgress(skill);
      const isMaxLevel = progress.level >= 5;
      const skillMeta = SKILL_METADATA[skill];
      
      const skillRow = document.createElement('div');
      skillRow.style.cssText = 'margin-bottom: 8px; cursor: help; position: relative;';
      skillRow.title = skillTooltips[skill];
      
      // Skill label with level and XP
      const label = document.createElement('div');
      label.style.cssText = 'display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 3px;';
      label.innerHTML = `
        <span>${skillMeta.icon} ${skillMeta.name} Lvl ${progress.level} ℹ️</span>
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
    this.mapButton = mapBtn;
    
    // Tutorial: Highlight map button and disable others during first_visit_scrapyard step
    const isTutorialFirstStep = this.tutorialManager?.isCurrentStep('first_visit_scrapyard');
    if (isTutorialFirstStep) {
      // Add pulsing animation to map button (CSS animation defined in main.css)
      mapBtn.style.cssText += `
        animation: pulse 1.5s ease-in-out infinite;
        box-shadow: 0 0 20px #4CAF50;
        transform: scale(1.05);
      `;
    }
    
    buttonContainer.appendChild(mapBtn);

    // View Inventory button
    const inventoryBtn = this.createTutorialAwareButton(
      `View Inventory (${player.inventory.length} cars)`,
      () => this.showInventory(),
      { style: { width: '100%' } }
    );
    this.inventoryButton = inventoryBtn;
    buttonContainer.appendChild(inventoryBtn);

    // View Museum button
    const museumCars = this.gameManager.getMuseumCars();
    const museumBtn = this.createTutorialAwareButton(
      `View Museum (${museumCars.length} cars)`,
      () => this.showMuseum(),
      { 
        variant: 'special', 
        style: { width: '100%' }
      }
    );
    buttonContainer.appendChild(museumBtn);

    // End Day button
    const endDayBtn = this.createTutorialAwareButton(
      'End Day',
      () => this.endDay(),
      { 
        variant: 'danger', 
        style: { width: '100%' }
      }
    );
    buttonContainer.appendChild(endDayBtn);

    // Upgrade Garage button (if available)
    const upgradeCost = this.gameManager.getNextGarageSlotCost();
    if (upgradeCost !== null) {
      const upgradeBtn = this.createTutorialAwareButton(
        `Upgrade Garage (${upgradeCost} Prestige)`,
        () => this.upgradeGarage(),
        { 
          style: { 
            width: '100%', 
            backgroundColor: '#9b59b6'
          }
        }
      );
      buttonContainer.appendChild(upgradeBtn);
    }

    // Victory Progress button
    const victoryBtn = this.createTutorialAwareButton(
      'Check Victory Progress',
      () => this.showVictoryProgress(),
      { 
        style: { 
          width: '100%', 
          backgroundColor: '#f39c12'
        }
      }
    );
    buttonContainer.appendChild(victoryBtn);

    // Skills Reference button
    const skillsRefBtn = this.createTutorialAwareButton(
      '📚 Skills Reference',
      () => this.showSkillsReference(),
      { 
        style: { 
          width: '100%', 
          backgroundColor: '#8e44ad'
        }
      }
    );
    buttonContainer.appendChild(skillsRefBtn);

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
    eventBus.on('tutorial-step-changed', this.handleTutorialStepChanged);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanupEventListeners();
    });
  }

  private cleanupEventListeners(): void {
    eventBus.off('inventory-changed', this.handleInventoryChanged);
    eventBus.off('victory', this.handleVictory);
    eventBus.off('tutorial-complete', this.handleTutorialComplete);
    eventBus.off('tutorial-step-changed', this.handleTutorialStepChanged);
  }

  /**
   * Create button with tutorial-based disabling logic.
   * During 'first_visit_scrapyard' tutorial step, button is visually disabled and non-functional.
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
    const isTutorialFirstStep = this.tutorialManager?.isCurrentStep('first_visit_scrapyard');
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
    if (!this.cachedHUD) {
      this.cachedHUD = this.createStandardHUD();
    }
    this.uiManager.append(this.cachedHUD);

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
  private showRestorationChallenges(car: Car, challenges: typeof Economy.getRestorationChallenges extends (...args: any) => infer R ? R : never): void {
    // Build plain text message with proper formatting
    let message = '⚠️ RESTORATION BLOCKED\n\n';
    message += 'This car requires special treatment before standard restoration can begin.\n\n';
    message += '━━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    challenges.forEach((challenge, index) => {
      message += `${challenge.name}\n`;
      message += `${challenge.description}\n\n`;
      message += `💰 Cost: ${formatCurrency(challenge.cost)} | ⏰ Time: ${challenge.apCost} AP\n`;
      
      if (index < challenges.length - 1) {
        message += '\n━━━━━━━━━━━━━━━━━━━━━━\n\n';
      }
    });
    
    const buttons = challenges.map(challenge => ({
      text: `Fix: ${challenge.name}`,
      onClick: () => {
        const block = this.timeSystem.getAPBlockModal(challenge.apCost, `fixing ${car.name}`);
        if (block) {
          this.uiManager.showModal(block.title, block.message, [{ text: 'OK', onClick: () => {} }]);
          return;
        }
        
        if (this.gameManager.spendMoney(challenge.cost)) {
          this.timeSystem.spendAP(challenge.apCost);
          const fixedCar = Economy.completeRestorationChallenge(car, challenge);
          this.gameManager.updateCar(fixedCar);
          
          this.uiManager.showModal(
            '✅ Challenge Complete!',
            `${challenge.name} completed successfully!\n\nThe car is now ready for standard restoration.`,
            [{ text: 'Continue', onClick: () => this.restoreCar(car.id) }]
          );
        } else {
          this.uiManager.showInsufficientFundsModal();
        }
      },
    }));
    
    buttons.push({
      text: 'Cancel',
      onClick: () => this.showInventory(),
    });
    
    this.uiManager.showModal('🔧 Restoration Challenges', message, buttons);
  }
  
  /**
   * Show standard restoration options.
   */
  private showRestorationOptions(car: Car): void {

    const options = Economy.getRestorationOptions(car);
    
    // Calculate profit preview for each option
    const currentValue = Economy.getSalePrice(car, this.gameManager);
    
    const modalOptions = options.map(opt => {
      // Simulate restoration result
      const simulatedCar = { ...car, condition: Math.min(100, car.condition + opt.conditionGain) };
      const futureValue = Economy.getSalePrice(simulatedCar, this.gameManager);
      const valueIncrease = futureValue - currentValue;
      const netProfit = valueIncrease - opt.cost;
      
      return {
        name: opt.name,
        cost: opt.cost,
        apCost: opt.apCost,
        description: opt.description,
        conditionGain: opt.conditionGain,
        valueIncrease,
        netProfit,
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
            
            // Show discovery message if found
            if (result.discovery) {
              const discoveryIcon = result.discovery.type === 'positive' ? '💎' : '⚠️';
              const discoveryName = result.discovery.name;
              const valueChange = result.discovery.valueChange;
              
              setTimeout(() => {
                this.uiManager.showModal(
                  `${discoveryIcon} Hidden Discovery!`,
                  result.message + `\n\n${discoveryName}\nValue change: ${formatCurrency(Math.abs(valueChange))}`,
                  [{ text: 'Continue', onClick: () => {
                    this.showInventory();
                  }}]
                );
              }, 300);
            } else {
              // Normal restoration result
              this.showInventory();
            }
            
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
    const world = this.gameManager.getWorldState();

    // Calculate prestige pace
    const currentDay = world.day;
    const prestigePerDay = currentDay > 1 ? prestige.current / currentDay : 0;
    const daysToVictory = prestigePerDay > 0 
      ? Math.ceil((prestige.required - prestige.current) / prestigePerDay)
      : 999;
    
    // Determine pace status
    let paceStatus: 'on-track' | 'slow' | 'stalled';
    let paceColor: string;
    let paceIcon: string;
    
    if (prestigePerDay >= 20) {
      paceStatus = 'on-track';
      paceColor = '#2ecc71';
      paceIcon = '🚀';
    } else if (prestigePerDay >= 10) {
      paceStatus = 'slow';
      paceColor = '#f39c12';
      paceIcon = '🐢';
    } else {
      paceStatus = 'stalled';
      paceColor = '#e74c3c';
      paceIcon = '⚠️';
    }

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

    // Add pace indicator
    const paceDiv = document.createElement('div');
    paceDiv.style.cssText = `margin-top: 20px; padding: 15px; background: rgba(0,0,0,0.3); border-radius: 10px; border-left: 4px solid ${paceColor};`;
    
    const paceTitle = document.createElement('div');
    paceTitle.style.cssText = 'font-weight: bold; font-size: 16px; margin-bottom: 8px;';
    paceTitle.textContent = `${paceIcon} Prestige Pace: ${paceStatus.toUpperCase().replace('-', ' ')}`;
    paceDiv.appendChild(paceTitle);
    
    const paceDetails = document.createElement('div');
    paceDetails.style.cssText = 'font-size: 14px; color: #bbb;';
    paceDetails.innerHTML = `
      • Current Rate: <span style="color: ${paceColor}; font-weight: bold;">${prestigePerDay.toFixed(1)} prestige/day</span><br>
      • Days Played: ${currentDay}<br>
      • Est. Days to Victory: ${daysToVictory < 999 ? daysToVictory : 'N/A'}<br>
      <br>
      <span style="font-size: 12px; font-style: italic;">
        ${paceStatus === 'on-track' ? '✓ Great pace! Keep it up!' : 
          paceStatus === 'slow' ? '⚡ Consider focusing on museum display and collections.' :
          '💡 Tip: Display high-condition cars in your museum for daily prestige.'}
      </span>
    `;
    paceDiv.appendChild(paceDetails);
    modalContent.appendChild(paceDiv);

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
        name: '💬 Tongue (Negotiation)',
        color: '#9b59b6',
        abilities: [
          { level: 1, description: 'Basic haggling - minor price reduction' },
          { level: 2, description: 'Improved haggling - better deals' },
          { level: 3, description: 'Stall tactic in auctions (drain rival patience)' },
          { level: 4, description: 'Master negotiator - significant discounts' },
          { level: 5, description: 'Silver tongue - sellers trust you completely' },
        ],
      },
      network: {
        name: '🌐 Network (Connections)',
        color: '#e67e22',
        abilities: [
          { level: 1, description: 'Access to basic dealerships' },
          { level: 2, description: 'Spot special events more clearly' },
          { level: 3, description: 'Access to exclusive private sales' },
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

    message += `\nEarn XP by:\n• Inspecting cars (+10 Eye XP)\n• Haggling (+5 Tongue XP)\n• Winning auctions (+15 Tongue XP)\n• Visiting new locations (+20 Network XP)`;

    this.uiManager.showModal('📚 Skills Reference', message, [
      { text: 'Close', onClick: () => {} },
    ]);
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
    const world = this.gameManager.getWorldState();
    const rent = this.gameManager.getDailyRent();
    const museumIncome = this.gameManager.getMuseumIncomeInfo();
    const unusedAP = world.currentAP;

    // Pre-check: Can player afford rent?
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

    // Show end-day confirmation with summary
    const confirmMessage = 
      `📊 END DAY ${world.day} SUMMARY:\n\n` +
      `💰 Current Money: ${formatCurrency(playerBefore.money)}\n` +
      `🏆 Current Prestige: ${formatNumber(playerBefore.prestige)}\n` +
      `⏰ Unused AP: ${unusedAP}/${GAME_CONFIG.day.maxAP}\n\n` +
      `💸 Rent Due: ${formatCurrency(rent)}\n` +
      `📈 Museum Income: +${museumIncome.totalPerDay} prestige (${museumIncome.carCount} cars)\n\n` +
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
    const museumIncome = this.gameManager.getMuseumIncomeInfo();
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
    
    if (museumIncome.carCount > 0) {
      summary += `🏛️ MUSEUM EARNINGS:\n`;
      summary += `• Prestige from Museum: +${museumIncome.totalPerDay}\n`;
      if (dayStats.prestigeGained > museumIncome.totalPerDay) {
        summary += `• Other Prestige Gained: +${dayStats.prestigeGained - museumIncome.totalPerDay}\n`;
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
          this.uiManager.showModal(
            'Garage Upgraded!',
            `Your garage now has ${newSlots} slots.\n\nDaily rent is now ${formatCurrency(newRent)}.`,
            [{ text: 'OK', onClick: () => this.setupUI() }]
          );
        } else {
          this.uiManager.showModal(
            'Upgrade Failed',
            'Unable to upgrade garage. Please try again.',
            [{ text: 'OK', onClick: () => {} }]
          );
        }
      },
      () => {},
      { confirmText: 'Upgrade', confirmVariant: 'warning' }
    );
  }

  private showMuseum(): void {
    this.uiManager.clear();
    this.currentView = 'museum';

    const museumCars = this.gameManager.getMuseumCars();
    const museumIncomeInfo = this.gameManager.getMuseumIncomeInfo();
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

    const heading = this.uiManager.createHeading('Your Car Museum', 2, {
      textAlign: 'center',
      color: '#f39c12',
    });
    panel.appendChild(heading);

    // Museum stats - count eligible cars (condition >= 80%)
    const eligibleCars = player.inventory.filter(car => this.gameManager.isMuseumEligible(car));
    const statsText = this.uiManager.createText(
      `Displayed: ${museumCars.length} | Eligible: ${eligibleCars.length} | Daily Prestige Bonus: +${museumIncomeInfo.totalPerDay}`,
      { textAlign: 'center', fontWeight: 'bold', marginBottom: '10px' }
    );
    panel.appendChild(statsText);

    const infoText = this.uiManager.createText(
      'Quality Tiers: Good (80-89%) = +1/day | Excellent (90-99%) = +2/day | Perfect (100%) = +3/day',
      { textAlign: 'center', fontSize: '13px', color: '#95a5a6', marginBottom: '20px' }
    );
    panel.appendChild(infoText);

    // Collections progress
    const collections = this.gameManager.getAllCollectionsProgress();
    if (collections.length > 0) {
      const collectionsHeading = this.uiManager.createHeading('📚 Collections', 3, {
        marginTop: '20px',
        marginBottom: '10px',
      });
      panel.appendChild(collectionsHeading);

      collections.forEach(collection => {
        const collectionCard = document.createElement('div');
        collectionCard.style.cssText = `
          background: ${collection.isComplete ? 'linear-gradient(145deg, rgba(46, 204, 113, 0.2), rgba(39, 174, 96, 0.2))' : 'rgba(255,255,255,0.05)'};
          border: 2px solid ${collection.isComplete ? '#2ecc71' : 'rgba(100, 200, 255, 0.2)'};
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        `;

        const leftSide = document.createElement('div');
        leftSide.innerHTML = `
          <div style="font-size: 18px; margin-bottom: 4px;">${collection.icon} ${collection.name}</div>
          <div style="font-size: 12px; color: #95a5a6;">${collection.description}</div>
        `;

        const rightSide = document.createElement('div');
        rightSide.style.cssText = 'text-align: right;';
        
        const statusIcon = collection.isClaimed ? '✅' : collection.isComplete ? '🎁' : '⬜';
        const statusText = collection.isClaimed ? 'Completed!' : collection.isComplete ? 'Ready to Claim!' : `${collection.current}/${collection.required}`;
        
        rightSide.innerHTML = `
          <div style="font-size: 16px; font-weight: bold; color: ${collection.isClaimed ? '#2ecc71' : collection.isComplete ? '#f39c12' : '#64b5f6'};">
            ${statusIcon} ${statusText}
          </div>
          <div style="font-size: 12px; color: #95a5a6; margin-top: 4px;">
            Reward: +${collection.prestigeReward} Prestige
          </div>
        `;

        collectionCard.appendChild(leftSide);
        collectionCard.appendChild(rightSide);
        panel.appendChild(collectionCard);
      });
    }

    // Displayed Cars heading
    const displayedHeading = this.uiManager.createHeading('🏛️ Displayed Vehicles', 3, {
      marginTop: '20px',
      marginBottom: '10px',
    });
    panel.appendChild(displayedHeading);

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
