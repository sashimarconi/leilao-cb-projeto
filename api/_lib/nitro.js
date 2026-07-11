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
    return {
      'Content-Type': 'application/json',
    };
  }
  const token = Buffer.from(`${publicKey}:${privateKey}`).toString('base64');
  return {
    Authorization: `Basic ${token}`,
    'Content-Type': 'application/json',
  };
}

export function buildFallbackPixCode(txId, amount, lotTitle = '') {
  const seed = String(txId || `fallback-${Date.now()}`).replace(/[^a-zA-Z0-9]/g, '').slice(0, 20).toUpperCase();
  const amountCents = Math.max(1, Math.round(Number(amount || 0) * 100));
  const amountLabel = String(amountCents).padStart(6, '0').slice(-6);
  const title = String(lotTitle || 'LOTE').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12).toUpperCase();
  return `00020101021226800014br.gov.bcb.pix2558fallback-${seed}-${amountLabel}-${title}5204000053039865802BR5913PAGAMENTOFALLBACK6008SAOPAULO62070503***6304${amountLabel}`;
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
