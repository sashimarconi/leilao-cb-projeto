import { getPool, ensureTables } from '../_lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? String(forwarded).split(',')[0].trim() : (req.socket?.remoteAddress || '');
  try {
    await ensureTables();
    const db = getPool();
    await db.query('INSERT INTO blocked_ips (ip) VALUES ($1) ON CONFLICT (ip) DO NOTHING', [ip]);
    res.json({ ok: true, ip });
  } catch {
    res.json({ ok: false, ip });
  }
}
