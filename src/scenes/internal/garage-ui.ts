import type { Car, getCarById } from '@/data/car-database';
import { Economy } from '@/systems/Economy';
import type { GameManager } from '@/core/game-manager';
import type { UIManager } from '@/ui/ui-manager';
import { formatCurrency } from '@/utils/format';
import { getCarImageUrlOrPlaceholder } from '@/assets/car-images';
import { isPixelUIEnabled } from '@/ui/internal/ui-style';
import type { DeepReadonly } from '@/utils/types';

/**
 * UI creation utilities for the Garage scene.
 * Extracted from GarageScene to reduce file size and improve maintainability.
 */

/**
 * Create a car card UI element with appropriate buttons based on context.
 * @param car - The car to display
 * @param context - 'inventory' or 'collection' to determine which buttons to show
 * @param callbacks - Callbacks for various car actions
 * @returns Configured car panel element
 */
export function createCarCard(
  car: DeepReadonly<Car>,
  context: 'inventory' | 'collection',
  callbacks: {
    gameManager: GameManager;
    uiManager: UIManager;
    onRestore: (carId: string) => void;
    onSell: (carId: string) => void;
    onSellAsIs: (carId: string) => void;
    onRefresh: () => void;
    getCarById: typeof getCarById;
  }
): HTMLDivElement {
  const { gameManager, uiManager, onRestore, onSell, onSellAsIs, onRefresh, getCarById } = callbacks;

  const compactButtonStyle: Partial<CSSStyleDeclaration> = {
    padding: '8px 12px',
    fontSize: '12px',
    borderRadius: '8px',
  };

  const carPanel = uiManager.createPanel({
    margin: '0',
    padding: '14px',
    backgroundColor:
      context === 'inventory' ? 'rgba(52, 73, 94, 0.6)' : 'rgba(243, 156, 18, 0.1)',
    border: context === 'collection' ? '2px solid #f39c12' : undefined,
  });

  carPanel.classList.add('garage-car-card');

  const carName = uiManager.createHeading(car.name, 3, {
    color: context === 'collection' ? '#f39c12' : undefined,
    margin: '0 0 6px 0',
    fontSize: '18px',
  });

  const salePrice = Economy.getSalePrice(car, gameManager);

  const metaText = uiManager.createText(
    `Tier ${car.tier} · Cond ${car.condition}/100 · Value ${formatCurrency(salePrice)}`,
    { margin: '0', fontSize: '13px', lineHeight: '1.35', opacity: '0.95' }
  );

  const purchasePrice = car.purchasePrice;
  const restorationSpent = car.restorationSpent ?? 0;
  const profitText = (() => {
    if (purchasePrice === undefined) {
      return `Paid — · Spent ${formatCurrency(restorationSpent)} · Est. profit —`;
    }

    const profit = Economy.calculateProfit(purchasePrice, restorationSpent, salePrice);
    return `Paid ${formatCurrency(purchasePrice)} · Spent ${formatCurrency(restorationSpent)} · Est. profit ${formatCurrency(profit)}`;
  })();

  const profitMetaText = uiManager.createText(profitText, {
    margin: '4px 0 0 0',
    fontSize: '12px',
    lineHeight: '1.35',
    opacity: '0.9',
  });

  const templateId = car.templateId ?? (getCarById(car.id) ? car.id : undefined);
  const imageUrl = getCarImageUrlOrPlaceholder(templateId);

  const img = document.createElement('img');
  img.src = imageUrl;
  img.alt = car.name;
  img.loading = 'lazy';
  img.style.width = '100%';
  img.style.height = '120px';
  img.style.objectFit = 'cover';
  img.style.borderRadius = isPixelUIEnabled() ? '0px' : '10px';
  img.style.border = '2px solid rgba(255,255,255,0.2)';
  img.style.backgroundColor = 'rgba(0,0,0,0.2)';
  img.style.imageRendering = isPixelUIEnabled() ? 'pixelated' : 'auto';
  img.style.margin = '0 0 10px 0';
  carPanel.appendChild(img);

  carPanel.appendChild(carName);
  carPanel.appendChild(metaText);
  if (context === 'inventory') {
    carPanel.appendChild(profitMetaText);
  }

  if (context === 'collection') {
    const carTags = uiManager.createText(`Tags: ${car.tags.join(', ')}`, {
      fontSize: '12px',
      color: '#bdc3c7',
      margin: '6px 0 0 0',
      lineHeight: '1.35',
    });
    carPanel.appendChild(carTags);
  }

  if (context === 'inventory') {
    const buttonContainer = uiManager.createButtonContainer({
      marginTop: '10px',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: '8px',
    });
    buttonContainer.classList.add('garage-card-actions');

    const restoreBtn = uiManager.createButton('Restore', () => onRestore(car.id), {
      style: compactButtonStyle,
    });
    restoreBtn.dataset.tutorialTarget = 'garage.restore';
    buttonContainer.appendChild(restoreBtn);

    const isCollectionEligible = gameManager.isCollectionEligible(car);
    const isInCollection = car.inCollection === true;

    if (isCollectionEligible) {
      const collectionBtn = uiManager.createButton(
        isInCollection ? '✓ In Collection' : 'Add to Collection',
        () => {
          const result = gameManager.toggleCollectionStatus(car.id);
          if (result.success) {
            onRefresh();
          } else {
            uiManager.showInfo('Cannot Add', result.message);
          }
        },
        {
          variant: isInCollection ? 'special' : undefined,
          style: compactButtonStyle,
        }
      );
      buttonContainer.appendChild(collectionBtn);
    }

    const sellBtn = uiManager.createButton('Sell', () => onSell(car.id), {
      variant: 'success',
      style: compactButtonStyle,
    });
    const sellAsIsBtn = uiManager.createButton('Sell As-Is', () => onSellAsIs(car.id), {
      variant: 'warning',
      style: compactButtonStyle,
    });
    buttonContainer.appendChild(sellBtn);
    buttonContainer.appendChild(sellAsIsBtn);

    carPanel.appendChild(buttonContainer);

    // Show eligibility message if not collection-eligible
    if (!isCollectionEligible) {
      const notEligibleText = uiManager.createText(
        `Requires 80%+ condition to add to collection (currently ${car.condition}%)`,
        {
          fontSize: '12px',
          color: '#95a5a6',
          fontStyle: 'italic',
          margin: '6px 0 0 0',
          lineHeight: '1.35',
        }
      );
      carPanel.appendChild(notEligibleText);
    }
  } else {
    // Collection context
    const buttonContainer = uiManager.createButtonContainer({
      marginTop: '10px',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: '8px',
    });
    buttonContainer.classList.add('garage-card-actions');

    const sellBtn = uiManager.createButton('Sell', () => onSell(car.id), {
      variant: 'success',
      style: compactButtonStyle,
    });
    buttonContainer.appendChild(sellBtn);

    const removeBtn = uiManager.createButton(
      'Move to Garage',
      () => {
        const result = gameManager.toggleCollectionStatus(car.id);
        if (result.success) {
          onRefresh();
        } else {
          uiManager.showInfo('Cannot Move', result.message);
        }
      },
      { variant: 'danger', style: compactButtonStyle }
    );
    buttonContainer.appendChild(removeBtn);

    carPanel.appendChild(buttonContainer);
  }

  return carPanel;
}
