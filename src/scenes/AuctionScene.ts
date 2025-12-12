import Phaser from 'phaser';
import { GameManager } from '@/core/GameManager';
import { UIManager } from '@/ui/UIManager';
import { Car, calculateCarValue } from '@/data/CarDatabase';
import { Rival } from '@/data/RivalDatabase';
import { RivalAI } from '@/systems/RivalAI';

/**
 * Auction Scene - Turn-based bidding battle
 */
export class AuctionScene extends Phaser.Scene {
  private gameManager!: GameManager;
  private uiManager!: UIManager;
  private car!: Car;
  private rival!: Rival;
  private rivalAI!: RivalAI;
  private currentBid: number = 0;
  private playerStress: number = 0;

  constructor() {
    super({ key: 'AuctionScene' });
  }

  init(data: { car: Car; rival: Rival; interest: number }): void {
    this.car = data.car;
    this.rival = data.rival;
    this.rivalAI = new RivalAI(data.rival, data.interest);
    this.currentBid = Math.floor(calculateCarValue(this.car) * 0.5);
    this.playerStress = 0;
  }

  create(): void {
    console.log('Auction Scene: Loaded');

    this.gameManager = GameManager.getInstance();
    this.uiManager = new UIManager();

    this.setupBackground();
    this.setupUI();
  }

  private setupBackground(): void {
    const { width, height } = this.cameras.main;
    
    const graphics = this.add.graphics();
    graphics.fillGradientStyle(0x8b0000, 0x8b0000, 0x4b0000, 0x4b0000, 1);
    graphics.fillRect(0, 0, width, height);

    this.add.text(width / 2, 30, 'AUCTION BATTLE!', {
      fontSize: '42px',
      color: '#ffd700',
      fontStyle: 'bold',
    }).setOrigin(0.5);
  }

  private setupUI(): void {
    this.uiManager.clear();

    const panel = this.uiManager.createPanel({
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      minWidth: '500px',
    });

    // Car info
    const carHeading = this.uiManager.createHeading(this.car.name, 2, {
      textAlign: 'center',
      color: '#ffd700',
    });
    panel.appendChild(carHeading);

    const carInfo = this.uiManager.createText(
      `Condition: ${this.car.condition}/100 | Base Value: $${this.car.baseValue.toLocaleString()}`,
      { textAlign: 'center', marginBottom: '20px' }
    );
    panel.appendChild(carInfo);

    // Current bid
    const bidHeading = this.uiManager.createHeading(
      `Current Bid: $${this.currentBid.toLocaleString()}`,
      3,
      { textAlign: 'center', color: '#4CAF50' }
    );
    panel.appendChild(bidHeading);

    // Rival info
    const rivalInfo = this.uiManager.createPanel({
      margin: '15px 0',
      backgroundColor: this.rival.avatar || '#666',
    });

    const rivalName = this.uiManager.createText(
      `Rival: ${this.rival.name}`,
      { fontWeight: 'bold' }
    );
    const rivalPatience = this.uiManager.createText(
      `Patience: ${this.rivalAI.getPatience()}/100`
    );
    const rivalBudget = this.uiManager.createText(
      `Budget: $${this.rival.budget.toLocaleString()}`
    );

    rivalInfo.appendChild(rivalName);
    rivalInfo.appendChild(rivalPatience);
    rivalInfo.appendChild(rivalBudget);
    panel.appendChild(rivalInfo);

    // Player info
    const playerInfo = this.uiManager.createText(
      `Your Money: $${this.gameManager.player.money.toLocaleString()} | Stress: ${this.playerStress}/100`,
      { textAlign: 'center', marginBottom: '20px' }
    );
    panel.appendChild(playerInfo);

    // Action buttons
    const buttonContainer = document.createElement('div');
    Object.assign(buttonContainer.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    });

    const bidBtn = this.uiManager.createButton(
      'Bid +$100',
      () => this.playerBid(100),
      { width: '100%', backgroundColor: '#2196F3' }
    );
    buttonContainer.appendChild(bidBtn);

    const powerBidBtn = this.uiManager.createButton(
      'Power Bid +$500 (Stress +20)',
      () => this.playerBid(500, 20),
      { width: '100%', backgroundColor: '#FF9800' }
    );
    buttonContainer.appendChild(powerBidBtn);

    const stallBtn = this.uiManager.createButton(
      'Stall (Rival Patience -20)',
      () => this.playerStall(),
      { width: '100%', backgroundColor: '#9C27B0' }
    );
    buttonContainer.appendChild(stallBtn);

    const quitBtn = this.uiManager.createButton(
      'Quit Auction',
      () => this.playerQuit(),
      { width: '100%', backgroundColor: '#f44336' }
    );
    buttonContainer.appendChild(quitBtn);

    panel.appendChild(buttonContainer);
    this.uiManager.append(panel);
  }

  private playerBid(amount: number, stressCost: number = 0): void {
    const newBid = this.currentBid + amount;

    if (this.gameManager.player.money < newBid) {
      this.uiManager.showModal(
        'Insufficient Funds',
        "You don't have enough money for this bid!",
        [{ text: 'OK', onClick: () => {} }]
      );
      return;
    }

    this.currentBid = newBid;
    this.playerStress += stressCost;

    // Check stress limit
    if (this.playerStress >= 100) {
      this.endAuction(false, 'You became too stressed and had to quit!');
      return;
    }

    // Rival's turn
    this.rivalTurn();
  }

  private playerStall(): void {
    this.rivalAI.onPlayerStall();
    
    if (this.rivalAI.getPatience() <= 0) {
      this.endAuction(true, `${this.rival.name} lost patience and quit!`);
    } else {
      this.setupUI();
    }
  }

  private playerQuit(): void {
    this.endAuction(false, 'You quit the auction.');
  }

  private rivalTurn(): void {
    const decision = this.rivalAI.decideBid(this.currentBid);

    if (!decision.shouldBid) {
      this.endAuction(true, `${this.rival.name} ${decision.reason}!`);
    } else {
      this.currentBid += decision.bidAmount;
      
      setTimeout(() => {
        this.uiManager.showModal(
          'Rival Bids!',
          `${this.rival.name} raised the bid by $${decision.bidAmount}!\n\nNew bid: $${this.currentBid.toLocaleString()}`,
          [
            {
              text: 'Continue',
              onClick: () => this.setupUI(),
            },
          ]
        );
      }, 500);
    }
  }

  private endAuction(playerWon: boolean, message: string): void {
    if (playerWon) {
      if (this.gameManager.spendMoney(this.currentBid)) {
        this.gameManager.addCar(this.car);
        this.uiManager.showModal(
          'You Won!',
          `${message}\n\nYou bought ${this.car.name} for $${this.currentBid.toLocaleString()}!`,
          [
            {
              text: 'Continue',
              onClick: () => this.scene.start('MapScene'),
            },
          ]
        );
      }
    } else {
      this.uiManager.showModal(
        'Auction Lost',
        message,
        [
          {
            text: 'Continue',
            onClick: () => this.scene.start('MapScene'),
          },
        ]
      );
    }
  }
}
