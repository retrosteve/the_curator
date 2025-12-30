import type { GameManager } from '@/core/game-manager';
import type { Car } from '@/data/car-database';
import type { UIManager } from '@/ui/ui-manager';
import type { DeepReadonly } from '@/utils/types';

/**
 * Collection view panel (Sets progress + Collection Vehicles list).
 * Extracted from GarageScene to reduce file size and keep UI code cohesive.
 */
export function createGarageCollectionPanel(context: {
  gameManager: GameManager;
  uiManager: UIManager;
  createCarCard: (car: DeepReadonly<Car>) => HTMLDivElement;
  onBack: () => void;
}): HTMLDivElement {
  const { gameManager, uiManager, createCarCard, onBack } = context;

  const collectionCars = gameManager.getCollectionCars();
  const collectionPrestigeInfo = gameManager.getCollectionPrestigeInfo();
  const player = gameManager.getPlayerState();

  const panel = uiManager.createPanel({
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    minWidth: '700px',
    maxHeight: '80%',
    overflowY: 'auto',
  });

  const heading = uiManager.createHeading('Your Collection', 2, {
    textAlign: 'center',
    color: '#f39c12',
  });
  panel.appendChild(heading);

  // Collection stats - count eligible cars (condition >= 75%)
  const eligibleCars = player.inventory.filter((car) => gameManager.isCollectionEligible(car));
  const collectionSlots = gameManager.getCollectionSlots();
  const statsText = uiManager.createText(
    `In Collection: ${collectionCars.length}/${collectionSlots} | Eligible: ${eligibleCars.length} | Daily Prestige Bonus: +${collectionPrestigeInfo.totalPerDay}`,
    { textAlign: 'center', fontWeight: 'bold', marginBottom: '10px' }
  );
  panel.appendChild(statsText);

  const infoText = uiManager.createText(
    'Quality Tiers: Good (75-89%) = +1/day | Excellent (90-99%) = +2/day | Perfect (100%) = +4/day',
    { textAlign: 'center', fontSize: '13px', color: '#95a5a6', marginBottom: '20px' }
  );
  panel.appendChild(infoText);

  // Sets progress
  const collections = gameManager.getAllSetsProgress();
  if (collections.length > 0) {
    const collectionsHeading = uiManager.createHeading('📚 Sets', 3, {
      marginTop: '20px',
      marginBottom: '10px',
    });
    panel.appendChild(collectionsHeading);

    collections.forEach((collection) => {
      const collectionCard = document.createElement('div');
      collectionCard.style.cssText = `
          background: ${
            collection.isComplete
              ? 'linear-gradient(145deg, rgba(46, 204, 113, 0.2), rgba(39, 174, 96, 0.2))'
              : 'rgba(255,255,255,0.05)'
          };
          border: 2px solid ${collection.isComplete ? '#2ecc71' : 'rgba(100, 200, 255, 0.2)'};
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        `;

      const leftSide = document.createElement('div');

      const leftTitle = document.createElement('div');
      leftTitle.style.cssText = 'font-size: 18px; margin-bottom: 4px;';
      leftTitle.textContent = `${collection.icon} ${collection.name}`;
      leftSide.appendChild(leftTitle);

      const leftDescription = document.createElement('div');
      leftDescription.style.cssText = 'font-size: 12px; color: #95a5a6;';
      leftDescription.textContent = collection.description;
      leftSide.appendChild(leftDescription);

      const rightSide = document.createElement('div');
      rightSide.style.cssText = 'text-align: right;';

      const statusIcon = collection.isClaimed ? '✅' : collection.isComplete ? '🎁' : '⬜';
      const statusText = collection.isClaimed
        ? 'Completed!'
        : collection.isComplete
          ? 'Ready to Claim!'
          : `${collection.current}/${collection.required}`;

      const statusLine = document.createElement('div');
      statusLine.style.cssText = `font-size: 16px; font-weight: bold; color: ${
        collection.isClaimed ? '#2ecc71' : collection.isComplete ? '#f39c12' : '#64b5f6'
      };`;
      statusLine.textContent = `${statusIcon} ${statusText}`;
      rightSide.appendChild(statusLine);

      const rewardLine = document.createElement('div');
      rewardLine.style.cssText = 'font-size: 12px; color: #95a5a6; margin-top: 4px;';
      rewardLine.textContent = `Reward: +${collection.prestigeReward} Prestige`;
      rightSide.appendChild(rewardLine);

      collectionCard.appendChild(leftSide);
      collectionCard.appendChild(rightSide);
      panel.appendChild(collectionCard);
    });
  }

  // Collection Cars heading
  const collectionHeading = uiManager.createHeading('🏛️ Collection Vehicles', 3, {
    marginTop: '20px',
    marginBottom: '10px',
  });
  panel.appendChild(collectionHeading);

  if (collectionCars.length === 0) {
    const emptyText = uiManager.createText(
      'No cars in your collection yet. Restore cars to good condition (75%+) and add them from your garage!',
      { textAlign: 'center', fontSize: '16px', color: '#7f8c8d' }
    );
    panel.appendChild(emptyText);
  } else {
    collectionCars.forEach((car) => {
      const qualityTier = gameManager.getCollectionQualityTier(car.condition);
      const carPanel = createCarCard(car);

      // Add quality tier badge to card
      const tierBadge = document.createElement('div');
      tierBadge.style.cssText = `
          position: absolute;
          top: 10px;
          right: 10px;
          background: ${qualityTier.color};
          color: #fff;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: bold;
        `;
      tierBadge.textContent = `${qualityTier.tier}: +${qualityTier.prestigePerDay}/day`;
      carPanel.style.position = 'relative';
      carPanel.appendChild(tierBadge);

      panel.appendChild(carPanel);
    });
  }

  // Back button
  const backBtn = uiManager.createButton('Back to Garage', onBack, { style: { marginTop: '20px' } });
  backBtn.dataset.tutorialTarget = 'garage.back';
  panel.appendChild(backBtn);

  return panel;
}
