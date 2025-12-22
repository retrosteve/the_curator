/**
 * Creates a DOM card element representing a map location.
 * @internal Factory used by UIManager.
 */
export function createMapLocationCard(options: {
  locationId: string;
  name: string;
  description: string;
  icon: string;
  color: number;
  apCost: number;
  isGarage: boolean;
  isLocked: boolean;
  lockReason?: string;
  isExhaustedToday: boolean;
  showRivalBadge: boolean;
  showSpecialBadge: boolean;
  onVisit: () => void;
  onShowLockedModal: (title: string, message: string) => void;
}): HTMLElement {
  const {
    locationId,
    name,
    description,
    icon,
    color,
    apCost,
    isGarage,
    isLocked,
    lockReason,
    isExhaustedToday,
    showRivalBadge,
    showSpecialBadge,
    onVisit,
    onShowLockedModal,
  } = options;

  const card = document.createElement('div');
  card.className = 'map-location-card';
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

  const accent = document.createElement('div');
  accent.className = 'map-location-card__accent';
  card.appendChild(accent);

  const header = document.createElement('div');
  header.className = 'map-location-card__header';

  const iconSpan = document.createElement('span');
  iconSpan.textContent = isLocked ? '🔒' : icon;
  iconSpan.className = 'map-location-card__icon';

  const nameEl = document.createElement('div');
  nameEl.textContent = name;
  nameEl.className = 'map-location-card__name';

  header.appendChild(iconSpan);
  header.appendChild(nameEl);
  card.appendChild(header);

  const desc = document.createElement('div');
  const isTutorialLock = Boolean(lockReason) && (lockReason ?? '').toLowerCase().startsWith('tutorial');
  desc.textContent = isLocked
    ? (isTutorialLock ? (lockReason as string) : 'Increase your Prestige to gain access to this location.')
    : description;
  desc.className = 'map-location-card__description';
  card.appendChild(desc);

  const statusBar = document.createElement('div');
  statusBar.className = 'map-location-card__status';

  if (isLocked) {
    const lockBadge = document.createElement('span');
    lockBadge.textContent = `🔒 ${lockReason ?? 'Locked'}`;
    lockBadge.className = 'map-badge map-badge--locked';
    statusBar.appendChild(lockBadge);
  } else {
    if (!isGarage) {
      const apBadge = document.createElement('span');
      apBadge.textContent = `⚡ ${apCost} AP`;
      apBadge.className = 'map-badge map-badge--ap';
      statusBar.appendChild(apBadge);
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

  const button = document.createElement('button');
  button.textContent = isLocked ? 'Locked' : (isGarage ? 'Return Home' : 'Visit Location');
  button.disabled = isLocked;
  button.dataset.tutorialTarget = `map.location.${locationId}`;
  button.className = 'map-location-card__button';

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

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    handleActivate();
  });

  card.appendChild(button);

  card.addEventListener('click', handleActivate);

  return card;
}

/**
 * Creates the DOM container that holds map location cards.
 * @internal Factory used by UIManager.
 */
export function createMapDashboardContainer(): HTMLDivElement {
  const container = document.createElement('div');
  container.className = 'map-dashboard';
  return container;
}
