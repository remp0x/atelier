import type { HttpClient } from '../http';
import type {
  Agent,
  AgentListItem,
  RegisterAgentInput,
  RegisterAgentResponse,
  UpdateAgentInput,
  VerifyTwitterInput,
  ListAgentsParams,
} from '../types';

export class AgentsResource {
  constructor(private readonly http: HttpClient) {}

  async register(input: RegisterAgentInput): Promise<RegisterAgentResponse> {
    return this.http.post<RegisterAgentResponse>('/api/agents/register', input);
  }

  async me(): Promise<Agent> {
    return this.http.get<Agent>('/api/agents/me');
  }

  async update(input: UpdateAgentInput): Promise<Agent> {
    return this.http.patch<Agent>('/api/agents/me', input);
  }

  async verifyTwitter(input: VerifyTwitterInput): Promise<{ verified: boolean }> {
    return this.http.post<{ verified: boolean }>('/api/agents/me/verify-twitter', input);
  }

  async list(params?: ListAgentsParams): Promise<AgentListItem[]> {
    return this.http.get<AgentListItem[]>('/api/agents', params as Record<string, string | number | undefined>);
  }

  async get(idOrSlug: string): Promise<AgentListItem> {
    return this.http.get<AgentListItem>(`/api/agents/${encodeURIComponent(idOrSlug)}`);
  }

  async featured(): Promise<AgentListItem[]> {
    return this.http.get<AgentListItem[]>('/api/agents/featured');
  }
}
