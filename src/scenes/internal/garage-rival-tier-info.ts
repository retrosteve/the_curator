import type { GameManager } from '@/core/game-manager';
import type { UIManager } from '@/ui/ui-manager';

/**
 * Rival tiers info panel.
 * Extracted from GarageScene to keep scene size manageable.
 */
export function createGarageRivalTierInfoPanel(context: {
  gameManager: GameManager;
  uiManager: UIManager;
  onBack: () => void;
}): HTMLDivElement {
  const { gameManager, uiManager, onBack } = context;

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

  const heading = uiManager.createHeading('Rival Tier Progression', 2, {
    textAlign: 'center',
    color: '#3498db',
  });
  panel.appendChild(heading);

  const introText = uiManager.createText(
    `As you gain prestige, you'll face tougher rivals in auctions. Your current prestige: ${player.prestige}`,
    { textAlign: 'center', marginBottom: '20px', fontSize: '16px' }
  );
  panel.appendChild(introText);

  // Tier 3 - Scrappers (Early Game)
  const tier3Panel = uiManager.createPanel({
    margin: '15px 0',
    backgroundColor: player.prestige < 50 ? 'rgba(46, 204, 113, 0.2)' : 'rgba(127, 140, 141, 0.1)',
    border: player.prestige < 50 ? '2px solid #2ecc71' : '1px solid #7f8c8d',
  });

  const tier3Name = uiManager.createHeading('Tier 3: Scrappers', 3, {
    color: player.prestige < 50 ? '#2ecc71' : '#7f8c8d',
  });
  const tier3Details = uiManager.createText(
    `Prestige Range: 0-49 ${player.prestige < 50 ? '(CURRENT)' : ''}\n` +
      `Difficulty: ★☆☆☆☆ (Easiest)\n` +
      `Budget: Low ($2,000-$5,000)\n` +
      `Tactics: Simple bidding, easy to outmaneuver`,
    { fontSize: '14px', whiteSpace: 'pre-line' }
  );
  tier3Panel.appendChild(tier3Name);
  tier3Panel.appendChild(tier3Details);
  panel.appendChild(tier3Panel);

  // Tier 2 - Enthusiasts (Mid Game)
  const tier2Panel = uiManager.createPanel({
    margin: '15px 0',
    backgroundColor:
      player.prestige >= 50 && player.prestige < 150 ? 'rgba(52, 152, 219, 0.2)' : 'rgba(127, 140, 141, 0.1)',
    border: player.prestige >= 50 && player.prestige < 150 ? '2px solid #3498db' : '1px solid #7f8c8d',
  });

  const tier2Name = uiManager.createHeading('Tier 2: Enthusiasts', 3, {
    color: player.prestige >= 50 && player.prestige < 150 ? '#3498db' : '#7f8c8d',
  });
  const tier2Status = player.prestige < 50 ? '🔒 LOCKED' : player.prestige < 150 ? '(CURRENT)' : '';
  const tier2Details = uiManager.createText(
    `Prestige Range: 50-149 ${tier2Status}\n` +
      `Difficulty: ★★★☆☆ (Medium)\n` +
      `Budget: Medium ($8,000-$15,000)\n` +
      `Tactics: Niche collectors, may overpay for preferred cars`,
    { fontSize: '14px', whiteSpace: 'pre-line' }
  );
  tier2Panel.appendChild(tier2Name);
  tier2Panel.appendChild(tier2Details);
  panel.appendChild(tier2Panel);

  // Tier 1 - Tycoons (Late Game)
  const tier1Panel = uiManager.createPanel({
    margin: '15px 0',
    backgroundColor: player.prestige >= 150 ? 'rgba(231, 76, 60, 0.2)' : 'rgba(127, 140, 141, 0.1)',
    border: player.prestige >= 150 ? '2px solid #e74c3c' : '1px solid #7f8c8d',
  });

  const tier1Name = uiManager.createHeading('Tier 1: Tycoons', 3, {
    color: player.prestige >= 150 ? '#e74c3c' : '#7f8c8d',
  });
  const tier1Status = player.prestige < 150 ? '🔒 LOCKED' : '(CURRENT)';
  const tier1Details = uiManager.createText(
    `Prestige Range: 150+ ${tier1Status}\n` +
      `Difficulty: ★★★★★ (Hardest)\n` +
      `Budget: High ($20,000-$50,000)\n` +
      `Tactics: Deep pockets, strategic bidding, may control Unicorns`,
    { fontSize: '14px', whiteSpace: 'pre-line' }
  );
  tier1Panel.appendChild(tier1Name);
  tier1Panel.appendChild(tier1Details);
  panel.appendChild(tier1Panel);

  const tipText = uiManager.createText(
    '💡 Tip: Use skills like Kick Tires and Stall to reduce rival budgets and patience. Strategy beats pure money!',
    {
      textAlign: 'center',
      fontSize: '14px',
      color: '#f39c12',
      marginTop: '20px',
      fontStyle: 'italic',
    }
  );
  panel.appendChild(tipText);

  const backBtn = uiManager.createButton('Back to Garage', onBack, { style: { marginTop: '20px', width: '100%' } });
  backBtn.dataset.tutorialTarget = 'garage.back';
  panel.appendChild(backBtn);

  return panel;
}
