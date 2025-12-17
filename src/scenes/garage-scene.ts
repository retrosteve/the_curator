import Phaser from 'phaser';
import { BaseGameScene } from './base-game-scene';
import { eventBus } from '@/core/event-bus';
import { Economy } from '@/systems/Economy';
import { MarketFluctuationSystem } from '@/systems/market-fluctuation-system';
import { SpecialEventsSystem } from '@/systems/special-events-system';
import { Car, getCarById } from '@/data/car-database';
import { getCarImageUrl } from '@/assets/car-images';
import { getRivalMood, getRivalById } from '@/data/rival-database';
import { GAME_CONFIG, SKILL_METADATA, type SkillKey } from '@/config/game-config';
import { formatCurrency, formatNumber } from '@/utils/format';
import type { VictoryResult } from '@/core/game-manager';
import type { DeepReadonly } from '@/utils/types';

/**
 * Garage Scene - Player's home base for managing cars.
 * Hub scene where players can manage their garage, restore cars, sell cars, and end the day.
 * Provides access to the map for exploring locations.
 */
export class GarageScene extends BaseGameScene {
  private autoEndDayOnEnter: boolean = false;
  private inventoryButton?: HTMLButtonElement;
  private mapButton?: HTMLButtonElement;
  private currentView: 'menu' | 'inventory' | 'collection' | 'rival-info' = 'menu';

  private readonly handleGarageInventoryChanged = (): void => {
    const player = this.gameManager.getPlayerState();
    const garageCarCount = this.gameManager.getGarageCarCount();
    if (this.inventoryButton) {
      this.inventoryButton.textContent = `View Garage (${garageCarCount} cars)`;
    }

    // Update garage info in HUD
    this.uiManager.updateHUD({
      garage: {
        used: garageCarCount,
        total: player.garageSlots,
      },
    });

    if (this.currentView === 'inventory') this.showInventory();
    if (this.currentView === 'collection') this.showCollection();
  };

  private readonly handleVictory = (victoryResult: VictoryResult): void => {
    const { prestige, unicorns, collectionCars, skillLevel } = victoryResult;
    
    const message = `🏆 CONGRATULATIONS! 🏆\n\nYou've become the world's greatest car curator!\n\n` +
      `✓ Prestige: ${formatNumber(prestige.current)} (Required: ${formatNumber(prestige.required)})\n` +
      `✓ Unicorn Cars: ${unicorns.current} (Required: ${unicorns.required})\n` +
      `✓ Cars in Collection: ${collectionCars.current} cars (Required: ${collectionCars.required})\n` +
      `✓ Master Skill Level: ${skillLevel.current} (Required: ${skillLevel.required})\n\n` +
      `You've built an extraordinary private collection and mastered the art of car curation!\n\n` +
      `Days Played: ${this.gameManager.getWorldState().day}`;

    this.uiManager.showModal(
      '🎉 VICTORY! 🎉',
      message,
      [
        { text: 'Continue Playing', onClick: () => {} },
        { text: 'View Collection', onClick: () => this.showCollection() },
      ]
    );
  };

  private readonly handleTutorialComplete = (): void => {
    this.uiManager.showModal(
      '🎓 Tutorial Complete! 🎓',
      `Congratulations! You've mastered the basics of The Curator.\n\n` +
      `You now know how to:\n` +
      `✓ Find and inspect cars\n` +
      `✓ Restore cars to increase their value\n` +
      `✓ Win auctions against rivals\n` +
      `✓ Manage your time and budget\n\n` +
      `The world of car collecting awaits. Build your dream collection!`,
      [{ text: 'Start Collecting!', onClick: () => {} }]
    );
  };

  private readonly handleTutorialStepChanged = (data: { step: string }): void => {
    // When tutorial advances to first_visit_scrapyard, apply pulse animation to map button
    if (data.step === 'first_visit_scrapyard' && this.mapButton) {
      this.mapButton.style.cssText += `
        animation: pulse 1.5s ease-in-out infinite;
      `;
    }
  };

  constructor() {
    super({ key: 'GarageScene' });
  }

  init(data?: { autoEndDay?: boolean }): void {
    this.autoEndDayOnEnter = Boolean(data?.autoEndDay);
  }

  create(): void {
    console.log('Garage Scene: Loaded');

    this.initializeManagers('garage');
    this.setupBackground('THE GARAGE', {
      topColor: 0x2c3e50,
      bottomColor: 0x34495e,
      titleY: 50,
      titleSize: '48px',
      titleColor: '#ecf0f1',
    });
    this.setupUI();
    this.setupEventListeners();

    // Start tutorial for new players
    this.initializeTutorial();

    if (this.autoEndDayOnEnter) {
      // Reset the flag to avoid re-triggering if the scene is reused.
      this.autoEndDayOnEnter = false;
      this.endDay();
    }
  }

  private createMorningPaper(): HTMLElement {
    const paperPanel = document.createElement('div');
    paperPanel.className = 'garage-brief';

    // Header
    const header = document.createElement('div');
    header.className = 'garage-brief-header';
    header.innerHTML = `
      <span class="garage-brief-title">Morning Brief</span>
      <span class="garage-brief-day">Day ${this.gameManager.getWorldState().day}</span>
    `;
    paperPanel.appendChild(header);

    // 1. Market Section
    const marketSystem = MarketFluctuationSystem.getInstance();
    const marketState = marketSystem.getState();
    const marketEvent = marketState.currentEvent;

    const marketSection = document.createElement('div');
    marketSection.className = 'garage-brief-section';
    
    if (marketEvent) {
      const trendIcon = marketEvent.type === 'boom' || marketEvent.type === 'nicheBoom' ? '📈' : '📉';
      marketSection.innerHTML = `
        <div class="garage-brief-kicker">${trendIcon} Market</div>
        <div class="garage-brief-body">${marketEvent.description}</div>
        <div class="garage-brief-muted">Expires in ${marketEvent.daysRemaining} days</div>
      `;
    } else {
      marketSection.innerHTML = `
        <div class="garage-brief-kicker">📊 Market</div>
        <div class="garage-brief-body">Stable. Standard prices apply.</div>
      `;
    }
    paperPanel.appendChild(marketSection);

    // 2. Special Events Section
    const eventsSystem = SpecialEventsSystem.getInstance();
    const activeEvents = eventsSystem.getActiveEvents();

    if (activeEvents.length > 0) {
      const eventSection = document.createElement('div');
      eventSection.className = 'garage-brief-section';
      
      const event = activeEvents[0]; // Just show the first one to save space
      eventSection.innerHTML = `
        <div class="garage-brief-kicker">🌟 Special</div>
        <div class="garage-brief-body">${event.name}: ${event.description}</div>
        ${activeEvents.length > 1 ? `<div class="garage-brief-muted">+${activeEvents.length - 1} other events</div>` : ''}
      `;
      paperPanel.appendChild(eventSection);
    }

    // 3. Rival Rumor Section
    const rumorSection = document.createElement('div');
    rumorSection.className = 'garage-brief-section garage-brief-section--wide';
    
    // Generate a random rumor
    const rumor = this.generateRivalRumor();
    rumorSection.innerHTML = `
      <div class="garage-brief-kicker">🗣️ Gossip</div>
      <div class="garage-brief-body garage-brief-body--quote">"${rumor}"</div>
    `;
    paperPanel.appendChild(rumorSection);

    return paperPanel;
  }

  private generateRivalRumor(): string {
    const rivals = ['rival_001', 'rival_002', 'rival_003']; // IDs from RivalDatabase
    const randomRivalId = rivals[Math.floor(Math.random() * rivals.length)];
    const mood = getRivalMood(randomRivalId, this.gameManager.getWorldState().day);
    const rivalName = getRivalById(randomRivalId)?.name || 'Unknown Rival';

    switch (mood) {
      case 'Desperate':
        return `Sources say ${rivalName} is desperate for a win after recent losses.`;
      case 'Confident':
        return `${rivalName} was seen celebrating. They seem overly confident today.`;
      case 'Cautious':
        return `Rumor has it ${rivalName} is playing it safe with their budget.`;
      default:
        return `${rivalName} has been spotted scouting the local dealerships.`;
    }
  }

  private setupUI(): void {
    this.resetUIWithHUD();
    this.currentView = 'menu';

    const player = this.gameManager.getPlayerState();
    const garageCarCount = this.gameManager.getGarageCarCount();

    // Create main menu panel
    const menuPanel = this.uiManager.createPanel({
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 'min(980px, calc(100% - 40px))',
      minWidth: '0',
      maxHeight: '82vh',
      overflowY: 'auto',
      padding: '18px',
    });
    menuPanel.classList.add('garage-menu-panel');

    const heading = this.uiManager.createHeading('What would you like to do?', 2, {
      textAlign: 'center',
      marginBottom: '12px',
    });
    menuPanel.appendChild(heading);

    // Garage status
    const garageStatus = this.uiManager.createText(
      `Garage: ${garageCarCount}/${player.garageSlots} slots used`,
      { textAlign: 'center', marginBottom: '10px', fontWeight: 'bold', opacity: '0.95' }
    );
    menuPanel.appendChild(garageStatus);

    // Buttons: show only primary actions up-front; tuck the rest under "More".
    const compactButtonStyle: Partial<CSSStyleDeclaration> = {
      width: '100%',
      padding: '10px 12px',
      fontSize: '13px',
      borderRadius: '10px',
    };

    const primaryActions = this.uiManager.createButtonContainer({
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: '10px',
      marginTop: '12px',
    });
    primaryActions.classList.add('garage-actions-primary');

    // Explore Map button (primary action)
    const mapBtn = this.uiManager.createButton(
      'Explore Map',
      () => this.goToMap(),
      { variant: 'primary', style: { ...compactButtonStyle, gridColumn: '1 / -1' } }
    );
    this.mapButton = mapBtn;
    
    // Tutorial: Highlight map button and disable others during first_visit_scrapyard step
    const isTutorialFirstStep = this.tutorialManager?.isCurrentStep('first_visit_scrapyard');
    if (isTutorialFirstStep) {
      // Add pulsing animation to map button (CSS animation defined in main.css)
      mapBtn.style.cssText += `
        animation: pulse 1.5s ease-in-out infinite;
      `;
    }
    
    primaryActions.appendChild(mapBtn);

    // View Garage button
    const inventoryBtn = this.createTutorialAwareButton(
      `View Garage (${garageCarCount} cars)`,
      () => this.showInventory(),
      { variant: 'info', style: compactButtonStyle }
    );
    this.inventoryButton = inventoryBtn;
    primaryActions.appendChild(inventoryBtn);

    // View Collection button
    const collectionCars = this.gameManager.getCollectionCars();
    const collectionBtn = this.createTutorialAwareButton(
      `View Collection (${collectionCars.length} cars)`,
      () => this.showCollection(),
      { 
        variant: 'special', 
        style: compactButtonStyle
      }
    );
    primaryActions.appendChild(collectionBtn);

    // End Day button
    const endDayBtn = this.createTutorialAwareButton(
      'End Day',
      () => this.endDay(),
      { 
        variant: 'danger', 
        style: { ...compactButtonStyle, gridColumn: '1 / -1' }
      }
    );
    primaryActions.appendChild(endDayBtn);

    menuPanel.appendChild(primaryActions);

    const moreActions = document.createElement('details');
    moreActions.className = 'garage-collapsible garage-actions-more';
    const moreSummary = document.createElement('summary');
    moreSummary.textContent = 'More';
    moreActions.appendChild(moreSummary);

    const secondaryActions = document.createElement('div');
    secondaryActions.className = 'garage-actions-secondary';

    // Upgrade Garage button (if available)
    const upgradeCost = this.gameManager.getNextGarageSlotCost();
    if (upgradeCost !== null) {
      const upgradeBtn = this.createTutorialAwareButton(
        `Upgrade Garage (${upgradeCost} Prestige)`,
        () => this.upgradeGarage(),
        { 
          variant: 'info',
          style: compactButtonStyle,
        }
      );
      secondaryActions.appendChild(upgradeBtn);
    }

    // Victory Progress button
    const victoryBtn = this.createTutorialAwareButton(
      'Check Victory Progress',
      () => this.showVictoryProgress(),
      { 
        variant: 'special',
        style: compactButtonStyle,
      }
    );
    secondaryActions.appendChild(victoryBtn);

    // Skills Reference button
    const skillsRefBtn = this.createTutorialAwareButton(
      '📚 Skills Reference',
      () => this.showSkillsReference(),
      { 
        variant: 'info',
        style: compactButtonStyle,
      }
    );
    secondaryActions.appendChild(skillsRefBtn);

    // Rival Info button
    const rivalInfoBtn = this.createTutorialAwareButton(
      '🏆 Rival Tiers',
      () => this.showRivalTierInfo(),
      { variant: 'info', style: compactButtonStyle }
    );
    secondaryActions.appendChild(rivalInfoBtn);

    // Game Menu button (Save, Load, Return to Main Menu)
    const menuBtn = this.createTutorialAwareButton(
      '⚙ Menu',
      () => this.showGameMenu(),
      { variant: 'info', style: compactButtonStyle }
    );
    secondaryActions.appendChild(menuBtn);

    moreActions.appendChild(secondaryActions);

    // Less info up-front: tuck brief + skills into collapsible sections below actions.
    const infoContainer = document.createElement('div');
    infoContainer.className = 'garage-menu-info';

    const marketSystem = MarketFluctuationSystem.getInstance();
    const marketState = marketSystem.getState();
    const marketEvent = marketState.currentEvent;
    const marketSummary = marketEvent
      ? `${marketEvent.type.replace(/([A-Z])/g, ' $1').trim()} (${marketEvent.daysRemaining}d)`
      : 'Stable';

    const eventsSystem = SpecialEventsSystem.getInstance();
    const activeEvents = eventsSystem.getActiveEvents();

    const morningBriefDetails = document.createElement('details');
    morningBriefDetails.className = 'garage-collapsible';
    const morningBriefSummary = document.createElement('summary');
    morningBriefSummary.textContent = `Morning Brief — Market: ${marketSummary} · Events: ${activeEvents.length}`;
    morningBriefDetails.appendChild(morningBriefSummary);
    morningBriefDetails.appendChild(this.createMorningPaper());
    infoContainer.appendChild(morningBriefDetails);

    const skillsDetails = document.createElement('details');
    skillsDetails.className = 'garage-collapsible';
    const skillsSummary = document.createElement('summary');
    skillsSummary.textContent = `Skills — ${SKILL_METADATA.eye.icon} Eye ${player.skills.eye} · ${SKILL_METADATA.tongue.icon} Tongue ${player.skills.tongue} · ${SKILL_METADATA.network.icon} Network ${player.skills.network}`;
    skillsDetails.appendChild(skillsSummary);

    // Skill XP Progress Bars (collapsed by default)
    const skillsPanel = document.createElement('div');
    skillsPanel.className = 'garage-skills-panel';

    const skillsHeading = this.uiManager.createText('Skill Progress', { fontWeight: 'bold', margin: '0 0 8px 0', opacity: '0.9' });
    skillsPanel.appendChild(skillsHeading);

    const skills: SkillKey[] = ['eye', 'tongue', 'network'];
    const skillTooltips = {
      eye: 'Lvl 1: See basic car info\nLvl 2: Reveal hidden damage\nLvl 3: See accurate market value\nLvl 4: Unlock Kick Tires tactic\nLvl 5: Predict market trends',
      tongue: 'Lvl 1: Basic negotiation\nLvl 2: Unlock Stall tactic\nLvl 3: +1 Stall use per auction\nLvl 4: +1 Stall use per auction\nLvl 5: Master negotiator (max Stall uses)',
      network: 'Lvl 1: Access public opportunities\nLvl 2: See rival movements\nLvl 3: Unlock private sales\nLvl 4: Earlier event notifications\nLvl 5: Insider deals & exclusive leads'
    };

    skills.forEach((skill) => {
      const progress = this.gameManager.getSkillProgress(skill);
      const isMaxLevel = progress.level >= 5;
      const skillMeta = SKILL_METADATA[skill];

      const skillRow = document.createElement('div');
      skillRow.style.cssText = 'margin-bottom: 8px; cursor: help; position: relative;';
      skillRow.title = skillTooltips[skill];

      const label = document.createElement('div');
      label.style.cssText = 'display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 3px; opacity: 0.95;';
      label.innerHTML = `
        <span>${skillMeta.icon} ${skillMeta.name} Lv ${progress.level}</span>
        <span>${isMaxLevel ? 'MAX' : `${progress.current}/${progress.required} XP`}</span>
      `;
      skillRow.appendChild(label);

      if (!isMaxLevel) {
        const progressBar = document.createElement('div');
        progressBar.style.cssText = 'width: 100%; height: 6px; background: rgba(0,0,0,0.28); border-radius: 999px; overflow: hidden;';

        const progressFill = document.createElement('div');
        const percentage = (progress.current / progress.required) * 100;
        progressFill.style.cssText = `width: ${percentage}%; height: 100%; background: linear-gradient(90deg, #3498db, #2ecc71); transition: width 0.3s ease;`;

        progressBar.appendChild(progressFill);
        skillRow.appendChild(progressBar);
      }

      skillsPanel.appendChild(skillRow);
    });

    skillsDetails.appendChild(skillsPanel);
    infoContainer.appendChild(skillsDetails);

    menuPanel.appendChild(infoContainer);
    menuPanel.appendChild(moreActions);
    this.uiManager.append(menuPanel);
  }

  private setupEventListeners(): void {
    // Clean up existing listeners first to avoid duplicates
    this.cleanupEventListeners();
    
    this.setupCommonEventListeners();
    eventBus.on('inventory-changed', this.handleGarageInventoryChanged);
    eventBus.on('victory', this.handleVictory);
    eventBus.on('tutorial-complete', this.handleTutorialComplete);
    eventBus.on('tutorial-step-changed', this.handleTutorialStepChanged);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanupEventListeners();
    });
  }

  private cleanupEventListeners(): void {
    eventBus.off('inventory-changed', this.handleGarageInventoryChanged);
    eventBus.off('victory', this.handleVictory);
    eventBus.off('tutorial-complete', this.handleTutorialComplete);
    eventBus.off('tutorial-step-changed', this.handleTutorialStepChanged);
  }

  /**
   * Create button with tutorial-based disabling logic.
   * During 'first_visit_scrapyard' tutorial step, button is visually disabled and non-functional.
   * @param label - Button text
   * @param action - Click handler (disabled during tutorial)
   * @param options - Button styling options
   * @returns Button element
   */
  private createTutorialAwareButton(
    label: string,
    action: () => void,
    options: Parameters<typeof this.uiManager.createButton>[2] = {}
  ): HTMLButtonElement {
    const isTutorialFirstStep = this.tutorialManager?.isCurrentStep('first_visit_scrapyard');
    return this.uiManager.createButton(
      label,
      isTutorialFirstStep ? () => {} : action,
      {
        ...options,
        style: {
          ...options.style,
          opacity: isTutorialFirstStep ? '0.5' : '1',
          cursor: isTutorialFirstStep ? 'not-allowed' : 'pointer'
        }
      }
    );
  }

  /**
   * Create a car card UI element with appropriate buttons based on context.
   * @param car - The car to display
   * @param context - 'inventory' or 'collection' to determine which buttons to show
   * @param refreshCallback - Callback to refresh the current view after actions
   * @returns Configured car panel element
   */
  private createCarCard(
    car: DeepReadonly<Car>,
    context: 'inventory' | 'collection',
    refreshCallback: () => void
  ): HTMLDivElement {
    const compactButtonStyle: Partial<CSSStyleDeclaration> = {
      padding: '8px 12px',
      fontSize: '12px',
      borderRadius: '8px',
    };

    const carPanel = this.uiManager.createPanel({
      margin: '0',
      padding: '14px',
      backgroundColor: context === 'inventory' 
        ? 'rgba(52, 73, 94, 0.6)' 
        : 'rgba(243, 156, 18, 0.1)',
      border: context === 'collection' ? '2px solid #f39c12' : undefined,
    });

    carPanel.classList.add('garage-car-card');

    const carName = this.uiManager.createHeading(car.name, 3, {
      color: context === 'collection' ? '#f39c12' : undefined,
      margin: '0 0 6px 0',
      fontSize: '18px',
    });

    const salePrice = Economy.getSalePrice(car, this.gameManager);

    const metaText = this.uiManager.createText(
      `Tier ${car.tier} · Cond ${car.condition}/100 · Value ${formatCurrency(salePrice)}`,
      { margin: '0', fontSize: '13px', lineHeight: '1.35', opacity: '0.95' }
    );

    const templateId = car.templateId ?? (getCarById(car.id) ? car.id : undefined);
    const imageUrl = templateId ? getCarImageUrl(templateId) : undefined;
    if (imageUrl) {
      const img = document.createElement('img');
      img.src = imageUrl;
      img.alt = car.name;
      img.loading = 'lazy';
      img.style.width = '100%';
      img.style.height = '120px';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '10px';
      img.style.margin = '0 0 10px 0';
      carPanel.appendChild(img);
    }

    carPanel.appendChild(carName);
    carPanel.appendChild(metaText);

    if (context === 'collection') {
      const carTags = this.uiManager.createText(
        `Tags: ${car.tags.join(', ')}`,
        { fontSize: '12px', color: '#bdc3c7', margin: '6px 0 0 0', lineHeight: '1.35' }
      );
      carPanel.appendChild(carTags);
    }

    if (context === 'inventory') {
      const buttonContainer = this.uiManager.createButtonContainer({
        marginTop: '10px',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: '8px',
      });
      buttonContainer.classList.add('garage-card-actions');

      const restoreBtn = this.uiManager.createButton(
        'Restore',
        () => this.restoreCar(car.id)
        ,
        { style: compactButtonStyle }
      );
      buttonContainer.appendChild(restoreBtn);

      const isCollectionEligible = this.gameManager.isCollectionEligible(car);
      const isInCollection = car.inCollection === true;

      if (isCollectionEligible) {
        const collectionBtn = this.uiManager.createButton(
          isInCollection ? '✓ In Collection' : 'Add to Collection',
          () => {
            const result = this.gameManager.toggleCollectionStatus(car.id);
            if (result.success) {
              refreshCallback();
            } else {
              this.uiManager.showModal('Cannot Add', result.message, [
                { text: 'OK', onClick: () => {} },
              ]);
            }
          },
          {
            variant: isInCollection ? 'special' : undefined,
            style: compactButtonStyle,
          }
        );
        buttonContainer.appendChild(collectionBtn);
      }

      const sellBtn = this.uiManager.createButton(
        'Sell',
        () => this.sellCar(car.id),
        { variant: 'success', style: compactButtonStyle }
      );
      const sellAsIsBtn = this.uiManager.createButton(
        'Sell As-Is',
        () => this.sellCarAsIs(car.id),
        { variant: 'warning', style: compactButtonStyle }
      );
      buttonContainer.appendChild(sellBtn);
      buttonContainer.appendChild(sellAsIsBtn);

      carPanel.appendChild(buttonContainer);

      // Show eligibility message if not collection-eligible
      if (!isCollectionEligible) {
        const notEligibleText = this.uiManager.createText(
          `Requires 80%+ condition to add to collection (currently ${car.condition}%)`,
          { fontSize: '12px', color: '#95a5a6', fontStyle: 'italic', margin: '6px 0 0 0', lineHeight: '1.35' }
        );
        carPanel.appendChild(notEligibleText);
      }
    } else {
      // Collection context - only remove button
      const removeBtn = this.uiManager.createButton(
        'Remove from Collection',
        () => {
          const result = this.gameManager.toggleCollectionStatus(car.id);
          if (result.success) {
            refreshCallback();
          } else {
            this.uiManager.showModal('Cannot Remove', result.message, [{ text: 'OK', onClick: () => {} }]);
          }
        },
        { variant: 'danger', style: { ...compactButtonStyle, marginTop: '10px' } }
      );
      carPanel.appendChild(removeBtn);
    }

    return carPanel;
  }

  private initializeTutorial(): void {
    try {
      if (!this.tutorialManager) {
        console.warn('TutorialManager not initialized');
        return;
      }
      
      // Start tutorial for new players (day 1, no cars, no prestige, tutorial not started yet)
      const player = this.gameManager.getPlayerState();
      const world = this.gameManager.getWorldState();
      
      if (world.day === 1 && player.inventory.length === 0 && player.prestige === 0 && !this.tutorialManager.isTutorialActive()) {
        this.tutorialManager.startTutorial();
      }
    } catch (error) {
      console.error('Error initializing tutorial:', error);
    }
  }

  private showInventory(): void {
    this.uiManager.clear();
    this.currentView = 'inventory';

    const garageCars = this.gameManager.getGarageCars();

    // Reuse cached HUD
    if (!this.cachedHUD) {
      this.cachedHUD = this.createStandardHUD();
    }
    this.uiManager.append(this.cachedHUD);

    const panel = this.uiManager.createPanel({
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 'min(960px, calc(100% - 40px))',
      minWidth: '0',
      maxHeight: '80vh',
      overflowY: 'auto',
      padding: '18px',
    });
    panel.classList.add('garage-inventory-panel');

    const heading = this.uiManager.createHeading('Your Garage', 2, {
      textAlign: 'center',
    });
    panel.appendChild(heading);

    if (garageCars.length === 0) {
      const emptyText = this.uiManager.createText('No cars in the garage. Visit the map to find some!', {
        textAlign: 'center',
        fontSize: '16px',
      });
      panel.appendChild(emptyText);
    } else {
      const grid = document.createElement('div');
      grid.className = 'garage-inventory-grid';
      garageCars.forEach((car) => {
        const carPanel = this.createCarCard(car, 'inventory', () => this.showInventory());
        grid.appendChild(carPanel);
      });
      panel.appendChild(grid);
    }

    const backBtn = this.uiManager.createButton(
      'Back',
      () => this.setupUI(),
      { style: { width: '100%', marginTop: '20px' } }
    );
    panel.appendChild(backBtn);

    this.uiManager.append(panel);
  }

  private restoreCar(carId: string): void {
    const car = this.gameManager.getCar(carId);
    if (!car) return;

    if (car.condition >= 100) {
      this.uiManager.showModal(
        'Already Restored',
        'This car is already in perfect condition.',
        [{ text: 'OK', onClick: () => {} }]
      );
      return;
    }
    
    // Check for restoration challenges first
    const challenges = Economy.getRestorationChallenges(car);
    if (challenges.length > 0) {
      this.showRestorationChallenges(car, challenges);
      return;
    }
    
    this.showRestorationOptions(car);
  }
  
  /**
   * Show restoration challenges that must be completed before standard restoration.
   */
  private showRestorationChallenges(car: Car, challenges: typeof Economy.getRestorationChallenges extends (...args: any) => infer R ? R : never): void {
    // Build plain text message with proper formatting
    let message = '⚠️ RESTORATION BLOCKED\n\n';
    message += 'This car requires special treatment before standard restoration can begin.\n\n';
    message += '━━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    challenges.forEach((challenge, index) => {
      message += `${challenge.name}\n`;
      message += `${challenge.description}\n\n`;
      message += `💰 Cost: ${formatCurrency(challenge.cost)} | ⏰ Time: ${challenge.apCost} AP\n`;
      
      if (index < challenges.length - 1) {
        message += '\n━━━━━━━━━━━━━━━━━━━━━━\n\n';
      }
    });
    
    const buttons = challenges.map(challenge => ({
      text: `Fix: ${challenge.name}`,
      onClick: () => {
        const block = this.timeSystem.getAPBlockModal(challenge.apCost, `fixing ${car.name}`);
        if (block) {
          this.uiManager.showModal(block.title, block.message, [{ text: 'OK', onClick: () => {} }]);
          return;
        }
        
        if (this.gameManager.spendMoney(challenge.cost)) {
          this.timeSystem.spendAP(challenge.apCost);
          const fixedCar = Economy.completeRestorationChallenge(car, challenge);
          this.gameManager.updateCar(fixedCar);
          
          this.uiManager.showModal(
            '✅ Challenge Complete!',
            `${challenge.name} completed successfully!\n\nThe car is now ready for standard restoration.`,
            [{ text: 'Continue', onClick: () => this.restoreCar(car.id) }]
          );
        } else {
          this.uiManager.showInsufficientFundsModal();
        }
      },
    }));
    
    buttons.push({
      text: 'Cancel',
      onClick: () => this.showInventory(),
    });
    
    this.uiManager.showModal('🔧 Restoration Challenges', message, buttons);
  }
  
  /**
   * Show standard restoration options.
   */
  private showRestorationOptions(car: Car): void {

    const options = Economy.getRestorationOptions(car);
    
    // Calculate profit preview for each option
    const currentValue = Economy.getSalePrice(car, this.gameManager);
    
    const modalOptions = options.map(opt => {
      // Simulate restoration result
      const simulatedCar = { ...car, condition: Math.min(100, car.condition + opt.conditionGain) };
      const futureValue = Economy.getSalePrice(simulatedCar, this.gameManager);
      const valueIncrease = futureValue - currentValue;
      const netProfit = valueIncrease - opt.cost;
      
      return {
        name: opt.name,
        cost: opt.cost,
        apCost: opt.apCost,
        description: opt.description,
        conditionGain: opt.conditionGain,
        valueIncrease,
        netProfit,
        risk: opt.risk,
        onClick: () => {
          const block = this.timeSystem.getAPBlockModal(opt.apCost, `restoring ${car.name}`);
          if (block) {
            this.uiManager.showModal(block.title, block.message, [{ text: 'OK', onClick: () => {} }]);
            return;
          }
          if (this.gameManager.spendMoney(opt.cost)) {
            this.timeSystem.spendAP(opt.apCost);
            
            // Tutorial override: first restoration always succeeds (ignore Cheap Charlie risk)
            const isTutorialFirstRestore = this.tutorialManager.isCurrentStep('first_buy');
            const result = Economy.performRestoration(car, opt, isTutorialFirstRestore);
            this.gameManager.updateCar(result.car);
            
            // Show discovery message if found
            if (result.discovery) {
              const discoveryIcon = result.discovery.type === 'positive' ? '💎' : '⚠️';
              const discoveryName = result.discovery.name;
              const valueChange = result.discovery.valueChange;
              
              setTimeout(() => {
                this.uiManager.showModal(
                  `${discoveryIcon} Hidden Discovery!`,
                  result.message + `\n\n${discoveryName}\nValue change: ${formatCurrency(Math.abs(valueChange))}`,
                  [{ text: 'Continue', onClick: () => {
                    this.showInventory();
                  }}]
                );
              }, 300);
            } else {
              // Normal restoration result
              this.showInventory();
            }
            
            // Tutorial trigger: advance to first_restore immediately after restoration
            if (isTutorialFirstRestore) {
              this.tutorialManager.advanceStep('first_restore');
            }
            
            // Tutorial: Auto-sell the first car after restoration
            if (this.tutorialManager.isCurrentStep('first_restore')) {
              this.showInventory();
              // Auto-trigger the sale
              setTimeout(() => {
                const restoredCar = this.gameManager.getCar(car.id);
                if (restoredCar) {
                  const salePrice = Economy.getSalePrice(restoredCar, this.gameManager);
                  this.uiManager.showModal(
                    'Tutorial: Your First Sale',
                    `An NPC buyer saw your ${restoredCar.name} and wants to buy it immediately for ${formatCurrency(salePrice)}!\n\nThis is how you flip cars for profit: Buy low, restore, sell high.`,
                    [{
                      text: 'Sell to Buyer',
                      onClick: () => {
                        this.gameManager.addMoney(salePrice);
                        this.gameManager.removeCar(car.id);
                        this.tutorialManager.advanceStep('first_flip');
                        
                        // Show next tutorial guidance
                        setTimeout(() => {
                          this.tutorialManager.showDialogueWithCallback(
                            'Uncle Ray',
                            `Great work! You've completed your first car deal and made a profit.\n\nNow let's try something more challenging. Click "Explore Map" to find another opportunity - but this time, you'll face competition from other collectors!`,
                            () => this.setupUI()
                          );
                        }, 300);
                      }
                    }]
                  );
                }
              }, 500);
            } else {
              this.showInventory();
            }
          } else {
            this.uiManager.showInsufficientFundsModal();
          }
        },
      };
    });

    this.uiManager.showRestorationModal(
      car.name,
      car.condition,
      modalOptions,
      () => this.showInventory()
    );
  }

  private sellCar(carId: string): void {
    const car = this.gameManager.getCar(carId);
    if (!car) return;

    const salePrice = Economy.getSalePrice(car, this.gameManager);

    this.uiManager.confirmAction(
      'Sell Car',
      `Sell ${car.name} for ${formatCurrency(salePrice)}?`,
      () => {
        this.gameManager.addMoney(salePrice);
        this.gameManager.removeCar(carId);
        this.uiManager.showFloatingMoney(salePrice, true);
        
        // Tutorial trigger: first flip
        if (this.tutorialManager.isCurrentStep('first_restore')) {
          this.tutorialManager.advanceStep('first_flip');
        }
        
        this.showInventory();
      },
      () => this.showInventory(),
      { confirmText: 'Sell', confirmVariant: 'success' }
    );
  }

  private showVictoryProgress(): void {
    const victoryResult = this.gameManager.checkVictory();
    const { prestige, unicorns, collectionCars, skillLevel } = victoryResult;
    const world = this.gameManager.getWorldState();

    // Calculate prestige pace
    const currentDay = world.day;
    const prestigePerDay = currentDay > 1 ? prestige.current / currentDay : 0;
    const daysToVictory = prestigePerDay > 0 
      ? Math.ceil((prestige.required - prestige.current) / prestigePerDay)
      : 999;
    
    // Determine pace status
    let paceStatus: 'on-track' | 'slow' | 'stalled';
    let paceColor: string;
    let paceIcon: string;
    
    if (prestigePerDay >= 20) {
      paceStatus = 'on-track';
      paceColor = '#2ecc71';
      paceIcon = '🚀';
    } else if (prestigePerDay >= 10) {
      paceStatus = 'slow';
      paceColor = '#f39c12';
      paceIcon = '🐢';
    } else {
      paceStatus = 'stalled';
      paceColor = '#e74c3c';
      paceIcon = '⚠️';
    }

    // Create custom modal content with progress bars
    const modalContent = document.createElement('div');
    modalContent.style.cssText = 'padding: 10px;';

    const createProgressRow = (label: string, current: number, required: number, met: boolean) => {
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom: 15px;';
      
      const labelDiv = document.createElement('div');
      labelDiv.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 5px; font-weight: bold;';
      labelDiv.innerHTML = `
        <span>${met ? '✅' : '⬜'} ${label}</span>
        <span>${current} / ${required}</span>
      `;
      row.appendChild(labelDiv);
      
      const progressBar = document.createElement('div');
      progressBar.style.cssText = 'width: 100%; height: 20px; background: rgba(0,0,0,0.3); border-radius: 10px; overflow: hidden;';
      
      const progressFill = document.createElement('div');
      const percentage = Math.min((current / required) * 100, 100);
      const color = met ? '#2ecc71' : (percentage >= 75 ? '#f39c12' : '#3498db');
      progressFill.style.cssText = `width: ${percentage}%; height: 100%; background: ${color}; transition: width 0.5s ease;`;
      
      progressBar.appendChild(progressFill);
      row.appendChild(progressBar);
      
      return row;
    };

    modalContent.appendChild(createProgressRow('Prestige', prestige.current, prestige.required, prestige.met));
    modalContent.appendChild(createProgressRow('Unicorns in Collection', unicorns.current, unicorns.required, unicorns.met));
    modalContent.appendChild(createProgressRow('Cars in Collection (80%+)', collectionCars.current, collectionCars.required, collectionCars.met));
    modalContent.appendChild(createProgressRow('Max Skill Level', skillLevel.current, skillLevel.required, skillLevel.met));

    // Add pace indicator
    const paceDiv = document.createElement('div');
    paceDiv.style.cssText = `margin-top: 20px; padding: 15px; background: rgba(0,0,0,0.3); border-radius: 10px; border-left: 4px solid ${paceColor};`;
    
    const paceTitle = document.createElement('div');
    paceTitle.style.cssText = 'font-weight: bold; font-size: 16px; margin-bottom: 8px;';
    paceTitle.textContent = `${paceIcon} Prestige Pace: ${paceStatus.toUpperCase().replace('-', ' ')}`;
    paceDiv.appendChild(paceTitle);
    
    const paceDetails = document.createElement('div');
    paceDetails.style.cssText = 'font-size: 14px; color: #bbb;';
    paceDetails.innerHTML = `
      • Current Rate: <span style="color: ${paceColor}; font-weight: bold;">${prestigePerDay.toFixed(1)} prestige/day</span><br>
      • Days Played: ${currentDay}<br>
      • Est. Days to Victory: ${daysToVictory < 999 ? daysToVictory : 'N/A'}<br>
      <br>
      <span style="font-size: 12px; font-style: italic;">
        ${paceStatus === 'on-track' ? '✓ Great pace! Keep it up!' : 
          paceStatus === 'slow' ? '⚡ Consider focusing on your collection and sets.' :
          '💡 Tip: Add high-condition cars to your collection for daily prestige.'}
      </span>
    `;
    paceDiv.appendChild(paceDetails);
    modalContent.appendChild(paceDiv);

    const statusText = document.createElement('div');
    statusText.style.cssText = `margin-top: 20px; text-align: center; font-weight: bold; font-size: 16px; color: ${victoryResult.hasWon ? '#2ecc71' : '#f39c12'};`;
    statusText.textContent = victoryResult.hasWon 
      ? '🎉 ALL CONDITIONS MET! End the day to claim victory!' 
      : 'Keep building your sets and collection to achieve victory!';
    modalContent.appendChild(statusText);

    this.uiManager.showModal(
      '🏆 Victory Progress',
      modalContent.outerHTML,
      [{ text: 'Close', onClick: () => {} }]
    );
  }

  /**
   * Show skills reference panel with all abilities and progression info.
   */
  private showSkillsReference(): void {
    const player = this.gameManager.getPlayerState();

    const skillsData = {
      eye: {
        name: '👁 Eye (Inspection)',
        color: '#3498db',
        abilities: [
          { level: 1, description: 'Basic inspection - see car condition' },
          { level: 2, description: 'Reveal car history (Flooded, Rust, Mint)' },
          { level: 3, description: 'Kick Tires in auctions (reduce rival budget)' },
          { level: 4, description: 'See exact damage percentages' },
          { level: 5, description: 'Appraisal mastery - predict market trends' },
        ],
      },
      tongue: {
        name: '💬 Tongue (Negotiation)',
        color: '#9b59b6',
        abilities: [
          { level: 1, description: 'Basic haggling - minor price reduction' },
          { level: 2, description: 'Improved haggling - better deals' },
          { level: 3, description: 'Stall tactic in auctions (drain rival patience)' },
          { level: 4, description: 'Master negotiator - significant discounts' },
          { level: 5, description: 'Silver tongue - sellers trust you completely' },
        ],
      },
      network: {
        name: '🌐 Network (Connections)',
        color: '#e67e22',
        abilities: [
          { level: 1, description: 'Access to basic dealerships' },
          { level: 2, description: 'Spot special events more clearly' },
          { level: 3, description: 'Access to exclusive private sales' },
          { level: 4, description: 'See rival movements and locations' },
          { level: 5, description: 'Underground deals and legendary cars' },
        ],
      },
    };

    let message = '';

    (['eye', 'tongue', 'network'] as const).forEach((skill) => {
      const data = skillsData[skill];
      const currentLevel = player.skills[skill];
      const progress = this.gameManager.getSkillProgress(skill);

      message += `${data.name} - Level ${currentLevel}/5\n`;
      if (currentLevel < 5) {
        message += `Next level: ${progress.current}/${progress.required} XP\n`;
      } else {
        message += `✨ MAX LEVEL \n`;
      }
      message += `\n`;

      data.abilities.forEach((ability) => {
        const unlocked = currentLevel >= ability.level;
        const isCurrent = currentLevel === ability.level - 1;
        const icon = unlocked ? '🔓' : '🔒';
        const style = unlocked ? '' : ' (locked)';
        const nextIndicator = isCurrent ? ' 👈 NEXT' : '';

        message += `  ${icon} Lvl ${ability.level}: ${ability.description}${style}${nextIndicator}\n`;
      });
      message += `\n`;
    });

    message += `\nEarn XP by:\n• Inspecting cars (+10 Eye XP)\n• Haggling (+5 Tongue XP)\n• Winning auctions (+15 Tongue XP)\n• Visiting new locations (+20 Network XP)`;

    this.uiManager.showModal('📚 Skills Reference', message, [
      { text: 'Close', onClick: () => {} },
    ]);
  }

  private sellCarAsIs(carId: string): void {
    const car = this.gameManager.getCar(carId);
    if (!car) return;

    const salePrice = Math.floor(Economy.getSalePrice(car, this.gameManager) * GAME_CONFIG.economy.sellAsIsMultiplier);

    this.uiManager.confirmAction(
      'Sell As-Is',
      `Quick sell ${car.name} for ${formatCurrency(salePrice)}? (70% Value)`,
      () => {
        this.gameManager.addMoney(salePrice);
        this.gameManager.removeCar(carId);
        this.uiManager.showFloatingMoney(salePrice, true);
        this.showInventory();
      },
      () => this.showInventory(),
      { confirmText: 'Sell', confirmVariant: 'warning' }
    );
  }

  private showMorningBriefing(): void {
    const world = this.gameManager.getWorldState();
    const player = this.gameManager.getPlayerState();
    
    // Generate 2-3 intel hints
    const hints: string[] = [];
    
    // Hint 1: Market condition
    const marketStatus = this.gameManager.getMarketDescription();
    if (marketStatus) {
      hints.push(`📈 ${marketStatus}`);
    }
    
    // Hint 2: Rival activity (random rumor)
    const rivals = ['Sterling Vance', 'Marcus Kane', 'Scrapyard Joe', 'Elena Rossi'];
    const locations = ["Joe's Scrapyard", 'Classic Car Dealership', 'Weekend Auction House'];
    const randomRival = rivals[Math.floor(Math.random() * rivals.length)];
    const randomLocation = locations[Math.floor(Math.random() * locations.length)];
    hints.push(`🔍 Word on the street: ${randomRival} was spotted near ${randomLocation}`);
    
    // Hint 3: Special events
    const activeEvents = this.gameManager.getActiveSpecialEvents();
    if (activeEvents.length > 0) {
      const event = activeEvents[0];
      hints.push(`⭐ ${event.name} - ${event.description}`);
    } else if (player.skills.network >= 3) {
      // High network skill provides general tips
      hints.push(`💡 Network Tip: Visit different locations to find better leads`);
    }
    
    const message = `**Day ${world.day} - Morning Brief**\n\n${hints.join('\n\n')}\n\nGood hunting!`;
    
    setTimeout(() => {
      this.uiManager.showModal(
        '📰 Morning Intel',
        message,
        [{ text: 'Start Day', onClick: () => {} }]
      );
    }, 500);
  }

  private goToMap(): void {
    try {
      this.scene.start('MapScene');
    } catch (error) {
      console.error('Error going to map:', error);
      // Fallback: still go to map even if tutorial fails
      this.scene.start('MapScene');
    }
  }

  private endDay(): void {
    const playerBefore = this.gameManager.getPlayerState();
    const world = this.gameManager.getWorldState();
    const rent = this.gameManager.getDailyRent();
    const collectionPrestige = this.gameManager.getCollectionPrestigeInfo();
    const unusedAP = world.currentAP;

    const garageCarCount = this.gameManager.getGarageCarCount();
    const collectionCarCount = this.gameManager.getCollectionCars().length;

    // Pre-check: Can player afford rent?
    if (playerBefore.money < rent) {
      const canSellFromGarage = garageCarCount > 0;
      const canMoveFromCollectionToGarage = collectionCarCount > 0 && this.gameManager.hasGarageSpace();
      const hasAnyCars = canSellFromGarage || collectionCarCount > 0;
      const canLoan = this.gameManager.canTakeBankLoan();

      if (!hasAnyCars && !canLoan) {
        this.uiManager.showModal(
          'Bankrupt',
          `You can't pay today's rent (${formatCurrency(rent)}).\n\nGame Over.`,
          [
            {
              text: 'New Game',
              onClick: () => {
                this.gameManager.reset();
                this.setupUI();
              },
            },
          ]
        );
        return;
      }

      const shortfall = rent - playerBefore.money;
      const buttons: { text: string; onClick: () => void }[] = [];

      if (canSellFromGarage) {
        buttons.push({
          text: 'Sell a Car',
          onClick: () => this.showInventory(),
        });
      } else if (canMoveFromCollectionToGarage) {
        buttons.push({
          text: 'Go to Collection',
          onClick: () => this.showCollection(),
        });
      }

      if (canLoan) {
        const loanAmount = this.gameManager.getBankLoanAmount();
        buttons.push({
          text: `Take Bank Loan (+${formatCurrency(loanAmount)})`,
          onClick: () => {
            this.gameManager.takeBankLoan();
            this.endDay();
          },
        });
      }

      buttons.push({
        text: 'Cancel',
        onClick: () => this.setupUI(),
      });

      this.uiManager.showModal(
        'Rent Due',
        `Daily rent is ${formatCurrency(rent)}, but you only have ${formatCurrency(playerBefore.money)} (short ${formatCurrency(shortfall)}).\n\nSell a car or take a bank loan to avoid bankruptcy.`,
        buttons
      );

      return;
    }

    // Show end-day confirmation with summary
    const confirmMessage = 
      `📊 END DAY ${world.day} SUMMARY:\n\n` +
      `💰 Current Money: ${formatCurrency(playerBefore.money)}\n` +
      `🏆 Current Prestige: ${formatNumber(playerBefore.prestige)}\n` +
      `⏰ Unused AP: ${unusedAP}/${GAME_CONFIG.day.maxAP}\n\n` +
      `💸 Rent Due: ${formatCurrency(rent)}\n` +
      `🏛️ Collection Prestige: +${collectionPrestige.totalPerDay} prestige (${collectionPrestige.carCount} cars)\n\n` +
      `After rent, you'll have ${formatCurrency(playerBefore.money - rent)}.\n\n` +
      `Ready to end the day?`;
    
    this.uiManager.confirmAction(
      '🌙 End Day?',
      confirmMessage,
      () => this.proceedWithEndDay(),
      () => {}, // Cancel does nothing
      { 
        confirmText: 'End Day', 
        confirmVariant: 'warning',
        cancelText: 'Keep Working'
      }
    );
  }

  /**
   * Actually end the day after confirmation.
   * Separated from endDay() to allow confirmation dialog.
   */
  private proceedWithEndDay(): void {
    const result = this.timeSystem.endDay();

    if (result.bankrupt) {
      this.uiManager.showModal(
        'Bankrupt',
        `You can't pay today's rent (${formatCurrency(result.requiredRent)}).\n\nGame Over.`,
        [
          {
            text: 'New Game',
            onClick: () => {
              this.gameManager.reset();
              this.setupUI();
            },
          },
        ]
      );
      return;
    }

    const dayStats = this.gameManager.getDayStatsAndReset();
    const player = this.gameManager.getPlayerState();
    const world = this.gameManager.getWorldState();
    const collectionPrestige = this.gameManager.getCollectionPrestigeInfo();
    const marketDesc = this.gameManager.getMarketDescription();

    // Build day summary
    let summary = `🌃 Day ${world.day - 1} Complete\n\n`;
    summary += `💼 ACTIVITY SUMMARY:\n`;
    summary += `• Cars Acquired: ${dayStats.carsAcquired}\n`;
    summary += `• Money Earned: ${formatCurrency(dayStats.moneyEarned)}\n`;
    summary += `• Money Spent: ${formatCurrency(dayStats.moneySpent)}\n`;
    summary += `• Rent Paid: ${formatCurrency(result.rentPaid)}\n`;
    
    const netMoney = dayStats.netMoney - result.rentPaid;
    const netColor = netMoney >= 0 ? '+' : '';
    summary += `• Net Income: ${netColor}${formatCurrency(netMoney)}\n\n`;
    
    if (collectionPrestige.carCount > 0) {
      summary += `🏛️ COLLECTION PRESTIGE:\n`;
      summary += `• Prestige from Collection: +${collectionPrestige.totalPerDay}\n`;
      if (dayStats.prestigeGained > collectionPrestige.totalPerDay) {
        summary += `• Other Prestige Gained: +${dayStats.prestigeGained - collectionPrestige.totalPerDay}\n`;
      }
      summary += `• Total Prestige Gained: +${dayStats.prestigeGained}\n\n`;
    } else if (dayStats.prestigeGained > 0) {
      summary += `🏆 Prestige Gained: +${dayStats.prestigeGained}\n\n`;
    }
    
    summary += `💰 Current Money: ${formatCurrency(player.money)}\n`;
    summary += `🏆 Total Prestige: ${player.prestige}\n\n`;
    summary += `🌅 DAY ${world.day} FORECAST:\n`;
    summary += `• ${marketDesc}\n`;
    summary += `• New opportunities await on the map`;

    this.uiManager.showModal(
      `🌃 End of Day ${world.day - 1}`,
      summary,
      [
        {
          text: 'Start New Day',
          onClick: () => {
            this.setupUI();
            // Show morning briefing after day transition (skip during tutorial)
            if (!this.tutorialManager.isTutorialActive() && world.day > 1) {
              this.showMorningBriefing();
            }
          },
        },
      ]
    );
  }

  private showGameMenu(): void {
    this.uiManager.showModal(
      'Game Menu',
      'Save your progress, load a previous game, or return to the main menu.',
      [
        {
          text: 'Save Game',
          onClick: () => {
            if (this.gameManager.save()) {
              this.uiManager.showModal(
                'Game Saved',
                'Your progress has been saved successfully.',
                [{ text: 'OK', onClick: () => {} }]
              );
            } else {
              this.uiManager.showModal(
                'Save Failed',
                'Unable to save game. Check console for details.',
                [{ text: 'OK', onClick: () => {} }]
              );
            }
          },
        },
        {
          text: 'Load Game',
          onClick: () => {
            this.uiManager.showModal(
              'Load Game?',
              'This will reload your last saved game. Any unsaved progress will be lost.',
              [
                {
                  text: 'Load',
                  onClick: () => this.loadSavedGame(),
                },
                { text: 'Cancel', onClick: () => {} },
              ]
            );
          },
        },
        {
          text: 'Main Menu',
          onClick: () => {
            this.scene.start('MainMenuScene');
          },
        },
        { text: 'Back', onClick: () => {} },
      ]
    );
  }

  private loadSavedGame(): void {
    if (this.gameManager.load()) {
      // Emit events to update UI
      this.gameManager.emitAllStateEvents();

      this.uiManager.showModal(
        'Game Loaded',
        'Your saved game has been loaded successfully.',
        [{ text: 'OK', onClick: () => this.setupUI() }]
      );
    } else {
      this.uiManager.showModal(
        'Load Failed',
        'No saved game found or load failed.',
        [{ text: 'OK', onClick: () => {} }]
      );
    }
  }

  private upgradeGarage(): void {
    const cost = this.gameManager.getNextGarageSlotCost();
    const player = this.gameManager.getPlayerState();

    if (cost === null) {
      this.uiManager.showModal(
        'Max Capacity',
        'Your garage is already at maximum capacity.',
        [{ text: 'OK', onClick: () => {} }]
      );
      return;
    }

    if (player.prestige < cost) {
      this.uiManager.showModal(
        'Insufficient Prestige',
        `You need ${cost} prestige to upgrade your garage. You have ${player.prestige}.`,
        [{ text: 'OK', onClick: () => {} }]
      );
      return;
    }

    // Calculate rent change
    const currentRent = this.gameManager.getDailyRent();
    const newSlots = player.garageSlots + 1;
    const rentConfig = GAME_CONFIG.economy.rentByGarageSlots as Record<number, number>;
    const newRent = rentConfig[newSlots] || currentRent;
    const rentIncrease = newRent - currentRent;

    // Show confirmation with rent warning
    this.uiManager.confirmAction(
      '⚠️ Upgrade Garage?',
      `Upgrade to ${newSlots} garage slots for ${cost} prestige?\n\n💸 RENT WILL INCREASE:\nCurrent: ${formatCurrency(currentRent)}/day\nNew: ${formatCurrency(newRent)}/day\nIncrease: +${formatCurrency(rentIncrease)}/day\n\nMake sure you can afford the higher daily rent!`,
      () => {
        if (this.gameManager.upgradeGarageSlots()) {
          this.uiManager.showModal(
            'Garage Upgraded!',
            `Your garage now has ${newSlots} slots.\n\nDaily rent is now ${formatCurrency(newRent)}.`,
            [{ text: 'OK', onClick: () => this.setupUI() }]
          );
        } else {
          this.uiManager.showModal(
            'Upgrade Failed',
            'Unable to upgrade garage. Please try again.',
            [{ text: 'OK', onClick: () => {} }]
          );
        }
      },
      () => {},
      { confirmText: 'Upgrade', confirmVariant: 'warning' }
    );
  }

  private showCollection(): void {
    this.uiManager.clear();
    this.currentView = 'collection';

    const collectionCars = this.gameManager.getCollectionCars();
    const collectionPrestigeInfo = this.gameManager.getCollectionPrestigeInfo();
    const player = this.gameManager.getPlayerState();

    // Reuse cached HUD
    if (this.cachedHUD) {
      this.uiManager.append(this.cachedHUD);
    } else {
      const hud = this.createStandardHUD();
      this.uiManager.append(hud);
    }

    const panel = this.uiManager.createPanel({
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      minWidth: '700px',
      maxHeight: '80vh',
      overflowY: 'auto',
    });

    const heading = this.uiManager.createHeading('Your Collection', 2, {
      textAlign: 'center',
      color: '#f39c12',
    });
    panel.appendChild(heading);

    // Collection stats - count eligible cars (condition >= 80%)
    const eligibleCars = player.inventory.filter((car) => this.gameManager.isCollectionEligible(car));
    const statsText = this.uiManager.createText(
      `In Collection: ${collectionCars.length} | Eligible: ${eligibleCars.length} | Daily Prestige Bonus: +${collectionPrestigeInfo.totalPerDay}`,
      { textAlign: 'center', fontWeight: 'bold', marginBottom: '10px' }
    );
    panel.appendChild(statsText);

    const infoText = this.uiManager.createText(
      'Quality Tiers: Good (80-89%) = +1/day | Excellent (90-99%) = +2/day | Perfect (100%) = +3/day',
      { textAlign: 'center', fontSize: '13px', color: '#95a5a6', marginBottom: '20px' }
    );
    panel.appendChild(infoText);

    // Sets progress
    const collections = this.gameManager.getAllSetsProgress();
    if (collections.length > 0) {
      const collectionsHeading = this.uiManager.createHeading('📚 Sets', 3, {
        marginTop: '20px',
        marginBottom: '10px',
      });
      panel.appendChild(collectionsHeading);

      collections.forEach(collection => {
        const collectionCard = document.createElement('div');
        collectionCard.style.cssText = `
          background: ${collection.isComplete ? 'linear-gradient(145deg, rgba(46, 204, 113, 0.2), rgba(39, 174, 96, 0.2))' : 'rgba(255,255,255,0.05)'};
          border: 2px solid ${collection.isComplete ? '#2ecc71' : 'rgba(100, 200, 255, 0.2)'};
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        `;

        const leftSide = document.createElement('div');
        leftSide.innerHTML = `
          <div style="font-size: 18px; margin-bottom: 4px;">${collection.icon} ${collection.name}</div>
          <div style="font-size: 12px; color: #95a5a6;">${collection.description}</div>
        `;

        const rightSide = document.createElement('div');
        rightSide.style.cssText = 'text-align: right;';
        
        const statusIcon = collection.isClaimed ? '✅' : collection.isComplete ? '🎁' : '⬜';
        const statusText = collection.isClaimed ? 'Completed!' : collection.isComplete ? 'Ready to Claim!' : `${collection.current}/${collection.required}`;
        
        rightSide.innerHTML = `
          <div style="font-size: 16px; font-weight: bold; color: ${collection.isClaimed ? '#2ecc71' : collection.isComplete ? '#f39c12' : '#64b5f6'};">
            ${statusIcon} ${statusText}
          </div>
          <div style="font-size: 12px; color: #95a5a6; margin-top: 4px;">
            Reward: +${collection.prestigeReward} Prestige
          </div>
        `;

        collectionCard.appendChild(leftSide);
        collectionCard.appendChild(rightSide);
        panel.appendChild(collectionCard);
      });
    }

    // Collection Cars heading
    const collectionHeading = this.uiManager.createHeading('🏛️ Collection Vehicles', 3, {
      marginTop: '20px',
      marginBottom: '10px',
    });
    panel.appendChild(collectionHeading);

    if (collectionCars.length === 0) {
      const emptyText = this.uiManager.createText(
        'No cars in your collection yet. Restore cars to excellent condition (80%+) and add them from your garage!',
        { textAlign: 'center', fontSize: '16px', color: '#7f8c8d' }
      );
      panel.appendChild(emptyText);
    } else {
      collectionCars.forEach((car) => {
        const qualityTier = this.gameManager.getCollectionQualityTier(car.condition);
        const carPanel = this.createCarCard(car, 'collection', () => this.showCollection());
        
        // Add quality tier badge to card
        const tierBadge = document.createElement('div');
        tierBadge.style.cssText = `
          position: absolute;
          top: 10px;
          right: 10px;
          background: ${qualityTier.color};
          color: #fff;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: bold;
        `;
        tierBadge.textContent = `${qualityTier.tier}: +${qualityTier.prestigePerDay}/day`;
        carPanel.style.position = 'relative';
        carPanel.appendChild(tierBadge);
        
        panel.appendChild(carPanel);
      });
    }

    // Back button
    const backBtn = this.uiManager.createButton(
      'Back to Garage',
      () => this.setupUI(),
      { style: { marginTop: '20px' } }
    );
    panel.appendChild(backBtn);

    this.uiManager.append(panel);
  }

  private showRivalTierInfo(): void {
    this.currentView = 'rival-info';
    this.uiManager.clear();

    const player = this.gameManager.getPlayerState();
    
    // Reuse cached HUD
    if (this.cachedHUD) {
      this.uiManager.append(this.cachedHUD);
    } else {
      const hud = this.createStandardHUD();
      this.uiManager.append(hud);
    }

    const panel = this.uiManager.createPanel({
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      minWidth: '700px',
      maxHeight: '80vh',
      overflowY: 'auto',
    });

    const heading = this.uiManager.createHeading('Rival Tier Progression', 2, {
      textAlign: 'center',
      color: '#3498db',
    });
    panel.appendChild(heading);

    const introText = this.uiManager.createText(
      `As you gain prestige, you'll face tougher rivals in auctions. Your current prestige: ${player.prestige}`,
      { textAlign: 'center', marginBottom: '20px', fontSize: '16px' }
    );
    panel.appendChild(introText);

    // Tier 3 - Scrappers (Early Game)
    const tier3Panel = this.uiManager.createPanel({
      margin: '15px 0',
      backgroundColor: player.prestige < 50 ? 'rgba(46, 204, 113, 0.2)' : 'rgba(127, 140, 141, 0.1)',
      border: player.prestige < 50 ? '2px solid #2ecc71' : '1px solid #7f8c8d',
    });

    const tier3Name = this.uiManager.createHeading('Tier 3: Scrappers', 3, {
      color: player.prestige < 50 ? '#2ecc71' : '#7f8c8d',
    });
    const tier3Details = this.uiManager.createText(
      `Prestige Range: 0-49 ${player.prestige < 50 ? '(CURRENT)' : ''}\\n` +
      `Difficulty: ★☆☆☆☆ (Easiest)\\n` +
      `Budget: Low ($2,000-$5,000)\\n` +
      `Tactics: Simple bidding, easy to outmaneuver`,
      { fontSize: '14px', whiteSpace: 'pre-line' }
    );
    tier3Panel.appendChild(tier3Name);
    tier3Panel.appendChild(tier3Details);
    panel.appendChild(tier3Panel);

    // Tier 2 - Enthusiasts (Mid Game)
    const tier2Panel = this.uiManager.createPanel({
      margin: '15px 0',
      backgroundColor: player.prestige >= 50 && player.prestige < 150 ? 'rgba(52, 152, 219, 0.2)' : 'rgba(127, 140, 141, 0.1)',
      border: player.prestige >= 50 && player.prestige < 150 ? '2px solid #3498db' : '1px solid #7f8c8d',
    });

    const tier2Name = this.uiManager.createHeading('Tier 2: Enthusiasts', 3, {
      color: player.prestige >= 50 && player.prestige < 150 ? '#3498db' : '#7f8c8d',
    });
    const tier2Status = player.prestige < 50 ? '🔒 LOCKED' : (player.prestige < 150 ? '(CURRENT)' : '');
    const tier2Details = this.uiManager.createText(
      `Prestige Range: 50-149 ${tier2Status}\\n` +
      `Difficulty: ★★★☆☆ (Medium)\\n` +
      `Budget: Medium ($8,000-$15,000)\\n` +
      `Tactics: Niche collectors, may overpay for preferred cars`,
      { fontSize: '14px', whiteSpace: 'pre-line' }
    );
    tier2Panel.appendChild(tier2Name);
    tier2Panel.appendChild(tier2Details);
    panel.appendChild(tier2Panel);

    // Tier 1 - Tycoons (Late Game)
    const tier1Panel = this.uiManager.createPanel({
      margin: '15px 0',
      backgroundColor: player.prestige >= 150 ? 'rgba(231, 76, 60, 0.2)' : 'rgba(127, 140, 141, 0.1)',
      border: player.prestige >= 150 ? '2px solid #e74c3c' : '1px solid #7f8c8d',
    });

    const tier1Name = this.uiManager.createHeading('Tier 1: Tycoons', 3, {
      color: player.prestige >= 150 ? '#e74c3c' : '#7f8c8d',
    });
    const tier1Status = player.prestige < 150 ? '🔒 LOCKED' : '(CURRENT)';
    const tier1Details = this.uiManager.createText(
      `Prestige Range: 150+ ${tier1Status}\\n` +
      `Difficulty: ★★★★★ (Hardest)\\n` +
      `Budget: High ($20,000-$50,000)\\n` +
      `Tactics: Deep pockets, strategic bidding, may control Unicorns`,
      { fontSize: '14px', whiteSpace: 'pre-line' }
    );
    tier1Panel.appendChild(tier1Name);
    tier1Panel.appendChild(tier1Details);
    panel.appendChild(tier1Panel);

    const tipText = this.uiManager.createText(
      '💡 Tip: Use skills like Kick Tires and Stall to reduce rival budgets and patience. Strategy beats pure money!',
      { textAlign: 'center', fontSize: '14px', color: '#f39c12', marginTop: '20px', fontStyle: 'italic' }
    );
    panel.appendChild(tipText);

    // Back button
    const backBtn = this.uiManager.createButton(
      'Back to Garage',
      () => this.setupUI(),
      { style: { marginTop: '20px', width: '100%' } }
    );
    panel.appendChild(backBtn);

    this.uiManager.append(panel);
  }
}
