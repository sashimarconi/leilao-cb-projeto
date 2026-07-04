import { dbGetPayment, dbUpsertPayment, ensureTables } from '../_lib/db.js';
import { sendCapiEvent } from '../_lib/capi.js';
import { isPaid } from '../_lib/nitro.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  res.json({ ok: true });

  try {
    const body = req.body;
    const event = body.event;
    const txData = body.data;
    if (!txData) return;

    const txId = txData.id || txData.transaction_id;
    const status = String(txData.status || (event === 'transaction.paid' ? 'paid' : '')).toLowerCase();
    if (!txId) return;

    await ensureTables();
    const existing = await dbGetPayment(txId) || {};
    const paid = isPaid(status);
    const valueInCentavos = txData.total_amount || 0;
    const value = existing.value || valueInCentavos / 100;
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
