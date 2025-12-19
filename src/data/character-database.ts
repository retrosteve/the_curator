import { normalizeCharacterKey } from '@/utils/character-key';
import { RivalDatabase } from '@/data/rival-database';

export type CharacterKind = 'mentor' | 'rival' | 'specialist' | 'contact';

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

export const CHEAP_CHARLIE_PROFILE: CharacterProfile = {
  id: 'cheap_charlie',
  name: 'Cheap Charlie',
  kind: 'specialist',
  bio: "A disheveled man with a mischievous grin, holding a rusty wrench and a roll of duct tape. He's your go-to guy for a quick, budget-friendly fix.",
};

export const ARTISAN_PROFILE: CharacterProfile = {
  id: 'the_artisan',
  name: 'The Artisan',
  kind: 'specialist',
  bio: 'A refined older man with a well-groomed beard and a leather apron. He holds a small hammer and a piece of polished trim, representing his dedication to high-end craftsmanship.',
};

export const PRESTON_BANKS_PROFILE: CharacterProfile = {
  id: 'preston_banks',
  name: 'Preston Banks',
  kind: 'contact',
  bio: 'A polished private financier who offers “friendly” short-term loans to keep deals moving. Professional, calm, and always aware of what you can afford.',
};

export function getAllCharacterProfiles(): CharacterProfile[] {
  const specialists: CharacterProfile[] = [CHEAP_CHARLIE_PROFILE, ARTISAN_PROFILE]
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const contacts: CharacterProfile[] = [PRESTON_BANKS_PROFILE]
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const rivals = RivalDatabase
    .map<CharacterProfile>((rival) => ({
      id: rival.id,
      name: rival.name,
      kind: 'rival',
      bio: rival.bio,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [UNCLE_RAY_PROFILE, ...contacts, ...specialists, ...rivals];
}

export function getCharacterProfileByName(name: string): CharacterProfile | undefined {
  const key = normalizeCharacterKey(name);

  if (key === normalizeCharacterKey(UNCLE_RAY_PROFILE.name)) {
    return UNCLE_RAY_PROFILE;
  }

  if (key === normalizeCharacterKey(CHEAP_CHARLIE_PROFILE.name)) {
    return CHEAP_CHARLIE_PROFILE;
  }

  if (key === normalizeCharacterKey(ARTISAN_PROFILE.name)) {
    return ARTISAN_PROFILE;
  }

  if (key === normalizeCharacterKey(PRESTON_BANKS_PROFILE.name)) {
    return PRESTON_BANKS_PROFILE;
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
