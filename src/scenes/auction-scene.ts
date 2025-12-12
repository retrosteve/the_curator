import Phaser from 'phaser';
import { GameManager } from '@/core/game-manager';
import { UIManager } from '@/ui/ui-manager';
import { Car, calculateCarValue } from '@/data/car-database';
import { Rival } from '@/data/rival-database';
import { RivalAI } from '@/systems/rival-ai';

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

  private static readonly KICK_TIRES_BUDGET_REDUCTION = 500;
  private static readonly REQUIRED_EYE_LEVEL_FOR_KICK_TIRES = 2;

  constructor() {
    super({ key: 'AuctionScene' });
  }

  init(data: { car: Car; rival: Rival; interest: number }): void {
    this.car = data.car;
    this.rival = data.rival;
    this.rivalAI = new RivalAI(data.rival, data.interest);
    this.currentBid = Math.floor(calculateCarValue(this.car) * 0.5);
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
      `Budget: $${this.rivalAI.getBudget().toLocaleString()}`
    );

    rivalInfo.appendChild(rivalName);
    rivalInfo.appendChild(rivalPatience);
    rivalInfo.appendChild(rivalBudget);
    panel.appendChild(rivalInfo);

    // Player info
    const player = this.gameManager.getPlayerState();
    const playerInfo = this.uiManager.createText(
      `Your Money: $${player.money.toLocaleString()}`,
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
      'Power Bid +$500 (Rival Patience -20)',
      () => this.playerBid(500, { power: true }),
      { width: '100%', backgroundColor: '#FF9800' }
    );
    buttonContainer.appendChild(powerBidBtn);

    const kickTiresBtn = this.uiManager.createButton(
      'Kick Tires (Eye 2+) (Rival Budget -$500)',
      () => this.playerKickTires(),
      { width: '100%', backgroundColor: '#607D8B' }
    );
    buttonContainer.appendChild(kickTiresBtn);

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

  private playerBid(amount: number, options?: { power?: boolean }): void {
    const newBid = this.currentBid + amount;

    const player = this.gameManager.getPlayerState();

    if (player.money < newBid) {
      this.uiManager.showModal(
        'Insufficient Funds',
        "You don't have enough money for this bid!",
        [{ text: 'OK', onClick: () => {} }]
      );
      return;
    }

    this.currentBid = newBid;

    if (options?.power) {
      this.rivalAI.onPlayerPowerBid();
      if (this.rivalAI.getPatience() <= 0) {
        this.endAuction(true, `${this.rival.name} lost patience and quit!`);
        return;
      }
    }

    // Rival's turn
    this.rivalTurn();
  }

  private playerKickTires(): void {
    const eye = this.gameManager.getPlayerState().skills.eye;
    if (eye < AuctionScene.REQUIRED_EYE_LEVEL_FOR_KICK_TIRES) {
      this.uiManager.showModal(
        'Requires Skill',
        `Kick Tires requires Eye level ${AuctionScene.REQUIRED_EYE_LEVEL_FOR_KICK_TIRES} (you have ${eye}).`,
        [{ text: 'OK', onClick: () => {} }]
      );
      return;
    }

    this.rivalAI.onPlayerKickTires(AuctionScene.KICK_TIRES_BUDGET_REDUCTION);

    if (this.currentBid > this.rivalAI.getBudget()) {
      this.endAuction(true, `${this.rival.name} is out of budget and quits!`);
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
