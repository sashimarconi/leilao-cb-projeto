export const BUCKPAY_API_URL = 'https://api.realtechdev.com.br';

export function sanitizeBuyerName(name) {
  return (name || '').replace(/[^A-Za-zÀ-ÖØ-öø-ÿ\s\-']/g, '').trim().slice(0, 100) || 'Cliente';
}

export function buildExternalId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `lote-${Date.now()}-${rand}`;
}

export function getBuckPayHeaders() {
  const token = process.env.PICATIC_API_KEY;
  if (!token) throw new Error('BuckPay credentials missing (PICATIC_API_KEY)');
  return {
    'Authorization': `Bearer ${token}`,
    'User-Agent': process.env.BUCKPAY_USER_AGENT || 'Mozilla/5.0 (compatible; LeilaoApp/1.0)',
    'Content-Type': 'application/json',
  };
}

export function getWebhookBase() {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://casasbahia-api-server5.vercel.app';
}

export const PAID_STATUSES = new Set(['paid', 'approved', 'captured', 'authorized', 'settled', 'complete', 'completed']);

export function isPaid(status) {
  return PAID_STATUSES.has(String(status || '').toLowerCase());
}
