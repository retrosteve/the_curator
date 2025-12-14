import { BaseGameScene } from './base-game-scene';
import { Car, calculateCarValue, getCarById } from '@/data/car-database';
import { Rival, getTierName, getRivalById, calculateRivalInterest } from '@/data/rival-database';
import { RivalAI } from '@/systems/rival-ai';
import { GAME_CONFIG } from '@/config/game-config';
import { formatCurrency } from '@/utils/format';

/**
 * Auction Scene - Turn-based bidding battle against a rival.
 * Player uses various tactics (bid, power bid, stall, kick tires) to win the car.
 * Rival patience and budget determine when they quit.
 */
export class AuctionScene extends BaseGameScene {
  private car!: Car;
  private rival!: Rival;
  private rivalAI!: RivalAI;
  private currentBid: number = 0;
  private stallUsesThisAuction: number = 0;

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

    this.initializeManagers('auction');
    this.setupBackground('AUCTION BATTLE!', {
      topColor: 0x8b0000,
      bottomColor: 0x4b0000,
      titleSize: '42px',
      titleColor: '#ffd700',
    });
    this.setupUI();
    this.setupCommonEventListeners();
  }


  private setupUI(): void {
    this.resetUIWithHUD();

    const player = this.gameManager.getPlayerState();

    const panel = this.uiManager.createPanel({
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      minWidth: '500px',
    });

    // Car info
    const carPanel = this.uiManager.createCarInfoPanel(this.car, {
      showValue: true,
      titleColor: '#ffd700',
      style: {
        marginBottom: '20px',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        border: '1px solid #ffd700'
      }
    });
    panel.appendChild(carPanel);

    // Current bid
    const bidHeading = this.uiManager.createHeading(
      `Current Bid: ${formatCurrency(this.currentBid)}`,
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
      `Tier: ${getTierName(this.rival.tier)}`,
      { fontSize: '14px', color: '#ccc' }
    );
    const rivalPatience = this.uiManager.createText(
      `Patience: ${this.rivalAI.getPatience()}/100`
    );
    const rivalBudget = this.uiManager.createText(
      `Budget: ${formatCurrency(this.rivalAI.getBudget())}`
    );

    rivalInfo.appendChild(rivalName);
    rivalInfo.appendChild(rivalTier);
    rivalInfo.appendChild(rivalPatience);
    rivalInfo.appendChild(rivalBudget);
    panel.appendChild(rivalInfo);

    // Player info
    const playerInfo = this.uiManager.createText(
      `Your Money: ${formatCurrency(player.money)}`,
      { textAlign: 'center', marginBottom: '20px' }
    );
    panel.appendChild(playerInfo);

    // Action buttons
    const buttonContainer = this.uiManager.createButtonContainer();

    const bidBtn = this.uiManager.createButton(
      `Bid +${formatCurrency(AuctionScene.BID_INCREMENT)}`,
      () => this.playerBid(AuctionScene.BID_INCREMENT),
      { variant: 'primary', style: { width: '100%' } }
    );
    buttonContainer.appendChild(bidBtn);

    const powerBidBtn = this.uiManager.createButton(
      `Power Bid +${formatCurrency(AuctionScene.POWER_BID_INCREMENT)} (Rival Patience -${AuctionScene.POWER_BID_PATIENCE_PENALTY})`,
      () => this.playerBid(AuctionScene.POWER_BID_INCREMENT, { power: true }),
      { variant: 'warning', style: { width: '100%' } }
    );
    buttonContainer.appendChild(powerBidBtn);

    const kickTiresBtn = this.uiManager.createButton(
      `Kick Tires (Eye ${AuctionScene.REQUIRED_EYE_LEVEL_FOR_KICK_TIRES}+) (Rival Budget -${formatCurrency(AuctionScene.KICK_TIRES_BUDGET_REDUCTION)})`,
      () => this.playerKickTires(),
      { variant: 'info', style: { width: '100%' } }
    );
    buttonContainer.appendChild(kickTiresBtn);

    const maxStalls = player.skills.tongue;
    const stallsRemaining = Math.max(0, maxStalls - this.stallUsesThisAuction);
    const stallBtn = this.uiManager.createButton(
      `Stall (Tongue ${AuctionScene.REQUIRED_TONGUE_LEVEL_FOR_STALL}+) (Uses left: ${stallsRemaining}) (Rival Patience -${AuctionScene.STALL_PATIENCE_PENALTY})`,
      () => this.playerStall(),
      { variant: 'special', style: { width: '100%', backgroundColor: '#9C27B0' } }
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
      { variant: 'danger', style: { width: '100%', backgroundColor: '#f44336' } }
    );
    buttonContainer.appendChild(quitBtn);

    panel.appendChild(buttonContainer);
    this.uiManager.append(panel);
  }

  private playerBid(amount: number, options?: { power?: boolean }): void {
    const newBid = this.currentBid + amount;

    const player = this.gameManager.getPlayerState();

    if (player.money < newBid) {
      this.uiManager.showInsufficientFundsModal();
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
    const player = this.gameManager.getPlayerState();
    if (player.skills.eye < AuctionScene.REQUIRED_EYE_LEVEL_FOR_KICK_TIRES) {
      this.uiManager.showModal(
        'Requires Skill',
        `Kick Tires requires Eye level ${AuctionScene.REQUIRED_EYE_LEVEL_FOR_KICK_TIRES} (you have ${player.skills.eye}).`,
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
    const player = this.gameManager.getPlayerState();
    const tongue = player.skills.tongue;
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
          `${this.rival.name} raised the bid by ${formatCurrency(decision.bidAmount)}!\n\nNew bid: ${formatCurrency(this.currentBid)}`,
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
    // Tutorial trigger for loss (happens immediately)
    if (this.tutorialManager.isCurrentStep('first_flip') && !playerWon) {
      this.tutorialManager.advanceStep('first_loss');
    }

    if (playerWon) {
      const player = this.gameManager.getPlayerState();

      if (this.gameManager.spendMoney(this.currentBid)) {
        if (!this.gameManager.addCar(this.car)) {
          // Garage is full
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
          // Refund the money since we couldn't add the car
          this.gameManager.addMoney(this.currentBid);
          return;
        }
        
        // Award Tongue XP for winning an auction
        const tongueXPGain = GAME_CONFIG.player.skillProgression.xpGains.auction;
        const leveledUp = this.gameManager.addSkillXP('tongue', tongueXPGain);
        this.uiManager.showXPGain('tongue', tongueXPGain);
        
        // Tutorial: Show completion message AFTER auction win modal is dismissed
        const isTutorialComplete = this.tutorialManager.isCurrentStep('redemption');
        
        this.uiManager.showModal(
          'You Won!',
          `${message}\n\nYou bought ${this.car.name} for ${formatCurrency(this.currentBid)}!${leveledUp ? '\n\n🎉 Your Tongue skill leveled up!' : ''}`,
          [
            {
              text: 'Continue',
              onClick: () => {
                if (isTutorialComplete) {
                  // Advance tutorial to complete AFTER dismissing win modal
                  this.tutorialManager.advanceStep('complete');
                  // Small delay to ensure tutorial dialogue appears before scene transition
                  setTimeout(() => this.scene.start('MapScene'), 100);
                } else {
                  this.scene.start('MapScene');
                }
              },
            },
          ]
        );
      }
    } else {
      // Tutorial: After losing to Sterling Vance, immediately encounter Scrapyard Joe at the same sale
      if (this.tutorialManager.isCurrentStep('first_loss')) {
        // Uncle Ray spots another opportunity (dialogue shown by advanceStep)
        setTimeout(() => {
          this.tutorialManager.advanceStep('redemption');
          // Let player dismiss tutorial dialogue before starting second auction
          setTimeout(() => {
            const boxywagon = getCarById('tutorial_boxy_wagon');
            const scrappyJoe = getRivalById('scrapyard_joe');
            if (boxywagon && scrappyJoe) {
              const interest = calculateRivalInterest(scrappyJoe, boxywagon.tags);
              this.scene.start('AuctionScene', { car: boxywagon, rival: scrappyJoe, interest });
            }
          }, 100);
        }, 500);
        return;
      }
      
      // Normal loss flow
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
