import { useEffect, useState } from "react";
import { useLocation } from "wouter";

const CB_BLUE = "#0033C6";
const CB_YELLOW = "#FFCC00";

interface PurchaseData {
  name: string;
  cpf: string;
  email: string;
  phone: string;
  lotTitle: string;
  lotNum: string;
  bidAmount: number;
  comissao: number;
  address: {
    logradouro: string;
    numero: string;
    bairro: string;
    cidade: string;
    uf: string;
    cep: string;
  };
  paidAt: string;
}

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getDelivery() {
  const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
}

function getTrackingDate() {
  const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return `${d.getDate()} de ${months[d.getMonth()]}`;
}

function getDeliveryRange() {
  const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const d1 = new Date(); d1.setDate(d1.getDate() + 5);
  const d2 = new Date(); d2.setDate(d2.getDate() + 8);
  return `${d1.getDate()} a ${d2.getDate()} de ${months[d2.getMonth()]}`;
}

function formatCPF(cpf: string) {
  const c = cpf.replace(/\D/g, "");
  return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

const TIMELINE = [
  {
    icon: "🏆",
    title: "Lote Arrematado",
    desc: "Você arrematou o lote com sucesso no leilão oficial.",
    status: "done",
    time: "Concluído",
  },
  {
    icon: "🚚",
    title: "Frete Sedex Pago",
    desc: "Pagamento do frete via Sedex confirmado e registrado.",
    status: "done",
    time: "Concluído",
  },
  {
    icon: "📄",
    title: "Nota Fiscal Emitida",
    desc: "NF-e emitida pela Receita Federal. Documento fiscal regularizado.",
    status: "done",
    time: "Concluído",
  },
  {
    icon: "📦",
    title: "Produto enviado para despacho",
    desc: "Seu produto será despachado no armazém em até 24 horas.",
    status: "active",
    time: `Previsão: ${getDelivery()}`,
  },
  {
    icon: "📧",
    title: "Código de rastreio enviado",
    desc: "O código de rastreio Sedex será enviado para o seu e-mail.",
    status: "pending",
    time: `Estimativa: ${getTrackingDate()}`,
  },
  {
    icon: "🏠",
    title: "Entrega na sua residência",
    desc: "Entrega via Sedex no endereço cadastrado.",
    status: "pending",
    time: `Entre ${getDeliveryRange()}`,
  },
];

export default function ThankYouPage() {
  const [, setLocation] = useLocation();
  const [data, setData] = useState<PurchaseData | null>(null);
  const [orderId] = useState(() =>
    String(Math.floor(100000000 + Math.random() * 900000000))
  );

  useEffect(() => {
    const raw = sessionStorage.getItem("cb_purchase");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setData(parsed);
        const totalPurchase =
          (parsed.bidAmount + parsed.comissao) / 2 +
          89.84 +
          (parsed.bidAmount + parsed.comissao) * 0.4 +
          (parsed.bidAmount + parsed.comissao) * 0.35;
        if (!sessionStorage.getItem("cb_gtag_fired") && typeof (window as any).gtag === "function") {
          const txnId = parsed.cpf + "_" + Date.now();
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
          conversions.forEach((send_to) => {
            (window as any).gtag("event", "conversion", {
              send_to,
              value: totalPurchase,
              currency: "BRL",
              transaction_id: txnId,
            });
          });
          sessionStorage.setItem("cb_gtag_fired", "1");
        }
      } catch {}
    }
  }, []);

  const totalPago = data
    ? (data.bidAmount + data.comissao) / 2 +
      89.84 +
      (data.bidAmount + data.comissao) * 0.4
    : 0;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f5f5f5", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* Header Casas Bahia — igual ao header principal do site */}
      <div style={{ backgroundColor: CB_BLUE, padding: "6px 16px", textAlign: "center" }}>
        <span style={{ color: "white", fontSize: 11, fontWeight: 800, letterSpacing: "0.8px", textTransform: "uppercase" }}>
          ✅ Compra confirmada — pedido registrado com sucesso
        </span>
      </div>
      <div style={{ backgroundColor: "white", boxShadow: "0 2px 6px rgba(0,0,0,0.08)" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "10px 16px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <img src="/images/logo-casasbahia-oficial.png" alt="Casas Bahia" style={{ height: 22, width: "auto", display: "block" }} />
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: 9, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>LEILÃO #144</p>
            <p style={{ fontSize: 13, fontWeight: 900, color: CB_BLUE, lineHeight: 1.2, margin: 0 }}>Pedido #{orderId.slice(0, 8)}</p>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 0 40px" }}>

        {/* Banner de sucesso */}
        <div style={{ backgroundColor: "#166534", padding: "24px 20px", textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.15)", border: "3px solid rgba(255,255,255,0.4)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 32 }}>
            ✓
          </div>
          <p style={{ fontSize: 20, fontWeight: 900, color: "white", margin: "0 0 6px", lineHeight: 1.2 }}>
            Arrematação Concluída!
          </p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", margin: 0, lineHeight: 1.5 }}>
            {data?.name ? `Parabéns, ${data.name.split(" ")[0]}!` : "Parabéns!"} Tudo certo com a sua compra.<br />
            Seu produto será enviado para despacho em até 24h.
          </p>
        </div>

        {/* Card resumo do pedido */}
        <div style={{ margin: "16px 16px 0", backgroundColor: "white", borderRadius: 10, border: "1px solid #e5e7eb", overflow: "hidden" }}>
          <div style={{ backgroundColor: CB_BLUE, padding: "10px 16px" }}>
            <p style={{ fontSize: 11, fontWeight: 900, color: "white", margin: 0, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              📋 Resumo da Arrematação
            </p>
          </div>
          <div style={{ padding: "14px 16px" }}>
            <p style={{ fontSize: 12, fontWeight: 900, color: "#111", marginBottom: 4, lineHeight: 1.4 }}>
              {data?.lotTitle || "Produto Casas Bahia"}
            </p>
            {data?.lotNum && (
              <p style={{ fontSize: 11, color: "#888", marginBottom: 12 }}>Lote nº {data.lotNum} — Leilão Oficial Casas Bahia</p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#555" }}>Valor da arrematação (50% entrada)</span>
                <span style={{ fontWeight: 700, color: "#333" }}>{data ? formatBRL((data.bidAmount + data.comissao) / 2) : "—"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#555" }}>Frete Sedex</span>
                <span style={{ fontWeight: 700, color: "#333" }}>{formatBRL(89.84)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#555" }}>Emissão NF-e (40%)</span>
                <span style={{ fontWeight: 700, color: "#333" }}>{data ? formatBRL((data.bidAmount + data.comissao) * 0.4) : "—"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, paddingTop: 8, borderTop: "1px solid #f0f0f0", marginTop: 4 }}>
                <span style={{ fontWeight: 900, color: "#111" }}>Total pago</span>
                <span style={{ fontWeight: 900, color: CB_BLUE, fontSize: 15 }}>{data ? formatBRL(totalPago) : "—"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div style={{ margin: "16px 16px 0", backgroundColor: "white", borderRadius: 10, border: "1px solid #e5e7eb", overflow: "hidden" }}>
          <div style={{ backgroundColor: CB_BLUE, padding: "10px 16px" }}>
            <p style={{ fontSize: 11, fontWeight: 900, color: "white", margin: 0, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              🗓️ Acompanhe o seu pedido
            </p>
          </div>
          <div style={{ padding: "16px" }}>
            {TIMELINE.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 14, marginBottom: i < TIMELINE.length - 1 ? 0 : 0 }}>
                {/* Left: icon + line */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 36, flexShrink: 0 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                    backgroundColor: item.status === "done" ? "#f0fdf4" : item.status === "active" ? "#eff6ff" : "#f9fafb",
                    border: item.status === "done" ? "2px solid #86efac" : item.status === "active" ? "2px solid #93c5fd" : "2px solid #e5e7eb",
                    flexShrink: 0,
                  }}>
                    {item.icon}
                  </div>
                  {i < TIMELINE.length - 1 && (
                    <div style={{
                      width: 2, flex: 1, minHeight: 24,
                      backgroundColor: item.status === "done" ? "#86efac" : "#e5e7eb",
                      margin: "4px 0",
                    }} />
                  )}
                </div>
                {/* Right: text */}
                <div style={{ paddingBottom: i < TIMELINE.length - 1 ? 16 : 0, flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <p style={{
                      fontSize: 13, fontWeight: 900, margin: "6px 0 2px",
                      color: item.status === "done" ? "#166534" : item.status === "active" ? CB_BLUE : "#9ca3af",
                    }}>
                      {item.title}
                      {item.status === "done" && <span style={{ marginLeft: 6, fontSize: 11 }}>✓</span>}
                    </p>
                    <span style={{
                      fontSize: 10, fontWeight: 700, marginTop: 8, whiteSpace: "nowrap", flexShrink: 0,
                      color: item.status === "done" ? "#166534" : item.status === "active" ? CB_BLUE : "#9ca3af",
                    }}>
                      {item.time}
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: "#6b7280", margin: 0, lineHeight: 1.5 }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Endereço de entrega */}
        {data?.address && (
          <div style={{ margin: "16px 16px 0", backgroundColor: "white", borderRadius: 10, border: "1px solid #e5e7eb", overflow: "hidden" }}>
            <div style={{ backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb", padding: "10px 16px" }}>
              <p style={{ fontSize: 11, fontWeight: 900, color: "#374151", margin: 0, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                🏠 Endereço de Entrega
              </p>
            </div>
            <div style={{ padding: "14px 16px" }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 4 }}>{data.name}</p>
              <p style={{ fontSize: 12, color: "#555", lineHeight: 1.7, margin: 0 }}>
                {data.address.logradouro}{data.address.numero ? `, ${data.address.numero}` : ""}<br />
                {data.address.bairro && <>{data.address.bairro} — </>}
                {data.address.cidade}/{data.address.uf}<br />
                {data.address.cep && <>CEP: {data.address.cep}</>}
              </p>
              {data.email && (
                <p style={{ fontSize: 11, color: "#888", marginTop: 8, marginBottom: 0 }}>
                  📧 Rastreio será enviado para: <strong>{data.email}</strong>
                </p>
              )}
            </div>
          </div>
        )}

        {/* Aviso Sedex */}
        <div style={{ margin: "16px 16px 0", backgroundColor: "#eff6ff", borderRadius: 10, border: "1px solid #bfdbfe", padding: "14px 16px" }}>
          <p style={{ fontSize: 12, color: "#1e40af", fontWeight: 700, marginBottom: 6 }}>📦 Sobre a entrega via Sedex</p>
          <p style={{ fontSize: 12, color: "#1e3a8a", lineHeight: 1.6, margin: 0 }}>
            Seu produto será embalado e despachado pelo armazém Casas Bahia em até <strong>24 horas úteis</strong>.
            O código de rastreamento do Sedex será enviado para o seu e-mail{data?.email ? ` (${data.email})` : ""} assim que o despacho for confirmado pelos Correios.
          </p>
        </div>

        {/* Dados do comprador */}
        {data && (
          <div style={{ margin: "16px 16px 0", backgroundColor: "white", borderRadius: 10, border: "1px solid #e5e7eb", overflow: "hidden" }}>
            <div style={{ backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb", padding: "10px 16px" }}>
              <p style={{ fontSize: 11, fontWeight: 900, color: "#374151", margin: 0, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                👤 Dados do Arrematante
              </p>
            </div>
            <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
              <div>
                <p style={{ fontSize: 10, color: "#9ca3af", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.3px" }}>Nome</p>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#111", margin: 0 }}>{data.name}</p>
              </div>
              <div>
                <p style={{ fontSize: 10, color: "#9ca3af", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.3px" }}>CPF</p>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#111", margin: 0 }}>{formatCPF(data.cpf)}</p>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <p style={{ fontSize: 10, color: "#9ca3af", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.3px" }}>Protocolo</p>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#111", margin: 0 }}>#{orderId} — {new Date().toLocaleDateString("pt-BR")}</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer Casas Bahia */}
        <div style={{ margin: "24px 16px 0", textAlign: "center" }}>
          <div style={{ backgroundColor: "white", border: `2px solid ${CB_BLUE}`, borderRadius: 8, padding: "16px 20px", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <img src="/images/logo-casasbahia-oficial.png" alt="Casas Bahia" style={{ height: 26, objectFit: "contain" }} />
            <div style={{ width: 1, height: 28, backgroundColor: "#e5e7eb" }} />
            <p style={{ fontSize: 11, color: "#6b7280", margin: 0, lineHeight: 1.4 }}>
              Leilão Oficial<br /><strong style={{ color: CB_BLUE }}>Linha Branca</strong>
            </p>
          </div>
          <p style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1.6, margin: 0 }}>
            Em caso de dúvidas, guarde o número do protocolo.<br />
            Casas Bahia — Via Varejo S.A. — CNPJ 33.041.260/0652-90
          </p>
        </div>

      </div>
    </div>
  );
}
