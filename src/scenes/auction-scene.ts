import Phaser from 'phaser';
import { GameManager } from '@/core/game-manager';
import { UIManager } from '@/ui/ui-manager';
import { TimeSystem } from '@/systems/time-system';
import { Car, calculateCarValue } from '@/data/car-database';
import { Rival } from '@/data/rival-database';
import { RivalAI } from '@/systems/rival-ai';
import { eventBus } from '@/core/event-bus';
import { GAME_CONFIG } from '@/config/game-config';
import { TutorialManager } from '@/systems/tutorial-manager';

/**
 * Auction Scene - Turn-based bidding battle against a rival.
 * Player uses various tactics (bid, power bid, stall, kick tires) to win the car.
 * Rival patience and budget determine when they quit.
 */
export class AuctionScene extends Phaser.Scene {
  private gameManager!: GameManager;
  private uiManager!: UIManager;
  private timeSystem!: TimeSystem;
  private tutorialManager!: TutorialManager;
  private car!: Car;
  private rival!: Rival;
  private rivalAI!: RivalAI;
  private currentBid: number = 0;

  private stallUsesThisAuction: number = 0;

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

  private static readonly STARTING_BID_MULTIPLIER = GAME_CONFIG.auction.startingBidMultiplier;
  private static readonly BID_INCREMENT = GAME_CONFIG.auction.bidIncrement;
  private static readonly POWER_BID_INCREMENT = GAME_CONFIG.auction.powerBidIncrement;
  private static readonly POWER_BID_PATIENCE_PENALTY = GAME_CONFIG.auction.powerBidPatiencePenalty;
  private static readonly STALL_PATIENCE_PENALTY = GAME_CONFIG.auction.stallPatiencePenalty;

  private static readonly KICK_TIRES_BUDGET_REDUCTION = GAME_CONFIG.auction.kickTires.rivalBudgetReduction;
  private static readonly REQUIRED_EYE_LEVEL_FOR_KICK_TIRES = GAME_CONFIG.auction.kickTires.requiredEyeLevel;

  private static readonly REQUIRED_TONGUE_LEVEL_FOR_STALL = GAME_CONFIG.auction.stall.requiredTongueLevel;

  constructor() {
    super({ key: 'AuctionScene' });
  }

  init(data: { car: Car; rival: Rival; interest: number }): void {
    this.car = data.car;
    this.rival = data.rival;
    this.rivalAI = new RivalAI(data.rival, data.interest);
    this.currentBid = Math.floor(calculateCarValue(this.car) * AuctionScene.STARTING_BID_MULTIPLIER);
    this.stallUsesThisAuction = 0;
  }

  create(): void {
    console.log('Auction Scene: Loaded');

    this.gameManager = GameManager.getInstance();
    this.gameManager.setLocation('auction');
    this.uiManager = new UIManager();
    this.timeSystem = new TimeSystem();
    this.tutorialManager = TutorialManager.getInstance();

    this.setupBackground();
    this.setupUI();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    eventBus.on('money-changed', this.handleMoneyChanged);
    eventBus.on('prestige-changed', this.handlePrestigeChanged);
    eventBus.on('time-changed', this.handleTimeChanged);
    eventBus.on('day-changed', this.handleDayChanged);
    eventBus.on('location-changed', this.handleLocationChanged);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      eventBus.off('money-changed', this.handleMoneyChanged);
      eventBus.off('prestige-changed', this.handlePrestigeChanged);
      eventBus.off('time-changed', this.handleTimeChanged);
      eventBus.off('day-changed', this.handleDayChanged);
      eventBus.off('location-changed', this.handleLocationChanged);
    });
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
    const rivalTier = this.uiManager.createText(
      `Tier: ${this.getTierName(this.rival.tier)}`,
      { fontSize: '14px', color: '#ccc' }
    );
    const rivalPatience = this.uiManager.createText(
      `Patience: ${this.rivalAI.getPatience()}/100`
    );
    const rivalBudget = this.uiManager.createText(
      `Budget: $${this.rivalAI.getBudget().toLocaleString()}`
    );

    rivalInfo.appendChild(rivalName);
    rivalInfo.appendChild(rivalTier);
    rivalInfo.appendChild(rivalPatience);
    rivalInfo.appendChild(rivalBudget);
    panel.appendChild(rivalInfo);

    // Player info
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
      `Bid +$${AuctionScene.BID_INCREMENT.toLocaleString()}`,
      () => this.playerBid(AuctionScene.BID_INCREMENT),
      { width: '100%', backgroundColor: '#2196F3' }
    );
    buttonContainer.appendChild(bidBtn);

    const powerBidBtn = this.uiManager.createButton(
      `Power Bid +$${AuctionScene.POWER_BID_INCREMENT.toLocaleString()} (Rival Patience -${AuctionScene.POWER_BID_PATIENCE_PENALTY})`,
      () => this.playerBid(AuctionScene.POWER_BID_INCREMENT, { power: true }),
      { width: '100%', backgroundColor: '#FF9800' }
    );
    buttonContainer.appendChild(powerBidBtn);

    const kickTiresBtn = this.uiManager.createButton(
      `Kick Tires (Eye ${AuctionScene.REQUIRED_EYE_LEVEL_FOR_KICK_TIRES}+) (Rival Budget -$${AuctionScene.KICK_TIRES_BUDGET_REDUCTION.toLocaleString()})`,
      () => this.playerKickTires(),
      { width: '100%', backgroundColor: '#607D8B' }
    );
    buttonContainer.appendChild(kickTiresBtn);

    const maxStalls = player.skills.tongue;
    const stallsRemaining = Math.max(0, maxStalls - this.stallUsesThisAuction);
    const stallBtn = this.uiManager.createButton(
      `Stall (Tongue ${AuctionScene.REQUIRED_TONGUE_LEVEL_FOR_STALL}+) (Uses left: ${stallsRemaining}) (Rival Patience -${AuctionScene.STALL_PATIENCE_PENALTY})`,
      () => this.playerStall(),
      { width: '100%', backgroundColor: '#9C27B0' }
    );

    if (player.skills.tongue < AuctionScene.REQUIRED_TONGUE_LEVEL_FOR_STALL || stallsRemaining <= 0) {
      stallBtn.disabled = true;
      stallBtn.style.opacity = '0.6';
      if (player.skills.tongue < AuctionScene.REQUIRED_TONGUE_LEVEL_FOR_STALL) {
        stallBtn.textContent = `Stall (Requires Tongue ${AuctionScene.REQUIRED_TONGUE_LEVEL_FOR_STALL}+)`;
      } else {
        stallBtn.textContent = 'Stall (No uses left this auction)';
      }
    }

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
        'Not Enough Money',
        "You don't have enough money for this bid.",
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
    const tongue = this.gameManager.getPlayerState().skills.tongue;
    if (tongue < AuctionScene.REQUIRED_TONGUE_LEVEL_FOR_STALL) {
      this.uiManager.showModal(
        'Requires Skill',
        `Stall requires Tongue level ${AuctionScene.REQUIRED_TONGUE_LEVEL_FOR_STALL} (you have ${tongue}).`,
        [{ text: 'OK', onClick: () => {} }]
      );
      return;
    }

    if (this.stallUsesThisAuction >= tongue) {
      this.uiManager.showModal(
        'No More Stalling',
        `You've used Stall ${this.stallUsesThisAuction}/${tongue} times in this auction.`,
        [{ text: 'OK', onClick: () => {} }]
      );
      return;
    }

    this.stallUsesThisAuction += 1;
    this.rivalAI.onPlayerStall();
    
    if (this.rivalAI.getPatience() <= 0) {
      this.endAuction(true, `${this.rival.name} lost patience and quit!`);
    } else {
      // Stalling pressures the rival but hands them the turn.
      this.rivalTurn();
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
      }, GAME_CONFIG.auction.rivalBidModalDelayMs);
    }
  }

  private endAuction(playerWon: boolean, message: string): void {
    // Tutorial triggers
    if (this.tutorialManager.isTutorialActive()) {
      if (!playerWon && this.tutorialManager.getCurrentStep() === 'first_flip') {
        this.tutorialManager.advanceStep('first_loss');
      } else if (playerWon && this.tutorialManager.getCurrentStep() === 'first_loss') {
        this.tutorialManager.advanceStep('redemption');
      }
    }

    if (playerWon) {
      // Check garage capacity
      if (this.gameManager.getPlayerState().inventory.length >= this.gameManager.getPlayerState().garageSlots) {
        this.uiManager.showModal(
          'Garage Full!',
          `You won the auction, but your garage is full!\n\nYou are forced to forfeit the car.`,
          [
            {
              text: 'Continue',
              onClick: () => this.scene.start('MapScene'),
            },
          ]
        );
        return;
      }

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

  /**
   * Get human-readable tier name from tier number.
   * @param tier - The tier number (1, 2, or 3)
   * @returns Human-readable tier name
   */
  private getTierName(tier: 1 | 2 | 3): string {
    switch (tier) {
      case 1:
        return 'Tycoon';
      case 2:
        return 'Enthusiast';
      case 3:
        return 'Scrapper';
      default:
        return 'Unknown';
    }
  }
}
