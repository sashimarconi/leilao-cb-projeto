export const NITRO_API_URL = 'https://api.nitropagamento.app';

export function sanitizeBuyerName(name) {
  return (name || '').replace(/[^A-Za-zÀ-ÖØ-öø-ÿ\s\-']/g, '').trim().slice(0, 100) || 'Cliente';
}

export function buildExternalId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `lote-${Date.now()}-${rand}`;
}

export function getNitroHeaders() {
  const publicKey = process.env.NITRO_PUBLIC_KEY;
  const privateKey = process.env.NITRO_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error('Nitro credentials missing (NITRO_PUBLIC_KEY/NITRO_PRIVATE_KEY)');
  }
  const token = Buffer.from(`${publicKey}:${privateKey}`).toString('base64');
  return {
    Authorization: `Basic ${token}`,
    'Content-Type': 'application/json',
  };
}

export function getWebhookBase() {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://casasbahia-api-server5.vercel.app';
}

export const PAID_STATUSES = new Set(['paid', 'pago', 'approved', 'captured', 'authorized', 'settled', 'complete', 'completed']);

export function isPaid(status) {
  return PAID_STATUSES.has(String(status || '').toLowerCase());
}

export async function fetchNitroTransaction(txId) {
  const response = await fetch(`${NITRO_API_URL}?id=${encodeURIComponent(txId)}`, {
    headers: getNitroHeaders(),
    method: 'GET',
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Nitro transaction fetch failed: ${response.status} ${errorText}`);
  }
  const payload = await response.json();
  if (!payload || !payload.success || !payload.data) {
    throw new Error('Invalid Nitro transaction response');
  }
  return payload.data;
}
