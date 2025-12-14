import Phaser from 'phaser';
import { BaseGameScene } from './base-game-scene';
import { getRandomCar, getCarById } from '@/data/car-database';
import { getRivalByTierProgression, calculateRivalInterest, getRivalById } from '@/data/rival-database';
import { eventBus } from '@/core/event-bus';
import { GAME_CONFIG } from '@/config/game-config';

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
}

/**
 * Map Scene - Player explores locations and finds cars.
 * Displays clickable nodes representing different locations.
 * Each visit costs time and may result in auction (PvP) or negotiation (PvE).
 */
export class MapScene extends BaseGameScene {
  private nodes: MapNode[] = [];

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
    this.setupBackground('THE MAP', {
      topColor: 0x1a1a2e,
      bottomColor: 0x16213e,
    });
    this.createMapNodes();
    this.setupUI();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.setupCommonEventListeners();
    eventBus.on('network-levelup', this.handleNetworkLevelUp);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      eventBus.off('network-levelup', this.handleNetworkLevelUp);
    });
  }


  private createMapNodes(): void {
    const { width, height } = this.cameras.main;

    // Regular map nodes
    this.nodes = [
      {
        id: 'scrapyard_1',
        name: "Joe's Scrapyard",
        x: width * 0.25,
        y: height * 0.3,
        type: 'scrapyard',
        color: 0x8b4513,
      },
      {
        id: 'dealership_1',
        name: 'Classic Car Dealership',
        x: width * 0.75,
        y: height * 0.3,
        type: 'dealership',
        color: 0x4169e1,
      },
      {
        id: 'auction_1',
        name: 'Weekend Auction House',
        x: width * 0.5,
        y: height * 0.6,
        type: 'auction',
        color: 0xffd700,
      },
    ];

    // Add special events as additional nodes
    const specialEvents = this.gameManager.getActiveSpecialEvents();
    specialEvents.forEach((event: any) => {
      this.nodes.push({
        id: event.id,
        name: event.name,
        x: event.x,
        y: event.y,
        type: 'special',
        color: event.color,
        specialEvent: event,
      });
    });

    this.nodes.forEach((node) => {
      // Draw node circle
      const circle = this.add.circle(node.x, node.y, 40, node.color);
      circle.setInteractive({ useHandCursor: true });

      // Add label
      this.add.text(node.x, node.y + 60, node.name, {
        fontSize: '14px',
        color: '#fff',
        align: 'center',
        wordWrap: { width: 150 },
      }).setOrigin(0.5);

      // Add time cost (use special event time cost if available)
      const timeCost = (node as any).specialEvent?.timeCost || GAME_CONFIG.timeCosts.travelHours;
      this.add.text(node.x, node.y, `${timeCost}h`, {
        fontSize: '18px',
        color: '#fff',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      // Click handler
      circle.on('pointerdown', () => this.visitNode(node));
      
      // Hover effects
      circle.on('pointerover', () => {
        circle.setScale(1.1);
      });
      
      circle.on('pointerout', () => {
        circle.setScale(1);
      });
    });
  }

  private setupUI(): void {
    this.uiManager.clear();

    // Create HUD
    const hud = this.createStandardHUD();
    this.uiManager.append(hud);

    // Back to garage button
    const backBtn = this.uiManager.createButton(
      'Back to Garage',
      () => this.scene.start('GarageScene'),
      {
        position: 'absolute',
        bottom: '20px',
        right: '20px',
      }
    );
    this.uiManager.append(backBtn);
  }

  private visitNode(node: MapNode): void {
    const timeCost = (node as any).specialEvent?.timeCost || GAME_CONFIG.timeCosts.travelHours;
    const requiredHours = timeCost;

    const block = this.timeSystem.getTimeBlockModal(requiredHours, `visiting ${node.name}`);
    if (block) {
      this.uiManager.showModal(block.title, block.message, [
        { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
      ]);
      return;
    }

    // Advance time
    this.timeSystem.advanceTime(requiredHours);

    // Update current location for downstream systems/UI
    this.gameManager.setLocation(node.type);

    // Award Network XP for visiting location (first visit only)
    const isFirstVisit = this.gameManager.visitLocation(node.id);
    if (isFirstVisit) {
      const progress = this.gameManager.getSkillProgress('network');
      // Show subtle notification for first visit
      setTimeout(() => {
        const message = `New location discovered! Network +${GAME_CONFIG.player.skillProgression.xpGains.travelNewLocation} XP`;
        this.uiManager.showModal('Location Discovered', message, [
          { text: 'Continue', onClick: () => {} }
        ]);
      }, 100);
    }

    // Tutorial trigger: first inspect
    if (this.tutorialManager.isTutorialActive() && this.tutorialManager.getCurrentStep() === 'first_visit_scrapyard') {
      this.tutorialManager.advanceStep('first_inspect');
    }

    // Generate encounter based on node type
    this.generateEncounter(node);
  }

  private generateEncounter(node: MapNode): void {
    // Handle special events
    if (node.type === 'special') {
      const specialEvent = (node as any).specialEvent;
      this.generateSpecialEncounter(specialEvent);
      return;
    }

    // Tutorial-specific encounters with specific cars
    if (this.tutorialManager.isTutorialActive()) {
      const step = this.tutorialManager.getCurrentStep();
      
      // Force Rusty Sedan for first inspection/buy
      if (step === 'first_inspect' || step === 'first_buy' || step === 'first_restore') {
        const car = getCarById('tutorial_rusty_sedan') || getRandomCar();
        this.scene.start('NegotiationScene', { car });
        return;
      }
      
      // First loss: Force Sterling Vance encounter with Muscle Car
      if (step === 'first_flip') {
        const car = getCarById('tutorial_muscle_car') || getRandomCar();
        const sterlingVance = getRivalById('sterling_vance');
        const interest = calculateRivalInterest(sterlingVance, car.tags);
        
        // Show dramatic intro
        setTimeout(() => {
          this.tutorialManager.advanceStep('first_loss');
        }, 100);
        
        // Both Sterling AND Scrapyard Joe are at this location
        // After losing to Sterling, auction scene will handle the redemption encounter
        this.scene.start('AuctionScene', { car, rival: sterlingVance, interest });
        return;
      }
      
      // Skip redemption step - it's handled in AuctionScene after first_loss
      // If player somehow gets to this state, treat as normal gameplay
      if (step === 'first_loss' || step === 'redemption') {
        // Tutorial should have advanced past this point
        // Fall through to normal gameplay
      }
    }
    
    // Regular encounters - get random car
    const car = getRandomCar();
    
    // Normal gameplay: random rival chance
    const hasRival = Math.random() < GAME_CONFIG.encounters.rivalPresenceChance;

    if (hasRival) {
      // Auction consumes additional time
      const block = this.timeSystem.getTimeBlockModal(AUCTION_HOURS, 'an auction');
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
              this.timeSystem.advanceTime(AUCTION_HOURS);
              this.scene.start('AuctionScene', { car, rival, interest });
            },
          },
        ]
      );
    } else {
      // Negotiation consumes inspection time
      const block = this.timeSystem.getTimeBlockModal(INSPECT_HOURS, 'inspecting this car');
      if (block) {
        this.uiManager.showModal(block.title, block.message, [
          { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
        ]);
        return;
      }

      this.timeSystem.advanceTime(INSPECT_HOURS);

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
    const block = this.timeSystem.getTimeBlockModal(INSPECT_HOURS, `the ${specialEvent.name}`);
    if (block) {
      this.uiManager.showModal(block.title, block.message, [
        { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
      ]);
      return;
    }

    this.timeSystem.advanceTime(INSPECT_HOURS);

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
