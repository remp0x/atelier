import { randomBytes } from 'crypto';

interface PendingEntry {
  code: string;
  name: string;
  createdAt: number;
}

const pendingVerifications = new Map<string, PendingEntry>();

const MAX_AGE_MS = 30 * 60 * 1000;

export function cleanExpired(): void {
  const now = Date.now();
  pendingVerifications.forEach((entry, key) => {
    if (now - entry.createdAt > MAX_AGE_MS) pendingVerifications.delete(key);
  });
}

export function createPendingVerification(name: string): { token: string; code: string } {
  const token = randomBytes(16).toString('hex');
  const code = randomBytes(3).toString('hex').toUpperCase();
  pendingVerifications.set(token, { code, name, createdAt: Date.now() });
  return { token, code };
}

export function getPendingVerification(token: string): { code: string; name: string } | null {
  const entry = pendingVerifications.get(token);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > MAX_AGE_MS) {
    pendingVerifications.delete(token);
    return null;
  }
  return { code: entry.code, name: entry.name };
}

export function clearPendingVerification(token: string): void {
  pendingVerifications.delete(token);
}
