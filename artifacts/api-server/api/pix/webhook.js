import { dbGetPayment, dbUpsertPayment, ensureTables } from '../_lib/db.js';
import { sendCapiEvent } from '../_lib/capi.js';
import { isPaid } from '../_lib/nitro.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  res.json({ ok: true });

  try {
    const body = req.body;
    const event = body.event;
    const txData = body.data;
    if (!txData) return;

    const txId = txData.id || txData.transaction_id;
    if (!txId) return;

    const status = String(txData.status || (event === 'transaction.paid' ? 'paid' : '')).toLowerCase();
    const paid = isPaid(status);

    await ensureTables();
    const existing = await dbGetPayment(txId) || {};
    const value = existing.value || Number(txData.amount || 0);
    const contentId = existing.contentId || 'Lote';
    const contentName = existing.contentName || contentId;
    const alreadyFired = existing.capiFired;

    await dbUpsertPayment(txId, {
      ...existing,
      paid,
      status,
      value,
      contentId,
      contentName,
      capiFired: alreadyFired || paid,
    });

    console.log(`[webhook] event=${event} tx=${txId} status=${status} paid=${paid}`);

    if (paid && !alreadyFired) {
      await sendCapiEvent({
        eventName: 'Purchase',
        eventId: `Purchase_${txId}`,
        value,
        contentId,
        contentName,
        customerIp: existing.customerIp || '',
        userAgent: existing.userAgent || '',
      });
    }
  } catch (err) {
    console.error('[webhook] error:', err.message);
  }
}
