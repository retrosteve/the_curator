import Phaser from 'phaser';
import { GameManager } from '@/core/game-manager';
import { UIManager } from '@/ui/ui-manager';
import { TimeSystem } from '@/systems/time-system';
import { eventBus } from '@/core/event-bus';
import { Economy } from '@/systems/economy';
import { Car } from '@/data/car-database';
import { GAME_CONFIG } from '@/config/game-config';
import { TutorialManager } from '@/systems/tutorial-manager';

/**
 * Garage Scene - Player's home base for managing cars.
 * Hub scene where players can view inventory, restore cars, sell cars, and end the day.
 * Provides access to the map for exploring locations.
 */
export class GarageScene extends Phaser.Scene {
  private gameManager!: GameManager;
  private uiManager!: UIManager;
  private timeSystem!: TimeSystem;
  private tutorialManager!: TutorialManager;

  private autoEndDayOnEnter: boolean = false;

  private inventoryButton?: HTMLButtonElement;
  private currentView: 'menu' | 'inventory' | 'museum' = 'menu';

  // Event handler methods stored as arrow functions to preserve 'this' binding
  // This allows proper cleanup when scene shuts down
  private readonly handleMoneyChanged = (money: number): void => {
    this.uiManager.updateHUD({ money });
  };

  private readonly handlePrestigeChanged = (prestige: number): void => {
    this.uiManager.updateHUD({ prestige });
  };

  private readonly handleTimeChanged = (_timeOfDay: number): void => {
    this.uiManager.updateHUD({ time: this.timeSystem.getFormattedTime() });
  };

  private readonly handleDayChanged = (day: number): void => {
    this.uiManager.updateHUD({ day });
  };

  private readonly handleLocationChanged = (location: string): void => {
    this.uiManager.updateHUD({ location });
  };

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

  private readonly handleShowDialogue = (data: { speaker: string; text: string }): void => {
    try {
      this.uiManager.showModal(data.speaker, data.text, [{ text: 'OK', onClick: () => {
        // Tutorial dialogue acknowledged - no automatic advancement here
        // Tutorial will advance based on player actions (visit scrapyard, inspect, buy, etc.)
      }}]);
    } catch (error) {
      console.error('Error showing tutorial dialogue:', error);
    }
  };

  private readonly handleVictory = (victoryResult: any): void => {
    const { prestige, unicorns, museumCars, skillLevel } = victoryResult;
    
    const message = `🏆 CONGRATULATIONS! 🏆\n\nYou've become the world's greatest car curator!\n\n` +
      `✓ Prestige: ${prestige.current.toLocaleString()} (Required: ${prestige.required.toLocaleString()})\n` +
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

  constructor() {
    super({ key: 'GarageScene' });
  }

  init(data?: { autoEndDay?: boolean }): void {
    this.autoEndDayOnEnter = Boolean(data?.autoEndDay);
  }

  create(): void {
    console.log('Garage Scene: Loaded');

    this.gameManager = GameManager.getInstance();
    this.gameManager.setLocation('garage');
    this.uiManager = new UIManager();
    this.timeSystem = new TimeSystem();
    this.tutorialManager = TutorialManager.getInstance();

    this.setupBackground();
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

  private setupBackground(): void {
    // Create simple gradient background
    const { width, height } = this.cameras.main;
    
    const graphics = this.add.graphics();
    graphics.fillGradientStyle(0x2c3e50, 0x2c3e50, 0x34495e, 0x34495e, 1);
    graphics.fillRect(0, 0, width, height);

    // Add title text (using Phaser text for scene title only)
    this.add.text(width / 2, 50, 'THE GARAGE', {
      fontSize: '48px',
      color: '#ecf0f1',
      fontStyle: 'bold',
    }).setOrigin(0.5);
  }

  private setupUI(): void {
    this.uiManager.clear();
    this.currentView = 'menu';

    const player = this.gameManager.getPlayerState();
    const world = this.gameManager.getWorldState();

    // Create HUD
    const hud = this.uiManager.createHUD({
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
    this.uiManager.append(hud);

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

    // Button container
    const buttonContainer = document.createElement('div');
    Object.assign(buttonContainer.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    });

    // Go to Map button (primary action)
    const mapBtn = this.uiManager.createButton(
      'Go to Map',
      () => this.goToMap(),
      { width: '100%' }
    );
    buttonContainer.appendChild(mapBtn);

    // View Inventory button
    const inventoryBtn = this.uiManager.createButton(
      `View Inventory (${player.inventory.length} cars)`,
      () => this.showInventory(),
      { width: '100%' }
    );
    this.inventoryButton = inventoryBtn;
    buttonContainer.appendChild(inventoryBtn);

    // View Museum button
    const museumCars = this.getMuseumCars();
    const museumBtn = this.uiManager.createButton(
      `View Museum (${museumCars.length} cars)`,
      () => this.showMuseum(),
      { width: '100%', backgroundColor: '#f39c12' }
    );
    buttonContainer.appendChild(museumBtn);

    // End Day button
    const endDayBtn = this.uiManager.createButton(
      'End Day',
      () => this.endDay(),
      { width: '100%', backgroundColor: '#e74c3c' }
    );
    buttonContainer.appendChild(endDayBtn);

    // Upgrade Garage button (if available)
    const upgradeCost = this.gameManager.getNextGarageSlotCost();
    if (upgradeCost !== null) {
      const upgradeBtn = this.uiManager.createButton(
        `Upgrade Garage (${upgradeCost} Prestige)`,
        () => this.upgradeGarage(),
        { width: '100%', backgroundColor: '#9b59b6' }
      );
      buttonContainer.appendChild(upgradeBtn);
    }

    // Victory Progress button
    const victoryBtn = this.uiManager.createButton(
      'Check Victory Progress',
      () => this.showVictoryProgress(),
      { width: '100%', backgroundColor: '#f39c12' }
    );
    buttonContainer.appendChild(victoryBtn);

    // Game Menu button (Save, Load, Return to Main Menu)
    const menuBtn = this.uiManager.createButton(
      '⚙ Menu',
      () => this.showGameMenu(),
      { width: '100%', backgroundColor: '#34495e' }
    );
    buttonContainer.appendChild(menuBtn);

    menuPanel.appendChild(buttonContainer);
    this.uiManager.append(menuPanel);
  }

  private setupEventListeners(): void {
    // Clean up existing listeners first to avoid duplicates
    this.cleanupEventListeners();
    
    eventBus.on('money-changed', this.handleMoneyChanged);
    eventBus.on('prestige-changed', this.handlePrestigeChanged);
    eventBus.on('time-changed', this.handleTimeChanged);
    eventBus.on('day-changed', this.handleDayChanged);
    eventBus.on('location-changed', this.handleLocationChanged);
    eventBus.on('inventory-changed', this.handleInventoryChanged);
    eventBus.on('show-dialogue', this.handleShowDialogue);
    eventBus.on('victory', this.handleVictory);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanupEventListeners();
    });
  }

  private cleanupEventListeners(): void {
    eventBus.off('money-changed', this.handleMoneyChanged);
    eventBus.off('prestige-changed', this.handlePrestigeChanged);
    eventBus.off('time-changed', this.handleTimeChanged);
    eventBus.off('day-changed', this.handleDayChanged);
    eventBus.off('location-changed', this.handleLocationChanged);
    eventBus.off('inventory-changed', this.handleInventoryChanged);
    eventBus.off('show-dialogue', this.handleShowDialogue);
    eventBus.off('victory', this.handleVictory);
  }

  private initializeTutorial(): void {
    try {
      if (!this.tutorialManager) {
        console.warn('TutorialManager not initialized');
        return;
      }
      
      // Start tutorial for new players (day 1, no cars, no prestige)
      const player = this.gameManager.getPlayerState();
      const world = this.gameManager.getWorldState();
      
      if (world.day === 1 && player.inventory.length === 0 && player.prestige === 0) {
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
    const world = this.gameManager.getWorldState();

    const hud = this.uiManager.createHUD({
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
    this.uiManager.append(hud);

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
      // Tutorial guidance: first car in inventory
      if (this.tutorialManager.isTutorialActive() && this.tutorialManager.getCurrentStep() === 'first_buy') {
        setTimeout(() => {
          this.uiManager.showModal(
            'Your First Car!',
            'Click the "Restore" button on your car below to improve its condition. Choose a service - higher quality costs more but gives better results. This will advance time.',
            [{ text: 'Start Restoring', onClick: () => {} }]
          );
        }, 500);
      }

      player.inventory.forEach((car) => {
        const carPanel = this.uiManager.createPanel({
          margin: '10px 0',
          backgroundColor: 'rgba(52, 73, 94, 0.6)',
        });

        const carName = this.uiManager.createHeading(car.name, 3);
        const carCondition = this.uiManager.createText(
          `Condition: ${car.condition}/100`
        );
        const carValue = this.uiManager.createText(
          `Value: $${Economy.getSalePrice(car, this.gameManager).toLocaleString()}`
        );

        const buttonContainer = document.createElement('div');
        Object.assign(buttonContainer.style, {
          display: 'flex',
          gap: '10px',
          marginTop: '10px',
          flexWrap: 'wrap',
        });

        const restoreBtn = this.uiManager.createButton(
          'Restore',
          () => this.restoreCar(car.id)
        );
        const sellBtn = this.uiManager.createButton(
          'Sell',
          () => this.sellCar(car.id),
          { backgroundColor: '#27ae60' }
        );
        const sellAsIsBtn = this.uiManager.createButton(
          'Sell As-Is',
          () => this.sellCarAsIs(car.id),
          { backgroundColor: '#e67e22' }
        );

        buttonContainer.appendChild(restoreBtn);

        // Museum display toggle button
        const isMuseumEligible = this.gameManager.isMuseumEligible(car);
        const isDisplayed = car.displayInMuseum === true;
        
        if (isMuseumEligible) {
          const museumBtn = this.uiManager.createButton(
            isDisplayed ? '✓ In Museum' : 'Display in Museum',
            () => {
              const result = this.gameManager.toggleMuseumDisplay(car.id);
              if (result.success) {
                this.showInventory(); // Refresh view
              } else {
                this.uiManager.showModal('Cannot Display', result.message, [
                  { text: 'OK', onClick: () => {} },
                ]);
              }
            },
            isDisplayed ? { backgroundColor: '#f39c12', border: '2px solid #f1c40f' } : {}
          );
          buttonContainer.appendChild(museumBtn);
          buttonContainer.appendChild(sellBtn);
          buttonContainer.appendChild(sellAsIsBtn);
        } else {
          buttonContainer.appendChild(sellBtn);
          buttonContainer.appendChild(sellAsIsBtn);
          
          // Show why not eligible (below buttons)
          const notEligibleText = this.uiManager.createText(
            `Requires 80%+ condition for museum display (currently ${car.condition}%)`,
            { fontSize: '12px', color: '#95a5a6', fontStyle: 'italic', marginTop: '5px' }
          );
          
          carPanel.appendChild(carName);
          carPanel.appendChild(carCondition);
          carPanel.appendChild(carValue);
          carPanel.appendChild(buttonContainer);
          carPanel.appendChild(notEligibleText);
          panel.appendChild(carPanel);
          return; // Skip to next car in forEach
        }

        carPanel.appendChild(carName);
        carPanel.appendChild(carCondition);
        carPanel.appendChild(carValue);
        carPanel.appendChild(buttonContainer);
        panel.appendChild(carPanel);
      });
    }

    const backBtn = this.uiManager.createButton(
      'Back',
      () => this.setupUI(),
      { width: '100%', marginTop: '20px' }
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
    const modalOptions = options.map(opt => ({
      text: `${opt.name} ($${opt.cost.toLocaleString()} | ${opt.time}h) - ${opt.description} ${opt.risk ? `[WARNING: ${opt.risk}]` : ''}`,
      onClick: () => {
        const block = this.timeSystem.getTimeBlockModal(opt.time, `restoring ${car.name}`);
        if (block) {
          this.uiManager.showModal(block.title, block.message, [{ text: 'OK', onClick: () => {} }]);
          return;
        }
        if (this.gameManager.spendMoney(opt.cost)) {
          this.timeSystem.advanceTime(opt.time);
          
          // Tutorial override: first restoration always succeeds (ignore Cheap Charlie risk)
          const isTutorialFirstRestore = this.tutorialManager.isTutorialActive() && this.tutorialManager.getCurrentStep() === 'first_buy';
          const result = Economy.performRestoration(car, opt, isTutorialFirstRestore);
          this.gameManager.updateCar(result.car);
          
          // Tutorial trigger: first restore
          if (isTutorialFirstRestore) {
            this.tutorialManager.advanceStep('first_restore');
          }
          
          this.uiManager.showModal(
            'Restoration Result',
            result.message,
            [{
              text: 'OK',
              onClick: () => {
                // Tutorial: Auto-sell the first car after restoration
                if (this.tutorialManager.isTutorialActive() && this.tutorialManager.getCurrentStep() === 'first_restore') {
                  this.showInventory();
                  // Auto-trigger the sale
                  setTimeout(() => {
                    const restoredCar = this.gameManager.getCar(car.id);
                    if (restoredCar) {
                      const salePrice = Economy.getSalePrice(restoredCar, this.gameManager);
                      this.uiManager.showModal(
                        'Tutorial: Your First Sale',
                        `An NPC buyer saw your ${restoredCar.name} and wants to buy it immediately for $${salePrice.toLocaleString()}!\n\nThis is how you flip cars for profit: Buy low, restore, sell high.`,
                        [{
                          text: 'Sell to Buyer',
                          onClick: () => {
                            this.gameManager.addMoney(salePrice);
                            this.gameManager.removeCar(car.id);
                            this.tutorialManager.advanceStep('first_flip');
                            
                            // Show next tutorial guidance
                            setTimeout(() => {
                              this.uiManager.showModal(
                                'Tutorial Complete: Basic Loop',
                                `Great work! You've completed your first car deal and made a profit.\n\nNow let's try something more challenging. Click "Go to Map" to find another opportunity - but this time, you'll face competition from other collectors!`,
                                [{ text: 'Continue', onClick: () => this.setupUI() }]
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
              }
            }]
          );
        } else {
          this.uiManager.showModal(
            'Not Enough Money',
            "You don't have enough money for that service.",
            [{ text: 'OK', onClick: () => {} }]
          );
        }
      }
    }));

    modalOptions.push({
      text: 'Cancel',
      onClick: () => this.showInventory(),
    });

    this.uiManager.showModal(
      'Select Restoration Service',
      `Choose a specialist for ${car.name} (Current: ${car.condition}/100):`,
      modalOptions
    );
  }

  private sellCar(carId: string): void {
    const car = this.gameManager.getCar(carId);
    if (!car) return;

    const salePrice = Economy.getSalePrice(car, this.gameManager);

    this.uiManager.showModal(
      'Sell Car',
      `Sell ${car.name} for $${salePrice.toLocaleString()}?`,
      [
        {
          text: 'Sell',
          onClick: () => {
            this.gameManager.addMoney(salePrice);
            this.gameManager.removeCar(carId);
            
            // Tutorial trigger: first flip
            if (this.tutorialManager.isTutorialActive() && this.tutorialManager.getCurrentStep() === 'first_restore') {
              this.tutorialManager.advanceStep('first_flip');
            }
            
            this.showInventory();
          },
        },
        {
          text: 'Cancel',
          onClick: () => this.showInventory(),
        },
      ]
    );
  }

  private showVictoryProgress(): void {
    const victoryResult = this.gameManager.checkVictory();
    const { prestige, unicorns, museumCars, skillLevel } = victoryResult;

    const checkMark = (met: boolean) => met ? '✓' : '✗';
    
    const message = 
      `${checkMark(prestige.met)} Prestige: ${prestige.current.toLocaleString()} / ${prestige.required.toLocaleString()}\n` +
      `${checkMark(unicorns.met)} Unicorn Cars in Museum: ${unicorns.current} / ${unicorns.required}\n` +
      `${checkMark(museumCars.met)} Total Museum Cars (80%+): ${museumCars.current} / ${museumCars.required}\n` +
      `${checkMark(skillLevel.met)} Max Skill Level: ${skillLevel.current} / ${skillLevel.required}\n\n` +
      (victoryResult.hasWon 
        ? '🎉 All conditions met! End the day to claim victory!' 
        : 'Keep building your collection to achieve victory!');

    this.uiManager.showModal(
      'Victory Progress',
      message,
      [{ text: 'Close', onClick: () => {} }]
    );
  }

  private sellCarAsIs(carId: string): void {
    const car = this.gameManager.getCar(carId);
    if (!car) return;

    const salePrice = Math.floor(Economy.getSalePrice(car, this.gameManager) * GAME_CONFIG.economy.sellAsIsMultiplier);

    this.uiManager.showModal(
      'Sell As-Is',
      `Quick sell ${car.name} for $${salePrice.toLocaleString()}? (70% Value)`,
      [
        {
          text: 'Sell',
          onClick: () => {
            this.gameManager.addMoney(salePrice);
            this.gameManager.removeCar(carId);
            this.showInventory();
          },
        },
        {
          text: 'Cancel',
          onClick: () => this.showInventory(),
        },
      ]
    );
  }

  private goToMap(): void {
    try {
      // Tutorial trigger: first visit to scrapyard
      if (this.tutorialManager && this.tutorialManager.isTutorialActive() && this.tutorialManager.getCurrentStep() === 'intro') {
        this.tutorialManager.advanceStep('first_visit_scrapyard');
      }
      
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
          `You can't pay today's rent ($${rent.toLocaleString()}).\n\nGame Over.`,
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
          text: `Take Bank Loan (+$${loanAmount.toLocaleString()})`,
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
        `Daily rent is $${rent.toLocaleString()}, but you only have $${playerBefore.money.toLocaleString()} (short $${shortfall.toLocaleString()}).\n\nSell a car or take a bank loan to avoid bankruptcy.`,
        buttons
      );

      return;
    }

    const result = this.timeSystem.endDay();

    if (result.bankrupt) {
      // Defensive: this should be prevented by the rent pre-check above.
      this.uiManager.showModal(
        'Bankrupt',
        `You can't pay today's rent ($${result.requiredRent.toLocaleString()}).\n\nGame Over.`,
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
      `Welcome to Day ${world.day}!\nDaily Rent Paid: $${result.rentPaid.toLocaleString()}\n\nMoney: $${player.money.toLocaleString()}\nCars: ${player.inventory.length}`,
      [
        {
          text: 'Continue',
          onClick: () => this.setupUI(),
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
      const player = this.gameManager.getPlayerState();
      const world = this.gameManager.getWorldState();
      eventBus.emit('money-changed', player.money);
      eventBus.emit('prestige-changed', player.prestige);
      eventBus.emit('inventory-changed', player.inventory);
      eventBus.emit('day-changed', world.day);
      eventBus.emit('time-changed', world.timeOfDay);
      eventBus.emit('location-changed', world.currentLocation);

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

  private startNewGame(): void {
    this.uiManager.showModal(
      'Start New Game',
      'This will reset your progress and start the tutorial. Are you sure?',
      [
        {
          text: 'Cancel',
          onClick: () => {}
        },
        {
          text: 'Start New Game',
          onClick: () => {
            this.gameManager.reset();
            this.setupEventListeners(); // Re-setup event listeners after reset
            this.setupUI();
            this.initializeTutorial(); // Start tutorial after UI is ready
          }
        }
      ]
    );
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

    const player = this.gameManager.getPlayerState();
    const world = this.gameManager.getWorldState();
    const museumCars = this.getMuseumCars();
    const prestigeBonus = this.getMuseumPrestigeBonus();

    const hud = this.uiManager.createHUD({
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
    this.uiManager.append(hud);

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
      'Cars with 80%+ condition can be displayed. Go to Inventory to add/remove cars from display.',
      { textAlign: 'center', fontSize: '14px', color: '#95a5a6', marginBottom: '20px' }
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
        const carPanel = this.uiManager.createPanel({
          margin: '15px 0',
          backgroundColor: 'rgba(243, 156, 18, 0.1)',
          border: '2px solid #f39c12',
        });

        const carName = this.uiManager.createHeading(car.name, 3, {
          color: '#f39c12',
        });
        const carDetails = this.uiManager.createText(
          `Tier: ${car.tier} | Condition: ${car.condition}/100 | Value: $${Economy.getSalePrice(car, this.gameManager).toLocaleString()}`,
          { fontSize: '14px' }
        );
        const carTags = this.uiManager.createText(
          `Tags: ${car.tags.join(', ')}`,
          { fontSize: '13px', color: '#bdc3c7', marginTop: '5px' }
        );

        const removeBtn = this.uiManager.createButton(
          'Remove from Display',
          () => {
            this.gameManager.toggleMuseumDisplay(car.id);
            this.showMuseum(); // Refresh museum view
          },
          { marginTop: '10px', backgroundColor: '#c0392b' }
        );

        carPanel.appendChild(carName);
        carPanel.appendChild(carDetails);
        carPanel.appendChild(carTags);
        carPanel.appendChild(removeBtn);
        panel.appendChild(carPanel);
      });
    }

    // Back button
    const backBtn = this.uiManager.createButton(
      'Back to Garage',
      () => this.setupUI(),
      { marginTop: '20px' }
    );
    panel.appendChild(backBtn);

    this.uiManager.append(panel);
  }
}
