export type SkillProgressionConfig = {
  maxLevel: number;
  xpPerLevel: Record<number, number> | number[];
};

export function isMaxLevel(config: SkillProgressionConfig, currentLevel: number): boolean {
  return currentLevel >= config.maxLevel;
}

export function getRequiredXPForNextLevel(config: SkillProgressionConfig, currentLevel: number): number {
  if (isMaxLevel(config, currentLevel)) return 0;

  const table = config.xpPerLevel as Record<number, number>;
  const required = table[currentLevel];
  return Number.isFinite(required) ? required : 0;
}

export function computeXPAward(params: {
  currentXP: number;
  amount: number;
  requiredXP: number;
}): { newXP: number; shouldLevelUp: boolean } {
  const newXP = params.currentXP + params.amount;
  return { newXP, shouldLevelUp: params.requiredXP > 0 && newXP >= params.requiredXP };
}

export function isValidXPGain(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0;
}
