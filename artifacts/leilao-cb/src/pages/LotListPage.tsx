import { useState, useMemo, useEffect } from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "vturb-smartplayer": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { id?: string };
    }
  }
}

import { useLocation } from "wouter";
import Header from "@/components/Header";
import { lots, getCategory, getCategoryImage } from "@/data/lots";
import { useIsMobile } from "@/hooks/useIsMobile";

const ITEMS_PER_PAGE = 20;
const CB_YELLOW = "#FFCC00";
const CB_BLUE = "#0033C6";

const CATEGORIES = ["Todos", "Refrigeradores", "Lavanderia", "Fogões", "Freezers", "Eletrodomésticos"];
const STATUSES = ["Todos", "Disponível", "Vendido"];

export default function LotListPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [status, setStatus] = useState("Todos");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"padrao" | "lote" | "price-asc" | "price-desc">("padrao");

  useEffect(() => {
    if (document.getElementById("vturb-script-6a4585a8b01b3541c4553e7e")) return;
    const s = document.createElement("script");
    s.id = "vturb-script-6a4585a8b01b3541c4553e7e";
    s.src = "https://scripts.converteai.net/03bc6dfe-37d2-4f75-84ff-f2483ee43db1/players/6a4585a8b01b3541c4553e7e/v4/player.js";
    s.async = true;
    document.head.appendChild(s);
  }, []);

  const isMobile = useIsMobile();

  const filtered = useMemo(() => {
    let result = [...lots];
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      result = result.filter(l =>
        l.title.toUpperCase().includes(q) ||
        l.description.toUpperCase().includes(q) ||
        l.loteNum.includes(q)
      );
    }
    if (category !== "Todos") {
      result = result.filter(l => getCategory(l.title) === category);
    }
    if (status !== "Todos") {
      result = result.filter(l => l.status === status);
    }
    if (sortBy === "lote") result.sort((a, b) => parseInt(a.loteNum) - parseInt(b.loteNum));
    else if (sortBy === "price-asc") result.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
    else if (sortBy === "price-desc") result.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
    // "padrao" keeps original interleaved array order
    return result;
  }, [search, category, status, sortBy]);

  function parsePrice(p: string) {
    return parseFloat(p.replace("R$", "").replace(/\./g, "").replace(",", ".").trim()) || 0;
  }

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const handleSearch = (q: string) => { setSearch(q); setPage(1); };

  const stats = useMemo(() => {
    const vendidos = lots.filter(l => l.status === "Vendido").length;
    return { total: lots.length, vendidos, naoVendidos: lots.length - vendidos };
  }, []);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f0f0f5", fontFamily: "'Nunito', sans-serif" }}>
      <Header onSearch={handleSearch} searchValue={search} />

      {/* ── Hero banner ── */}
      <div style={{ background: `linear-gradient(135deg, ${CB_BLUE} 0%, #0047D0 100%)`, color: "white" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "16px 12px" : "22px 16px" }}>
          {/* Title row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ backgroundColor: CB_YELLOW, color: CB_BLUE, fontSize: 10, fontWeight: 900, padding: "3px 9px", borderRadius: 4 }}>LEILÃO #144</span>
            <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 700 }}>Casas Bahia — Linha Branca</span>
          </div>
          <h1 style={{ fontSize: isMobile ? 18 : 24, fontWeight: 900, lineHeight: 1.2, marginBottom: 12 }}>
            Linha Branca com Avaria de Logística
          </h1>
          {/* Full-width video */}
          <div style={{ display: "block", margin: "12px auto 16px", width: "100%" }}>
            <vturb-smartplayer id="vid-6a4585a8b01b3541c4553e7e" style={{ display: "block", margin: "0 auto", width: "100%" }} />
          </div>
          {/* Description */}
          <p style={{ fontSize: 15, opacity: 0.9, fontWeight: 500, lineHeight: 1.45 }}>
            Os produtos sofreram avarias estéticas durante o transporte ou a armazenagem no depósito (amassados, arranhões ou embalagem danificada), sendo por isso retirados da linha de venda convencional e disponibilizados a preços significativamente abaixo do mercado.
          </p>
          <p style={{ fontSize: 15, opacity: 0.9, fontWeight: 500, lineHeight: 1.45, marginTop: 8 }}>
            Todos os itens são <strong>novos e sem uso</strong>. As avarias são exclusivamente estéticas e não comprometem o desempenho dos equipamentos. <strong>As Casas Bahia não oferecem garantia</strong> sobre estes produtos. Entrega disponível para todo o Brasil.
          </p>
        </div>
      </div>

      {/* ── Filters bar ── */}
      <div style={{
        backgroundColor: "white",
        borderBottom: "1px solid #e0e0e0",
        position: "sticky",
        top: 0,
        zIndex: 40,
        boxShadow: "0 2px 6px rgba(0,0,0,0.07)",
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "8px 12px" : "10px 16px" }}>
          {/* Category pills — scrollable row on mobile */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: isMobile ? 8 : 0, marginBottom: isMobile ? 0 : 8 }} className="no-scrollbar">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => { setCategory(cat); setPage(1); }}
                style={{
                  padding: "5px 13px",
                  borderRadius: 20,
                  border: `2px solid ${category === cat ? CB_BLUE : "#ddd"}`,
                  backgroundColor: category === cat ? CB_BLUE : "white",
                  color: category === cat ? "white" : "#555",
                  fontFamily: "'Nunito', sans-serif",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  transition: "all 0.15s",
                }}
              >{cat}</button>
            ))}
          </div>

          {/* Sort + status row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#666", whiteSpace: "nowrap" }}>Status:</span>
              <select
                value={status}
                onChange={e => { setStatus(e.target.value); setPage(1); }}
                style={{ border: "2px solid #ddd", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: "'Nunito', sans-serif", fontWeight: 700, color: "#333", outline: "none", cursor: "pointer", backgroundColor: "white" }}
              >{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#666", whiteSpace: "nowrap" }}>Ordenar:</span>
              <select
                value={sortBy}
                onChange={e => { setSortBy(e.target.value as typeof sortBy); setPage(1); }}
                style={{ border: "2px solid #ddd", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: "'Nunito', sans-serif", fontWeight: 700, color: "#333", outline: "none", cursor: "pointer", backgroundColor: "white" }}
              >
                <option value="padrao">Padrão</option>
                <option value="lote">Nº Lote</option>
                <option value="price-asc">Menor Preço</option>
                <option value="price-desc">Maior Preço</option>
              </select>
            </div>
            <div style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: "#666", whiteSpace: "nowrap" }}>
              <span style={{ color: CB_BLUE }}>{filtered.length}</span> lotes
            </div>
          </div>
        </div>
      </div>

      {/* ── Product grid ── */}
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "12px 10px 40px" : "20px 16px 48px" }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
            <h3 style={{ fontSize: 20, fontWeight: 900, color: "#444", marginBottom: 8 }}>Nenhum lote encontrado</h3>
            <p style={{ fontSize: 14, color: "#888" }}>Tente outro termo ou remova os filtros</p>
            <button
              onClick={() => { setSearch(""); setCategory("Todos"); setStatus("Todos"); }}
              style={{ marginTop: 20, padding: "10px 28px", backgroundColor: CB_YELLOW, color: CB_BLUE, fontWeight: 900, fontSize: 14, border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}
            >
              Limpar Filtros
            </button>
          </div>
        ) : (
          <>
            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(210px, 1fr))",
              gap: isMobile ? 10 : 16,
            }}>
              {paginated.map(lot => (
                <ProductCard
                  key={lot.itemId}
                  lot={lot}
                  isMobile={isMobile}
                  onClick={() => setLocation(`/lote/${lot.itemId}`)}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ marginTop: 32, display: "flex", justifyContent: "center", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <PageBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Ant.</PageBtn>
                {buildPages(page, totalPages).map((pn, i) =>
                  pn === "..." ? (
                    <span key={`d${i}`} style={{ padding: "0 2px", color: "#bbb", fontWeight: 700 }}>•••</span>
                  ) : (
                    <PageBtn key={pn} onClick={() => setPage(pn as number)} active={page === pn}>{pn}</PageBtn>
                  )
                )}
                <PageBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Prox. →</PageBtn>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Footer ── */}
      <footer style={{ backgroundColor: CB_BLUE, color: "white", padding: isMobile ? "24px 12px" : "32px 16px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", gap: 16 }}>
          <div>
            <img src="/images/logo-casasbahia-oficial.png" alt="Casas Bahia" style={{ height: 26, width: "auto", filter: "brightness(0) invert(1)", marginBottom: 8 }} />
            <p style={{ fontSize: 12, opacity: 0.65, maxWidth: 380, lineHeight: 1.7 }}>
              Leilão Oficial #144 — Linha Branca Logística Reversa.<br />
              Produtos novos e sem uso com avaria estética. Entrega em todo o Brasil 🚚
            </p>
          </div>
          <div style={{ textAlign: isMobile ? "left" : "right", fontSize: 13 }}>
            <p style={{ fontWeight: 800, marginBottom: 4 }}>Leilão Oficial Casas Bahia</p>
            <p style={{ opacity: 0.75, marginBottom: 4 }}>Galpão: Jundiaí - SP</p>
            <p style={{ opacity: 0.75 }}>🚚 Entrega em todo o Brasil</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── Product Card ──
function ProductCard({ lot, isMobile, onClick }: { lot: (typeof lots)[0]; isMobile: boolean; onClick: () => void }) {
  const isVendido = lot.status === "Vendido";
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: "white",
        borderRadius: 8,
        overflow: "hidden",
        border: `1px solid ${hovered ? "#b0b0b0" : "#e8e8e8"}`,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        boxShadow: hovered ? "0 6px 20px rgba(0,0,0,0.12)" : "0 2px 6px rgba(0,0,0,0.05)",
        transform: hovered ? "translateY(-2px)" : "none",
        transition: "box-shadow 0.18s, transform 0.18s, border-color 0.18s",
        position: "relative",
      }}
    >
      {/* Lote badge */}
      <div style={{ position: "absolute", top: 6, left: 6, backgroundColor: "rgba(0,0,0,0.6)", color: "white", fontSize: 9, fontWeight: 900, padding: "2px 6px", borderRadius: 4, zIndex: 2 }}>
        #{lot.loteNum}
      </div>
      {/* Status dot */}
      <div style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: "50%", backgroundColor: isVendido ? "#ef4444" : "#22c55e", zIndex: 2, boxShadow: "0 0 0 2px white" }} />

      {/* Image */}
      <div style={{ aspectRatio: "1", backgroundColor: "#fafafa", display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? 8 : 12 }}>
        <img
          src={getCategoryImage(lot)}
          alt={lot.title}
          loading="lazy"
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
        />
      </div>

      {/* Content */}
      <div style={{ padding: isMobile ? "8px 8px 10px" : "10px 12px 14px", flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Stars */}
        {!isMobile && (
          <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 4 }}>
            {[1,2,3,4,5].map(i => (
              <svg key={i} width="11" height="11" viewBox="0 0 24 24" fill={i <= 4 ? CB_YELLOW : "#ddd"}>
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
              </svg>
            ))}
            <span style={{ fontSize: 9, color: "#aaa", marginLeft: 2, fontWeight: 700 }}>4.0</span>
          </div>
        )}

        {/* Title */}
        <p style={{
          fontSize: isMobile ? 11 : 13,
          fontWeight: 700,
          color: "#333",
          lineHeight: 1.4,
          marginBottom: isMobile ? 6 : 8,
          minHeight: isMobile ? "2.4em" : "2.8em",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as const,
          overflow: "hidden",
        }}>
          {lot.title}
        </p>

        {/* Price */}
        <div style={{ marginBottom: isMobile ? 8 : 10 }}>
          <p style={{ fontSize: isMobile ? 9 : 10, fontWeight: 700, color: "#888", letterSpacing: 0, marginBottom: 1 }}>Entrada (50% agora):</p>
          <p style={{ fontSize: isMobile ? 17 : 21, fontWeight: 900, color: "#16a34a", lineHeight: 1, letterSpacing: "-0.3px", marginBottom: 2 }}>
            {(() => {
              const n = parseFloat(lot.price.replace("R$","").replace(/\./g,"").replace(",",".")) || 0;
              const half = n * 0.5;
              return "R$\u00a0" + half.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            })()}
          </p>
          <p style={{ fontSize: isMobile ? 9 : 10, fontWeight: 600, color: "#bbb", lineHeight: 1 }}>Lance total: {lot.price}</p>
        </div>

        {/* Buyer info for sold items */}
        {isVendido && lot.buyer && !isMobile && (
          <div style={{ fontSize: 10, color: "#888", marginBottom: 6, lineHeight: 1.4 }}>
            <span style={{ fontWeight: 700 }}>Arrematante:</span> {lot.buyer}<br />
            <span style={{ fontWeight: 700 }}>CPF:</span> {lot.cpf}
          </div>
        )}

        {/* Status + CTA */}
        <div style={{ marginTop: "auto", display: "flex", gap: 5, alignItems: "stretch" }}>
          <span style={{
            fontSize: isMobile ? 9 : 11,
            fontWeight: 800,
            padding: isMobile ? "5px 6px" : "6px 8px",
            borderRadius: 6,
            backgroundColor: isVendido ? "#fef2f2" : "#16a34a",
            color: isVendido ? "#c0392b" : "#fff",
            border: isVendido ? "1px solid #fcd5d5" : "none",
            flexShrink: 0,
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
          }}>
            {isVendido ? "✓ Vendido" : "● Disponível"}
          </span>
          <button
            style={{
              flex: 1,
              padding: isMobile ? "5px 4px" : "6px 8px",
              backgroundColor: isVendido ? "#f5f5f5" : CB_YELLOW,
              color: isVendido ? "#999" : "#1a1a2e",
              fontWeight: 900,
              fontSize: isMobile ? 11 : 12,
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "'Nunito', sans-serif",
            }}
          >
            {isVendido ? "Ver lote" : "Dar lance"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PageBtn({ children, onClick, disabled = false, active = false }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth: 36,
        padding: "6px 10px",
        borderRadius: 6,
        border: `2px solid ${active ? CB_BLUE : "#ddd"}`,
        backgroundColor: active ? CB_BLUE : "white",
        color: active ? "white" : disabled ? "#ccc" : "#444",
        fontFamily: "'Nunito', sans-serif",
        fontWeight: 800,
        fontSize: 13,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >{children}</button>
  );
}

function buildPages(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}
