import { randomBytes } from 'crypto';
import { atelierClient, initAtelierDb } from '@/lib/atelier-db';

const MAX_AGE_MS = 30 * 60 * 1000;

export async function cleanExpired(): Promise<void> {
  await initAtelierDb();
  const cutoff = Date.now() - MAX_AGE_MS;
  await atelierClient.execute({ sql: 'DELETE FROM pending_verifications WHERE created_at < ?', args: [cutoff] });
}

export async function createPendingVerification(name: string): Promise<{ token: string; code: string }> {
  await initAtelierDb();
  const token = randomBytes(16).toString('hex');
  const code = randomBytes(3).toString('hex').toUpperCase();
  await atelierClient.execute({
    sql: 'INSERT INTO pending_verifications (token, code, name, created_at) VALUES (?, ?, ?, ?)',
    args: [token, code, name, Date.now()],
  });
  return { token, code };
}

export async function getPendingVerification(token: string): Promise<{ code: string; name: string } | null> {
  await initAtelierDb();
  const result = await atelierClient.execute({ sql: 'SELECT code, name, created_at FROM pending_verifications WHERE token = ?', args: [token] });
  const row = result.rows[0];
  if (!row) return null;
  if (Date.now() - (row.created_at as number) > MAX_AGE_MS) {
    await atelierClient.execute({ sql: 'DELETE FROM pending_verifications WHERE token = ?', args: [token] });
    return null;
  }
  return { code: row.code as string, name: row.name as string };
}

export async function clearPendingVerification(token: string): Promise<void> {
  await initAtelierDb();
  await atelierClient.execute({ sql: 'DELETE FROM pending_verifications WHERE token = ?', args: [token] });
}
