import { dbGetPayment, dbUpsertPayment, ensureTables } from '../_lib/db.js';
import { sendCapiEvent } from '../_lib/capi.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  res.json({ ok: true });

  try {
    const { txId, value, lotTitle } = req.body;
    if (!txId) return;

    const forwarded = req.headers['x-forwarded-for'];
    const customerIp = forwarded ? String(forwarded).split(',')[0].trim() : '';
    const userAgent = req.headers['user-agent'] || '';
    const amt = Number(value) || 0;
    const content = lotTitle || 'Lote Leilão';

    await ensureTables();
    const existing = await dbGetPayment(txId) || {};
    const alreadyFired = existing.capiFired;

    await dbUpsertPayment(txId, {
      ...existing,
      paid: true,
      status: 'paid',
      value: amt,
      contentId: content,
      contentName: content,
      customerIp,
      userAgent,
      capiFired: true,
    });

    if (!alreadyFired) {
      await sendCapiEvent({
        eventName: 'Purchase',
        eventId: `Purchase_${txId}`,
        value: amt,
        contentId: content,
        contentName: content,
        customerIp,
        userAgent,
      });
    }
  } catch (err) {
    console.error('[pix/confirm] error:', err.message);
  }
}
