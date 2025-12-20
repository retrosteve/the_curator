/**
 * @internal
 * Shared DOM builders for "encounter" style UIs (Auction/Negotiation):
 * - Centered responsive layout scaffold
 * - Sticky log panel with prefix-only coloring
 */

import { isPixelUIEnabled } from './ui-style';

export type EncounterLogStyle = {
  color: string;
  fontWeight?: string;
};

export type EncounterLogEntry<K extends string = string> = {
  text: string;
  kind: K;
  portraitUrl?: string;
  portraitAlt?: string;
  portraitSizePx?: number;
};

export type EncounterLogPanelApi<K extends string = string> = {
  appendEntry: (entry: EncounterLogEntry<K>) => void;
  sync: (entries: Array<EncounterLogEntry<K>>) => void;
};

export type EncounterUIDeps = {
  createPanel: (options: { padding?: string; maxHeight?: string; overflowY?: string }) => HTMLDivElement;
  createHeading: (text: string, level?: 1 | 2 | 3, style?: Partial<CSSStyleDeclaration>) => HTMLElement;
};

export type EncounterActionsUIDeps = {
  createPanel: (style?: Partial<CSSStyleDeclaration>) => HTMLDivElement;
  createHeading: (text: string, level?: 1 | 2 | 3, style?: Partial<CSSStyleDeclaration>) => HTMLElement;
  createButtonContainer: (style?: Partial<CSSStyleDeclaration>) => HTMLDivElement;
};

export type EncounterActionsPanel = {
  actionsPanel: HTMLDivElement;
  buttonGrid: HTMLDivElement;
  buttonTextStyle: Partial<CSSStyleDeclaration>;
};

export function disableEncounterActionButton(button: HTMLButtonElement, disabledText?: string): void {
  button.disabled = true;
  button.style.opacity = '0.6';
  if (disabledText !== undefined) {
    button.textContent = disabledText;
  }
}

export function formatEncounterNeedLabel(actionLabel: string, neededFormatted: string): string {
  return `${actionLabel}\nNeed ${neededFormatted}`;
}

export function ensureEncounterLayoutStyles(params: {
  styleId: string;
  rootClass: string;
  topClass: string;
  bottomClass: string;
}): void {
  const { styleId, rootClass, topClass, bottomClass } = params;

  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .${rootClass} { width: min(94vw, 1100px); }
    @media (max-width: 860px) {
      .${topClass} { grid-template-columns: 1fr !important; }
      .${bottomClass} { grid-template-columns: 1fr !important; }
    }
  `;
  document.head.appendChild(style);
}

export function createEncounterCenteredLayoutRoot(rootClass: string): HTMLDivElement {
  const layoutRoot = document.createElement('div');
  layoutRoot.className = rootClass;
  Object.assign(layoutRoot.style, {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    maxHeight: 'calc(100vh - 140px)',
    overflowY: 'auto',
    boxSizing: 'border-box',
    display: 'grid',
    gap: '14px',
    pointerEvents: 'auto',
  } satisfies Partial<CSSStyleDeclaration>);
  return layoutRoot;
}

export function createEncounterTwoColGrid(className: string): HTMLDivElement {
  const grid = document.createElement('div');
  grid.className = className;
  Object.assign(grid.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '14px',
    alignItems: 'start',
  } satisfies Partial<CSSStyleDeclaration>);
  return grid;
}

export function createEncounterLogPanel<K extends string>(
  deps: EncounterUIDeps,
  params: {
    title?: string | null;
    entries: Array<EncounterLogEntry<K>>;
    getStyle: (kind: K) => EncounterLogStyle;
    maxEntries?: number;
    maxHeight?: string;
    height?: string;
    topContent?: HTMLElement;
    newestFirst?: boolean;
    onReady?: (api: EncounterLogPanelApi<K>) => void;
  }
): HTMLDivElement {
  const {
    title,
    entries,
    getStyle,
    maxEntries = 20,
    maxHeight,
    height,
    topContent,
    newestFirst = false,
    onReady,
  } = params;

  const resolvedTitle = title === undefined ? 'Log' : title;
  const resolvedMaxHeight = maxHeight ?? height ?? '260px';

  const hasTitle = Boolean(resolvedTitle && resolvedTitle.trim().length > 0);
  const hasHeader = hasTitle || Boolean(topContent);

  const logPanel = deps.createPanel({
    padding: hasHeader ? '0px' : '18px',
    maxHeight: resolvedMaxHeight,
    overflowY: 'hidden',
  });
  logPanel.style.overflowX = 'hidden';

  // Keep the scroll area width stable (avoid layout shifts when the scrollbar appears).
  if (!document.getElementById('encounterLogPanelStyles')) {
    const style = document.createElement('style');
    style.id = 'encounterLogPanelStyles';
    style.textContent = `
      .encounter-log-scroll {
        scrollbar-gutter: stable;
        overflow-x: hidden;
        box-sizing: border-box;
      }
    `;
    document.head.appendChild(style);
  }

  Object.assign(logPanel.style, {
    display: 'flex',
    flexDirection: 'column',
    gap: '0px',
  } satisfies Partial<CSSStyleDeclaration>);

  if (height) {
    logPanel.style.height = height;
  }

  if (hasHeader) {
    const stickyHeader = document.createElement('div');

    const headerPaddingTop = topContent ? '12px' : '0px';

    Object.assign(stickyHeader.style, {
      // Keep the header opaque (and visually consistent with the panel background)
      // so log text doesn't show through underneath while scrolling.
      margin: '0 0 10px 0',
      padding: `${headerPaddingTop} 18px 0px 18px`,
      borderBottom: '1px solid rgba(255,255,255,0.12)',
    } satisfies Partial<CSSStyleDeclaration>);
    // The header should never scroll (only the log area below it should).
    // Keep overflow visible so anchored bark bubbles aren't clipped.
    stickyHeader.style.overflow = 'visible';

    // Match the panel background + top rounding so the sticky header doesn't look like
    // a separate slab inside the panel.
    const panelBackground = logPanel.style.background || logPanel.style.backgroundColor;
    if (panelBackground) {
      stickyHeader.style.background = panelBackground;
    } else {
      stickyHeader.style.backgroundColor = 'rgba(0,0,0,1)';
    }

    const panelRadius = logPanel.style.borderRadius || '16px';
    stickyHeader.style.borderTopLeftRadius = panelRadius;
    stickyHeader.style.borderTopRightRadius = panelRadius;

    if (hasTitle) {
      stickyHeader.appendChild(
        deps.createHeading(resolvedTitle as string, 3, {
          textAlign: 'center',
          marginBottom: topContent ? '10px' : '0',
        })
      );
    }

    if (topContent) {
      stickyHeader.appendChild(topContent);
    }

    logPanel.appendChild(stickyHeader);
  }

  const logScrollArea = document.createElement('div');
  logScrollArea.classList.add('encounter-log-scroll');
  Object.assign(logScrollArea.style, {
    flex: '1 1 auto',
    minHeight: '0',
    minWidth: '0',
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: hasHeader ? '0 18px 18px 18px' : '0',
    boxSizing: 'border-box',
  } satisfies Partial<CSSStyleDeclaration>);
  logPanel.appendChild(logScrollArea);

  // Note: topContent is rendered above the scroll area.

  const renderLine = (entry: EncounterLogEntry<K>): HTMLDivElement => {
    const kindStyle = getStyle(entry.kind);
    const pixelUI = isPixelUIEnabled();

    const line = document.createElement('div');
    Object.assign(line.style, {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '8px',
      fontSize: '13px',
      margin: '0 0 6px 0',
      lineHeight: '1.3',
      color: '#ccc',
      minWidth: '0',
    } satisfies Partial<CSSStyleDeclaration>);

    if (entry.portraitUrl) {
      const portrait = document.createElement('img');
      portrait.src = entry.portraitUrl;
      portrait.alt = entry.portraitAlt ?? '';
      const sizePx = entry.portraitSizePx ?? 20;
      portrait.style.width = `${sizePx}px`;
      portrait.style.height = `${sizePx}px`;
      portrait.style.objectFit = 'cover';
      portrait.style.flex = '0 0 auto';
      portrait.style.boxSizing = 'border-box';
      portrait.style.borderRadius = pixelUI ? '0px' : '4px';
      portrait.style.border = '2px solid rgba(255,255,255,0.18)';
      portrait.style.backgroundColor = 'rgba(0,0,0,0.18)';
      portrait.style.imageRendering = pixelUI ? 'pixelated' : 'auto';
      line.appendChild(portrait);
    }

    const message = document.createElement('div');
    Object.assign(message.style, {
      flex: '1 1 auto',
      minWidth: '0',
      overflowWrap: 'anywhere',
      wordBreak: 'break-word',
    } satisfies Partial<CSSStyleDeclaration>);

    const bullet = document.createElement('span');
    bullet.textContent = '• ';
    message.appendChild(bullet);

    const colonIndex = entry.text.indexOf(':');
    if (colonIndex > 0) {
      const prefix = document.createElement('span');
      prefix.textContent = entry.text.slice(0, colonIndex + 1);
      prefix.style.color = kindStyle.color;
      if (kindStyle.fontWeight) prefix.style.fontWeight = kindStyle.fontWeight;
      message.appendChild(prefix);

      const rest = document.createElement('span');
      rest.textContent = entry.text.slice(colonIndex + 1);
      message.appendChild(rest);
    } else {
      const whole = document.createElement('span');
      whole.textContent = entry.text;
      message.appendChild(whole);
    }

    line.appendChild(message);
    return line;
  };

  const trimDomToMax = (): void => {
    while (logScrollArea.childElementCount > maxEntries) {
      if (newestFirst) {
        // Newest lines are prepended, so trim from the bottom.
        logScrollArea.lastElementChild?.remove();
      } else {
        // Newest lines are appended, so trim from the top.
        logScrollArea.firstElementChild?.remove();
      }
    }
  };

  const appendEntryToDom = (entry: EncounterLogEntry<K>): void => {
    const line = renderLine(entry);
    if (newestFirst) {
      logScrollArea.insertBefore(line, logScrollArea.firstChild);
      trimDomToMax();
      logScrollArea.scrollTop = 0;
      return;
    }

    logScrollArea.appendChild(line);
    trimDomToMax();
    logScrollArea.scrollTop = logScrollArea.scrollHeight;
  };

  const syncDomFromEntries = (allEntries: Array<EncounterLogEntry<K>>): void => {
    logScrollArea.innerHTML = '';
    const recentEntries = allEntries.slice(-maxEntries);
    const renderEntries = newestFirst ? recentEntries.slice().reverse() : recentEntries;
    for (const entry of renderEntries) {
      // Keep the same insertion behavior as initial render.
      logScrollArea.appendChild(renderLine(entry));
    }
    if (newestFirst) {
      logScrollArea.scrollTop = 0;
    } else {
      logScrollArea.scrollTop = logScrollArea.scrollHeight;
    }
  };

  syncDomFromEntries(entries);

  onReady?.({
    appendEntry: appendEntryToDom,
    sync: syncDomFromEntries,
  });

  return logPanel;
}

export function createEncounterActionsPanel(
  deps: EncounterActionsUIDeps,
  params?: { title?: string }
): EncounterActionsPanel {
  const title = params?.title ?? 'Actions';

  const actionsPanel = deps.createPanel({ padding: '18px' });
  actionsPanel.appendChild(
    deps.createHeading(title, 3, {
      textAlign: 'center',
      marginBottom: '10px',
    })
  );

  const buttonGrid = deps.createButtonContainer({
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '10px',
  });

  const buttonTextStyle: Partial<CSSStyleDeclaration> = {
    width: '100%',
    whiteSpace: 'pre-line',
    textAlign: 'left',
    lineHeight: '1.2',
    padding: '14px 16px',
    fontSize: '15px',
  };

  return { actionsPanel, buttonGrid, buttonTextStyle };
}
