import { createHash, randomBytes } from 'crypto';
import { atelierClient, initAtelierDb, type AtelierAgent } from './atelier-db';

export interface PartnerChannel {
  slug: string;
  name: string;
  wallet_address: string | null;
  fee_split_bps: number;
  api_key_hash: string | null;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface PartnerPayout {
  id: string;
  partner_slug: string;
  order_id: string;
  amount_usd: string;
  tx_hash: string | null;
  status: 'pending' | 'paid' | 'failed';
  error: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface PartnerListedAgent extends AtelierAgent {
  curated_at: string;
}

export interface PartnerAgentWithServices extends AtelierAgent {
  curated_at: string;
  services: PartnerAgentService[];
}

export interface PartnerAgentService {
  id: string;
  title: string;
  description: string | null;
  category: string;
  price_usd: string;
  price_type: string;
  quota_limit: number | null;
  active: number;
}

export function hashPartnerApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

export function generatePartnerApiKey(): string {
  return `atelier_partner_${randomBytes(24).toString('hex')}`;
}

export async function getPartnerChannel(slug: string): Promise<PartnerChannel | null> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM partner_channels WHERE slug = ?',
    args: [slug],
  });
  return (result.rows[0] as unknown as PartnerChannel) || null;
}

export async function listPartnerChannels(): Promise<PartnerChannel[]> {
  await initAtelierDb();
  const result = await atelierClient.execute('SELECT * FROM partner_channels ORDER BY created_at DESC');
  return result.rows as unknown as PartnerChannel[];
}

export async function isActivePartnerSlug(slug: string): Promise<boolean> {
  const partner = await getPartnerChannel(slug);
  return !!partner && partner.active === 1;
}

export async function verifyPartnerApiKey(slug: string, apiKey: string): Promise<PartnerChannel | null> {
  const partner = await getPartnerChannel(slug);
  if (!partner || partner.active !== 1 || !partner.api_key_hash) return null;
  const hash = hashPartnerApiKey(apiKey);
  if (hash !== partner.api_key_hash) return null;
  return partner;
}

export async function createPartnerChannel(data: {
  slug: string;
  name: string;
  wallet_address?: string;
  fee_split_bps?: number;
}): Promise<{ partner: PartnerChannel; api_key: string }> {
  await initAtelierDb();
  const apiKey = generatePartnerApiKey();
  const apiKeyHash = hashPartnerApiKey(apiKey);
  await atelierClient.execute({
    sql: `INSERT INTO partner_channels (slug, name, wallet_address, fee_split_bps, api_key_hash, active)
          VALUES (?, ?, ?, ?, ?, 1)`,
    args: [data.slug, data.name, data.wallet_address || null, data.fee_split_bps ?? 5000, apiKeyHash],
  });
  const partner = await getPartnerChannel(data.slug);
  if (!partner) throw new Error('Failed to create partner channel');
  return { partner, api_key: apiKey };
}

export async function updatePartnerChannel(
  slug: string,
  updates: {
    name?: string;
    wallet_address?: string | null;
    fee_split_bps?: number;
    active?: boolean;
  }
): Promise<PartnerChannel | null> {
  await initAtelierDb();
  const setClauses: string[] = [];
  const args: (string | number | null)[] = [];
  if (updates.name !== undefined) { setClauses.push('name = ?'); args.push(updates.name); }
  if (updates.wallet_address !== undefined) { setClauses.push('wallet_address = ?'); args.push(updates.wallet_address); }
  if (updates.fee_split_bps !== undefined) { setClauses.push('fee_split_bps = ?'); args.push(updates.fee_split_bps); }
  if (updates.active !== undefined) { setClauses.push('active = ?'); args.push(updates.active ? 1 : 0); }
  if (setClauses.length === 0) return getPartnerChannel(slug);
  setClauses.push('updated_at = CURRENT_TIMESTAMP');
  args.push(slug);
  await atelierClient.execute({
    sql: `UPDATE partner_channels SET ${setClauses.join(', ')} WHERE slug = ?`,
    args,
  });
  return getPartnerChannel(slug);
}

export async function rotatePartnerApiKey(slug: string): Promise<string | null> {
  await initAtelierDb();
  const apiKey = generatePartnerApiKey();
  const apiKeyHash = hashPartnerApiKey(apiKey);
  const result = await atelierClient.execute({
    sql: 'UPDATE partner_channels SET api_key_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?',
    args: [apiKeyHash, slug],
  });
  if (result.rowsAffected === 0) return null;
  return apiKey;
}

export async function addAgentToPartner(agentId: string, partnerSlug: string): Promise<boolean> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'INSERT OR IGNORE INTO agent_partner_listings (agent_id, partner_slug) VALUES (?, ?)',
    args: [agentId, partnerSlug],
  });
  return result.rowsAffected > 0;
}

export async function removeAgentFromPartner(agentId: string, partnerSlug: string): Promise<boolean> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'DELETE FROM agent_partner_listings WHERE agent_id = ? AND partner_slug = ?',
    args: [agentId, partnerSlug],
  });
  return result.rowsAffected > 0;
}

export async function listPartnerAgentIds(partnerSlug: string): Promise<string[]> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'SELECT agent_id FROM agent_partner_listings WHERE partner_slug = ?',
    args: [partnerSlug],
  });
  return (result.rows as unknown as { agent_id: string }[]).map(r => r.agent_id);
}

export async function getPartnerAgentsWithServices(partnerSlug: string): Promise<PartnerAgentWithServices[]> {
  await initAtelierDb();
  const agentsResult = await atelierClient.execute({
    sql: `SELECT a.*, l.curated_at
          FROM atelier_agents a
          INNER JOIN agent_partner_listings l ON l.agent_id = a.id
          WHERE l.partner_slug = ?
          ORDER BY l.curated_at DESC`,
    args: [partnerSlug],
  });
  const agents = agentsResult.rows as unknown as PartnerListedAgent[];
  if (agents.length === 0) return [];

  const placeholders = agents.map(() => '?').join(',');
  const servicesResult = await atelierClient.execute({
    sql: `SELECT id, agent_id, title, description, category, price_usd, price_type, quota_limit, active
          FROM services
          WHERE active = 1 AND agent_id IN (${placeholders})`,
    args: agents.map(a => a.id),
  });
  const servicesByAgent = new Map<string, PartnerAgentService[]>();
  for (const row of servicesResult.rows as unknown as (PartnerAgentService & { agent_id: string })[]) {
    const list = servicesByAgent.get(row.agent_id) || [];
    const { agent_id: _agentId, ...rest } = row;
    list.push(rest);
    servicesByAgent.set(row.agent_id, list);
  }

  return agents.map(agent => ({
    ...agent,
    services: servicesByAgent.get(agent.id) || [],
  }));
}

export async function createPartnerPayout(data: {
  partner_slug: string;
  order_id: string;
  amount_usd: string;
}): Promise<PartnerPayout> {
  await initAtelierDb();
  const id = `ppo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await atelierClient.execute({
    sql: `INSERT INTO partner_payouts (id, partner_slug, order_id, amount_usd, status)
          VALUES (?, ?, ?, ?, 'pending')`,
    args: [id, data.partner_slug, data.order_id, data.amount_usd],
  });
  const row = await atelierClient.execute({
    sql: 'SELECT * FROM partner_payouts WHERE id = ?',
    args: [id],
  });
  return row.rows[0] as unknown as PartnerPayout;
}

export async function markPartnerPayoutPaid(id: string, txHash: string): Promise<void> {
  await initAtelierDb();
  await atelierClient.execute({
    sql: `UPDATE partner_payouts SET status = 'paid', tx_hash = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?`,
    args: [txHash, id],
  });
}

export async function markPartnerPayoutFailed(id: string, error: string): Promise<void> {
  await initAtelierDb();
  await atelierClient.execute({
    sql: `UPDATE partner_payouts SET status = 'failed', error = ? WHERE id = ?`,
    args: [error.slice(0, 500), id],
  });
}

export async function listPartnerPayouts(
  partnerSlug?: string,
  limit = 100
): Promise<PartnerPayout[]> {
  await initAtelierDb();
  if (partnerSlug) {
    const result = await atelierClient.execute({
      sql: 'SELECT * FROM partner_payouts WHERE partner_slug = ? ORDER BY created_at DESC LIMIT ?',
      args: [partnerSlug, limit],
    });
    return result.rows as unknown as PartnerPayout[];
  }
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM partner_payouts ORDER BY created_at DESC LIMIT ?',
    args: [limit],
  });
  return result.rows as unknown as PartnerPayout[];
}

export async function hasPartnerPayoutForOrder(orderId: string): Promise<boolean> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: `SELECT 1 FROM partner_payouts WHERE order_id = ? AND status IN ('pending', 'paid') LIMIT 1`,
    args: [orderId],
  });
  return result.rows.length > 0;
}
