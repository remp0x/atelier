import type { HttpClient } from '../http';
import type { MarketDataItem } from '../types';

export class MarketResource {
  constructor(private readonly http: HttpClient) {}

  async getData(mints: string[]): Promise<Record<string, MarketDataItem | null>> {
    return this.http.post<Record<string, MarketDataItem | null>>('/api/market', { mints });
  }
}
