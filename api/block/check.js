import { getPool, ensureTables } from '../_lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? String(forwarded).split(',')[0].trim() : (req.socket?.remoteAddress || '');
  try {
    await ensureTables();
    const db = getPool();
    const result = await db.query('SELECT 1 FROM blocked_ips WHERE ip = $1 LIMIT 1', [ip]);
    res.json({ blocked: result.rowCount > 0, ip });
  } catch {
    res.json({ blocked: false, ip });
  }
}
