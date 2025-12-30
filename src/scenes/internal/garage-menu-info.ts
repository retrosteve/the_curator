import { MarketFluctuationSystem } from '@/systems/market-fluctuation-system';
import { SpecialEventsSystem } from '@/systems/special-events-system';
import type { GameManager } from '@/core/game-manager';
import type { UIManager } from '@/ui/ui-manager';
import { getCharacterPortraitUrlOrPlaceholder } from '@/assets/character-portraits';
import { getAllCharacterProfiles } from '@/data/character-database';
import { SKILL_METADATA, type SkillKey } from '@/config/game-config';
import { formatCurrency, formatNumber } from '@/utils/format';
import { isPixelUIEnabled } from '@/ui/internal/ui-style';

/**
 * Garage menu info panels (Morning Brief + Skills + People).
 * Extracted from GarageScene to reduce file size and improve maintainability.
 */

function createMorningPaper(context: { gameManager: GameManager; uiManager: UIManager }): HTMLElement {
  const { gameManager, uiManager } = context;

  const container = document.createElement('div');
  container.className = 'garage-brief';

  const player = gameManager.getPlayerState();
  const world = gameManager.getWorldState();
  const garageCarCount = gameManager.getGarageCarCount();
  const rentDue = gameManager.getDailyRent();

  const marketSystem = MarketFluctuationSystem.getInstance();
  const marketState = marketSystem.getState();
  const marketEvent = marketState.currentEvent;
  const marketSummary = marketEvent
    ? `${marketEvent.type.replace(/([A-Z])/g, ' $1').trim()} (${marketEvent.daysRemaining}d)`
    : 'Stable';

  const eventsSystem = SpecialEventsSystem.getInstance();
  const activeEvents = eventsSystem.getActiveEvents();

  const lineStyle: Partial<CSSStyleDeclaration> = {
    margin: '6px 0',
    fontSize: '12px',
    lineHeight: '1.35',
    opacity: '0.9',
  };

  container.appendChild(uiManager.createText(`Day ${world.day}`, lineStyle));

  container.appendChild(
    uiManager.createText(
      `Cash: ${formatCurrency(player.money)} · Rent due tonight: ${formatCurrency(rentDue)}`,
      lineStyle
    )
  );

  container.appendChild(
    uiManager.createText(
      `Garage: ${garageCarCount}/${player.garageSlots} cars · Prestige: ${formatNumber(player.prestige)}`,
      lineStyle
    )
  );

  const activeLoan = gameManager.getActiveLoan();
  const financeLine = activeLoan
    ? `Finance: Owes ${formatCurrency(activeLoan.principal + activeLoan.fee)} (${formatCurrency(activeLoan.principal)} + ${formatCurrency(activeLoan.fee)} fee, taken day ${activeLoan.takenDay})`
    : 'Finance: No active loan';
  container.appendChild(uiManager.createText(financeLine, lineStyle));

  const eventsLine = activeEvents.length
    ? activeEvents.map((event) => `${event.name} (${event.expiresInDays}d)`).join(' · ')
    : 'None';

  container.appendChild(uiManager.createText(`Market: ${marketSummary}`, lineStyle));
  container.appendChild(uiManager.createText(`Events: ${eventsLine}`, lineStyle));

  return container;
}

export function createGarageMenuInfo(context: {
  gameManager: GameManager;
  uiManager: UIManager;
  playerSkills: Record<SkillKey, number>;
}): HTMLElement {
  const { gameManager, uiManager, playerSkills } = context;

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
  morningBriefDetails.appendChild(createMorningPaper({ gameManager, uiManager }));
  infoContainer.appendChild(morningBriefDetails);

  const skillsDetails = document.createElement('details');
  skillsDetails.className = 'garage-collapsible';
  const skillsSummary = document.createElement('summary');
  skillsSummary.textContent = `Skills — ${SKILL_METADATA.eye.icon} Eye ${playerSkills.eye} · ${SKILL_METADATA.tongue.icon} Tongue ${playerSkills.tongue} · ${SKILL_METADATA.network.icon} Network ${playerSkills.network}`;
  skillsDetails.appendChild(skillsSummary);

  // Skill XP Progress Bars (collapsed by default)
  const skillsPanel = document.createElement('div');
  skillsPanel.className = 'garage-skills-panel';

  const skillsHeading = uiManager.createText('Skill Progress', {
    fontWeight: 'bold',
    margin: '0 0 8px 0',
    opacity: '0.9',
  });
  skillsPanel.appendChild(skillsHeading);

  const skills: SkillKey[] = ['eye', 'tongue', 'network'];
  const skillTooltips: Record<SkillKey, string> = {
    eye: 'Lvl 1: See basic car info\nLvl 2: Reveal hidden damage\nLvl 3: See accurate market value\nLvl 4: Unlock Kick Tires tactic\nLvl 5: Predict market trends',
    tongue:
      'Lvl 1: Basic auction tactics\nLvl 2: Unlock Stall tactic\nLvl 3: +1 Stall use per auction\nLvl 4: +1 Stall use per auction\nLvl 5: Master tactician (max Stall uses)',
    network:
      'Lvl 1: Access public opportunities\nLvl 2: Better location intel\nLvl 3: Earlier special-event visibility\nLvl 4: See rival movements\nLvl 5: Insider leads & exclusive events',
  };

  skills.forEach((skill) => {
    const progress = gameManager.getSkillProgress(skill);
    const isMaxLevel = progress.level >= 5;
    const skillMeta = SKILL_METADATA[skill];

    const skillRow = document.createElement('div');
    skillRow.style.cssText = 'margin-bottom: 8px; cursor: help; position: relative;';
    skillRow.title = skillTooltips[skill];

    const label = document.createElement('div');
    label.style.cssText =
      'display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 3px; opacity: 0.95;';

    const leftSpan = document.createElement('span');
    leftSpan.textContent = `${skillMeta.icon} ${skillMeta.name} Lv ${progress.level}`;
    label.appendChild(leftSpan);

    const rightSpan = document.createElement('span');
    rightSpan.textContent = isMaxLevel ? 'MAX' : `${progress.current}/${progress.required} XP`;
    label.appendChild(rightSpan);
    skillRow.appendChild(label);

    if (!isMaxLevel) {
      const progressBar = document.createElement('div');
      progressBar.style.cssText =
        'width: 100%; height: 6px; background: rgba(0,0,0,0.28); border-radius: 999px; overflow: hidden;';

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

  const peopleDetails = document.createElement('details');
  peopleDetails.className = 'garage-collapsible';
  const peopleSummary = document.createElement('summary');
  peopleSummary.textContent = 'People — Characters';
  peopleDetails.appendChild(peopleSummary);

  const peopleGrid = document.createElement('div');
  peopleGrid.style.cssText =
    'display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 10px; margin-top: 10px;';

  const pixelUI = isPixelUIEnabled();
  const profiles = getAllCharacterProfiles();
  for (const profile of profiles) {
    const card = document.createElement('div');
    card.style.cssText =
      `display: flex; gap: 10px; align-items: flex-start; padding: 10px; ` +
      `background: rgba(0,0,0,0.22); border: 1px solid rgba(255,255,255,0.12); ` +
      `border-radius: ${pixelUI ? '0px' : '10px'};`;

    const portrait = document.createElement('img');
    portrait.src = getCharacterPortraitUrlOrPlaceholder(profile.name);
    portrait.alt = `${profile.name} portrait`;
    portrait.style.cssText =
      `width: 56px; height: 56px; object-fit: cover; flex: 0 0 auto; ` +
      `border: 2px solid rgba(255,255,255,0.18); background: rgba(0,0,0,0.18); ` +
      `border-radius: ${pixelUI ? '0px' : '10px'}; image-rendering: ${pixelUI ? 'pixelated' : 'auto'};`;
    card.appendChild(portrait);

    const textCol = document.createElement('div');
    textCol.style.cssText = 'min-width: 0;';

    const nameLine = uiManager.createText(profile.name, {
      margin: '0',
      fontWeight: 'bold',
    });
    textCol.appendChild(nameLine);

    const bioLine = uiManager.createText(profile.bio, {
      margin: '6px 0 0 0',
      fontSize: '12px',
      lineHeight: '1.4',
      color: '#ccc',
    });
    textCol.appendChild(bioLine);

    card.appendChild(textCol);
    peopleGrid.appendChild(card);
  }

  peopleDetails.appendChild(peopleGrid);
  infoContainer.appendChild(peopleDetails);

  return infoContainer;
}
