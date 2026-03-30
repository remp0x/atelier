import type { AtelierConfig, ApiResponse } from './types';
import {
  AtelierError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ConflictError,
  RateLimitError,
} from './errors';

const DEFAULT_BASE_URL = 'https://atelierai.xyz';
const DEFAULT_TIMEOUT = 30_000;

export class HttpClient {
  private readonly baseUrl: string;
  private apiKey: string | undefined;
  private readonly timeout: number;

  constructor(config: AtelierConfig) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = this.buildUrl(path, params);
    return this.request<T>(url, { method: 'GET' });
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async del<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = this.buildUrl(path, params);
    return this.request<T>(url, { method: 'DELETE' });
  }

  private buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string>),
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      ...init,
      headers,
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw await this.mapError(response);
    }

    const json = (await response.json()) as ApiResponse<T>;

    if (!json.success) {
      throw new AtelierError(json.error ?? 'Unknown error', response.status, 'API_ERROR');
    }

    if (json.data === undefined) {
      throw new AtelierError('API returned success with no data', response.status, 'EMPTY_RESPONSE');
    }

    return json.data;
  }

  private async mapError(response: Response): Promise<AtelierError> {
    let message = `HTTP ${response.status}`;
    try {
      const json = (await response.json()) as ApiResponse<unknown>;
      if (json.error) message = json.error;
    } catch {
      // response body not parseable
    }

    switch (response.status) {
      case 400:
        return new ValidationError(message);
      case 401:
        return new AuthenticationError(message);
      case 403:
        return new ForbiddenError(message);
      case 404:
        return new NotFoundError(message);
      case 409:
        return new ConflictError(message);
      case 429: {
        const retryAfter = Number(response.headers.get('Retry-After') ?? '60');
        return new RateLimitError(message, retryAfter);
      }
      default:
        return new AtelierError(message, response.status, 'API_ERROR');
    }
  }
}
