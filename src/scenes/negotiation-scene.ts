import Phaser from 'phaser';
import { BaseGameScene } from './base-game-scene';
import { Car, calculateCarValue } from '@/data/car-database';
import { GAME_CONFIG } from '@/config/game-config';
import { formatCurrency } from '@/utils/format';

/**
 * Negotiation Scene - PvE encounter with a seller.
 * Player can haggle to reduce the asking price.
 * Haggle attempts limited by Tongue skill level.
 * Eye skill reveals hidden car history.
 */
export class NegotiationScene extends BaseGameScene {
  private car!: Car;
  private specialEvent?: any;
  private askingPrice: number = 0;
  private lowestPrice: number = 0;
  private negotiationCount: number = 0;

  constructor() {
    super({ key: 'NegotiationScene' });
  }

  init(data: { car: Car; specialEvent?: any }): void {
    this.car = data.car;
    this.specialEvent = data.specialEvent;
    // Seller starts asking for 120% of value (or market value)
    const value = calculateCarValue(this.car);
    this.askingPrice = Math.floor(value * GAME_CONFIG.negotiation.askingPriceMultiplier);
    // Seller won't go below 90% of value
    this.lowestPrice = Math.floor(value * GAME_CONFIG.negotiation.lowestPriceMultiplier);
    this.negotiationCount = 0;

    // Handle special event modifiers
    if (this.specialEvent) {
      // Apply special event price modifiers
      if (this.specialEvent.reward.priceMultiplier) {
        this.askingPrice = Math.floor(this.askingPrice * this.specialEvent.reward.priceMultiplier);
        this.lowestPrice = Math.floor(this.lowestPrice * this.specialEvent.reward.priceMultiplier);
      }
    }
  }

  create(): void {
    console.log('Negotiation Scene: Loaded');

    this.initializeManagers('negotiation');
    // Greenish/Neutral background for negotiation
    this.setupBackground('NEGOTIATION', {
      topColor: 0x2c3e50,
      bottomColor: 0x27ae60,
    });
    this.setupUI();
    this.setupCommonEventListeners();

    // Tutorial guidance: first inspect - show gameplay instructions
    if (this.tutorialManager.isCurrentStep('first_inspect')) {
      this.uiManager.showModal(
        'Your First Car Inspection',
        'Look at the car details above. Your Eye skill level determines what you can see:\n\n• Level 1: Basic info only\n• Level 2+: Reveals hidden damage history\n\nTry haggling to lower the price, then click "Accept Offer" to buy. This will cost inspection time.',
        [{ text: 'Got it', onClick: () => {} }]
      );
    }

    // Tutorial trigger: advance from first_visit_scrapyard to first_inspect
    if (this.tutorialManager.isCurrentStep('first_visit_scrapyard')) {
      this.tutorialManager.advanceStep('first_inspect');
    }
  }


  private setupUI(): void {
    this.resetUIWithHUD();

    const player = this.gameManager.getPlayerState();
    
    // Car Info Panel
    const infoPanel = this.uiManager.createCarInfoPanel(this.car, {
      showValue: false,
      style: {
        position: 'absolute',
        top: '100px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '600px',
      }
    });

    // Asking Price (Dynamic)
    const priceTag = this.uiManager.createText(`Asking Price: ${formatCurrency(this.askingPrice)}`, {
      fontSize: '24px',
      color: '#f1c40f',
      margin: '20px 0',
      textAlign: 'center'
    });
    priceTag.id = 'asking-price';
    // Insert price after title (first child is title)
    infoPanel.insertBefore(priceTag, infoPanel.children[1]);

    // Hidden details (Eye Skill)
    if (player.skills.eye >= 2 && this.car.history && this.car.history.length > 0) {
      const history = this.uiManager.createText(`History: ${this.car.history.join(', ')}`, {
        color: '#e74c3c'
      });
      infoPanel.appendChild(history);
    }

    // Award Eye XP for inspecting the car
    const eyeXPGain = GAME_CONFIG.player.skillProgression.xpGains.inspect;
    const leveledUp = this.gameManager.addSkillXP('eye', eyeXPGain);
    if (leveledUp) {
      const progress = this.gameManager.getSkillProgress('eye');
      this.uiManager.showSkillLevelUpModal(
        'eye',
        progress.level,
        'You can now spot more details when inspecting cars.'
      );
    }

    // Special Event Info
    if (this.specialEvent) {
      const eventPanel = this.uiManager.createPanel({
        marginTop: '20px',
        padding: '10px',
        backgroundColor: 'rgba(243, 156, 18, 0.1)',
        borderRadius: '5px'
      });
      
      const eventName = this.uiManager.createText(`Special Event: ${this.specialEvent.name}`, {
        color: '#f39c12',
        fontWeight: 'bold'
      });
      
      const eventDesc = this.uiManager.createText(this.specialEvent.description, {
        color: '#bdc3c7',
        fontStyle: 'italic'
      });
      
      eventPanel.appendChild(eventName);
      eventPanel.appendChild(eventDesc);
      infoPanel.appendChild(eventPanel);
    }

    this.uiManager.append(infoPanel);

    // Action Bar
    const actionBar = this.uiManager.createPanel({
      position: 'absolute',
      bottom: '50px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: '20px',
    });

    // Buy Button
    const buyBtn = this.uiManager.createButton('Accept Offer', () => this.handleBuy());
    actionBar.appendChild(buyBtn);

    // Haggle Button (Tongue Skill)
    const haggleBtn = this.uiManager.createButton('Haggle', () => this.handleHaggle());
    // Disable if already at lowest or max attempts reached (based on skill)
    if (this.askingPrice <= this.lowestPrice) {
      haggleBtn.disabled = true;
      haggleBtn.textContent = 'Best Price Reached';
    }
    actionBar.appendChild(haggleBtn);

    // Leave Button
    const leaveBtn = this.uiManager.createButton('Leave', () => this.handleLeave());
    leaveBtn.style.backgroundColor = '#e74c3c';
    actionBar.appendChild(leaveBtn);

    this.uiManager.append(actionBar);
  }

  private handleHaggle(): void {
    const player = this.gameManager.getPlayerState();
    const maxNegotiations = player.skills.tongue; // Level 1 = 1 attempt, Level 5 = 5 attempts

    if (this.negotiationCount >= maxNegotiations) {
      this.uiManager.showModal(
        'No More Haggling',
        'The seller refuses to negotiate further.',
        [{ text: 'OK', onClick: () => {} }]
      );
      return;
    }

    this.negotiationCount++;
    
    // Award Tongue XP for haggling
    const tongueXPGain = GAME_CONFIG.player.skillProgression.xpGains.haggle;
    const leveledUp = this.gameManager.addSkillXP('tongue', tongueXPGain);
    if (leveledUp) {
      const progress = this.gameManager.getSkillProgress('tongue');
      setTimeout(() => {
        this.uiManager.showSkillLevelUpModal(
          'tongue',
          progress.level,
          'You can now haggle more effectively.'
        );
      }, 100);
    }
    
    // Simple reduction logic
    const reduction = Math.floor(this.askingPrice * GAME_CONFIG.negotiation.haggleReductionRate);
    this.askingPrice = Math.max(this.lowestPrice, this.askingPrice - reduction);

    // Update UI
    const priceTag = document.getElementById('asking-price');
    if (priceTag) {
      priceTag.textContent = `Asking Price: ${formatCurrency(this.askingPrice)}`;
    }

    // Refresh buttons
    this.setupUI();
  }

  private handleBuy(): void {
    const player = this.gameManager.getPlayerState();
    
    if (player.inventory.length >= player.garageSlots) {
       // Check garage capacity
       this.uiManager.showGarageFullModal();
       return;
    }

    if (!this.gameManager.spendMoney(this.askingPrice)) {
      this.uiManager.showInsufficientFundsModal();
      return;
    }

    if (!this.gameManager.addCar(this.car)) {
      this.uiManager.showGarageFullModal();
      // Refund the money since we couldn't add the car
      this.gameManager.addMoney(this.askingPrice);
      return;
    }

    // Apply special event rewards
    let rewardMessage = '';
    if (this.specialEvent) {
      if (this.specialEvent.reward.moneyBonus) {
        this.gameManager.addMoney(this.specialEvent.reward.moneyBonus);
        rewardMessage += `\nBonus: +${formatCurrency(this.specialEvent.reward.moneyBonus)}`;
      }
      if (this.specialEvent.reward.prestigeBonus) {
        this.gameManager.addPrestige(this.specialEvent.reward.prestigeBonus);
        rewardMessage += `\nBonus: +${this.specialEvent.reward.prestigeBonus} Prestige`;
      }
    }

    this.uiManager.showModal(
      'Purchase Complete',
      `Purchased ${this.car.name} for ${formatCurrency(this.askingPrice)}!${rewardMessage}`,
      [{
        text: 'Continue',
        onClick: () => {
          // Tutorial trigger: first buy - advance AFTER dismissing this modal
          if (this.tutorialManager.isCurrentStep('first_inspect')) {
            this.tutorialManager.advanceStep('first_buy');
            // Small delay to ensure tutorial dialogue appears before scene transition
            setTimeout(() => this.handleLeave(), 100);
          } else {
            this.handleLeave();
          }
        }
      }]
    );
  }

  private handleLeave(): void {
    this.uiManager.clear();
    this.scene.start('MapScene');
  }
}
