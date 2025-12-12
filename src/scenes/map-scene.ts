import Phaser from 'phaser';
import { GameManager } from '@/core/game-manager';
import { UIManager } from '@/ui/ui-manager';
import { TimeSystem } from '@/systems/time-system';
import { getRandomCar, Car } from '@/data/car-database';
import { getRandomRival, calculateRivalInterest } from '@/data/rival-database';
import { eventBus } from '@/core/event-bus';

/**
 * Map Node configuration.
 * Represents a location on the map that the player can visit.
 */
interface MapNode {
  id: string;
  name: string;
  x: number;
  y: number;
  type: 'scrapyard' | 'dealership' | 'auction';
  color: number;
}

// Time costs for different map actions (in hours)
const TRAVEL_HOURS = 1;
const INSPECT_HOURS = 0.5;
const AUCTION_HOURS = 2;

/**
 * Map Scene - Player explores locations and finds cars.
 * Displays clickable nodes representing different locations.
 * Each visit costs time and may result in auction (PvP) or negotiation (PvE).
 */
export class MapScene extends Phaser.Scene {
  private gameManager!: GameManager;
  private uiManager!: UIManager;
  private timeSystem!: TimeSystem;
  private nodes: MapNode[] = [];

  // Event handler methods as arrow functions for proper 'this' binding
  private readonly handleMoneyChanged = (money: number): void => {
    this.uiManager.updateHUD({ money });
  };

  private readonly handleTimeChanged = (_timeOfDay: number): void => {
    this.uiManager.updateHUD({ time: this.timeSystem.getFormattedTime() });
  };

  private readonly handleDayChanged = (day: number): void => {
    this.uiManager.updateHUD({ day });
  };

  constructor() {
    super({ key: 'MapScene' });
  }

  create(): void {
    console.log('Map Scene: Loaded');

    this.gameManager = GameManager.getInstance();
    this.uiManager = new UIManager();
    this.timeSystem = new TimeSystem();

    this.setupBackground();
    this.createMapNodes();
    this.setupUI();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    eventBus.on('money-changed', this.handleMoneyChanged);
    eventBus.on('time-changed', this.handleTimeChanged);
    eventBus.on('day-changed', this.handleDayChanged);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      eventBus.off('money-changed', this.handleMoneyChanged);
      eventBus.off('time-changed', this.handleTimeChanged);
      eventBus.off('day-changed', this.handleDayChanged);
    });
  }

  private setupBackground(): void {
    const { width, height } = this.cameras.main;
    
    const graphics = this.add.graphics();
    graphics.fillGradientStyle(0x1a1a2e, 0x1a1a2e, 0x16213e, 0x16213e, 1);
    graphics.fillRect(0, 0, width, height);

    this.add.text(width / 2, 30, 'THE MAP', {
      fontSize: '36px',
      color: '#eee',
      fontStyle: 'bold',
    }).setOrigin(0.5);
  }

  private createMapNodes(): void {
    const { width, height } = this.cameras.main;

    this.nodes = [
      {
        id: 'scrapyard_1',
        name: "Joe's Scrapyard",
        x: width * 0.25,
        y: height * 0.3,
        type: 'scrapyard',
        color: 0x8b4513,
      },
      {
        id: 'dealership_1',
        name: 'Classic Car Dealership',
        x: width * 0.75,
        y: height * 0.3,
        type: 'dealership',
        color: 0x4169e1,
      },
      {
        id: 'auction_1',
        name: 'Weekend Auction House',
        x: width * 0.5,
        y: height * 0.6,
        type: 'auction',
        color: 0xffd700,
      },
    ];

    this.nodes.forEach((node) => {
      // Draw node circle
      const circle = this.add.circle(node.x, node.y, 40, node.color);
      circle.setInteractive({ useHandCursor: true });

      // Add label
      this.add.text(node.x, node.y + 60, node.name, {
        fontSize: '14px',
        color: '#fff',
        align: 'center',
        wordWrap: { width: 150 },
      }).setOrigin(0.5);

      // Add time cost
      this.add.text(node.x, node.y, `${TRAVEL_HOURS}h`, {
        fontSize: '18px',
        color: '#fff',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      // Click handler
      circle.on('pointerdown', () => this.visitNode(node));
      
      // Hover effects
      circle.on('pointerover', () => {
        circle.setScale(1.1);
      });
      
      circle.on('pointerout', () => {
        circle.setScale(1);
      });
    });
  }

  private setupUI(): void {
    this.uiManager.clear();

    const player = this.gameManager.getPlayerState();
    const world = this.gameManager.getWorldState();

    // Create HUD
    const hud = this.uiManager.createHUD({
      money: player.money,
      day: world.day,
      time: this.timeSystem.getFormattedTime(),
    });
    this.uiManager.append(hud);

    // Back to garage button
    const backBtn = this.uiManager.createButton(
      'Back to Garage',
      () => this.scene.start('GarageScene'),
      {
        position: 'absolute',
        bottom: '20px',
        right: '20px',
      }
    );
    this.uiManager.append(backBtn);
  }

  private visitNode(node: MapNode): void {
    const requiredHours = TRAVEL_HOURS;

    // Check if player has enough time
    if (!this.timeSystem.hasEnoughTime(requiredHours)) {
      this.uiManager.showModal(
        'Not Enough Time',
        `You don't have enough time today to visit ${node.name}. Consider ending the day.`,
        [{ text: 'OK', onClick: () => {} }]
      );
      return;
    }

    // Advance time
    this.timeSystem.advanceTime(requiredHours);

    // Generate encounter based on node type
    this.generateEncounter(node);
  }

  private generateEncounter(node: MapNode): void {
    const car = getRandomCar();
    const hasRival = Math.random() > 0.5; // 50% chance of rival

    if (hasRival && node.type === 'auction') {
      // Auction consumes additional time
      if (!this.timeSystem.hasEnoughTime(AUCTION_HOURS)) {
        this.uiManager.showModal(
          'Not Enough Time',
          "You don't have enough time today for an auction. Consider ending the day.",
          [{ text: 'OK', onClick: () => {} }]
        );
        return;
      }

      this.timeSystem.advanceTime(AUCTION_HOURS);

      // Auction with rival
      const rival = getRandomRival();
      const interest = calculateRivalInterest(rival, car.tags);
      
      this.scene.start('AuctionScene', { car, rival, interest });
    } else {
      // Negotiation consumes inspection time
      if (!this.timeSystem.hasEnoughTime(INSPECT_HOURS)) {
        this.uiManager.showModal(
          'Not Enough Time',
          "You don't have enough time today to inspect this car. Consider ending the day.",
          [{ text: 'OK', onClick: () => {} }]
        );
        return;
      }

      this.timeSystem.advanceTime(INSPECT_HOURS);

      // Solo negotiation
      this.scene.start('NegotiationScene', { car });
    }
  }
}
