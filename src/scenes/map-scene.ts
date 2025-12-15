import Phaser from 'phaser';
import { BaseGameScene } from './base-game-scene';
import { getRandomCar, getCarById } from '@/data/car-database';
import { getRivalByTierProgression, calculateRivalInterest, getRivalById } from '@/data/rival-database';
import { eventBus } from '@/core/event-bus';
import { GAME_CONFIG } from '@/config/game-config';

const AUCTION_AP = GAME_CONFIG.timeCosts.auctionAP;
const INSPECT_AP = GAME_CONFIG.timeCosts.inspectAP;

/**
 * Map Node configuration.
 * Represents a location on the map that the player can visit.
 */
interface MapNode {
  id: string;
  name: string;
  x: number;
  y: number;
  type: 'scrapyard' | 'dealership' | 'auction' | 'special';
  color: number;
  specialEvent?: any; // For special event nodes
  hasRival?: boolean; // Whether a rival is present at this location
}

/**
 * Map Scene - Dashboard/Command Center for location selection.
 * Displays location cards with status information, rivals, and AP costs.
 * Information-dense interface for making informed decisions about where to visit.
 */
export class MapScene extends BaseGameScene {
  private nodes: MapNode[] = [];
  private dashboardContainer: HTMLElement | null = null;

  private readonly handleNetworkLevelUp = (level: number): void => {
    const abilities = {
      2: 'You can now spot special events more clearly.',
      3: 'You gain access to exclusive private sales.',
      4: 'You can see rival movements before they arrive.',
      5: 'You have access to all underground deals and legendary car locations.',
    };
    
    const message = abilities[level as keyof typeof abilities] || 'Your Network has improved!';
    
    this.uiManager.showSkillLevelUpModal('network', level, message);
  };

  constructor() {
    super({ key: 'MapScene' });
  }

  create(): void {
    console.log('Map Scene: Loaded');

    this.initializeManagers('map');
    this.setupBackground('OPERATIONS CENTER', {
      topColor: 0x1a1a2e,
      bottomColor: 0x16213e,
    });
    this.createDashboard();
    this.setupUI();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.setupCommonEventListeners();
    eventBus.on('network-levelup', this.handleNetworkLevelUp);
    eventBus.on('xp-gained', this.handleXPGained);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      eventBus.off('network-levelup', this.handleNetworkLevelUp);
      eventBus.off('xp-gained', this.handleXPGained);
      this.cleanupDashboard();
    });
  }

  private createDashboard(): void {
    // Build location data
    this.nodes = [
      {
        id: 'garage',
        name: 'Your Garage',
        x: 0,
        y: 0,
        type: 'scrapyard',
        color: 0x2ecc71,
      },
      {
        id: 'scrapyard_1',
        name: "Joe's Scrapyard",
        x: 0,
        y: 0,
        type: 'scrapyard',
        color: 0x8b4513,
      },
      {
        id: 'dealership_1',
        name: 'Classic Car Dealership',
        x: 0,
        y: 0,
        type: 'dealership',
        color: 0x4169e1,
      },
      {
        id: 'auction_1',
        name: 'Weekend Auction House',
        x: 0,
        y: 0,
        type: 'auction',
        color: 0xffd700,
      },
    ];

    // Add special events
    const specialEvents = this.gameManager.getActiveSpecialEvents();
    specialEvents.forEach((event: any) => {
      this.nodes.push({
        id: event.id,
        name: event.name,
        x: 0,
        y: 0,
        type: 'special',
        color: event.color,
        specialEvent: event,
      });
    });

    // Determine rival presence for each location
    this.nodes.forEach((node) => {
      if (node.id !== 'garage' && node.type !== 'special') {
        node.hasRival = Math.random() < GAME_CONFIG.encounters.rivalPresenceChance;
      }
    });

    // Create DOM dashboard
    this.dashboardContainer = document.createElement('div');
    this.dashboardContainer.style.cssText = `
      position: absolute;
      top: 120px;
      left: 50%;
      transform: translateX(-50%);
      width: 90%;
      max-width: 1200px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
      padding: 20px;
      z-index: 10;
    `;

    // Create cards for each location
    this.nodes.forEach((node) => {
      const card = this.createLocationCard(node);
      this.dashboardContainer!.appendChild(card);
    });

    document.body.appendChild(this.dashboardContainer);
  }

  private createLocationCard(node: MapNode): HTMLElement {
    const card = document.createElement('div');
    const isGarage = node.id === 'garage';
    const hasRival = node.hasRival;
    const apCost = isGarage ? 0 : (node.specialEvent?.apCost ?? GAME_CONFIG.timeCosts.travelAP);
    
    // Get color as hex string
    const hexColor = '#' + node.color.toString(16).padStart(6, '0');
    
    // Card styling with modern glass-morphism effect
    card.style.cssText = `
      background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05));
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 12px;
      padding: 20px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      position: relative;
      overflow: hidden;
    `;

    // Add color accent bar
    const accent = document.createElement('div');
    accent.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 4px;
      height: 100%;
      background: ${hexColor};
    `;
    card.appendChild(accent);

    // Header with icon and name
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
      padding-left: 8px;
    `;
    
    const icon = this.getLocationIcon(node);
    const iconSpan = document.createElement('span');
    iconSpan.textContent = icon;
    iconSpan.style.cssText = 'font-size: 28px;';
    
    const name = document.createElement('div');
    name.textContent = node.name;
    name.style.cssText = `
      font-size: 18px;
      font-weight: bold;
      color: #fff;
      flex: 1;
    `;
    
    header.appendChild(iconSpan);
    header.appendChild(name);
    card.appendChild(header);

    // Description
    const desc = document.createElement('div');
    desc.textContent = this.getLocationDescription(node);
    desc.style.cssText = `
      color: rgba(255,255,255,0.7);
      font-size: 13px;
      margin-bottom: 12px;
      padding-left: 8px;
      line-height: 1.4;
    `;
    card.appendChild(desc);

    // Status indicators
    const statusBar = document.createElement('div');
    statusBar.style.cssText = `
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 12px;
      padding-left: 8px;
    `;

    // AP cost badge
    if (!isGarage) {
      const apBadge = document.createElement('span');
      apBadge.textContent = `⚡ ${apCost} AP`;
      apBadge.style.cssText = `
        background: rgba(255,215,0,0.2);
        color: #ffd700;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: bold;
      `;
      statusBar.appendChild(apBadge);
    } else {
      const homeBadge = document.createElement('span');
      homeBadge.textContent = 'FREE';
      homeBadge.style.cssText = `
        background: rgba(46,204,113,0.2);
        color: #2ecc71;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: bold;
      `;
      statusBar.appendChild(homeBadge);
    }

    // Rival indicator
    if (hasRival) {
      const rivalBadge = document.createElement('span');
      rivalBadge.textContent = '⚔️ RIVAL PRESENT';
      rivalBadge.style.cssText = `
        background: rgba(255,69,58,0.2);
        color: #ff453a;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: bold;
      `;
      statusBar.appendChild(rivalBadge);
    }

    // Special event indicator
    if (node.type === 'special') {
      const specialBadge = document.createElement('span');
      specialBadge.textContent = '✨ SPECIAL';
      specialBadge.style.cssText = `
        background: rgba(191,64,191,0.2);
        color: #bf40bf;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: bold;
      `;
      statusBar.appendChild(specialBadge);
    }

    card.appendChild(statusBar);

    // Visit button
    const button = document.createElement('button');
    button.textContent = isGarage ? 'Return Home' : 'Visit Location';
    button.style.cssText = `
      width: 100%;
      padding: 10px;
      background: ${hexColor};
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.2s ease;
      margin-top: 8px;
    `;

    button.addEventListener('mouseenter', () => {
      button.style.transform = 'translateY(-2px)';
      button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = 'none';
    });

    button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.visitNode(node);
    });

    card.appendChild(button);

    // Hover effect for entire card
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-4px)';
      card.style.boxShadow = '0 8px 25px rgba(0,0,0,0.4)';
      card.style.borderColor = 'rgba(255,255,255,0.4)';
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'translateY(0)';
      card.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
      card.style.borderColor = 'rgba(255,255,255,0.2)';
    });

    // Click card to visit
    card.addEventListener('click', () => {
      this.visitNode(node);
    });

    return card;
  }

  private getLocationIcon(node: MapNode): string {
    if (node.id === 'garage') return '🏠';
    
    switch (node.type) {
      case 'scrapyard': return '🔧';
      case 'dealership': return '🏪';
      case 'auction': return '🔨';
      case 'special': return '✨';
      default: return '📍';
    }
  }

  private getLocationDescription(node: MapNode): string {
    if (node.id === 'garage') {
      return 'Your home base. Manage inventory, restore cars, and end the day.';
    }

    if (node.specialEvent) {
      return node.specialEvent.description || 'A unique opportunity has appeared!';
    }

    switch (node.type) {
      case 'scrapyard':
        return 'Rough diamonds in the rough. Low prices, questionable condition.';
      case 'dealership':
        return 'Higher quality inventory. Prices reflect the better condition.';
      case 'auction':
        return 'Competitive bidding. Face rivals for rare finds.';
      default:
        return 'An interesting location worth investigating.';
    }
  }

  private cleanupDashboard(): void {
    if (this.dashboardContainer && this.dashboardContainer.parentNode) {
      this.dashboardContainer.parentNode.removeChild(this.dashboardContainer);
      this.dashboardContainer = null;
    }
  }

  private setupUI(): void {
    this.resetUIWithHUD();
  }

  private visitNode(node: MapNode): void {
    // Garage is free to return to and doesn't trigger encounters
    if (node.id === 'garage') {
      this.scene.start('GarageScene');
      return;
    }

    // Special events have custom AP costs, regular nodes use travel AP
    const requiredAP = node.specialEvent?.apCost ?? GAME_CONFIG.timeCosts.travelAP;

    const block = this.timeSystem.getAPBlockModal(requiredAP, `visiting ${node.name}`);
    if (block) {
      this.uiManager.showModal(block.title, block.message, [
        { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
      ]);
      return;
    }

    // Spend AP
    this.timeSystem.spendAP(requiredAP);

    // Update current location for downstream systems/UI
    this.gameManager.setLocation(node.type);

    // Award Network XP for visiting location (first visit only)
    const isFirstVisit = this.gameManager.visitLocation(node.id);
    if (isFirstVisit) {
      // Show subtle notification for first visit
      setTimeout(() => {
        const message = `New location discovered! Network +${GAME_CONFIG.player.skillProgression.xpGains.travelNewLocation} XP`;
        this.uiManager.showModal('Location Discovered', message, [
          { text: 'Continue', onClick: () => {} }
        ]);
      }, 100);
    }

    // Generate encounter based on node type
    this.generateEncounter(node);
  }

  private generateEncounter(node: MapNode): void {
    // Handle special events
    if (node.type === 'special') {
      const specialEvent = node.specialEvent;
      this.generateSpecialEncounter(specialEvent);
      return;
    }

    // Tutorial-specific encounters with specific cars
    try {
      if (this.tutorialManager && this.tutorialManager.isTutorialActive()) {
        const step = this.tutorialManager.getCurrentStep();
        
        // Force Rusty Sedan for first inspection/buy
        if (step === 'first_visit_scrapyard' || step === 'first_inspect' || step === 'first_buy' || step === 'first_restore') {
          const car = getCarById('tutorial_rusty_sedan') || getRandomCar();
          this.scene.start('NegotiationScene', { car });
          return;
        }
        
        // First loss: Force Sterling Vance encounter with Muscle Car
        if (step === 'first_flip') {
          const car = getCarById('tutorial_muscle_car') || getRandomCar();
          const sterlingVance = getRivalById('sterling_vance');
          const interest = calculateRivalInterest(sterlingVance, car.tags);
          
          // Show Sterling's dramatic intro dialogue, then start auction
          this.tutorialManager.showDialogueWithCallback(
            "Sterling Vance",
            "*smirks* Sorry kid, but this Muscle Car is mine. You'll need more than just money to beat me in a bidding war. Watch and learn.",
            () => {
              // After dialogue is dismissed, advance step and start auction
              this.tutorialManager.advanceStep('first_loss');
              // Use scene.switch to properly transition - this stops current scene and starts new one
              this.scene.stop('MapScene');
              this.scene.start('AuctionScene', { car, rival: sterlingVance, interest });
            }
          );
          return;
        }
        
        // Skip redemption step - it's handled in AuctionScene after first_loss
        // If player somehow gets to this state, treat as normal gameplay
        if (step === 'first_loss' || step === 'redemption') {
          // Tutorial should have advanced past this point
          // Fall through to normal gameplay
        }
      }
    } catch (error) {
      console.error('Tutorial error in MapScene:', error);
      // Continue with normal gameplay if tutorial fails
    }
    
    // Regular encounters - get random car
    const car = getRandomCar();
    
    // Check if this node has a pre-determined rival (from map indicators)
    const hasRival = node.hasRival || false;

    if (hasRival) {
      // Auction consumes additional AP
      const block = this.timeSystem.getAPBlockModal(AUCTION_AP, 'an auction');
      if (block) {
        this.uiManager.showModal(block.title, block.message, [
          { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
        ]);
        return;
      }

      // Auction with rival
      const playerPrestige = this.gameManager.getPlayerState().prestige;
      const rival = getRivalByTierProgression(playerPrestige);
      const interest = calculateRivalInterest(rival, car.tags);

      // Explain why we're switching to an auction encounter.
      this.uiManager.showModal(
        'Rival Spotted',
        `You arrive at ${node.name} and find ${rival.name} eyeing the same car.\n\nA bidding war begins for:\n${car.name}`,
        [
          {
            text: 'Start Auction',
            onClick: () => {
              this.timeSystem.spendAP(AUCTION_AP);
              this.scene.start('AuctionScene', { car, rival, interest });
            },
          },
        ]
      );
    } else {
      // Negotiation consumes inspection AP
      const block = this.timeSystem.getAPBlockModal(INSPECT_AP, 'inspecting this car');
      if (block) {
        this.uiManager.showModal(block.title, block.message, [
          { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
        ]);
        return;
      }

      this.timeSystem.spendAP(INSPECT_AP);

      // Solo negotiation
      this.scene.start('NegotiationScene', { car });
    }
  }

  private generateSpecialEncounter(specialEvent: any): void {
    // Generate a car with special event properties
    let car = getRandomCar();

    // Apply special event modifiers
    if (specialEvent.reward.guaranteedTags) {
      // Add guaranteed tags to the car
      car.tags = [...new Set([...car.tags, ...specialEvent.reward.guaranteedTags])];
    }

    if (specialEvent.reward.carValueMultiplier) {
      // Modify car value (this will be handled in the negotiation/auction)
      car.baseValue = Math.floor(car.baseValue * specialEvent.reward.carValueMultiplier);
    }

    // Special events always have a car to negotiate for (no auctions for simplicity)
    // AP was already spent in visitNode(), don't double-charge
    const block = this.timeSystem.getAPBlockModal(INSPECT_AP, `the ${specialEvent.name}`);
    if (block) {
      this.uiManager.showModal(block.title, block.message, [
        { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
      ]);
      return;
    }

    this.timeSystem.spendAP(INSPECT_AP);

    // Show special event description
    this.uiManager.showModal(
      specialEvent.name,
      `${specialEvent.description}\n\nYou find an interesting vehicle:\n${car.name}`,
      [
        {
          text: 'Negotiate Purchase',
          onClick: () => {
            // Remove the event since it's been completed
            this.gameManager.removeSpecialEvent(specialEvent.id);
            this.scene.start('NegotiationScene', {
              car,
              specialEvent: specialEvent
            });
          },
        },
      ]
    );
  }
}
