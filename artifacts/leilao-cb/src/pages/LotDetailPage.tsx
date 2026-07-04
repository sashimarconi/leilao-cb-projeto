import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import Header from "@/components/Header";
import BidModal from "@/components/BidModal";
import { lots, getCategory, getCategoryImage } from "@/data/lots";
import { useIsMobile } from "@/hooks/useIsMobile";
import { pixelViewContent } from "@/lib/pixel";

const CB_YELLOW = "#FFCC00";
const CB_BLUE = "#0033C6";

function parsePrice(p: string): number {
  return parseFloat(p.replace("R$", "").replace(/\./g, "").replace(",", ".").trim()) || 0;
}

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function todayStr(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`;
}

function todayDateStr(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy} 11:00`;
}

function fakeViews(itemId: string): number {
  let h = 0;
  for (let i = 0; i < itemId.length; i++) h = ((h << 5) - h + itemId.charCodeAt(i)) | 0;
  return 300 + (Math.abs(h) % 1700);
}

function anonymizeBuyer(name: string): string {
  if (!name) return "a*******0";
  const first = name[0].toLowerCase();
  return `${first}*******${name[name.length - 1].toLowerCase()}`;
}

function lanceinicial(price: number): string {
  return formatBRL(Math.round(price * 0.75 / 10) * 10);
}

const FAKE_NAMES = [
  ["Carlos","Oliveira"],["Fernanda","Santos"],["Ricardo","Silva"],["Juliana","Pereira"],
  ["Marcos","Costa"],["Ana","Rodrigues"],["Paulo","Almeida"],["Beatriz","Ferreira"],
  ["Leonardo","Souza"],["Camila","Lima"],["Rafael","Carvalho"],["Larissa","Gomes"],
  ["Thiago","Martins"],["Amanda","Rocha"],["Gabriel","Nascimento"],["Patricia","Araujo"],
  ["Diego","Barbosa"],["Renata","Cardoso"],["Andre","Melo"],["Vanessa","Ribeiro"],
  ["Bruno","Dias"],["Monica","Campos"],["Felipe","Pinto"],["Cristiane","Castro"],
  ["Rodrigo","Monteiro"],["Isabela","Freitas"],["Eduardo","Teixeira"],["Leticia","Rezende"],
  ["Gustavo","Borges"],["Aline","Cunha"],["Lucas","Azevedo"],["Priscila","Machado"],
];

const STATES = ["SP","RJ","MG","BA","PR","RS","PE","CE","GO","SC","PA","DF","ES","AM","MT","MS","PB","RN","AL","MA","PI","SE","RO","RR","AP","TO","AC"];

function sr(seed: number, min: number, max: number): number {
  let h = seed * 2654435761;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.abs(h ^ (h >>> 16));
  return min + (h % (max - min + 1));
}

function getFakeBidHistory(itemId: string, currentPrice: number) {
  const base = parseInt(itemId, 10) * 7919;
  const results = [];
  let price = currentPrice;
  for (let i = 0; i < 5; i++) {
    const ns = base + i * 137;
    const [first, last] = FAKE_NAMES[sr(ns, 0, FAKE_NAMES.length - 1)];
    const cLast = last[0] + "*".repeat(Math.max(last.length - 2, 1)) + last[last.length - 1];
    const c1 = sr(ns + 3, 100, 999);
    const c2 = sr(ns + 5, 10, 99);
    const state = STATES[sr(ns + 7, 0, STATES.length - 1)];
    results.push({ name: `${first} ${cLast}`, cpf: `${c1}.***.***-${c2}`, state, amount: price });
    const dec = sr(ns + 11, 4, 18);
    price = Math.max(Math.round((price - dec) * 100) / 100, currentPrice * 0.75);
  }
  return results;
}

function formatInputBRL(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const num = parseInt(digits, 10) / 100;
  return "R$" + num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseBRLInput(v: string): number {
  return parseFloat(v.replace("R$", "").replace(/\./g, "").replace(",", ".")) || 0;
}

export default function LotDetailPage() {
  const params = useParams<{ itemId: string }>();
  const [, setLocation] = useLocation();
  const [activeThumb, setActiveThumb] = useState(0);
  const [bidModalOpen, setBidModalOpen] = useState(false);
  const [bidInput, setBidInput] = useState("");
  const isMobile = useIsMobile();

  const lot = lots.find(l => l.itemId === params.itemId);

  if (!lot) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#f0f0f5", fontFamily: "'SiteFonte','Nunito',sans-serif" }}>
        <Header />
        <div style={{ maxWidth: 480, margin: "80px auto", textAlign: "center", padding: "0 16px" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🔍</div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: "#333" }}>Lote não encontrado</h2>
          <p style={{ fontSize: 14, color: "#888", marginTop: 8 }}>O item #{params.itemId} não existe neste leilão.</p>
          <button onClick={() => setLocation("/")} style={{ marginTop: 24, padding: "12px 28px", backgroundColor: CB_YELLOW, color: CB_BLUE, fontWeight: 900, fontSize: 14, border: "none", borderRadius: 8, cursor: "pointer" }}>
            ← Voltar
          </button>
        </div>
      </div>
    );
  }

  const category = getCategory(lot.title);
  const image = getCategoryImage(lot);
  const isVendido = lot.status === "Vendido";
  const related = lots.filter(l => getCategory(l.title) === category && l.itemId !== lot.itemId).slice(0, isMobile ? 4 : 5);
  const descLines = lot.description.split("\n").filter(Boolean);
  const thumbs = [image];
  const priceNum = parsePrice(lot.price);
  const comissao = priceNum * 0.05;
  const views = fakeViews(lot.itemId);

  const initViewers = 2 + (parseInt(lot.itemId, 10) % 5);
  const [liveViewers, setLiveViewers] = useState(initViewers);

  useEffect(() => {
    pixelViewContent({ contentId: lot.itemId, contentName: lot.title, value: priceNum + comissao });
  }, [lot.itemId]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveViewers(prev => {
        const delta = Math.random() < 0.5 ? 1 : 2;
        const dir = Math.random() < 0.5 ? 1 : -1;
        const next = prev + dir * delta;
        return Math.min(6, Math.max(2, next));
      });
    }, 3500 + Math.random() * 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f0f0f5", fontFamily: "'SiteFonte','Nunito',sans-serif" }}>
      <style>{`
        @keyframes cbPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255, 204, 0, 0.7); transform: scale(1); }
          50% { box-shadow: 0 0 0 8px rgba(255, 204, 0, 0); transform: scale(1.02); }
        }
      `}</style>
      <Header />

      {/* Breadcrumb */}
      <div style={{ backgroundColor: "white", borderBottom: "1px solid #e8e8e8" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "8px 12px" : "10px 16px", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#888", overflowX: "auto" }} className="no-scrollbar">
          <button onClick={() => setLocation("/")} style={{ background: "none", border: "none", color: CB_BLUE, fontWeight: 800, cursor: "pointer", fontSize: 12, padding: 0, whiteSpace: "nowrap" }}>Início</button>
          <span style={{ color: "#ccc", flexShrink: 0 }}>›</span>
          <button onClick={() => setLocation("/")} style={{ background: "none", border: "none", color: CB_BLUE, fontWeight: 800, cursor: "pointer", fontSize: 12, padding: 0, whiteSpace: "nowrap" }}>Leilão #144</button>
          <span style={{ color: "#ccc", flexShrink: 0 }}>›</span>
          <button onClick={() => setLocation("/")} style={{ background: "none", border: "none", color: CB_BLUE, fontWeight: 800, cursor: "pointer", fontSize: 12, padding: 0, whiteSpace: "nowrap" }}>{category}</button>
          <span style={{ color: "#ccc", flexShrink: 0 }}>›</span>
          <span style={{ color: "#555", fontWeight: 700, whiteSpace: "nowrap" }}>Lote {lot.loteNum}</span>
        </div>
      </div>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "12px 12px 40px" : "20px 16px 48px" }}>

        {/* ── Main product section ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: isMobile ? 16 : 24,
          alignItems: "start",
        }}>

          {/* ── Gallery ── */}
          <div>
            <div style={{
              backgroundColor: "white",
              border: "1px solid #e8e8e8",
              borderRadius: 10,
              padding: isMobile ? 20 : 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              aspectRatio: "1",
              position: "relative",
            }}>
              <img
                src={thumbs[activeThumb]}
                alt={lot.title}
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              />
            </div>
            {thumbs.length > 1 && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-start" }}>
                {thumbs.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveThumb(i)}
                    style={{
                      width: isMobile ? 60 : 70,
                      height: isMobile ? 60 : 70,
                      border: `2px solid ${activeThumb === i ? CB_BLUE : "#ddd"}`,
                      borderRadius: 8,
                      overflow: "hidden",
                      cursor: "pointer",
                      backgroundColor: "white",
                      padding: 4,
                      transition: "border-color 0.15s",
                      flexShrink: 0,
                    }}
                  >
                    <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  </button>
                ))}
              </div>
            )}

            {/* ── Product condition notice ── */}
            <div style={{
              marginTop: 12,
              backgroundColor: "#fffbea",
              border: "1px solid #f5c518",
              borderRadius: 8,
              padding: "14px 16px",
              textAlign: "center",
            }}>
              <span style={{ fontSize: 28, display: "block", marginBottom: 8 }}>⚠️</span>
              <p style={{ fontSize: 12, fontWeight: 900, color: "#7a5c00", marginBottom: 8, lineHeight: 1.3 }}>
                PRODUTO NOVO — AVARIA ESTÉTICA
              </p>
              <p style={{ fontSize: 12.5, color: "#5a4200", lineHeight: 1.65, marginBottom: 10, textAlign: "left" }}
                dangerouslySetInnerHTML={{ __html: lot.conditionNote ||
                  "Os produtos são <strong>novos e sem uso</strong>, com avaria exclusivamente estética (amassados, riscos ou embalagem danificada). <strong>Não é possível realizar trocas ou devoluções.</strong>"
                }}
              />
              <p style={{ fontSize: 13, color: "#7a5c00", lineHeight: 1.65, borderTop: "1px solid #f5c51855", paddingTop: 10, textAlign: "left" }}>
                Por esse motivo, os itens são leiloados <strong>com valor muito abaixo do mercado</strong>. Conforme a{" "}
                <strong>Lei Federal nº 14.218/2021 (Art. 9º, §3º)</strong>, produtos com avarias estéticas são proibidos de serem comercializados como novos em estabelecimentos varejistas e devem obrigatoriamente ser destinados a leilão público, garantindo ao consumidor total transparência sobre o estado do bem.
              </p>
            </div>
          </div>

          {/* ── Right column: title + auction info panel ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Tags */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ backgroundColor: "#eef0ff", color: CB_BLUE, fontSize: 12, fontWeight: 800, padding: "4px 12px", borderRadius: 20 }}>Lote #{lot.loteNum}</span>
              <span style={{ backgroundColor: "#f5f5f5", color: "#555", fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 20 }}>{category}</span>
            </div>

            {/* Title */}
            <h1 style={{ fontSize: isMobile ? 17 : 20, fontWeight: 900, color: "#222", lineHeight: 1.3, margin: 0 }}>
              {lot.title}
            </h1>


            {/* ── Auction Info Panel ── */}
            <div style={{ border: "1px solid #ddd", borderRadius: 8, overflow: "hidden", backgroundColor: "white" }}>

              {/* Status header */}
              <div style={{
                backgroundColor: isVendido ? "#e53935" : "#2e7d32",
                padding: "10px 16px",
                textAlign: "center",
              }}>
                <span style={{ color: "white", fontWeight: 900, fontSize: 15, letterSpacing: "1px" }}>
                  {isVendido ? "VENDIDO" : "DISPONÍVEL"}
                </span>
              </div>

              {/* Price block */}
              <div style={{ borderBottom: "1px solid #dde6ff", textAlign: "center" }}>
                <div style={{ background: "linear-gradient(135deg, #0033C6 0%, #0050e6 100%)", padding: "14px 16px 12px" }}>
                  <p style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>
                    Entrada — Pague Agora (50%)
                  </p>
                  <p style={{ fontSize: isMobile ? 32 : 36, fontWeight: 900, color: CB_YELLOW, lineHeight: 1, marginBottom: 4, letterSpacing: "-1px" }}>
                    {formatBRL(priceNum * 0.5)}
                  </p>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginBottom: 0 }}>
                    Lance total: {lot.price} · restante na entrega
                  </p>
                </div>
                <div style={{ backgroundColor: "#f0f4ff", padding: "6px 16px", borderTop: "1px solid #dde6ff" }}>
                  <p style={{ fontSize: 10, color: "#0033C6", fontWeight: 700 }}>{todayStr()}</p>
                </div>

                {/* Bid history — disponível only */}
                {!isVendido && (() => {
                  const bids = getFakeBidHistory(lot.itemId, priceNum);
                  return (
                    <div style={{ marginTop: 12, borderTop: "1px solid #f0f0f0", paddingTop: 10, textAlign: "left" }}>
                      <p style={{ fontSize: 10, fontWeight: 800, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Últimos lances</p>
                      {bids.map((bid, i) => (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "5px 0",
                          borderBottom: i < bids.length - 1 ? "1px solid #f7f7f7" : "none",
                          opacity: i === 0 ? 1 : 0.65 + (4 - i) * 0.07,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                            <span style={{
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              width: 22, height: 22, borderRadius: "50%",
                              backgroundColor: i === 0 ? CB_BLUE : "#f0f0f0",
                              color: i === 0 ? "white" : "#999",
                              fontSize: 9, fontWeight: 900, flexShrink: 0,
                            }}>{i + 1}º</span>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontSize: 11, fontWeight: 800, color: "#333", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {bid.name} · {bid.state}
                              </p>
                              <p style={{ fontSize: 10, color: "#bbb", lineHeight: 1.2 }}>{bid.cpf}</p>
                            </div>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 900, color: i === 0 ? CB_BLUE : "#555", flexShrink: 0, marginLeft: 8 }}>
                            {formatBRL(bid.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {isVendido && lot.buyer && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
                    <p style={{ fontWeight: 700 }}>{anonymizeBuyer(lot.buyer)}</p>
                    <p style={{ color: "#888" }}>Arrematante: {lot.buyer}</p>
                    <p style={{ color: "#888" }}>CPF: {lot.cpf}</p>
                  </div>
                )}
              </div>

              {/* Fees block */}
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #eee", fontSize: 13, backgroundColor: "#f8faff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: "#666" }}>Entrada (50%):</span>
                  <strong style={{ color: CB_BLUE }}>{formatBRL(priceNum * 0.5)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: "#666" }}>+ Comissão do Leiloeiro (5%):</span>
                  <strong style={{ color: "#555" }}>{formatBRL(comissao)}</strong>
                </div>
                <div style={{ background: CB_BLUE, borderRadius: 7, padding: "8px 12px", marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 800, color: "rgba(255,255,255,0.85)", fontSize: 13 }}>Pagar agora:</span>
                  <span style={{ fontWeight: 900, color: CB_YELLOW, fontSize: 16 }}>{formatBRL(priceNum * 0.5 + comissao)}</span>
                </div>
                <p style={{ fontSize: 11, color: "#aaa", marginTop: 6 }}>
                  Restante {formatBRL(priceNum * 0.5)} cobrado na entrega
                </p>
              </div>

              {/* Live viewers */}
              <div style={{ padding: "8px 16px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "center", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#22c55e", display: "inline-block", boxShadow: "0 0 0 2px #bbf7d0", flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "#444" }}>
                  <span style={{ color: "#22c55e" }}>{liveViewers}</span> {liveViewers === 1 ? "pessoa está" : "pessoas estão"} vendo este produto agora
                </span>
              </div>

              {/* CTA */}
              <div style={{ padding: "14px 16px" }}>
                {isVendido ? (
                  <button disabled style={{ display: "block", width: "100%", textAlign: "center", padding: "13px", backgroundColor: "#f5f5f5", color: "#aaa", fontWeight: 900, fontSize: 15, borderRadius: 6, border: "1px solid #ddd", cursor: "not-allowed" }}>
                    🔒 Lance Encerrado
                  </button>
                ) : (() => {
                  const bidVal = parseBRLInput(bidInput);
                  const validBid = bidVal > priceNum;
                  const quickBids = [
                    Math.round((priceNum + 20) * 100) / 100,
                    Math.round((priceNum + 40) * 100) / 100,
                    Math.round((priceNum + 70) * 100) / 100,
                  ];
                  return (
                    <>
                      {/* Current bid */}
                      <div style={{ borderTop: "1px solid #e8e8e8", padding: "8px 0 10px" }}>
                        <p style={{ fontSize: 10, color: CB_BLUE, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 3 }}>Entrada (50% agora)</p>
                        <p style={{ fontSize: 22, fontWeight: 900, color: CB_BLUE }}>{formatBRL(priceNum * 0.5)}</p>
                        <p style={{ fontSize: 11, color: "#bbb", marginTop: 2 }}>Lance total: {lot.price} · restante na entrega</p>
                      </div>

                      {/* Custom bid input */}
                      <div style={{ marginBottom: 10 }}>
                        <p style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>Seu lance</p>
                        <input
                          inputMode="decimal"
                          value={bidInput}
                          onChange={e => setBidInput(formatInputBRL(e.target.value))}
                          placeholder={formatBRL(priceNum + 20)}
                          style={{
                            display: "block", width: "100%", padding: "11px 12px", fontSize: 16, fontWeight: 800,
                            border: `2px solid ${validBid ? CB_BLUE : "#ddd"}`, borderRadius: 8, outline: "none",
                            color: "#111", fontFamily: "'SiteFonte','Nunito',sans-serif", boxSizing: "border-box" as const,
                          }}
                        />
                        {bidInput && !validBid && (
                          <p style={{ fontSize: 11, color: "#c0392b", marginTop: 4, fontWeight: 700 }}>
                            O lance deve ser maior que {lot.price}
                          </p>
                        )}
                        {/* 50/50 breakdown for typed amount */}
                        {validBid && (
                          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                            <div style={{ flex: 1, backgroundColor: "#eef2ff", border: `1.5px solid ${CB_BLUE}`, borderRadius: 7, padding: "6px 8px", textAlign: "center" }}>
                              <p style={{ fontSize: 9, fontWeight: 800, color: CB_BLUE, textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 2 }}>50% agora</p>
                              <p style={{ fontSize: 14, fontWeight: 900, color: CB_BLUE }}>{formatBRL(bidVal * 0.5)}</p>
                            </div>
                            <div style={{ flex: 1, backgroundColor: "#f8f8f8", border: "1.5px solid #ddd", borderRadius: 7, padding: "6px 8px", textAlign: "center" }}>
                              <p style={{ fontSize: 9, fontWeight: 800, color: "#888", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 2 }}>50% na entrega</p>
                              <p style={{ fontSize: 14, fontWeight: 900, color: "#666" }}>{formatBRL(bidVal * 0.5)}</p>
                            </div>
                          </div>
                        )}
                        {/* Quick bid buttons */}
                        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                          {quickBids.map(amount => {
                            const isSelected = parseBRLInput(bidInput) === amount;
                            return (
                              <button
                                key={amount}
                                onClick={() => setBidInput(formatBRL(amount))}
                                style={{
                                  flex: 1, padding: "6px 4px", fontSize: 10, fontWeight: 800,
                                  border: `1.5px solid ${isSelected ? "#16a34a" : CB_BLUE}`, borderRadius: 7,
                                  backgroundColor: isSelected ? "#f0fdf4" : "white",
                                  color: isSelected ? "#16a34a" : CB_BLUE,
                                  cursor: "pointer", textAlign: "center",
                                }}
                              >
                                <div style={{ fontSize: 8, fontWeight: 700, color: isSelected ? "#16a34a" : "#888", marginBottom: 1 }}>50% agora</div>
                                <div style={{ fontSize: 12, fontWeight: 900 }}>{formatBRL(amount * 0.5)}</div>
                                <div style={{ fontSize: 8, fontWeight: 600, color: "#aaa", marginTop: 1 }}>entrega: {formatBRL(amount * 0.5)}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Dar Lance button */}
                      <button
                        onClick={() => { if (validBid) setBidModalOpen(true); }}
                        style={{
                          display: "block", width: "100%", textAlign: "center", padding: validBid ? "10px 13px" : "13px",
                          backgroundColor: validBid ? CB_YELLOW : "#e0e0e0",
                          color: validBid ? "#1a1a2e" : "#aaa",
                          fontWeight: 900,
                          borderRadius: 6, border: "none",
                          cursor: validBid ? "pointer" : "not-allowed",
                          marginBottom: 12,
                          animation: validBid ? "cbPulse 1.6s ease-in-out infinite" : "none",
                        }}
                      >
                        {validBid ? (
                          <>
                            <div style={{ fontSize: 15, fontWeight: 900 }}>Dar Lance</div>
                            <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, opacity: 0.8 }}>
                              50% agora: {formatBRL(bidVal * 0.5)} · 50% na entrega: {formatBRL(bidVal * 0.5)}
                            </div>
                          </>
                        ) : "Digite seu lance acima"}
                      </button>

                      {/* Instant win notice */}
                      <div style={{ borderBottom: "1px solid #e8e8e8", padding: "8px 0 12px", marginBottom: 10 }}>
                        <p style={{ fontSize: 12, color: "#444", lineHeight: 1.65 }}>
                          Por ser o último dia do leilão, qualquer lance acima do atual garante a
                          arrematação imediata deste lote. Após a confirmação, informe seu endereço para entrega.
                        </p>
                      </div>

                      {/* Closing time */}
                      <p style={{ fontSize: 12, color: "#555", fontWeight: 700, marginBottom: 10, textAlign: "center", letterSpacing: "0.2px" }}>
                        Encerramento: {todayDateStr().replace(" 11:00", "")} às 23:59
                      </p>

                      {/* Payment options */}
                      <div style={{ marginBottom: 12 }}>
                        <p style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 5 }}>Formas de pagamento</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <p style={{ fontSize: 12, color: "#444" }}>— À vista: PIX ou Boleto Bancário</p>
                          <p style={{ fontSize: 12, color: "#444" }}>— Parcelamento no Cartão em até 12×</p>
                          <p style={{ fontSize: 12, color: "#444" }}>— Pagamento na entrega</p>
                        </div>
                      </div>

                      {/* Payment on delivery note */}
                      <div style={{ marginTop: 12, backgroundColor: "#c0392b", borderRadius: 8, padding: "12px 14px" }}>
                        <p style={{ fontSize: 13, fontWeight: 900, color: "white", lineHeight: 1.65, textAlign: "center" }}>
                          Atenção: 50% do valor total deve ser quitado no ato da arrematação para garantir a reserva do lote. O saldo remanescente será cobrado no momento da entrega do produto, conforme os termos e condições do leilão.
                        </p>
                      </div>
                    </>
                  );
                })()}
                <button
                  onClick={() => setLocation("/")}
                  style={{
                    display: "block", width: "100%", textAlign: "center", padding: "11px",
                    backgroundColor: "white", color: CB_BLUE, fontWeight: 800, fontSize: 13,
                    borderRadius: 6, border: `2px solid ${CB_BLUE}`, cursor: "pointer", marginTop: 8,
                  }}
                >
                  ← Ver Todos os Lotes
                </button>
              </div>

              {/* Leiloeiro Oficial */}
              <div style={{ backgroundColor: "#fafafa", borderTop: "1px solid #eee", padding: "12px 16px", textAlign: "center" }}>
                <p style={{ fontSize: 11, fontWeight: 900, color: "#555", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Leiloeiro Oficial</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#222" }}>Osmar Campos Vicente Marques</p>
                <p style={{ fontSize: 12, color: "#888" }}>JUCESP 1487</p>
              </div>

              {/* Grupo Casas Bahia logo + auction details */}
              <div style={{ borderTop: "1px solid #eee", padding: "18px 16px", textAlign: "center" }}>
                <img
                  src="/images/grupo-casas-bahia.jpeg"
                  alt="Grupo Casas Bahia"
                  style={{ height: 220, width: "auto", objectFit: "contain", borderRadius: 10, display: "block", margin: "0 auto 14px" }}
                />
                <p style={{ fontSize: 12, color: "#555", lineHeight: 1.6 }}>
                  Leilão de Linha Branca - Logística Reversa<br />
                  Casas Bahia (186 Lotes)<br />
                  Online
                </p>
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #f0f0f0", paddingTop: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#444" }}>Data do Leilão:</span>
                    <span style={{ fontSize: 12, color: "#444" }}>{todayDateStr()}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#444" }}>Lance Inicial:</span>
                    <span style={{ fontSize: 12, color: "#444" }}>{lanceinicial(priceNum)}</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* ── Observações do Lote ── */}
        <div style={{ marginTop: 24, backgroundColor: "white", borderRadius: 10, border: "1px solid #e8e8e8", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 4, height: 20, backgroundColor: CB_BLUE, borderRadius: 2 }} />
            <h2 style={{ fontSize: 16, fontWeight: 900, color: "#222", margin: 0 }}>Observações do Lote</h2>
          </div>
          <div style={{ padding: isMobile ? "16px" : "20px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              {
                num: "1",
                text: "Os produtos são novos e sem uso, com avaria exclusivamente estética (amassados, riscos ou embalagem danificada). Não é possível realizar trocas ou devoluções."
              },
              {
                num: "2",
                text: "Os itens podem apresentar avarias estéticas como amassados, riscos, sujeira ou embalagem danificada. As avarias não comprometem o funcionamento dos equipamentos."
              },
              {
                num: "3",
                text: "Será cobrada uma taxa de 5% referente à comissão do leiloeiro sobre o valor arrematado, conforme descrito no edital."
              },
              {
                num: "4",
                text: "Aquisição do item: selecione o lote desejado, realize o pagamento da taxa de 5% de comissão do leiloeiro e informe o seu endereço de entrega. O produto será enviado diretamente para você em qualquer estado do Brasil."
              },
              {
                num: "5",
                text: "Pagamento na Entrega: o cliente pode optar pelo pagamento do produto diretamente na entrega. Nesse caso, é necessário assinar um contrato de compromisso de compra. Em caso de desistência no momento da entrega, será cobrada uma multa de R$ 240,00 para cobertura dos custos de transporte."
              },
            ].map(item => (
              <div key={item.num} style={{ display: "flex", gap: 10, padding: "10px 12px", backgroundColor: "#fafafa", borderRadius: 8, border: "1px solid #f0f0f0" }}>
                <span style={{ fontSize: 12, fontWeight: 900, color: CB_BLUE, minWidth: 20, flexShrink: 0 }}>{item.num}.</span>
                <p style={{ fontSize: 13, color: "#555", lineHeight: 1.7, margin: 0 }}>{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Description ── */}
        <div style={{ marginTop: 20, backgroundColor: "white", borderRadius: 10, border: "1px solid #e8e8e8", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 4, height: 20, backgroundColor: CB_YELLOW, borderRadius: 2 }} />
            <h2 style={{ fontSize: 16, fontWeight: 900, color: "#222", margin: 0 }}>Descrição do Lote</h2>
          </div>
          <div style={{ padding: isMobile ? "16px" : "20px 24px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {descLines.map((line, i) => (
                <p key={i} style={{ fontSize: 13, color: "#555", lineHeight: 1.8, margin: 0 }}>{line}</p>
              ))}
            </div>

            {/* Info grid */}
            <div style={{ marginTop: 20, borderTop: "1px solid #f0f0f0", paddingTop: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 900, color: "#333", marginBottom: 12 }}>Informações do Lote</h3>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "0" : "0 32px" }}>
                {[
                  ["Nº do Lote", lot.loteNum],
                  ["Item ID", lot.itemId],
                  ["Categoria", category],
                  ["Status", lot.status],
                  ["Valor do Lance", lot.price],
                  ["Entrega", "Todo o Brasil"],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #f5f5f5" }}>
                    <span style={{ fontSize: 13, color: "#999", fontWeight: 700 }}>{label}</span>
                    <span style={{ fontSize: 13, color: "#222", fontWeight: 900, textAlign: "right", maxWidth: "60%" }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Related lots ── */}
        {related.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 4, height: 20, backgroundColor: CB_YELLOW, borderRadius: 2 }} />
              <h2 style={{ fontSize: 16, fontWeight: 900, color: "#222", margin: 0 }}>Lotes Similares</h2>
              <span style={{ fontSize: 12, color: "#888", fontWeight: 700 }}>— {category}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)", gap: isMobile ? 10 : 14 }}>
              {related.map(rl => <RelatedCard key={rl.itemId} lot={rl} isMobile={isMobile} onClick={() => setLocation(`/lote/${rl.itemId}`)} />)}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ backgroundColor: CB_BLUE, color: "white", padding: isMobile ? "24px 12px" : "28px 16px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", gap: 16 }}>
          <div>
            <img src="/images/logo-casasbahia-oficial.png" alt="Casas Bahia" style={{ height: 26, width: "auto", filter: "brightness(0) invert(1)", marginBottom: 8 }} />
            <p style={{ fontSize: 12, opacity: 0.65 }}>Leilão Oficial #144 — Linha Branca</p>
          </div>
          <div style={{ textAlign: isMobile ? "left" : "right", fontSize: 13 }}>
            <p style={{ fontWeight: 800, marginBottom: 4 }}>Leilão Oficial Casas Bahia</p>
            <p style={{ opacity: 0.75, marginBottom: 4 }}>Galpão: Jundiaí - SP</p>
            <p style={{ opacity: 0.75 }}>🚚 Entrega em todo o Brasil</p>
          </div>
        </div>
      </footer>

      <BidModal
        open={bidModalOpen}
        onClose={() => setBidModalOpen(false)}
        lotTitle={lot.title}
        lotNum={lot.loteNum}
        bidAmount={parseBRLInput(bidInput) || priceNum}
        comissao={(parseBRLInput(bidInput) || priceNum) * 0.05}
        itemId={lot.itemId}
        lotImage={image}
      />
    </div>
  );
}

function RelatedCard({ lot, isMobile, onClick }: { lot: (typeof lots)[0]; isMobile: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  const isVendido = lot.status === "Vendido";

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        backgroundColor: "white",
        borderRadius: 8,
        overflow: "hidden",
        border: `1px solid ${hov ? "#b0b0b0" : "#e8e8e8"}`,
        cursor: "pointer",
        boxShadow: hov ? "0 6px 16px rgba(0,0,0,0.12)" : "0 2px 6px rgba(0,0,0,0.05)",
        transform: hov ? "translateY(-2px)" : "none",
        transition: "all 0.18s",
      }}
    >
      <div style={{ aspectRatio: "1", backgroundColor: "#fafafa", padding: isMobile ? 8 : 10 }}>
        <img
          src={getCategoryImage(lot)}
          alt={lot.title}
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </div>
      <div style={{ padding: isMobile ? "7px 8px 10px" : "8px 10px 12px" }}>
        <p style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#333",
          lineHeight: 1.4,
          minHeight: "2.8em",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as const,
          overflow: "hidden",
          marginBottom: 5,
        }}>{lot.title}</p>
        <p style={{ fontSize: isMobile ? 14 : 15, fontWeight: 900, color: CB_BLUE }}>{lot.price}</p>
        <p style={{ fontSize: 10, color: isVendido ? "#c0392b" : "#166534", fontWeight: 800, marginTop: 2 }}>
          {isVendido ? "✓ Vendido" : "● Disponível"} · #{lot.loteNum}
        </p>
      </div>
    </div>
  );
}
