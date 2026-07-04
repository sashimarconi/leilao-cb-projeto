import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import QrCode from "@/components/QrCode";
import {
  pixelViewContent,
  pixelLead,
  pixelInitiateCheckout,
  pixelAddPaymentInfo,
  pixelPurchase,
} from "@/lib/pixel";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    ttq?: { track: (event: string, params?: Record<string, unknown>) => void };
  }
}

const CB_BLUE = "#0033C6";
const FRETE_AMOUNT = 89.84;
const rfLogo = "/receita-federal-logo.png";
const nfeLogo = "/nfe-logo.png";
const rfHLogo = "/receita-federal-h.png";
const govBrasilLogo = "/gov-brasil-logo.jpg";
const PAID_STATUSES = ["paid", "approved", "captured", "authorized", "settled", "complete", "completed"];

interface BidModalProps {
  open: boolean;
  onClose: () => void;
  lotTitle: string;
  lotNum: string;
  bidAmount: number;
  comissao: number;
  itemId: string;
  lotImage?: string;
}

type Step =
  | "cpf-lookup"
  | "cpf-confirm"
  | "confirm"
  | "payment-select"
  | "address"
  | "address-saving"
  | "address-success"
  | "info"
  | "pix"
  | "nf-pendencia"
  | "nf-document"
  | "icms-pendencia"
  | "icms-document";

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function todayStr(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}

function formatCPF(v: string): string {
  const n = v.replace(/\D/g, "").slice(0, 11);
  return n
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

function formatPhone(v: string): string {
  const n = v.replace(/\D/g, "").slice(0, 11);
  if (n.length <= 2) return n;
  if (n.length <= 7) return `(${n.slice(0,2)}) ${n.slice(2)}`;
  if (n.length <= 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
  return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
}

function getDeliveryRange(): string {
  const months = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const today = new Date();
  const d1 = new Date(today); d1.setDate(today.getDate() + 5);
  const d2 = new Date(today); d2.setDate(today.getDate() + 6);
  const fmt = (d: Date) => `${d.getDate()} de ${months[d.getMonth()]}`;
  return `${fmt(d1)} e ${fmt(d2)}`;
}

function getApiBase(): string {
  return (import.meta.env.VITE_API_URL as string | undefined) || "/api";
}


const inputStyle: React.CSSProperties = {
  display: "block", width: "100%", padding: "12px 14px",
  border: "1px solid #ddd", borderRadius: 8, fontSize: 14,
  fontFamily: "'SiteFonte','Nunito',sans-serif", outline: "none",
  boxSizing: "border-box", minHeight: 48,
};

interface CpfData { nome: string; nome_mae?: string; data_nascimento?: string; }

export default function BidModal({ open, onClose, lotTitle, lotNum, bidAmount, comissao, itemId, lotImage }: BidModalProps) {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("cpf-lookup");
  const [cpfInput, setCpfInput] = useState("");
  const [cpfData, setCpfData] = useState<CpfData | null>(null);
  const [cpfApiOk, setCpfApiOk] = useState(false);
  const [cpfLoading, setCpfLoading] = useState(false);
  const [payMethod, setPayMethod] = useState<"pix"|"boleto"|"card"|"delivery"|null>(null);
  const [address, setAddress] = useState({ cep: "", logradouro: "", bairro: "", cidade: "", uf: "", numero: "" });
  const [cepLoading, setCepLoading] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // PIX principal (50% do produto)
  const [pixCode, setPixCode] = useState("");
  const [pixTxId, setPixTxId] = useState("");
  const [pixLoading, setPixLoading] = useState(false);
  const [pixPaid, setPixPaid] = useState(false);
  const [manualChecking, setManualChecking] = useState(false);
  const [manualCheckMsg, setManualCheckMsg] = useState("");
  const [showManualButton, setShowManualButton] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const sseRef = useRef<EventSource|null>(null);
  const paidHandledRef = useRef(false); // evita duplo disparo entre SSE e polling
  const manualBtnTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null);

  // PIX frete Sedex
  const [fretePixCode, setFretePixCode] = useState("00020101021226800014br.gov.bcb.pix2558qrcode.mkip.com.br/v1/d219830f-1865-4755-947b-3081c97a74ae5204000053039865802BR5913PGGATEWAYLTDA6008SAOPAULO62070503***63045044");
  const [fretePixTxId, setFretePixTxId] = useState("");
  const [freteLoading, setFreteLoading] = useState(false);
  const [freteError, setFreteError] = useState("");
  const [fretePixPaid, setFretePixPaid] = useState(false);
  const [freteCopied, setFreteCopied] = useState(false);
  const [showFreteManualButton, setShowFreteManualButton] = useState(false);
  const [freteManualChecking, setFreteManualChecking] = useState(false);
  const freteManualTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const fretePollRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const pixelFiredRef = useRef(false);

  // PIX NF-e Receita Federal
  const [nfPixCode, setNfPixCode] = useState("00020126580014br.gov.bcb.pix0136preview-nfe-qrcode-placeholder-0000000000000000000000000000000000000000000000000000052040000530398654071234.565802BR5925VIA VAREJO SA CASAS BAHIA6009SAO PAULO62070503***6304ABCD");
  const [nfPixTxId, setNfPixTxId] = useState("");
  const [nfLoading, setNfLoading] = useState(false);
  const [nfPixPaid, setNfPixPaid] = useState(false);
  const [nfCopied, setNfCopied] = useState(false);
  const [showNfManualButton, setShowNfManualButton] = useState(false);
  const [nfManualChecking, setNfManualChecking] = useState(false);
  const nfManualTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const [nfError, setNfError] = useState("");
  const nfPollRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const nfNumRef = useRef<string>("");

  // PIX ICMS — SEFAZ (Imposto sobre Circulação de Mercadoria Arrematada)
  const [icmsPixCode, setIcmsPixCode] = useState("00020126580014br.gov.bcb.pix0136preview-icms-qrcode-placeholder000000000000000000000000000000000000000000000005303986540071234.565802BR5925VIA VAREJO SA CASAS BAHIA6009SAO PAULO62070503***6304ABCD");
  const [icmsPixTxId, setIcmsPixTxId] = useState("");
  const [icmsLoading, setIcmsLoading] = useState(false);
  const [icmsPixPaid, setIcmsPixPaid] = useState(false);
  const [icmsCopied, setIcmsCopied] = useState(false);
  const [showIcmsManualButton, setShowIcmsManualButton] = useState(false);
  const [icmsManualChecking, setIcmsManualChecking] = useState(false);
  const icmsManualTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const [icmsError, setIcmsError] = useState("");
  const [icmsCountdown, setIcmsCountdown] = useState(30 * 60);
  const icmsPollRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const icmsNumRef = useRef<string>("");
  const icmsCountdownRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const gtagFiredRef = useRef(false);

  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      pixelViewContent({
        contentId: itemId,
        contentName: lotTitle,
        value: bidAmount + comissao,
      });
    } else {
      setStep("cpf-lookup");
      setCpfInput(""); setCpfData(null); setCpfApiOk(false); setCpfLoading(false);
      setPayMethod(null);
      setAddress({ cep:"", logradouro:"", bairro:"", cidade:"", uf:"", numero:"" });
      setName(""); setPhone(""); setEmail("");
      setPixCode(""); setPixTxId(""); setPixPaid(false); setCopied(false); setError(""); setManualChecking(false); setManualCheckMsg(""); setShowManualButton(false);
      setFretePixCode(""); setFretePixTxId(""); setFreteLoading(false); setFreteError(""); setFretePixPaid(false); setFreteCopied(false); setShowFreteManualButton(false); setFreteManualChecking(false);
      setNfPixCode(""); setNfPixTxId(""); setNfLoading(false); setNfPixPaid(false); setNfCopied(false); setNfError(""); setShowNfManualButton(false); setNfManualChecking(false);
      nfNumRef.current = "";
      setIcmsPixCode(""); setIcmsPixTxId(""); setIcmsLoading(false); setIcmsPixPaid(false); setIcmsCopied(false); setIcmsError(""); setIcmsCountdown(30 * 60); setShowIcmsManualButton(false); setIcmsManualChecking(false);
      icmsNumRef.current = "";
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      if (fretePollRef.current) { clearInterval(fretePollRef.current); fretePollRef.current = null; }
      if (nfPollRef.current) { clearInterval(nfPollRef.current); nfPollRef.current = null; }
      if (icmsPollRef.current) { clearInterval(icmsPollRef.current); icmsPollRef.current = null; }
      if (icmsCountdownRef.current) { clearInterval(icmsCountdownRef.current); icmsCountdownRef.current = null; }
      if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
      if (manualBtnTimerRef.current) { clearTimeout(manualBtnTimerRef.current); manualBtnTimerRef.current = null; }
      if (freteManualTimerRef.current) { clearTimeout(freteManualTimerRef.current); freteManualTimerRef.current = null; }
      if (nfManualTimerRef.current) { clearTimeout(nfManualTimerRef.current); nfManualTimerRef.current = null; }
      if (icmsManualTimerRef.current) { clearTimeout(icmsManualTimerRef.current); icmsManualTimerRef.current = null; }
      pixelFiredRef.current = false;
      paidHandledRef.current = false;
      gtagFiredRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (fretePollRef.current) clearInterval(fretePollRef.current);
      if (nfPollRef.current) clearInterval(nfPollRef.current);
      if (icmsPollRef.current) clearInterval(icmsPollRef.current);
      if (icmsCountdownRef.current) clearInterval(icmsCountdownRef.current);
      if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
      if (manualBtnTimerRef.current) { clearTimeout(manualBtnTimerRef.current); manualBtnTimerRef.current = null; }
    };
  }, []);

  // Bloqueia scroll do body apenas enquanto o modal está visível
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Countdown regressivo para ICMS
  useEffect(() => {
    if (step === "icms-pendencia" || step === "icms-document") {
      if (icmsCountdownRef.current) return;
      icmsCountdownRef.current = setInterval(() => {
        setIcmsCountdown(prev => {
          if (prev <= 1) {
            if (icmsCountdownRef.current) clearInterval(icmsCountdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (icmsCountdownRef.current) { clearInterval(icmsCountdownRef.current); icmsCountdownRef.current = null; }
    }
  }, [step]);

  // Mostra o botão "Já paguei" 15s após o QR Code aparecer
  useEffect(() => {
    if (!pixCode) return;
    setShowManualButton(false);
    if (manualBtnTimerRef.current) clearTimeout(manualBtnTimerRef.current);
    manualBtnTimerRef.current = setTimeout(() => {
      setShowManualButton(true);
    }, 15000);
    return () => {
      if (manualBtnTimerRef.current) clearTimeout(manualBtnTimerRef.current);
    };
  }, [pixCode]);

  async function handleCpfLookup() {
    const digits = cpfInput.replace(/\D/g,"");
    if (digits.length !== 11) return;
    setCpfLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/cpf/consulta?cpf=${digits}`);
      const data = await res.json();
      if (data?.DADOS?.nome) {
        const d: CpfData = { nome: data.DADOS.nome };
        if (data.DADOS.nome_mae) d.nome_mae = data.DADOS.nome_mae;
        if (data.DADOS.data_nascimento) d.data_nascimento = data.DADOS.data_nascimento;
        setCpfData(d);
        setCpfApiOk(true);
        setName(data.DADOS.nome);
      } else {
        setCpfData(null); setCpfApiOk(false); setName("");
      }
    } catch {
      setCpfData(null); setCpfApiOk(false); setName("");
    }
    setCpfLoading(false);
    setStep("cpf-confirm");
    // Lead — usuário identificado pelo CPF
    pixelLead({ contentId: itemId, contentName: lotTitle, value: bidAmount + comissao });
  }

  async function fetchCep(cep: string) {
    const clean = cep.replace(/\D/g,"");
    if (clean.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (!data.erro) setAddress(a => ({ ...a, logradouro: data.logradouro||"", bairro: data.bairro||"", cidade: data.localidade||"", uf: data.uf||"" }));
    } catch {}
    setCepLoading(false);
  }

  async function handleAddressSave() {
    setStep("address-saving");
    await new Promise(r => setTimeout(r, 4000));
    setStep("address-success");
  }

  async function handleCreatePix() {
    const pixAmount = (bidAmount + comissao) / 2;
    // InitiateCheckout — Meta atribui a sessão ao anúncio
    pixelInitiateCheckout({ contentId: itemId, value: bidAmount + comissao });
    setPixLoading(true); setError("");
    try {
      const res = await fetch(`${getApiBase()}/pix/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          cpf: cpfInput.replace(/\D/g,""),
          amount: pixAmount,
          lotTitle,
          email: email || `${cpfInput.replace(/\D/g,"")}@arrematante.com.br`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao gerar PIX");
      setPixCode(data.pixCode || "");
      setPixTxId(data.id || "");
      // AddPaymentInfo — QR Code gerado, usuário vê o PIX
      pixelAddPaymentInfo({ contentId: itemId, value: pixAmount });
      setStep("pix");
      startSSE(data.id);      // primário: SSE em tempo real
      startPolling(data.id);  // fallback: polling manual
    } catch (e: any) { setError(e.message || "Erro ao gerar PIX"); }
    setPixLoading(false);
  }

  function onPaymentConfirmed() {
    if (paidHandledRef.current) return; // já tratado por SSE ou polling
    paidHandledRef.current = true;
    setPixPaid(true);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }

    // Google Ads — dispara conversão assim que produto é pago (entrada na 1ª upsell)
    fireGtagConversion();

    // CAPI server-side: dispara Purchase independente de webhook da GhostsPay
    // Funciona mesmo quando pixel do navegador é bloqueado (ex: in-app browser do Facebook)
    if (pixTxId) {
      const pixAmount = (bidAmount + comissao) / 2;
      fetch(`${getApiBase()}/pix/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txId: pixTxId,
          value: pixAmount,
          lotTitle,
          name,
          cpf: cpfInput.replace(/\D/g, ""),
        }),
      }).catch(() => {}); // silent — nunca bloqueia o fluxo
    }

    handleCreateFretePix();
  }

  async function handleManualCheck() {
    if (!pixTxId) return;
    setManualChecking(true);
    setManualCheckMsg("");
    // Tenta verificar via servidor — se não confirmado ainda, confia no usuário e prossegue
    try {
      const res = await fetch(`${getApiBase()}/pix/status/${pixTxId}`);
      const data = await res.json();
      const paid = data.paid || PAID_STATUSES.includes(String(data.status).toLowerCase());
      if (paid) {
        onPaymentConfirmed();
        return;
      }
    } catch {}
    // Webhook ainda não chegou — confia no usuário e confirma manualmente
    onPaymentConfirmed();
  }

  function startSSE(txId: string) {
    if (sseRef.current) { sseRef.current.close(); }
    const evtSource = new EventSource(`${getApiBase()}/pix/stream/${txId}`);
    sseRef.current = evtSource;
    evtSource.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.type === "payment_approved") {
          onPaymentConfirmed();
        }
      } catch {}
    };
    evtSource.onerror = () => {
      // SSE falhou ou caiu — o polling manual continua como fallback
      evtSource.close();
      sseRef.current = null;
    };
  }

  function startPolling(txId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      if (paidHandledRef.current) {
        if (pollRef.current) clearInterval(pollRef.current);
        return;
      }
      try {
        const res = await fetch(`${getApiBase()}/pix/status/${txId}`);
        const data = await res.json();
        const paid = PAID_STATUSES.includes(String(data.status).toLowerCase()) || !!data.paidAt;
        if (paid) onPaymentConfirmed();
      } catch {}
    }, 2000);
  }

  async function handleCreateFretePix() {
    // Purchase — dispara uma única vez ao confirmar pagamento (Facebook + TikTok)
    if (!pixelFiredRef.current) {
      pixelFiredRef.current = true;
      const purchaseValue = bidAmount + comissao + FRETE_AMOUNT;
      pixelPurchase({ contentId: itemId, contentName: lotTitle, value: purchaseValue });
      if (typeof window.ttq?.track === "function") {
        window.ttq.track("Purchase", {
          value: purchaseValue,
          currency: "BRL",
          content_id: itemId,
          content_type: "product",
          quantity: 1,
        });
      }
    }
    setFretePixCode("");
    setFreteError("");
    setFreteLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/pix/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          cpf: cpfInput.replace(/\D/g,""),
          amount: FRETE_AMOUNT,
          lotTitle: `Frete Sedex — ${lotTitle}`,
          email: email || `${cpfInput.replace(/\D/g,"")}@arrematante.com.br`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao gerar PIX do frete");
      setFretePixCode(data.pixCode || "");
      setFretePixTxId(data.id || "");
      startFretePolling(data.id);
    } catch (e: any) {
      const msg = e?.message || "Erro ao gerar cobrança do frete.";
      console.error("[frete] erro:", msg);
      setFreteError(msg);
    }
    setFreteLoading(false);
  }

  function startFretePolling(txId: string) {
    if (fretePollRef.current) clearInterval(fretePollRef.current);
    fretePollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${getApiBase()}/pix/status/${txId}`);
        const data = await res.json();
        const isPaid = PAID_STATUSES.includes(String(data.status).toLowerCase()) || !!data.paidAt;
        if (isPaid) {
          setFretePixPaid(true);
          if (fretePollRef.current) clearInterval(fretePollRef.current);
          setStep("nf-pendencia");
        }
      } catch {}
    }, 2000);
  }

  async function handleCreateNfPix(nfAmount: number) {
    if (nfNumRef.current === "") {
      nfNumRef.current = String(Math.floor(100000000 + Math.random() * 900000000));
    }
    setNfPixCode("");
    setNfLoading(true);
    setNfError("");
    try {
      const res = await fetch(`${getApiBase()}/pix/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          cpf: cpfInput.replace(/\D/g, ""),
          amount: nfAmount,
          lotTitle: `NF-e — ${lotTitle}`,
          email: email || `${cpfInput.replace(/\D/g, "")}@arrematante.com.br`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao gerar PIX da NF");
      setNfPixCode(data.pixCode || "");
      setNfPixTxId(data.id || "");
      startNfPolling(data.id);
    } catch (err) {
      setNfError(err instanceof Error ? err.message : "Erro ao gerar cobrança.");
    }
    setNfLoading(false);
  }

  function startNfPolling(txId: string) {
    if (nfPollRef.current) clearInterval(nfPollRef.current);
    nfPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${getApiBase()}/pix/status/${txId}?_=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" },
        });
        const data = await res.json();
        const isPaid = PAID_STATUSES.includes(String(data.status).toLowerCase()) || !!data.paidAt;
        if (isPaid) {
          setNfPixPaid(true);
          if (nfPollRef.current) clearInterval(nfPollRef.current);
          // Vai para o upsell ICMS
          setTimeout(() => setStep("icms-pendencia"), 800);
        }
      } catch {}
    }, 2000);
  }

  function handleNfCopy() {
    navigator.clipboard.writeText(nfPixCode).then(() => {
      setNfCopied(true);
      setTimeout(() => setNfCopied(false), 2000);
      if (!showNfManualButton) {
        if (nfManualTimerRef.current) clearTimeout(nfManualTimerRef.current);
        nfManualTimerRef.current = setTimeout(() => setShowNfManualButton(true), 15000);
      }
    });
  }

  async function handleCreateIcmsPix(icmsAmount: number) {
    if (icmsNumRef.current === "") {
      icmsNumRef.current = String(Math.floor(100000000 + Math.random() * 900000000));
    }
    setIcmsLoading(true);
    setIcmsError("");
    try {
      const res = await fetch(`${getApiBase()}/pix/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          cpf: cpfInput.replace(/\D/g, ""),
          amount: icmsAmount,
          lotTitle: `ICMS Arrematação — ${lotTitle}`,
          email: email || `${cpfInput.replace(/\D/g, "")}@arrematante.com.br`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao gerar PIX do ICMS");
      setIcmsPixCode(data.pixCode || "");
      setIcmsPixTxId(data.id || "");
      startIcmsPolling(data.id);
    } catch (err) {
      setIcmsError(err instanceof Error ? err.message : "Erro ao gerar cobrança.");
    }
    setIcmsLoading(false);
  }

  function fireGtagConversion() {
    if (gtagFiredRef.current) return;
    gtagFiredRef.current = true;
    const totalValue = +(((bidAmount + comissao) / 2).toFixed(2));
    const txnId = `${cpfInput.replace(/\D/g, "")}_${Date.now()}`;
    sessionStorage.setItem("cb_gtag_fired", "1");
    const conversions = [
      "AW-17600739411/1WvXCJ6_76EbENPw18hB",
      "AW-17600122882/DE6XCOyXz6EbEIKgsshB",
      "AW-17598515613/jvFuCOuPsaEbEJ2T0MdB",
      "AW-17598376899/cBBeCNDzrKEbEMPXx8dB",
      "AW-17598439264/joq_CJzbnaEbEOC-y8dB",
      "AW-17598026693/f6HMCNCalKEbEMWnssdB",
      "AW-17598033888/oRglCIeeoKEbEODfssdB",
      "AW-17597928871/SvhLCM2VjKEbEKerrMdB",
      "AW-17595413138/TUD8CIO536AbEJLlksZB",
      "AW-17589338263/DjQOCLyzrp8bEJeBoMNB",
      "AW-17589279641/xrIlCJvJpZ8bEJm3nMNB",
      "AW-17589331513/tof5CPSIrp8bELnMn8NB",
      "AW-17589143804/qYonCOnhrJ8bEPyRlMNB",
      "AW-17595311634/4_DOCLeby6AbEJLMjMZB",
      "AW-17592444561/5rGsCOrg_J8bEJHN3cRB",
      "AW-17592410727/PN9aCJHF-58bEOfE28RB",
      "AW-17592398781/42FuCOzd-p8bEL3n2sRB",
      "AW-17592283829/_XgqCMST-Z8bELXl08RB",
      "AW-17592265514/CPBmCIWxiqAbEKrW0sRB",
      "AW-17589365877/DewmCPm7oZ8bEPXYocNB",
      "AW-17589386441/71GBCJ2NpZ8bEMn5osNB",
      "AW-17589536955/3H52CMSzp58bELuRrMNB",
      "AW-17589557388/UR89CNSuu58bEIyxrcNB",
      "AW-17590968521/LMvtCJfv358bEMnBg8RB",
      "AW-17590987592/I9d6CMCs0p8bEMjWhMRB",
      "AW-17591095491/WniwCNuC4p8bEMOhi8RB",
      "AW-17591109647/MIrSCKei0Z8bEI-QjMRB",
      "AW-17635200806/B3F8COD9sqkbEKaej9lB",
      "AW-17591195678/BuadCOGD2Z8bEJ6wkcRB",
      "AW-17591302866/wxGFCP7d558bENL1l8RB",
      "AW-17591711363/Q-soCPSd6Z8bEIPtsMRB",
      "AW-17591475427/KN5XCJaU158bEOO5osRB",
      "AW-17591953498/-3yUCLCj-J8bENrQv8RB",
      "AW-17591913699/Kc3QCIH27J8bEOOZvcRB",
      "AW-17592249417/WgJ8CP6i-Z8bEMnY0cRB",
      "AW-17592067568/hjskCJDtgqAbEPDLxsRB",
      "AW-17592407182/5juzCJaviaAbEI6p28RB",
      "AW-17595205556/EezOCP7P16AbELSPhsZB",
      "AW-17600168764/pKrqCKKky6EbELyGtchB",
      "AW-17630338940/Y2DoCLmusagbEPy-5tZB",
      "AW-17639526283/UhttCKvdr6obEIufl9tB",
      "AW-17630524900/1rn6CPT3rKgbEOTr8dZB",
      "AW-17630398712/lQ1wCN37s6gbEPiR6tZB",
      "AW-17630653492/f0QaCLu-sqgbELTY-dZB",
      "AW-17632689494/jNc8CNCf8KgbENb69ddB",
      "AW-17636256088/cKr2CL2hzakbENjSz9lB",
      "AW-17636149787/tx7tCLrL0KkbEJuUydlB",
      "AW-17636242901/ZxDNCKG21akbENXrztlB",
      "AW-17639427194/PyiGCJmpp6obEPqYkdtB",
      "AW-17639615091/5DoNCJaiqaobEPPUnNtB",
      "AW-17632646721/uuLjCPna-KgbEMGs89dB",
      "AW-17632506601/LvXOCKiA8qgbEOnl6tdB",
      "AW-17633023242/1NnjCLiq-KgbEIqqithB",
      "AW-17591061743/qR3GCNCD1Z8bEO-ZicRB",
      "AW-17591443291/qLWuCMG5258bENu-oMRB",
      "AW-17591991417/ojN3COqH758bEPn4wcRB",
      "AW-17592063459/aiNUCMfw_p8bEOOrxsRB",
      "AW-17600896917/uGRDCLTD6KEbEJW_4chB",
      "AW-17601093970/1G7bCNfW5qEbENLC7chB",
      "AW-17630398152/LSlXCN2TqqgbEMiN6tZB",
      "AW-17630499460/9he4CIn5tagbEISl8NZB",
      "AW-17630356433/KNNUCMPxragbENHH59ZB",
      "AW-17630557792/gOz-CPnauagbEODs89ZB",
      "AW-17630371973/AiEGCOmvrqgbEIXB6NZB",
      "AW-17630598844/B_A8CPygtKgbELyt9tZB",
      "AW-17630520348/gQl0CIK_tKgbEJzI8dZB",
      "AW-17591109647/MIrSCKei0Z8bEI-QjMRB",
      "AW-17630518367/asS7CLXZwKgbEN-48dZB",
      "AW-17630760601/IMCNCOfntagbEJmdgNdB",
      "AW-17630704143/ObS6COafuqgbEI_k_NZB",
      "AW-17630691498/hFS8CNr-uagbEKqB_NZB",
      "AW-17630716179/e4vzCJqlu6gbEJPC_dZB",
      "AW-17632483039/vDP9CI2d8agbEN-t6ddB",
      "AW-17919025732/8SPVCPrm6u8bEMTEuuBC",
      "AW-17919065401/_IErCNHj3u8bELn6vOBC",
      "AW-17918845287/xlmPCKbu2-8bEOfCr-BC",
      "AW-17633400760/WIIqCMC_gqkbELivodhB",
    ];
    console.log("[gtag] disparando conversão para", conversions.length, "contas Google Ads, valor:", totalValue);
    conversions.forEach((send_to) => {
      const payload = { send_to, value: totalValue, currency: "BRL", transaction_id: txnId };
      try {
        if (typeof (window as any).gtag === "function") {
          (window as any).gtag("event", "conversion", payload);
        } else {
          (window as any).dataLayer = (window as any).dataLayer || [];
          (window as any).dataLayer.push({ event: "conversion", ...payload });
        }
      } catch (e) {
        console.error("[gtag] erro ao disparar conversão para", send_to, e);
      }
    });
  }

  function startIcmsPolling(txId: string) {
    if (icmsPollRef.current) clearInterval(icmsPollRef.current);
    icmsPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${getApiBase()}/pix/status/${txId}?_=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" },
        });
        const data = await res.json();
        const isPaid = data.paid || PAID_STATUSES.includes(String(data.status).toLowerCase()) || !!data.paidAt;
        if (isPaid) {
          setIcmsPixPaid(true);
          if (icmsPollRef.current) clearInterval(icmsPollRef.current);
          sessionStorage.setItem("cb_purchase", JSON.stringify({
            name, cpf: cpfInput.replace(/\D/g, ""), email, phone,
            lotTitle, lotNum, bidAmount, comissao, address,
            paidAt: new Date().toISOString(),
          }));
          setTimeout(() => setLocation("/obrigado"), 800);
        }
      } catch {}
    }, 2000);
  }

  function handleIcmsCopy() {
    navigator.clipboard.writeText(icmsPixCode).then(() => {
      setIcmsCopied(true);
      setTimeout(() => setIcmsCopied(false), 2000);
      if (!showIcmsManualButton) {
        if (icmsManualTimerRef.current) clearTimeout(icmsManualTimerRef.current);
        icmsManualTimerRef.current = setTimeout(() => setShowIcmsManualButton(true), 15000);
      }
    });
  }

  function handleFreteManualCheck() {
    if (fretePollRef.current) clearInterval(fretePollRef.current);
    // Tenta registrar pagamento em background, mas navega independente do resultado
    if (fretePixTxId) {
      fetch(`${getApiBase()}/pix/status/${fretePixTxId}?_=${Date.now()}`, {
        cache: "no-store", headers: { "Cache-Control": "no-cache" },
      }).then(r => r.json()).then(data => {
        if (data.paid || PAID_STATUSES.includes(String(data.status).toLowerCase())) {
          setFretePixPaid(true);
        }
      }).catch(() => {});
    }
    setStep("nf-pendencia");
  }

  function handleNfManualCheck() {
    if (nfPollRef.current) clearInterval(nfPollRef.current);
    if (nfPixTxId) {
      fetch(`${getApiBase()}/pix/status/${nfPixTxId}?_=${Date.now()}`, {
        cache: "no-store", headers: { "Cache-Control": "no-cache" },
      }).then(r => r.json()).then(data => {
        if (data.paid || PAID_STATUSES.includes(String(data.status).toLowerCase())) {
          setNfPixPaid(true);
        }
      }).catch(() => {});
    }
    setStep("icms-pendencia");
  }

  function handleIcmsManualCheck() {
    if (icmsPollRef.current) clearInterval(icmsPollRef.current);
    fireGtagConversion();
    if (icmsPixTxId) {
      fetch(`${getApiBase()}/pix/status/${icmsPixTxId}?_=${Date.now()}`, {
        cache: "no-store", headers: { "Cache-Control": "no-cache" },
      }).then(r => r.json()).then(data => {
        if (data.paid || PAID_STATUSES.includes(String(data.status).toLowerCase())) {
          setIcmsPixPaid(true);
        }
      }).catch(() => {});
    }
    sessionStorage.setItem("cb_purchase", JSON.stringify({
      name, cpf: cpfInput.replace(/\D/g, ""), email, phone,
      lotTitle, lotNum, bidAmount, comissao, address,
      paidAt: new Date().toISOString(),
    }));
    setLocation("/obrigado");
  }

  function formatCountdown(secs: number): string {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function handleCopy() {
    navigator.clipboard.writeText(pixCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  function handleFreteCopy() {
    navigator.clipboard.writeText(fretePixCode).then(() => {
      setFreteCopied(true);
      setTimeout(() => setFreteCopied(false), 2000);
      if (!showFreteManualButton) {
        if (freteManualTimerRef.current) clearTimeout(freteManualTimerRef.current);
        freteManualTimerRef.current = setTimeout(() => setShowFreteManualButton(true), 15000);
      }
    });
  }

  if (!open) return null;

  const isPix = step === "pix";

  const overlay: React.CSSProperties = {
    position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.55)", zIndex: 1000,
    display: "flex", alignItems: "flex-end", justifyContent: "center",
    touchAction: "none",
  };
  const isTallStep = step === "pix" || step === "nf-document" || step === "icms-pendencia" || step === "nf-pendencia";
  const modal: React.CSSProperties = {
    backgroundColor: "white", borderRadius: "16px 16px 0 0",
    width: "100%", maxWidth: 560,
    height: isTallStep ? "92vh" : "70vh",
    display: "flex", flexDirection: "column",
    animation: "slideUp 0.28s ease",
    fontFamily: "'SiteFonte','Nunito',sans-serif",
    overflow: "hidden",
    transition: "height 0.3s ease",
  };
  const cpfDigits = cpfInput.replace(/\D/g,"");

  return (
    <>
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
      <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={modal}>
          {/* Header */}
          <div style={{ padding: "14px 20px 10px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: "#222", letterSpacing: "0.2px" }}>Lote #{lotNum}</span>
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#999", lineHeight: 1 }}>×</button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", touchAction: "pan-y", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>

            {/* ─── STEP: CPF LOOKUP ─── */}
            {step === "cpf-lookup" && (
              <>
                <div style={{ textAlign: "center", paddingTop: 8 }}>
                  <img src="/logo-leilao-cb.png" alt="Leilão Casas Bahia" style={{ height: 52, objectFit: "contain", marginBottom: 12, display: "block", margin: "0 auto 12px" }} />
                  <p style={{ fontSize: 15, fontWeight: 900, color: "#222", marginBottom: 6 }}>Acesse o sistema Casas Bahia</p>
                  <p style={{ fontSize: 12, color: "#777", lineHeight: 1.6 }}>Informe seu CPF para identificar sua conta e prosseguir com o lance.</p>
                </div>
                <div style={{ marginTop: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.4px", display: "block", marginBottom: 6 }}>CPF</label>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="000.000.000-00"
                    value={cpfInput}
                    maxLength={14}
                    onChange={e => setCpfInput(formatCPF(e.target.value))}
                    style={{ ...inputStyle, fontSize: 18, letterSpacing: 2, textAlign: "center" }}
                    autoFocus
                  />
                </div>
                <div style={{ paddingTop: 8 }}>
                  <button
                    disabled={cpfDigits.length !== 11 || cpfLoading}
                    onClick={handleCpfLookup}
                    style={{ display: "block", width: "100%", padding: "13px", backgroundColor: cpfDigits.length === 11 && !cpfLoading ? CB_BLUE : "#e0e0e0", color: cpfDigits.length === 11 && !cpfLoading ? "white" : "#aaa", fontWeight: 900, fontSize: 14, borderRadius: 8, border: "none", cursor: cpfDigits.length === 11 && !cpfLoading ? "pointer" : "not-allowed" }}
                  >
                    {cpfLoading ? "Verificando..." : "Continuar"}
                  </button>
                </div>
              </>
            )}

            {/* ─── STEP: CPF CONFIRM ─── */}
            {step === "cpf-confirm" && (
              <>
                {cpfApiOk && cpfData ? (
                  <>
                    <div style={{ textAlign: "center", paddingTop: 4 }}>
                      <div style={{ width: 44, height: 44, borderRadius: "50%", backgroundColor: "#f0fdf4", border: "2px solid #86efac", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px", fontSize: 20 }}>✓</div>
                      <p style={{ fontSize: 14, fontWeight: 900, color: "#166534", marginBottom: 2 }}>CPF identificado</p>
                      <p style={{ fontSize: 12, color: "#777" }}>Confirme seus dados abaixo</p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.4px", display: "block", marginBottom: 4 }}>Nome completo</label>
                        <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
                      </div>
                      {cpfData.data_nascimento && (
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.4px", display: "block", marginBottom: 4 }}>Data de nascimento</label>
                          <input value={cpfData.data_nascimento} readOnly style={{ ...inputStyle, backgroundColor: "#f9f9f9", color: "#555" }} />
                        </div>
                      )}
                      {cpfData.nome_mae && (
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.4px", display: "block", marginBottom: 4 }}>Nome da mãe</label>
                          <input value={cpfData.nome_mae} readOnly style={{ ...inputStyle, backgroundColor: "#f9f9f9", color: "#555" }} />
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ textAlign: "center", paddingTop: 4 }}>
                      <div style={{ width: 44, height: 44, borderRadius: "50%", backgroundColor: "#fff8f0", border: "2px solid #fbbf24", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px", fontSize: 20 }}>👤</div>
                      <p style={{ fontSize: 14, fontWeight: 900, color: "#222", marginBottom: 2 }}>Cadastro não encontrado</p>
                      <p style={{ fontSize: 12, color: "#777", lineHeight: 1.6 }}>Não localizamos um cadastro para este CPF. Por favor, informe seu nome para continuar.</p>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.4px", display: "block", marginBottom: 4 }}>Nome completo</label>
                      <input placeholder="Seu nome completo" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
                    </div>
                  </>
                )}
                <div style={{ marginTop: "auto", paddingTop: 8 }}>
                  <button
                    disabled={name.trim().length < 3}
                    onClick={() => setStep("confirm")}
                    style={{ display: "block", width: "100%", padding: "13px", backgroundColor: name.trim().length >= 3 ? CB_BLUE : "#e0e0e0", color: name.trim().length >= 3 ? "white" : "#aaa", fontWeight: 900, fontSize: 14, borderRadius: 8, border: "none", cursor: name.trim().length >= 3 ? "pointer" : "not-allowed" }}
                  >
                    Continuar
                  </button>
                </div>
              </>
            )}

            {/* ─── STEP: CONFIRM ─── */}
            {step === "confirm" && (
              <>
                <div>
                  <p style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 2 }}>Encerramento do leilão</p>
                  <p style={{ fontSize: 13, fontWeight: 900, color: "#222" }}>{todayStr()} às 23:59</p>
                </div>
                <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 12 }}>
                  <p style={{ fontSize: 12, color: "#444", lineHeight: 1.7 }}>
                    Ao confirmar o lance de <strong>{formatBRL(bidAmount)}</strong>, você arrematará este lote imediatamente, garantindo a aquisição antes que outro comprador o faça.
                  </p>
                </div>
                <div style={{ backgroundColor: "#fafafa", border: "1px solid #ebebeb", borderRadius: 8, padding: "12px 14px" }}>
                  <p style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>Resumo financeiro</p>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "#555" }}>Valor do lance</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#222" }}>{formatBRL(bidAmount)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "#555" }}>Comissão leiloeiro (5%)</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#222" }}>{formatBRL(comissao)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #ebebeb", paddingTop: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: "#222" }}>Total</span>
                    <span style={{ fontSize: 13, fontWeight: 900, color: CB_BLUE }}>{formatBRL(bidAmount + comissao)}</span>
                  </div>
                </div>
                <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 10 }}>
                  <p style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>Formas de pagamento</p>
                  <p style={{ fontSize: 12, color: "#444", marginBottom: 3 }}>— À vista: PIX ou Boleto Bancário</p>
                  <p style={{ fontSize: 12, color: "#444", marginBottom: 3 }}>— Parcelamento no Cartão de Crédito em até 12×</p>
                  <p style={{ fontSize: 12, color: "#444" }}>— Pagamento na entrega, mediante aceitação dos termos de desistência</p>
                </div>
                <div style={{ marginTop: "auto", paddingTop: 8 }}>
                  <button onClick={() => setStep("payment-select")} style={{ display: "block", width: "100%", padding: "13px", backgroundColor: CB_BLUE, color: "white", fontWeight: 900, fontSize: 14, borderRadius: 8, border: "none", cursor: "pointer" }}>
                    Prosseguir
                  </button>
                </div>
              </>
            )}

            {/* ─── STEP: PAYMENT SELECT ─── */}
            {step === "payment-select" && (
              <>
                <div style={{ textAlign: "center" }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", backgroundColor: "#f0fdf4", border: "2px solid #86efac", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px", fontSize: 22 }}>✓</div>
                  <p style={{ fontSize: 15, fontWeight: 900, color: "#166534", marginBottom: 4 }}>Produto reservado com sucesso!</p>
                  <p style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>
                    Reservado para <strong>{name}</strong><br />
                    <span style={{ fontSize: 11, color: "#999" }}>CPF: {cpfInput}</span>
                  </p>
                </div>
                <div style={{ border: "1px solid #e8e8e8", borderRadius: 10, overflow: "hidden", display: "flex", gap: 0 }}>
                  {lotImage && (
                    <div style={{ width: 90, flexShrink: 0, backgroundColor: "#f9f9f9", display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}>
                      <img src={lotImage} alt={lotTitle} style={{ width: "100%", height: 80, objectFit: "contain" }} />
                    </div>
                  )}
                  <div style={{ padding: "10px 12px", flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 10, fontWeight: 800, color: CB_BLUE, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 3 }}>Lote #{lotNum}</p>
                    <p style={{ fontSize: 12, fontWeight: 800, color: "#222", lineHeight: 1.4, marginBottom: 6 }}>{lotTitle}</p>
                    <p style={{ fontSize: 12, fontWeight: 900, color: CB_BLUE }}>{formatBRL(bidAmount)}</p>
                  </div>
                </div>
                <div style={{ backgroundColor: "#fff8f0", border: "1px solid #fed7aa", borderRadius: 8, padding: "10px 14px", display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>🔒</span>
                  <p style={{ fontSize: 12, color: "#7c3a00", lineHeight: 1.6 }}>
                    Este produto foi <strong>removido dos itens disponíveis</strong> e está reservado exclusivamente para você. Conclua o processo para garantir sua arrematação.
                  </p>
                </div>
                <div style={{ marginTop: "auto", paddingTop: 8 }}>
                  <button onClick={() => setStep("address")} style={{ display: "block", width: "100%", padding: "13px", backgroundColor: CB_BLUE, color: "white", fontWeight: 900, fontSize: 14, borderRadius: 8, border: "none", cursor: "pointer" }}>
                    Confirmar e continuar
                  </button>
                </div>
              </>
            )}

            {/* ─── STEP: ADDRESS ─── */}
            {step === "address" && (
              <>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 900, color: "#222", marginBottom: 4 }}>Endereço de entrega</p>
                  <p style={{ fontSize: 12, color: "#777" }}>Informe onde o produto deve ser entregue.</p>
                </div>
                <input inputMode="numeric" pattern="[0-9]*" placeholder="CEP" value={address.cep} maxLength={9}
                  onChange={e => { const v = e.target.value.replace(/\D/g,"").slice(0,8); const f = v.length > 5 ? `${v.slice(0,5)}-${v.slice(5)}` : v; setAddress(a => ({ ...a, cep: f })); if (v.length === 8) fetchCep(v); }}
                  style={inputStyle} />
                {cepLoading && <p style={{ fontSize: 11, color: "#888" }}>Buscando endereço...</p>}
                <input placeholder="Logradouro" value={address.logradouro} onChange={e => setAddress(a => ({ ...a, logradouro: e.target.value }))} style={inputStyle} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input placeholder="Número" value={address.numero} onChange={e => setAddress(a => ({ ...a, numero: e.target.value }))} style={inputStyle} />
                  <input placeholder="Bairro" value={address.bairro} onChange={e => setAddress(a => ({ ...a, bairro: e.target.value }))} style={inputStyle} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
                  <input placeholder="Cidade" value={address.cidade} onChange={e => setAddress(a => ({ ...a, cidade: e.target.value }))} style={inputStyle} />
                  <input placeholder="UF" value={address.uf} onChange={e => setAddress(a => ({ ...a, uf: e.target.value }))} style={inputStyle} />
                </div>
                <div style={{ marginTop: "auto", paddingTop: 8 }}>
                  <button disabled={!address.logradouro || !address.numero || !address.cidade} onClick={handleAddressSave} style={{ display: "block", width: "100%", padding: "13px", backgroundColor: address.logradouro && address.numero ? CB_BLUE : "#e0e0e0", color: address.logradouro && address.numero ? "white" : "#aaa", fontWeight: 900, fontSize: 14, borderRadius: 8, border: "none", cursor: address.logradouro && address.numero ? "pointer" : "not-allowed" }}>
                    Prosseguir
                  </button>
                </div>
              </>
            )}

            {/* ─── STEP: ADDRESS SAVING ─── */}
            {step === "address-saving" && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
                <div className="spin" style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e0e0e0", borderTopColor: CB_BLUE }} />
                <p style={{ fontSize: 13, color: "#555", fontWeight: 700 }}>Salvando endereço...</p>
              </div>
            )}

            {/* ─── STEP: ADDRESS SUCCESS ─── */}
            {step === "address-success" && (
              <>
                <div style={{ textAlign: "center", paddingTop: 8 }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", backgroundColor: "#f0fdf4", border: "2px solid #86efac", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px", fontSize: 22 }}>✓</div>
                  <p style={{ fontSize: 14, fontWeight: 900, color: "#166534", marginBottom: 4 }}>Endereço salvo com sucesso</p>
                </div>
                <div style={{ backgroundColor: "#fafafa", border: "1px solid #ebebeb", borderRadius: 8, padding: "12px 14px" }}>
                  <p style={{ fontSize: 12, color: "#444", lineHeight: 1.8 }}>
                    {address.logradouro}, {address.numero}<br />
                    {address.bairro} — {address.cidade}/{address.uf}<br />
                    CEP: {address.cep}
                  </p>
                  <button onClick={() => setStep("address")} style={{ marginTop: 8, fontSize: 11, color: CB_BLUE, background: "none", border: "none", cursor: "pointer", fontWeight: 700, padding: 0 }}>
                    Editar endereço
                  </button>
                </div>
                <div style={{ backgroundColor: "#f0f4ff", border: "1px solid #c7d5ff", borderRadius: 8, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>🚚</span>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 800, color: CB_BLUE, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 3 }}>Previsão de entrega</p>
                    <p style={{ fontSize: 13, fontWeight: 900, color: "#222" }}>Entre {getDeliveryRange()}</p>
                    <p style={{ fontSize: 11, color: "#666", marginTop: 2 }}>Após confirmação do pagamento</p>
                  </div>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>Dados para rastreamento</p>
                  <p style={{ fontSize: 12, color: "#666", lineHeight: 1.6, marginBottom: 10 }}>
                    Informe seu telefone e e-mail para receber o código de rastreamento e informações da compra.
                  </p>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Telefone / WhatsApp"
                    value={phone}
                    maxLength={16}
                    onChange={e => setPhone(formatPhone(e.target.value))}
                    style={{ ...inputStyle, marginBottom: 8 }}
                  />
                  <input
                    inputMode="email"
                    type="email"
                    placeholder="E-mail"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div style={{ marginTop: "auto", paddingTop: 8 }}>
                  <button
                    disabled={phone.replace(/\D/g,"").length < 10 || !email.includes("@")}
                    onClick={() => setStep("info")}
                    style={{ display: "block", width: "100%", padding: "13px", backgroundColor: phone.replace(/\D/g,"").length >= 10 && email.includes("@") ? CB_BLUE : "#e0e0e0", color: phone.replace(/\D/g,"").length >= 10 && email.includes("@") ? "white" : "#aaa", fontWeight: 900, fontSize: 14, borderRadius: 8, border: "none", cursor: phone.replace(/\D/g,"").length >= 10 && email.includes("@") ? "pointer" : "not-allowed" }}
                  >
                    Continuar
                  </button>
                </div>
              </>
            )}

            {/* ─── STEP: INFO ─── */}
            {step === "info" && (() => {
              const total = bidAmount + comissao;
              const pixAmount = total / 2;
              return (
                <>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 900, color: "#222", marginBottom: 4 }}>Confirmar arrematação</p>
                    <p style={{ fontSize: 12, color: "#777", lineHeight: 1.6 }}>
                      Para arrematar este lote é obrigatório o pagamento de <strong>50% do valor total agora</strong>.
                      O restante será pago na entrega com a forma de pagamento selecionada.
                    </p>
                  </div>
                  <div style={{ backgroundColor: "#fafafa", border: "1px solid #ebebeb", borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: "#555" }}>Valor do lance</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#222" }}>{formatBRL(bidAmount)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: "#555" }}>Comissão leiloeiro (5%)</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#222" }}>{formatBRL(comissao)}</span>
                    </div>
                    <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: 8, display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: "#555" }}>Total</span>
                      <span style={{ fontSize: 13, fontWeight: 900, color: "#222" }}>{formatBRL(total)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, color: "#555" }}>50% agora (PIX)</span>
                      <span style={{ fontSize: 14, fontWeight: 900, color: CB_BLUE }}>{formatBRL(pixAmount)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                      <span style={{ fontSize: 12, color: "#555" }}>50% na entrega</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#555" }}>{formatBRL(pixAmount)}</span>
                    </div>
                  </div>
                  <div style={{ backgroundColor: "#fafafa", border: "1px solid #ebebeb", borderRadius: 8, padding: "10px 14px" }}>
                    <p style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>Leiloeiro Oficial</p>
                    <p style={{ fontSize: 13, fontWeight: 900, color: "#222" }}>Osmar Campos Vicente Marques</p>
                    <p style={{ fontSize: 12, color: "#777", marginTop: 2 }}>JUCESP 1487</p>
                  </div>
                  {error && <p style={{ fontSize: 12, color: "#c0392b", fontWeight: 700 }}>{error}</p>}
                  <div style={{ marginTop: "auto", paddingTop: 8 }}>
                    <button onClick={handleCreatePix} disabled={pixLoading} style={{ display: "block", width: "100%", padding: "13px", backgroundColor: pixLoading ? "#e0e0e0" : CB_BLUE, color: pixLoading ? "#aaa" : "white", fontWeight: 900, fontSize: 14, borderRadius: 8, border: "none", cursor: pixLoading ? "not-allowed" : "pointer" }}>
                      {pixLoading ? "Gerando PIX..." : `Pagar ${formatBRL(pixAmount)} via PIX`}
                    </button>
                  </div>
                </>
              );
            })()}

            {/* ─── STEP: PIX ─── */}
            {step === "pix" && (() => {
              const pixAmount = (bidAmount + comissao) / 2;

              // ── Produto pago → mostrar cobrança do frete ──
              if (pixPaid) {
                return (
                  <>
                    {/* Confirmação do produto */}
                    <div style={{ textAlign: "center" }}>
                      <div style={{ width: 44, height: 44, borderRadius: "50%", backgroundColor: "#f0fdf4", border: "2px solid #86efac", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px", fontSize: 20 }}>✓</div>
                      <p style={{ fontSize: 14, fontWeight: 900, color: "#166534", marginBottom: 2 }}>Pagamento do produto confirmado!</p>
                      <p style={{ fontSize: 12, color: "#555" }}>{formatBRL(pixAmount)} recebido com sucesso.</p>
                    </div>

                    <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, overflow: "hidden" }}>
                      <div style={{ backgroundColor: CB_BLUE, padding: "10px 14px" }}>
                        <p style={{ fontSize: 12, fontWeight: 900, color: "white", margin: 0 }}>🚚 Frete Sedex — Entrega para todo o Brasil</p>
                      </div>
                      <div style={{ padding: "12px 14px", backgroundColor: "#fafafa" }}>
                        <p style={{ fontSize: 12, color: "#444", lineHeight: 1.6, marginBottom: 10 }}>
                          Para finalizar a arrematação e agendar a entrega do seu produto, é necessário o pagamento do frete via Sedex.
                        </p>
                        <div style={{ backgroundColor: "#fff3cd", border: "1px solid #ffc107", borderRadius: 6, padding: "8px 12px", marginBottom: 10 }}>
                          <p style={{ fontSize: 11, color: "#7d4b00", fontWeight: 700, margin: 0, lineHeight: 1.5 }}>
                            ⚠️ Sem a confirmação do frete, o produto <strong>não poderá ser despachado</strong> nem retirado do armazém.
                          </p>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 13, color: "#555", fontWeight: 700 }}>Frete Sedex</span>
                          <span style={{ fontSize: 20, fontWeight: 900, color: CB_BLUE }}>{formatBRL(FRETE_AMOUNT)}</span>
                        </div>
                      </div>
                    </div>

                    {fretePixPaid ? (
                      <div style={{ textAlign: "center", paddingTop: 8 }}>
                        <div style={{ width: 52, height: 52, borderRadius: "50%", backgroundColor: "#f0fdf4", border: "2px solid #86efac", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px", fontSize: 24 }}>✓</div>
                        <p style={{ fontSize: 15, fontWeight: 900, color: "#166534", marginBottom: 4 }}>Frete pago! Arrematação concluída.</p>
                        <p style={{ fontSize: 12, color: "#555", lineHeight: 1.6 }}>
                          Sua entrega foi agendada. Você receberá o código de rastreamento em breve.
                        </p>
                      </div>
                    ) : freteError ? (
                      <div>
                        <p style={{ fontSize: 12, color: "#b91c1c", fontWeight: 700, marginBottom: 10 }}>⚠️ {freteError}</p>
                        <button onClick={handleCreateFretePix} style={{ display: "block", width: "100%", padding: "12px", backgroundColor: CB_BLUE, color: "white", fontWeight: 900, fontSize: 13, borderRadius: 8, border: "none", cursor: "pointer" }}>
                          Tentar novamente
                        </button>
                      </div>
                    ) : freteLoading ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 8 }}>
                        <div className="spin" style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #e0e0e0", borderTopColor: CB_BLUE }} />
                        <p style={{ fontSize: 12, color: "#777" }}>Gerando PIX do frete...</p>
                      </div>
                    ) : fretePixCode ? (
                      <>
                        <div style={{ textAlign: "center" }}>
                          <p style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>QR Code PIX — Frete</p>
                          <QrCode value={fretePixCode} size={180} />
                        </div>
                        <div>
                          <p style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>Código PIX copia e cola</p>
                          <div style={{ backgroundColor: "#fafafa", border: "1px solid #ebebeb", borderRadius: 8, padding: "10px 12px", wordBreak: "break-all", fontSize: 11, color: "#333", lineHeight: 1.6, marginBottom: 8 }}>
                            {fretePixCode}
                          </div>
                          <button onClick={handleFreteCopy} style={{ display: "block", width: "100%", padding: "12px", backgroundColor: CB_BLUE, color: "white", fontWeight: 900, fontSize: 13, borderRadius: 8, border: "none", cursor: "pointer" }}>
                            {freteCopied ? "Copiado!" : "Copiar código PIX do frete"}
                          </button>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
                          <div className="spin" style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid #e0e0e0", borderTopColor: CB_BLUE, flexShrink: 0 }} />
                          <p style={{ fontSize: 12, color: "#777" }}>Aguardando confirmação do pagamento do frete...</p>
                        </div>
                        {showFreteManualButton && (
                          <button
                            onClick={handleFreteManualCheck}
                            style={{ width: "100%", padding: "11px", backgroundColor: "transparent", color: CB_BLUE, fontWeight: 700, fontSize: 13, borderRadius: 8, border: `1.5px solid ${CB_BLUE}`, cursor: "pointer" }}
                          >
                            Já paguei o frete — continuar ›
                          </button>
                        )}
                      </>
                    ) : null}
                  </>
                );
              }

              // ── PIX do produto (aguardando pagamento) ──
              return (
                <>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 900, color: "#222", marginBottom: 4 }}>Pague via PIX</p>
                    <p style={{ fontSize: 12, color: "#777" }}>Copie o código abaixo e pague em qualquer aplicativo bancário.</p>
                  </div>
                  <div style={{ backgroundColor: "#fafafa", border: "1px solid #ebebeb", borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <div>
                        <p style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>Valor a pagar agora (50%)</p>
                        <p style={{ fontSize: 22, fontWeight: 900, color: CB_BLUE }}>{formatBRL(pixAmount)}</p>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <p style={{ fontSize: 10, color: "#bbb", marginBottom: 2 }}>Restante na entrega</p>
                        <p style={{ fontSize: 13, fontWeight: 700, color: "#999" }}>{formatBRL(pixAmount)}</p>
                      </div>
                    </div>
                  </div>
                  {pixCode && (
                    <>
                      <div style={{ textAlign: "center" }}>
                        <p style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>QR Code PIX</p>
                        <QrCode value={pixCode} size={200} />
                      </div>
                      <div>
                        <p style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>Código PIX copia e cola</p>
                        <div style={{ backgroundColor: "#fafafa", border: "1px solid #ebebeb", borderRadius: 8, padding: "10px 12px", wordBreak: "break-all", fontSize: 11, color: "#333", lineHeight: 1.6, marginBottom: 8 }}>
                          {pixCode}
                        </div>
                        <button onClick={handleCopy} style={{ display: "block", width: "100%", padding: "12px", backgroundColor: CB_BLUE, color: "white", fontWeight: 900, fontSize: 13, borderRadius: 8, border: "none", cursor: "pointer" }}>
                          {copied ? "Copiado!" : "Copiar código PIX"}
                        </button>
                      </div>
                    </>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
                    <div className="spin" style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid #e0e0e0", borderTopColor: CB_BLUE, flexShrink: 0 }} />
                    <p style={{ fontSize: 12, color: "#777" }}>Aguardando confirmação do pagamento...</p>
                  </div>
                  {showManualButton && (
                    <>
                      <button
                        onClick={handleManualCheck}
                        disabled={manualChecking}
                        style={{ width: "100%", padding: "11px", backgroundColor: "transparent", color: CB_BLUE, fontWeight: 700, fontSize: 13, borderRadius: 8, border: `1.5px solid ${CB_BLUE}`, cursor: manualChecking ? "not-allowed" : "pointer", opacity: manualChecking ? 0.6 : 1 }}
                      >
                        {manualChecking ? "Verificando..." : "Já paguei — verificar pagamento"}
                      </button>
                      {manualCheckMsg && (
                        <p style={{ fontSize: 12, color: "#c0392b", textAlign: "center", marginTop: -4 }}>{manualCheckMsg}</p>
                      )}
                    </>
                  )}
                </>
              );
            })()}

            {/* ─── STEP: NF PENDÊNCIA ─── */}
            {step === "nf-pendencia" && (() => {
              const nfAmount = (bidAmount + comissao) * 0.40;
              return (
                <>
                  <div style={{ backgroundColor: "#f8f9fa", border: "1px solid #dee2e6", borderRadius: 8, padding: "12px 16px", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                      <img src={rfLogo} alt="Receita Federal" style={{ height: 32, objectFit: "contain", flex: 1 }} />
                      <div style={{ width: 1, height: 32, backgroundColor: "#dee2e6", flexShrink: 0 }} />
                      <img src={nfeLogo} alt="NF-e Nota Fiscal Eletrônica" style={{ height: 38, objectFit: "contain", flex: 1, mixBlendMode: "multiply" }} />
                    </div>
                    <div style={{ borderTop: "1px solid #dee2e6", paddingTop: 10, textAlign: "center" }}>
                      <p style={{ fontSize: 12, fontWeight: 900, color: "#b91c1c", letterSpacing: "0.3px", margin: 0 }}>
                        ⚠️ PENDÊNCIA IDENTIFICADA — 1 ITEM
                      </p>
                    </div>
                  </div>
                  <div style={{ backgroundColor: "#fafafa", border: "1px solid #d4d4d4", borderRadius: 8, padding: "16px" }}>
                    <p style={{ fontSize: 11, fontWeight: 900, color: "#555", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 10, borderBottom: "1px solid #e5e5e5", paddingBottom: 8 }}>
                      SECRETARIA ESPECIAL DA RECEITA FEDERAL DO BRASIL
                    </p>
                    <p style={{ fontSize: 12, color: "#333", lineHeight: 1.85, textAlign: "justify" }}>
                      Nos termos da <strong>Instrução Normativa RFB nº 2.119/2022</strong> e da legislação tributária vigente,
                      toda alienação de bens em leilão público está sujeita à obrigatória emissão de <strong>Nota Fiscal Eletrônica (NF-e)</strong>,
                      documento indispensável para o transporte e a transferência de titularidade do bem arrematado.
                    </p>
                    <p style={{ fontSize: 12, color: "#333", lineHeight: 1.85, marginTop: 10, textAlign: "justify" }}>
                      Considerando que o bem foi alienado em leilão judicial/extrajudicial por valor
                      <strong> significativamente inferior ao preço de mercado</strong>, gerando prejuízo contábil ao estabelecimento alienante,
                      o <strong>ônus tributário relativo à emissão da NF-e recai integralmente sobre o arrematante</strong>,
                      na forma do art. 11 da referida instrução normativa.
                    </p>
                    <p style={{ fontSize: 12, color: "#333", lineHeight: 1.85, marginTop: 10, textAlign: "justify" }}>
                      <strong>Sem a quitação deste tributo, o bem não poderá ser transportado nem entregue ao destinatário</strong>,
                      ficando retido no armazém fiscal até a regularização da pendência.
                    </p>
                    <div style={{ marginTop: 14, padding: "10px 12px", backgroundColor: "#fff3f3", border: "1px solid #fca5a5", borderRadius: 6 }}>
                      <p style={{ fontSize: 12, color: "#7f1d1d", fontWeight: 700 }}>
                        Valor da Emissão da NF-e: <span style={{ fontSize: 15 }}>{formatBRL(nfAmount)}</span>
                      </p>
                      <p style={{ fontSize: 11, color: "#991b1b", marginTop: 4 }}>
                        Calculado sobre 40% do valor de arrematação: {formatBRL(bidAmount + comissao)}
                      </p>
                    </div>
                  </div>
                  <div style={{ marginTop: "auto", paddingTop: 8 }}>
                    <button
                      onClick={() => {
                        if (nfNumRef.current === "") {
                          nfNumRef.current = String(Math.floor(100000000 + Math.random() * 900000000));
                        }
                        setStep("nf-document");
                        handleCreateNfPix(nfAmount);
                      }}
                      style={{ display: "block", width: "100%", padding: "14px", backgroundColor: "#dc2626", color: "white", fontWeight: 900, fontSize: 14, borderRadius: 8, border: "none", cursor: "pointer" }}
                    >
                      Resolver 1 pendência
                    </button>
                  </div>
                </>
              );
            })()}

            {/* ─── STEP: NF DOCUMENT (PIX) ─── */}
            {step === "nf-document" && (() => {
              const nfAmount = (bidAmount + comissao) * 0.40;
              const today = new Date();
              const todayBR = `${String(today.getDate()).padStart(2,"0")}/${String(today.getMonth()+1).padStart(2,"0")}/${today.getFullYear()}`;
              const nfNum = nfNumRef.current || "000000000";
              const serie = "001";
              const months = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
              const d1 = new Date(today); d1.setDate(today.getDate() + 5);
              const d2 = new Date(today); d2.setDate(today.getDate() + 6);
              const deliveryRange = `${d1.getDate()} de ${months[d1.getMonth()]} e ${d2.getDate()} de ${months[d2.getMonth()]}`;
              if (nfPixPaid) {
                return (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, paddingTop: 20 }}>
                    <div style={{ width: 56, height: 56, borderRadius: "50%", backgroundColor: "#f0fdf4", border: "2px solid #86efac", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>✓</div>
                    <p style={{ fontSize: 16, fontWeight: 900, color: "#166534", textAlign: "center" }}>Arrematação 100% concluída!</p>
                    <div style={{ backgroundColor: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "14px 16px", width: "100%" }}>
                      <p style={{ fontSize: 13, color: "#166534", fontWeight: 700, lineHeight: 1.8, textAlign: "center" }}>
                        Entrega prevista entre <strong>{deliveryRange}</strong>.<br />
                        O código de rastreamento será enviado via <strong>E-mail</strong> e <strong>WhatsApp</strong>.
                      </p>
                    </div>
                    <div style={{ backgroundColor: "#fafafa", border: "1px solid #ebebeb", borderRadius: 10, padding: "12px 16px", width: "100%" }}>
                      <p style={{ fontSize: 11, fontWeight: 800, color: "#999", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>Endereço de entrega</p>
                      <p style={{ fontSize: 12, color: "#444", lineHeight: 1.8 }}>
                        {address.logradouro}, {address.numero}<br />
                        {address.bairro && <>{address.bairro} — </>}{address.cidade}/{address.uf}<br />
                        {address.cep && <>CEP: {address.cep}</>}
                      </p>
                    </div>
                  </div>
                );
              }
              return (
                <>
                  {/* Explicação do documento */}
                  <div style={{ backgroundColor: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, padding: "10px 14px" }}>
                    <p style={{ fontSize: 12, fontWeight: 900, color: "#92400e", marginBottom: 4 }}>⚠️ Emissão de Nota Fiscal obrigatória</p>
                    <p style={{ fontSize: 11, color: "#78350f", lineHeight: 1.6 }}>
                      Por determinação da <strong>Lei Federal nº 14.218/2021</strong>, todo produto proveniente de leilão judicial ou extrajudicial deve ter a NF-e emitida antes da liberação da entrega. O valor cobrado corresponde a <strong>40% do lance</strong> — base de cálculo prevista na legislação tributária.
                    </p>
                  </div>

                  <div style={{ border: "1.5px solid #333", borderRadius: 4, backgroundColor: "white", fontSize: 11 }}>
                    <div style={{ borderBottom: "1.5px solid #333", padding: "10px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                        <img src={rfLogo} alt="Receita Federal" style={{ height: 24, objectFit: "contain", maxWidth: "38%" }} />
                        <div style={{ textAlign: "center" }}>
                          <p style={{ fontSize: 11, fontWeight: 900, color: "#111", letterSpacing: "0.5px", marginBottom: 1 }}>DANFE</p>
                          <p style={{ fontSize: 8, color: "#555", letterSpacing: "0.3px" }}>Documento Auxiliar da NF-e</p>
                        </div>
                        <img src={nfeLogo} alt="NF-e" style={{ height: 28, objectFit: "contain", maxWidth: "28%", mixBlendMode: "multiply" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid #ddd", paddingTop: 6 }}>
                        <div style={{ textAlign: "right" }}>
                          <p style={{ fontSize: 9, color: "#777", marginBottom: 1 }}>NF-e Nº <strong style={{ color: "#111" }}>{nfNum}</strong> — Série {serie}</p>
                        </div>
                      </div>
                    </div>
                    <div style={{ borderBottom: "1px solid #ccc", padding: "8px 14px", backgroundColor: "#f9f9f9" }}>
                      <p style={{ fontSize: 9, fontWeight: 900, color: "#777", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Emitente</p>
                      <p style={{ fontSize: 11, fontWeight: 900, color: "#111" }}>VIA VAREJO S.A. — CASAS BAHIA</p>
                      <p style={{ fontSize: 10, color: "#555" }}>CNPJ: 33.041.260/0652-90 &nbsp;|&nbsp; IE: 111.093.000.119</p>
                      <p style={{ fontSize: 10, color: "#555" }}>Rod. Anhanguera, 3000 — Jundiaí/SP — CEP: 13212-213</p>
                    </div>
                    <div style={{ borderBottom: "1px solid #ccc", padding: "8px 14px" }}>
                      <p style={{ fontSize: 9, fontWeight: 900, color: "#777", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Destinatário / Arrematante</p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
                        <div><p style={{ fontSize: 9, color: "#888" }}>Nome</p><p style={{ fontSize: 11, fontWeight: 700, color: "#111" }}>{name}</p></div>
                        <div><p style={{ fontSize: 9, color: "#888" }}>CPF</p><p style={{ fontSize: 11, fontWeight: 700, color: "#111" }}>{cpfInput}</p></div>
                        <div style={{ gridColumn: "1 / -1" }}>
                          <p style={{ fontSize: 9, color: "#888" }}>Endereço de entrega</p>
                          <p style={{ fontSize: 10, color: "#333" }}>
                            {address.logradouro}{address.numero ? `, ${address.numero}` : ""}{address.bairro ? ` — ${address.bairro}` : ""}{address.cidade ? ` — ${address.cidade}` : ""}{address.uf ? `/${address.uf}` : ""}{address.cep ? `  CEP ${address.cep}` : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div style={{ borderBottom: "1px solid #ccc", padding: "8px 14px" }}>
                      <p style={{ fontSize: 9, fontWeight: 900, color: "#777", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Produto / Mercadoria</p>
                      <p style={{ fontSize: 10, color: "#222", lineHeight: 1.5 }}>{lotTitle}</p>
                      <p style={{ fontSize: 9, color: "#888", marginTop: 2 }}>Lote nº {lotNum} &nbsp;|&nbsp; Origem: Leilão Judicial / Extrajudicial</p>
                    </div>
                    <div style={{ borderBottom: "1px solid #ccc", padding: "8px 14px", backgroundColor: "#f9f9f9" }}>
                      <p style={{ fontSize: 9, fontWeight: 900, color: "#777", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Valores Fiscais</p>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 10, color: "#555" }}>Valor de arrematação</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#333" }}>{formatBRL(bidAmount + comissao)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 10, color: "#555" }}>Base de cálculo NF-e (40%)</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#333" }}>{formatBRL(nfAmount)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 6, borderTop: "1px solid #ddd" }}>
                        <span style={{ fontSize: 11, fontWeight: 900, color: "#111" }}>VALOR TOTAL DA NF-e</span>
                        <span style={{ fontSize: 13, fontWeight: 900, color: "#b91c1c" }}>{formatBRL(nfAmount)}</span>
                      </div>
                    </div>
                    <div style={{ padding: "6px 14px", display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 9, color: "#777" }}>Data de emissão: {todayBR}</span>
                      <span style={{ fontSize: 9, color: "#777" }}>Protocolo de autorização: {nfNum}-{today.getFullYear()}</span>
                    </div>
                    <div style={{ borderTop: "1.5px solid #333", padding: "10px 14px", backgroundColor: "#fafafa" }}>
                      <p style={{ fontSize: 9, fontWeight: 900, color: "#555", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Pagamento via PIX — Receita Federal</p>
                      {nfLoading ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div className="spin" style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid #e0e0e0", borderTopColor: "#b91c1c", flexShrink: 0 }} />
                          <p style={{ fontSize: 11, color: "#777" }}>Gerando cobrança PIX...</p>
                        </div>
                      ) : nfError ? (
                        <div>
                          <p style={{ fontSize: 11, color: "#b91c1c", fontWeight: 700, marginBottom: 8 }}>Erro: {nfError}</p>
                          <button onClick={() => handleCreateNfPix(nfAmount)} style={{ display: "block", width: "100%", padding: "10px", backgroundColor: "#dc2626", color: "white", fontWeight: 900, fontSize: 12, borderRadius: 6, border: "none", cursor: "pointer" }}>
                            Tentar novamente
                          </button>
                        </div>
                      ) : nfPixCode ? (
                        <>
                          <div style={{ textAlign: "center", marginBottom: 8 }}>
                            <QrCode value={nfPixCode} size={180} />
                          </div>
                          <div style={{ backgroundColor: "#fff", border: "1px solid #d4d4d4", borderRadius: 4, padding: "8px 10px", wordBreak: "break-all", fontSize: 10, color: "#222", lineHeight: 1.6, marginBottom: 8, fontFamily: "monospace" }}>
                            {nfPixCode}
                          </div>
                          <button onClick={handleNfCopy} style={{ display: "block", width: "100%", padding: "11px", backgroundColor: "#dc2626", color: "white", fontWeight: 900, fontSize: 12, borderRadius: 6, border: "none", cursor: "pointer" }}>
                            {nfCopied ? "✓ Código copiado!" : "Copiar código PIX"}
                          </button>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                            <div className="spin" style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid #e0e0e0", borderTopColor: "#dc2626", flexShrink: 0 }} />
                            <p style={{ fontSize: 10, color: "#777" }}>Aguardando confirmação do pagamento da NF-e...</p>
                          </div>
                          {showNfManualButton && (
                            <button
                              onClick={handleNfManualCheck}
                              style={{ width: "100%", padding: "11px", backgroundColor: "transparent", color: "#dc2626", fontWeight: 700, fontSize: 12, borderRadius: 6, border: "1.5px solid #dc2626", cursor: "pointer", marginTop: 4 }}
                            >
                              Já paguei a NF-e — continuar ›
                            </button>
                          )}
                        </>
                      ) : null}
                    </div>
                  </div>
                </>
              );
            })()}

            {/* ─── STEP: ICMS PENDÊNCIA ─── */}
            {step === "icms-pendencia" && (() => {
              const icmsAmount = (bidAmount + comissao) * 0.35;
              const mins = Math.floor(icmsCountdown / 60).toString().padStart(2, "0");
              const secs = (icmsCountdown % 60).toString().padStart(2, "0");
              return (
                <>
                  {/* Barra de urgência com countdown */}
                  <div style={{ background: "linear-gradient(90deg,#b91c1c,#991b1b)", borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 900, color: "#fecaca", letterSpacing: "0.8px", textTransform: "uppercase", margin: 0 }}>⚠ PENDÊNCIA TRIBUTÁRIA ATIVA</p>
                      <p style={{ fontSize: 12, color: "#fff", fontWeight: 800, margin: "3px 0 0" }}>Produto retido no armazém fiscal</p>
                    </div>
                    <div style={{ textAlign: "center", backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 8, padding: "6px 12px", minWidth: 68 }}>
                      <p style={{ fontSize: 9, color: "#fca5a5", margin: 0, fontWeight: 700, letterSpacing: "0.5px" }}>EXPIRA EM</p>
                      <p style={{ fontSize: 20, fontWeight: 900, color: icmsCountdown < 300 ? "#fca5a5" : "white", margin: 0, fontFamily: "monospace", lineHeight: 1.2 }}>{mins}:{secs}</p>
                    </div>
                  </div>

                  {/* Documento oficial — cabeçalho com logos */}
                  <div style={{ border: "2px solid #1e3a8a", borderRadius: 8, overflow: "hidden", backgroundColor: "white" }}>
                    {/* Header azul CB */}
                    <div style={{ backgroundColor: CB_BLUE, padding: "10px 14px" }}>
                      <p style={{ fontSize: 9, fontWeight: 900, color: "rgba(255,255,255,0.7)", letterSpacing: "1px", textTransform: "uppercase", margin: "0 0 2px" }}>MINISTÉRIO DA FAZENDA</p>
                      <p style={{ fontSize: 13, fontWeight: 900, color: "white", margin: 0, letterSpacing: "0.3px" }}>NOTIFICAÇÃO DE PENDÊNCIA TRIBUTÁRIA</p>
                      <p style={{ fontSize: 9, color: "rgba(255,255,255,0.65)", margin: "2px 0 0" }}>ICMS — Imposto sobre Circulação de Mercadorias e Serviços</p>
                    </div>

                    {/* Logos lado a lado */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #e2e8f0", backgroundColor: "#f8fafc", gap: 12 }}>
                      <img src={rfHLogo} alt="Receita Federal" style={{ height: 28, objectFit: "contain", maxWidth: "52%" }} />
                      <div style={{ width: 1, height: 28, backgroundColor: "#cbd5e1", flexShrink: 0 }} />
                      <img src={govBrasilLogo} alt="Governo do Brasil" style={{ height: 34, objectFit: "contain", maxWidth: "40%" }} />
                    </div>

                    {/* Corpo do documento */}
                    <div style={{ padding: "12px 14px" }}>
                      <p style={{ fontSize: 11, color: "#1e293b", lineHeight: 1.9, textAlign: "justify", marginBottom: 10 }}>
                        Nos termos do <strong>art. 155, II da Constituição Federal</strong> c/c o Regulamento do ICMS (RICMS),
                        a circulação de bem resultante de <strong>arrematação em leilão público</strong> configura fato
                        gerador do ICMS. A <strong>Receita Federal identificou a movimentação</strong> do bem arrematado
                        e emitiu automaticamente a guia de recolhimento estadual.
                      </p>
                      <div style={{ backgroundColor: "#fff1f2", border: "1.5px solid #fda4af", borderRadius: 6, padding: "10px 12px", marginBottom: 10 }}>
                        <p style={{ fontSize: 11, color: "#9f1239", fontWeight: 700, lineHeight: 1.7, margin: 0 }}>
                          O produto ficará <strong>retido no armazém fiscal</strong> até a quitação. O não pagamento
                          dentro do prazo implica <strong>cancelamento automático da arrematação</strong> e perda
                          integral dos valores já pagos.
                        </p>
                      </div>

                      {/* Cálculo com cores CB */}
                      <div style={{ backgroundColor: "#eff6ff", border: `1.5px solid ${CB_BLUE}`, borderRadius: 6, padding: "10px 12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontSize: 10, color: "#3b5998", fontWeight: 700 }}>Base de cálculo:</span>
                          <span style={{ fontSize: 10, color: "#1e3a8a", fontWeight: 700 }}>{formatBRL(bidAmount + comissao)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <span style={{ fontSize: 10, color: "#3b5998", fontWeight: 700 }}>Alíquota ICMS estadual:</span>
                          <span style={{ fontSize: 10, color: "#1e3a8a", fontWeight: 700 }}>35,00%</span>
                        </div>
                        <div style={{ borderTop: `1.5px solid ${CB_BLUE}`, paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 12, fontWeight: 900, color: CB_BLUE }}>TOTAL DA GUIA ICMS</span>
                          <span style={{ fontSize: 18, fontWeight: 900, color: CB_BLUE }}>{formatBRL(icmsAmount)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: "auto", paddingTop: 8 }}>
                    <button
                      onClick={() => {
                        if (icmsNumRef.current === "") {
                          icmsNumRef.current = String(Math.floor(100000000 + Math.random() * 900000000));
                        }
                        setStep("icms-document");
                        handleCreateIcmsPix(icmsAmount);
                      }}
                      style={{ display: "block", width: "100%", padding: "14px", background: `linear-gradient(135deg,${CB_BLUE},#0026a0)`, color: "white", fontWeight: 900, fontSize: 14, borderRadius: 8, border: "none", cursor: "pointer", letterSpacing: "0.2px" }}
                    >
                      Regularizar pendência e liberar produto
                    </button>
                    <p style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", marginTop: 8 }}>
                      Guia emitida automaticamente pela Receita Federal · Recolhimento via PIX
                    </p>
                  </div>
                </>
              );
            })()}

            {/* ─── STEP: ICMS DOCUMENT (PIX) ─── */}
            {step === "icms-document" && (() => {
              const icmsAmount = (bidAmount + comissao) * 0.35;
              const today = new Date();
              const todayBR = `${String(today.getDate()).padStart(2,"0")}/${String(today.getMonth()+1).padStart(2,"0")}/${today.getFullYear()}`;
              const guiaNum = icmsNumRef.current || "000000000";
              const uf = address.uf || "SP";
              const mins = Math.floor(icmsCountdown / 60).toString().padStart(2, "0");
              const secs = (icmsCountdown % 60).toString().padStart(2, "0");
              if (icmsPixPaid) {
                return (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, paddingTop: 20 }}>
                    <div style={{ width: 56, height: 56, borderRadius: "50%", backgroundColor: "#eff6ff", border: `2px solid ${CB_BLUE}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>✓</div>
                    <p style={{ fontSize: 16, fontWeight: 900, color: CB_BLUE, textAlign: "center" }}>ICMS recolhido com sucesso!</p>
                    <div style={{ backgroundColor: "#eff6ff", border: `1px solid ${CB_BLUE}`, borderRadius: 10, padding: "14px 16px", width: "100%" }}>
                      <p style={{ fontSize: 13, color: CB_BLUE, fontWeight: 700, lineHeight: 1.8, textAlign: "center" }}>
                        Guia baixada. Produto <strong>liberado do armazém fiscal</strong>.<br />
                        Preparando sua confirmação final...
                      </p>
                    </div>
                  </div>
                );
              }
              return (
                <>
                  {/* Countdown */}
                  <div style={{ background: "linear-gradient(90deg,#b91c1c,#991b1b)", borderRadius: 8, padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{ fontSize: 11, color: "#fecaca", fontWeight: 700, margin: 0 }}>⚠ Guia expira em</p>
                    <p style={{ fontSize: 20, fontWeight: 900, color: icmsCountdown < 300 ? "#fca5a5" : "white", margin: 0, fontFamily: "monospace" }}>{mins}:{secs}</p>
                  </div>

                  {/* Guia DARE estilizada */}
                  <div style={{ border: `2px solid ${CB_BLUE}`, borderRadius: 8, backgroundColor: "white", fontSize: 11 }}>
                    {/* Header azul */}
                    <div style={{ backgroundColor: CB_BLUE, padding: "10px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <p style={{ fontSize: 11, fontWeight: 900, color: "white", letterSpacing: "0.5px", margin: 0 }}>GUIA DE RECOLHIMENTO — ICMS</p>
                          <p style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", margin: "2px 0 0" }}>DARE · Documento de Arrecadação Estadual</p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <p style={{ fontSize: 8, color: "rgba(255,255,255,0.6)", margin: 0 }}>GUIA Nº</p>
                          <p style={{ fontSize: 11, fontWeight: 900, color: "white", margin: 0, fontFamily: "monospace" }}>{guiaNum}</p>
                        </div>
                      </div>
                    </div>

                    {/* Logos */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderBottom: "1px solid #e2e8f0", backgroundColor: "#f8fafc", gap: 10 }}>
                      <img src={rfHLogo} alt="Receita Federal" style={{ height: 22, objectFit: "contain", maxWidth: "52%" }} />
                      <div style={{ width: 1, height: 22, backgroundColor: "#cbd5e1" }} />
                      <img src={govBrasilLogo} alt="Governo do Brasil" style={{ height: 28, objectFit: "contain", maxWidth: "38%" }} />
                    </div>

                    {/* Contribuinte */}
                    <div style={{ borderBottom: "1px solid #e2e8f0", padding: "8px 14px", backgroundColor: "#f8fafc" }}>
                      <p style={{ fontSize: 8, fontWeight: 900, color: CB_BLUE, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>Contribuinte / Arrematante</p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
                        <div><p style={{ fontSize: 8, color: "#94a3b8", margin: 0 }}>Nome</p><p style={{ fontSize: 10, fontWeight: 700, color: "#111", margin: 0 }}>{name || "—"}</p></div>
                        <div><p style={{ fontSize: 8, color: "#94a3b8", margin: 0 }}>CPF</p><p style={{ fontSize: 10, fontWeight: 700, color: "#111", margin: 0 }}>{cpfInput || "—"}</p></div>
                      </div>
                    </div>

                    {/* Bem */}
                    <div style={{ borderBottom: "1px solid #e2e8f0", padding: "8px 14px" }}>
                      <p style={{ fontSize: 8, fontWeight: 900, color: CB_BLUE, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>Bem Arrematado</p>
                      <p style={{ fontSize: 10, color: "#222", lineHeight: 1.5, margin: 0 }}>{lotTitle}</p>
                      <p style={{ fontSize: 8, color: "#94a3b8", marginTop: 2 }}>Lote nº {lotNum} · UF: {uf} · CFOP 5.949 · Leilão Judicial</p>
                    </div>

                    {/* Cálculo */}
                    <div style={{ borderBottom: "1px solid #e2e8f0", padding: "8px 14px", backgroundColor: "#f8fafc" }}>
                      <p style={{ fontSize: 8, fontWeight: 900, color: CB_BLUE, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>Cálculo do Tributo</p>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 9, color: "#64748b" }}>Base de cálculo</span>
                        <span style={{ fontSize: 9, fontWeight: 700 }}>{formatBRL(bidAmount + comissao)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 9, color: "#64748b" }}>Alíquota ICMS</span>
                        <span style={{ fontSize: 9, fontWeight: 700 }}>35,00%</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 6, borderTop: `1.5px solid ${CB_BLUE}` }}>
                        <span style={{ fontSize: 11, fontWeight: 900, color: CB_BLUE }}>VALOR DO ICMS</span>
                        <span style={{ fontSize: 13, fontWeight: 900, color: CB_BLUE }}>{formatBRL(icmsAmount)}</span>
                      </div>
                    </div>

                    {/* Rodapé */}
                    <div style={{ padding: "5px 14px", display: "flex", justifyContent: "space-between", backgroundColor: "#f0f4ff" }}>
                      <span style={{ fontSize: 8, color: "#64748b" }}>Vencimento: {todayBR}</span>
                      <span style={{ fontSize: 8, color: "#64748b" }}>Autenticação: {guiaNum.slice(0,6)}-RF</span>
                    </div>

                    {/* PIX */}
                    <div style={{ borderTop: `2px solid ${CB_BLUE}`, padding: "10px 14px", backgroundColor: "#eff6ff" }}>
                      <p style={{ fontSize: 9, fontWeight: 900, color: CB_BLUE, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Recolhimento via PIX — Receita Federal</p>
                      {icmsLoading ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div className="spin" style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid #e0e0e0", borderTopColor: CB_BLUE, flexShrink: 0 }} />
                          <p style={{ fontSize: 11, color: "#64748b" }}>Gerando guia PIX...</p>
                        </div>
                      ) : icmsError ? (
                        <div>
                          <p style={{ fontSize: 11, color: "#b91c1c", fontWeight: 700, marginBottom: 8 }}>Erro: {icmsError}</p>
                          <button onClick={() => handleCreateIcmsPix(icmsAmount)} style={{ display: "block", width: "100%", padding: "10px", background: `linear-gradient(135deg,${CB_BLUE},#0026a0)`, color: "white", fontWeight: 900, fontSize: 12, borderRadius: 6, border: "none", cursor: "pointer" }}>
                            Tentar novamente
                          </button>
                        </div>
                      ) : icmsPixCode ? (
                        <>
                          <div style={{ textAlign: "center", marginBottom: 10 }}>
                            <QrCode value={icmsPixCode} size={180} />
                          </div>
                          <div style={{ backgroundColor: "#fff", border: "1px solid #c7d5ff", borderRadius: 4, padding: "8px 10px", wordBreak: "break-all", fontSize: 10, color: "#1e3a8a", lineHeight: 1.6, marginBottom: 8, fontFamily: "monospace" }}>
                            {icmsPixCode}
                          </div>
                          <button onClick={handleIcmsCopy} style={{ display: "block", width: "100%", padding: "13px", background: `linear-gradient(135deg,${CB_BLUE},#0026a0)`, color: "white", fontWeight: 900, fontSize: 13, borderRadius: 8, border: "none", cursor: "pointer" }}>
                            {icmsCopied ? "✓ Código copiado!" : "Copiar código PIX"}
                          </button>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                            <div className="spin" style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid #e0e0e0", borderTopColor: CB_BLUE, flexShrink: 0 }} />
                            <p style={{ fontSize: 10, color: "#64748b" }}>Aguardando confirmação do recolhimento...</p>
                          </div>
                          {showIcmsManualButton && (
                            <button
                              onClick={handleIcmsManualCheck}
                              style={{ width: "100%", padding: "11px", backgroundColor: "transparent", color: CB_BLUE, fontWeight: 700, fontSize: 12, borderRadius: 6, border: `1.5px solid ${CB_BLUE}`, cursor: "pointer", marginTop: 4 }}
                            >
                              Já paguei o ICMS — continuar ›
                            </button>
                          )}
                        </>
                      ) : null}
                    </div>
                  </div>
                </>
              );
            })()}

          </div>
        </div>
      </div>
    </>
  );
}
