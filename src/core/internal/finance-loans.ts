import type { FinanceLoan, PlayerState } from '@/core/game-types';

export function canTakeBankLoan(player: PlayerState): boolean {
  return player.bankLoanTaken !== true;
}

export function canTakePrestonLoan(player: PlayerState): boolean {
  return player.activeLoan === null;
}

export function calculatePrestonLoanTerms(params: {
  principal: number;
  feeRate: number;
}): { principal: number; fee: number; totalDue: number } {
  const principal = params.principal;
  const feeRaw = principal * params.feeRate;
  // Keep fees tidy for UI (round to nearest 100).
  const fee = Math.max(0, Math.round(feeRaw / 100) * 100);

  return { principal, fee, totalDue: principal + fee };
}

export function calculateTotalDue(loan: FinanceLoan): number {
  return loan.principal + loan.fee;
}

export function canRepayLoan(player: PlayerState, loan: FinanceLoan): boolean {
  return player.money >= calculateTotalDue(loan);
}
