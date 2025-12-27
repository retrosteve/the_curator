import type { Car } from '@/data/car-database';
import { Economy } from '@/systems/Economy';
import type { GameManager } from '@/core/game-manager';
import type { UIManager } from '@/ui/ui-manager';
import type { TimeSystem } from '@/systems/time-system';
import type { TutorialManager } from '@/systems/tutorial-manager';
import { formatCurrency } from '@/utils/format';
import { getCharacterPortraitUrlOrPlaceholder } from '@/assets/character-portraits';

/**
 * Handles restoration workflow logic for the Garage scene.
 * Extracted from GarageScene to reduce file size and improve maintainability.
 */

/**
 * Show restoration challenges that must be completed before standard restoration.
 */
export function showRestorationChallenges(
  car: Car,
  challenges: ReturnType<typeof Economy.getRestorationChallenges>,
  context: {
    gameManager: GameManager;
    uiManager: UIManager;
    timeSystem: TimeSystem;
    onShowInventory: () => void;
    onRestoreCar: (carId: string) => void;
  }
): void {
  const { gameManager, uiManager, onShowInventory, onRestoreCar } = context;

  // Build plain text message with proper formatting
  let message = '⚠️ RESTORATION BLOCKED\n\n';
  message += 'This car requires special treatment before standard restoration can begin.\n\n';
  message += '━━━━━━━━━━━━━━━━━━━━━━\n\n';

  challenges.forEach((challenge, index) => {
    message += `${challenge.name}\n`;
    message += `${challenge.description}\n\n`;
    message += `💰 Cost: ${formatCurrency(challenge.cost)}\n`;

    if (index < challenges.length - 1) {
      message += '\n━━━━━━━━━━━━━━━━━━━━━━\n\n';
    }
  });

  const buttons = challenges.map((challenge) => ({
    text: `Fix: ${challenge.name}`,
    onClick: () => {
      if (gameManager.spendMoney(challenge.cost)) {
        const fixedCar = Economy.completeRestorationChallenge(car, challenge);
        gameManager.updateCar({
          ...fixedCar,
          restorationSpent: (car.restorationSpent ?? 0) + challenge.cost,
        });

        uiManager.showModal(
          '✅ Challenge Complete!',
          `${challenge.name} completed successfully!\n\nThe car is now ready for standard restoration.`,
          [{ text: 'Continue', onClick: () => onRestoreCar(car.id) }]
        );
      } else {
        uiManager.showInsufficientFundsModal();
      }
    },
  }));

  buttons.push({
    text: 'Cancel',
    onClick: onShowInventory,
  });

  uiManager.showModal('🔧 Restoration Challenges', message, buttons);
}

/**
 * Show standard restoration options.
 */
export function showRestorationOptions(
  car: Car,
  context: {
    gameManager: GameManager;
    uiManager: UIManager;
    timeSystem: TimeSystem;
    tutorialManager: TutorialManager;
    onShowInventory: () => void;
  }
): void {
  const { gameManager, uiManager, tutorialManager, onShowInventory } = context;

  const options = Economy.getRestorationOptions(car);

  // Calculate profit preview for each option
  const currentValue = Economy.getSalePrice(car, gameManager);

  const modalOptions = options.map((opt) => {
    // Simulate restoration result
    const simulatedCar = { ...car, condition: Math.min(100, car.condition + opt.conditionGain) };
    const futureValue = Economy.getSalePrice(simulatedCar, gameManager);
    const valueIncrease = futureValue - currentValue;
    const netProfit = valueIncrease - opt.cost;

    return {
      name: opt.name,
      cost: opt.cost,
      description: opt.description,
      conditionGain: opt.conditionGain,
      valueIncrease,
      netProfit,
      risk: opt.risk,
      portraitUrl: getCharacterPortraitUrlOrPlaceholder(
        opt.specialist === 'Charlie' ? 'Cheap Charlie' : 'The Artisan'
      ),
      portraitAlt: opt.specialist === 'Charlie' ? 'Cheap Charlie' : 'The Artisan',
      onClick: () => {
        if (gameManager.spendMoney(opt.cost)) {
          // Tutorial override: first restoration always succeeds (ignore Cheap Charlie risk)
          const isTutorialFirstRestore = tutorialManager.shouldForceFirstRestorationSuccess();
          const result = Economy.performRestoration(car, opt, isTutorialFirstRestore);
          gameManager.updateCar({
            ...result.car,
            restorationSpent: (car.restorationSpent ?? 0) + opt.cost,
          });

          const specialistName = opt.specialist === 'Charlie' ? 'Cheap Charlie' : 'The Artisan';
          const backgroundColor = result.success
            ? opt.specialist === 'Charlie'
              ? 'rgba(96, 125, 139, 0.95)'
              : 'rgba(39, 174, 96, 0.95)'
            : 'rgba(230, 126, 34, 0.95)';
          uiManager.showCharacterToast(specialistName, result.message, { backgroundColor });

          // Show discovery message if found
          if (result.discovery) {
            const discoveryIcon = result.discovery.type === 'positive' ? '💎' : '⚠️';
            const discoveryName = result.discovery.name;
            const valueChange = result.discovery.valueChange;

            setTimeout(() => {
              uiManager.showCharacterModal(
                specialistName,
                `${discoveryIcon} Hidden Discovery!`,
                result.message +
                  `\n\n${discoveryName}\nValue change: ${formatCurrency(Math.abs(valueChange))}`,
                [
                  {
                    text: 'Continue',
                    onClick: () => {
                      onShowInventory();
                    },
                  },
                ]
              );
            }, 300);
          } else {
            // Normal restoration result
            onShowInventory();
          }

          // Tutorial trigger: advance to first_restore immediately after restoration
          tutorialManager.onFirstTutorialRestorationCompleted();

          // Tutorial: Auto-sell the first car after restoration
          if (tutorialManager.shouldAutoSellAfterFirstRestoration()) {
            onShowInventory();
            // Auto-trigger the sale
            setTimeout(() => {
              const restoredCar = gameManager.getCar(car.id);
              if (restoredCar) {
                const salePrice = Economy.getSalePrice(restoredCar, gameManager);
                uiManager.showModal(
                  'Tutorial: Your First Sale',
                  `An NPC buyer saw your ${restoredCar.name} and wants to buy it immediately for ${formatCurrency(salePrice)}!\n\nThis is how you flip cars for profit: Buy low, restore, sell high.`,
                  [
                    {
                      text: 'Sell to Buyer',
                      onClick: () => {
                        gameManager.addMoney(salePrice);
                        gameManager.removeCar(car.id);
                        tutorialManager.onFirstTutorialCarSold();

                        // Show next tutorial guidance
                        setTimeout(() => {
                          tutorialManager.showDialogueWithCallback(
                            'Uncle Ray',
                            `Great work! You've completed your first car deal and made a profit.\n\nNow let's try something more challenging. Click "Explore Map", then visit the Auction House. You'll face competition from other collectors there.`,
                            onShowInventory
                          );
                        }, 300);
                      },
                    },
                  ]
                );
              }
            }, 500);
          } else {
            onShowInventory();
          }
        } else {
          uiManager.showInsufficientFundsModal();
        }
      },
    };
  });

  uiManager.showRestorationModal(car.name, car.condition, modalOptions, onShowInventory);
}
