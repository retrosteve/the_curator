import type { Car } from '@/data/car-database';
import { formatCurrency } from '@/utils/format';
import { createGameText } from './ui-elements';
import { createCarCardPreset } from './ui-car-card';

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
  const { panel, body } = createCarCardPreset(car, 'infoPanel', {
    showImage: options?.showImage,
    imageHeightPx: options?.imageHeightPx,
    titleColor: options?.titleColor,
    classNames: ['car-info-panel'],
    panelStyle: {
      ...options?.style,
    },
  });
  panel.classList.add('car-info-panel');

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
    body.appendChild(infoText);
  }

  if (options?.showTags !== false && car.tags && car.tags.length > 0) {
    const tagsText = createGameText(`Tags: ${car.tags.join(', ')}`);
    tagsText.classList.add('car-info-tags');
    body.appendChild(tagsText);
  }

  return panel;
}
