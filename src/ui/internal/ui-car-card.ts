import type { Car } from '@/data/car-database';
import { getCarImageUrlOrPlaceholder } from '@/assets/car-images';
import { createDiv, createGameHeading, createGamePanel, createImg } from './ui-elements';
import { isPixelUIEnabled } from './ui-style';

export type CarCardBase = {
  panel: HTMLDivElement;
  body: HTMLDivElement;
  image?: HTMLImageElement;
};

export type CarCardBaseOptions = {
  /** Height of the image in pixels (default 120). */
  imageHeightPx?: number;
  /** Optional override for the title color. */
  titleColor?: string;
  /** Heading level to use for the title (default 3). */
  titleLevel?: 1 | 2 | 3;
  /** Additional style to apply to the outer panel. */
  panelStyle?: Partial<CSSStyleDeclaration>;
  /** Additional style to apply to the title element. */
  titleStyle?: Partial<CSSStyleDeclaration>;
  /** Hide the image entirely. */
  showImage?: boolean;
};

export type CarCardPreset = 'standard' | 'collection' | 'infoPanel';

/**
 * Shared presets for car cards to prevent visual drift across scenes.
 * Use this instead of manually passing style knobs to `createCarCardBase`.
 */
export function createCarCardPreset(car: Car, preset: CarCardPreset, options?: {
  /** Additional CSS classes to apply to the outer panel. */
  classNames?: readonly string[];
  /** Optional style overrides (use sparingly). */
  panelStyle?: Partial<CSSStyleDeclaration>;
  /** Optional title style overrides (use sparingly). */
  titleStyle?: Partial<CSSStyleDeclaration>;
  /** Optional override to hide the image entirely. */
  showImage?: boolean;
  /** Optional override for image height. */
  imageHeightPx?: number;
  /** Optional override for the title color. */
  titleColor?: string;
}): CarCardBase {
  const base = (() => {
    switch (preset) {
      case 'standard':
        return createCarCardBase(car, {
          showImage: options?.showImage,
          imageHeightPx: options?.imageHeightPx ?? 120,
          titleColor: options?.titleColor ?? '#ecf0f1',
          titleLevel: 3,
          panelStyle: {
            backgroundColor: 'rgba(52, 73, 94, 0.6)',
            ...options?.panelStyle,
          },
          titleStyle: {
            fontSize: '18px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            ...options?.titleStyle,
          },
        });
      case 'collection':
        return createCarCardBase(car, {
          showImage: options?.showImage,
          imageHeightPx: options?.imageHeightPx ?? 120,
          titleColor: options?.titleColor ?? '#f39c12',
          titleLevel: 3,
          panelStyle: {
            backgroundColor: 'rgba(243, 156, 18, 0.1)',
            border: '2px solid #f39c12',
            ...options?.panelStyle,
          },
          titleStyle: {
            fontSize: '18px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            ...options?.titleStyle,
          },
        });
      case 'infoPanel':
        return createCarCardBase(car, {
          showImage: options?.showImage,
          imageHeightPx: options?.imageHeightPx ?? 140,
          titleColor: options?.titleColor ?? '#ecf0f1',
          titleLevel: 2,
          panelStyle: {
            textAlign: 'center',
            ...options?.panelStyle,
          },
          titleStyle: {
            margin: '0 0 10px 0',
            ...options?.titleStyle,
          },
        });
      default: {
        const _exhaustive: never = preset;
        return _exhaustive;
      }
    }
  })();

  if (preset !== 'infoPanel') {
    base.panel.classList.add('garage-car-card');
  }
  for (const cn of options?.classNames ?? []) {
    base.panel.classList.add(cn);
  }
  return base;
}

/**
 * Shared "car card" base used across scenes.
 * Callers can append additional content (actions, extra metadata) into `body`.
 */
export function createCarCardBase(car: Car, options?: CarCardBaseOptions): CarCardBase {
  const pixelUI = isPixelUIEnabled();

  const panel = createGamePanel({
    margin: '0',
    padding: '14px',
    ...options?.panelStyle,
  });
  panel.classList.add('car-card');

  let image: HTMLImageElement | undefined;
  if (options?.showImage !== false) {
    const templateId = car.templateId ?? car.id;
    const imageUrl = getCarImageUrlOrPlaceholder(templateId);

    image = createImg({
      src: imageUrl,
      alt: car.name,
      loading: 'lazy',
      className: 'car-info-image',
    });

    Object.assign(image.style, {
      width: '100%',
      height: `${options?.imageHeightPx ?? 120}px`,
      objectFit: 'cover',
      borderRadius: pixelUI ? '0px' : '10px',
      border: '2px solid rgba(255,255,255,0.2)',
      backgroundColor: 'rgba(0,0,0,0.2)',
      imageRendering: pixelUI ? 'pixelated' : 'auto',
      margin: '0 0 10px 0',
      boxSizing: 'border-box',
    } satisfies Partial<CSSStyleDeclaration>);

    panel.appendChild(image);
  }

  const title = createGameHeading(car.name, options?.titleLevel ?? 3, {
    margin: '0 0 6px 0',
    color: options?.titleColor,
    ...options?.titleStyle,
  });
  panel.appendChild(title);

  const body = createDiv('');
  Object.assign(body.style, {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: '0',
  } satisfies Partial<CSSStyleDeclaration>);
  panel.appendChild(body);

  return { panel, body, image };
}
