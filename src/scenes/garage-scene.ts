import Phaser from 'phaser';
import { GameManager } from '@/core/game-manager';
import { UIManager } from '@/ui/ui-manager';
import { TimeSystem } from '@/systems/time-system';
import { eventBus } from '@/core/event-bus';
import { Economy } from '@/systems/economy';
import { Car } from '@/data/car-database';
import { GAME_CONFIG } from '@/config/game-config';

/**
 * Garage Scene - Player's home base for managing cars.
 * Hub scene where players can view inventory, restore cars, sell cars, and end the day.
 * Provides access to the map for exploring locations.
 */
export class GarageScene extends Phaser.Scene {
  private gameManager!: GameManager;
  private uiManager!: UIManager;
  private timeSystem!: TimeSystem;

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

    this.setupBackground();
    this.setupUI();
    this.setupEventListeners();

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

    // Go to Map button
    const mapBtn = this.uiManager.createButton(
      'Go to Map',
      () => this.goToMap(),
      { width: '100%' }
    );
    buttonContainer.appendChild(mapBtn);

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

    // Save Game button
    const saveBtn = this.uiManager.createButton(
      'Save Game',
      () => this.saveGame(),
      { width: '100%', backgroundColor: '#27ae60' }
    );
    buttonContainer.appendChild(saveBtn);

    // Load Game button
    const loadBtn = this.uiManager.createButton(
      'Load Game',
      () => this.loadGame(),
      { width: '100%', backgroundColor: '#3498db' }
    );
    buttonContainer.appendChild(loadBtn);

    menuPanel.appendChild(buttonContainer);
    this.uiManager.append(menuPanel);
  }

  private setupEventListeners(): void {
    eventBus.on('money-changed', this.handleMoneyChanged);
    eventBus.on('prestige-changed', this.handlePrestigeChanged);
    eventBus.on('time-changed', this.handleTimeChanged);
    eventBus.on('day-changed', this.handleDayChanged);
    eventBus.on('location-changed', this.handleLocationChanged);
    eventBus.on('inventory-changed', this.handleInventoryChanged);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      eventBus.off('money-changed', this.handleMoneyChanged);
      eventBus.off('prestige-changed', this.handlePrestigeChanged);
      eventBus.off('time-changed', this.handleTimeChanged);
      eventBus.off('day-changed', this.handleDayChanged);
      eventBus.off('location-changed', this.handleLocationChanged);
      eventBus.off('inventory-changed', this.handleInventoryChanged);
    });
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
        buttonContainer.appendChild(sellBtn);
        buttonContainer.appendChild(sellAsIsBtn);

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
          const result = Economy.performRestoration(car, opt);
          this.gameManager.updateCar(result.car);
          this.uiManager.showModal(
            'Restoration Result',
            result.message,
            [{ text: 'OK', onClick: () => this.showInventory() }]
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
    this.scene.start('MapScene');
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

  private saveGame(): void {
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
  }

  private loadGame(): void {
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
    const player = this.gameManager.getPlayerState();
    return player.inventory.filter(car => {
      const value = Economy.getSalePrice(car, this.gameManager);
      return car.condition >= 80 && value >= 50000;
    });
  }

  private getMuseumPrestigeBonus(): number {
    const museumCars = this.getMuseumCars();
    // Simple bonus: 1 prestige per museum car per day
    return museumCars.length;
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
    const statsText = this.uiManager.createText(
      `Museum Cars: ${museumCars.length} | Daily Prestige Bonus: +${prestigeBonus}`,
      { textAlign: 'center', fontWeight: 'bold', marginBottom: '20px' }
    );
    panel.appendChild(statsText);

    if (museumCars.length === 0) {
      const emptyText = this.uiManager.createText(
        'No cars in your museum yet. Restore cars to excellent condition (80%+) and high value ($50k+) to display them here!',
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
          `Condition: ${car.condition}/100 | Value: $${Economy.getSalePrice(car, this.gameManager).toLocaleString()} | Tags: ${car.tags.join(', ')}`,
          { fontSize: '14px' }
        );

        carPanel.appendChild(carName);
        carPanel.appendChild(carDetails);
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
