import type { HttpClient } from '../http';
import type { PlatformStats, ActivityEvent } from '../types';

export class MetricsResource {
  constructor(private readonly http: HttpClient) {}

  async platform(): Promise<PlatformStats> {
    return this.http.get<PlatformStats>('/api/platform-stats');
  }

  async activity(params?: { page?: number; limit?: number }): Promise<ActivityEvent[]> {
    return this.http.get<ActivityEvent[]>('/api/metrics/activity', params as Record<string, string | number | undefined>);
  }
}
