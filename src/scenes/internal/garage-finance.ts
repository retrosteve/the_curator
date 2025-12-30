import type { GameManager } from '@/core/game-manager';
import type { UIManager } from '@/ui/ui-manager';
import { formatCurrency } from '@/utils/format';

export function showFinanceModal(context: {
  gameManager: GameManager;
  uiManager: UIManager;
  onReturnToGarage: () => void;
  onReopen: () => void;
}): void {
  const { gameManager, uiManager, onReturnToGarage, onReopen } = context;

  const lenderName = 'Preston Banks';
  const loan = gameManager.getActiveLoan();
  const world = gameManager.getWorldState();

  if (!loan) {
    const terms = gameManager.getPrestonLoanTerms();
    uiManager.showCharacterModal(
      lenderName,
      'Finance',
      `Need liquidity for deals?\n\nTake a short-term loan: +${formatCurrency(terms.principal)}\nRepay anytime: ${formatCurrency(terms.totalDue)} (includes ${formatCurrency(terms.fee)} fee)\n\nRule: Only one active loan at a time.`,
      [
        {
          text: `Take Loan (+${formatCurrency(terms.principal)})`,
          onClick: () => {
            const result = gameManager.takePrestonLoan();
            if (!result.ok) {
              setTimeout(() => {
                uiManager.showInfo('Finance', result.reason);
              }, 0);
              return;
            }

            uiManager.showCharacterToast(
              lenderName,
              `Approved. ${formatCurrency(terms.principal)} transferred. Repay ${formatCurrency(terms.totalDue)} anytime.`
            );
            onReturnToGarage();
          },
        },
        { text: 'Cancel', onClick: () => {} },
      ]
    );
    return;
  }

  const totalDue = loan.principal + loan.fee;
  uiManager.showCharacterModal(
    lenderName,
    'Finance',
    `Active loan:\n\nPrincipal: ${formatCurrency(loan.principal)}\nFee: ${formatCurrency(loan.fee)}\nTotal to repay: ${formatCurrency(totalDue)}\n\nTaken on day: ${loan.takenDay} (today is day ${world.day})`,
    [
      {
        text: `Repay (${formatCurrency(totalDue)})`,
        onClick: () => {
          const repay = gameManager.repayActiveLoan();
          if (!repay.ok) {
            setTimeout(() => {
              uiManager.showInfo(
                'Not Enough Money',
                `${repay.reason}\n\nTotal due: ${formatCurrency(repay.totalDue)}`,
                { onOk: () => onReopen() }
              );
            }, 0);
            return;
          }

          uiManager.showCharacterToast(lenderName, 'Payment received. Pleasure doing business.');
          onReturnToGarage();
        },
      },
      { text: 'Close', onClick: () => {} },
    ]
  );
}
