export type LocationType = 'garage' | 'scrapyard' | 'dealership' | 'auction';

export type BaseLocationId = 'garage' | 'scrapyard_1' | 'dealership_1' | 'auction_1';

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
    id: 'scrapyard_1',
    name: "Joe's Scrapyard",
    type: 'scrapyard',
    color: 0x8b4513,
  },
  {
    id: 'dealership_1',
    name: 'Classic Car Dealership',
    type: 'dealership',
    color: 0x4169e1,
  },
  {
    id: 'auction_1',
    name: 'Weekend Auction House',
    type: 'auction',
    color: 0xffd700,
  },
] as const satisfies readonly BaseLocationDefinition[];

export function isBaseLocationId(value: string): value is BaseLocationId {
  return (BASE_LOCATIONS as readonly BaseLocationDefinition[]).some((loc) => loc.id === value);
}
