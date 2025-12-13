import Phaser from 'phaser';
import { GameManager } from '@/core/game-manager';
import { UIManager } from '@/ui/ui-manager';
import { TimeSystem } from '@/systems/time-system';
import { Car, calculateCarValue } from '@/data/car-database';
import { eventBus } from '@/core/event-bus';
import { GAME_CONFIG } from '@/config/game-config';

/**
 * Negotiation Scene - PvE encounter with a seller.
 * Player can haggle to reduce the asking price.
 * Haggle attempts limited by Tongue skill level.
 * Eye skill reveals hidden car history.
 */
export class NegotiationScene extends Phaser.Scene {
  private gameManager!: GameManager;
  private uiManager!: UIManager;
  private timeSystem!: TimeSystem;
  private car!: Car;
  private specialEvent?: any;
  private askingPrice: number = 0;
  private lowestPrice: number = 0;
  private negotiationCount: number = 0;

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

    this.gameManager = GameManager.getInstance();
    this.gameManager.setLocation('negotiation');
    this.uiManager = new UIManager();
    this.timeSystem = new TimeSystem();

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
    // Greenish/Neutral background for negotiation
    graphics.fillGradientStyle(0x2c3e50, 0x2c3e50, 0x27ae60, 0x27ae60, 1);
    graphics.fillRect(0, 0, width, height);

    this.add.text(width / 2, 30, 'NEGOTIATION', {
      fontSize: '36px',
      color: '#eee',
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
    
    // Car Info Panel
    const infoPanel = this.uiManager.createPanel({
      position: 'absolute',
      top: '100px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: '600px',
      textAlign: 'center',
    });

    const title = document.createElement('h2');
    title.textContent = this.car.name;
    title.style.color = '#ecf0f1';
    infoPanel.appendChild(title);

    const priceTag = document.createElement('div');
    priceTag.id = 'asking-price';
    priceTag.textContent = `Asking Price: $${this.askingPrice.toLocaleString()}`;
    priceTag.style.fontSize = '24px';
    priceTag.style.color = '#f1c40f';
    priceTag.style.margin = '20px 0';
    infoPanel.appendChild(priceTag);

    const details = document.createElement('div');
    details.innerHTML = `
      <p>Condition: ${this.car.condition}/100</p>
      <p>Tags: ${this.car.tags.join(', ')}</p>
    `;
    details.style.color = '#bdc3c7';
    infoPanel.appendChild(details);

    // Hidden details (Eye Skill)
    if (player.skills.eye >= 2 && this.car.history && this.car.history.length > 0) {
      const history = document.createElement('div');
      history.innerHTML = `<p style="color: #e74c3c">History: ${this.car.history.join(', ')}</p>`;
      infoPanel.appendChild(history);
    }

    // Special Event Info
    if (this.specialEvent) {
      const eventInfo = document.createElement('div');
      eventInfo.innerHTML = `
        <p style="color: #f39c12; font-weight: bold;">Special Event: ${this.specialEvent.name}</p>
        <p style="color: #bdc3c7; font-style: italic;">${this.specialEvent.description}</p>
      `;
      eventInfo.style.marginTop = '20px';
      eventInfo.style.padding = '10px';
      eventInfo.style.backgroundColor = 'rgba(243, 156, 18, 0.1)';
      eventInfo.style.borderRadius = '5px';
      infoPanel.appendChild(eventInfo);
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
    
    // Simple reduction logic
    const reduction = Math.floor(this.askingPrice * GAME_CONFIG.negotiation.haggleReductionRate);
    this.askingPrice = Math.max(this.lowestPrice, this.askingPrice - reduction);

    // Update UI
    const priceTag = document.getElementById('asking-price');
    if (priceTag) {
      priceTag.textContent = `Asking Price: $${this.askingPrice.toLocaleString()}`;
    }

    // Refresh buttons
    this.setupUI();
  }

  private handleBuy(): void {
    if (this.gameManager.getPlayerState().inventory.length >= this.gameManager.getPlayerState().garageSlots) {
       // Check garage capacity
       this.uiManager.showModal(
         'Garage Full',
         'Garage Full - Sell or Scrap current car first.',
         [{ text: 'OK', onClick: () => {} }]
       );
       return;
    }

    if (!this.gameManager.spendMoney(this.askingPrice)) {
      this.uiManager.showModal(
        'Not Enough Money',
        "You don't have enough money to buy this car.",
        [{ text: 'OK', onClick: () => {} }]
      );
      return;
    }

    this.gameManager.addCar(this.car);

    // Apply special event rewards
    let rewardMessage = '';
    if (this.specialEvent) {
      if (this.specialEvent.reward.moneyBonus) {
        this.gameManager.addMoney(this.specialEvent.reward.moneyBonus);
        rewardMessage += `\nBonus: +$${this.specialEvent.reward.moneyBonus.toLocaleString()}`;
      }
      if (this.specialEvent.reward.prestigeBonus) {
        this.gameManager.addPrestige(this.specialEvent.reward.prestigeBonus);
        rewardMessage += `\nBonus: +${this.specialEvent.reward.prestigeBonus} Prestige`;
      }
    }

    this.uiManager.showModal(
      'Purchase Complete',
      `Purchased ${this.car.name} for $${this.askingPrice.toLocaleString()}!${rewardMessage}`,
      [{ text: 'Continue', onClick: () => this.handleLeave() }]
    );
  }

  private handleLeave(): void {
    this.uiManager.clear();
    this.scene.start('MapScene');
  }
}
