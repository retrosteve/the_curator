import { Economy } from '@/systems/Economy';
import type { GameManager } from '@/core/game-manager';
import type { UIManager } from '@/ui/ui-manager';
import type { TutorialManager } from '@/systems/tutorial-manager';
import { formatCurrency } from '@/utils/format';
import { GAME_CONFIG } from '@/config/game-config';

/**
 * Handles car management operations (sell, sell as-is) for the Garage scene.
 * Extracted from GarageScene to reduce file size and improve maintainability.
 */

/**
 * Sell a car at full market value.
 */
export function sellCar(
  carId: string,
  context: {
    gameManager: GameManager;
    uiManager: UIManager;
    tutorialManager: TutorialManager;
    onShowInventory: () => void;
    onShowTutorialBlockedModal: (message: string) => void;
  }
): void {
  const { gameManager, uiManager, tutorialManager, onShowInventory, onShowTutorialBlockedModal } = context;

  if (!tutorialManager.isSideActionAllowed('sell-car')) {
    onShowTutorialBlockedModal(tutorialManager.getSideActionBlockedMessage('sell-car'));
    return;
  }

  const car = gameManager.getCar(carId);
  if (!car) return;

  const salePrice = Economy.getSalePrice(car, gameManager);

  uiManager.confirmAction(
    'Sell Car',
    `Sell ${car.name} for ${formatCurrency(salePrice)}?`,
    () => {
      gameManager.addMoney(salePrice);
      gameManager.removeCar(carId);
      uiManager.showFloatingMoney(salePrice, true);

      tutorialManager.onFirstTutorialCarSold();

      onShowInventory();
    },
    onShowInventory,
    { confirmText: 'Sell', confirmVariant: 'success' }
  );
}

/**
 * Quick sell a car for 70% of market value.
 */
export function sellCarAsIs(
  carId: string,
  context: {
    gameManager: GameManager;
    uiManager: UIManager;
    tutorialManager: TutorialManager;
    onShowInventory: () => void;
    onShowTutorialBlockedModal: (message: string) => void;
  }
): void {
  const { gameManager, uiManager, tutorialManager, onShowInventory, onShowTutorialBlockedModal } = context;

  if (!tutorialManager.isSideActionAllowed('sell-car')) {
    onShowTutorialBlockedModal(tutorialManager.getSideActionBlockedMessage('sell-car'));
    return;
  }

  const car = gameManager.getCar(carId);
  if (!car) return;

  const salePrice = Math.floor(
    Economy.getSalePrice(car, gameManager) * GAME_CONFIG.economy.sellAsIsMultiplier
  );

  uiManager.confirmAction(
    'Sell As-Is',
    `Quick sell ${car.name} for ${formatCurrency(salePrice)}? (70% Value)`,
    () => {
      gameManager.addMoney(salePrice);
      gameManager.removeCar(carId);
      uiManager.showFloatingMoney(salePrice, true);
      onShowInventory();
    },
    onShowInventory,
    { confirmText: 'Sell', confirmVariant: 'warning' }
  );
}
