import 'server-only';
import { randomBytes, createHash } from 'crypto';
import { atelierClient } from '@/lib/atelier-db';
import { AUTH_CODE_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from './config';

let ready: Promise<void> | null = null;
function ensureTables(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await atelierClient.execute(`
        CREATE TABLE IF NOT EXISTS oauth_clients (
          client_id TEXT PRIMARY KEY,
          client_name TEXT,
          redirect_uris TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )`);
      await atelierClient.execute(`
        CREATE TABLE IF NOT EXISTS oauth_codes (
          code TEXT PRIMARY KEY,
          client_id TEXT NOT NULL,
          redirect_uri TEXT NOT NULL,
          code_challenge TEXT NOT NULL,
          user_id TEXT NOT NULL,
          scope TEXT NOT NULL,
          resource TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          used INTEGER NOT NULL DEFAULT 0
        )`);
      await atelierClient.execute(`
        CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
          token_hash TEXT PRIMARY KEY,
          client_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          scope TEXT NOT NULL,
          resource TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          revoked INTEGER NOT NULL DEFAULT 0
        )`);
    })();
  }
  return ready;
}

const nowSec = (): number => Math.floor(Date.now() / 1000);
const sha256 = (v: string): string => createHash('sha256').update(v).digest('hex');
const opaque = (bytes = 32): string => randomBytes(bytes).toString('base64url');

// --- Clients (RFC 7591 DCR) ---

export interface OAuthClient {
  clientId: string;
  clientName: string | null;
  redirectUris: string[];
}

export async function registerClient(params: { clientName?: string; redirectUris: string[] }): Promise<OAuthClient> {
  await ensureTables();
  const clientId = `mcpc_${opaque(18)}`;
  await atelierClient.execute({
    sql: `INSERT INTO oauth_clients (client_id, client_name, redirect_uris, created_at) VALUES (?, ?, ?, ?)`,
    args: [clientId, params.clientName ?? null, JSON.stringify(params.redirectUris), nowSec()],
  });
  return { clientId, clientName: params.clientName ?? null, redirectUris: params.redirectUris };
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  await ensureTables();
  const res = await atelierClient.execute({
    sql: `SELECT client_id, client_name, redirect_uris FROM oauth_clients WHERE client_id = ?`,
    args: [clientId],
  });
  const row = res.rows[0];
  if (!row) return null;
  let redirectUris: string[] = [];
  try {
    const parsed = JSON.parse(String(row.redirect_uris));
    if (Array.isArray(parsed)) redirectUris = parsed.map(String);
  } catch {
    redirectUris = [];
  }
  return { clientId: String(row.client_id), clientName: row.client_name ? String(row.client_name) : null, redirectUris };
}

// --- Authorization codes (single-use, PKCE-bound) ---

export async function createAuthCode(params: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  userId: string;
  scope: string;
  resource: string;
}): Promise<string> {
  await ensureTables();
  const code = opaque(32);
  await atelierClient.execute({
    sql: `INSERT INTO oauth_codes (code, client_id, redirect_uri, code_challenge, user_id, scope, resource, expires_at, used)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    args: [
      code,
      params.clientId,
      params.redirectUri,
      params.codeChallenge,
      params.userId,
      params.scope,
      params.resource,
      nowSec() + AUTH_CODE_TTL_SECONDS,
    ],
  });
  return code;
}

export interface ConsumedCode {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  userId: string;
  scope: string;
  resource: string;
}

/** Atomically consume a code: returns its data once, then it can never be used again. */
export async function consumeAuthCode(code: string): Promise<ConsumedCode | null> {
  await ensureTables();
  const upd = await atelierClient.execute({
    sql: `UPDATE oauth_codes SET used = 1 WHERE code = ? AND used = 0 AND expires_at > ?`,
    args: [code, nowSec()],
  });
  if (upd.rowsAffected !== 1) return null;
  const res = await atelierClient.execute({
    sql: `SELECT client_id, redirect_uri, code_challenge, user_id, scope, resource FROM oauth_codes WHERE code = ?`,
    args: [code],
  });
  const row = res.rows[0];
  if (!row) return null;
  return {
    clientId: String(row.client_id),
    redirectUri: String(row.redirect_uri),
    codeChallenge: String(row.code_challenge),
    userId: String(row.user_id),
    scope: String(row.scope),
    resource: String(row.resource),
  };
}

// --- Refresh tokens (rotating, hashed at rest) ---

export async function issueRefreshToken(params: {
  clientId: string;
  userId: string;
  scope: string;
  resource: string;
}): Promise<string> {
  await ensureTables();
  const token = opaque(32);
  await atelierClient.execute({
    sql: `INSERT INTO oauth_refresh_tokens (token_hash, client_id, user_id, scope, resource, expires_at, revoked)
          VALUES (?, ?, ?, ?, ?, ?, 0)`,
    args: [sha256(token), params.clientId, params.userId, params.scope, params.resource, nowSec() + REFRESH_TOKEN_TTL_SECONDS],
  });
  return token;
}

export interface RefreshRecord {
  clientId: string;
  userId: string;
  scope: string;
  resource: string;
}

/** Consume + rotate: revoke the presented refresh token and mint a fresh one. */
export async function rotateRefreshToken(token: string, clientId: string): Promise<{ next: string; record: RefreshRecord } | null> {
  await ensureTables();
  const hash = sha256(token);
  const upd = await atelierClient.execute({
    sql: `UPDATE oauth_refresh_tokens SET revoked = 1 WHERE token_hash = ? AND revoked = 0 AND expires_at > ? AND client_id = ?`,
    args: [hash, nowSec(), clientId],
  });
  if (upd.rowsAffected !== 1) return null;
  const res = await atelierClient.execute({
    sql: `SELECT client_id, user_id, scope, resource FROM oauth_refresh_tokens WHERE token_hash = ?`,
    args: [hash],
  });
  const row = res.rows[0];
  if (!row) return null;
  const record: RefreshRecord = {
    clientId: String(row.client_id),
    userId: String(row.user_id),
    scope: String(row.scope),
    resource: String(row.resource),
  };
  const next = await issueRefreshToken(record);
  return { next, record };
}
