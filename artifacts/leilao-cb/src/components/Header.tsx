import { useState } from "react";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/useIsMobile";

interface HeaderProps {
  onSearch?: (query: string) => void;
  searchValue?: string;
}

const CB_YELLOW = "#FFCC00";
const CB_BLUE = "#0033C6";
const CB_DARK = "#1a1a2e";

function todayFull(): string {
  const d = new Date();
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function Header({ onSearch, searchValue = "" }: HeaderProps) {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState(searchValue);
  const isMobile = useIsMobile();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch) onSearch(query);
  };

  const categories = ["Refrigeradores", "Lavanderia", "Fogões", "Freezers", "Eletrodomésticos"];

  return (
    <header style={{ fontFamily: "'Nunito', sans-serif" }}>

      {/* ── Top utility bar ── */}
      <div style={{ backgroundColor: CB_BLUE }}>
        <div style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: isMobile ? "0 12px" : "0 16px",
          height: isMobile ? 32 : 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <span style={{ color: "white", fontSize: isMobile ? 11 : 12, fontWeight: 800, letterSpacing: "0.8px", textTransform: "uppercase", textAlign: "center" }}>
            Leilão encerra hoje, {todayFull()} — Não perca!
          </span>
        </div>
      </div>

      {/* ── Main header ── */}
      <div style={{ backgroundColor: "white", boxShadow: "0 2px 6px rgba(0,0,0,0.08)" }}>
        <div style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: isMobile ? "10px 12px 8px" : "12px 16px",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "center",
          gap: isMobile ? 8 : 24,
        }}>
          {/* Logo row (mobile: logo left, lotes count right) */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button
              onClick={() => setLocation("/")}
              style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
            >
              <img
                src="/images/logo-casasbahia-oficial.png"
                alt="Casas Bahia"
                style={{ height: isMobile ? 22 : 28, width: "auto", display: "block" }}
              />
            </button>
            {isMobile && (
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 9, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>LEILÃO #144</div>
                <div style={{ fontSize: 14, fontWeight: 900, color: CB_BLUE, lineHeight: 1.2 }}>186 Lotes</div>
              </div>
            )}
          </div>

          {/* Search bar */}
          <form onSubmit={handleSearch} style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: "flex",
              border: `2px solid ${CB_BLUE}`,
              borderRadius: 8,
              overflow: "hidden",
              backgroundColor: "white",
            }}>
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={isMobile ? "Buscar modelo, categoria ou nº do lote..." : "Buscar modelo, categoria ou nº do lote..."}
                style={{
                  flex: 1,
                  padding: isMobile ? "9px 12px" : "10px 16px",
                  fontSize: isMobile ? 13 : 14,
                  fontFamily: "'Nunito', sans-serif",
                  fontWeight: 500,
                  border: "none",
                  outline: "none",
                  color: CB_DARK,
                  backgroundColor: "transparent",
                  minWidth: 0,
                }}
              />
              <button
                type="submit"
                style={{
                  backgroundColor: CB_BLUE,
                  border: "none",
                  padding: isMobile ? "0 12px" : "0 24px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: "'Nunito', sans-serif",
                  fontWeight: 800,
                  fontSize: 14,
                  color: "white",
                  flexShrink: 0,
                }}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {!isMobile && <span>Buscar</span>}
              </button>
            </div>
          </form>

          {/* Lote badge — desktop only */}
          {!isMobile && (
            <div style={{ flexShrink: 0, textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>LEILÃO #144</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: CB_BLUE, lineHeight: 1.2 }}>186 Lotes</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Category nav ── */}
      <div style={{ backgroundColor: CB_YELLOW, borderBottom: "3px solid rgba(0,0,0,0.08)" }}>
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "0 4px",
            display: "flex",
            alignItems: "stretch",
            overflowX: "auto",
            gap: 0,
          }}
          className="no-scrollbar"
        >
          {/* "Todos" pill */}
          <button
            onClick={() => { setLocation("/"); setQuery(""); if (onSearch) onSearch(""); }}
            style={{
              background: CB_BLUE,
              border: "none",
              padding: isMobile ? "8px 12px" : "9px 16px",
              fontFamily: "'Nunito', sans-serif",
              fontWeight: 800,
              fontSize: isMobile ? 12 : 13,
              color: "white",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.9 }}>
              <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
            </svg>
            {isMobile ? "Todos" : "Todos os Lotes"}
          </button>

          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => {
                setLocation("/");
                const q = cat === "Refrigeradores" ? "REFRIGERADOR"
                  : cat === "Lavanderia" ? "LAVADORA"
                  : cat === "Fogões" ? "FOGÃO"
                  : cat === "Freezers" ? "FREEZER"
                  : cat.toUpperCase();
                setQuery(q);
                if (onSearch) onSearch(q);
              }}
              style={{
                background: "none",
                border: "none",
                padding: isMobile ? "8px 11px" : "9px 14px",
                fontFamily: "'Nunito', sans-serif",
                fontWeight: 800,
                fontSize: isMobile ? 12 : 13,
                color: CB_DARK,
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
              onMouseEnter={e => (e.currentTarget.style.color = CB_BLUE)}
              onMouseLeave={e => (e.currentTarget.style.color = CB_DARK)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
