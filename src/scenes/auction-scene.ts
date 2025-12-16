import { BaseGameScene } from './base-game-scene';
import { Car, calculateCarValue, getCarById } from '@/data/car-database';
import { Rival, getTierName, getRivalById, calculateRivalInterest, getMoodModifiers, getRivalBark, BarkTrigger } from '@/data/rival-database';
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
  private locationId?: string;
  private encounterStarted: boolean = false;
  private currentBid: number = 0;
  private stallUsesThisAuction: number = 0;
  private powerBidStreak: number = 0;
  private auctionLog: string[] = [];
  private lastPatienceToastBand: 'normal' | 'medium' | 'low' | 'critical' = 'normal';

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

  init(data: { car: Car; rival: Rival; interest: number; locationId?: string }): void {
    this.car = data.car;
    this.rival = data.rival;
    this.rivalAI = new RivalAI(data.rival, data.interest);
    this.locationId = data.locationId;
    this.encounterStarted = false;
    // Initialize with non-market value; we'll re-evaluate once managers are ready.
    this.currentBid = Math.floor(calculateCarValue(this.car) * AuctionScene.STARTING_BID_MULTIPLIER);
    this.stallUsesThisAuction = 0;
    this.powerBidStreak = 0;
    this.auctionLog = [];
    this.lastPatienceToastBand = 'normal';
  }

  create(): void {
    console.log('Auction Scene: Loaded');

    this.initializeManagers('auction');

    // Market-aware starting bid (use current day market modifier).
    const baseValue = calculateCarValue(this.car);
    const marketInfo = this.gameManager.getCarMarketInfo(this.car.tags);
    const marketValue = Math.floor(baseValue * marketInfo.modifier);
    this.currentBid = Math.floor(marketValue * AuctionScene.STARTING_BID_MULTIPLIER);

    this.appendAuctionLog(`Auction opens at ${formatCurrency(this.currentBid)}.`);
    const marketLine = marketInfo.factors.length > 0
      ? `Market: ${marketInfo.factors.join(' | ')}`
      : 'Market: No active modifiers.';
    this.appendAuctionLog(marketLine);

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

    this.encounterStarted = true;

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

    // Minimal responsive layout tweaks for the auction UI.
    if (!document.getElementById('auctionLayoutStyles')) {
      const style = document.createElement('style');
      style.id = 'auctionLayoutStyles';
      style.textContent = `
        .auction-layout { width: min(94vw, 1100px); }
        @media (max-width: 860px) {
          .auction-layout__top { grid-template-columns: 1fr !important; }
          .auction-layout__bottom { grid-template-columns: 1fr !important; }
        }
      `;
      document.head.appendChild(style);
    }

    const layoutRoot = document.createElement('div');
    layoutRoot.className = 'auction-layout';
    Object.assign(layoutRoot.style, {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      maxHeight: 'calc(100vh - 140px)',
      overflowY: 'auto',
      boxSizing: 'border-box',
      display: 'grid',
      gap: '14px',
      pointerEvents: 'auto',
    } satisfies Partial<CSSStyleDeclaration>);

    const topGrid = document.createElement('div');
    topGrid.className = 'auction-layout__top';
    Object.assign(topGrid.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: '14px',
      alignItems: 'start',
    } satisfies Partial<CSSStyleDeclaration>);

    // LEFT: car + your numbers
    const leftPanel = this.uiManager.createPanel({ padding: '18px' });

    const baseValue = calculateCarValue(this.car);
    const marketInfo = this.gameManager.getCarMarketInfo(this.car.tags);
    const marketValue = Math.floor(baseValue * marketInfo.modifier);

    const carPanel = this.uiManager.createCarInfoPanel(this.car, {
      showValue: true,
      titleColor: '#ffd700',
      style: {
        marginBottom: '12px',
      },
    });
    leftPanel.appendChild(carPanel);

    leftPanel.appendChild(
      this.uiManager.createText(
        `Your estimate: ${formatCurrency(marketValue)} (market x${marketInfo.modifier.toFixed(2)})`,
        { fontSize: '13px', color: '#ccc', textAlign: 'center', margin: '0 0 12px 0' }
      )
    );

    leftPanel.appendChild(
      this.uiManager.createHeading(`Current Bid: ${formatCurrency(this.currentBid)}`, 3, {
        textAlign: 'center',
        marginBottom: '10px',
        color: '#4CAF50',
      })
    );

    leftPanel.appendChild(
      this.uiManager.createText(`Your Money: ${formatCurrency(player.money)}`, {
        textAlign: 'center',
        margin: '0',
        fontWeight: 'bold',
      })
    );

    // RIGHT: rival overview (no exact budget shown)
    const rightPanel = this.uiManager.createPanel({ padding: '18px' });

    rightPanel.appendChild(
      this.uiManager.createHeading('Rival', 3, {
        textAlign: 'center',
        marginBottom: '10px',
        color: '#ffd700',
      })
    );

    rightPanel.appendChild(
      this.uiManager.createText(this.rival.name, { textAlign: 'center', fontWeight: 'bold', margin: '0 0 4px 0' })
    );
    rightPanel.appendChild(
      this.uiManager.createText(`Tier: ${getTierName(this.rival.tier)}`, { textAlign: 'center', fontSize: '13px', color: '#ccc', margin: '0 0 10px 0' })
    );

    if (this.rival.mood && this.rival.mood !== 'Normal') {
      const moodInfo = getMoodModifiers(this.rival.mood);
      rightPanel.appendChild(
        this.uiManager.createText(moodInfo.description, {
          textAlign: 'center',
          fontSize: '13px',
          color: '#f39c12',
          fontStyle: 'italic',
          margin: '0 0 12px 0',
        })
      );
    }

    const patience = this.rivalAI.getPatience();
    const patiencePercent = Math.max(0, Math.min(100, patience));
    const thresholds = GAME_CONFIG.auction.patienceThresholds;
    let patienceColor = '#4CAF50';
    if (patience < thresholds.critical) patienceColor = '#f44336';
    else if (patience < thresholds.low) patienceColor = '#ff9800';
    else if (patience < thresholds.medium) patienceColor = '#FFC107';

    rightPanel.appendChild(
      this.uiManager.createText(`Patience: ${patience}/100`, {
        margin: '0 0 8px 0',
        fontWeight: 'bold',
        textAlign: 'center',
      })
    );

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
    });

    patienceBarContainer.appendChild(patienceBarFill);
    rightPanel.appendChild(patienceBarContainer);

    topGrid.appendChild(leftPanel);
    topGrid.appendChild(rightPanel);
    layoutRoot.appendChild(topGrid);

    // BOTTOM: actions + log
    const bottomGrid = document.createElement('div');
    bottomGrid.className = 'auction-layout__bottom';
    Object.assign(bottomGrid.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: '14px',
      alignItems: 'start',
    } satisfies Partial<CSSStyleDeclaration>);

    const actionsPanel = this.uiManager.createPanel({ padding: '18px' });
    actionsPanel.appendChild(
      this.uiManager.createHeading('Actions', 3, {
        textAlign: 'center',
        marginBottom: '10px',
      })
    );

    const buttonGrid = this.uiManager.createButtonContainer({
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: '10px',
    });

    const buttonTextStyle: Partial<CSSStyleDeclaration> = {
      width: '100%',
      whiteSpace: 'pre-line',
      textAlign: 'left',
      lineHeight: '1.2',
      padding: '14px 16px',
      fontSize: '15px',
    };

    buttonGrid.appendChild(
      this.uiManager.createButton(
        `Bid\n+${formatCurrency(AuctionScene.BID_INCREMENT)}`,
        () => this.playerBid(AuctionScene.BID_INCREMENT),
        { variant: 'primary', style: buttonTextStyle }
      )
    );

    buttonGrid.appendChild(
      this.uiManager.createButton(
        `Power Bid\n+${formatCurrency(AuctionScene.POWER_BID_INCREMENT)} · Patience -${AuctionScene.POWER_BID_PATIENCE_PENALTY}`,
        () => this.playerBid(AuctionScene.POWER_BID_INCREMENT, { power: true }),
        { variant: 'warning', style: buttonTextStyle }
      )
    );

    const kickTiresBtn = this.uiManager.createButton(
      `Kick Tires\nEye ${AuctionScene.REQUIRED_EYE_LEVEL_FOR_KICK_TIRES}+ · Budget -${formatCurrency(AuctionScene.KICK_TIRES_BUDGET_REDUCTION)}`,
      () => this.playerKickTires(),
      { variant: 'info', style: buttonTextStyle }
    );
    buttonGrid.appendChild(kickTiresBtn);

    const maxStalls = player.skills.tongue;
    const stallsRemaining = Math.max(0, maxStalls - this.stallUsesThisAuction);
    const stallBtn = this.uiManager.createButton(
      `Stall\nTongue ${AuctionScene.REQUIRED_TONGUE_LEVEL_FOR_STALL}+ · Uses left: ${stallsRemaining}`,
      () => this.playerStall(),
      { variant: 'special', style: buttonTextStyle }
    );
    if (player.skills.tongue < AuctionScene.REQUIRED_TONGUE_LEVEL_FOR_STALL || stallsRemaining <= 0) {
      stallBtn.disabled = true;
      stallBtn.style.opacity = '0.6';
      if (player.skills.tongue < AuctionScene.REQUIRED_TONGUE_LEVEL_FOR_STALL) {
        stallBtn.textContent = `Stall\nRequires Tongue ${AuctionScene.REQUIRED_TONGUE_LEVEL_FOR_STALL}+`;
      } else {
        stallBtn.textContent = 'Stall\nNo uses left';
      }
    }
    buttonGrid.appendChild(stallBtn);

    const quitBtn = this.uiManager.createButton('Quit Auction', () => this.playerQuit(), {
      variant: 'danger',
      style: {
        ...buttonTextStyle,
        gridColumn: '1 / -1',
        textAlign: 'center',
      },
    });
    buttonGrid.appendChild(quitBtn);

    actionsPanel.appendChild(buttonGrid);

    const logPanel = this.uiManager.createPanel({
      padding: '18px',
      maxHeight: '260px',
      overflowY: 'auto',
    });
    logPanel.appendChild(
      this.uiManager.createHeading('Log', 3, {
        textAlign: 'center',
        marginBottom: '10px',
      })
    );

    const entries = this.auctionLog.slice(-10);
    for (const entry of entries) {
      logPanel.appendChild(
        this.uiManager.createText(`• ${entry}`, {
          fontSize: '13px',
          color: '#ccc',
          margin: '0 0 6px 0',
          lineHeight: '1.3',
        })
      );
    }

    bottomGrid.appendChild(actionsPanel);
    bottomGrid.appendChild(logPanel);
    layoutRoot.appendChild(bottomGrid);

    this.uiManager.append(layoutRoot);
  }

  private appendAuctionLog(entry: string): void {
    const trimmed = entry.trim();
    if (!trimmed) return;
    this.auctionLog.push(trimmed);
    if (this.auctionLog.length > 50) {
      this.auctionLog.splice(0, this.auctionLog.length - 50);
    }
  }

  private maybeToastPatienceWarning(): void {
    const patience = this.rivalAI.getPatience();
    if (patience <= 0) return;

    const thresholds = GAME_CONFIG.auction.patienceThresholds;
    if (patience < thresholds.critical) {
      if (this.lastPatienceToastBand !== 'critical') {
        this.lastPatienceToastBand = 'critical';
        this.uiManager.showToast('Warning: Rival is about to quit!', { backgroundColor: '#f44336' });
      }
      return;
    }

    if (patience < thresholds.low) {
      if (this.lastPatienceToastBand === 'normal' || this.lastPatienceToastBand === 'medium') {
        this.lastPatienceToastBand = 'low';
        this.uiManager.showToast('Rival is getting impatient…', { backgroundColor: '#ff9800' });
      }
      return;
    }

    if (patience < thresholds.medium) {
      if (this.lastPatienceToastBand === 'normal') {
        this.lastPatienceToastBand = 'medium';
        this.uiManager.showToast('Rival looks annoyed.', { backgroundColor: '#FFC107' });
      }
    }
  }

  private showRivalBark(trigger: BarkTrigger): void {
    const mood = this.rival.mood || 'Normal';
    const text = getRivalBark(mood, trigger);
    
    // Create speech bubble
    const bubble = document.createElement('div');
    bubble.textContent = text;
    bubble.style.cssText = `
      position: absolute;
      top: 30%;
      right: 25%;
      transform: translateX(50%);
      background: #fff;
      color: #000;
      padding: 10px 15px;
      border-radius: 15px;
      border-bottom-left-radius: 0;
      box-shadow: 0 4px 10px rgba(0,0,0,0.2);
      font-family: 'Comic Sans MS', 'Chalkboard SE', sans-serif;
      font-size: 14px;
      font-weight: bold;
      z-index: 100;
      opacity: 0;
      transition: opacity 0.3s ease;
      max-width: 200px;
      text-align: center;
      pointer-events: none;
    `;
    
    // Add tail
    const tail = document.createElement('div');
    tail.style.cssText = `
      position: absolute;
      bottom: -8px;
      left: 0;
      width: 0;
      height: 0;
      border-left: 10px solid #fff;
      border-bottom: 10px solid transparent;
    `;
    bubble.appendChild(tail);
    
    this.uiManager.appendToOverlay(bubble);
    
    // Animate in
    requestAnimationFrame(() => {
      bubble.style.opacity = '1';
      bubble.style.top = '28%'; // Slight float up
    });
    
    // Remove after delay
    setTimeout(() => {
      bubble.style.opacity = '0';
      setTimeout(() => {
        if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
      }, 300);
    }, 3000);
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
      this.appendAuctionLog(`You power bid +${formatCurrency(amount)} → ${formatCurrency(this.currentBid)}.`);
    } else {
      this.appendAuctionLog(`You bid +${formatCurrency(amount)} → ${formatCurrency(this.currentBid)}.`);
    }

    // Trigger rival reaction to being outbid
    if (!options?.power) {
      this.showRivalBark('outbid');
    }

    if (options?.power) {
      this.powerBidStreak++;
      this.rivalAI.onPlayerPowerBid();

      this.maybeToastPatienceWarning();
      
      // Check for patience reaction
      if (this.rivalAI.getPatience() < 30 && this.rivalAI.getPatience() > 0) {
        this.showRivalBark('patience_low');
      }

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

    this.appendAuctionLog(`You kick tires (-${formatCurrency(AuctionScene.KICK_TIRES_BUDGET_REDUCTION)} rival budget).`);

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

    this.appendAuctionLog(`You stall (-${AuctionScene.STALL_PATIENCE_PENALTY} rival patience).`);
    this.maybeToastPatienceWarning();
    
    // Check for patience reaction
    if (this.rivalAI.getPatience() < 30 && this.rivalAI.getPatience() > 0) {
      this.showRivalBark('patience_low');
    }
    
    if (this.rivalAI.getPatience() <= 0) {
      this.endAuction(true, `${this.rival.name} lost patience and quit!`);
    } else {
      // Stalling pressures the rival but hands them the turn.
      this.rivalTurn();
    }
  }

  private playerQuit(): void {
    this.consumeOfferIfNeeded();
    this.endAuction(false, 'You quit the auction.');
  }

  private consumeOfferIfNeeded(): void {
    if (!this.encounterStarted) return;
    if (this.locationId) {
      this.gameManager.consumeDailyCarOfferForLocation(this.locationId);
    }
  }

  private rivalTurn(): void {
    const decision = this.rivalAI.decideBid(this.currentBid);

    if (!decision.shouldBid) {
      this.appendAuctionLog(`${this.rival.name} ${decision.reason}.`);
      this.endAuction(true, `${this.rival.name} ${decision.reason}!`);
    } else {
      this.currentBid += decision.bidAmount;
      
      // Show rival bark for bidding
      this.showRivalBark('bid');
      
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

      const flavorInline = flavorText.replace(/\n+/g, ' ').trim();
      this.appendAuctionLog(
        `${this.rival.name} bids +${formatCurrency(decision.bidAmount)} → ${formatCurrency(this.currentBid)}.${flavorInline ? ` ${flavorInline}` : ''}`
      );
      
      setTimeout(() => {
        // Non-blocking update: refresh UI and keep momentum.
        this.setupUI();
      }, GAME_CONFIG.ui.modalDelays.rivalBid);
    }
  }

  private endAuction(playerWon: boolean, message: string): void {
    // Show final bark
    if (playerWon) {
      this.showRivalBark('lose'); // Rival lost
    } else {
      this.showRivalBark('win'); // Rival won
    }

    // Tutorial trigger for loss (happens immediately)
    try {
      if (this.tutorialManager.isCurrentStep('first_flip') && !playerWon) {
        this.tutorialManager.advanceStep('first_loss');
      }
    } catch (error) {
      console.error('Tutorial error in AuctionScene:', error);
    }

    if (playerWon) {
      const player = this.gameManager.getPlayerState();

      // Important edge-case: the rival can outbid you, then quit due to tactics (Kick Tires / Stall)
      // leaving the winning bid above your available money.
      if (player.money < this.currentBid) {
        this.consumeOfferIfNeeded();
        this.uiManager.showModal(
          "Won But Can't Pay",
          `${message}\n\nYou pressured ${this.rival.name} into quitting, but the winning bid is ${formatCurrency(this.currentBid)} and you only have ${formatCurrency(player.money)}.\n\nYou forfeit the car.`,
          [
            {
              text: 'Back to Map',
              onClick: () => this.scene.start('MapScene'),
            },
          ]
        );
        return;
      }

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

          // The car is forfeited; treat this location as exhausted today.
          this.consumeOfferIfNeeded();
          return;
        }

        // Winning (and acquiring) exhausts the location's daily offer.
        this.consumeOfferIfNeeded();
        
        // Award Tongue XP for winning an auction
        const tongueXPGain = GAME_CONFIG.player.skillProgression.xpGains.auction;
        const leveledUp = this.gameManager.addSkillXP('tongue', tongueXPGain);
        // XP toast + level-up celebration are handled by BaseGameScene via eventBus.
        
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
      // Leaving/losing also exhausts the location's daily offer (stricter anti-fishing).
      this.consumeOfferIfNeeded();
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
