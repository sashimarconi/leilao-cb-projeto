import { dbGetPayment, ensureTables } from '../../_lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const txId = req.query.id;
  try {
    await ensureTables();
    const entry = await dbGetPayment(txId);
    if (entry) {
      return res.json({ id: txId, status: entry.status, paid: entry.paid });
    }
    return res.json({ id: txId, status: 'pending', paid: false });
  } catch (err) {
    console.error('[pix/status] error:', err.message);
    return res.json({ id: txId, status: 'pending', paid: false });
  }
}
