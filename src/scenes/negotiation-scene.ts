import Phaser from 'phaser';
import { GameManager } from '@/core/game-manager';
import { UIManager } from '@/ui/ui-manager';
import { Car, calculateCarValue } from '@/data/car-database';
import { Economy } from '@/systems/economy';

/**
 * Negotiation Scene - PvE encounter with a seller
 */
export class NegotiationScene extends Phaser.Scene {
  private gameManager!: GameManager;
  private uiManager!: UIManager;
  private car!: Car;
  private askingPrice: number = 0;
  private lowestPrice: number = 0;
  private negotiationCount: number = 0;
  private isDealSealed: boolean = false;

  constructor() {
    super({ key: 'NegotiationScene' });
  }

  init(data: { car: Car }): void {
    this.car = data.car;
    // Seller starts asking for 120% of value (or market value)
    const value = calculateCarValue(this.car);
    this.askingPrice = Math.floor(value * 1.2);
    // Seller won't go below 90% of value
    this.lowestPrice = Math.floor(value * 0.9);
    this.negotiationCount = 0;
    this.isDealSealed = false;
  }

  create(): void {
    console.log('Negotiation Scene: Loaded');

    this.gameManager = GameManager.getInstance();
    this.uiManager = new UIManager();

    this.setupBackground();
    this.setupUI();
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
      alert("Seller refuses to negotiate further.");
      return;
    }

    this.negotiationCount++;
    
    // Simple reduction logic
    const reduction = Math.floor(this.askingPrice * 0.05); // 5% drop
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
    const player = this.gameManager.getPlayerState();

    if (player.money < this.askingPrice) {
      alert("You cannot afford this car!");
      return;
    }

    if (this.gameManager.getPlayerState().inventory.length >= this.gameManager.getPlayerState().garageSlots) {
       // Check garage capacity
       alert("Garage Full! You must sell your current car first.");
       return;
    }

    this.gameManager.spendMoney(this.askingPrice);
    this.gameManager.addCar(this.car);
    
    alert(`Purchased ${this.car.name} for $${this.askingPrice.toLocaleString()}!`);
    this.handleLeave();
  }

  private handleLeave(): void {
    this.uiManager.clear();
    this.scene.start('MapScene');
  }
}
