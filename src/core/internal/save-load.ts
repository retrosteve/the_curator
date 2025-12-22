import { buildSaveData, hydrateLoadedState, readSaveData, writeSaveData } from '@/core/game-persistence';
import type { PlayerState, WorldState } from '@/core/game-types';

export function writeCurrentGameSave(params: {
  player: PlayerState;
  world: WorldState;
  market?: unknown;
  specialEvents?: unknown;
  tutorial?: unknown;
}): void {
  const saveData = buildSaveData({
    player: params.player,
    world: params.world,
    market: params.market as never,
    specialEvents: params.specialEvents as never,
    tutorial: params.tutorial as never,
  });

  writeSaveData(saveData);
}

export function readAndHydrateCurrentGameSave():
  | (ReturnType<typeof hydrateLoadedState> & {
      rawSave: ReturnType<typeof readSaveData>;
    })
  | null {
  const rawSave = readSaveData();
  if (!rawSave) return null;

  const hydrated = hydrateLoadedState(rawSave);
  return { ...hydrated, rawSave };
}
