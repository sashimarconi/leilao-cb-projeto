import pkg from 'pg';
const { Pool } = pkg;

let pool;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

export async function ensureTables() {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS blocked_ips (
      ip TEXT PRIMARY KEY,
      blocked_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
  await db.query(`
    CREATE TABLE IF NOT EXISTS pix_payments (
      tx_id TEXT PRIMARY KEY,
      external_id TEXT,
      paid BOOLEAN DEFAULT FALSE,
      status TEXT DEFAULT 'pending',
      value NUMERIC,
      content_id TEXT,
      content_name TEXT,
      customer_ip TEXT,
      user_agent TEXT,
      capi_fired BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
}

export async function dbUpsertPayment(txId, data) {
  const db = getPool();
  await db.query(`
    INSERT INTO pix_payments (tx_id, external_id, paid, status, value, content_id, content_name, customer_ip, user_agent, capi_fired, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
    ON CONFLICT (tx_id) DO UPDATE SET
      paid = EXCLUDED.paid,
      status = EXCLUDED.status,
      value = COALESCE(EXCLUDED.value, pix_payments.value),
      content_id = COALESCE(EXCLUDED.content_id, pix_payments.content_id),
      content_name = COALESCE(EXCLUDED.content_name, pix_payments.content_name),
      capi_fired = EXCLUDED.capi_fired,
      updated_at = NOW()
  `, [
    txId,
    data.externalId || null,
    data.paid || false,
    data.status || 'pending',
    data.value || null,
    data.contentId || null,
    data.contentName || null,
    data.customerIp || null,
    data.userAgent || null,
    data.capiFired || false,
  ]);
}

export async function dbGetPayment(txId) {
  const db = getPool();
  const r = await db.query('SELECT * FROM pix_payments WHERE tx_id = $1', [txId]);
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return {
    paid: row.paid,
    status: row.status,
    value: parseFloat(row.value) || 0,
    contentId: row.content_id,
    contentName: row.content_name,
    customerIp: row.customer_ip,
    userAgent: row.user_agent,
    capiFired: row.capi_fired,
    externalId: row.external_id,
  };
}
