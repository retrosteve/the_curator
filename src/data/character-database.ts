import { normalizeCharacterKey } from '@/utils/character-key';
import { RivalDatabase } from '@/data/rival-database';

export type CharacterKind = 'mentor' | 'rival';

export interface CharacterProfile {
  id: string;
  name: string;
  kind: CharacterKind;
  bio: string;
}

export const UNCLE_RAY_PROFILE: CharacterProfile = {
  id: 'uncle_ray',
  name: 'Uncle Ray',
  kind: 'mentor',
  bio: "A gruff-but-warm mentor who’s seen every hustle in the car world and wants you to learn without getting crushed; practical, protective, and fond of plainspoken advice with a sly sense of humor.",
};

export function getAllCharacterProfiles(): CharacterProfile[] {
  const rivals = RivalDatabase
    .map<CharacterProfile>((rival) => ({
      id: rival.id,
      name: rival.name,
      kind: 'rival',
      bio: rival.bio,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [UNCLE_RAY_PROFILE, ...rivals];
}

export function getCharacterProfileByName(name: string): CharacterProfile | undefined {
  const key = normalizeCharacterKey(name);

  if (key === normalizeCharacterKey(UNCLE_RAY_PROFILE.name)) {
    return UNCLE_RAY_PROFILE;
  }

  const rival = RivalDatabase.find((r) => normalizeCharacterKey(r.name) === key);
  if (!rival) return undefined;

  return {
    id: rival.id,
    name: rival.name,
    kind: 'rival',
    bio: rival.bio,
  };
}

export function getCharacterBioByName(name: string): string | undefined {
  return getCharacterProfileByName(name)?.bio;
}
