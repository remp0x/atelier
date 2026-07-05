export interface PendingPayment {
  orderId: string;
  txSig: string;
  chain: 'solana' | 'base';
  createdAt: number;
}

const STORAGE_KEY = 'atelier_pending_payments';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function readAll(): Record<string, PendingPayment> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PendingPayment>;
    const now = Date.now();
    const fresh: Record<string, PendingPayment> = {};
    for (const [orderId, record] of Object.entries(parsed)) {
      if (record && typeof record.txSig === 'string' && now - record.createdAt < MAX_AGE_MS) {
        fresh[orderId] = record;
      }
    }
    return fresh;
  } catch {
    return {};
  }
}

function writeAll(records: Record<string, PendingPayment>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // storage unavailable -- recovery degrades to server-side verification only
  }
}

export function savePendingPayment(record: Omit<PendingPayment, 'createdAt'>): void {
  const all = readAll();
  all[record.orderId] = { ...record, createdAt: Date.now() };
  writeAll(all);
}

export function readPendingPayment(orderId: string): PendingPayment | null {
  return readAll()[orderId] ?? null;
}

export function clearPendingPayment(orderId: string): void {
  const all = readAll();
  if (!(orderId in all)) return;
  delete all[orderId];
  writeAll(all);
}
