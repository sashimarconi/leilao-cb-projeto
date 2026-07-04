import { Router } from "express";
import axios from "axios";

const router = Router();

const BUCKPAY_API = "https://api.realtechdev.com.br";
const FB_PIXELS = [
  { id: "1572682427123499", tokenEnv: "META_ACCESS_TOKEN" },
  { id: "1345659734286936", tokenEnv: "META_ACCESS_TOKEN_2" },
  { id: "2002239153696169", tokenEnv: "META_ACCESS_TOKEN_3" },
];
const PAID_STATUSES = new Set(["paid", "approved", "captured", "authorized", "settled", "complete", "completed"]);

// txId (BuckPay UUID) → { paid, status, value, contentId, contentName, customerIp, userAgent, capiFired }
const paymentStatusMap = new Map<string, Record<string, any>>();
// external_id → txId (so we can look up by external_id on webhook)
const externalIdMap = new Map<string, string>();

function getBuckPayHeaders(): Record<string, string> {
  const token = process.env.PICATIC_API_KEY;
  if (!token) throw new Error("BuckPay credentials missing (PICATIC_API_KEY)");
  return {
    "Authorization": `Bearer ${token}`,
    "User-Agent": process.env.BUCKPAY_USER_AGENT || "Mozilla/5.0 (compatible; LeilaoApp/1.0)",
    "Content-Type": "application/json",
  };
}

function isPaid(status: string, paidAt?: unknown): boolean {
  return PAID_STATUSES.has(String(status).toLowerCase()) || !!paidAt;
}

function sanitizeName(name: string): string {
  return name.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ\s\-']/g, "").trim().slice(0, 100) || "Cliente";
}

function buildExternalId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `lote-${Date.now()}-${rand}`;
}

async function sendCapiEvent(params: {
  eventName: string;
  eventId: string;
  value: number;
  contentId: string;
  contentName: string;
  customerIp?: string;
  userAgent?: string;
}) {
  const payload = {
    data: [{
      event_name: params.eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: "website",
      event_id: params.eventId,
      user_data: {
        client_ip_address: params.customerIp || "",
        client_user_agent: params.userAgent || "",
      },
      custom_data: {
        currency: "BRL",
        value: params.value,
        content_ids: [params.contentId],
        content_name: params.contentName,
        content_type: "product",
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
      console.log(`[CAPI] ${params.eventName} → pixel=${pixelId} events_received=${r.data?.events_received} fbtrace=${r.data?.fbtrace_id}`);
    } catch (err: any) {
      console.error(`[CAPI] erro pixel=${pixelId}:`, err?.response?.data || err.message);
    }
  }));
}

// ─── Create PIX ──────────────────────────────────────────────────────────────

router.post("/pix/create", async (req, res) => {
  try {
    const { name, email, cpf, phone, amount, lotTitle } = req.body;

    if (!name || !cpf || !amount) {
      res.status(400).json({ error: "name, cpf e amount são obrigatórios" });
      return;
    }

    const cleanCpf = cpf.replace(/\D/g, "");
    const cleanPhone = (phone || "").replace(/\D/g, "");
    const amountInReais = Number(amount);
    const amountInCentavos = Math.round(amountInReais * 100);
    const externalId = buildExternalId();
    const safeEmail = email || `${cleanCpf}@arrematante.com.br`;
    const safeName = sanitizeName(name);

    const buyer: Record<string, string> = {
      name: safeName.length >= 3 ? safeName : `${safeName} Cliente`,
      email: safeEmail,
      document: cleanCpf,
    };
    if (cleanPhone.length >= 10) {
      const phoneWithCountry = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
      if (phoneWithCountry.length >= 12 && phoneWithCountry.length <= 13) {
        buyer.phone = phoneWithCountry;
      }
    }

    const webhookBase = process.env.HEROKU_APP_URL || "https://casasbahia-cb823550c0e9.herokuapp.com";
    const payload = {
      external_id: externalId,
      payment_method: "pix",
      amount: amountInCentavos,
      buyer,
      product: {
        id: externalId,
        name: `Comissão Leiloeiro — ${lotTitle || "Lote Leilão #144"}`,
      },
      offer: {
        id: externalId,
        name: lotTitle || "Lote Leilão #144",
        quantity: 1,
      },
      postbackUrl: `${webhookBase}/api/pix/webhook`,
    };

    console.log(`[create] external_id=${externalId} amount=${amountInCentavos}c (R$${amountInReais})`);

    const response = await axios.post(`${BUCKPAY_API}/v1/transactions`, payload, {
      headers: getBuckPayHeaders(),
      timeout: 15000,
    });

    const data = response.data?.data as any;

    if (!data || !data.id) {
      res.status(422).json({ error: response.data?.error?.message || "Resposta inválida da BuckPay" });
      return;
    }

    const txId = data.id;
    externalIdMap.set(externalId, txId);
    paymentStatusMap.set(txId, {
      paid: false,
      status: data.status || "pending",
      value: amountInReais,
      contentId: lotTitle || "Lote Leilão #144",
      contentName: lotTitle || "Lote Leilão #144",
      customerIp: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "",
      userAgent: req.headers["user-agent"] || "",
    });

    res.json({
      id: txId,
      externalId,
      status: data.status,
      pixCode: data.pix?.code ?? null,
      qrcodeBase64: data.pix?.qrcode_base64 ?? null,
    });
  } catch (err: any) {
    const errData = err?.response?.data;
    const baseMsg = errData?.error?.message || errData?.error || err.message || "Erro ao criar transação";
    // Extrai detalhes de validação da BuckPay (ex: CPF inválido)
    const detail = errData?.error?.detail
      ? Object.values(errData.error.detail as Record<string, string[]>).flat().join(", ")
      : null;
    const msg = detail ? `${baseMsg}: ${detail}` : baseMsg;
    console.error("[create] erro BuckPay:", JSON.stringify(errData || err.message, null, 2));
    res.status(500).json({ error: msg });
  }
});

// ─── Confirm manual (frontend chama ao clicar "Já paguei") ──────────────────

router.post("/pix/confirm", async (req, res) => {
  res.json({ ok: true });
  try {
    const { txId, value, lotTitle } = req.body;
    if (!txId) return;

    const customerIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "";
    const userAgent = req.headers["user-agent"] || "";
    const amt = Number(value) || 0;
    const content = lotTitle || "Lote Leilão";

    const existing = paymentStatusMap.get(txId) || {};
    const alreadyFired = existing.capiFired;

    paymentStatusMap.set(txId, {
      ...existing,
      paid: true,
      status: "paid",
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
        eventName: "Purchase",
        eventId: `Purchase_${txId}`,
        value: amt,
        contentId: content,
        contentName: content,
        customerIp,
        userAgent,
      });
    }
  } catch (err: any) {
    console.error("[confirm] error:", err.message);
  }
});

// ─── Webhook BuckPay → CAPI ──────────────────────────────────────────────────

router.post("/pix/webhook", async (req, res) => {
  res.json({ ok: true });
  try {
    const body = req.body as any;
    const event = body.event as string;
    const txData = body.data as any;

    if (!txData) return;

    const txId = txData.id;
    const status = String(txData.status || "").toLowerCase();

    if (!txId) return;

    const existing = paymentStatusMap.get(txId) || {};
    const paid = isPaid(status);
    const valueInCentavos = txData.total_amount || 0;
    const value = existing.value || valueInCentavos / 100;
    const contentId = existing.contentId || "Lote";
    const contentName = existing.contentName || contentId;

    paymentStatusMap.set(txId, { ...existing, paid, status, value, contentId, contentName });
    console.log(`[webhook] event=${event} tx=${txId} status=${status} paid=${paid} value=${value}`);

    if (paid && !existing.capiFired) {
      paymentStatusMap.set(txId, { ...paymentStatusMap.get(txId)!, capiFired: true });
      await sendCapiEvent({
        eventName: "Purchase",
        eventId: `Purchase_${txId}`,
        value,
        contentId,
        contentName,
        customerIp: existing.customerIp,
        userAgent: existing.userAgent,
      });
    }
  } catch (err: any) {
    console.error("[webhook] erro:", err.message);
  }
});

// ─── Status ───────────────────────────────────────────────────────────────────

router.get("/pix/status/:id", (req, res) => {
  const txId = req.params.id;
  const entry = paymentStatusMap.get(txId);
  if (!entry) { res.json({ id: txId, status: "PENDING", paid: false }); return; }
  res.json({ id: txId, status: entry.status, paid: entry.paid });
});

// ─── SSE stream ───────────────────────────────────────────────────────────────

router.get("/pix/stream/:id", (req, res) => {
  const txId = req.params.id;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let closed = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  function cleanup() {
    closed = true;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  }

  function send(data: object) {
    if (!closed) res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  heartbeatTimer = setInterval(() => {
    if (!closed) res.write(": heartbeat\n\n");
  }, 20000);

  pollTimer = setInterval(() => {
    if (closed) return;
    const entry = paymentStatusMap.get(txId);
    if (entry && entry.paid) {
      send({ type: "payment_approved", status: entry.status });
      cleanup();
      res.end();
    }
  }, 2000);

  const timeout = setTimeout(() => {
    if (!closed) { send({ type: "timeout" }); cleanup(); res.end(); }
  }, 10 * 60 * 1000);

  req.on("close", () => { clearTimeout(timeout); cleanup(); });
});

export default router;
