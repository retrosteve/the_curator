import Phaser from 'phaser';
import { GameManager } from '@/core/GameManager';
import { UIManager } from '@/ui/UIManager';
import { TimeSystem } from '@/systems/TimeSystem';
import { eventBus } from '@/core/EventBus';
import { Economy } from '@/systems/Economy';

/**
 * Garage Scene - Player's home base for managing cars
 */
export class GarageScene extends Phaser.Scene {
  private gameManager!: GameManager;
  private uiManager!: UIManager;
  private timeSystem!: TimeSystem;

  constructor() {
    super({ key: 'GarageScene' });
  }

  create(): void {
    console.log('Garage Scene: Loaded');

    this.gameManager = GameManager.getInstance();
    this.uiManager = new UIManager();
    this.timeSystem = new TimeSystem();

    this.setupBackground();
    this.setupUI();
    this.setupEventListeners();
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

    // Create HUD
    const hud = this.uiManager.createHUD({
      money: this.gameManager.player.money,
      day: this.gameManager.world.day,
      time: this.timeSystem.getFormattedTime(),
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
      `View Inventory (${this.gameManager.player.inventory.length} cars)`,
      () => this.showInventory(),
      { width: '100%' }
    );
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
    eventBus.on('money-changed', (money: number) => {
      this.uiManager.updateHUD({ money });
    });

    eventBus.on('time-changed', () => {
      this.uiManager.updateHUD({ time: this.timeSystem.getFormattedTime() });
    });

    eventBus.on('day-changed', (day: number) => {
      this.uiManager.updateHUD({ day });
    });
  }

  private showInventory(): void {
    this.uiManager.clear();

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

    if (this.gameManager.player.inventory.length === 0) {
      const emptyText = this.uiManager.createText('No cars in inventory. Visit the map to find some!', {
        textAlign: 'center',
        fontSize: '16px',
      });
      panel.appendChild(emptyText);
    } else {
      this.gameManager.player.inventory.forEach((car) => {
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

        buttonContainer.appendChild(restoreBtn);
        buttonContainer.appendChild(sellBtn);

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

    const targetCondition = Math.min(car.condition + 20, 100);
    const cost = Economy.getRestorationCost(car, targetCondition);
    const time = Economy.getRestorationTime(car, targetCondition);

    this.uiManager.showModal(
      'Restore Car',
      `Restore ${car.name} from ${car.condition} to ${targetCondition} condition?\n\nCost: $${cost.toLocaleString()}\nTime: ${time} hours`,
      [
        {
          text: 'Confirm',
          onClick: () => {
            if (this.gameManager.spendMoney(cost)) {
              this.timeSystem.advanceTime(time);
              const restoredCar = Economy.restoreCar(car, targetCondition);
              Object.assign(car, restoredCar);
              this.showInventory();
            } else {
              alert('Not enough money!');
            }
          },
        },
        {
          text: 'Cancel',
          onClick: () => this.showInventory(),
        },
      ]
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

  private goToMap(): void {
    this.scene.start('MapScene');
  }

  private endDay(): void {
    this.timeSystem.endDay();
    this.uiManager.showModal(
      'Day Ended',
      `Day ${this.gameManager.world.day - 1} complete!\n\nMoney: $${this.gameManager.player.money.toLocaleString()}\nCars: ${this.gameManager.player.inventory.length}`,
      [
        {
          text: 'Continue',
          onClick: () => this.setupUI(),
        },
      ]
    );
  }
}
