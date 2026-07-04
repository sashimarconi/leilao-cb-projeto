import axios from 'axios';

const FB_PIXELS = [
  { id: '1572682427123499', tokenEnv: 'META_ACCESS_TOKEN' },
  { id: '1345659734286936', tokenEnv: 'META_ACCESS_TOKEN_2' },
  { id: '2002239153696169', tokenEnv: 'META_ACCESS_TOKEN_3' },
];

export async function sendCapiEvent({ eventName, eventId, value, contentId, contentName, customerIp, userAgent }) {
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
    if (!token) return;
    try {
      await axios.post(
        `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${token}`,
        payload,
        { timeout: 8000 }
      );
    } catch (err) {
      console.error(`[CAPI] error pixel=${pixelId}:`, err?.response?.data || err.message);
    }
  }));
}
