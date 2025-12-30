import type { GameManager } from '@/core/game-manager';
import type { UIManager } from '@/ui/ui-manager';

/**
 * Victory progress modal logic for the Garage scene.
 * Extracted from GarageScene to reduce file size and improve maintainability.
 */
export function showVictoryProgress(context: { gameManager: GameManager; uiManager: UIManager }): void {
  const { gameManager, uiManager } = context;

  const victoryResult = gameManager.checkVictory();
  const { prestige, unicorns, collectionCars, skillLevel } = victoryResult;
  const world = gameManager.getWorldState();

  // Calculate prestige pace
  const currentDay = world.day;
  const prestigePerDay = currentDay > 1 ? prestige.current / currentDay : 0;
  const daysToVictory =
    prestigePerDay > 0 ? Math.ceil((prestige.required - prestige.current) / prestigePerDay) : 999;

  // Determine pace status
  let paceStatus: 'on-track' | 'slow' | 'stalled';
  let paceColor: string;
  let paceIcon: string;

  if (prestigePerDay >= 20) {
    paceStatus = 'on-track';
    paceColor = '#2ecc71';
    paceIcon = '🚀';
  } else if (prestigePerDay >= 10) {
    paceStatus = 'slow';
    paceColor = '#f39c12';
    paceIcon = '🐢';
  } else {
    paceStatus = 'stalled';
    paceColor = '#e74c3c';
    paceIcon = '⚠️';
  }

  // Create custom modal content with progress bars
  const modalContent = document.createElement('div');
  modalContent.style.cssText = 'padding: 10px;';

  const createProgressRow = (label: string, current: number, required: number, met: boolean) => {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom: 15px;';

    const labelDiv = document.createElement('div');
    labelDiv.style.cssText =
      'display: flex; justify-content: space-between; margin-bottom: 5px; font-weight: bold;';

    const leftLabel = document.createElement('span');
    leftLabel.textContent = `${met ? '✅' : '⬜'} ${label}`;
    labelDiv.appendChild(leftLabel);

    const rightLabel = document.createElement('span');
    rightLabel.textContent = `${current} / ${required}`;
    labelDiv.appendChild(rightLabel);
    row.appendChild(labelDiv);

    const progressBar = document.createElement('div');
    progressBar.style.cssText =
      'width: 100%; height: 20px; background: rgba(0,0,0,0.3); border-radius: 10px; overflow: hidden;';

    const progressFill = document.createElement('div');
    const percentage = Math.min((current / required) * 100, 100);
    const color = met ? '#2ecc71' : percentage >= 75 ? '#f39c12' : '#3498db';
    progressFill.style.cssText = `width: ${percentage}%; height: 100%; background: ${color}; transition: width 0.5s ease;`;

    progressBar.appendChild(progressFill);
    row.appendChild(progressBar);

    return row;
  };

  modalContent.appendChild(createProgressRow('Prestige', prestige.current, prestige.required, prestige.met));
  modalContent.appendChild(
    createProgressRow('Unicorns in Collection', unicorns.current, unicorns.required, unicorns.met)
  );
  modalContent.appendChild(
    createProgressRow(
      'Cars in Collection (75%+)',
      collectionCars.current,
      collectionCars.required,
      collectionCars.met
    )
  );
  modalContent.appendChild(
    createProgressRow('Max Skill Level', skillLevel.current, skillLevel.required, skillLevel.met)
  );

  // Add pace indicator
  const paceDiv = document.createElement('div');
  paceDiv.style.cssText = `margin-top: 20px; padding: 15px; background: rgba(0,0,0,0.3); border-radius: 10px; border-left: 4px solid ${paceColor};`;

  const paceTitle = document.createElement('div');
  paceTitle.style.cssText = 'font-weight: bold; font-size: 16px; margin-bottom: 8px;';
  paceTitle.textContent = `${paceIcon} Prestige Pace: ${paceStatus.toUpperCase().replace('-', ' ')}`;
  paceDiv.appendChild(paceTitle);

  const paceDetails = document.createElement('div');
  paceDetails.style.cssText = 'font-size: 14px; color: #bbb;';

  const rateLine = document.createElement('div');
  rateLine.appendChild(document.createTextNode('• Current Rate: '));
  const rateValue = document.createElement('span');
  rateValue.style.cssText = `color: ${paceColor}; font-weight: bold;`;
  rateValue.textContent = `${prestigePerDay.toFixed(1)} prestige/day`;
  rateLine.appendChild(rateValue);
  paceDetails.appendChild(rateLine);

  const daysPlayedLine = document.createElement('div');
  daysPlayedLine.textContent = `• Days Played: ${currentDay}`;
  paceDetails.appendChild(daysPlayedLine);

  const etaLine = document.createElement('div');
  etaLine.textContent = `• Est. Days to Victory: ${daysToVictory < 999 ? daysToVictory : 'N/A'}`;
  paceDetails.appendChild(etaLine);

  paceDetails.appendChild(document.createElement('br'));

  const tipLine = document.createElement('span');
  tipLine.style.cssText = 'font-size: 12px; font-style: italic;';
  tipLine.textContent =
    paceStatus === 'on-track'
      ? '✓ Great pace! Keep it up!'
      : paceStatus === 'slow'
        ? '⚡ Consider focusing on your collection and sets.'
        : '💡 Tip: Add high-condition cars to your collection for daily prestige.';
  paceDetails.appendChild(tipLine);
  paceDiv.appendChild(paceDetails);
  modalContent.appendChild(paceDiv);

  const statusText = document.createElement('div');
  statusText.style.cssText = `margin-top: 20px; text-align: center; font-weight: bold; font-size: 16px; color: ${victoryResult.hasWon ? '#2ecc71' : '#f39c12'};`;
  statusText.textContent = victoryResult.hasWon
    ? '🎉 ALL CONDITIONS MET! End the day to claim victory!'
    : 'Keep building your sets and collection to achieve victory!';
  modalContent.appendChild(statusText);

  uiManager.showModal('🏆 Victory Progress', modalContent.outerHTML, [{ text: 'Close', onClick: () => {} }]);
}
