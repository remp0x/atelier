import type { EarnVenue, EarnMarket } from './venue-types';
import { parquetVenue } from './venues/parquet';
import { solendVenue } from './venues/solend';
import { kaminoVenue } from './venues/kamino';
import { meteoraVenue } from './venues/meteora';

// Earn venue registry -- mirrors the AI provider registry. New venues (LSTs,
// other lending markets, ...) register here and the flows/routes dispatch by
// vault key. A venue only surfaces when its isConfigured() is true.
const VENUES: Record<string, EarnVenue> = {
  parquet: parquetVenue,
  solend: solendVenue,
  kamino: kaminoVenue,
  meteora: meteoraVenue,
};

export function getVenue(id: string): EarnVenue {
  const venue = VENUES[id];
  if (!venue) throw new Error(`Unknown Earn venue: ${id}`);
  return venue;
}

export function tryGetVenue(id: string): EarnVenue | null {
  return VENUES[id] ?? null;
}

// The vault key for a (venue, market). Parquet keeps the bare market as its key
// (the pre-venue vault rows), every other venue is explicitly prefixed.
export function vaultKeyFor(venue: string, market: string): string {
  return venue === 'parquet' ? market : `${venue}:${market}`;
}

// Resolve a vault key into its venue + market. A bare key with no colon is a
// legacy Parquet key (the pre-venue vault rows store bare category ids), so it
// maps to the parquet venue. New venues use an explicit `venue:market` key.
export function parseVenueKey(key: string): { venue: string; market: string; key: string } {
  const idx = key.indexOf(':');
  if (idx === -1) return { venue: 'parquet', market: key, key };
  return { venue: key.slice(0, idx), market: key.slice(idx + 1), key };
}

export function isAnyEarnConfigured(): boolean {
  return Object.values(VENUES).some((venue) => venue.isConfigured());
}

export function getEnabledVenueMarkets(): EarnMarket[] {
  return Object.values(VENUES)
    .filter((venue) => venue.isConfigured())
    .flatMap((venue) => venue.listMarkets());
}

export function getDefaultVenueMarket(): EarnMarket {
  const markets = getEnabledVenueMarkets();
  if (markets.length === 0) throw new Error('No Earn venue configured');
  return markets[0];
}
