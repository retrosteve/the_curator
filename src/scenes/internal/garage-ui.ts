import type { Car } from '@/data/car-database';
import { Economy } from '@/systems/Economy';
import type { GameManager } from '@/core/game-manager';
import type { UIManager } from '@/ui/ui-manager';
import { formatCurrency } from '@/utils/format';
import type { DeepReadonly } from '@/utils/types';
import { createCarCardPreset } from '@/ui/internal/ui-car-card';

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
  }
): HTMLDivElement {
  const { gameManager, uiManager, onRestore, onSell, onSellAsIs, onRefresh } = callbacks;

  const compactButtonStyle: Partial<CSSStyleDeclaration> = {
    padding: '8px 12px',
    fontSize: '12px',
    borderRadius: '8px',
  };

  const { panel: carPanel, body } = createCarCardPreset(
    car as unknown as Car,
    context === 'collection' ? 'collection' : 'standard'
  );

  const salePrice = Economy.getSalePrice(car, gameManager);

  const metaText = uiManager.createText(
    `Tier: ${car.tier} · Cond ${car.condition}/100 · Value ${formatCurrency(salePrice)}`,
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

  body.appendChild(metaText);
  if (context === 'inventory') {
    body.appendChild(profitMetaText);
  }

  if (context === 'collection') {
    const carTags = uiManager.createText(`Tags: ${car.tags.join(', ')}`, {
      fontSize: '12px',
      color: '#bdc3c7',
      margin: '6px 0 0 0',
      lineHeight: '1.35',
    });
    body.appendChild(carTags);
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

    body.appendChild(buttonContainer);

    // Show eligibility message if not collection-eligible
    if (!isCollectionEligible) {
      const notEligibleText = uiManager.createText(
        `Requires 75%+ condition to add to collection (currently ${car.condition}%)`,
        {
          fontSize: '12px',
          color: '#95a5a6',
          fontStyle: 'italic',
          margin: '6px 0 0 0',
          lineHeight: '1.35',
        }
      );
      body.appendChild(notEligibleText);
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

    body.appendChild(buttonContainer);
  }

  return carPanel;
}
