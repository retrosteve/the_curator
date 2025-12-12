import Phaser from 'phaser';
import { GameManager } from '@/core/GameManager';
import { UIManager } from '@/ui/UIManager';
import { TimeSystem } from '@/systems/TimeSystem';
import { getRandomCar, Car } from '@/data/CarDatabase';
import { getRandomRival, calculateRivalInterest } from '@/data/RivalDatabase';

/**
 * Map Node types
 */
interface MapNode {
  id: string;
  name: string;
  x: number;
  y: number;
  type: 'scrapyard' | 'dealership' | 'auction';
  timeCost: number;
  color: number;
}

/**
 * Map Scene - Player explores locations
 */
export class MapScene extends Phaser.Scene {
  private gameManager!: GameManager;
  private uiManager!: UIManager;
  private timeSystem!: TimeSystem;
  private nodes: MapNode[] = [];

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
        timeCost: 2,
        color: 0x8b4513,
      },
      {
        id: 'dealership_1',
        name: 'Classic Car Dealership',
        x: width * 0.75,
        y: height * 0.3,
        type: 'dealership',
        timeCost: 1,
        color: 0x4169e1,
      },
      {
        id: 'auction_1',
        name: 'Weekend Auction House',
        x: width * 0.5,
        y: height * 0.6,
        type: 'auction',
        timeCost: 3,
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
      this.add.text(node.x, node.y, `${node.timeCost}h`, {
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

    // Create HUD
    const hud = this.uiManager.createHUD({
      money: this.gameManager.player.money,
      day: this.gameManager.world.day,
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
    // Check if player has enough time
    if (!this.timeSystem.hasEnoughTime(node.timeCost)) {
      this.uiManager.showModal(
        'Not Enough Time',
        `You don't have enough time today to visit ${node.name}. Consider ending the day.`,
        [{ text: 'OK', onClick: () => {} }]
      );
      return;
    }

    // Advance time
    this.timeSystem.advanceTime(node.timeCost);

    // Generate encounter based on node type
    this.generateEncounter(node);
  }

  private generateEncounter(node: MapNode): void {
    const car = getRandomCar();
    const hasRival = Math.random() > 0.5; // 50% chance of rival

    if (hasRival && node.type === 'auction') {
      // Auction with rival
      const rival = getRandomRival();
      const interest = calculateRivalInterest(rival, car.tags);
      
      this.scene.start('AuctionScene', { car, rival, interest });
    } else {
      // Solo negotiation
      this.showNegotiation(car);
    }
  }

  private showNegotiation(car: Car): void {
    const askingPrice = Math.floor(car.baseValue * (car.condition / 100) * (0.8 + Math.random() * 0.4));

    this.uiManager.showModal(
      `Found: ${car.name}`,
      `Condition: ${car.condition}/100\nAsking Price: $${askingPrice.toLocaleString()}\n\nBuy this car?`,
      [
        {
          text: 'Buy',
          onClick: () => {
            if (this.gameManager.spendMoney(askingPrice)) {
              this.gameManager.addCar(car);
              this.uiManager.showModal(
                'Purchase Complete',
                `You bought ${car.name}!`,
                [{ text: 'OK', onClick: () => {} }]
              );
            } else {
              this.uiManager.showModal(
                'Insufficient Funds',
                "You don't have enough money!",
                [{ text: 'OK', onClick: () => {} }]
              );
            }
          },
        },
        {
          text: 'Pass',
          onClick: () => {},
        },
      ]
    );
  }
}
