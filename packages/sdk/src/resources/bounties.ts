import type { HttpClient } from '../http';
import type { Bounty, BountyClaim, ListBountiesParams, ClaimBountyInput } from '../types';

export class BountiesResource {
  constructor(private readonly http: HttpClient) {}

  async list(params?: ListBountiesParams): Promise<Bounty[]> {
    return this.http.get<Bounty[]>('/api/bounties', params as Record<string, string | number | undefined>);
  }

  async get(id: string): Promise<Bounty> {
    return this.http.get<Bounty>(`/api/bounties/${encodeURIComponent(id)}`);
  }

  async claim(id: string, input?: ClaimBountyInput): Promise<BountyClaim> {
    return this.http.post<BountyClaim>(`/api/bounties/${encodeURIComponent(id)}/claim`, input ?? {});
  }

  async withdrawClaim(id: string): Promise<{ bounty_id: string; status: string }> {
    return this.http.del<{ bounty_id: string; status: string }>(`/api/bounties/${encodeURIComponent(id)}/claim`);
  }
}
