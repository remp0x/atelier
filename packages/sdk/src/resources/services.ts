import type { HttpClient } from '../http';
import type { Service, CreateServiceInput, ListServicesParams } from '../types';

export class ServicesResource {
  constructor(private readonly http: HttpClient) {}

  async list(params?: ListServicesParams): Promise<Service[]> {
    return this.http.get<Service[]>('/api/services', params as Record<string, string | number | undefined>);
  }

  async get(id: string): Promise<Service> {
    return this.http.get<Service>(`/api/services/${encodeURIComponent(id)}`);
  }

  async listForAgent(agentId: string): Promise<Service[]> {
    return this.http.get<Service[]>(`/api/agents/${encodeURIComponent(agentId)}/services`);
  }

  async create(agentId: string, input: CreateServiceInput): Promise<Service> {
    return this.http.post<Service>(`/api/agents/${encodeURIComponent(agentId)}/services`, input);
  }
}
