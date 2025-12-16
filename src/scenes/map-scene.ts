import Phaser from 'phaser';
import { BaseGameScene } from './base-game-scene';
import { calculateCarValue, getCarById, getRandomCar, type Car } from '@/data/car-database';
import { calculateRivalInterest, getRivalById } from '@/data/rival-database';
import { GAME_CONFIG } from '@/config/game-config';
import { BASE_LOCATIONS, type LocationType } from '@/data/location-database';
import type { SpecialEvent } from '@/systems/special-events-system';
import { buildSpecialEventCar, routeRegularEncounter } from '@/systems/map-encounter-router';
import { formatCurrency } from '@/utils/format';

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
  type: LocationType | 'special';
  color: number;
  specialEvent?: SpecialEvent; // For special event nodes
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

  private getAuctionOpeningBid(car: Car): number {
    const baseValue = calculateCarValue(car);
    const marketInfo = this.gameManager.getCarMarketInfo(car.tags);
    const estimate = Math.floor(baseValue * marketInfo.modifier);
    return Math.floor(estimate * GAME_CONFIG.auction.startingBidMultiplier);
  }

  private showCannotAffordAuctionModal(openingBid: number): void {
    const player = this.gameManager.getPlayerState();
    this.uiManager.showModal(
      'Not Enough Money',
      `You can't afford the opening bid for this auction.\n\nOpening bid: ${formatCurrency(openingBid)}\nYour money: ${formatCurrency(player.money)}\n\nTip: Visit the Garage to sell something, then come back.`,
      [
        { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
        { text: 'OK', onClick: () => {} },
      ]
    );
  }

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
    this.setupUI();
    this.createDashboard();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.setupCommonEventListeners();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanupDashboard();
    });
  }

  private createDashboard(): void {
    // Build location data
    this.nodes = BASE_LOCATIONS.map((loc) => ({
      id: loc.id,
      name: loc.name,
      x: 0,
      y: 0,
      type: loc.type,
      color: loc.color,
    }));

    // Add special events
    const specialEvents = this.gameManager.getActiveSpecialEvents();
    specialEvents.forEach((event: SpecialEvent) => {
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

    // Determine rival presence for each location (stable within the day)
    const rivalRollLocations = this.nodes
      .filter((node) => node.id !== 'garage' && node.type !== 'special')
      .map((node) => node.id);
    this.gameManager.ensureRivalPresenceForLocations(rivalRollLocations);

    this.nodes.forEach((node) => {
      if (node.id !== 'garage' && node.type !== 'special') {
        node.hasRival = this.gameManager.hasRivalAtLocation(node.id);
      }
    });

    // Create DOM dashboard
    this.dashboardContainer = this.uiManager.createMapDashboardContainer();

    // Create cards for each location
    this.nodes.forEach((node) => {
      const card = this.createLocationCard(node);
      this.dashboardContainer!.appendChild(card);
    });

    this.uiManager.mountMapDashboard(this.dashboardContainer);
  }

  private createLocationCard(node: MapNode): HTMLElement {
    const player = this.gameManager.getPlayerState();
    const hasRival = Boolean(node.hasRival);
    const canSeeRivals = player.skills.network >= 2;
    const isGarage = node.id === 'garage' || node.type === 'garage';

    // AP is charged once, at encounter start (no extra travel AP for regular locations).
    // If the player can't see rivals yet, avoid revealing rival presence via AP cost.
    const apCost = isGarage
      ? 0
      : (node.specialEvent?.timeCost ?? ((canSeeRivals && hasRival) ? AUCTION_AP : INSPECT_AP));

    // Check for locks
    let isLocked = false;
    let lockReason = '';

    if (node.type === 'dealership' && player.prestige < GAME_CONFIG.progression.unlocks.dealership) {
      isLocked = true;
      lockReason = `Requires ${GAME_CONFIG.progression.unlocks.dealership} Prestige`;
    } else if (node.type === 'auction' && player.prestige < GAME_CONFIG.progression.unlocks.auction) {
      isLocked = true;
      lockReason = `Requires ${GAME_CONFIG.progression.unlocks.auction} Prestige`;
    }

    const world = this.gameManager.getWorldState();
    const offerMap = world.carOfferByLocation ?? {};
    const isExhaustedToday =
      node.type !== 'special' &&
      node.id !== 'garage' &&
      Object.prototype.hasOwnProperty.call(offerMap, node.id) &&
      offerMap[node.id] === null;

    return this.uiManager.createMapLocationCard({
      name: node.name,
      description: this.getLocationDescription(node),
      icon: this.getLocationIcon(node),
      color: node.color,
      apCost,
      isGarage,
      isLocked,
      lockReason,
      isExhaustedToday,
      showRivalBadge: hasRival && canSeeRivals,
      showSpecialBadge: node.type === 'special',
      onVisit: () => this.visitNode(node),
    });
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
      return 'Your home base. Manage your cars, restore cars, and end the day.';
    }

    if (node.specialEvent) {
      return node.specialEvent.description || 'A unique opportunity has appeared!';
    }

    switch (node.type) {
      case 'scrapyard':
        return 'Rough diamonds in the rough. Low prices, questionable condition.';
      case 'dealership':
        return 'Higher quality stock. Prices reflect the better condition.';
      case 'auction':
        return 'Competitive bidding. Face rivals for rare finds.';
      default:
        return 'An interesting location worth investigating.';
    }
  }

  private cleanupDashboard(): void {
    if (!this.dashboardContainer) return;

    this.dashboardContainer.parentNode?.removeChild(this.dashboardContainer);
    this.dashboardContainer = null;
  }

  private setupUI(): void {
    this.resetUIWithHUD();

    // Minimal clarity: daily intel is locked in for the day (prevents confusion about rerolls).
    const hud = document.getElementById('game-hud');
    if (hud && !hud.querySelector('[data-hud="daily-intel"]')) {
      const intelHint = document.createElement('div');
      intelHint.setAttribute('data-hud', 'daily-intel');
      intelHint.textContent = '📰 Today\'s intel is locked (rivals & offers don\'t reroll)';
      intelHint.title = 'Rival presence and location offers are fixed for the current day.';
      intelHint.style.cssText = `
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid rgba(100, 200, 255, 0.2);
        font-size: 12px;
        color: rgba(224, 230, 237, 0.8);
      `;
      hud.appendChild(intelHint);
    }
  }

  private visitNode(node: MapNode): void {
    // Garage is free to return to and doesn't trigger encounters
    if (node.id === 'garage') {
      this.scene.start('GarageScene');
      return;
    }

    // If the location's daily offer has already been consumed, block the visit.
    if (node.type !== 'special') {
      const world = this.gameManager.getWorldState();
      const offerMap = world.carOfferByLocation ?? {};
      const isExhaustedToday =
        Object.prototype.hasOwnProperty.call(offerMap, node.id) && offerMap[node.id] === null;

      if (isExhaustedToday) {
        this.uiManager.showModal(
          'Exhausted Today',
          `${node.name} has already been picked clean today. Check back tomorrow.`,
          [{ text: 'OK', onClick: () => {} }]
        );
        return;
      }
    }

    // Special events have custom AP costs and should still charge immediately.
    if (node.type === 'special') {
      const requiredAP = node.specialEvent?.timeCost ?? 0;
      const block = this.timeSystem.getAPBlockModal(requiredAP, `attending ${node.name}`);
      if (block) {
        this.uiManager.showModal(block.title, block.message, [
          { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
        ]);
        return;
      }

      this.timeSystem.spendAP(requiredAP);
      this.applyArrivalEffects(node);
      this.generateEncounter(node);
      return;
    }

    // Regular locations: no travel AP. AP is charged once when the encounter starts.
    this.generateEncounter(node);
  }

  private applyArrivalEffects(node: MapNode): void {
    // Update HUD location to the specific place the player is visiting.
    this.gameManager.setLocation(node.name);

    // Award Network XP for visiting location (first visit only)
    const isFirstVisit = this.gameManager.visitLocation(node.id);
    if (isFirstVisit) {
      setTimeout(() => {
        const message = `New location discovered! Network +${GAME_CONFIG.player.skillProgression.xpGains.travelNewLocation} XP`;
        this.uiManager.showModal('Location Discovered', message, [
          { text: 'Continue', onClick: () => {} },
        ]);
      }, 100);
    }
  }

  private generateEncounter(node: MapNode): void {
    // Handle special events
    if (node.type === 'special') {
      const specialEvent = node.specialEvent;
      if (!specialEvent) {
        this.uiManager.showToast('This special event is no longer available.');
        return;
      }
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
          if (!this.hasGarageSpace()) {
            this.showGarageFullGate();
            return;
          }

          const apBlock = this.timeSystem.getAPBlockModal(INSPECT_AP, 'inspecting this car');
          if (apBlock) {
            this.uiManager.showModal(apBlock.title, apBlock.message, [
              { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
            ]);
            return;
          }

          this.timeSystem.spendAP(INSPECT_AP);
          this.applyArrivalEffects(node);
          this.scene.start('NegotiationScene', { car, locationId: node.id });
          return;
        }
        
        // First loss: Force Sterling Vance encounter with Muscle Car
        if (step === 'first_flip') {
          const car = getCarById('tutorial_muscle_car') || getRandomCar();
          const sterlingVance = getRivalById('sterling_vance');
          const interest = calculateRivalInterest(sterlingVance, car.tags);

          const apBlock = this.timeSystem.getAPBlockModal(AUCTION_AP, 'an auction');
          if (apBlock) {
            this.uiManager.showModal(apBlock.title, apBlock.message, [
              { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
            ]);
            return;
          }
          
          // Show Sterling's dramatic intro dialogue, then start auction
          this.tutorialManager.showDialogueWithCallback(
            "Sterling Vance",
            "*smirks* Sorry kid, but this Muscle Car is mine. You'll need more than just money to beat me in a bidding war. Watch and learn.",
            () => {
              if (!this.hasGarageSpace()) {
                this.showGarageFullGate();
                return;
              }

              const player = this.gameManager.getPlayerState();
              const openingBid = this.getAuctionOpeningBid(car);
              if (player.money < openingBid) {
                this.showCannotAffordAuctionModal(openingBid);
                return;
              }

              // After dialogue is dismissed, advance step and start auction
              this.tutorialManager.advanceStep('first_loss');
              this.timeSystem.spendAP(AUCTION_AP);
              this.applyArrivalEffects(node);
              // Use scene.switch to properly transition - this stops current scene and starts new one
              this.scene.stop('MapScene');
              this.scene.start('AuctionScene', { car, rival: sterlingVance, interest, locationId: node.id });
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
    const car = this.gameManager.getDailyCarOfferForLocation(node.id);

    if (!car) {
      this.uiManager.showModal(
        'Nothing Available',
        `You scout ${node.name}, but there's nothing worth pursuing here today.`,
        [{ text: 'Continue', onClick: () => {} }]
      );
      return;
    }
    
    // Check if this node has a pre-determined rival (from map indicators)
    const hasRival = node.hasRival || false;

    const playerPrestige = this.gameManager.getPlayerState().prestige;
    const routed = routeRegularEncounter({
      locationId: node.id,
      car,
      hasRival,
      playerPrestige,
      auctionApCost: AUCTION_AP,
      inspectApCost: INSPECT_AP,
    });

    if (routed.kind === 'auction') {
      // Auction encounter (single AP charge)
      const block = this.timeSystem.getAPBlockModal(routed.apCost, 'an auction');
      if (block) {
        this.uiManager.showModal(block.title, block.message, [
          { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
        ]);
        return;
      }

      const { rival } = routed.sceneData;

      // Explain why we're switching to an auction encounter.
      this.uiManager.showModal(
        'Rival Spotted',
        `You arrive at ${node.name} and find ${rival.name} eyeing the same car.\n\nA bidding war begins for:\n${car.name}`,
        [
          {
            text: 'Start Auction',
            onClick: () => {
              if (!this.hasGarageSpace()) {
                this.showGarageFullGate();
                return;
              }

              const player = this.gameManager.getPlayerState();
              const openingBid = this.getAuctionOpeningBid(car);
              if (player.money < openingBid) {
                this.showCannotAffordAuctionModal(openingBid);
                return;
              }
              this.timeSystem.spendAP(routed.apCost);
              this.applyArrivalEffects(node);
              this.scene.start(routed.sceneKey, routed.sceneData);
            },
          },
        ]
      );
      return;
    }

    // Negotiation consumes inspection AP
    const block = this.timeSystem.getAPBlockModal(routed.apCost, 'inspecting this car');
    if (block) {
      this.uiManager.showModal(block.title, block.message, [
        { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
      ]);
      return;
    }

    if (!this.hasGarageSpace()) {
      this.showGarageFullGate();
      return;
    }

    this.timeSystem.spendAP(routed.apCost);
    this.applyArrivalEffects(node);

    // Solo negotiation
    this.scene.start(routed.sceneKey, routed.sceneData);
  }

  private generateSpecialEncounter(specialEvent: SpecialEvent): void {
    const car = buildSpecialEventCar(specialEvent);

    // Special events always have a car to negotiate for (no auctions for simplicity)
    // AP was already spent in visitNode(); do not charge additional inspection AP here.
    if (!this.hasGarageSpace()) {
      this.showGarageFullGate();
      return;
    }

    // Show special event description
    this.uiManager.showModal(
      specialEvent.name,
      `${specialEvent.description}\n\nYou find an interesting vehicle:\n${car.name}`,
      [
        {
          text: 'Negotiate Purchase',
          onClick: () => {
            if (!this.hasGarageSpace()) {
              this.showGarageFullGate();
              return;
            }
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

  private hasGarageSpace(): boolean {
    return this.gameManager.hasGarageSpace();
  }

  private showGarageFullGate(): void {
    this.uiManager.showModal(
      'Garage Full',
      'Your garage is full. Sell or scrap a car before acquiring another.',
      [
        { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
        { text: 'Stay Here', onClick: () => {} },
      ]
    );
  }
}
