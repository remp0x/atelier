import { createClient, Client } from '@libsql/client';
import { randomBytes } from 'crypto';

export const atelierClient: Client = createClient({
  url: process.env.ATELIER_TURSO_DATABASE_URL || 'file:local-atelier.db',
  authToken: process.env.ATELIER_TURSO_AUTH_TOKEN,
});

let initialized = false;

function escapeLikePattern(search: string): string {
  return search.replace(/%/g, '\\%').replace(/_/g, '\\_');
}

const MODEL_PATTERNS: { pattern: RegExp; model: string }[] = [
  { pattern: /\bkling\b/i, model: 'Kling' },
  { pattern: /\bnano\s*[-_]?\s*banana/i, model: 'Nano Banana 2' },
  { pattern: /\bgemini\b/i, model: 'Gemini' },
  { pattern: /\brunway\b/i, model: 'Runway' },
  { pattern: /\bgen[-\s]?4\b/i, model: 'Runway' },
  { pattern: /\bluma\b/i, model: 'Luma' },
  { pattern: /\bray[-\s]?2\b/i, model: 'Luma' },
  { pattern: /\bdream\s*machine\b/i, model: 'Luma' },
  { pattern: /\bhiggsfield\b/i, model: 'Higgsfield' },
  { pattern: /\bminimax\b/i, model: 'MiniMax' },
  { pattern: /\bhailuo\b/i, model: 'Hailuo' },
  { pattern: /\bdall[-\s]?e/i, model: 'DALL-E' },
  { pattern: /\bmidjourney\b/i, model: 'Midjourney' },
  { pattern: /\bstable\s*diffusion\b/i, model: 'Stable Diffusion' },
  { pattern: /\bsdxl\b/i, model: 'Stable Diffusion' },
  { pattern: /\bflux\b/i, model: 'Flux' },
  { pattern: /\bsora\b/i, model: 'Sora' },
  { pattern: /\bpika\b/i, model: 'Pika' },
  { pattern: /\bleonardo\s*ai\b|\bleonardo\b/i, model: 'Leonardo' },
  { pattern: /\bideogram\b/i, model: 'Ideogram' },
  { pattern: /\bgrok\b/i, model: 'Grok' },
  { pattern: /\brecraft\b/i, model: 'Recraft' },
  { pattern: /\bwanx\b/i, model: 'Wanx' },
  { pattern: /\bveo\s*2?\b/i, model: 'Veo' },
  { pattern: /\bimagen\b/i, model: 'Imagen' },
];

function inferModelFromText(text: string): string | null {
  for (const { pattern, model } of MODEL_PATTERNS) {
    if (pattern.test(text)) return model;
  }
  return null;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export async function initAtelierDb(): Promise<void> {
  if (initialized) return;

  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS atelier_agents (
      id TEXT PRIMARY KEY,
      slug TEXT,
      name TEXT NOT NULL,
      description TEXT,
      avatar_url TEXT,
      bio TEXT,
      source TEXT NOT NULL DEFAULT 'external',
      endpoint_url TEXT,
      capabilities TEXT DEFAULT '[]',
      api_key TEXT UNIQUE,
      verified INTEGER DEFAULT 0,
      blue_check INTEGER DEFAULT 0,
      is_atelier_official INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      total_orders INTEGER DEFAULT 0,
      completed_orders INTEGER DEFAULT 0,
      avg_rating REAL,
      twitter_username TEXT,
      twitter_verification_code TEXT,
      bankr_wallet TEXT,
      owner_wallet TEXT,
      token_mint TEXT,
      token_name TEXT,
      token_symbol TEXT,
      token_image_url TEXT,
      token_mode TEXT,
      token_creator_wallet TEXT,
      token_tx_hash TEXT,
      token_created_at DATETIME,
      token_launch_attempted INTEGER DEFAULT 0,
      payout_wallet TEXT,
      partner_badge TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_atelier_agents_api_key ON atelier_agents(api_key)');
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_atelier_agents_active ON atelier_agents(active)');
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_atelier_agents_source ON atelier_agents(source)');
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_atelier_agents_owner_wallet ON atelier_agents(owner_wallet)');
  await atelierClient.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_atelier_agents_slug ON atelier_agents(slug) WHERE slug IS NOT NULL');

  await atelierClient.execute(`ALTER TABLE atelier_agents ADD COLUMN token_launch_attempted INTEGER DEFAULT 0`).catch(() => {});
  await atelierClient.execute(`ALTER TABLE atelier_agents ADD COLUMN ai_models TEXT`).catch(() => {});
  await atelierClient.execute(`ALTER TABLE atelier_agents ADD COLUMN last_poll_at DATETIME`).catch(() => {});
  await atelierClient.execute(`ALTER TABLE atelier_agents ADD COLUMN said_wallet TEXT`).catch(() => {});
  await atelierClient.execute(`ALTER TABLE atelier_agents ADD COLUMN said_pda TEXT`).catch(() => {});
  await atelierClient.execute(`ALTER TABLE atelier_agents ADD COLUMN said_secret_key TEXT`).catch(() => {});
  await atelierClient.execute(`ALTER TABLE atelier_agents ADD COLUMN said_tx_hash TEXT`).catch(() => {});
  await atelierClient.execute(`ALTER TABLE atelier_agents ADD COLUMN privy_user_id TEXT`).catch(() => {});
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_atelier_agents_privy_user_id ON atelier_agents(privy_user_id)').catch(() => {});
  await atelierClient.execute(`ALTER TABLE atelier_agents ADD COLUMN webhook_secret TEXT`).catch(() => {});

  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'custom',
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      price_usd TEXT NOT NULL,
      price_type TEXT NOT NULL DEFAULT 'fixed',
      turnaround_hours INTEGER DEFAULT 48,
      deliverables TEXT DEFAULT '[]',
      portfolio_post_ids TEXT DEFAULT '[]',
      demo_url TEXT,
      active INTEGER DEFAULT 1,
      total_orders INTEGER DEFAULT 0,
      completed_orders INTEGER DEFAULT 0,
      avg_rating REAL,
      provider_key TEXT,
      provider_model TEXT,
      system_prompt TEXT,
      quota_limit INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES atelier_agents(id)
    )
  `);

  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_services_agent_id ON services(agent_id)');
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_services_category ON services(category)');
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_services_active ON services(active)');

  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS service_orders (
      id TEXT PRIMARY KEY,
      service_id TEXT,
      client_agent_id TEXT,
      client_wallet TEXT,
      provider_agent_id TEXT NOT NULL,
      brief TEXT NOT NULL,
      reference_urls TEXT,
      quoted_price_usd TEXT,
      platform_fee_usd TEXT,
      payment_method TEXT,
      status TEXT NOT NULL DEFAULT 'pending_quote',
      escrow_tx_hash TEXT,
      payout_tx_hash TEXT,
      deliverable_post_id INTEGER,
      deliverable_url TEXT,
      deliverable_media_type TEXT,
      quota_total INTEGER DEFAULT 0,
      quota_used INTEGER DEFAULT 0,
      workspace_expires_at DATETIME,
      delivered_at DATETIME,
      review_deadline DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (service_id) REFERENCES services(id),
      FOREIGN KEY (provider_agent_id) REFERENCES atelier_agents(id)
    )
  `);

  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_service_orders_service_id ON service_orders(service_id)');
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_service_orders_client ON service_orders(client_agent_id)');
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_service_orders_provider ON service_orders(provider_agent_id)');
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_service_orders_status ON service_orders(status)');
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_service_orders_wallet ON service_orders(client_wallet)');
  await atelierClient.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_service_orders_escrow_tx ON service_orders(escrow_tx_hash) WHERE escrow_tx_hash IS NOT NULL');

  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS service_reviews (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      service_id TEXT,
      reviewer_agent_id TEXT NOT NULL,
      reviewer_name TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES service_orders(id),
      FOREIGN KEY (service_id) REFERENCES services(id)
    )
  `);

  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_service_reviews_service ON service_reviews(service_id)');
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_service_reviews_order ON service_reviews(order_id)');

  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS order_deliverables (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      deliverable_url TEXT,
      deliverable_media_type TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES service_orders(id)
    )
  `);

  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_order_deliverables_order ON order_deliverables(order_id)');

  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS atelier_profiles (
      wallet TEXT PRIMARY KEY,
      display_name TEXT,
      bio TEXT,
      avatar_url TEXT,
      twitter_handle TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS creator_fee_sweeps (
      id TEXT PRIMARY KEY,
      amount_lamports INTEGER NOT NULL,
      tx_hash TEXT NOT NULL,
      swept_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS creator_fee_payouts (
      id TEXT PRIMARY KEY,
      recipient_wallet TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      token_mint TEXT NOT NULL,
      amount_lamports INTEGER NOT NULL,
      tx_hash TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      paid_at DATETIME
    )
  `);

  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_fee_payouts_wallet ON creator_fee_payouts(recipient_wallet)');
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_fee_payouts_agent ON creator_fee_payouts(agent_id)');

  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS creator_fee_index (
      id TEXT PRIMARY KEY,
      vault_type TEXT NOT NULL,
      tx_signature TEXT NOT NULL,
      amount_lamports INTEGER NOT NULL,
      block_time INTEGER,
      slot INTEGER NOT NULL,
      indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tx_signature, vault_type)
    )
  `);

  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS creator_fee_index_cursor (
      vault_type TEXT PRIMARY KEY,
      last_signature TEXT,
      newest_signature TEXT,
      fully_backfilled INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS hidden_portfolio_items (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      hidden_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_hidden_portfolio_agent ON hidden_portfolio_items(agent_id)');
  await atelierClient.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_hidden_portfolio_unique ON hidden_portfolio_items(agent_id, source_type, source_id)');

  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS order_messages (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      sender_type TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_order_messages_order ON order_messages(order_id, created_at)');

  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS order_message_reads (
      order_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      last_read_at DATETIME NOT NULL,
      PRIMARY KEY (order_id, participant_id)
    )
  `);

  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      order_id TEXT,
      read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_notifications_wallet ON notifications(wallet, created_at DESC)');
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(wallet, read) WHERE read = 0');

  try { await atelierClient.execute('ALTER TABLE atelier_agents ADD COLUMN payout_wallet TEXT'); } catch (_e) { }
  try { await atelierClient.execute('ALTER TABLE atelier_agents ADD COLUMN partner_badge TEXT'); } catch (_e) { }
  try { await atelierClient.execute('ALTER TABLE atelier_agents ADD COLUMN slug TEXT'); } catch (_e) { }
  await atelierClient.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_atelier_agents_slug ON atelier_agents(slug) WHERE slug IS NOT NULL');
  try { await atelierClient.execute('ALTER TABLE service_orders ADD COLUMN reference_images TEXT'); } catch (_e) { }
  try { await atelierClient.execute('ALTER TABLE atelier_agents ADD COLUMN twitter_username TEXT'); } catch (_e) { }
  try { await atelierClient.execute('ALTER TABLE atelier_agents ADD COLUMN twitter_verification_code TEXT'); } catch (_e) { }
  try { await atelierClient.execute('ALTER TABLE atelier_agents ADD COLUMN atelier_holder INTEGER DEFAULT 0'); } catch (_e) { }
  try { await atelierClient.execute('ALTER TABLE atelier_agents ADD COLUMN holder_checked_at TEXT'); } catch (_e) { }
  try { await atelierClient.execute('ALTER TABLE atelier_agents ADD COLUMN featured INTEGER DEFAULT 0'); } catch (_e) { }
  await atelierClient.execute({
    sql: `UPDATE atelier_agents SET atelier_holder = 0, blue_check = 0, holder_checked_at = NULL
          WHERE owner_wallet = ?`,
    args: ['EZkoXXZ5HEWdKwfv7wua7k6Dqv8aQxxHWNakq2gG2Qpb'],
  });

  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS bounties (
      id TEXT PRIMARY KEY,
      poster_wallet TEXT NOT NULL,
      title TEXT NOT NULL,
      brief TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'custom',
      budget_usd TEXT NOT NULL,
      deadline_hours INTEGER NOT NULL DEFAULT 24,
      reference_urls TEXT,
      reference_images TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      accepted_claim_id TEXT,
      order_id TEXT,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_bounties_status ON bounties(status)');
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_bounties_category ON bounties(category)');
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_bounties_poster ON bounties(poster_wallet)');
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_bounties_expires ON bounties(expires_at)');

  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS bounty_claims (
      id TEXT PRIMARY KEY,
      bounty_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      claimant_wallet TEXT,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bounty_id) REFERENCES bounties(id),
      FOREIGN KEY (agent_id) REFERENCES atelier_agents(id)
    )
  `);
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_bounty_claims_bounty ON bounty_claims(bounty_id)');
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_bounty_claims_agent ON bounty_claims(agent_id)');
  await atelierClient.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_bounty_claims_unique ON bounty_claims(bounty_id, agent_id)');

  try { await atelierClient.execute('ALTER TABLE service_orders ADD COLUMN bounty_id TEXT REFERENCES bounties(id)'); } catch (_e) { }

  // Migrate service_orders.service_id from NOT NULL to nullable (for bounty orders)
  try {
    const col = await atelierClient.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='service_orders'");
    const ddl = col.rows[0]?.[0] as string | undefined;
    if (ddl && ddl.includes('service_id TEXT NOT NULL')) {
      await atelierClient.execute(`
        CREATE TABLE service_orders_new AS SELECT * FROM service_orders WHERE 1=0
      `);
      await atelierClient.execute('DROP TABLE service_orders_new');
      await atelierClient.execute(`
        ALTER TABLE service_orders RENAME TO service_orders_old
      `);
      await atelierClient.execute(`
        CREATE TABLE service_orders (
          id TEXT PRIMARY KEY,
          service_id TEXT,
          client_agent_id TEXT,
          client_wallet TEXT,
          provider_agent_id TEXT NOT NULL,
          brief TEXT NOT NULL,
          reference_urls TEXT,
          reference_images TEXT,
          quoted_price_usd TEXT,
          platform_fee_usd TEXT,
          payment_method TEXT,
          status TEXT NOT NULL DEFAULT 'pending_quote',
          escrow_tx_hash TEXT,
          payout_tx_hash TEXT,
          deliverable_post_id INTEGER,
          deliverable_url TEXT,
          deliverable_media_type TEXT,
          quota_total INTEGER DEFAULT 0,
          quota_used INTEGER DEFAULT 0,
          workspace_expires_at DATETIME,
          delivered_at DATETIME,
          review_deadline DATETIME,
          completed_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          bounty_id TEXT REFERENCES bounties(id),
          FOREIGN KEY (service_id) REFERENCES services(id),
          FOREIGN KEY (provider_agent_id) REFERENCES atelier_agents(id)
        )
      `);
      await atelierClient.execute(`
        INSERT INTO service_orders (id, service_id, client_agent_id, client_wallet, provider_agent_id, brief, reference_urls, reference_images, quoted_price_usd, platform_fee_usd, payment_method, status, escrow_tx_hash, payout_tx_hash, deliverable_post_id, deliverable_url, deliverable_media_type, quota_total, quota_used, workspace_expires_at, delivered_at, review_deadline, completed_at, created_at, bounty_id)
        SELECT id, service_id, client_agent_id, client_wallet, provider_agent_id, brief, reference_urls, reference_images, quoted_price_usd, platform_fee_usd, payment_method, status, escrow_tx_hash, payout_tx_hash, deliverable_post_id, deliverable_url, deliverable_media_type, quota_total, quota_used, workspace_expires_at, delivered_at, review_deadline, completed_at, created_at, bounty_id
        FROM service_orders_old
      `);
      await atelierClient.execute('DROP TABLE service_orders_old');
      await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_service_orders_service_id ON service_orders(service_id)');
      await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_service_orders_client ON service_orders(client_agent_id)');
      await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_service_orders_provider ON service_orders(provider_agent_id)');
      await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_service_orders_status ON service_orders(status)');
      await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_service_orders_wallet ON service_orders(client_wallet)');
      await atelierClient.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_service_orders_escrow_tx ON service_orders(escrow_tx_hash) WHERE escrow_tx_hash IS NOT NULL');
    }
  } catch (e) { console.error('service_orders migration failed (non-fatal):', e); }

  // Recovery: if the migration failed midway, service_orders_old still has the data
  try {
    const oldExists = await atelierClient.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='service_orders_old'");
    if (oldExists.rows.length > 0) {
      const count = await atelierClient.execute('SELECT COUNT(*) as cnt FROM service_orders');
      if (Number(count.rows[0].cnt) === 0) {
        await atelierClient.execute(`
          INSERT INTO service_orders (id, service_id, client_agent_id, client_wallet, provider_agent_id, brief, reference_urls, reference_images, quoted_price_usd, platform_fee_usd, payment_method, status, escrow_tx_hash, payout_tx_hash, deliverable_post_id, deliverable_url, deliverable_media_type, quota_total, quota_used, workspace_expires_at, delivered_at, review_deadline, completed_at, created_at, bounty_id)
          SELECT id, service_id, client_agent_id, client_wallet, provider_agent_id, brief, reference_urls, reference_images, quoted_price_usd, platform_fee_usd, payment_method, status, escrow_tx_hash, payout_tx_hash, deliverable_post_id, deliverable_url, deliverable_media_type, quota_total, quota_used, workspace_expires_at, delivered_at, review_deadline, completed_at, created_at, bounty_id
          FROM service_orders_old
        `);
        console.log('Recovered service_orders data from service_orders_old');
      }
      await atelierClient.execute('DROP TABLE service_orders_old');
    }
  } catch (e) { console.error('service_orders recovery failed:', e); }

  // Migrate service_reviews.service_id from NOT NULL to nullable (for bounty orders)
  try {
    const revDdl = await atelierClient.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='service_reviews'");
    const revSql = (revDdl.rows[0] as unknown as { sql: string })?.sql;
    if (revSql && revSql.includes('service_id TEXT NOT NULL')) {
      await atelierClient.execute(`
        CREATE TABLE service_reviews_new (
          id TEXT PRIMARY KEY,
          order_id TEXT NOT NULL,
          service_id TEXT,
          reviewer_agent_id TEXT NOT NULL,
          reviewer_name TEXT NOT NULL,
          rating INTEGER NOT NULL,
          comment TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (order_id) REFERENCES service_orders(id),
          FOREIGN KEY (service_id) REFERENCES services(id)
        )
      `);
      await atelierClient.execute(`
        INSERT INTO service_reviews_new (id, order_id, service_id, reviewer_agent_id, reviewer_name, rating, comment, created_at)
        SELECT id, order_id, service_id, reviewer_agent_id, reviewer_name, rating, comment, created_at
        FROM service_reviews
      `);
      await atelierClient.execute('DROP TABLE service_reviews');
      await atelierClient.execute('ALTER TABLE service_reviews_new RENAME TO service_reviews');
      await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_service_reviews_service ON service_reviews(service_id)');
      await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_service_reviews_order ON service_reviews(order_id)');
    }
  } catch (e) { console.error('service_reviews migration failed (non-fatal):', e); }

  try { await atelierClient.execute('ALTER TABLE services ADD COLUMN max_revisions INTEGER DEFAULT 3'); } catch (_e) { }
  try { await atelierClient.execute('ALTER TABLE services ADD COLUMN requirement_fields TEXT'); } catch (_e) { }
  try { await atelierClient.execute('ALTER TABLE service_orders ADD COLUMN revision_count INTEGER DEFAULT 0'); } catch (_e) { }
  try { await atelierClient.execute('ALTER TABLE service_orders ADD COLUMN requirement_answers TEXT'); } catch (_e) { }

  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS pending_verifications (
      token TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      payload TEXT,
      created_at INTEGER NOT NULL
    )
  `);
  try { await atelierClient.execute('ALTER TABLE pending_verifications ADD COLUMN payload TEXT'); } catch (_e) { }

  try { await backfillSlugs(); } catch (e) { console.error('Slug backfill failed (non-fatal):', e); }

  try {
    await seedAtelierOfficialAgents();
    await seedCommunityAgents();
  } catch (e) {
    console.error('Atelier seed failed (non-fatal):', e);
  }

  try {
    await backfillProviderModels();
  } catch (e) {
    console.error('Atelier model backfill failed (non-fatal):', e);
  }

  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS partner_channels (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      wallet_address TEXT,
      fee_split_bps INTEGER NOT NULL DEFAULT 5000,
      api_key_hash TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS agent_partner_listings (
      agent_id TEXT NOT NULL,
      partner_slug TEXT NOT NULL,
      curated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (agent_id, partner_slug),
      FOREIGN KEY (agent_id) REFERENCES atelier_agents(id),
      FOREIGN KEY (partner_slug) REFERENCES partner_channels(slug)
    )
  `);
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_agent_partner_listings_partner ON agent_partner_listings(partner_slug)');

  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS partner_payouts (
      id TEXT PRIMARY KEY,
      partner_slug TEXT NOT NULL,
      order_id TEXT NOT NULL,
      amount_usd TEXT NOT NULL,
      tx_hash TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      paid_at DATETIME,
      FOREIGN KEY (partner_slug) REFERENCES partner_channels(slug),
      FOREIGN KEY (order_id) REFERENCES service_orders(id)
    )
  `);
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_partner_payouts_partner ON partner_payouts(partner_slug, created_at DESC)');
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_partner_payouts_order ON partner_payouts(order_id)');
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_partner_payouts_status ON partner_payouts(status)');

  try { await atelierClient.execute('ALTER TABLE service_orders ADD COLUMN referral_partner TEXT'); } catch (_e) { }
  await atelierClient.execute('CREATE INDEX IF NOT EXISTS idx_service_orders_referral ON service_orders(referral_partner)');

  try {
    await atelierClient.execute(
      "UPDATE service_orders SET completed_at = COALESCE(delivered_at, created_at) WHERE status = 'completed' AND completed_at IS NULL",
    );
  } catch (e) { console.error('completed_at backfill failed (non-fatal):', e); }

  initialized = true;
}

async function backfillSlugs(): Promise<void> {
  const result = await atelierClient.execute('SELECT id, name FROM atelier_agents WHERE slug IS NULL');
  for (const row of result.rows) {
    const r = row as unknown as { id: string; name: string };
    let base = slugify(r.name);
    if (!base) base = r.id;
    let slug = base;
    let suffix = 1;
    while (true) {
      const existing = await atelierClient.execute({ sql: 'SELECT id FROM atelier_agents WHERE slug = ? AND id != ?', args: [slug, r.id] });
      if (existing.rows.length === 0) break;
      slug = `${base}-${suffix++}`;
    }
    await atelierClient.execute({ sql: 'UPDATE atelier_agents SET slug = ? WHERE id = ?', args: [slug, r.id] });
  }
}

// ─── Seed Official Agents ───

async function seedAtelierOfficialAgents(): Promise<void> {
  const agents = [
    {
      id: 'agent_atelier_animestudio',
      slug: 'animestudio',
      name: 'AnimeStudio',
      description: 'On-demand anime-style images and videos. Consistent character design, manga panels, and vibrant anime aesthetics — generate exactly what you need, when you need it.',
      avatar_url: 'https://awbojlikpadohvp1.public.blob.vercel-storage.com/atelier-avatars/animestudio-gsUMZzmSTICYY4vpAK9TB6jRZvuKNf.png',
    },
    {
      id: 'agent_atelier_ugcfactory',
      slug: 'ugc-factory',
      name: 'UGC Factory',
      description: 'On-demand UGC content in authentic creator aesthetics. Talking-head clips, brand videos, and scroll-native social content — shot like a real creator, delivered fast.',
      avatar_url: 'https://awbojlikpadohvp1.public.blob.vercel-storage.com/atelier-avatars/ugcfactory-JxBJHQoxj1LJyPWjnpfsrvQwIwgv2S.png',
    },
    {
      id: 'agent_atelier_lenscraft',
      slug: 'lenscraft',
      name: 'LensCraft',
      description: 'Studio-quality product photography on demand. Clean backgrounds, lifestyle flatlays, hero shots, and detail close-ups — unlimited renders in a consistent premium style.',
      avatar_url: 'https://awbojlikpadohvp1.public.blob.vercel-storage.com/atelier-avatars/lenscraft-8N9SqsrbOdpPtfWLWrFQ71knF8CYzS.png',
    },
  ];

  const ATELIER_OWNER_WALLET = 'EZkoXXZ5HEWdKwfv7wua7k6Dqv8aQxxHWNakq2gG2Qpb';

  for (const a of agents) {
    await atelierClient.execute({
      sql: `INSERT INTO atelier_agents (id, slug, name, description, avatar_url, source, verified, blue_check, is_atelier_official, owner_wallet)
            VALUES (?, ?, ?, ?, ?, 'official', 1, 1, 0, ?)
            ON CONFLICT(id) DO NOTHING`,
      args: [a.id, a.slug, a.name, a.description, a.avatar_url, ATELIER_OWNER_WALLET],
    });
  }

  const services: Array<{
    id: string;
    agent_id: string;
    category: string;
    title: string;
    description: string;
    price_usd: string;
    provider_key: string;
    provider_model: string;
    turnaround_hours?: number;
    system_prompt?: string;
    quota_limit?: number;
  }> = [
    {
      id: 'svc_animestudio_images',
      agent_id: 'agent_atelier_animestudio',
      category: 'image_gen',
      title: 'Anime Image Pack — 15 Images',
      description: '15 anime-style images you generate on demand. Open your workspace, submit prompts one at a time, and get consistent character designs, manga panels, or social content — all in a cohesive visual style. 24h to use all generations.',
      price_usd: '25.00',
      provider_key: 'grok',
      provider_model: 'grok-2-image',
      turnaround_hours: 24,
      quota_limit: 15,
      system_prompt: [
        'You are AnimeStudio. Every image you produce MUST be in anime/manga style — no exceptions, regardless of what the user describes.',
        '',
        'ABSOLUTE RULES:',
        '- NEVER generate photorealistic, 3D-rendered, or live-action-looking images. Everything must look hand-drawn in Japanese animation style.',
        '- If the user requests a real person, celebrity, or cartoon character (e.g. "Homer Simpson", "Elon Musk"), reinterpret them fully as an anime character. Capture their recognizable traits (hair color, outfit, body shape) but render entirely in anime style.',
        '- If the user provides a vague or non-visual prompt, interpret it creatively and produce a compelling anime illustration anyway.',
        '',
        'VISUAL STYLE:',
        '- Cel-shaded coloring with clean, confident linework. Lines should be visible and deliberate, not blended or airbrushed.',
        '- Large, expressive eyes with detailed irises, light reflections, and visible pupils. Eyes are the emotional anchor of every character.',
        '- Vibrant, saturated color palette. Use bold contrasts — deep shadows against bright highlights. Avoid muddy, desaturated, or overly muted tones.',
        '- Dynamic compositions: diagonal lines, dramatic perspective, foreshortening, and motion lines where appropriate.',
        '- Hair should have volume, flow, and distinct strands/chunks with specular highlights. Never flat or blobby.',
        '- Backgrounds should complement the mood: painted skies, speed lines, sparkle effects, abstract color gradients, or detailed environments in anime style.',
        '',
        'CHARACTER CONSISTENCY:',
        '- Within a session, maintain consistent character features: same face shape, eye color, hair style, and color palette across all outputs.',
        '- Clothing and accessories should stay consistent unless the user explicitly requests a change.',
        '',
        'SUBSTYLES (adapt based on context):',
        '- Shonen: bold lines, high energy, action poses, intense expressions, speed effects',
        '- Shoujo: softer lines, flower/sparkle motifs, pastel accents, gentle expressions',
        '- Slice-of-life: warm lighting, everyday settings, relaxed poses, cozy atmosphere',
        '- Chibi: super-deformed proportions (large head, small body) for cute/comedic requests',
        '- Dark/seinen: heavier shadows, muted palette with selective color pops, mature tone',
        '',
        'OUTPUT QUALITY:',
        '- Every image should be striking enough for social media, print, or wallpaper use.',
        '- Frame compositions for vertical (9:16) or square (1:1) aspect ratios unless specified otherwise.',
        '- Include fine details: fabric folds, hair physics, atmospheric lighting, subtle textures.',
      ].join('\n'),
    },
    {
      id: 'svc_animestudio_videos',
      agent_id: 'agent_atelier_animestudio',
      category: 'video_gen',
      title: 'Anime Video Pack — 5 Videos',
      description: '5 anime-style short videos you generate on demand. Open your workspace, describe each scene, and get dynamic anime animations with vibrant aesthetics. Perfect for reels, intros, or storytelling. 24h to use all generations.',
      price_usd: '35.00',
      provider_key: 'grok',
      provider_model: 'grok-imagine-video',
      turnaround_hours: 24,
      quota_limit: 5,
      system_prompt: [
        'You are AnimeStudio. Every video you produce MUST be in anime/manga animation style — no exceptions, regardless of what the user describes.',
        '',
        'ABSOLUTE RULES:',
        '- NEVER generate photorealistic, 3D-rendered, or live-action-looking footage. Everything must look like Japanese animation.',
        '- If the user requests a real person, celebrity, or cartoon character, reinterpret them fully as an anime character. Capture recognizable traits but render entirely in anime style.',
        '- If the user provides a vague prompt, interpret it creatively and produce a compelling anime animation.',
        '',
        'VISUAL STYLE:',
        '- Cel-shaded look with clean linework visible throughout the animation.',
        '- Vibrant, saturated colors with bold contrasts. Deep shadows against bright highlights.',
        '- Large, expressive character eyes with detailed irises and light reflections.',
        '- Hair with volume, flow, and physics — strands should move naturally with character motion.',
        '- Anime-style motion: exaggerated key poses, dynamic camera angles, speed lines, impact frames, and smear frames for fast action.',
        '',
        'ANIMATION QUALITY:',
        '- Smooth, fluid character movement. Avoid stiff or robotic motion.',
        '- Include secondary motion: hair bounce, clothing sway, environmental particles.',
        '- Camera work should feel cinematic: slow pans, dramatic zooms, parallax depth on backgrounds.',
        '- Backgrounds in painted anime style — not photographic or 3D.',
        '',
        'CHARACTER CONSISTENCY:',
        '- Maintain consistent character features across all frames: face shape, eye color, hair style, outfit.',
        '- Within a session, characters should look the same across all generated videos.',
        '',
        'SUBSTYLES (adapt based on context):',
        '- Action/shonen: fast cuts, impact effects, energy auras, speed lines',
        '- Emotional/shoujo: slow motion, particle effects (petals, sparkles), soft lighting transitions',
        '- Slice-of-life: gentle pacing, warm color grading, everyday environments',
        '- Opening/intro: dynamic montage feel, title-card energy, music-video pacing',
      ].join('\n'),
    },
    {
      id: 'svc_ugcfactory_day',
      agent_id: 'agent_atelier_ugcfactory',
      category: 'ugc',
      title: 'UGC Talking Video — 1 Clip (5s)',
      description: 'One 5-second UGC video of a human influencer talking about your topic. Upload a photo of the character you want on camera — or skip it and the agent casts a random creator for you. Give the line to say word-for-word or just the vibe; if your script runs long, the agent tightens it to fit 5 seconds without losing the point. Delivered in under 4 hours.',
      price_usd: '5.00',
      provider_key: 'higgsfield',
      provider_model: 'talking_avatar',
      turnaround_hours: 4,
      quota_limit: 1,
      system_prompt: [
        'You are UGC Factory. You produce exactly ONE 5-second UGC video of a human influencer talking directly to camera about the topic the client provides. Every output MUST look like a real creator recorded it on their phone — no exceptions.',
        '',
        'ABSOLUTE RULES:',
        '- Output is always a single 5-second vertical (9:16) talking-head video. Never longer, never shorter, never a still image, never a montage.',
        '- The speaker must be a believable human influencer: natural skin, micro-expressions, realistic lip-sync, eye contact with the lens. Never a cartoon, avatar, or obviously AI-looking face.',
        '- Aesthetic is casual, handheld, phone-shot. Never studio, never cinematic rig, never polished commercial.',
        '- If the client uploads an image, that image IS the character who will speak on camera. Preserve their identity exactly: same face, hair, skin tone, styling. Animate them into the 5-second talking clip.',
        '- If no image is provided, cast a plausible, everyday-looking creator that fits the topic and vibe. Vary age, ethnicity, and style across clients — no default template.',
        '',
        'SCRIPT HANDLING:',
        '- If the client provides an exact line, use it verbatim when it fits naturally inside 5 seconds of spoken delivery (roughly 12–15 words at a conversational pace).',
        '- If the exact line would run longer than 5 seconds, you have full authority to tighten it: cut filler, compress phrasing, keep the hook and payoff. Preserve the core message and tone — never invent claims the client did not make.',
        '- If the client only gives inspiration, a topic, or a vibe, write a short, natural-sounding line (under ~14 words) that a real creator would actually say out loud. No ad-speak, no slogans, no hashtags read aloud.',
        '- Start strong: the first 1–2 words must be a hook. No throat-clearing intros ("Hey guys, so today...").',
        '',
        'VISUAL DIRECTION:',
        '- Framing: selfie-style or arm-length handheld, head-and-shoulders or chest-up, slight off-center composition.',
        '- Lighting: natural and available — window light, ring-light soft glow, golden hour, warm lamp. Never flat studio light.',
        '- Environment: real lived-in spaces (bedroom, kitchen, car, coffee shop, bathroom mirror, street). Background should feel incidental, not staged.',
        '- Motion: subtle handheld sway, natural head movement, gestures appropriate to the line. Avoid robotic stillness and avoid exaggerated dance/action.',
        '- Color: warm, slightly saturated, social-native grading. Subtle grain is welcome. No heavy filters, no cinematic teal-and-orange.',
        '',
        'AUDIO & LIP-SYNC:',
        '- Speech must match mouth movement frame-accurate. Clear diction, conversational pace, believable breath.',
        '- Voice should match the on-screen creator (age, gender presentation, energy). No robotic TTS timbre.',
        '- Ambient room tone is fine; avoid music beds unless the client asks.',
        '',
        'AUTHENTICITY GUARDRAILS:',
        '- No uncanny valley: no waxy skin, no dead eyes, no impossible symmetry, no morphing hands.',
        '- Small imperfections are good: a stray hair, a slight lighting shift, a natural blink, a micro-pause.',
        '- Never include on-screen text, captions, logos, or watermarks unless the client explicitly requests them.',
        '',
        'DELIVERABLE:',
        '- One MP4, 9:16, 5 seconds, with synced audio. That is the entire order — quota is 1.',
      ].join('\n'),
    },
    {
      id: 'svc_lenscraft_day',
      agent_id: 'agent_atelier_lenscraft',
      category: 'brand_content',
      title: 'Product Photography Pack — 30 Renders',
      description: '30 studio-quality product renders you generate on demand. Open your workspace, submit prompts one at a time, and get hero shots, flat-lays, lifestyle compositions, and macro details — all in a consistent premium style. 24h to use all generations.',
      price_usd: '25.00',
      provider_key: 'grok',
      provider_model: 'grok-2-image',
      turnaround_hours: 24,
      quota_limit: 30,
      system_prompt: [
        'You are LensCraft. Every image you produce MUST look like a professional studio product photograph — no exceptions, regardless of what the user describes.',
        '',
        'ABSOLUTE RULES:',
        '- NEVER produce amateur, over-processed, or obviously AI-generated images. Every output must pass as a real product photo from a commercial shoot.',
        '- If the user provides a vague description, interpret it as a product photography brief and produce a premium commercial image.',
        '- Products must always be the hero of the frame. No distracting elements that compete for attention.',
        '- Maintain photographic realism at all times — real materials, real physics, real light behavior.',
        '',
        'LIGHTING:',
        '- Default: three-point studio lighting with key light, fill light, and rim/accent light.',
        '- Soft, diffused main light to minimize harsh shadows on products.',
        '- Strategic rim lighting to separate product from background and define edges.',
        '- Reflections and highlights must feel natural — show material properties (matte, glossy, metallic, translucent).',
        '- For lifestyle shots: natural window light or golden hour feel. Never flat or overcast.',
        '',
        'COMPOSITION STYLES (adapt based on context):',
        '- Hero Shot: dramatic low angle or 3/4 view, single product commanding the frame, shallow depth of field, premium feel',
        '- Flat-lay: top-down arrangement with curated props, balanced whitespace, editorial magazine style',
        '- Lifestyle: product in elegant real-world context (marble counter, wooden desk, linen fabric), environmental storytelling',
        '- Detail/Macro: extreme close-up on textures, materials, craftsmanship, stitching, engraving — show quality',
        '- Catalog/E-commerce: clean white or light gray background, even lighting, informative angle, product fills 80% of frame',
        '- Group/Collection: multiple products arranged with visual hierarchy, consistent spacing, cohesive color story',
        '',
        'PRODUCT PRESENTATION:',
        '- Products must look flawless: no dust, scratches, or imperfections unless intentionally distressed/vintage.',
        '- Show accurate material properties: glass should reflect and refract, metal should gleam, fabric should drape with texture.',
        '- Props should complement, never compete: fresh botanicals, textured surfaces, minimal accessories.',
        '- Color accuracy is critical — maintain true-to-life product colors under all lighting conditions.',
        '',
        'BRAND CONSISTENCY:',
        '- Within a session, maintain consistent lighting temperature, color grading, and compositional style across all outputs.',
        '- If the user establishes a brand direction (warm, cool, minimal, luxe), carry it through every image.',
        '- Background choices should remain consistent unless explicitly changed.',
        '',
        'OUTPUT QUALITY:',
        '- Every image should be e-commerce ready, social media worthy, and print-quality.',
        '- Sharp focus on the product with intentional depth of field.',
        '- Clean, distraction-free compositions.',
        '- Frame for square (1:1) by default for e-commerce versatility, or vertical (9:16) for social.',
      ].join('\n'),
    },
  ];

  for (const s of services) {
    await atelierClient.execute({
      sql: `INSERT INTO services (id, agent_id, category, title, description, price_usd, price_type, turnaround_hours, deliverables, portfolio_post_ids, provider_key, provider_model, system_prompt, quota_limit)
            VALUES (?, ?, ?, ?, ?, ?, 'fixed', ?, '[]', '[]', ?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING`,
      args: [s.id, s.agent_id, s.category, s.title, s.description, s.price_usd, s.turnaround_hours || 1, s.provider_key, s.provider_model, s.system_prompt || null, s.quota_limit || 0],
    });
  }
}

// ─── Seed Community Agents (fake, for social proof) ───

async function seedCommunityAgents(): Promise<void> {
  const agents = [
    {
      id: 'ext_community_godpixel',
      slug: 'g0d-pixel',
      name: 'g0d_pixel',
      description: 'pixel art but actually good. sprites, pfps, banners, whatever. no anime garbage.',
      avatar_url: 'https://awbojlikpadohvp1.public.blob.vercel-storage.com/atelier-avatars/community/g0d_pixel-1772232994871.png',
      owner_wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    },
    {
      id: 'ext_community_brandooor',
      slug: 'brandooor',
      name: 'BRANDOOOR',
      description: 'logos and brand visuals that dont look like they came from fiverr. clean mockups, identity systems, the works.',
      avatar_url: 'https://awbojlikpadohvp1.public.blob.vercel-storage.com/atelier-avatars/community/BRANDOOOR-1772232995494.png',
      owner_wallet: '3fTR8GGL2mniGyHtd3Qy2KDVYoFfzjsXM1zMKRKk5VRz',
    },
    {
      id: 'ext_community_clipmaxxing',
      slug: 'clipmaxxing',
      name: 'clipmaxxing',
      description: 'short form content that actually converts. hooks, cuts, transitions — optimized for the algo.',
      avatar_url: 'https://awbojlikpadohvp1.public.blob.vercel-storage.com/atelier-avatars/community/clipmaxxing-1772232996329.png',
      owner_wallet: 'BPFLoaderUpgradeab1e11111111111111111111111',
    },
    {
      id: 'ext_community_moodboardwitch',
      slug: 'moodboard-witch',
      name: 'moodboard_witch',
      description: 'aesthetic moodboards and influencer visuals. pinterest-core, fashion, beauty, lifestyle. dm for custom palettes.',
      avatar_url: 'https://awbojlikpadohvp1.public.blob.vercel-storage.com/atelier-avatars/community/moodboard_witch-1772232997045.png',
      owner_wallet: '9WzDXwBbmPELFzWaj4SsfTRR5g4nnKqGfoKMc1B3SLNZ',
    },
  ];

  const communityServices = [
    {
      id: 'svc_godpixel_pack',
      agent_id: 'ext_community_godpixel',
      category: 'image_gen',
      title: 'Pixel Art Pack — 20 Images',
      description: '20 pixel art images. sprites, characters, items, tilesets, whatever you need. 8-bit to 32-bit styles. 24h to use all generations.',
      price_usd: '15.00',
      turnaround_hours: 24,
      quota_limit: 20,
    },
    {
      id: 'svc_brandooor_pack',
      agent_id: 'ext_community_brandooor',
      category: 'brand_content',
      title: 'Brand Identity Pack — 10 Renders',
      description: '10 brand visuals on demand. logo concepts, mockups, social templates, identity explorations. 24h to use all generations.',
      price_usd: '30.00',
      turnaround_hours: 24,
      quota_limit: 10,
    },
    {
      id: 'svc_clipmaxxing_pack',
      agent_id: 'ext_community_clipmaxxing',
      category: 'video_gen',
      title: 'Short Video Pack — 3 Videos',
      description: '3 short-form videos optimized for tiktok, reels, shorts. hook-first, trending formats, platform-native. 24h to use all generations.',
      price_usd: '20.00',
      turnaround_hours: 24,
      quota_limit: 3,
    },
    {
      id: 'svc_moodboardwitch_pack',
      agent_id: 'ext_community_moodboardwitch',
      category: 'influencer',
      title: 'Moodboard Pack — 15 Images',
      description: '15 aesthetic moodboard visuals. fashion, beauty, lifestyle, editorial. pinterest-ready compositions. 24h to use all generations.',
      price_usd: '18.00',
      turnaround_hours: 24,
      quota_limit: 15,
    },
  ];

  for (const a of agents) {
    await atelierClient.execute({
      sql: `INSERT INTO atelier_agents (id, slug, name, description, avatar_url, source, verified, blue_check, is_atelier_official, owner_wallet)
            VALUES (?, ?, ?, ?, ?, 'external', 0, 0, 0, ?)
            ON CONFLICT(id) DO UPDATE SET slug = COALESCE(atelier_agents.slug, ?), description = ?, avatar_url = ?`,
      args: [a.id, a.slug, a.name, a.description, a.avatar_url, a.owner_wallet, a.slug, a.description, a.avatar_url],
    });
  }

  for (const s of communityServices) {
    await atelierClient.execute({
      sql: `INSERT INTO services (id, agent_id, category, title, description, price_usd, price_type, turnaround_hours, deliverables, portfolio_post_ids, provider_key, provider_model, quota_limit)
            VALUES (?, ?, ?, ?, ?, ?, 'fixed', ?, '[]', '[]', 'grok', 'grok-2-image', ?)
            ON CONFLICT(id) DO UPDATE SET
              title = excluded.title,
              description = excluded.description,
              price_usd = excluded.price_usd,
              turnaround_hours = excluded.turnaround_hours,
              quota_limit = excluded.quota_limit`,
      args: [s.id, s.agent_id, s.category, s.title, s.description, s.price_usd, s.turnaround_hours, s.quota_limit],
    });
  }
}

const MANUAL_SERVICE_MODELS: Record<string, string> = {
  'svc_1772558582797_8mpxs4cb1': 'Nano Banana 2',
};

async function backfillProviderModels(): Promise<void> {
  for (const [svcId, model] of Object.entries(MANUAL_SERVICE_MODELS)) {
    await atelierClient.execute({ sql: 'UPDATE services SET provider_model = ? WHERE id = ? AND (provider_model IS NULL OR provider_model = ?)', args: [model, svcId, model] });
  }

  const result = await atelierClient.execute(`
    SELECT s.id, s.title, s.description as svc_desc, a.name as agent_name, a.description as agent_desc
    FROM services s
    JOIN atelier_agents a ON a.id = s.agent_id
    WHERE s.active = 1 AND (s.provider_model IS NULL OR s.provider_model = '')
  `);

  for (const row of result.rows) {
    const r = row as unknown as { id: string; title: string; svc_desc: string | null; agent_name: string; agent_desc: string | null };
    const combined = [r.agent_name, r.agent_desc, r.title, r.svc_desc].filter(Boolean).join(' ');
    const model = inferModelFromText(combined);
    if (model) {
      await atelierClient.execute({ sql: 'UPDATE services SET provider_model = ? WHERE id = ?', args: [model, r.id] });
    }
  }
}

// ─── Types ───

export type ServiceCategory = 'image_gen' | 'video_gen' | 'ugc' | 'influencer' | 'brand_content' | 'coding' | 'analytics' | 'seo' | 'trading' | 'automation' | 'consulting' | 'custom';
export type ServicePriceType = 'fixed' | 'quote' | 'weekly' | 'monthly';
export type OrderStatus = 'pending_quote' | 'quoted' | 'accepted' | 'paid' | 'in_progress' | 'delivered' | 'revision_requested' | 'completed' | 'disputed' | 'cancelled';
export type BountyStatus = 'open' | 'claimed' | 'completed' | 'expired' | 'cancelled' | 'disputed';

export type RequirementFieldType = 'text' | 'url' | 'select' | 'number' | 'textarea';

export interface RequirementField {
  label: string;
  type: RequirementFieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
}
export type BountyClaimStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export interface AtelierAgent {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  bio: string | null;
  source: 'atelier' | 'external' | 'official';
  endpoint_url: string | null;
  capabilities: string;
  api_key: string | null;
  verified: number;
  blue_check: number;
  is_atelier_official: number;
  active: number;
  total_orders: number;
  completed_orders: number;
  avg_rating: number | null;
  twitter_username: string | null;
  twitter_verification_code: string | null;
  bankr_wallet: string | null;
  owner_wallet: string | null;
  payout_wallet: string | null;
  partner_badge: string | null;
  token_mint: string | null;
  token_name: string | null;
  token_symbol: string | null;
  token_image_url: string | null;
  token_mode: 'pumpfun' | 'byot' | null;
  token_creator_wallet: string | null;
  token_tx_hash: string | null;
  token_created_at: string | null;
  token_launch_attempted: number;
  ai_models: string | null;
  last_poll_at: string | null;
  atelier_holder: number;
  holder_checked_at: string | null;
  said_wallet: string | null;
  said_pda: string | null;
  said_secret_key: string | null;
  said_tx_hash: string | null;
  privy_user_id: string | null;
  webhook_secret: string | null;
  created_at: string;
}

export class DuplicateAgentError extends Error {
  constructor(public readonly existingAgent: AtelierAgent) {
    super('Duplicate agent detected');
    this.name = 'DuplicateAgentError';
  }
}

export function getPayoutWallet(agent: AtelierAgent): string | null {
  return agent.payout_wallet || agent.owner_wallet;
}

export interface AtelierAgentListItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  source: 'atelier' | 'external' | 'official';
  verified: number;
  blue_check: number;
  is_atelier_official: number;
  partner_badge: string | null;
  services_count: number;
  avg_rating: number | null;
  total_orders: number;
  completed_orders: number;
  total_revenue: number;
  categories: string[];
  provider_models: string[];
  token_mint: string | null;
  token_symbol: string | null;
  token_name: string | null;
  token_image_url: string | null;
  atelier_holder: number;
  featured: number;
  min_price_usd: number | null;
}

export interface Service {
  id: string;
  agent_id: string;
  agent_name: string;
  agent_slug: string;
  agent_avatar_url: string | null;
  category: ServiceCategory;
  title: string;
  description: string;
  price_usd: string;
  price_type: ServicePriceType;
  turnaround_hours: number;
  deliverables: string;
  portfolio_post_ids: string;
  demo_url: string | null;
  active: number;
  total_orders: number;
  completed_orders: number;
  avg_rating: number | null;
  verified: number;
  blue_check: number;
  has_bankr_wallet: number;
  provider_key: string | null;
  provider_model: string | null;
  system_prompt: string | null;
  quota_limit: number;
  max_revisions: number;
  requirement_fields: string | null;
  is_atelier_official: number;
  partner_badge: string | null;
  created_at: string;
}

export interface ServiceOrder {
  id: string;
  service_id: string | null;
  service_title: string | null;
  client_agent_id: string | null;
  client_wallet: string | null;
  client_name: string | null;
  provider_agent_id: string;
  provider_name: string;
  provider_slug: string | null;
  brief: string;
  reference_urls: string | null;
  reference_images: string | null;
  quoted_price_usd: string | null;
  platform_fee_usd: string | null;
  payment_method: string | null;
  status: OrderStatus;
  escrow_tx_hash: string | null;
  payout_tx_hash: string | null;
  deliverable_post_id: number | null;
  deliverable_url: string | null;
  deliverable_media_type: 'image' | 'video' | 'link' | 'document' | 'code' | 'text' | null;
  quota_total: number;
  quota_used: number;
  workspace_expires_at: string | null;
  revision_count: number;
  max_revisions: number;
  delivered_at: string | null;
  review_deadline: string | null;
  requirement_answers: string | null;
  bounty_id: string | null;
  referral_partner: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface Bounty {
  id: string;
  poster_wallet: string;
  title: string;
  brief: string;
  category: ServiceCategory;
  budget_usd: string;
  deadline_hours: number;
  reference_urls: string | null;
  reference_images: string | null;
  status: BountyStatus;
  accepted_claim_id: string | null;
  order_id: string | null;
  expires_at: string;
  created_at: string;
}

export interface BountyListItem extends Bounty {
  poster_display_name: string | null;
  claims_count: number;
}

export interface BountyClaim {
  id: string;
  bounty_id: string;
  agent_id: string;
  claimant_wallet: string | null;
  message: string | null;
  status: BountyClaimStatus;
  created_at: string;
}

export interface BountyClaimWithAgent extends BountyClaim {
  agent_name: string;
  agent_slug: string;
  agent_avatar_url: string | null;
  agent_avg_rating: number | null;
  agent_completed_orders: number;
  agent_token_mint: string | null;
  agent_token_symbol: string | null;
}

export interface OrderDeliverable {
  id: string;
  order_id: string;
  prompt: string;
  deliverable_url: string | null;
  deliverable_media_type: 'image' | 'video' | 'link' | 'document' | 'code' | 'text' | null;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  error: string | null;
  created_at: string;
}

export interface ServiceReview {
  id: string;
  order_id: string;
  service_id: string | null;
  reviewer_agent_id: string;
  reviewer_name: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface AtelierProfile {
  wallet: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  twitter_handle: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentTokenInfo {
  token_mint: string | null;
  token_name: string | null;
  token_symbol: string | null;
  token_image_url: string | null;
  token_mode: 'pumpfun' | 'byot' | null;
  token_creator_wallet: string | null;
  token_tx_hash: string | null;
  token_created_at: string | null;
  token_launch_attempted: number;
}

export interface RecentAgentOrder {
  id: string;
  service_title: string;
  client_wallet: string | null;
  client_display_name: string | null;
  quoted_price_usd: string | null;
  status: OrderStatus;
  created_at: string;
}

// ─── Cross-DB Sync ───

export async function ensureAtelierAgent(coreAgent: {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  bio: string | null;
  verified: number;
  blue_check: number;
  is_atelier_official: number;
  twitter_username: string | null;
  bankr_wallet: string | null;
  owner_wallet: string | null;
  token_mint: string | null;
  token_name: string | null;
  token_symbol: string | null;
  token_image_url: string | null;
  token_mode: 'pumpfun' | 'byot' | null;
  token_creator_wallet: string | null;
  token_tx_hash: string | null;
  token_created_at: string | null;
}): Promise<AtelierAgent> {
  await initAtelierDb();
  const source = coreAgent.is_atelier_official ? 'official' : 'atelier';

  let base = slugify(coreAgent.name);
  if (!base) base = coreAgent.id;
  let slug = base;
  let suffix = 1;
  while (true) {
    const existing = await atelierClient.execute({ sql: 'SELECT id FROM atelier_agents WHERE slug = ? AND id != ?', args: [slug, coreAgent.id] });
    if (existing.rows.length === 0) break;
    slug = `${base}-${suffix++}`;
  }

  await atelierClient.execute({
    sql: `INSERT INTO atelier_agents (id, slug, name, description, avatar_url, bio, source, verified, blue_check, is_atelier_official, twitter_username, bankr_wallet, owner_wallet, token_mint, token_name, token_symbol, token_image_url, token_mode, token_creator_wallet, token_tx_hash, token_created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            slug = COALESCE(atelier_agents.slug, ?),
            name = ?, description = ?, avatar_url = ?, bio = ?, source = ?,
            verified = ?, blue_check = ?, is_atelier_official = ?,
            twitter_username = ?, bankr_wallet = ?, owner_wallet = ?,
            token_mint = COALESCE(atelier_agents.token_mint, ?),
            token_name = COALESCE(atelier_agents.token_name, ?),
            token_symbol = COALESCE(atelier_agents.token_symbol, ?),
            token_image_url = COALESCE(atelier_agents.token_image_url, ?),
            token_mode = COALESCE(atelier_agents.token_mode, ?),
            token_creator_wallet = COALESCE(atelier_agents.token_creator_wallet, ?),
            token_tx_hash = COALESCE(atelier_agents.token_tx_hash, ?),
            token_created_at = COALESCE(atelier_agents.token_created_at, ?)`,
    args: [
      coreAgent.id, slug, coreAgent.name, coreAgent.description, coreAgent.avatar_url,
      coreAgent.bio, source, coreAgent.verified, coreAgent.blue_check,
      coreAgent.is_atelier_official, coreAgent.twitter_username, coreAgent.bankr_wallet,
      coreAgent.owner_wallet, coreAgent.token_mint, coreAgent.token_name,
      coreAgent.token_symbol, coreAgent.token_image_url, coreAgent.token_mode,
      coreAgent.token_creator_wallet, coreAgent.token_tx_hash, coreAgent.token_created_at,
      // ON CONFLICT update values
      slug,
      coreAgent.name, coreAgent.description, coreAgent.avatar_url, coreAgent.bio, source,
      coreAgent.verified, coreAgent.blue_check, coreAgent.is_atelier_official,
      coreAgent.twitter_username, coreAgent.bankr_wallet, coreAgent.owner_wallet,
      coreAgent.token_mint, coreAgent.token_name, coreAgent.token_symbol,
      coreAgent.token_image_url, coreAgent.token_mode, coreAgent.token_creator_wallet,
      coreAgent.token_tx_hash, coreAgent.token_created_at,
    ],
  });

  return (await getAtelierAgent(coreAgent.id))!;
}

// ─── Agent Queries ───

export async function getAtelierAgent(id: string): Promise<AtelierAgent | null> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM atelier_agents WHERE id = ? AND active = 1',
    args: [id],
  });
  return result.rows[0] ? (result.rows[0] as unknown as AtelierAgent) : null;
}

export async function getAtelierAgentBySlug(slug: string): Promise<AtelierAgent | null> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM atelier_agents WHERE slug = ? AND active = 1',
    args: [slug],
  });
  return result.rows[0] ? (result.rows[0] as unknown as AtelierAgent) : null;
}

export async function resolveAgent(idOrSlug: string): Promise<AtelierAgent | null> {
  return (await getAtelierAgentBySlug(idOrSlug)) ?? (await getAtelierAgent(idOrSlug));
}

export async function getAtelierAgentByApiKey(apiKey: string): Promise<AtelierAgent | null> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM atelier_agents WHERE api_key = ? AND active = 1',
    args: [apiKey],
  });
  return result.rows[0] ? (result.rows[0] as unknown as AtelierAgent) : null;
}

export async function getAtelierAgentsByWallet(ownerWallet: string): Promise<AtelierAgent[]> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM atelier_agents WHERE owner_wallet = ? AND active = 1',
    args: [ownerWallet],
  });
  const agents = result.rows as unknown as AtelierAgent[];

  for (const agent of agents) {
    if (!agent.api_key) {
      const apiKey = `atelier_${randomBytes(24).toString('hex')}`;
      await atelierClient.execute({
        sql: 'UPDATE atelier_agents SET api_key = ? WHERE id = ? AND api_key IS NULL',
        args: [apiKey, agent.id],
      });
      agent.api_key = apiKey;
    }
  }

  return agents;
}

export async function getAtelierAgentsByPrivyUser(privyUserId: string): Promise<AtelierAgent[]> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM atelier_agents WHERE privy_user_id = ? AND active = 1',
    args: [privyUserId],
  });
  const agents = result.rows as unknown as AtelierAgent[];

  for (const agent of agents) {
    if (!agent.api_key) {
      const apiKey = `atelier_${randomBytes(24).toString('hex')}`;
      await atelierClient.execute({
        sql: 'UPDATE atelier_agents SET api_key = ? WHERE id = ? AND api_key IS NULL',
        args: [apiKey, agent.id],
      });
      agent.api_key = apiKey;
    }
  }

  return agents;
}

export async function getPendingOrderCountForAgent(agentId: string): Promise<number> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: `SELECT COUNT(*) as cnt FROM service_orders WHERE provider_agent_id = ? AND status IN ('paid', 'in_progress')`,
    args: [agentId],
  });
  const row = result.rows[0] as unknown as { cnt: number };
  return row?.cnt ?? 0;
}

export async function updateAgentLastPoll(agentId: string): Promise<void> {
  await initAtelierDb();
  await atelierClient.execute({
    sql: 'UPDATE atelier_agents SET last_poll_at = CURRENT_TIMESTAMP WHERE id = ?',
    args: [agentId],
  });
}

export async function findRecentDuplicateAgent(data: {
  name: string;
  description: string;
  owner_wallet?: string;
  twitter_username?: string;
}): Promise<AtelierAgent | null> {
  await initAtelierDb();

  if (data.owner_wallet) {
    const result = await atelierClient.execute({
      sql: `SELECT * FROM atelier_agents
            WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
            AND owner_wallet = ?
            AND active = 1
            AND created_at > datetime('now', '-24 hours')
            ORDER BY created_at DESC
            LIMIT 1`,
      args: [data.name, data.owner_wallet],
    });
    if (result.rows.length > 0) return result.rows[0] as unknown as AtelierAgent;
  }

  if (data.twitter_username) {
    const result = await atelierClient.execute({
      sql: `SELECT * FROM atelier_agents
            WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
            AND LOWER(twitter_username) = LOWER(?)
            AND active = 1
            AND created_at > datetime('now', '-24 hours')
            ORDER BY created_at DESC
            LIMIT 1`,
      args: [data.name, data.twitter_username],
    });
    if (result.rows.length > 0) return result.rows[0] as unknown as AtelierAgent;
  }

  const result = await atelierClient.execute({
    sql: `SELECT * FROM atelier_agents
          WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
          AND LOWER(TRIM(description)) = LOWER(TRIM(?))
          AND active = 1
          AND created_at > datetime('now', '-1 hour')
          ORDER BY created_at DESC
          LIMIT 1`,
    args: [data.name, data.description],
  });
  if (result.rows.length > 0) return result.rows[0] as unknown as AtelierAgent;

  return null;
}

export async function getAtelierAgentsByTwitterUsername(twitterUsername: string): Promise<AtelierAgent[]> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM atelier_agents WHERE LOWER(twitter_username) = LOWER(?) AND active = 1',
    args: [twitterUsername],
  });
  return result.rows as unknown as AtelierAgent[];
}

export async function registerAtelierAgent(data: {
  name: string;
  description: string;
  avatar_url?: string;
  endpoint_url?: string;
  capabilities?: string[];
  ai_models?: string[];
  owner_wallet?: string;
  twitter_verification_code?: string;
  twitter_username?: string;
}): Promise<{ agent_id: string; api_key: string; slug: string; twitter_verification_code: string; webhook_secret: string | null }> {
  await initAtelierDb();

  const duplicate = await findRecentDuplicateAgent({
    name: data.name,
    description: data.description,
    owner_wallet: data.owner_wallet,
    twitter_username: data.twitter_username,
  });
  if (duplicate) throw new DuplicateAgentError(duplicate);

  const id = `ext_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const apiKey = `atelier_${randomBytes(24).toString('hex')}`;
  const capabilities = JSON.stringify(data.capabilities || []);
  const verificationCode = data.twitter_verification_code || randomBytes(3).toString('hex').toUpperCase();

  let base = slugify(data.name);
  if (!base) base = id;
  let slug = base;
  let suffix = 1;
  while (true) {
    const existing = await atelierClient.execute({ sql: 'SELECT id FROM atelier_agents WHERE slug = ?', args: [slug] });
    if (existing.rows.length === 0) break;
    slug = `${base}-${suffix++}`;
  }

  const aiModels = data.ai_models?.length ? JSON.stringify(data.ai_models) : null;
  const webhookSecret = data.endpoint_url ? `whsec_${randomBytes(32).toString('hex')}` : null;

  await atelierClient.execute({
    sql: `INSERT INTO atelier_agents (id, slug, name, description, avatar_url, source, endpoint_url, capabilities, api_key, owner_wallet, twitter_verification_code, twitter_username, ai_models, webhook_secret)
          VALUES (?, ?, ?, ?, ?, 'external', ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, slug, data.name, data.description, data.avatar_url || null, data.endpoint_url || null, capabilities, apiKey, data.owner_wallet || null, verificationCode, data.twitter_username || null, aiModels, webhookSecret],
  });

  return { agent_id: id, api_key: apiKey, slug, twitter_verification_code: verificationCode, webhook_secret: webhookSecret };
}

export async function updateAtelierAgent(
  id: string,
  updates: Partial<Pick<AtelierAgent, 'name' | 'description' | 'avatar_url' | 'endpoint_url' | 'capabilities' | 'ai_models' | 'payout_wallet' | 'owner_wallet' | 'twitter_username' | 'privy_user_id' | 'webhook_secret'>>
): Promise<AtelierAgent | null> {
  await initAtelierDb();
  const setClauses: string[] = [];
  const args: (string | null)[] = [];

  const fields: (keyof typeof updates)[] = ['name', 'description', 'avatar_url', 'endpoint_url', 'capabilities', 'ai_models', 'payout_wallet', 'owner_wallet', 'twitter_username', 'privy_user_id', 'webhook_secret'];
  for (const field of fields) {
    if (updates[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      args.push(updates[field] as string | null);
    }
  }

  if (setClauses.length === 0) return getAtelierAgent(id);

  args.push(id);
  await atelierClient.execute({
    sql: `UPDATE atelier_agents SET ${setClauses.join(', ')} WHERE id = ? AND active = 1`,
    args,
  });

  return getAtelierAgent(id);
}

export async function setSAIDIdentity(
  agentId: string,
  data: { wallet: string; pda: string; secretKey: string; txHash: string }
): Promise<void> {
  await initAtelierDb();
  await atelierClient.execute({
    sql: `UPDATE atelier_agents SET said_wallet = ?, said_pda = ?, said_secret_key = ?, said_tx_hash = ? WHERE id = ?`,
    args: [data.wallet, data.pda, data.secretKey, data.txHash, agentId],
  });
}

export async function getAgentsWithoutSAID(): Promise<AtelierAgent[]> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: `SELECT * FROM atelier_agents WHERE active = 1 AND (said_wallet IS NULL OR said_wallet = '')`,
    args: [],
  });
  return result.rows as unknown as AtelierAgent[];
}

export async function getDistinctProviderModels(): Promise<string[]> {
  await initAtelierDb();
  const [serviceResult, agentResult] = await Promise.all([
    atelierClient.execute({
      sql: `SELECT DISTINCT s.provider_model AS model
            FROM services s
            INNER JOIN atelier_agents a ON a.id = s.agent_id AND a.active = 1
            WHERE s.active = 1 AND s.provider_model IS NOT NULL AND s.provider_model != ''`,
      args: [],
    }),
    atelierClient.execute({
      sql: `SELECT ai_models FROM atelier_agents WHERE active = 1 AND ai_models IS NOT NULL AND ai_models != ''`,
      args: [],
    }),
  ]);

  const models = new Set<string>();
  for (const r of serviceResult.rows) {
    models.add((r as unknown as { model: string }).model);
  }
  for (const r of agentResult.rows) {
    try {
      const parsed: string[] = JSON.parse((r as unknown as { ai_models: string }).ai_models);
      for (const m of parsed) if (m) models.add(m);
    } catch { /* skip malformed */ }
  }

  return Array.from(models).sort();
}

export async function getAtelierAgents(filters?: {
  category?: ServiceCategory;
  search?: string;
  source?: 'atelier' | 'external' | 'official' | 'all';
  sortBy?: 'popular' | 'newest' | 'rating';
  model?: string;
  limit?: number;
  offset?: number;
}): Promise<AtelierAgentListItem[]> {
  await initAtelierDb();

  const limit = Math.min(filters?.limit || 24, 100);
  const offset = filters?.offset || 0;
  const search = filters?.search?.trim();
  const source = filters?.source || 'all';

  const conditions: string[] = ['a.active = 1'];
  const args: (string | number)[] = [];

  if (source === 'official') {
    conditions.push("a.source = 'official'");
  } else if (source === 'atelier') {
    conditions.push("a.source IN ('atelier', 'agentgram', 'official')");
    conditions.push('a.is_atelier_official = 0');
  } else if (source === 'external') {
    conditions.push("a.source = 'external'");
  }

  if (filters?.category) {
    conditions.push('s.category = ?');
    args.push(filters.category);
  }
  if (search) {
    conditions.push("(a.name LIKE ? ESCAPE '\\' OR a.description LIKE ? ESCAPE '\\' OR s.title LIKE ? ESCAPE '\\')");
    const pat = `%${escapeLikePattern(search)}%`;
    args.push(pat, pat, pat);
  }
  if (filters?.model) {
    conditions.push("(s.provider_model = ? OR a.ai_models LIKE ? ESCAPE '\\')");
    args.push(filters.model, `%"${escapeLikePattern(filters.model)}"%`);
  }

  let orderClause: string;
  switch (filters?.sortBy) {
    case 'newest': orderClause = 'a.created_at DESC'; break;
    case 'rating': orderClause = 'MAX(s.avg_rating) DESC NULLS LAST'; break;
    default: orderClause = 'a.featured DESC, completed_orders DESC, COALESCE(MAX(s.avg_rating), 0) DESC, total_revenue DESC, total_orders DESC, services_count DESC'; break;
  }

  args.push(limit, offset);

  const result = await atelierClient.execute({
    sql: `SELECT
            a.id, a.slug, a.name, a.description, a.avatar_url, a.source,
            a.verified, a.blue_check, a.is_atelier_official, a.partner_badge,
            COUNT(DISTINCT s.id) as services_count,
            MAX(s.avg_rating) as avg_rating,
            (SELECT COUNT(*) FROM service_orders WHERE provider_agent_id = a.id AND status IN ('paid','in_progress','delivered','completed','revision_requested')) as total_orders,
            (SELECT COUNT(*) FROM service_orders WHERE provider_agent_id = a.id AND status = 'completed') as completed_orders,
            (SELECT COALESCE(SUM(CAST(quoted_price_usd AS REAL)), 0) FROM service_orders WHERE provider_agent_id = a.id AND status = 'completed') as total_revenue,
            GROUP_CONCAT(DISTINCT s.category) as categories_str,
            GROUP_CONCAT(DISTINCT s.provider_model) as provider_models_str,
            a.ai_models,
            a.token_mint, a.token_symbol, a.token_name, a.token_image_url,
            a.atelier_holder, a.featured,
            MIN(CAST(s.price_usd AS REAL)) as min_price_usd,
            a.created_at
          FROM atelier_agents a
          LEFT JOIN services s ON s.agent_id = a.id AND s.active = 1
          WHERE ${conditions.join(' AND ')}
          GROUP BY a.id
          ORDER BY ${orderClause}
          LIMIT ? OFFSET ?`,
    args,
  });

  return result.rows.map((row) => {
    const r = row as unknown as {
      id: string; slug: string; name: string; description: string | null; avatar_url: string | null;
      source: 'atelier' | 'external' | 'official';
      verified: number; blue_check: number; is_atelier_official: number; partner_badge: string | null;
      services_count: number; avg_rating: number | null; total_orders: number; completed_orders: number;
      total_revenue: number;
      categories_str: string | null;
      provider_models_str: string | null;
      ai_models: string | null;
      token_mint: string | null; token_symbol: string | null; token_name: string | null; token_image_url: string | null;
      atelier_holder: number; featured: number;
      min_price_usd: number | null;
    };

    let categories: string[] = [];
    if (r.categories_str) {
      if (r.source === 'external') {
        try { categories = JSON.parse(r.categories_str); } catch { categories = r.categories_str.split(',').filter(Boolean); }
      } else {
        categories = r.categories_str.split(',').filter(Boolean);
      }
    }

    let provider_models: string[] = [];
    if (r.ai_models) {
      try { provider_models = JSON.parse(r.ai_models); } catch { /* skip */ }
    }
    if (provider_models.length === 0 && r.provider_models_str) {
      provider_models = r.provider_models_str.split(',').filter(Boolean);
    }
    if (provider_models.length === 0 && r.description) {
      const detected = inferModelFromText(r.description);
      if (detected) provider_models = [detected];
    }

    return {
      id: r.id, slug: r.slug, name: r.name, description: r.description, avatar_url: r.avatar_url,
      source: r.source, verified: r.verified, blue_check: r.blue_check,
      is_atelier_official: r.is_atelier_official, partner_badge: r.partner_badge,
      services_count: r.services_count,
      avg_rating: r.avg_rating, total_orders: r.total_orders, completed_orders: r.completed_orders,
      total_revenue: r.total_revenue || 0,
      categories, provider_models,
      token_mint: r.token_mint, token_symbol: r.token_symbol,
      token_name: r.token_name, token_image_url: r.token_image_url,
      atelier_holder: r.atelier_holder || 0,
      featured: r.featured || 0,
      min_price_usd: r.min_price_usd ?? null,
    };
  });
}

// ─── Seller Leaderboard ───

export interface SellerLeaderboardItem {
  id: string;
  slug: string;
  name: string;
  avatar_url: string | null;
  source: 'atelier' | 'external' | 'official';
  verified: number;
  blue_check: number;
  is_atelier_official: number;
  partner_badge: string | null;
  featured: number;
  services_count: number;
  avg_rating: number | null;
  completed_orders: number;
  total_revenue: number;
  weekly_completed_orders: number;
  weekly_revenue: number;
  token_mint: string | null;
  token_symbol: string | null;
  token_image_url: string | null;
  twitter_username: string | null;
  week_start: string;
}

function formatSqliteDatetime(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function isoWeekStartSqlite(now: Date = new Date()): string {
  const day = now.getUTCDay();
  const daysBackToMonday = (day + 6) % 7;
  const monday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysBackToMonday,
    0, 0, 0, 0,
  ));
  return formatSqliteDatetime(monday);
}

export async function getSellerLeaderboard(limit = 100): Promise<SellerLeaderboardItem[]> {
  await initAtelierDb();
  const weekStart = isoWeekStartSqlite();

  const result = await atelierClient.execute({
    sql: `SELECT
            a.id, a.slug, a.name, a.avatar_url, a.source,
            a.verified, a.blue_check, a.is_atelier_official, a.partner_badge, a.featured,
            COUNT(DISTINCT s.id) as services_count,
            MAX(s.avg_rating) as avg_rating,
            (SELECT COUNT(*) FROM service_orders
              WHERE provider_agent_id = a.id AND status = 'completed') as completed_orders,
            (SELECT COALESCE(SUM(CAST(quoted_price_usd AS REAL)), 0) FROM service_orders
              WHERE provider_agent_id = a.id AND status = 'completed') as total_revenue,
            (SELECT COUNT(*) FROM service_orders
              WHERE provider_agent_id = a.id AND status = 'completed'
              AND completed_at >= ?) as weekly_completed_orders,
            (SELECT COALESCE(SUM(CAST(quoted_price_usd AS REAL)), 0) FROM service_orders
              WHERE provider_agent_id = a.id AND status = 'completed'
              AND completed_at >= ?) as weekly_revenue,
            a.token_mint, a.token_symbol, a.token_image_url, a.twitter_username
          FROM atelier_agents a
          LEFT JOIN services s ON s.agent_id = a.id AND s.active = 1
          WHERE a.active = 1
          GROUP BY a.id
          LIMIT ?`,
    args: [weekStart, weekStart, limit],
  });

  return result.rows.map((row) => {
    const r = row as unknown as {
      id: string; slug: string; name: string; avatar_url: string | null;
      source: 'atelier' | 'external' | 'official';
      verified: number; blue_check: number; is_atelier_official: number; partner_badge: string | null;
      featured: number;
      services_count: number; avg_rating: number | null;
      completed_orders: number; total_revenue: number;
      weekly_completed_orders: number; weekly_revenue: number;
      token_mint: string | null; token_symbol: string | null; token_image_url: string | null;
      twitter_username: string | null;
    };
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      avatar_url: r.avatar_url,
      source: r.source,
      verified: r.verified,
      blue_check: r.blue_check,
      is_atelier_official: r.is_atelier_official,
      partner_badge: r.partner_badge,
      featured: r.featured || 0,
      services_count: r.services_count,
      avg_rating: r.avg_rating,
      completed_orders: r.completed_orders,
      total_revenue: r.total_revenue || 0,
      weekly_completed_orders: r.weekly_completed_orders,
      weekly_revenue: r.weekly_revenue || 0,
      token_mint: r.token_mint,
      token_symbol: r.token_symbol,
      token_image_url: r.token_image_url,
      twitter_username: r.twitter_username,
      week_start: weekStart,
    };
  });
}

// ─── Holder Functions ───

export async function updateHolderStatus(agentId: string, isHolder: boolean): Promise<void> {
  await initAtelierDb();
  await atelierClient.execute({
    sql: `UPDATE atelier_agents
          SET atelier_holder = ?, blue_check = CASE WHEN ? = 1 THEN 1 ELSE blue_check END, holder_checked_at = datetime('now')
          WHERE id = ?`,
    args: [isHolder ? 1 : 0, isHolder ? 1 : 0, agentId],
  });
}

const EXCLUDED_HOLDER_WALLETS = [
  'EZkoXXZ5HEWdKwfv7wua7k6Dqv8aQxxHWNakq2gG2Qpb',
];

export async function getAgentsNeedingHolderCheck(staleMinutes: number): Promise<{ id: string; owner_wallet: string }[]> {
  await initAtelierDb();
  const placeholders = EXCLUDED_HOLDER_WALLETS.map(() => '?').join(',');
  const result = await atelierClient.execute({
    sql: `SELECT id, owner_wallet FROM atelier_agents
          WHERE owner_wallet IS NOT NULL AND active = 1
            AND owner_wallet NOT IN (${placeholders})
            AND (holder_checked_at IS NULL OR holder_checked_at < datetime('now', ?))
          LIMIT 50`,
    args: [...EXCLUDED_HOLDER_WALLETS, `-${staleMinutes} minutes`],
  });
  return result.rows.map((r) => {
    const row = r as unknown as { id: string; owner_wallet: string };
    return { id: row.id, owner_wallet: row.owner_wallet };
  });
}

export async function getFeaturedAgents(limit: number): Promise<AtelierAgentListItem[]> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: `SELECT
            a.id, a.slug, a.name, a.description, a.avatar_url, a.source,
            a.verified, a.blue_check, a.is_atelier_official, a.partner_badge,
            COUNT(DISTINCT s.id) as services_count,
            MAX(s.avg_rating) as avg_rating,
            (SELECT COUNT(*) FROM service_orders WHERE provider_agent_id = a.id AND status IN ('paid','in_progress','delivered','completed','revision_requested')) as total_orders,
            (SELECT COUNT(*) FROM service_orders WHERE provider_agent_id = a.id AND status = 'completed') as completed_orders,
            (SELECT COALESCE(SUM(CAST(quoted_price_usd AS REAL)), 0) FROM service_orders WHERE provider_agent_id = a.id AND status = 'completed') as total_revenue,
            GROUP_CONCAT(DISTINCT s.category) as categories_str,
            GROUP_CONCAT(DISTINCT s.provider_model) as provider_models_str,
            a.ai_models,
            a.token_mint, a.token_symbol, a.token_name, a.token_image_url,
            a.atelier_holder, a.featured,
            MIN(CAST(s.price_usd AS REAL)) as min_price_usd,
            a.created_at
          FROM atelier_agents a
          LEFT JOIN services s ON s.agent_id = a.id AND s.active = 1
          WHERE a.active = 1 AND a.featured = 1
          GROUP BY a.id
          ORDER BY completed_orders DESC, total_orders DESC
          LIMIT ?`,
    args: [limit],
  });

  return result.rows.map((row) => {
    const r = row as unknown as {
      id: string; slug: string; name: string; description: string | null; avatar_url: string | null;
      source: 'atelier' | 'external' | 'official';
      verified: number; blue_check: number; is_atelier_official: number; partner_badge: string | null;
      services_count: number; avg_rating: number | null; total_orders: number; completed_orders: number;
      total_revenue: number;
      categories_str: string | null;
      provider_models_str: string | null;
      ai_models: string | null;
      token_mint: string | null; token_symbol: string | null; token_name: string | null; token_image_url: string | null;
      atelier_holder: number; featured: number;
      min_price_usd: number | null;
    };

    let categories: string[] = [];
    if (r.categories_str) {
      if (r.source === 'external') {
        try { categories = JSON.parse(r.categories_str); } catch { categories = r.categories_str.split(',').filter(Boolean); }
      } else {
        categories = r.categories_str.split(',').filter(Boolean);
      }
    }

    let provider_models: string[] = [];
    if (r.ai_models) {
      try { provider_models = JSON.parse(r.ai_models); } catch { /* skip */ }
    }
    if (provider_models.length === 0) {
      provider_models = r.provider_models_str ? r.provider_models_str.split(',').filter(Boolean) : [];
    }

    return {
      id: r.id, slug: r.slug, name: r.name, description: r.description, avatar_url: r.avatar_url,
      source: r.source, verified: r.verified, blue_check: r.blue_check,
      is_atelier_official: r.is_atelier_official, partner_badge: r.partner_badge,
      services_count: r.services_count,
      avg_rating: r.avg_rating, total_orders: r.total_orders, completed_orders: r.completed_orders,
      total_revenue: r.total_revenue || 0,
      categories, provider_models,
      token_mint: r.token_mint, token_symbol: r.token_symbol,
      token_name: r.token_name, token_image_url: r.token_image_url,
      atelier_holder: r.atelier_holder || 0,
      featured: r.featured || 0,
      min_price_usd: r.min_price_usd ?? null,
    };
  });
}

// ─── Service Queries ───

export async function createService(data: {
  agent_id: string;
  category: ServiceCategory;
  title: string;
  description: string;
  price_usd: string;
  price_type: ServicePriceType;
  turnaround_hours?: number;
  deliverables?: string[];
  portfolio_post_ids?: number[];
  demo_url?: string;
  quota_limit?: number;
  max_revisions?: number;
  requirement_fields?: RequirementField[];
}): Promise<Service> {
  await initAtelierDb();
  const id = `svc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const detectedModel = inferModelFromText(`${data.title} ${data.description}`);
  await atelierClient.execute({
    sql: `INSERT INTO services (id, agent_id, category, title, description, price_usd, price_type, turnaround_hours, deliverables, portfolio_post_ids, demo_url, quota_limit, provider_model, max_revisions, requirement_fields)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, data.agent_id, data.category, data.title, data.description, data.price_usd, data.price_type, data.turnaround_hours || 48, JSON.stringify(data.deliverables || []), JSON.stringify(data.portfolio_post_ids || []), data.demo_url || null, data.quota_limit ?? 0, detectedModel, data.max_revisions ?? 3, data.requirement_fields ? JSON.stringify(data.requirement_fields) : null],
  });
  return getServiceById(id) as Promise<Service>;
}

export async function getServices(filters?: {
  category?: ServiceCategory;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  providerKey?: string;
  model?: string;
  pricing?: 'onetime' | 'subscription';
  sortBy?: 'popular' | 'newest' | 'cheapest' | 'rating' | 'fastest';
  limit?: number;
  offset?: number;
}): Promise<Service[]> {
  await initAtelierDb();
  const conditions: string[] = ['s.active = 1'];
  const args: (string | number)[] = [];

  if (filters?.category) { conditions.push('s.category = ?'); args.push(filters.category); }
  if (filters?.search) { const escaped = escapeLikePattern(filters.search); conditions.push("(s.title LIKE ? ESCAPE '\\' OR s.description LIKE ? ESCAPE '\\')"); args.push(`%${escaped}%`, `%${escaped}%`); }
  if (filters?.minPrice !== undefined) { conditions.push('CAST(s.price_usd AS REAL) >= ?'); args.push(filters.minPrice); }
  if (filters?.maxPrice !== undefined) { conditions.push('CAST(s.price_usd AS REAL) <= ?'); args.push(filters.maxPrice); }
  if (filters?.minRating !== undefined) { conditions.push('s.avg_rating >= ?'); args.push(filters.minRating); }
  if (filters?.providerKey) { conditions.push('s.provider_key = ?'); args.push(filters.providerKey); }
  if (filters?.model) { conditions.push('s.provider_model = ?'); args.push(filters.model); }
  if (filters?.pricing === 'onetime') { conditions.push("s.price_type = 'fixed'"); }
  if (filters?.pricing === 'subscription') { conditions.push("s.price_type IN ('weekly', 'monthly')"); }

  const orderBy = {
    popular: 's.completed_orders DESC, s.avg_rating DESC',
    newest: 's.created_at DESC',
    cheapest: 'CAST(s.price_usd AS REAL) ASC',
    rating: 's.avg_rating DESC NULLS LAST',
    fastest: 's.turnaround_hours ASC',
  }[filters?.sortBy || 'popular'] || 's.completed_orders DESC';

  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;
  args.push(limit, offset);

  const result = await atelierClient.execute({
    sql: `SELECT s.*,
            a.name as agent_name,
            a.slug as agent_slug,
            a.avatar_url as agent_avatar_url,
            a.verified,
            a.blue_check,
            (a.bankr_wallet IS NOT NULL) as has_bankr_wallet,
            a.is_atelier_official,
            a.partner_badge
          FROM services s
          LEFT JOIN atelier_agents a ON s.agent_id = a.id
          WHERE ${conditions.join(' AND ')}
          ORDER BY ${orderBy}
          LIMIT ? OFFSET ?`,
    args,
  });
  return result.rows as unknown as Service[];
}

export async function getFeaturedServices(limit = 6): Promise<Service[]> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: `SELECT s.*,
            a.name as agent_name,
            a.slug as agent_slug,
            a.avatar_url as agent_avatar_url,
            a.verified,
            a.blue_check,
            (a.bankr_wallet IS NOT NULL) as has_bankr_wallet,
            a.is_atelier_official,
            a.partner_badge
          FROM services s
          LEFT JOIN atelier_agents a ON s.agent_id = a.id
          WHERE s.active = 1
          ORDER BY s.completed_orders DESC, s.avg_rating DESC
          LIMIT ?`,
    args: [limit],
  });
  return result.rows as unknown as Service[];
}

export async function getServiceById(id: string): Promise<Service | null> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: `SELECT s.*,
            a.name as agent_name,
            a.slug as agent_slug,
            a.avatar_url as agent_avatar_url,
            a.verified,
            a.blue_check,
            (a.bankr_wallet IS NOT NULL) as has_bankr_wallet,
            a.is_atelier_official,
            a.partner_badge
          FROM services s
          LEFT JOIN atelier_agents a ON s.agent_id = a.id
          WHERE s.id = ?`,
    args: [id],
  });
  return (result.rows[0] as unknown as Service) || null;
}

export async function getServicesByAgent(agentId: string): Promise<Service[]> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: `SELECT s.*,
            a.name as agent_name,
            a.slug as agent_slug,
            a.avatar_url as agent_avatar_url,
            a.verified,
            a.blue_check,
            (a.bankr_wallet IS NOT NULL) as has_bankr_wallet,
            a.is_atelier_official,
            a.partner_badge
          FROM services s
          LEFT JOIN atelier_agents a ON s.agent_id = a.id
          WHERE s.agent_id = ? AND s.active = 1
          ORDER BY s.created_at DESC`,
    args: [agentId],
  });
  return result.rows as unknown as Service[];
}

export async function updateService(
  id: string,
  agentId: string,
  updates: Partial<Pick<Service, 'title' | 'description' | 'price_usd' | 'price_type' | 'category' | 'turnaround_hours' | 'deliverables' | 'portfolio_post_ids' | 'demo_url' | 'active' | 'quota_limit' | 'max_revisions'>>
): Promise<Service | null> {
  await initAtelierDb();
  const setClauses: string[] = [];
  const args: (string | number | null)[] = [];

  const fields: (keyof typeof updates)[] = ['title', 'description', 'price_usd', 'price_type', 'category', 'turnaround_hours', 'deliverables', 'portfolio_post_ids', 'demo_url', 'active', 'quota_limit', 'max_revisions'];
  for (const field of fields) {
    if (updates[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      args.push(updates[field] as string | number | null);
    }
  }

  if (setClauses.length === 0) return getServiceById(id);
  args.push(id, agentId);

  await atelierClient.execute({
    sql: `UPDATE services SET ${setClauses.join(', ')} WHERE id = ? AND agent_id = ?`,
    args,
  });
  return getServiceById(id);
}

export async function deactivateService(id: string, agentId: string): Promise<boolean> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'UPDATE services SET active = 0 WHERE id = ? AND agent_id = ?',
    args: [id, agentId],
  });
  return result.rowsAffected > 0;
}

export async function getAgentIdsWithActiveServices(): Promise<Set<string>> {
  await initAtelierDb();
  const result = await atelierClient.execute('SELECT DISTINCT agent_id FROM services WHERE active = 1');
  return new Set((result.rows as unknown as { agent_id: string }[]).map(r => r.agent_id));
}

// ─── Order Queries ───

export async function createServiceOrder(data: {
  service_id: string;
  client_agent_id?: string;
  client_wallet?: string;
  provider_agent_id: string;
  brief: string;
  reference_urls?: string[];
  reference_images?: string[];
  quoted_price_usd?: string;
  quota_total?: number;
  requirement_answers?: Record<string, string>;
  referral_partner?: string;
}): Promise<ServiceOrder> {
  await initAtelierDb();
  const id = `ord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const status = data.quoted_price_usd ? 'quoted' : 'pending_quote';
  const platformFee = data.quoted_price_usd ? (parseFloat(data.quoted_price_usd) * 0.10).toFixed(2) : null;

  await atelierClient.execute({
    sql: `INSERT INTO service_orders (id, service_id, client_agent_id, client_wallet, provider_agent_id, brief, reference_urls, reference_images, quoted_price_usd, platform_fee_usd, status, quota_total, requirement_answers, referral_partner)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, data.service_id, data.client_agent_id || null, data.client_wallet || null, data.provider_agent_id, data.brief, data.reference_urls ? JSON.stringify(data.reference_urls) : null, data.reference_images ? JSON.stringify(data.reference_images) : null, data.quoted_price_usd || null, platformFee, status, data.quota_total || 0, data.requirement_answers ? JSON.stringify(data.requirement_answers) : null, data.referral_partner || null],
  });

  return getServiceOrderById(id) as Promise<ServiceOrder>;
}

export async function getServiceOrderById(id: string): Promise<ServiceOrder | null> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: `SELECT o.*, s.title as service_title,
            COALESCE(s.max_revisions, 3) as max_revisions,
            ca.name as client_name,
            pa.name as provider_name,
            pa.slug as provider_slug
          FROM service_orders o
          LEFT JOIN services s ON o.service_id = s.id
          LEFT JOIN atelier_agents ca ON o.client_agent_id = ca.id
          LEFT JOIN atelier_agents pa ON o.provider_agent_id = pa.id
          WHERE o.id = ?`,
    args: [id],
  });
  return (result.rows[0] as unknown as ServiceOrder) || null;
}

export async function getOrdersByAgent(agentId: string, role: 'client' | 'provider' | 'both' = 'both'): Promise<ServiceOrder[]> {
  await initAtelierDb();
  let condition: string;
  if (role === 'client') condition = 'o.client_agent_id = ?';
  else if (role === 'provider') condition = 'o.provider_agent_id = ?';
  else condition = '(o.client_agent_id = ? OR o.provider_agent_id = ?)';

  const args = role === 'both' ? [agentId, agentId] : [agentId];

  const result = await atelierClient.execute({
    sql: `SELECT o.*, s.title as service_title,
            COALESCE(s.max_revisions, 3) as max_revisions,
            ca.name as client_name,
            pa.name as provider_name,
            pa.slug as provider_slug
          FROM service_orders o
          LEFT JOIN services s ON o.service_id = s.id
          LEFT JOIN atelier_agents ca ON o.client_agent_id = ca.id
          LEFT JOIN atelier_agents pa ON o.provider_agent_id = pa.id
          WHERE ${condition}
          ORDER BY o.created_at DESC`,
    args,
  });
  return result.rows as unknown as ServiceOrder[];
}

export async function getRecentOrdersForAgent(agentId: string, limit = 10): Promise<RecentAgentOrder[]> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: `SELECT o.id, s.title as service_title, o.client_wallet,
            p.display_name as client_display_name,
            o.quoted_price_usd, o.status, o.created_at
          FROM service_orders o
          LEFT JOIN services s ON o.service_id = s.id
          LEFT JOIN atelier_profiles p ON o.client_wallet = p.wallet
          WHERE o.provider_agent_id = ?
          ORDER BY o.created_at DESC
          LIMIT ?`,
    args: [agentId, limit],
  });
  return result.rows as unknown as RecentAgentOrder[];
}

export async function updateOrderStatus(
  id: string,
  updates: {
    status: OrderStatus;
    quoted_price_usd?: string;
    platform_fee_usd?: string;
    payment_method?: string;
    escrow_tx_hash?: string;
    payout_tx_hash?: string;
    deliverable_post_id?: number;
    deliverable_url?: string;
    deliverable_media_type?: string;
    workspace_expires_at?: string;
  }
): Promise<ServiceOrder | null> {
  await initAtelierDb();
  const setClauses: string[] = ['status = ?'];
  const args: (string | number | null)[] = [updates.status];

  if (updates.quoted_price_usd !== undefined) { setClauses.push('quoted_price_usd = ?'); args.push(updates.quoted_price_usd); }
  if (updates.platform_fee_usd !== undefined) { setClauses.push('platform_fee_usd = ?'); args.push(updates.platform_fee_usd); }
  if (updates.payment_method !== undefined) { setClauses.push('payment_method = ?'); args.push(updates.payment_method); }
  if (updates.escrow_tx_hash !== undefined) { setClauses.push('escrow_tx_hash = ?'); args.push(updates.escrow_tx_hash); }
  if (updates.payout_tx_hash !== undefined) { setClauses.push('payout_tx_hash = ?'); args.push(updates.payout_tx_hash); }
  if (updates.deliverable_post_id !== undefined) { setClauses.push('deliverable_post_id = ?'); args.push(updates.deliverable_post_id); }
  if (updates.deliverable_url !== undefined) { setClauses.push('deliverable_url = ?'); args.push(updates.deliverable_url); }
  if (updates.deliverable_media_type !== undefined) { setClauses.push('deliverable_media_type = ?'); args.push(updates.deliverable_media_type); }
  if (updates.workspace_expires_at !== undefined) { setClauses.push('workspace_expires_at = ?'); args.push(updates.workspace_expires_at); }

  if (updates.status === 'delivered') {
    setClauses.push("delivered_at = CURRENT_TIMESTAMP");
    setClauses.push("review_deadline = datetime('now', '+48 hours')");
  }
  if (updates.status === 'completed') {
    setClauses.push("completed_at = CURRENT_TIMESTAMP");
  }
  if (updates.quoted_price_usd && !updates.platform_fee_usd) {
    setClauses.push('platform_fee_usd = ?');
    args.push((parseFloat(updates.quoted_price_usd) * 0.10).toFixed(2));
  }

  args.push(id);
  const updateResult = await atelierClient.execute({
    sql: `UPDATE service_orders SET ${setClauses.join(', ')} WHERE id = ?`,
    args,
  });

  if (updates.status === 'paid' || updates.status === 'completed') {
    const order = await getServiceOrderById(id);
    if (order?.service_id) {
      if (updates.status === 'paid') {
        await atelierClient.execute({
          sql: 'UPDATE services SET total_orders = total_orders + 1 WHERE id = ?',
          args: [order.service_id],
        });
      }
      if (updates.status === 'completed') {
        await atelierClient.execute({
          sql: 'UPDATE services SET completed_orders = completed_orders + 1 WHERE id = ?',
          args: [order.service_id],
        });
      }
    }
  }

  return getServiceOrderById(id);
}

export async function atomicStatusTransition(
  id: string,
  expectedStatus: string,
  newStatus: OrderStatus,
): Promise<boolean> {
  await initAtelierDb();
  const extraSet =
    newStatus === 'completed' ? ', completed_at = CURRENT_TIMESTAMP' :
    newStatus === 'delivered' ? ", delivered_at = CURRENT_TIMESTAMP, review_deadline = datetime('now', '+48 hours')" :
    '';
  const result = await atelierClient.execute({
    sql: `UPDATE service_orders SET status = ?${extraSet} WHERE id = ? AND status = ?`,
    args: [newStatus, id, expectedStatus],
  });
  return (result.rowsAffected ?? 0) > 0;
}

export async function isEscrowTxHashUsed(txHash: string): Promise<boolean> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'SELECT COUNT(*) as cnt FROM service_orders WHERE escrow_tx_hash = ?',
    args: [txHash],
  });
  const row = result.rows[0] as unknown as { cnt: number };
  return row.cnt > 0;
}

export async function getOrdersByWallet(wallet: string): Promise<ServiceOrder[]> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: `SELECT o.*, s.title as service_title,
            COALESCE(s.max_revisions, 3) as max_revisions,
            ca.name as client_name,
            pa.name as provider_name,
            pa.slug as provider_slug
          FROM service_orders o
          LEFT JOIN services s ON o.service_id = s.id
          LEFT JOIN atelier_agents ca ON o.client_agent_id = ca.id
          LEFT JOIN atelier_agents pa ON o.provider_agent_id = pa.id
          WHERE o.client_wallet = ?
          ORDER BY o.created_at DESC`,
    args: [wallet],
  });
  return result.rows as unknown as ServiceOrder[];
}

// ─── Deliverables ───

export async function createOrderDeliverable(orderId: string, prompt: string): Promise<OrderDeliverable> {
  await initAtelierDb();
  const id = `del_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await atelierClient.execute({
    sql: `INSERT INTO order_deliverables (id, order_id, prompt, status) VALUES (?, ?, ?, 'pending')`,
    args: [id, orderId, prompt],
  });
  const result = await atelierClient.execute({ sql: 'SELECT * FROM order_deliverables WHERE id = ?', args: [id] });
  return result.rows[0] as unknown as OrderDeliverable;
}

export async function getOrderDeliverables(orderId: string): Promise<OrderDeliverable[]> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM order_deliverables WHERE order_id = ? ORDER BY created_at DESC',
    args: [orderId],
  });
  return result.rows as unknown as OrderDeliverable[];
}

export async function updateOrderDeliverable(
  id: string,
  updates: { status?: string; deliverable_url?: string; deliverable_media_type?: string; error?: string }
): Promise<void> {
  await initAtelierDb();
  const setClauses: string[] = [];
  const args: (string | null)[] = [];
  if (updates.status !== undefined) { setClauses.push('status = ?'); args.push(updates.status); }
  if (updates.deliverable_url !== undefined) { setClauses.push('deliverable_url = ?'); args.push(updates.deliverable_url); }
  if (updates.deliverable_media_type !== undefined) { setClauses.push('deliverable_media_type = ?'); args.push(updates.deliverable_media_type); }
  if (updates.error !== undefined) { setClauses.push('error = ?'); args.push(updates.error); }
  if (setClauses.length === 0) return;
  args.push(id);
  await atelierClient.execute({ sql: `UPDATE order_deliverables SET ${setClauses.join(', ')} WHERE id = ?`, args });
}

export async function incrementOrderQuotaUsed(orderId: string): Promise<number> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: `UPDATE service_orders SET quota_used = quota_used + 1 WHERE id = ? AND (quota_total = 0 OR quota_used < quota_total)`,
    args: [orderId],
  });
  return result.rowsAffected;
}

export async function incrementRevisionCount(orderId: string): Promise<number> {
  await initAtelierDb();
  await atelierClient.execute({
    sql: 'UPDATE service_orders SET revision_count = COALESCE(revision_count, 0) + 1 WHERE id = ?',
    args: [orderId],
  });
  const result = await atelierClient.execute({
    sql: 'SELECT revision_count FROM service_orders WHERE id = ?',
    args: [orderId],
  });
  return Number(result.rows[0]?.revision_count ?? 0);
}

// ─── Reviews ───

export async function createServiceReview(data: {
  order_id: string;
  service_id: string | null;
  reviewer_agent_id: string;
  reviewer_name: string;
  rating: number;
  comment?: string;
}): Promise<ServiceReview> {
  await initAtelierDb();
  const id = `rev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await atelierClient.execute({
    sql: `INSERT INTO service_reviews (id, order_id, service_id, reviewer_agent_id, reviewer_name, rating, comment)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, data.order_id, data.service_id || null, data.reviewer_agent_id, data.reviewer_name, data.rating, data.comment || null],
  });
  if (data.service_id) {
    await recalculateServiceRating(data.service_id);
  }
  const result = await atelierClient.execute({ sql: 'SELECT * FROM service_reviews WHERE id = ?', args: [id] });
  return result.rows[0] as unknown as ServiceReview;
}

export async function getReviewByOrderId(orderId: string): Promise<ServiceReview | null> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM service_reviews WHERE order_id = ?',
    args: [orderId],
  });
  return (result.rows[0] as unknown as ServiceReview) || null;
}

export async function getServiceReviews(serviceId: string): Promise<ServiceReview[]> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM service_reviews WHERE service_id = ? ORDER BY created_at DESC',
    args: [serviceId],
  });
  return result.rows as unknown as ServiceReview[];
}

async function recalculateServiceRating(serviceId: string): Promise<void> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'SELECT AVG(rating) as avg_rating FROM service_reviews WHERE service_id = ?',
    args: [serviceId],
  });
  const avgRating = result.rows[0] ? Number((result.rows[0] as unknown as { avg_rating: number }).avg_rating) : null;
  await atelierClient.execute({
    sql: 'UPDATE services SET avg_rating = ? WHERE id = ?',
    args: [avgRating, serviceId],
  });
}

// ─── Atelier Profiles ───

export async function getAtelierProfile(wallet: string): Promise<AtelierProfile | null> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM atelier_profiles WHERE wallet = ?',
    args: [wallet],
  });
  return result.rows[0] ? (result.rows[0] as unknown as AtelierProfile) : null;
}

export async function upsertAtelierProfile(
  wallet: string,
  data: { display_name?: string; bio?: string; avatar_url?: string; twitter_handle?: string }
): Promise<AtelierProfile> {
  await initAtelierDb();
  await atelierClient.execute({
    sql: `INSERT INTO atelier_profiles (wallet, display_name, bio, avatar_url, twitter_handle)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(wallet) DO UPDATE SET
            display_name = COALESCE(?, display_name),
            bio = COALESCE(?, bio),
            avatar_url = COALESCE(?, avatar_url),
            twitter_handle = COALESCE(?, twitter_handle),
            updated_at = CURRENT_TIMESTAMP`,
    args: [
      wallet,
      data.display_name || null, data.bio || null, data.avatar_url || null, data.twitter_handle || null,
      data.display_name ?? null, data.bio ?? null, data.avatar_url ?? null, data.twitter_handle ?? null,
    ],
  });
  const profile = await getAtelierProfile(wallet);
  return profile!;
}

export async function ensureProfileExists(wallet: string): Promise<void> {
  await initAtelierDb();
  await atelierClient.execute({
    sql: 'INSERT INTO atelier_profiles (wallet) VALUES (?) ON CONFLICT DO NOTHING',
    args: [wallet],
  });
}

// ─── Creator Fee Tracking ───

export async function recordFeeSweep(amountLamports: number, txHash: string): Promise<string> {
  await initAtelierDb();
  const id = `sweep_${randomBytes(12).toString('hex')}`;
  await atelierClient.execute({
    sql: 'INSERT INTO creator_fee_sweeps (id, amount_lamports, tx_hash) VALUES (?, ?, ?)',
    args: [id, amountLamports, txHash],
  });
  return id;
}

export async function getFeeSweeps(limit = 50): Promise<{ id: string; amount_lamports: number; tx_hash: string; swept_at: string }[]> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM creator_fee_sweeps ORDER BY swept_at DESC LIMIT ?',
    args: [limit],
  });
  return result.rows as unknown as { id: string; amount_lamports: number; tx_hash: string; swept_at: string }[];
}

export async function createFeePayout(
  recipientWallet: string,
  agentId: string,
  tokenMint: string,
  amountLamports: number,
): Promise<string> {
  await initAtelierDb();
  const id = `payout_${randomBytes(12).toString('hex')}`;
  await atelierClient.execute({
    sql: 'INSERT INTO creator_fee_payouts (id, recipient_wallet, agent_id, token_mint, amount_lamports) VALUES (?, ?, ?, ?, ?)',
    args: [id, recipientWallet, agentId, tokenMint, amountLamports],
  });
  return id;
}

export async function completeFeePayout(id: string, txHash: string): Promise<void> {
  await initAtelierDb();
  await atelierClient.execute({
    sql: "UPDATE creator_fee_payouts SET status = 'paid', tx_hash = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?",
    args: [txHash, id],
  });
}

export async function getPayoutsForWallet(wallet: string): Promise<{
  id: string; recipient_wallet: string; agent_id: string; token_mint: string;
  amount_lamports: number; tx_hash: string | null; status: string; created_at: string; paid_at: string | null;
}[]> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM creator_fee_payouts WHERE recipient_wallet = ? ORDER BY created_at DESC',
    args: [wallet],
  });
  return result.rows as unknown as {
    id: string; recipient_wallet: string; agent_id: string; token_mint: string;
    amount_lamports: number; tx_hash: string | null; status: string; created_at: string; paid_at: string | null;
  }[];
}

export async function getTotalSwept(): Promise<number> {
  await initAtelierDb();
  const result = await atelierClient.execute('SELECT COALESCE(SUM(amount_lamports), 0) as total FROM creator_fee_sweeps');
  return Number(result.rows[0]?.total ?? 0);
}

export async function getTotalPaidOut(): Promise<number> {
  await initAtelierDb();
  const result = await atelierClient.execute(
    "SELECT COALESCE(SUM(amount_lamports), 0) as total FROM creator_fee_payouts WHERE status = 'paid'",
  );
  return Number(result.rows[0]?.total ?? 0);
}

export async function getAllPayouts(limit = 100): Promise<{
  id: string; recipient_wallet: string; agent_id: string; token_mint: string;
  amount_lamports: number; tx_hash: string | null; status: string; created_at: string; paid_at: string | null;
}[]> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM creator_fee_payouts ORDER BY created_at DESC LIMIT ?',
    args: [limit],
  });
  return result.rows as unknown as {
    id: string; recipient_wallet: string; agent_id: string; token_mint: string;
    amount_lamports: number; tx_hash: string | null; status: string; created_at: string; paid_at: string | null;
  }[];
}

// ─── Fee Index Queries ───

export async function upsertFeeIndexEntry(entry: {
  vault_type: string;
  tx_signature: string;
  amount_lamports: number;
  block_time: number | null;
  slot: number;
}): Promise<void> {
  await initAtelierDb();
  const id = `fidx_${randomBytes(12).toString('hex')}`;
  await atelierClient.execute({
    sql: `INSERT INTO creator_fee_index (id, vault_type, tx_signature, amount_lamports, block_time, slot)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(tx_signature, vault_type) DO NOTHING`,
    args: [id, entry.vault_type, entry.tx_signature, entry.amount_lamports, entry.block_time, entry.slot],
  });
}

export async function getTotalIndexedWithdrawals(): Promise<number> {
  await initAtelierDb();
  const result = await atelierClient.execute(
    'SELECT COALESCE(SUM(amount_lamports), 0) as total FROM creator_fee_index',
  );
  return Number(result.rows[0]?.total ?? 0);
}

export async function getIndexCursor(vaultType: string): Promise<{
  last_signature: string | null;
  newest_signature: string | null;
  fully_backfilled: boolean;
} | null> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM creator_fee_index_cursor WHERE vault_type = ?',
    args: [vaultType],
  });
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    last_signature: row.last_signature ? String(row.last_signature) : null,
    newest_signature: row.newest_signature ? String(row.newest_signature) : null,
    fully_backfilled: Number(row.fully_backfilled) === 1,
  };
}

export async function upsertIndexCursor(cursor: {
  vault_type: string;
  last_signature?: string | null;
  newest_signature?: string | null;
  fully_backfilled?: boolean;
}): Promise<void> {
  await initAtelierDb();
  const existing = await getIndexCursor(cursor.vault_type);
  if (!existing) {
    await atelierClient.execute({
      sql: `INSERT INTO creator_fee_index_cursor (vault_type, last_signature, newest_signature, fully_backfilled)
            VALUES (?, ?, ?, ?)`,
      args: [
        cursor.vault_type,
        cursor.last_signature ?? null,
        cursor.newest_signature ?? null,
        cursor.fully_backfilled ? 1 : 0,
      ],
    });
  } else {
    const sets: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const args: (string | number | null)[] = [];
    if (cursor.last_signature !== undefined) {
      sets.push('last_signature = ?');
      args.push(cursor.last_signature);
    }
    if (cursor.newest_signature !== undefined) {
      sets.push('newest_signature = ?');
      args.push(cursor.newest_signature);
    }
    if (cursor.fully_backfilled !== undefined) {
      sets.push('fully_backfilled = ?');
      args.push(cursor.fully_backfilled ? 1 : 0);
    }
    args.push(cursor.vault_type);
    await atelierClient.execute({
      sql: `UPDATE creator_fee_index_cursor SET ${sets.join(', ')} WHERE vault_type = ?`,
      args,
    });
  }
}

export async function getIndexedWithdrawals(limit = 100): Promise<{
  id: string; vault_type: string; tx_signature: string;
  amount_lamports: number; block_time: number | null; slot: number;
}[]> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM creator_fee_index ORDER BY slot DESC LIMIT ?',
    args: [limit],
  });
  return result.rows as unknown as {
    id: string; vault_type: string; tx_signature: string;
    amount_lamports: number; block_time: number | null; slot: number;
  }[];
}

export async function resetFeeIndexCursors(): Promise<void> {
  await initAtelierDb();
  await atelierClient.execute('DROP TABLE IF EXISTS creator_fee_index');
  await atelierClient.execute(`
    CREATE TABLE creator_fee_index (
      id TEXT PRIMARY KEY,
      vault_type TEXT NOT NULL,
      tx_signature TEXT NOT NULL,
      amount_lamports INTEGER NOT NULL,
      block_time INTEGER,
      slot INTEGER NOT NULL,
      indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tx_signature, vault_type)
    )
  `);
  await atelierClient.execute('DELETE FROM creator_fee_index_cursor');
}

// ─── Token Queries ───

export async function markTokenLaunchAttempted(agentId: string): Promise<boolean> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'UPDATE atelier_agents SET token_launch_attempted = 1 WHERE id = ? AND token_launch_attempted = 0',
    args: [agentId],
  });
  return result.rowsAffected > 0;
}

export async function updateAgentToken(
  agentId: string,
  tokenData: {
    token_mint: string;
    token_name: string;
    token_symbol: string;
    token_image_url?: string;
    token_mode: 'pumpfun' | 'byot';
    token_creator_wallet: string;
    token_tx_hash?: string;
  }
): Promise<boolean> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: `UPDATE atelier_agents SET
      token_mint = ?, token_name = ?, token_symbol = ?, token_image_url = ?,
      token_mode = ?, token_creator_wallet = ?, token_tx_hash = ?, token_created_at = CURRENT_TIMESTAMP
      WHERE id = ? AND token_mint IS NULL`,
    args: [
      tokenData.token_mint, tokenData.token_name, tokenData.token_symbol,
      tokenData.token_image_url || null, tokenData.token_mode,
      tokenData.token_creator_wallet, tokenData.token_tx_hash || null, agentId,
    ],
  });
  return result.rowsAffected > 0;
}

export async function clearAgentToken(agentId: string): Promise<boolean> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: `UPDATE atelier_agents SET
      token_mint = NULL, token_name = NULL, token_symbol = NULL, token_image_url = NULL,
      token_mode = NULL, token_creator_wallet = NULL, token_tx_hash = NULL, token_created_at = NULL,
      token_launch_attempted = 0
      WHERE id = ?`,
    args: [agentId],
  });
  return result.rowsAffected > 0;
}

export async function getPlatformStats(): Promise<{ agents: number; orders: number; services: number }> {
  await initAtelierDb();
  const [agentsResult, ordersResult, servicesResult] = await Promise.all([
    atelierClient.execute(
      `SELECT COUNT(*) as count FROM atelier_agents WHERE active = 1`
    ),
    atelierClient.execute("SELECT COUNT(*) as count FROM service_orders WHERE status IN ('paid','in_progress','delivered','completed','revision_requested')"),
    atelierClient.execute(`SELECT COUNT(*) as count FROM services WHERE active = 1`),
  ]);
  return {
    agents: Number(agentsResult.rows[0].count),
    orders: Number(ordersResult.rows[0].count),
    services: Number(servicesResult.rows[0].count),
  };
}

export async function getPlatformRevenue(): Promise<number> {
  await initAtelierDb();
  const result = await atelierClient.execute(
    `SELECT COALESCE(SUM(platform_fee_usd), 0) as total FROM service_orders WHERE status IN ('completed','delivered','in_progress','paid')`
  );
  return Number(result.rows[0].total);
}

export async function getAgentTokenInfo(agentId: string): Promise<AgentTokenInfo | null> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: `SELECT token_mint, token_name, token_symbol, token_image_url, token_mode, token_creator_wallet, token_tx_hash, token_created_at, token_launch_attempted
          FROM atelier_agents WHERE id = ?`,
    args: [agentId],
  });
  if (!result.rows[0]) return null;
  return result.rows[0] as unknown as AgentTokenInfo;
}

// ─── Portfolio ───

export interface PortfolioItem {
  source_type: 'order' | 'deliverable';
  source_id: string;
  deliverable_url: string;
  deliverable_media_type: 'image' | 'video' | 'link' | 'document' | 'code' | 'text';
  prompt: string | null;
  created_at: string;
}

export async function getAgentOrderCounts(agentId: string): Promise<{ total: number; completed: number }> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: `SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
          FROM service_orders WHERE provider_agent_id = ? AND status IN ('paid','in_progress','delivered','completed','revision_requested')`,
    args: [agentId],
  });
  const row = result.rows[0];
  return {
    total: Number(row?.total ?? 0),
    completed: Number(row?.completed ?? 0),
  };
}

export async function getAgentPortfolio(agentId: string, limit = 20): Promise<PortfolioItem[]> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: `SELECT source_type, source_id, deliverable_url, deliverable_media_type, prompt, created_at
          FROM (
            SELECT 'order' as source_type, o.id as source_id,
                   o.deliverable_url, o.deliverable_media_type, o.brief as prompt, o.completed_at as created_at
            FROM service_orders o
            WHERE o.provider_agent_id = ? AND o.status = 'completed'
              AND o.deliverable_url IS NOT NULL AND o.quota_total = 0
              AND NOT EXISTS (
                SELECT 1 FROM hidden_portfolio_items h
                WHERE h.agent_id = ? AND h.source_type = 'order' AND h.source_id = o.id
              )
            UNION ALL
            SELECT 'deliverable' as source_type, d.id as source_id,
                   d.deliverable_url, d.deliverable_media_type, d.prompt, d.created_at
            FROM order_deliverables d
            INNER JOIN service_orders o ON d.order_id = o.id
            WHERE o.provider_agent_id = ? AND d.status = 'completed'
              AND d.deliverable_url IS NOT NULL
              AND o.quota_total > 0
              AND NOT EXISTS (
                SELECT 1 FROM hidden_portfolio_items h
                WHERE h.agent_id = ? AND h.source_type = 'deliverable' AND h.source_id = d.id
              )
          ) portfolio
          ORDER BY created_at DESC
          LIMIT ?`,
    args: [agentId, agentId, agentId, agentId, limit],
  });
  return result.rows as unknown as PortfolioItem[];
}

export async function hidePortfolioItem(agentId: string, sourceType: string, sourceId: string): Promise<void> {
  await initAtelierDb();
  const id = `hpi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await atelierClient.execute({
    sql: `INSERT INTO hidden_portfolio_items (id, agent_id, source_type, source_id) VALUES (?, ?, ?, ?)
          ON CONFLICT(agent_id, source_type, source_id) DO NOTHING`,
    args: [id, agentId, sourceType, sourceId],
  });
}

export async function unhidePortfolioItem(agentId: string, sourceType: string, sourceId: string): Promise<void> {
  await initAtelierDb();
  await atelierClient.execute({
    sql: 'DELETE FROM hidden_portfolio_items WHERE agent_id = ? AND source_type = ? AND source_id = ?',
    args: [agentId, sourceType, sourceId],
  });
}

// ─── Order Messages ───

export interface OrderMessage {
  id: string;
  order_id: string;
  sender_type: 'client' | 'agent';
  sender_id: string;
  sender_name: string | null;
  content: string;
  created_at: string;
}

export async function createOrderMessage(data: {
  order_id: string;
  sender_type: 'client' | 'agent';
  sender_id: string;
  sender_name?: string;
  content: string;
}): Promise<OrderMessage> {
  await initAtelierDb();
  const id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await atelierClient.execute({
    sql: `INSERT INTO order_messages (id, order_id, sender_type, sender_id, sender_name, content) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, data.order_id, data.sender_type, data.sender_id, data.sender_name || null, data.content],
  });
  await atelierClient.execute({
    sql: `INSERT INTO order_message_reads (order_id, participant_id, last_read_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(order_id, participant_id) DO UPDATE SET last_read_at = CURRENT_TIMESTAMP`,
    args: [data.order_id, data.sender_id],
  });
  const result = await atelierClient.execute({ sql: 'SELECT * FROM order_messages WHERE id = ?', args: [id] });
  return result.rows[0] as unknown as OrderMessage;
}

export async function getOrderMessages(orderId: string, limit = 50): Promise<OrderMessage[]> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM order_messages WHERE order_id = ? ORDER BY created_at ASC LIMIT ?',
    args: [orderId, limit],
  });
  return result.rows as unknown as OrderMessage[];
}

export async function markOrderMessagesRead(orderId: string, participantId: string): Promise<void> {
  await initAtelierDb();
  await atelierClient.execute({
    sql: `INSERT INTO order_message_reads (order_id, participant_id, last_read_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(order_id, participant_id) DO UPDATE SET last_read_at = CURRENT_TIMESTAMP`,
    args: [orderId, participantId],
  });
}

export async function getUnreadMessageCounts(participantId: string, orderIds: string[]): Promise<Record<string, number>> {
  await initAtelierDb();
  if (orderIds.length === 0) return {};

  const placeholders = orderIds.map(() => '?').join(',');
  const result = await atelierClient.execute({
    sql: `SELECT m.order_id, COUNT(*) as unread
          FROM order_messages m
          LEFT JOIN order_message_reads r
            ON r.order_id = m.order_id AND r.participant_id = ?
          WHERE m.order_id IN (${placeholders})
            AND m.sender_id != ?
            AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
          GROUP BY m.order_id`,
    args: [participantId, ...orderIds, participantId],
  });

  const counts: Record<string, number> = {};
  for (const row of result.rows) {
    const r = row as unknown as { order_id: string; unread: number };
    counts[r.order_id] = Number(r.unread);
  }
  return counts;
}

// ─── Metrics ───

export interface MetricsData {
  totalRevenue: number;
  totalGmv: number;
  creatorFeeSol: number;
  totalOrders: number;
  ordersByStatus: Record<string, number>;
  totalAgents: number;
  agentsWithTokens: { total: number; pumpfun: number; byot: number };
  servicesByCategory: Record<string, number>;
  servicesByProvider: Record<string, number>;
  servicesByModel: Record<string, number>;
  topAgentsByOrders: { id: string; name: string; avatar_url: string | null; completed_orders: number; avg_rating: number | null }[];
  avgRating: number | null;
  ordersOverTime: { month: string; count: number }[];
}

const REVENUE_STATUSES = `('completed','delivered','in_progress','paid')`;

export async function getMetricsData(): Promise<MetricsData> {
  await initAtelierDb();

  const [
    revenueResult,
    gmvResult,
    totalOrdersResult,
    ordersByStatusResult,
    totalAgentsResult,
    tokensResult,
    servicesByCategoryResult,
    servicesByProviderResult,
    servicesByModelResult,
    topAgentsResult,
    avgRatingResult,
    ordersOverTimeResult,
  ] = await Promise.all([
    atelierClient.execute(
      `SELECT COALESCE(SUM(platform_fee_usd), 0) as total FROM service_orders WHERE status IN ${REVENUE_STATUSES}`
    ),
    atelierClient.execute(
      `SELECT COALESCE(SUM(quoted_price_usd), 0) as total FROM service_orders WHERE status IN ${REVENUE_STATUSES}`
    ),
    atelierClient.execute("SELECT COUNT(*) as count FROM service_orders WHERE status IN ('paid','in_progress','delivered','completed','revision_requested')"),
    atelierClient.execute('SELECT status, COUNT(*) as count FROM service_orders GROUP BY status'),
    atelierClient.execute('SELECT COUNT(*) as count FROM atelier_agents WHERE active = 1'),
    atelierClient.execute(
      `SELECT
        SUM(CASE WHEN token_mint IS NOT NULL THEN 1 ELSE 0 END) as total,
        SUM(CASE WHEN token_mint IS NOT NULL AND token_mode = 'pumpfun' THEN 1 ELSE 0 END) as pumpfun,
        SUM(CASE WHEN token_mint IS NOT NULL AND token_mode = 'byot' THEN 1 ELSE 0 END) as byot
      FROM atelier_agents WHERE active = 1`
    ),
    atelierClient.execute('SELECT category, COUNT(*) as count FROM services WHERE active = 1 GROUP BY category'),
    atelierClient.execute('SELECT provider_key, COUNT(*) as count FROM services WHERE active = 1 GROUP BY provider_key'),
    atelierClient.execute('SELECT provider_model, COUNT(*) as count FROM services WHERE active = 1 GROUP BY provider_model'),
    atelierClient.execute(
      `SELECT a.id, a.name, a.avatar_url, a.completed_orders, a.avg_rating
       FROM atelier_agents a
       WHERE a.active = 1 AND a.completed_orders > 0
       ORDER BY a.completed_orders DESC LIMIT 5`
    ),
    atelierClient.execute('SELECT AVG(rating) as avg FROM service_reviews'),
    atelierClient.execute(
      `SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count
       FROM service_orders
       GROUP BY strftime('%Y-%m', created_at)
       ORDER BY month ASC`
    ),
  ]);

  const ordersByStatus: Record<string, number> = {};
  for (const row of ordersByStatusResult.rows) {
    ordersByStatus[String(row.status)] = Number(row.count);
  }

  const servicesByCategory: Record<string, number> = {};
  for (const row of servicesByCategoryResult.rows) {
    servicesByCategory[String(row.category)] = Number(row.count);
  }

  const servicesByProvider: Record<string, number> = {};
  for (const row of servicesByProviderResult.rows) {
    if (row.provider_key != null) {
      servicesByProvider[String(row.provider_key)] = Number(row.count);
    }
  }

  const servicesByModel: Record<string, number> = {};
  for (const row of servicesByModelResult.rows) {
    if (row.provider_model != null) {
      servicesByModel[String(row.provider_model)] = Number(row.count);
    }
  }

  const topAgentsByOrders = topAgentsResult.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    avatar_url: row.avatar_url ? String(row.avatar_url) : null,
    completed_orders: Number(row.completed_orders),
    avg_rating: row.avg_rating ? Number(row.avg_rating) : null,
  }));

  const ordersOverTime = ordersOverTimeResult.rows.map((row) => ({
    month: String(row.month),
    count: Number(row.count),
  }));

  let tokenTotal = 0, tokenPumpfun = 0, tokenByot = 0;
  if (tokensResult.rows[0]) {
    tokenTotal = Number(tokensResult.rows[0].total);
    tokenPumpfun = Number(tokensResult.rows[0].pumpfun);
    tokenByot = Number(tokensResult.rows[0].byot);
  }

  return {
    totalRevenue: Number(revenueResult.rows[0].total),
    totalGmv: Number(gmvResult.rows[0].total),
    creatorFeeSol: 0,
    totalOrders: Number(totalOrdersResult.rows[0].count),
    ordersByStatus,
    totalAgents: Number(totalAgentsResult.rows[0].count),
    agentsWithTokens: { total: tokenTotal, pumpfun: tokenPumpfun, byot: tokenByot },
    servicesByCategory,
    servicesByProvider,
    servicesByModel,
    topAgentsByOrders,
    avgRating: avgRatingResult.rows[0]?.avg ? Number(avgRatingResult.rows[0].avg) : null,
    ordersOverTime,
  };
}

// ─── Activity Feed ───

export type ActivityType = 'registration' | 'order' | 'service' | 'review' | 'token_launch';

export interface ActivityEvent {
  type: ActivityType;
  id: string;
  title: string;
  subtitle: string | null;
  timestamp: string;
  avatar_url: string | null;
  link_id: string | null;
  slug: string | null;
}

export async function getActivityFeed(
  filter: ActivityType | 'all' = 'all',
  limit = 50,
  offset = 0,
): Promise<{ events: ActivityEvent[]; total: number }> {
  await initAtelierDb();

  const unions: string[] = [];

  if (filter === 'all' || filter === 'registration') {
    unions.push(`
      SELECT 'registration' as type, id, name as title, owner_wallet as subtitle,
             created_at as timestamp, avatar_url, id as link_id, slug
      FROM atelier_agents WHERE active = 1
    `);
  }

  if (filter === 'all' || filter === 'order') {
    unions.push(`
      SELECT 'order' as type, so.id, s.title as title, so.status as subtitle,
             so.created_at as timestamp,
             (SELECT a.avatar_url FROM atelier_agents a WHERE a.id = so.provider_agent_id) as avatar_url,
             so.id as link_id,
             NULL as slug
      FROM service_orders so
      JOIN services s ON s.id = so.service_id
    `);
  }

  if (filter === 'all' || filter === 'service') {
    unions.push(`
      SELECT 'service' as type, s.id, s.title as title, s.category as subtitle,
             s.created_at as timestamp,
             (SELECT a.avatar_url FROM atelier_agents a WHERE a.id = s.agent_id) as avatar_url,
             s.agent_id as link_id,
             (SELECT a.slug FROM atelier_agents a WHERE a.id = s.agent_id) as slug
      FROM services s WHERE s.active = 1
    `);
  }

  if (filter === 'all' || filter === 'review') {
    unions.push(`
      SELECT 'review' as type, sr.id, sr.reviewer_name as title,
             CAST(sr.rating AS TEXT) as subtitle,
             sr.created_at as timestamp,
             NULL as avatar_url,
             sr.order_id as link_id,
             NULL as slug
      FROM service_reviews sr
    `);
  }

  if (filter === 'all' || filter === 'token_launch') {
    unions.push(`
      SELECT 'token_launch' as type, id, name as title, token_symbol as subtitle,
             token_created_at as timestamp, avatar_url, id as link_id, slug
      FROM atelier_agents WHERE token_mint IS NOT NULL AND token_created_at IS NOT NULL
    `);
  }

  if (unions.length === 0) return { events: [], total: 0 };

  const unionQuery = unions.join(' UNION ALL ');

  const [countResult, dataResult] = await Promise.all([
    atelierClient.execute(`SELECT COUNT(*) as total FROM (${unionQuery})`),
    atelierClient.execute(
      `SELECT * FROM (${unionQuery}) ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${offset}`
    ),
  ]);

  const total = Number(countResult.rows[0].total);
  const events: ActivityEvent[] = dataResult.rows.map((row) => ({
    type: String(row.type) as ActivityType,
    id: String(row.id),
    title: String(row.title ?? ''),
    subtitle: row.subtitle ? String(row.subtitle) : null,
    timestamp: String(row.timestamp),
    avatar_url: row.avatar_url ? String(row.avatar_url) : null,
    link_id: row.link_id ? String(row.link_id) : null,
    slug: row.slug ? String(row.slug) : null,
  }));

  return { events, total };
}

// ─── Notifications ───

export type NotificationType = 'order_quoted' | 'order_delivered' | 'order_revision' | 'order_message' | 'provider_order_received' | 'provider_order_paid' | 'provider_webhook_failed' | 'provider_payout_retry_requested';

export interface Notification {
  id: string;
  wallet: string;
  type: NotificationType;
  title: string;
  body: string | null;
  order_id: string | null;
  read: number;
  created_at: string;
}

export async function createNotification(data: {
  wallet: string;
  type: NotificationType;
  title: string;
  body?: string;
  order_id?: string;
}): Promise<void> {
  await initAtelierDb();
  const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await atelierClient.execute({
    sql: `INSERT INTO notifications (id, wallet, type, title, body, order_id) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, data.wallet, data.type, data.title, data.body || null, data.order_id || null],
  });
}

export async function getNotificationsByWallet(wallet: string, limit = 30): Promise<Notification[]> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM notifications WHERE wallet = ? ORDER BY created_at DESC LIMIT ?',
    args: [wallet, limit],
  });
  return result.rows as unknown as Notification[];
}

export async function getUnreadNotificationCount(wallet: string): Promise<number> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'SELECT COUNT(*) as count FROM notifications WHERE wallet = ? AND read = 0',
    args: [wallet],
  });
  return Number(result.rows[0].count);
}

export async function markNotificationsRead(wallet: string, ids?: string[]): Promise<void> {
  await initAtelierDb();
  if (ids && ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    await atelierClient.execute({
      sql: `UPDATE notifications SET read = 1 WHERE wallet = ? AND id IN (${placeholders})`,
      args: [wallet, ...ids],
    });
  } else {
    await atelierClient.execute({
      sql: 'UPDATE notifications SET read = 1 WHERE wallet = ? AND read = 0',
      args: [wallet],
    });
  }
}

// ─── Bounty Queries ───

const VALID_BOUNTY_CATEGORIES: ServiceCategory[] = ['image_gen', 'video_gen', 'ugc', 'influencer', 'brand_content', 'coding', 'analytics', 'seo', 'trading', 'automation', 'consulting', 'custom'];
const VALID_DEADLINE_HOURS = [1, 6, 12, 24, 48, 72, 168];
const VALID_CLAIM_WINDOWS = [6, 12, 24, 48, 72, 168];
const MAX_CLAIMS_PER_BOUNTY = 20;

export async function createBounty(data: {
  poster_wallet: string;
  title: string;
  brief: string;
  category: ServiceCategory;
  budget_usd: string;
  deadline_hours: number;
  claim_window_hours?: number;
  reference_urls?: string[];
  reference_images?: string[];
}): Promise<Bounty> {
  await initAtelierDb();
  const id = `bty_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const claimWindow = data.claim_window_hours || 24;
  const expiresAt = new Date(Date.now() + claimWindow * 60 * 60 * 1000).toISOString();

  await atelierClient.execute({
    sql: `INSERT INTO bounties (id, poster_wallet, title, brief, category, budget_usd, deadline_hours, reference_urls, reference_images, status, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    args: [
      id, data.poster_wallet, data.title, data.brief, data.category, data.budget_usd,
      data.deadline_hours,
      data.reference_urls ? JSON.stringify(data.reference_urls) : null,
      data.reference_images ? JSON.stringify(data.reference_images) : null,
      expiresAt,
    ],
  });

  return getBountyById(id) as Promise<Bounty>;
}

export async function getBountyById(id: string): Promise<Bounty | null> {
  await initAtelierDb();
  await expireStaleBounties();
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM bounties WHERE id = ?',
    args: [id],
  });
  return (result.rows[0] as unknown as Bounty) || null;
}

export async function listBounties(filters: {
  status?: string;
  category?: ServiceCategory;
  min_budget?: string;
  max_budget?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: BountyListItem[]; total: number }> {
  await initAtelierDb();
  await expireStaleBounties();

  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (filters.status) {
    const statuses = filters.status.split(',').map(s => s.trim());
    conditions.push(`b.status IN (${statuses.map(() => '?').join(',')})`);
    args.push(...statuses);
  } else {
    conditions.push("b.status = 'open'");
  }

  if (filters.category) {
    conditions.push('b.category = ?');
    args.push(filters.category);
  }

  if (filters.min_budget) {
    conditions.push('CAST(b.budget_usd AS REAL) >= ?');
    args.push(parseFloat(filters.min_budget));
  }

  if (filters.max_budget) {
    conditions.push('CAST(b.budget_usd AS REAL) <= ?');
    args.push(parseFloat(filters.max_budget));
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let orderBy = 'b.created_at DESC';
  if (filters.sort === 'budget_desc') orderBy = 'CAST(b.budget_usd AS REAL) DESC';
  else if (filters.sort === 'deadline_asc') orderBy = 'b.expires_at ASC';
  else if (filters.sort === 'claims_count') orderBy = 'claims_count DESC';

  const limit = Math.min(filters.limit || 20, 50);
  const offset = filters.offset || 0;

  const countResult = await atelierClient.execute({
    sql: `SELECT COUNT(*) as count FROM bounties b ${where}`,
    args,
  });
  const total = Number(countResult.rows[0].count);

  const result = await atelierClient.execute({
    sql: `SELECT b.*,
            p.display_name as poster_display_name,
            (SELECT COUNT(*) FROM bounty_claims bc WHERE bc.bounty_id = b.id AND bc.status != 'withdrawn') as claims_count
          FROM bounties b
          LEFT JOIN atelier_profiles p ON p.wallet = b.poster_wallet
          ${where}
          ORDER BY ${orderBy}
          LIMIT ? OFFSET ?`,
    args: [...args, limit, offset],
  });

  return {
    data: result.rows as unknown as BountyListItem[],
    total,
  };
}

export async function getBountiesByWallet(wallet: string): Promise<BountyListItem[]> {
  await initAtelierDb();
  await expireStaleBounties();
  const result = await atelierClient.execute({
    sql: `SELECT b.*,
            p.display_name as poster_display_name,
            (SELECT COUNT(*) FROM bounty_claims bc WHERE bc.bounty_id = b.id AND bc.status != 'withdrawn') as claims_count
          FROM bounties b
          LEFT JOIN atelier_profiles p ON p.wallet = b.poster_wallet
          WHERE b.poster_wallet = ?
          ORDER BY b.created_at DESC`,
    args: [wallet],
  });
  return result.rows as unknown as BountyListItem[];
}

export async function createBountyClaim(data: {
  bounty_id: string;
  agent_id: string;
  claimant_wallet?: string;
  message?: string;
}): Promise<BountyClaim> {
  await initAtelierDb();
  const id = `bcl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await atelierClient.execute({
    sql: `INSERT INTO bounty_claims (id, bounty_id, agent_id, claimant_wallet, message, status)
          VALUES (?, ?, ?, ?, ?, 'pending')`,
    args: [id, data.bounty_id, data.agent_id, data.claimant_wallet || null, data.message || null],
  });

  const result = await atelierClient.execute({
    sql: 'SELECT * FROM bounty_claims WHERE id = ?',
    args: [id],
  });
  return result.rows[0] as unknown as BountyClaim;
}

export async function getClaimsForBounty(bountyId: string): Promise<BountyClaimWithAgent[]> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: `SELECT bc.*,
            a.name as agent_name,
            a.slug as agent_slug,
            a.avatar_url as agent_avatar_url,
            a.avg_rating as agent_avg_rating,
            a.completed_orders as agent_completed_orders,
            a.token_mint as agent_token_mint,
            a.token_symbol as agent_token_symbol
          FROM bounty_claims bc
          JOIN atelier_agents a ON a.id = bc.agent_id
          WHERE bc.bounty_id = ?
          ORDER BY bc.created_at ASC`,
    args: [bountyId],
  });
  return result.rows as unknown as BountyClaimWithAgent[];
}

export async function getClaimById(claimId: string): Promise<BountyClaim | null> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM bounty_claims WHERE id = ?',
    args: [claimId],
  });
  return (result.rows[0] as unknown as BountyClaim) || null;
}

export async function getClaimByBountyAndAgent(bountyId: string, agentId: string): Promise<BountyClaim | null> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM bounty_claims WHERE bounty_id = ? AND agent_id = ?',
    args: [bountyId, agentId],
  });
  return (result.rows[0] as unknown as BountyClaim) || null;
}

export async function getClaimsCountForBounty(bountyId: string): Promise<number> {
  await initAtelierDb();
  const result = await atelierClient.execute({
    sql: "SELECT COUNT(*) as count FROM bounty_claims WHERE bounty_id = ? AND status != 'withdrawn'",
    args: [bountyId],
  });
  return Number(result.rows[0].count);
}

export async function acceptBountyClaim(data: {
  bounty_id: string;
  claim_id: string;
  escrow_tx_hash: string;
}): Promise<{ bounty: Bounty; order: ServiceOrder; claim: BountyClaim }> {
  await initAtelierDb();

  const bounty = await getBountyById(data.bounty_id);
  if (!bounty) throw new Error('Bounty not found');

  const claim = await getClaimById(data.claim_id);
  if (!claim) throw new Error('Claim not found');

  const platformFee = (parseFloat(bounty.budget_usd) * 0.10).toFixed(2);
  const orderId = `ord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await atelierClient.execute({
    sql: `INSERT INTO service_orders (id, service_id, client_wallet, provider_agent_id, brief, reference_urls, reference_images, quoted_price_usd, platform_fee_usd, payment_method, status, escrow_tx_hash, bounty_id)
          VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 'usdc', 'paid', ?, ?)`,
    args: [
      orderId, bounty.poster_wallet, claim.agent_id, bounty.brief,
      bounty.reference_urls, bounty.reference_images,
      bounty.budget_usd, platformFee, data.escrow_tx_hash, bounty.id,
    ],
  });

  await atelierClient.execute({
    sql: "UPDATE bounty_claims SET status = 'accepted' WHERE id = ?",
    args: [data.claim_id],
  });

  await atelierClient.execute({
    sql: "UPDATE bounty_claims SET status = 'rejected' WHERE bounty_id = ? AND id != ? AND status = 'pending'",
    args: [data.bounty_id, data.claim_id],
  });

  await atelierClient.execute({
    sql: "UPDATE bounties SET status = 'claimed', accepted_claim_id = ?, order_id = ? WHERE id = ?",
    args: [data.claim_id, orderId, data.bounty_id],
  });

  const updatedBounty = await getBountyById(data.bounty_id) as Bounty;
  const order = await getServiceOrderById(orderId) as ServiceOrder;
  const updatedClaim = await getClaimById(data.claim_id) as BountyClaim;

  return { bounty: updatedBounty, order, claim: updatedClaim };
}

export async function cancelBounty(bountyId: string): Promise<void> {
  await initAtelierDb();
  await atelierClient.execute({
    sql: "UPDATE bounties SET status = 'cancelled' WHERE id = ? AND status = 'open'",
    args: [bountyId],
  });
  await atelierClient.execute({
    sql: "UPDATE bounty_claims SET status = 'rejected' WHERE bounty_id = ? AND status = 'pending'",
    args: [bountyId],
  });
}

export async function withdrawBountyClaim(bountyId: string, agentId: string): Promise<void> {
  await initAtelierDb();
  await atelierClient.execute({
    sql: "UPDATE bounty_claims SET status = 'withdrawn' WHERE bounty_id = ? AND agent_id = ? AND status = 'pending'",
    args: [bountyId, agentId],
  });
}

export async function expireStaleBounties(): Promise<void> {
  await initAtelierDb();
  const now = new Date().toISOString();
  await atelierClient.execute({
    sql: "UPDATE bounties SET status = 'expired' WHERE status = 'open' AND expires_at < ?",
    args: [now],
  });
}

export async function completeBountyByOrderId(orderId: string): Promise<void> {
  await initAtelierDb();
  await atelierClient.execute({
    sql: "UPDATE bounties SET status = 'completed' WHERE order_id = ? AND status = 'claimed'",
    args: [orderId],
  });
}


export { VALID_BOUNTY_CATEGORIES, VALID_DEADLINE_HOURS, VALID_CLAIM_WINDOWS, MAX_CLAIMS_PER_BOUNTY };
