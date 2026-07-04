import { dbGetPayment, ensureTables } from '../../_lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const txId = req.query.id;

  try {
    await ensureTables();
    const entry = await dbGetPayment(txId);
    if (entry && entry.paid) {
      res.write(`data: ${JSON.stringify({ type: 'payment_approved', status: entry.status })}\n\n`);
    } else {
      res.write(`: pending\n\n`);
    }
  } catch {
    res.write(`: error\n\n`);
  }

  res.end();
}
