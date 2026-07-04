import axios from 'axios';
import { dbUpsertPayment, ensureTables } from '../_lib/db.js';
import { BUCKPAY_API_URL, sanitizeBuyerName, buildExternalId, getBuckPayHeaders, getWebhookBase } from '../_lib/buckpay.js';

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

    const response = await axios.post(`${BUCKPAY_API_URL}/v1/transactions`, payload, {
      headers: getBuckPayHeaders(),
      timeout: 15000,
    });

    // BuckPay pode retornar { data: { id, pix } } ou flat { id, pix }
    const resp = response.data;
    const data = (resp && resp.data && resp.data.id) ? resp.data : resp;
    if (!data || !data.id) {
      console.error('[pix/create] resposta inesperada:', JSON.stringify(resp));
      return res.status(422).json({ error: (resp?.error?.message) || resp?.message || 'Resposta inválida da BuckPay' });
    }

    const txId = data.id;
    // Extrai código PIX — tenta todos os campos conhecidos da BuckPay
    const pixObj = data.pix || data.pix_data || data.charge || {};
    const pixCode = pixObj.code || pixObj.emv || pixObj.qr_code || pixObj.copia_e_cola || pixObj.copy_paste || null;
    const qrcodeBase64 = pixObj.qrcode_base64 || pixObj.qr_code_base64 || pixObj.image_base64 || pixObj.base64 || null;
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

    await ensureTables();
    dbUpsertPayment(txId, paymentData).catch(() => {});

    return res.json({
      id: txId,
      externalId,
      status: data.status,
      pixCode,
      qrcodeBase64,
    });
  } catch (err) {
    const errData = err.response && err.response.data;
    const baseMsg = (errData?.error?.message) || (errData?.error) || err.message || 'Erro ao criar transação';
    // Inclui detalhes de validação (ex: CPF inválido)
    const detail = errData?.error?.detail ? Object.values(errData.error.detail).flat().join(', ') : null;
    const msg = detail ? `${baseMsg}: ${detail}` : baseMsg;
    console.error('[pix/create] erro:', JSON.stringify(errData || err.message));
    return res.status(500).json({ error: msg });
  }
}
