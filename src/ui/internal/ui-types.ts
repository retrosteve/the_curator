/**
 * Visual variant for a UI button.
 * @internal Used by UIManager and internal UI modules.
 */
export type ButtonVariant = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'special';

/**
 * HUD skill display payload.
 * @internal Used by UIManager.
 */
export type HUDSkills = {
	eye: number;
	tongue: number;
	network: number;
};

/**
 * HUD garage display payload.
 * @internal Used by UIManager.
 */
export type HUDGarage = {
	used: number;
	total: number;
};

/**
 * HUD victory progress payload.
 * @internal Used by UIManager.
 */
export type HUDVictoryProgress = {
	prestige: { current: number; required: number; met: boolean };
	unicorns: { current: number; required: number; met: boolean };
	collectionCars: { current: number; required: number; met: boolean };
	skillLevel: { current: number; required: number; met: boolean };
	onClickProgress?: () => void;
};

/**
 * HUD data used when creating a fresh HUD.
 * @internal Used by UIManager.
 */
export type HUDData = {
	money: number;
	prestige?: number;
	day: number;
	ap: string;
	location?: string;
	skills?: HUDSkills;
	garage?: HUDGarage;
	dailyRent?: number;
	market?: string;
	collectionPrestige?: {
		totalPerDay: number;
		carCount: number;
	};
	victoryProgress?: HUDVictoryProgress;
};

/**
 * Partial HUD updates.
 * @internal Used by UIManager.
 */
export type HUDUpdate = {
	money?: number;
	prestige?: number;
	skills?: HUDSkills;
	day?: number;
	ap?: string;
	location?: string;
	garage?: HUDGarage;
	market?: string;
	collectionPrestige?: { totalPerDay: number; carCount: number } | null;
	victoryProgress?: Omit<HUDVictoryProgress, 'onClickProgress'> | null;
};
