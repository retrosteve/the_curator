/**
 * @internal
 * Shared DOM builders for "encounter" style UIs (Auction/Negotiation):
 * - Centered responsive layout scaffold
 * - Sticky log panel with prefix-only coloring
 */

export type EncounterLogStyle = {
  color: string;
  fontWeight?: string;
};

export type EncounterLogEntry<K extends string = string> = {
  text: string;
  kind: K;
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
    title?: string;
    entries: Array<EncounterLogEntry<K>>;
    getStyle: (kind: K) => EncounterLogStyle;
    maxEntries?: number;
  }
): HTMLDivElement {
  const { title = 'Log', entries, getStyle, maxEntries = 20 } = params;

  const logPanel = deps.createPanel({
    padding: '18px',
    maxHeight: '260px',
    overflowY: 'auto',
  });

  const logHeader = document.createElement('div');
  Object.assign(logHeader.style, {
    position: 'sticky',
    top: '0',
    zIndex: '1',
    // Opaque header so log text doesn't show through underneath while scrolling.
    backgroundColor: 'rgba(0,0,0,0.92)',
    margin: '0 -18px 10px -18px',
    padding: '10px 18px',
    borderBottom: '1px solid rgba(255,255,255,0.12)',
  } satisfies Partial<CSSStyleDeclaration>);

  logHeader.appendChild(
    deps.createHeading(title, 3, {
      textAlign: 'center',
      marginBottom: '0',
    })
  );
  logPanel.appendChild(logHeader);

  const recentEntries = entries.slice(-maxEntries);
  for (const entry of recentEntries) {
    const kindStyle = getStyle(entry.kind);

    const line = document.createElement('div');
    Object.assign(line.style, {
      fontSize: '13px',
      margin: '0 0 6px 0',
      lineHeight: '1.3',
      color: '#ccc',
    } satisfies Partial<CSSStyleDeclaration>);

    const bullet = document.createElement('span');
    bullet.textContent = '• ';
    line.appendChild(bullet);

    const colonIndex = entry.text.indexOf(':');
    if (colonIndex > 0) {
      const prefix = document.createElement('span');
      prefix.textContent = entry.text.slice(0, colonIndex + 1);
      prefix.style.color = kindStyle.color;
      if (kindStyle.fontWeight) prefix.style.fontWeight = kindStyle.fontWeight;
      line.appendChild(prefix);

      const rest = document.createElement('span');
      rest.textContent = entry.text.slice(colonIndex + 1);
      line.appendChild(rest);
    } else {
      const whole = document.createElement('span');
      whole.textContent = entry.text;
      line.appendChild(whole);
    }

    logPanel.appendChild(line);
  }

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
