import axios from 'axios';
import { dbUpsertPayment, ensureTables } from '../_lib/db.js';
import { sanitizeBuyerName, buildExternalId, getNitroHeaders, getWebhookBase } from '../_lib/nitro.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

    const response = await axios.post('https://api.nitropagamento.app', payload, {
      headers: getNitroHeaders(),
      timeout: 15000,
    });

    const resp = response.data;
    if (!resp || resp.success !== true || !resp.data || !resp.data.id) {
      console.error('[pix/create] resposta inesperada:', JSON.stringify(resp));
      return res.status(422).json({ error: (resp?.message) || 'Resposta inválida da Nitro Pagamentos Hub' });
    }

    const data = resp.data;
    const txId = data.id;
    const pixCode = data.pix_code || null;
    const qrcodeBase64 = data.pix_qr_code || null;
    console.log('[pix/create] tx:', txId, 'pixCode:', pixCode ? 'ok' : 'null');

    const customerIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || '';
    const paymentData = {
      externalId,
      paid: false,
      status: data.status || 'pending',
      value: amountInReais,
      contentId: lotTitle || 'Lote Leilão #144',
      contentName: lotTitle || 'Lote Leilão #144',
      customerIp,
      userAgent: req.headers['user-agent'] || '',
    };

    try {
      await ensureTables();
      await dbUpsertPayment(txId, paymentData);
    } catch (dbErr) {
      console.warn('[pix/create] persistence skipped:', dbErr?.message || dbErr);
    }

    return res.json({
      id: txId,
      externalId,
      status: data.status,
      pixCode,
      qrcodeBase64,
    });
  } catch (err) {
    const errData = err?.response?.data || err?.data;
    const baseMsg = (errData?.error?.message) || (errData?.error) || errData?.message || err?.message || 'Erro ao criar transação';
    const detail = errData?.error?.detail ? Object.values(errData.error.detail).flat().join(', ') : null;
    const msg = detail ? `${baseMsg}: ${detail}` : baseMsg;
    console.error('[pix/create] erro:', JSON.stringify(errData || err?.message || err));
    return res.status(500).json({ error: msg });
  }
}
