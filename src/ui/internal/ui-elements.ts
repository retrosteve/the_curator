import type { ButtonVariant } from './ui-types';

export function createDiv(
  className: string,
  style?: Partial<CSSStyleDeclaration>
): HTMLDivElement {
  const div = document.createElement('div');
  div.className = className;

  if (style) {
    Object.assign(div.style, style);
  }

  return div;
}

export function createSpan(
  text?: string,
  className?: string,
  style?: Partial<CSSStyleDeclaration>
): HTMLSpanElement {
  const span = document.createElement('span');

  if (text !== undefined) {
    span.textContent = text;
  }

  if (className) {
    span.className = className;
  }

  if (style) {
    Object.assign(span.style, style);
  }

  return span;
}

export function createImg(options: {
  src: string;
  alt?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  style?: Partial<CSSStyleDeclaration>;
}): HTMLImageElement {
  const img = document.createElement('img');
  img.src = options.src;
  img.alt = options.alt ?? '';

  if (options.loading) {
    img.loading = options.loading;
  }

  if (options.className) {
    img.className = options.className;
  }

  if (options.style) {
    Object.assign(img.style, options.style);
  }

  return img;
}

export function createGameButton(
  text: string,
  onClick: () => void,
  options?: {
    variant?: ButtonVariant;
    style?: Partial<CSSStyleDeclaration>;
  }
): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = text;
  button.className = 'game-button';

  if (options?.variant) {
    button.classList.add(`btn-${options.variant}`);
  }

  if (options?.style) {
    Object.assign(button.style, options.style);
  }

  const stop = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
  };

  button.addEventListener('pointerdown', stop);
  button.addEventListener('pointerup', stop);
  button.addEventListener('click', (event) => {
    stop(event);
    onClick();
  });

  return button;
}

export function createGamePanel(style?: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const panel = document.createElement('div');
  panel.className = 'game-panel';

  if (style) {
    Object.assign(panel.style, style);
  }

  return panel;
}

export function createGameText(
  text: string,
  style?: Partial<CSSStyleDeclaration>
): HTMLParagraphElement {
  const p = document.createElement('p');
  p.textContent = text;
  p.className = 'game-text';

  if (style) {
    Object.assign(p.style, style);
  }

  return p;
}

export function createGameHeading(
  text: string,
  level: 1 | 2 | 3 = 2,
  style?: Partial<CSSStyleDeclaration>
): HTMLHeadingElement {
  const heading = document.createElement(`h${level}`) as HTMLHeadingElement;
  heading.textContent = text;
  heading.classList.add('game-heading');

  if (style) {
    Object.assign(heading.style, style);
  }

  return heading;
}

export function createGameButtonContainer(style?: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const container = document.createElement('div');
  container.className = 'game-button-container';

  if (style) {
    Object.assign(container.style, style);
  }

  return container;
}
