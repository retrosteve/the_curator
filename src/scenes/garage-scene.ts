import Phaser from 'phaser';
import { GameManager } from '@/core/game-manager';
import { UIManager } from '@/ui/ui-manager';
import { TimeSystem } from '@/systems/time-system';
import { eventBus } from '@/core/event-bus';
import { Economy } from '@/systems/economy';
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
  private currentView: 'menu' | 'inventory' = 'menu';

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
    if (this.inventoryButton) {
      this.inventoryButton.textContent = `View Inventory (${this.gameManager.getPlayerState().inventory.length} cars)`;
    }

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
          `Value: $${Economy.getSalePrice(car).toLocaleString()}`
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

    const salePrice = Economy.getSalePrice(car);

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

    const salePrice = Math.floor(Economy.getSalePrice(car) * GAME_CONFIG.economy.sellAsIsMultiplier);

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
}
