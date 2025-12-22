import type { Car } from '@/data/car-database';
import { formatCurrency } from '@/utils/format';
import { getCarImageUrlOrPlaceholder } from '@/assets/car-images';
import { createGameHeading, createGamePanel, createGameText, createImg } from './ui-elements';

export type CarInfoPanelOptions = {
  showValue?: boolean;
  customValueText?: string;
  showCondition?: boolean;
  showTags?: boolean;
  showImage?: boolean;
  imageHeightPx?: number;
  style?: Partial<CSSStyleDeclaration>;
  titleColor?: string;
};

export function createCarInfoPanel(car: Car, options?: CarInfoPanelOptions): HTMLDivElement {
  const panel = createGamePanel({
    textAlign: 'center',
    ...options?.style,
  });
  panel.classList.add('car-info-panel');

  const title = createGameHeading(car.name, 2, {
    color: options?.titleColor || '#ecf0f1',
    marginBottom: '10px',
  });
  panel.appendChild(title);

  if (options?.showImage !== false) {
    const templateId = car.templateId ?? car.id;
    const imageUrl = getCarImageUrlOrPlaceholder(templateId);

    const img = createImg({
      src: imageUrl,
      alt: car.name,
      loading: 'lazy',
      className: 'car-info-image',
    });
    img.style.height = `${options?.imageHeightPx ?? 140}px`;
    panel.appendChild(img);
  }

  const details: string[] = [];
  if (options?.showCondition !== false) {
    details.push(`Condition: ${car.condition}/100`);
  }

  if (options?.customValueText) {
    details.push(options.customValueText);
  } else if (options?.showValue) {
    details.push(`Base Value: ${formatCurrency(car.baseValue)}`);
  }

  if (details.length > 0) {
    const infoText = createGameText(details.join(' | '));
    infoText.classList.add('car-info-details');
    panel.appendChild(infoText);
  }

  if (options?.showTags !== false && car.tags && car.tags.length > 0) {
    const tagsText = createGameText(`Tags: ${car.tags.join(', ')}`);
    tagsText.classList.add('car-info-tags');
    panel.appendChild(tagsText);
  }

  return panel;
}
