import { formatCurrency } from '@/utils/format';
import type { HUDData, HUDUpdate } from './ui-types';

export function createHUD(
  data: HUDData,
  options?: { formatLocationLabel?: (location: string) => string }
): HTMLDivElement {
  const hud = document.createElement('div');
  hud.id = 'game-hud';
  hud.className = 'game-panel game-hud game-hud--collapsed';

  const formatLocationLabel = options?.formatLocationLabel;
  const locationLabel =
    data.location !== undefined
      ? (formatLocationLabel ? formatLocationLabel(data.location) : data.location)
      : undefined;

  const skillsLabel =
    data.skills !== undefined
      ? `Eye ${data.skills.eye} · Tongue ${data.skills.tongue} · Network ${data.skills.network}`
      : undefined;

  const barLocationText = data.location !== undefined ? (locationLabel ?? data.location) : undefined;
  const barParts: string[] = [];
  barParts.push(`💰 <span class="hud-bar__value" data-hud-value="money">${formatCurrency(data.money)}</span>`);
  barParts.push(`📅 <span class="hud-bar__value" data-hud-value="day">${data.day}</span>`);
  if (barLocationText) {
    barParts.push(`📍 <span class="hud-bar__value" data-hud-value="location">${barLocationText}</span>`);
  }
  if (data.market !== undefined) {
    barParts.push(`📈 <span class="hud-bar__value" data-hud-value="market">${data.market}</span>`);
  }

  hud.innerHTML = `
      <div class="hud-bar" role="button" tabindex="0" aria-expanded="false">
        <div class="hud-bar__summary" title="Click to expand HUD">
          ${barParts.join('<span class="hud-bar__sep">·</span>')}
        </div>
        <button class="hud-bar__toggle" type="button" aria-label="Toggle HUD" title="Toggle HUD">▾</button>
      </div>

      <div class="hud-details">
        <div class="hud-grid">
          <div class="hud-item" data-hud="money">
            <span class="hud-icon">💰</span>
            <span class="hud-label">Money</span>
            <span class="hud-value" data-hud-value="money">${formatCurrency(data.money)}</span>
          </div>

          ${data.prestige !== undefined ? `
            <div class="hud-item" data-hud="prestige">
              <span class="hud-icon">🏆</span>
              <span class="hud-label">Prestige</span>
              <span class="hud-value" data-hud-value="prestige">${data.prestige}</span>
            </div>
          ` : ''}

          <div class="hud-item" data-hud="day">
            <span class="hud-icon">📅</span>
            <span class="hud-label">Day</span>
            <span class="hud-value" data-hud-value="day">${data.day}</span>
          </div>

          ${data.location !== undefined ? `
            <div class="hud-item hud-item--wide" data-hud="location">
              <span class="hud-icon">📍</span>
              <span class="hud-label">Location</span>
              <span class="hud-value" data-hud-value="location">${locationLabel}</span>
            </div>
          ` : ''}

          ${data.market !== undefined ? `
            <div class="hud-item" data-hud="market">
              <span class="hud-icon">📈</span>
              <span class="hud-label">Market</span>
              <span class="hud-value" data-hud-value="market">${data.market}</span>
            </div>
          ` : ''}

          ${data.garage !== undefined ? `
            <div class="hud-item" data-hud="garage">
              <span class="hud-icon">🏠</span>
              <span class="hud-label">Garage</span>
              <span class="hud-value" data-hud-value="garage">${data.garage.used}/${data.garage.total}</span>
            </div>
          ` : ''}

          ${data.skills !== undefined ? `
            <div class="hud-item hud-item--wide" data-hud="skills" title="Skills: Eye, Tongue, Network">
              <span class="hud-icon">🧠</span>
              <span class="hud-label">Skills</span>
              <span class="hud-value" data-hud-value="skills">${skillsLabel}</span>
            </div>
          ` : ''}

          ${data.dailyRent !== undefined ? `
            <div class="hud-item hud-item--subtle hud-item--danger" data-hud="daily-rent" title="Rent increases as you upgrade your garage">
              <span class="hud-icon">💸</span>
              <span class="hud-label">Rent</span>
              <span class="hud-value">${formatCurrency(data.dailyRent)}</span>
            </div>
          ` : ''}

          ${data.collectionPrestige !== undefined && data.collectionPrestige.carCount > 0 ? `
            <div class="hud-item hud-item--subtle hud-item--warning hud-item--wide" data-hud="collection-prestige" title="Cars in your collection generate prestige daily based on condition quality">
              <span class="hud-icon">🏛️</span>
              <span class="hud-label">Collection</span>
              <span class="hud-value" data-hud-value="collection-prestige">+${data.collectionPrestige.totalPerDay} prestige/day (${data.collectionPrestige.carCount} cars)</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;

  const bar = hud.querySelector<HTMLDivElement>('.hud-bar');
  const toggleBtn = hud.querySelector<HTMLButtonElement>('.hud-bar__toggle');
  const setExpanded = (expanded: boolean): void => {
    hud.classList.toggle('game-hud--collapsed', !expanded);
    bar?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    if (toggleBtn) toggleBtn.textContent = expanded ? '▴' : '▾';
  };

  const onToggle = (): void => {
    const isCollapsed = hud.classList.contains('game-hud--collapsed');
    setExpanded(isCollapsed);
  };

  bar?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.closest('button') || target.closest('a'))) return;
    onToggle();
  });
  bar?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  });
  toggleBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onToggle();
  });

  if (data.victoryProgress) {
    const progressDiv = document.createElement('div');
    progressDiv.className = 'hud-progress';

    const prestigeIcon = data.victoryProgress.prestige.met ? '✅' : '⬜';
    const unicornIcon = data.victoryProgress.unicorns.met ? '✅' : '⬜';
    const collectionIcon = data.victoryProgress.collectionCars.met ? '✅' : '⬜';
    const skillIcon = data.victoryProgress.skillLevel.met ? '✅' : '⬜';

    progressDiv.innerHTML = `
        <div class="hud-progress-title">🏆 Victory (click)</div>
        <div class="hud-progress-items">
          <div class="hud-progress-item">
            <span data-hud-progress-icon="prestige">${prestigeIcon}</span>
            Prestige <span data-hud-progress-value="prestige">${data.victoryProgress.prestige.current}/${data.victoryProgress.prestige.required}</span>
          </div>
          <div class="hud-progress-item">
            <span data-hud-progress-icon="unicorns">${unicornIcon}</span>
            Unicorns <span data-hud-progress-value="unicorns">${data.victoryProgress.unicorns.current}/${data.victoryProgress.unicorns.required}</span>
          </div>
          <div class="hud-progress-item">
            <span data-hud-progress-icon="collection">${collectionIcon}</span>
            Collection <span data-hud-progress-value="collection">${data.victoryProgress.collectionCars.current}/${data.victoryProgress.collectionCars.required}</span>
          </div>
          <div class="hud-progress-item">
            <span data-hud-progress-icon="skill">${skillIcon}</span>
            Max Skill <span data-hud-progress-value="skill">${data.victoryProgress.skillLevel.current}/${data.victoryProgress.skillLevel.required}</span>
          </div>
        </div>
      `;

    if (data.victoryProgress.onClickProgress) {
      progressDiv.addEventListener('click', data.victoryProgress.onClickProgress);
    }

    hud.querySelector('.hud-details')?.appendChild(progressDiv);
  }

  return hud;
}

export function updateHUD(
  data: HUDUpdate,
  options?: { formatLocationLabel?: (location: string) => string }
): void {
  const hud = document.getElementById('game-hud');
  if (!hud) return;

  const setTextAll = (selector: string, value: string): void => {
    const els = hud.querySelectorAll<HTMLElement>(selector);
    for (const el of els) el.textContent = value;
  };

  const hudGrid = hud.querySelector<HTMLDivElement>('.hud-grid');

  if (data.money !== undefined) {
    setTextAll('[data-hud-value="money"]', formatCurrency(data.money));
  }
  if (data.prestige !== undefined) {
    setTextAll('[data-hud-value="prestige"]', `${data.prestige}`);
  }
  if (data.garage !== undefined) {
    setTextAll('[data-hud-value="garage"]', `${data.garage.used}/${data.garage.total}`);
  }
  if (data.skills !== undefined) {
    setTextAll(
      '[data-hud-value="skills"]',
      `Eye ${data.skills.eye} · Tongue ${data.skills.tongue} · Network ${data.skills.network}`
    );
  }
  if (data.day !== undefined) {
    setTextAll('[data-hud-value="day"]', `${data.day}`);
  }
  if (data.location !== undefined) {
    const formatLocationLabel = options?.formatLocationLabel;
    setTextAll('[data-hud-value="location"]', formatLocationLabel ? formatLocationLabel(data.location) : data.location);
  }
  if (data.market !== undefined) {
    setTextAll('[data-hud-value="market"]', data.market);
  }

  if (data.collectionPrestige !== undefined && hudGrid) {
    const existing = hud.querySelector<HTMLDivElement>('[data-hud="collection-prestige"]');
    const collectionPrestige = data.collectionPrestige;
    const shouldShow = collectionPrestige !== null && collectionPrestige.carCount > 0;

    if (!shouldShow) {
      existing?.remove();
    } else {
      const ensure = existing ?? (() => {
        const wrapper = document.createElement('div');
        wrapper.className = 'hud-item hud-item--subtle hud-item--warning hud-item--wide';
        wrapper.setAttribute('data-hud', 'collection-prestige');
        wrapper.title = 'Cars in your collection generate prestige daily based on condition quality';
        wrapper.innerHTML = `
            <span class="hud-icon">🏛️</span>
            <span class="hud-label">Collection</span>
            <span class="hud-value" data-hud-value="collection-prestige"></span>
          `;
        hudGrid.appendChild(wrapper);
        return wrapper;
      })();

      const valueEl = ensure.querySelector<HTMLSpanElement>('[data-hud-value="collection-prestige"]');
      if (valueEl && collectionPrestige !== null) {
        valueEl.textContent = `+${collectionPrestige.totalPerDay} prestige/day (${collectionPrestige.carCount} cars)`;
      }
    }
  }

  if (data.victoryProgress !== undefined) {
    const progress = data.victoryProgress;
    const prestigeIconEl = hud.querySelector<HTMLSpanElement>('[data-hud-progress-icon="prestige"]');
    const unicornIconEl = hud.querySelector<HTMLSpanElement>('[data-hud-progress-icon="unicorns"]');
    const collectionIconEl = hud.querySelector<HTMLSpanElement>('[data-hud-progress-icon="collection"]');
    const skillIconEl = hud.querySelector<HTMLSpanElement>('[data-hud-progress-icon="skill"]');
    const prestigeValueEl2 = hud.querySelector<HTMLSpanElement>('[data-hud-progress-value="prestige"]');
    const unicornValueEl2 = hud.querySelector<HTMLSpanElement>('[data-hud-progress-value="unicorns"]');
    const collectionValueEl2 = hud.querySelector<HTMLSpanElement>('[data-hud-progress-value="collection"]');
    const skillValueEl2 = hud.querySelector<HTMLSpanElement>('[data-hud-progress-value="skill"]');

    if (progress === null) {
      // No-op: we currently always render victory progress from scenes.
    } else {
      if (prestigeIconEl) prestigeIconEl.textContent = progress.prestige.met ? '✅' : '⬜';
      if (unicornIconEl) unicornIconEl.textContent = progress.unicorns.met ? '✅' : '⬜';
      if (collectionIconEl) collectionIconEl.textContent = progress.collectionCars.met ? '✅' : '⬜';
      if (skillIconEl) skillIconEl.textContent = progress.skillLevel.met ? '✅' : '⬜';

      if (prestigeValueEl2) prestigeValueEl2.textContent = `${progress.prestige.current}/${progress.prestige.required}`;
      if (unicornValueEl2) unicornValueEl2.textContent = `${progress.unicorns.current}/${progress.unicorns.required}`;
      if (collectionValueEl2) collectionValueEl2.textContent = `${progress.collectionCars.current}/${progress.collectionCars.required}`;
      if (skillValueEl2) skillValueEl2.textContent = `${progress.skillLevel.current}/${progress.skillLevel.required}`;
    }
  }
}
