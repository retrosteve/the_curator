import { debugLog, errorLog } from '@/utils/log';
import Phaser from 'phaser';
import { BaseGameScene } from './base-game-scene';
import { calculateCarValue, getCarById, getRandomCarForPrestige, type Car } from '@/data/car-database';
import { calculateRivalInterest, getRivalById } from '@/data/rival-database';
import { GAME_CONFIG } from '@/config/game-config';
import { BASE_LOCATIONS, getBaseLocationDefinitionById, type LocationType } from '@/data/location-database';
import type { SpecialEvent } from '@/systems/special-events-system';
import { buildSpecialEventCar, routeRegularEncounter } from '@/systems/map-encounter-router';
import { computeMapLocationCardState, computeMapLocationVisitGate } from './internal/map-location-card-state';

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
  description?: string;
  unlockPrestige?: number;
  specialEvent?: SpecialEvent; // For special event nodes
  hasRival?: boolean; // Whether a rival is present at this location
}

/**
 * Map Scene - Dashboard/Command Center for location selection.
 * Displays location cards with status information and rivals.
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

  constructor() {
    super({ key: 'MapScene' });
  }

  create(): void {
    debugLog('Map Scene: Loaded');

    this.initializeManagers('map');
    this.setupBackground('OPERATIONS CENTER', {
      topColor: 0x1a1a2e,
      bottomColor: 0x16213e,
    });
    this.setupUI();
    // MapScene uses tutorial dialogues with callbacks (e.g., Sterling intro).
    // Without common listeners, those dialogues never render and the callback never fires.
    this.setupCommonEventListeners();
    this.createDashboard();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanupDashboard();
    });
  }

  private createDashboard(): void {
    // Build location data
    this.nodes = BASE_LOCATIONS.map((loc) => {
      const definition = getBaseLocationDefinitionById(loc.id);
      return {
        id: loc.id,
        name: loc.name,
        x: 0,
        y: 0,
        type: loc.type,
        color: loc.color,
        description: definition?.description,
        unlockPrestige: definition?.unlockPrestige,
      };
    });

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
    const world = this.gameManager.getWorldState();

    const isTutorialActive = this.tutorialManager.isTutorialActive();
    const allowedLocationIds = this.tutorialManager.getAllowedMapLocationIds();

    const state = computeMapLocationCardState({
      node: {
        id: node.id,
        type: node.type === 'special' ? 'special' : node.type,
        unlockPrestige: node.unlockPrestige,
        specialEvent: node.specialEvent ? { timeCost: node.specialEvent.timeCost } : null,
      },
      playerPrestige: player.prestige,
      isTutorialActive,
      allowedLocationIds,
      isOnRedemptionStep: this.tutorialManager.isOnRedemptionStep(),
      isOnFirstVisitAuctionStep: this.tutorialManager.isOnFirstVisitAuctionStep(),
      offerMap: world.carOfferByLocation ?? {},
      travelCost: GAME_CONFIG.time.travelCost,
      auctionParticipationCost: GAME_CONFIG.time.auctionParticipationCost,
    });

    return this.uiManager.createMapLocationCard({
      locationId: node.id,
      name: node.name,
      description: this.getLocationDescription(node),
      icon: this.getLocationIcon(node),
      color: node.color,
      isGarage: state.isGarage,
      isLocked: state.isLocked,
      lockReason: state.lockReason,
      isExhaustedToday: state.isExhaustedToday,
      showRivalBadge: false,
      showSpecialBadge: node.type === 'special',
      timeCost: state.timeCost,
      onVisit: () => this.visitNode(node),
    });
  }

  private getLocationIcon(node: MapNode): string {
    if (node.id === 'garage') return '🏠';
    
    switch (node.type) {
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

    if (node.description) return node.description;

    // Fall back to base location descriptions when available.
    const baseLocation = getBaseLocationDefinitionById(node.id);
    if (baseLocation?.description) return baseLocation.description;

    switch (node.type) {
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
      intelHint.className = 'hud-daily-intel';
      intelHint.textContent = '📰 Today\'s intel is locked (rivals & offers don\'t reroll)';
      intelHint.title = 'Rival presence and location offers are fixed for the current day.';
      hud.appendChild(intelHint);
    }
  }

  private visitNode(node: MapNode): void {
    // Garage is free to return to and doesn't trigger encounters
    if (node.id === 'garage') {
      this.scene.start('GarageScene');
      return;
    }

    const isTutorialActive = this.tutorialManager.isTutorialActive();
    const world = this.gameManager.getWorldState();

    const gate = computeMapLocationVisitGate({
      node: {
        id: node.id,
        type: node.type === 'special' ? 'special' : node.type,
      },
      isTutorialActive,
      isOnRedemptionStep: this.tutorialManager.isOnRedemptionStep(),
      isOnFirstVisitAuctionStep: this.tutorialManager.isOnFirstVisitAuctionStep(),
      offerMap: world.carOfferByLocation ?? {},
      nodeName: node.name,
    });

    if (gate.kind === 'block') {
      this.uiManager.showInfo(gate.title, gate.message);
      return;
    }

    if (gate.kind === 'allow-with-toast') {
      this.uiManager.showToast(gate.toastMessage);
    }

    // Special events can have custom metadata (e.g., special rewards).
    if (node.type === 'special') {
      this.applyArrivalEffects(node);
      this.generateEncounter(node);
      return;
    }

    // Regular locations: time is charged when committing to start the encounter.
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

    const player = this.gameManager.getPlayerState();

    // Tutorial-specific encounters with specific cars
    try {
      if (this.tutorialManager && this.tutorialManager.isTutorialActive()) {
        // Force Rusty Sedan for the first tutorial auction (first car acquisition)
        if (node.id === 'auction_1' && this.tutorialManager.isOnFirstVisitAuctionStep()) {
          const car =
            getCarById('car_tutorial_rusty_sedan') || getRandomCarForPrestige(player.prestige);
          const rival = getRivalById('scrapyard_joe');
          const interest = calculateRivalInterest(rival, car.tags);

          this.tutorialManager.showDialogueWithCallback(
            'Uncle Ray',
            'Auctions are how we acquire cars now. Place the opening bid and try to win your first car. Keep an eye on the rival’s patience and budget.',
            () => {
              if (!this.hasGarageSpace()) {
                this.uiManager.showGarageFullGate({
                  primary: { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
                  secondary: { text: 'Stay Here', onClick: () => {} },
                });
                return;
              }

              const openingBid = this.getAuctionOpeningBid(car);
              const beforeTopUp = this.gameManager.getPlayerState();

              if (beforeTopUp.money < openingBid) {
                const delta = openingBid - beforeTopUp.money;
                this.gameManager.addMoney(delta);
                this.uiManager.showToast('Tutorial: Uncle Ray covers the opening bid.');
              }

              const afterTopUp = this.gameManager.getPlayerState();
              if (afterTopUp.money < openingBid) {
                const isTutorialActive = this.tutorialManager.isTutorialActive();
                const bidIncrement = GAME_CONFIG.auction.bidIncrement;
                const minMoneyToBid = openingBid; // Opening bid is all that's required to participate.
                this.uiManager.showCannotAffordAuctionModal({
                  context: 'map',
                  openingBid,
                  playerMoney: afterTopUp.money,
                  isTutorialActive,
                  bidIncrement,
                  minMoneyToBid,
                  onGoToGarage: () => this.scene.start('GarageScene'),
                  onSkipTutorial: () => {
                    setTimeout(() => this.tutorialManager.requestSkipTutorialPrompt(), 0);
                  },
                });
                return;
              }

              this.applyArrivalEffects(node);
              this.scene.stop('MapScene');
              // Intentionally omit locationId so retrying doesn't consume the daily offer.
              this.scene.start('AuctionScene', { car, rivals: [{ rival, interest }] });
            }
          );
          return;
        }
        
        // First loss: Force Sterling Vance encounter with Muscle Car
        if (node.id === 'auction_1' && this.tutorialManager.isInSterlingAuctionIntroBeat()) {
          const car =
            getCarById('car_tutorial_muscle_car') || getRandomCarForPrestige(player.prestige);
          const sterlingVance = getRivalById('sterling_vance');
          const interest = calculateRivalInterest(sterlingVance, car.tags);

          // Show Sterling's dramatic intro dialogue, then start auction
          this.tutorialManager.showDialogueWithCallback(
            "Sterling Vance",
            "*smirks* Sorry kid, but this Muscle Car is mine. Go ahead, place a bid if you want, but I've got deeper pockets. Watch and learn.",
            () => {
              if (!this.hasGarageSpace()) {
                this.uiManager.showGarageFullGate({
                  primary: { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
                  secondary: { text: 'Stay Here', onClick: () => {} },
                });
                return;
              }

              const openingBid = this.getAuctionOpeningBid(car);
              const bidIncrement = GAME_CONFIG.auction.bidIncrement;
              const minMoneyToParticipate = openingBid + bidIncrement;

              const beforeTopUp = this.gameManager.getPlayerState();

              // Tutorial safety: avoid a hard soft-lock if money is too low to even place a first bid.
              // The Auction UI requires at least (opening bid + bid increment) to take an action.
              if (beforeTopUp.money < minMoneyToParticipate) {
                const delta = minMoneyToParticipate - beforeTopUp.money;
                this.gameManager.addMoney(delta);
                this.uiManager.showToast('Tutorial: Uncle Ray covers your first bid.');
              }

              // Re-read after top-up (getPlayerState returns a snapshot clone).
              const afterTopUp = this.gameManager.getPlayerState();
              if (afterTopUp.money < minMoneyToParticipate) {
                const isTutorialActive = this.tutorialManager.isTutorialActive();
                const bidIncrement = GAME_CONFIG.auction.bidIncrement;
                const minMoneyToBid = openingBid; // Opening bid is all that's required to participate.
                this.uiManager.showCannotAffordAuctionModal({
                  context: 'map',
                  openingBid,
                  playerMoney: afterTopUp.money,
                  isTutorialActive,
                  bidIncrement,
                  minMoneyToBid,
                  onGoToGarage: () => this.scene.start('GarageScene'),
                  onSkipTutorial: () => {
                    setTimeout(() => this.tutorialManager.requestSkipTutorialPrompt(), 0);
                  },
                });
                return;
              }

              // After dialogue is dismissed, mark the Sterling encounter beat and start auction
              this.tutorialManager.onSterlingEncounterStarted();
              this.applyArrivalEffects(node);
              // Use scene.switch to properly transition - this stops current scene and starts new one
              this.scene.stop('MapScene');
              this.scene.start('AuctionScene', { car, rivals: [{ rival: sterlingVance, interest }], locationId: node.id });
            }
          );
          return;
        }

        // Redemption: Force re-entry to the Boxy Wagon auction until the player wins.
        // This prevents a tutorial stall if the player quits/loses the redemption auction.
        if (node.id === 'auction_1' && this.tutorialManager.isOnRedemptionStep()) {
          const playerHasBoxyWagon = this.gameManager
            .getPlayerState()
            .inventory.some((ownedCar) => ownedCar.id === 'car_tutorial_boxy_wagon');

          if (playerHasBoxyWagon) {
            // Reconciliation safety: the player already acquired the redemption car (likely via save/load).
            // Don't force a repeat auction; end the tutorial and proceed normally.
            this.tutorialManager.completeTutorial();
          } else {
          const boxywagon = getCarById('car_tutorial_boxy_wagon');
          const scrappyJoe = getRivalById('scrapyard_joe');
          if (!boxywagon || !scrappyJoe) {
            this.uiManager.showToast('Tutorial: redemption auction data missing.');
            return;
          }

          this.tutorialManager.showDialogueWithCallback(
            'Uncle Ray',
            'Alright—back in. This time, use "Power Bid" early to rattle Scrapyard Joe and make him quit.',
            () => {
              if (!this.hasGarageSpace()) {
                this.uiManager.showGarageFullGate({
                  primary: { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
                  secondary: { text: 'Stay Here', onClick: () => {} },
                });
                return;
              }

              const openingBid = this.getAuctionOpeningBid(boxywagon);
              const minMoneyToParticipate = openingBid + GAME_CONFIG.auction.powerBidIncrement;
              const beforeTopUp = this.gameManager.getPlayerState();

              // Tutorial safety: ensure the player can actually follow the prompt and use Power Bid.
              if (beforeTopUp.money < minMoneyToParticipate) {
                const delta = minMoneyToParticipate - beforeTopUp.money;
                this.gameManager.addMoney(delta);
                this.uiManager.showToast('Tutorial: Uncle Ray covers your first power bid.');
              }

              const afterTopUp = this.gameManager.getPlayerState();
              if (afterTopUp.money < minMoneyToParticipate) {
                const isTutorialActive = this.tutorialManager.isTutorialActive();
                const bidIncrement = GAME_CONFIG.auction.bidIncrement;
                const minMoneyToBid = openingBid; // Opening bid is all that's required to participate.
                this.uiManager.showCannotAffordAuctionModal({
                  context: 'map',
                  openingBid,
                  playerMoney: afterTopUp.money,
                  isTutorialActive,
                  bidIncrement,
                  minMoneyToBid,
                  onGoToGarage: () => this.scene.start('GarageScene'),
                  onSkipTutorial: () => {
                    setTimeout(() => this.tutorialManager.requestSkipTutorialPrompt(), 0);
                  },
                });
                return;
              }

              this.applyArrivalEffects(node);
              this.scene.stop('MapScene');
              const interest = calculateRivalInterest(scrappyJoe, boxywagon.tags);
              // Intentionally omit locationId so quitting doesn't consume the daily offer.
              this.scene.start('AuctionScene', { car: boxywagon, rivals: [{ rival: scrappyJoe, interest }] });
            }
          );
          return;
          }
        }
      }
    } catch (error) {
      errorLog('Tutorial error in MapScene:', error);
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
    
    const playerPrestige = this.gameManager.getPlayerState().prestige;
    const day = this.gameManager.getWorldState().day;
    const routed = routeRegularEncounter({
      locationId: node.id,
      car,
      playerPrestige,
      day,
    });

    if (!this.hasGarageSpace()) {
      this.uiManager.showGarageFullGate({
        primary: { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
        secondary: { text: 'Stay Here', onClick: () => {} },
      });
      return;
    }

    const rivals = routed.sceneData.rivals;
    const rivalryLabel =
      rivals.length === 1
        ? `Competition: ${rivals[0].rival.name}`
        : `Competition: ${rivals.length} rival bidders`;

    this.uiManager.showModal(
      'Auction Starting',
      `You arrive at ${node.name}.\n\nUp for bid today:\n${car.name}\n\n${rivalryLabel}`,
      [
        {
          text: 'Start Auction',
          onClick: () => {
            if (!this.hasGarageSpace()) {
              this.uiManager.showGarageFullGate({
                primary: { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
                secondary: { text: 'Stay Here', onClick: () => {} },
              });
              return;
            }

            // Time gating: only applies to normal gameplay (not tutorial, not special events).
            // For base-location auctions, charge travel + auction participation.
            const isTutorialActive = this.tutorialManager.isTutorialActive();
            const travelCost = isTutorialActive ? 0 : GAME_CONFIG.time.travelCost;
            const auctionCost = isTutorialActive ? 0 : GAME_CONFIG.time.auctionParticipationCost;
            const totalTimeCost = travelCost + auctionCost;

            if (totalTimeCost > 0 && !this.gameManager.canSpendTime(totalTimeCost)) {
              const remaining = this.gameManager.getTimeRemaining();
              this.uiManager.showOutOfTimeModal({
                action: 'to go out and bid',
                timeRequired: totalTimeCost,
                timeRemaining: remaining,
              });
              return;
            }

            const player = this.gameManager.getPlayerState();
            const openingBid = this.getAuctionOpeningBid(car);
            if (player.money < openingBid) {
              const bidIncrement = GAME_CONFIG.auction.bidIncrement;
              const minMoneyToBid = openingBid; // Opening bid is all that's required to participate.
              this.uiManager.showCannotAffordAuctionModal({
                context: 'map',
                openingBid,
                playerMoney: player.money,
                isTutorialActive,
                bidIncrement,
                minMoneyToBid,
                onGoToGarage: () => this.scene.start('GarageScene'),
                onSkipTutorial: () => {
                  setTimeout(() => this.tutorialManager.requestSkipTutorialPrompt(), 0);
                },
              });
              return;
            }

            if (totalTimeCost > 0) {
              if (!this.gameManager.trySpendTime(totalTimeCost)) {
                const remaining = this.gameManager.getTimeRemaining();
                this.uiManager.showOutOfTimeModal({
                  action: 'to go out and bid',
                  timeRequired: totalTimeCost,
                  timeRemaining: remaining,
                });
                return;
              }
            }
            this.applyArrivalEffects(node);
            this.scene.start(routed.sceneKey, routed.sceneData);
          },
        },
      ]
    );
  }

  private generateSpecialEncounter(specialEvent: SpecialEvent): void {
    const player = this.gameManager.getPlayerState();
    const car = buildSpecialEventCar(specialEvent, player.prestige);

    // Special events are also auctions.
    if (!this.hasGarageSpace()) {
      this.uiManager.showGarageFullGate({
        primary: { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
        secondary: { text: 'Stay Here', onClick: () => {} },
      });
      return;
    }

    const playerPrestige = this.gameManager.getPlayerState().prestige;
    const day = this.gameManager.getWorldState().day;
    const routed = routeRegularEncounter({
      locationId: specialEvent.id,
      car,
      playerPrestige,
      day,
    });

    this.uiManager.showModal(
      specialEvent.name,
      `${specialEvent.description}\n\nUp for bid:\n${car.name}\n\nCompetition: ${routed.sceneData.rivals.length} rival bidders`,
      [
        {
          text: 'Start Special Auction',
          onClick: () => {
            if (!this.hasGarageSpace()) {
              this.uiManager.showGarageFullGate({
                primary: { text: 'Go to Garage', onClick: () => this.scene.start('GarageScene') },
                secondary: { text: 'Stay Here', onClick: () => {} },
              });
              return;
            }

            if (!this.gameManager.canSpendTime(specialEvent.timeCost)) {
              const remaining = this.gameManager.getTimeRemaining();
              this.uiManager.showOutOfTimeModal({
                action: 'to attend this event',
                timeRequired: specialEvent.timeCost,
                timeRemaining: remaining,
              });
              return;
            }

            const player = this.gameManager.getPlayerState();
            const openingBid = this.getAuctionOpeningBid(car);
            if (player.money < openingBid) {
              const isTutorialActive = this.tutorialManager.isTutorialActive();
              const bidIncrement = GAME_CONFIG.auction.bidIncrement;
              const minMoneyToBid = openingBid; // Opening bid is all that's required to participate.
              this.uiManager.showCannotAffordAuctionModal({
                context: 'map',
                openingBid,
                playerMoney: player.money,
                isTutorialActive,
                bidIncrement,
                minMoneyToBid,
                onGoToGarage: () => this.scene.start('GarageScene'),
                onSkipTutorial: () => {
                  setTimeout(() => this.tutorialManager.requestSkipTutorialPrompt(), 0);
                },
              });
              return;
            }

            if (!this.gameManager.trySpendTime(specialEvent.timeCost)) {
              const remaining = this.gameManager.getTimeRemaining();
              this.uiManager.showOutOfTimeModal({
                action: 'to attend this event',
                timeRequired: specialEvent.timeCost,
                timeRemaining: remaining,
              });
              return;
            }

            // Remove the event since it's been started/completed.
            this.gameManager.removeSpecialEvent(specialEvent.id);
            this.scene.start('AuctionScene', { ...routed.sceneData, specialEvent });
          },
        },
      ]
    );
  }

  private hasGarageSpace(): boolean {
    return this.gameManager.hasGarageSpace();
  }
}
