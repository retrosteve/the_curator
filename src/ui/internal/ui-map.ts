/**
 * Creates a DOM card element representing a map location.
 * @internal Factory used by UIManager.
 */
import { createDiv, createGameButton } from './ui-elements';

export function createMapLocationCard(options: {
  locationId: string;
  name: string;
  description: string;
  icon: string;
  color: number;
  isGarage: boolean;
  isLocked: boolean;
  lockReason?: string;
  isExhaustedToday: boolean;
  showRivalBadge: boolean;
  showSpecialBadge: boolean;
  timeCost?: number;
  onVisit: () => void;
  onShowLockedModal: (title: string, message: string) => void;
}): HTMLElement {
  const {
    locationId,
    name,
    description,
    icon,
    color,
    isGarage,
    isLocked,
    lockReason,
    isExhaustedToday,
    showRivalBadge,
    showSpecialBadge,
    timeCost,
    onVisit,
    onShowLockedModal,
  } = options;

  const card = createDiv('map-location-card');
  card.dataset.locationId = locationId;
  // Keep the clickable button as the canonical tutorial target.
  // The card can be targeted explicitly if needed.
  card.dataset.tutorialTarget = `map.location.${locationId}.card`;

  const hexColor = '#' + color.toString(16).padStart(6, '0');

  // Dynamic accent is the only per-location styling; everything else lives in CSS.
  card.style.setProperty('--map-accent-color', hexColor);

  if (isExhaustedToday) {
    card.classList.add('is-exhausted');
  }

  if (isLocked) {
    card.classList.add('is-locked');
  }

  const accent = createDiv('map-location-card__accent');
  card.appendChild(accent);

  const header = createDiv('map-location-card__header');

  const iconSpan = document.createElement('span');
  iconSpan.textContent = isLocked ? '🔒' : icon;
  iconSpan.className = 'map-location-card__icon';

  const nameEl = createDiv('map-location-card__name');
  nameEl.textContent = name;

  header.appendChild(iconSpan);
  header.appendChild(nameEl);
  card.appendChild(header);

  const desc = createDiv('map-location-card__description');
  const isTutorialLock = Boolean(lockReason) && (lockReason ?? '').toLowerCase().startsWith('tutorial');
  desc.textContent = isLocked
    ? (isTutorialLock ? (lockReason as string) : 'Increase your Prestige to gain access to this location.')
    : description;
  card.appendChild(desc);

  const statusBar = createDiv('map-location-card__status');

  // Time badge: show the cost to take the action from the map.
  // Reuse existing badge styles to keep the UI consistent.
  if (!isGarage) {
    const timeBadge = document.createElement('span');
    const effectiveCost = Number.isFinite(timeCost) ? Math.max(0, Math.floor(timeCost as number)) : 0;
    timeBadge.textContent = effectiveCost > 0 ? `\u23F1 ${effectiveCost} TIME` : 'FREE';
    timeBadge.className = `map-badge ${effectiveCost > 0 ? 'map-badge--ap' : 'map-badge--free'}`;
    statusBar.appendChild(timeBadge);
  }

  if (isLocked) {
    const lockBadge = document.createElement('span');
    lockBadge.textContent = `🔒 ${lockReason ?? 'Locked'}`;
    lockBadge.className = 'map-badge map-badge--locked';
    statusBar.appendChild(lockBadge);
  } else {
    if (!isGarage) {
      // No per-location cost badge.
    } else {
      const homeBadge = document.createElement('span');
      homeBadge.textContent = 'FREE';
      homeBadge.className = 'map-badge map-badge--free';
      statusBar.appendChild(homeBadge);
    }

    if (isExhaustedToday) {
      const exhaustedBadge = document.createElement('span');
      exhaustedBadge.textContent = '🚫 EXHAUSTED TODAY';
      exhaustedBadge.className = 'map-badge map-badge--exhausted';
      statusBar.appendChild(exhaustedBadge);
    }

    if (showRivalBadge) {
      const rivalBadge = document.createElement('span');
      rivalBadge.textContent = '⚔️ RIVAL PRESENT TODAY';
      rivalBadge.className = 'map-badge map-badge--rival';
      rivalBadge.title = 'This is locked in for the current day.';
      statusBar.appendChild(rivalBadge);
    }

    if (showSpecialBadge) {
      const specialBadge = document.createElement('span');
      specialBadge.textContent = '✨ SPECIAL';
      specialBadge.className = 'map-badge map-badge--special';
      statusBar.appendChild(specialBadge);
    }
  }

  card.appendChild(statusBar);

  const handleActivate = (): void => {
    if (isLocked) {
      onShowLockedModal(
        'Location Locked',
        `You need ${lockReason ?? 'more Prestige'} to access this location.\n\nEarn Prestige by restoring and selling cars, or by adding cars to your collection.`
      );
      return;
    }

    onVisit();
  };

  const button = createGameButton(
    isLocked ? 'Locked' : (isGarage ? 'Return Home' : 'Visit Location'),
    handleActivate
  );
  button.disabled = isLocked;
  button.dataset.tutorialTarget = `map.location.${locationId}`;
  // Preserve existing styling hook.
  button.className = 'map-location-card__button';

  card.appendChild(button);

  card.addEventListener('click', handleActivate);

  return card;
}

/**
 * Creates the DOM container that holds map location cards.
 * @internal Factory used by UIManager.
 */
export function createMapDashboardContainer(): HTMLDivElement {
  const container = createDiv('map-dashboard');
  return container;
}
