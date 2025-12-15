import { BaseGameScene } from './base-game-scene';
import { Car, calculateCarValue, getCarById } from '@/data/car-database';
import { Rival, getTierName, getRivalById, calculateRivalInterest, getMoodModifiers } from '@/data/rival-database';
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
  private powerBidStreak: number = 0;

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

    // Defensive guard: this scene should not start if the garage is already full.
    // Entry points (e.g., MapScene) should prevent this, but keep this to avoid bypasses.
    const player = this.gameManager.getPlayerState();
    if (player.inventory.length >= player.garageSlots) {
      this.uiManager.showModal(
        'Garage Full',
        'Your garage is full. Sell or scrap a car before entering an auction.',
        [
          { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
          { text: 'Back to Map', onClick: () => this.scene.start('MapScene') },
        ]
      );
      return;
    }

    this.setupBackground('AUCTION BATTLE!', {
      topColor: 0x8b0000,
      bottomColor: 0x4b0000,
      titleSize: '42px',
      titleColor: '#ffd700',
    });
    this.setupUI();
    this.setupCommonEventListeners();
    
    // Ensure cleanup on scene shutdown
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanupCommonEventListeners();
    });
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

    // Combo streak indicator (if active)
    if (this.powerBidStreak >= 2) {
      const comboIndicator = this.uiManager.createText(
        `🔥 POWER BID COMBO x${this.powerBidStreak}! 🔥`,
        { textAlign: 'center', color: '#ff6b6b', fontWeight: 'bold', fontSize: '16px', marginBottom: '10px', animation: 'pulse 0.5s ease-in-out infinite' }
      );
      panel.appendChild(comboIndicator);
    }

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
    
    // Show rival mood
    if (this.rival.mood && this.rival.mood !== 'Normal') {
      const moodInfo = getMoodModifiers(this.rival.mood);
      const rivalMood = this.uiManager.createText(
        `${this.rival.name} ${moodInfo.description}`,
        { fontSize: '13px', color: '#f39c12', fontStyle: 'italic', marginTop: '5px' }
      );
      rivalInfo.appendChild(rivalMood);
    }

    // Patience bar with color coding and status
    const patience = this.rivalAI.getPatience();
    const patiencePercent = Math.max(0, Math.min(100, patience));
    const thresholds = GAME_CONFIG.auction.patienceThresholds;
    let patienceColor = '#4CAF50'; // Green
    let patienceStatus = '';
    let shakeAnimation = '';
    
    if (patience <= 0) {
      patienceColor = '#000';
      patienceStatus = ' 💥 BREAKING!';
      shakeAnimation = 'shake 0.3s ease-in-out infinite';
    } else if (patience < thresholds.critical) {
      patienceColor = '#f44336';
      patienceStatus = ' ⚠️ About to quit!';
      shakeAnimation = 'shake 0.5s ease-in-out infinite';
    } else if (patience < thresholds.low) {
      patienceColor = '#ff9800';
      patienceStatus = ' 😰 Sweating...';
      shakeAnimation = 'shake 0.8s ease-in-out infinite';
    } else if (patience < thresholds.medium) {
      patienceColor = '#FFC107';
      patienceStatus = ' 😤 Getting annoyed';
    }

    const patienceLabel = this.uiManager.createText(
      `Patience: ${patience}/100${patienceStatus}`,
      { marginBottom: '8px', fontWeight: 'bold', animation: shakeAnimation }
    );
    
    // Add shake animation CSS if needed
    if (shakeAnimation && !document.getElementById('auctionShakeAnimation')) {
      const style = document.createElement('style');
      style.id = 'auctionShakeAnimation';
      style.textContent = `
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-3px); }
          75% { transform: translateX(3px); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.8; }
        }
      `;
      document.head.appendChild(style);
    }
    
    rivalInfo.appendChild(patienceLabel);

    // Patience progress bar
    const patienceBarContainer = document.createElement('div');
    Object.assign(patienceBarContainer.style, {
      width: '100%',
      height: '20px',
      backgroundColor: 'rgba(0,0,0,0.3)',
      borderRadius: '10px',
      overflow: 'hidden',
      marginBottom: '12px',
      border: '2px solid rgba(255,255,255,0.2)',
    });

    const patienceBarFill = document.createElement('div');
    Object.assign(patienceBarFill.style, {
      width: `${patiencePercent}%`,
      height: '100%',
      backgroundColor: patienceColor,
      transition: 'all 0.3s ease',
      boxShadow: `0 0 10px ${patienceColor}`,
    });

    patienceBarContainer.appendChild(patienceBarFill);
    rivalInfo.appendChild(patienceBarContainer);

    const rivalBudget = this.uiManager.createText(
      `Budget: ${formatCurrency(this.rivalAI.getBudget())}`
    );

    rivalInfo.appendChild(rivalName);
    rivalInfo.appendChild(rivalTier);
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
      this.powerBidStreak++;
      this.rivalAI.onPlayerPowerBid();
      if (this.rivalAI.getPatience() <= 0) {
        this.endAuction(true, `${this.rival.name} lost patience and quit!`);
        return;
      }
    } else {
      this.powerBidStreak = 0; // Reset streak on normal bid
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

    this.powerBidStreak = 0; // Reset streak
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
    this.powerBidStreak = 0; // Reset streak
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
      
      // Add flavor text based on rival's patience level
      const patience = this.rivalAI.getPatience();
      let flavorText = '';
      
      if (patience < 20) {
        flavorText = '\n\n"This is my FINAL offer!"';
      } else if (patience < 30) {
        flavorText = '\n\n"I\'m getting tired of this..."';
      } else if (patience < 50) {
        flavorText = '\n\n"You\'re really pushing it."';
      }
      
      setTimeout(() => {
        this.uiManager.showModal(
          'Rival Bids!',
          `${this.rival.name} raised the bid by ${formatCurrency(decision.bidAmount)}!\n\nNew bid: ${formatCurrency(this.currentBid)}${flavorText}`,
          [
            {
              text: 'Continue',
              onClick: () => this.setupUI(),
            },
          ]
        );
      }, GAME_CONFIG.ui.modalDelays.rivalBid);
    }
  }

  private endAuction(playerWon: boolean, message: string): void {
    // Tutorial trigger for loss (happens immediately)
    try {
      if (this.tutorialManager.isCurrentStep('first_flip') && !playerWon) {
        this.tutorialManager.advanceStep('first_loss');
      }
    } catch (error) {
      console.error('Tutorial error in AuctionScene:', error);
    }

    if (playerWon) {
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
        let isTutorialComplete = false;
        try {
          isTutorialComplete = this.tutorialManager.isCurrentStep('redemption');
        } catch (error) {
          console.error('Tutorial error checking completion:', error);
        }
        
        this.uiManager.showModal(
          'You Won!',
          `${message}\n\nYou bought ${this.car.name} for ${formatCurrency(this.currentBid)}!${leveledUp ? '\n\n🎉 Your Tongue skill leveled up!' : ''}`,
          [
            {
              text: 'Continue',
              onClick: () => {
                if (isTutorialComplete) {
                  // Show tutorial completion dialogue before returning to map
                  this.tutorialManager.showDialogueWithCallback(
                    "Uncle Ray",
                    "🎉 Congratulations! 🎉\n\nYou've mastered the basics of car collecting:\n• Inspecting cars with your Eye skill\n• Restoring cars to increase value\n• Bidding strategically in auctions\n• Reading rival behavior\n\nNow go build the world's greatest car museum! Remember: every car tells a story, and you're the curator.",
                    () => {
                      this.tutorialManager.advanceStep('complete');
                      this.scene.start('MapScene');
                    }
                  );
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
      try {
        if (this.tutorialManager.isCurrentStep('first_loss')) {
          // Uncle Ray spots another opportunity - show dialogue then start second auction
          this.tutorialManager.showDialogueWithCallback(
            "Uncle Ray",
            "Don't let that loss get you down! Look - there's another car here nobody else noticed: a Boxy Wagon. This time you're facing a weaker rival. Use aggressive tactics like Power Bid to make them quit early!",
            () => {
              this.tutorialManager.advanceStep('redemption');
              const boxywagon = getCarById('tutorial_boxy_wagon');
              const scrappyJoe = getRivalById('scrapyard_joe');
              if (boxywagon && scrappyJoe) {
                const interest = calculateRivalInterest(scrappyJoe, boxywagon.tags);
                this.scene.start('AuctionScene', { car: boxywagon, rival: scrappyJoe, interest });
              }
            }
          );
          return;
        }
      } catch (error) {
        console.error('Tutorial error in redemption flow:', error);
        // Continue with normal loss flow
      }
      
      // Normal loss flow
      this.uiManager.showModal(
        'Auction Lost',
        message,
        [
          {
            text: 'See Analysis',
            onClick: () => this.showAuctionDebrief(),
          },
          {
            text: 'Continue',
            onClick: () => this.scene.start('MapScene'),
          },
        ]
      );
    }
  }

  /**
   * Show detailed auction debrief with tactical analysis.
   * Helps player understand what happened and learn tactics.
   */
  private showAuctionDebrief(): void {
    const patience = this.rivalAI.getPatience();
    const budget = this.rivalAI.getBudget();
    const player = this.gameManager.getPlayerState();

    let analysis = `📈 AUCTION ANALYSIS\n\n`;
    analysis += `YOUR BID: ${formatCurrency(this.currentBid)}\n`;
    analysis += `RIVAL BID: Won the auction\n\n`;
    
    analysis += `👤 RIVAL STATUS:\n`;
    analysis += `• Patience Remaining: ${patience}/100\n`;
    analysis += `• Budget Remaining: ${formatCurrency(budget)}\n\n`;
    
    // Tactical hints based on situation
    analysis += `💡 TACTICAL INSIGHTS:\n`;
    
    if (patience > 50) {
      analysis += `• Rival had high patience (${patience}%) - they were determined\n`;
      analysis += `• Try 'Power Bid' or 'Stall' to drain patience faster\n`;
    } else if (patience > 20) {
      analysis += `• Rival was getting impatient (${patience}%) - you were close!\n`;
      analysis += `• One more 'Stall' might have made them quit\n`;
    } else {
      analysis += `• Rival was nearly broken (${patience}% patience) - so close!\n`;
      analysis += `• They were about to quit - you almost had them\n`;
    }
    
    if (budget < this.currentBid * 1.5) {
      analysis += `• Rival's budget was limited (${formatCurrency(budget)} left)\n`;
      if (player.skills.eye >= 3) {
        analysis += `• 'Kick Tires' could have forced them out of budget\n`;
      } else {
        analysis += `• Eye skill Lvl 3+ unlocks 'Kick Tires' to attack budget\n`;
      }
    }
    
    if (this.stallUsesThisAuction === 0 && player.skills.tongue >= 3) {
      analysis += `• You didn't use 'Stall' - it drains ${GAME_CONFIG.auction.stallPatiencePenalty} patience\n`;
    }
    
    analysis += `\n🔄 WHAT'S NEXT:\n`;
    analysis += `• Return to map to find more opportunities\n`;
    analysis += `• Each loss teaches you rival behavior\n`;
    analysis += `• Level up skills to unlock new tactics`;

    this.uiManager.showModal(
      '📊 Auction Debrief',
      analysis,
      [
        {
          text: 'Back to Map',
          onClick: () => this.scene.start('MapScene'),
        },
      ]
    );
  }

}
