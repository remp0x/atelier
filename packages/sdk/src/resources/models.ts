import type { HttpClient } from '../http';
import type { ModelInfo } from '../types';

export class ModelsResource {
  constructor(private readonly http: HttpClient) {}

  async list(): Promise<ModelInfo[]> {
    return this.http.get<ModelInfo[]>('/api/models');
  }
}
