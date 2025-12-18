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
  card.dataset.locationId = locationId;
  card.dataset.tutorialTarget = `map.location.${locationId}`;

  const hexColor = '#' + color.toString(16).padStart(6, '0');

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

  if (isExhaustedToday) {
    card.style.cursor = 'not-allowed';
    card.style.opacity = '0.65';
  }

  if (isLocked) {
    card.style.cursor = 'not-allowed';
    card.style.opacity = '0.5';
    card.style.filter = 'grayscale(0.8)';
  }

  const accent = document.createElement('div');
  accent.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 4px;
      height: 100%;
      background: ${isLocked ? '#999' : hexColor};
    `;
  card.appendChild(accent);

  const header = document.createElement('div');
  header.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
      padding-left: 8px;
    `;

  const iconSpan = document.createElement('span');
  iconSpan.textContent = isLocked ? '🔒' : icon;
  iconSpan.style.cssText = 'font-size: 28px;';

  const nameEl = document.createElement('div');
  nameEl.textContent = name;
  nameEl.style.cssText = `
      font-size: 18px;
      font-weight: bold;
      color: #fff;
      flex: 1;
    `;

  header.appendChild(iconSpan);
  header.appendChild(nameEl);
  card.appendChild(header);

  const desc = document.createElement('div');
  const isTutorialLock = Boolean(lockReason) && (lockReason ?? '').toLowerCase().startsWith('tutorial');
  desc.textContent = isLocked
    ? (isTutorialLock ? (lockReason as string) : 'Increase your Prestige to gain access to this location.')
    : description;
  desc.style.cssText = `
      color: rgba(255,255,255,0.7);
      font-size: 13px;
      margin-bottom: 12px;
      padding-left: 8px;
      line-height: 1.4;
    `;
  card.appendChild(desc);

  const statusBar = document.createElement('div');
  statusBar.style.cssText = `
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 12px;
      padding-left: 8px;
    `;

  if (isLocked) {
    const lockBadge = document.createElement('span');
    lockBadge.textContent = `🔒 ${lockReason ?? 'Locked'}`;
    lockBadge.style.cssText = `
        background: rgba(100,100,100,0.5);
        color: #fff;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: bold;
      `;
    statusBar.appendChild(lockBadge);
  } else {
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

    if (isExhaustedToday) {
      const exhaustedBadge = document.createElement('span');
      exhaustedBadge.textContent = '🚫 EXHAUSTED TODAY';
      exhaustedBadge.style.cssText = `
          background: rgba(244, 67, 54, 0.2);
          color: #f44336;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: bold;
        `;
      statusBar.appendChild(exhaustedBadge);
    }

    if (showRivalBadge) {
      const rivalBadge = document.createElement('span');
      rivalBadge.textContent = '⚔️ RIVAL PRESENT TODAY';
      rivalBadge.style.cssText = `
          background: rgba(255,69,58,0.2);
          color: #ff453a;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: bold;
        `;
      rivalBadge.title = 'This is locked in for the current day.';
      statusBar.appendChild(rivalBadge);
    }

    if (showSpecialBadge) {
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
  }

  card.appendChild(statusBar);

  const button = document.createElement('button');
  button.textContent = isLocked ? 'Locked' : (isGarage ? 'Return Home' : 'Visit Location');
  button.disabled = isLocked;
  button.dataset.tutorialTarget = `map.location.${locationId}`;
  button.style.cssText = `
      width: 100%;
      padding: 10px;
      background: ${isLocked ? '#555' : hexColor};
      color: ${isLocked ? '#aaa' : '#fff'};
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: bold;
      cursor: ${isLocked ? 'not-allowed' : 'pointer'};
      transition: all 0.2s ease;
      margin-top: 8px;
    `;

  if (!isLocked) {
    button.addEventListener('mouseenter', () => {
      if (isExhaustedToday) return;
      button.style.transform = 'translateY(-2px)';
      button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = 'none';
    });
  }

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

  if (!isLocked) {
    card.addEventListener('mouseenter', () => {
      if (isExhaustedToday) return;
      card.style.transform = 'translateY(-4px)';
      card.style.boxShadow = '0 8px 25px rgba(0,0,0,0.4)';
      card.style.borderColor = 'rgba(255,255,255,0.4)';
    });

    card.addEventListener('mouseleave', () => {
      if (isExhaustedToday) return;
      card.style.transform = 'translateY(0)';
      card.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
      card.style.borderColor = 'rgba(255,255,255,0.2)';
    });
  }

  card.addEventListener('click', handleActivate);

  return card;
}

/**
 * Creates the DOM container that holds map location cards.
 * @internal Factory used by UIManager.
 */
export function createMapDashboardContainer(): HTMLDivElement {
  const container = document.createElement('div');
  container.style.cssText = `
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
      pointer-events: auto;
    `;
  return container;
}
