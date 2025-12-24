export type LocationType = 'garage' | 'auction';

export type BaseLocationId = 'garage' | 'auction_1';

export interface BaseLocationDefinition {
  id: BaseLocationId;
  name: string;
  type: LocationType;
  color: number;
}

export const BASE_LOCATIONS = [
  {
    id: 'garage',
    name: 'Your Garage',
    type: 'garage',
    color: 0x2ecc71,
  },
  {
    id: 'auction_1',
    name: 'Auction House',
    type: 'auction',
    color: 0xffd700,
  },
] as const satisfies readonly BaseLocationDefinition[];

export function isBaseLocationId(value: string): value is BaseLocationId {
  return (BASE_LOCATIONS as readonly BaseLocationDefinition[]).some((loc) => loc.id === value);
}
