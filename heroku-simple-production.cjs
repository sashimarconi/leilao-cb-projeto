'use strict';

const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1); // IPs reais no Heroku

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── IP Blocker (PostgreSQL permanente) ──────────────────────────────────────

const { Pool } = require('pg');
const pgPool = new Pool({ connectionString: process.env.DATABASE_URL });

// Garante que a tabela existe ao iniciar
pgPool.query(`
  CREATE TABLE IF NOT EXISTS blocked_ips (
    ip TEXT PRIMARY KEY,
    blocked_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(() => {});

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || '';
}

app.get('/api/block/check', async (req, res) => {
  const ip = getClientIp(req);
  try {
    const result = await pgPool.query(
      'SELECT 1 FROM blocked_ips WHERE ip = $1 LIMIT 1',
      [ip]
    );
    res.json({ blocked: result.rowCount > 0, ip });
  } catch {
    res.json({ blocked: false, ip });
  }
});

app.post('/api/block/register', async (req, res) => {
  const ip = getClientIp(req);
  try {
    await pgPool.query(
      'INSERT INTO blocked_ips (ip) VALUES ($1) ON CONFLICT (ip) DO NOTHING',
      [ip]
    );
    res.json({ ok: true, ip });
  } catch {
    res.json({ ok: false, ip });
  }
});

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/api/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

// ─── CPF consulta ─────────────────────────────────────────────────────────────

app.get('/api/cpf/consulta', async (req, res) => {
  const cpf = String(req.query.cpf || '').replace(/\D/g, '');
  if (cpf.length !== 11) {
    return res.status(400).json({ error: 'CPF inválido' });
  }
  try {
    const response = await axios.get(
      `https://renouvaslab.beauty/api/consulta.php?cpf=${cpf}`,
      { timeout: 10000 }
    );
    return res.json(response.data);
  } catch (err) {
    return res.status(502).json({ error: 'Erro ao consultar CPF' });
  }
});

// ─── Payment status store ──────────────────────────────────────────────────────
// In-memory cache (velocidade) + PostgreSQL (persistência entre dynos/restarts)
const paymentStatusMap = new Map();

// Garante tabela no banco ao iniciar
pgPool.query(`
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
`).catch(e => console.error('[db] erro ao criar tabela pix_payments:', e.message));

async function dbUpsertPayment(txId, data) {
  try {
    await pgPool.query(`
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
  } catch (e) {
    console.error('[db] erro upsert pix_payments:', e.message);
  }
}

async function dbGetPayment(txId) {
  try {
    const r = await pgPool.query('SELECT * FROM pix_payments WHERE tx_id = $1', [txId]);
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
  } catch (e) {
    console.error('[db] erro get pix_payments:', e.message);
    return null;
  }
}

const FB_PIXELS = [
  { id: '1572682427123499', tokenEnv: 'META_ACCESS_TOKEN' },
  { id: '1345659734286936', tokenEnv: 'META_ACCESS_TOKEN_2' },
];

async function sendCapiEvent({ eventName, eventId, value, contentId, contentName, customerIp, userAgent }) {
  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_id: eventId || `${eventName}_${Date.now()}`,
      user_data: {
        client_ip_address: customerIp || '',
        client_user_agent: userAgent || '',
      },
      custom_data: {
        currency: 'BRL',
        value: value || 0,
        content_ids: [contentId || ''],
        content_name: contentName || '',
        content_type: 'product',
        num_items: 1,
      },
    }],
  };
  await Promise.all(FB_PIXELS.map(async ({ id: pixelId, tokenEnv }) => {
    const token = process.env[tokenEnv];
    if (!token) { console.log(`[CAPI] ${tokenEnv} não definido — pulando pixel=${pixelId}`); return; }
    try {
      const r = await axios.post(
        `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${token}`,
        payload,
        { timeout: 8000 }
      );
      console.log(`[CAPI] ${eventName} → pixel=${pixelId} events_received=${r.data?.events_received}`);
    } catch (err) {
      console.error(`[CAPI] error pixel=${pixelId}:`, err?.response?.data || err.message);
    }
  }));
}

// ─── BuckPay helpers ──────────────────────────────────────────────────────────

const BUCKPAY_API_URL = 'https://api.realtechdev.com.br';

function sanitizeBuyerName(name) {
  return (name || '').replace(/[^A-Za-zÀ-ÖØ-öø-ÿ\s\-']/g, '').trim().slice(0, 100) || 'Cliente';
}

function buildExternalId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `lote-${Date.now()}-${rand}`;
}

function getBuckPayHeaders() {
  const token = process.env.PICATIC_API_KEY;
  if (!token) throw new Error('BuckPay credentials missing (PICATIC_API_KEY)');
  return {
    'Authorization': `Bearer ${token}`,
    'User-Agent': process.env.BUCKPAY_USER_AGENT || 'Mozilla/5.0 (compatible; LeilaoApp/1.0)',
    'Content-Type': 'application/json',
  };
}

// external_id → BuckPay UUID (para lookup no webhook se necessário)
const externalIdMap = new Map();

// ─── PIX create ───────────────────────────────────────────────────────────────

app.post('/api/pix/create', async (req, res) => {
  try {
    const { name, email, cpf, phone, amount, lotTitle } = req.body;

    if (!name || !cpf || !amount) {
      return res.status(400).json({ error: 'name, cpf e amount são obrigatórios' });
    }

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
      if (phoneWithCountry.length >= 12 && phoneWithCountry.length <= 13) {
        buyer.phone = phoneWithCountry;
      }
    }

    const webhookBase = process.env.HEROKU_APP_URL || 'https://casasbahia-cb823550c0e9.herokuapp.com';
    const payload = {
      external_id: externalId,
      payment_method: 'pix',
      amount: amountInCentavos,
      buyer,
      product: {
        id: externalId,
        name: `Comissão Leiloeiro — ${lotTitle || 'Lote Leilão #144'}`,
      },
      offer: {
        id: externalId,
        name: lotTitle || 'Lote Leilão #144',
        quantity: 1,
      },
      postbackUrl: `${webhookBase}/api/pix/webhook`,
    };

    console.log(`[create] external_id=${externalId} amount=${amountInCentavos}c (R$${amountInReais})`);

    const response = await axios.post(`${BUCKPAY_API_URL}/v1/transactions`, payload, {
      headers: getBuckPayHeaders(),
      timeout: 15000,
    });

    const data = response.data && response.data.data;

    if (!data || !data.id) {
      return res.status(422).json({ error: (response.data && response.data.error && response.data.error.message) || 'Resposta inválida da BuckPay' });
    }

    const txId = data.id;
    const paymentData = {
      externalId,
      paid: false,
      status: data.status || 'pending',
      value: amountInReais,
      contentId: lotTitle || 'Lote Leilão #144',
      contentName: lotTitle || 'Lote Leilão #144',
      customerIp: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '',
      userAgent: req.headers['user-agent'] || '',
    };
    externalIdMap.set(externalId, txId);
    paymentStatusMap.set(txId, paymentData);
    dbUpsertPayment(txId, paymentData); // persiste no banco (não aguarda)

    return res.json({
      id: txId,
      externalId,
      status: data.status,
      pixCode: (data.pix && data.pix.code) || null,
      qrcodeBase64: (data.pix && data.pix.qrcode_base64) || null,
    });
  } catch (err) {
    const errData = err.response && err.response.data;
    const msg =
      (errData && errData.error && errData.error.message) ||
      (errData && errData.error) ||
      err.message ||
      'Erro ao criar transação';
    console.error('[create] erro BuckPay:', errData || err.message);
    return res.status(500).json({ error: msg });
  }
});

// ─── Confirm manual (frontend chama ao clicar "Já paguei") ──────────────────
// Garante CAPI mesmo sem webhook da GhostsPay configurado

app.post('/api/pix/confirm', async (req, res) => {
  res.json({ ok: true });
  try {
    const { txId, value, lotTitle, name, cpf } = req.body;
    if (!txId) return;

    const customerIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';
    const amt = Number(value) || 0;
    const content = lotTitle || 'Lote Leilão';

    // Só dispara CAPI se ainda não foi disparado para este txId (evita duplicata com webhook)
    const existing = paymentStatusMap.get(txId) || {};
    const alreadyFired = existing.capiFired;

    paymentStatusMap.set(txId, {
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

    console.log(`[confirm] tx=${txId} value=${amt} alreadyFired=${alreadyFired}`);

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
    console.error('[confirm] error:', err.message);
  }
});

// ─── Webhook BuckPay (transaction.created / transaction.processed) ────────────

app.post('/api/pix/webhook', async (req, res) => {
  res.json({ ok: true }); // responde 200 imediatamente
  try {
    const body = req.body;
    const event = body.event;
    const txData = body.data;
    if (!txData) return;

    const txId = txData.id;
    const status = String(txData.status || '').toLowerCase();
    if (!txId) return;

    // Lê do banco (fonte da verdade) e fallback para memória
    const dbEntry = await dbGetPayment(txId);
    const existing = dbEntry || paymentStatusMap.get(txId) || {};
    const paid = isPaid(status);
    const valueInCentavos = txData.total_amount || 0;
    const value = existing.value || valueInCentavos / 100;
    const contentId = existing.contentId || 'Lote';
    const contentName = existing.contentName || contentId;
    const alreadyFired = existing.capiFired;

    const updated = { ...existing, paid, status, value, contentId, contentName, capiFired: alreadyFired || paid };
    paymentStatusMap.set(txId, updated);
    await dbUpsertPayment(txId, updated); // persiste no banco
    console.log(`[webhook] event=${event} tx=${txId} status=${status} paid=${paid} value=${value} alreadyFired=${alreadyFired}`);

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
});

// ─── PIX status ───────────────────────────────────────────────────────────────

app.get('/api/pix/status/:id', async (req, res) => {
  const txId = req.params.id;

  // 1. Cache em memória (mais rápido)
  const memEntry = paymentStatusMap.get(txId);
  if (memEntry && memEntry.paid) {
    return res.json({ id: txId, status: memEntry.status, paid: true });
  }

  // 2. Banco de dados (persistente entre dynos/restarts)
  const dbEntry = await dbGetPayment(txId);
  if (dbEntry) {
    // Sincroniza memória com banco
    paymentStatusMap.set(txId, dbEntry);
    if (dbEntry.paid) {
      return res.json({ id: txId, status: dbEntry.status, paid: true });
    }
    return res.json({ id: txId, status: dbEntry.status, paid: false });
  }

  // 3. Sem registro — txId desconhecido
  return res.json({ id: txId, status: 'PENDING', paid: false });
});

// ─── PIX stream — SSE real-time confirmation ──────────────────────────────────

const PAID_STATUSES_SET = new Set(['paid', 'approved', 'captured', 'authorized', 'settled', 'complete', 'completed']);

function isPaid(status, paidAt) {
  return PAID_STATUSES_SET.has(String(status || '').toLowerCase()) || !!paidAt;
}

app.get('/api/pix/stream/:id', (req, res) => {
  const txId = req.params.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let closed = false;
  let pollTimer = null;
  let heartbeatTimer = null;

  function cleanup() {
    closed = true;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  }

  function send(data) {
    if (!closed) res.write('data: ' + JSON.stringify(data) + '\n\n');
  }

  // Heartbeat every 20s — keeps Heroku from dropping idle connection
  heartbeatTimer = setInterval(() => {
    if (!closed) res.write(': heartbeat\n\n');
  }, 20000);

  // Poll memória + banco a cada 2s para detectar pagamento
  pollTimer = setInterval(async () => {
    if (closed) return;
    // Memória primeiro (rápido)
    const memEntry = paymentStatusMap.get(txId);
    if (memEntry && memEntry.paid) {
      send({ type: 'payment_approved', status: memEntry.status });
      cleanup();
      res.end();
      return;
    }
    // Banco de dados (persistente — captura pagamentos de outros dynos)
    try {
      const dbEntry = await dbGetPayment(txId);
      if (dbEntry && dbEntry.paid) {
        paymentStatusMap.set(txId, dbEntry);
        send({ type: 'payment_approved', status: dbEntry.status });
        cleanup();
        res.end();
      }
    } catch {}
  }, 2000);

  // Auto-close after 10 minutes
  const timeout = setTimeout(() => {
    if (!closed) {
      send({ type: 'timeout' });
      cleanup();
      res.end();
    }
  }, 10 * 60 * 1000);

  req.on('close', () => {
    clearTimeout(timeout);
    cleanup();
  });
});

// ─── Static frontend (built by Vite) ─────────────────────────────────────────

const STATIC_DIR = path.join(__dirname, 'artifacts', 'leilao-cb', 'dist', 'public');

app.use(express.static(STATIC_DIR));

app.get('*', (_req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
