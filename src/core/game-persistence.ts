import type { PlayerState, WorldState } from '@/core/game-manager';
import type { MarketFluctuationState } from '@/systems/market-fluctuation-system';
import type { SpecialEventsState } from '@/systems/special-events-system';
import type { TutorialStep } from '@/systems/tutorial-manager';

/** LocalStorage key used for the game's save slot. */
export const SAVE_KEY = 'theCuratorSave';

/** Current save schema version for migration/compat checks. */
export const SAVE_VERSION = '1.1';

function migrateLegacyInventoryFields(inventory: unknown): unknown {
  if (!Array.isArray(inventory)) return inventory;

  return inventory.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const car = item as Record<string, unknown>;

    // Legacy field name from older saves: `displayInMuseum`.
    const hasLegacyDisplayFlag = typeof car.displayInMuseum === 'boolean';
    const hasNewInCollectionFlag = typeof car.inCollection === 'boolean';

    if (hasLegacyDisplayFlag && !hasNewInCollectionFlag) {
      const { displayInMuseum, ...rest } = car;
      return {
        ...rest,
        inCollection: displayInMuseum,
      };
    }

    // Strip legacy field to avoid confusion going forward.
    if ('displayInMuseum' in car) {
      const { displayInMuseum: _legacy, ...rest } = car;
      return rest;
    }

    return item;
  });
}

function migrateLegacyPlayerFields(player: unknown): unknown {
  if (!player || typeof player !== 'object') return player;

  const obj = player as Record<string, unknown>;
  const migrated: Record<string, unknown> = { ...obj };

  if ('inventory' in migrated) {
    migrated.inventory = migrateLegacyInventoryFields(migrated.inventory);
  }

  // Legacy field name (pre-sets rename): `claimedCollections`.
  // Normalize to `claimedSets` and strip the legacy key.
  const hasClaimedSets = Array.isArray(migrated.claimedSets);
  const hasClaimedCollections = Array.isArray(migrated.claimedCollections);

  if (!hasClaimedSets && hasClaimedCollections) {
    migrated.claimedSets = migrated.claimedCollections;
  }

  if ('claimedCollections' in migrated) {
    delete migrated.claimedCollections;
  }

  return migrated;
}

/**
 * Saved game data structure.
 * Note: `Set` fields are serialized as arrays for persistence.
 */
export interface SavedGameData {
  player: Omit<PlayerState, 'visitedLocations' | 'claimedSets'> & {
    visitedLocations?: string[];
    claimedSets?: string[];
    /** Legacy field name (pre-sets rename). */
    claimedCollections?: string[];
  };
  world: WorldState;
  market?: MarketFluctuationState;
  specialEvents?: SpecialEventsState;
  tutorial?: { currentStep: TutorialStep; isActive: boolean };
  version: string;
}

/**
 * Builds a serializable save payload from the current runtime state.
 * Converts `Set` fields to arrays for JSON persistence.
 */
export function buildSaveData(params: {
  player: PlayerState;
  world: WorldState;
  market?: MarketFluctuationState;
  specialEvents?: SpecialEventsState;
  tutorial?: { currentStep: TutorialStep; isActive: boolean };
}): SavedGameData {
  const { player, world, market, specialEvents, tutorial } = params;

  return {
    player: {
      ...player,
      visitedLocations: Array.from(player.visitedLocations),
      claimedSets: Array.from(player.claimedSets),
    },
    world,
    market,
    specialEvents,
    tutorial,
    version: SAVE_VERSION,
  };
}

/** Writes a save snapshot to localStorage under SAVE_KEY. */
export function writeSaveData(saveData: SavedGameData): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
}

/**
 * Reads, validates, and migrates saved game data from localStorage.
 * Returns null when no save exists or the save is invalid/unsupported.
 */
export function readSaveData(): SavedGameData | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;

  try {
    const parsedJson = JSON.parse(raw) as unknown;
    const migrated = migrateSaveData(parsedJson);
    if (!migrated) {
      const maybeVersion =
        parsedJson && typeof parsedJson === 'object'
          ? (parsedJson as Record<string, unknown>).version
          : undefined;
      const versionLabel = typeof maybeVersion === 'string' ? maybeVersion : 'missing/invalid';
      console.warn(`Save rejected: unsupported or invalid version (${versionLabel}).`);
      return null;
    }

    if (!migrated.player || !migrated.world) {
      console.warn('Save rejected: missing required fields (player/world).');
      return null;
    }

    return migrated;
  } catch (error) {
    console.warn('Save rejected: invalid JSON.', error);
    return null;
  }
}

/**
 * Attempt to migrate parsed save data to the current SAVE_VERSION.
 *
 * Rules:
 * - Missing version: treat as legacy and upgrade to current.
 * - Unknown version: return null (caller should start fresh).
 */
export function migrateSaveData(parsed: unknown): SavedGameData | null {
  if (!parsed || typeof parsed !== 'object') return null;

  const obj = parsed as Record<string, unknown>;
  const version = obj.version;

  // Legacy saves (pre-versioning): accept, migrate, and stamp current.
  if (version === undefined || version === null) {
    const legacy = obj as unknown as SavedGameData;
    const migratedPlayer = migrateLegacyPlayerFields(legacy.player);

    return {
      ...legacy,
      player: migratedPlayer as SavedGameData['player'],
      version: SAVE_VERSION,
    };
  }

  if (typeof version !== 'string') return null;
  if (version === SAVE_VERSION) return obj as unknown as SavedGameData;

  // Future-proofing: add explicit migrations here when SAVE_VERSION changes.
  switch (version) {
    case '1.0': {
      const v1 = obj as unknown as SavedGameData;
      const migratedPlayer = migrateLegacyPlayerFields(v1.player);

      return {
        ...v1,
        player: migratedPlayer as SavedGameData['player'],
        version: SAVE_VERSION,
      };
    }
    default:
      return null;
  }
}

/** Parses a raw JSON string into valid, migrated save data (or null). */
export function tryParseSaveData(raw: string): SavedGameData | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const migrated = migrateSaveData(parsed);
    if (!migrated) return null;

    if (!migrated.player || !migrated.world) return null;

    return migrated;
  } catch {
    return null;
  }
}

/**
 * Hydrates validated save data back into runtime state.
 * Reconstructs `Set` fields and applies defaults for missing values.
 */
export function hydrateLoadedState(saveData: SavedGameData): {
  player: PlayerState;
  world: WorldState;
  market?: MarketFluctuationState;
  specialEvents?: SpecialEventsState;
  tutorial?: { currentStep: TutorialStep; isActive: boolean };
} {
  const rawPlayer = migrateLegacyPlayerFields(saveData.player) as unknown as Partial<PlayerState> & {
    visitedLocations?: string[];
    claimedSets?: string[];
  };

  const player: PlayerState = {
    money: rawPlayer.money ?? 0,
    inventory: Array.isArray(rawPlayer.inventory)
      ? (migrateLegacyInventoryFields(rawPlayer.inventory) as PlayerState['inventory'])
      : [],
    garageSlots: rawPlayer.garageSlots ?? 1,
    prestige: rawPlayer.prestige ?? 0,
    bankLoanTaken: rawPlayer.bankLoanTaken ?? false,
    skills: rawPlayer.skills ?? { eye: 1, tongue: 1, network: 1 },
    skillXP: rawPlayer.skillXP ?? { eye: 0, tongue: 0, network: 0 },
    visitedLocations: new Set(rawPlayer.visitedLocations ?? ['garage']),
    claimedSets: new Set(rawPlayer.claimedSets ?? []),
  };

  const rawWorld = saveData.world as unknown as Partial<WorldState>;
  const world: WorldState = {
    day: rawWorld.day ?? 1,
    currentAP: rawWorld.currentAP ?? 0,
    currentLocation: rawWorld.currentLocation ?? 'garage',
    carOfferByLocation: rawWorld.carOfferByLocation ?? {},
    rivalPresenceByLocation: rawWorld.rivalPresenceByLocation ?? {},
    dayStats:
      rawWorld.dayStats ??
      ({
        carsAcquired: 0,
        moneyEarned: 0,
        moneySpent: 0,
        prestigeGained: 0,
      } satisfies WorldState['dayStats']),
  };

  return {
    player,
    world,
    market: saveData.market,
    specialEvents: saveData.specialEvents,
    tutorial: saveData.tutorial,
  };
}
