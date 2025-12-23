
/**
 * IRAVListo / IRAVListo (IRAVListo)
 * Static webapp: landing + free IRAV calculator + paid document exports.
 *
 * Data:
 *  - public_free uses irav_data.json (kept updated by GitHub Action / script).
 *  - If data is missing for a period, user can enter IRAV manually.
 *
 * Exports:
 *  - PDF via jsPDF
 *  - Word (.docx) via docx (docx.js)
 */

const CONFIG = {
  BRAND: "IRAVListo",
  PRO_MODE: false,
  // If you use a payment provider, set your product URL:
  BUY_URL: "https://example.com/pago", // replace
  SUPPORT_EMAIL: "soporte@tu-dominio.com", // replace
};


const WORKER_BASE = "https://iravlisto-pay.xqwertyx.workers.dev";
// Helpers
const EUR = (n) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
};
const PCT = (n) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${Number(n).toFixed(2).replace(".", ",")}%`;
};
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function parseNumberES(input) {
  // Acepta: "950", "1.200", "1.200,50", "1200,50"
  const s = String(input ?? "").trim();
  if (!s) return NaN;
  // Elimina espacios y separadores de miles ".", y convierte coma decimal a punto
  const normalized = s.replace(/\s+/g, "").replace(/\./g, "").replace(",", ".");
  return Number(normalized);
}


const els = {
  calcForm: document.getElementById("calcForm"),
  rent: document.getElementById("rent"),
  period: document.getElementById("period"),
  manualIravToggle: document.getElementById("manualIravToggle"),
  manualIrav: document.getElementById("manualIrav"),
  contractDate: document.getElementById("contractDate"),
  effectiveDate: document.getElementById("effectiveDate"),
  tenantName: document.getElementById("tenantName"),
  landlordName: document.getElementById("landlordName"),
  address: document.getElementById("address"),
  extra: document.getElementById("extra"),
  outIrav: document.getElementById("outIrav"),
  outOld: document.getElementById("outOld"),
  outNew: document.getElementById("outNew"),
  outDelta: document.getElementById("outDelta"),
  outMonth: document.getElementById("outMonth"),
  status: document.getElementById("status"),
  btnPdf: document.getElementById("btnPdf"),
  btnDocx: document.getElementById("btnDocx"),
  btnExample: document.getElementById("btnExample"),
  modal: document.getElementById("modal"),
  closeModal: document.getElementById("closeModal"),
  buyBtn: document.getElementById("buyBtn"),
  unlockBtn: document.getElementById("unlockBtn"),
  unlockCode: document.getElementById("unlockCode"),
  unlockMsg: document.getElementById("unlockMsg"),
  stickyCalc: document.getElementById("stickyCalc"),
};

let DATA = null;
let lastCalc = null;

async function loadData() {
  try {
    const res = await fetch("./irav_data.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    DATA = await res.json();
  } catch (e) {
    console.warn("No se pudo cargar irav_data.json:", e);
    DATA = { series: [] };
  }
}

function periodLabel(p) {
  // "2025M11" -> "noviembre 2025"
  const m = Number(p?.slice(5));
  const y = Number(p?.slice(0,4));
  const monthNames = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  if (!y || !m || m < 1 || m > 12) return p || "—";
  return `${monthNames[m-1]} ${y}`;
}

function getIravForPeriod(p) {
  const s = (DATA?.series || []).find(x => x.period === p);
  return s ? Number(s.value) : null;
}

function compute() {
  const rent = parseNumberES(els.rent.value);
  const p = els.period.value;
  const useManual = els.manualIravToggle.checked;
  const manual = parseNumberES(els.manualIrav.value || "");

  const irav = useManual ? manual : getIravForPeriod(p);

  if (!rent || rent <= 0) {
    setStatus("Introduce una renta mensual válida.", "warn");
    return null;
  }
  if (!useManual && (irav === null || Number.isNaN(irav))) {
    // Auto-habilitar modo manual para que el usuario pueda continuar
    els.manualIravToggle.checked = true;
    els.manualIrav.disabled = false;
    setStatus(`No hay dato IRAV para ${periodLabel(p)} en el archivo local. Introduce el IRAV manualmente o actualiza irav_data.json.`, "warn");
    try { els.manualIrav.focus(); } catch (e) {}
    return null;
  }
  if (useManual && (Number.isNaN(manual))) {
    setStatus("Introduce un IRAV válido (porcentaje).", "warn");
    return null;
  }

  const newRent = round2(rent * (1 + (irav/100)));
  const delta = round2(newRent - rent);

  return {
    rent,
    period: p,
    periodLabel: periodLabel(p),
    irav,
    newRent,
    delta,
    contractDate: els.contractDate.value || "",
    effectiveDate: els.effectiveDate.value || "",
    tenantName: els.tenantName.value || "",
    landlordName: els.landlordName.value || "",
    address: els.address.value || "",
    extra: els.extra.value || "",
    computedAt: new Date().toISOString(),
  };
}

function render(calc) {
  if (!calc) return;
  els.outIrav.textContent = PCT(calc.irav);
  els.outOld.textContent = EUR(calc.rent);
  els.outNew.textContent = EUR(calc.newRent);
  els.outDelta.textContent = EUR(calc.delta);
  els.outMonth.textContent = calc.periodLabel;
  setStatus("Cálculo listo. Puedes descargar la notificación (PDF/Word).", "ok");

  // Enable export buttons
  els.btnPdf.disabled = false;
  els.btnDocx.disabled = false;

  focusResultsCard();
}


function injectPulseCSS() {
  if (document.getElementById("iravlistoPulseCSS")) return;
  const style = document.createElement("style");
  style.id = "iravlistoPulseCSS";
  style.textContent = `
@keyframes iravPulse {
  0% { box-shadow: var(--shadow); }
  35% { box-shadow: 0 0 0 6px rgba(30,136,229,.18), var(--shadow); }
  100% { box-shadow: var(--shadow); }
}
.iravlisto-pulse { animation: iravPulse 1.2s ease-out 1; }
`;
  document.head.appendChild(style);
}

function focusResultsCard() {
  const anchor = document.getElementById("outIrav");
  const card =
    document.getElementById("resultsCard") ||
    anchor?.closest(".hero-card") ||
    anchor?.closest(".card");

  if (!card) return;


  const rect = card.getBoundingClientRect();
  const viewportH = window.innerHeight || document.documentElement.clientHeight;

  // Si no está visible, desplazamos hacia el resultado
  if (rect.top < 8 || rect.bottom > viewportH - 8) {
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Resaltar el panel para que se entienda que ya hay resultado
  card.classList.remove("iravlisto-pulse");
  // fuerza reflow para reiniciar animación
  void card.offsetWidth;
  card.classList.add("iravlisto-pulse");
}


function setStatus(msg, tone="") {
  els.status.className = `notice ${tone}`.trim();
  els.status.textContent = msg;
}

function isUnlocked() {
  if (CONFIG.PRO_MODE) return true;
  return localStorage.getItem("iravlisto_unlocked") === "1";
}

function requireUnlock() {
  if (isUnlocked()) return true;

  // Si no hay modal en la landing, hacemos fallback a precios
  setStatus("Para descargar el documento, elige una opción de pago en “Precios”.", "warn");

  const pricing = document.getElementById("pricing");
  if (pricing) {
    pricing.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      // resalta ligeramente la sección
      pricing.classList.remove("iravlisto-pulse");
      void pricing.offsetWidth;
      pricing.classList.add("iravlisto-pulse");
    } catch (e) {}
  } else {
    // Si existiera modal, úsalo
    openModal();
  }

  return false;
}

function openModal() {
  if (!els.modal) return;
  els.modal.style.display = "flex";
  if (els.unlockMsg) els.unlockMsg.textContent = "";
  if (els.unlockCode) els.unlockCode.value = "";
}
function closeModal() {
  if (!els.modal) return;
  els.modal.style.display = "none";
}


async function startCheckout(planKey) {
  try {
    const res = await fetch(`${WORKER_BASE}/create-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: planKey || "one" }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.ok && data.url) {
      window.location.href = data.url;
      return true;
    }
    setStatus(data.error ? String(data.error) : "No se pudo iniciar el pago.", "warn");
    return false;
  } catch (e) {
    setStatus("Error iniciando el pago. Revisa el Worker/CORS.", "warn");
    return false;
  }
}


function normalizeCode(s) {
  return String(s || "").trim().toUpperCase().replace(/[^A-Z0-9\-]/g, "");
}

// Simple offline unlock validation: checksum-based (good enough for MVP).
// For production, swap for server-side verification (Stripe webhooks / license API).
function validateUnlockCode(code) {
  // Expected format: IRAV-XXXX-XXXX-XXXX
  if (!/^IRAV-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return false;

  // Lightweight checksum: last block must match hash(prefix+middle) mod 36^4
  const parts = code.split("-");
  const a = parts[1], b = parts[2], c = parts[3];
  const raw = `IRAV-${a}-${b}`;
  let h = 0;
  for (let i=0;i<raw.length;i++) h = (h*31 + raw.charCodeAt(i)) >>> 0;
  const base36 = (h % (36**4)).toString(36).toUpperCase().padStart(4, "0");
  return base36 === c;
}

function unlockWithCode() {
  const code = normalizeCode(els.unlockCode.value);
  if (!code) return;

  if (validateUnlockCode(code)) {
    localStorage.setItem("iravlisto_unlocked", "1");
    if (els.unlockMsg) els.unlockMsg.textContent = "Desbloqueado. Ya puedes descargar documentos.";
    if (els.unlockMsg) els.unlockMsg.style.color = "#1B7F5A";
    closeModal();
  } else {
    if (els.unlockMsg) els.unlockMsg.textContent = "Código inválido. Revisa el formato o contacta soporte.";
    if (els.unlockMsg) els.unlockMsg.style.color = "#B45309";
  }
}


function buildLetterModel(calc) {
  const dt = new Date().toLocaleDateString("es-ES");
  const effective = calc.effectiveDate ? new Date(calc.effectiveDate).toLocaleDateString("es-ES") : "[Fecha de efecto]";
  const contract = calc.contractDate ? new Date(calc.contractDate).toLocaleDateString("es-ES") : "[Fecha de contrato]";

  const tenant = calc.tenantName || "[Nombre del arrendatario]";
  const landlord = calc.landlordName || "[Nombre del arrendador]";
  const address = calc.address || "";

  const subject = "Actualización anual de la renta (IRAV)";

  const paragraphs = [
    `Estimado/a ${tenant},`,
    `De conformidad con la cláusula de actualización de renta del contrato suscrito el ${contract}, por la presente se comunica la actualización anual de la renta con efectos desde ${effective}.`,
    `El porcentaje aplicado corresponde al Índice de Referencia de Arrendamientos de Vivienda (IRAV) del periodo ${calc.periodLabel}.`,
    "A continuación se detalla el resultado del cálculo:",
  ];

  if (calc.extra) {
    paragraphs.push(`Observaciones: ${calc.extra}`);
  }

  const table = [
    ["Renta anterior (mensual)", EUR(calc.rent)],
    ["IRAV aplicado", PCT(calc.irav)],
    ["Renta actualizada (mensual)", EUR(calc.newRent)],
    ["Diferencia mensual", EUR(calc.delta)],
  ];

  return { dt, subject, tenant, landlord, address, paragraphs, table };
}

function buildLetterText(calc) {
  const m = buildLetterModel(calc);
  const lines = [];
  lines.push(m.dt);
  lines.push("");
  lines.push(`Asunto: ${m.subject}`);
  lines.push("");
  lines.push(...m.paragraphs);
  lines.push("");
  lines.push("Detalle del cálculo:");
  for (const [k, v] of m.table) lines.push(`- ${k}: ${v}`);
  lines.push("");
  lines.push("Atentamente,");
  lines.push("");
  lines.push(m.landlord);
  return lines;
}


async function ensureLibs() {
  // jsPDF
  if (!window.jspdf) {
    throw new Error("No se ha cargado jsPDF.");
  }
  // docx
  if (!window.docx) {
    throw new Error("No se ha cargado docx.");
  }
}

async function downloadPDF(calc) {
  if (!requireUnlock()) return;
  await ensureLibs();

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const m = buildLetterModel(calc);

  const margin = 54;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - margin * 2;
  let y = 62;

  const addLine = (txt, opts = {}) => {
    const {
      font = "helvetica",
      style = "normal",
      size = 11,
      gap = 16,
      align = "left",
      bold = false,
    } = opts;

    doc.setFont(font, bold ? "bold" : style);
    doc.setFontSize(size);

    const lines = Array.isArray(txt) ? txt : doc.splitTextToSize(String(txt), maxW);
    for (const line of lines) {
      if (y > pageH - 72) { doc.addPage(); y = 62; }
      if (align === "center") doc.text(line, pageW / 2, y, { align: "center" });
      else if (align === "right") doc.text(line, pageW - margin, y, { align: "right" });
      else doc.text(line, margin, y);
      y += gap;
    }
  };

  // Encabezado
  addLine(m.dt, { align: "right", size: 10, gap: 14 });
  addLine("NOTIFICACIÓN DE ACTUALIZACIÓN DE RENTA", { align: "center", size: 14, bold: true, gap: 18 });
  addLine("Índice de Referencia de Arrendamientos de Vivienda (IRAV)", { align: "center", size: 11, gap: 18 });

  // Separador
  doc.setDrawColor(210);
  doc.line(margin, y - 6, pageW - margin, y - 6);
  y += 8;

  // Datos de destinatario (si hay)
  if (m.tenant || m.address) {
    addLine(`Destinatario: ${m.tenant}`, { size: 11, gap: 16 });
    if (m.address) addLine(`Inmueble: ${m.address}`, { size: 11, gap: 18 });
  }

  // Asunto
  addLine(`Asunto: ${m.subject}`, { bold: true, size: 11, gap: 18 });

  // Cuerpo
  for (const p of m.paragraphs) {
    addLine(p, { size: 11, gap: 16 });
    y += 4;
  }

  // Tabla (2 columnas)
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  addLine("Detalle del cálculo", { bold: true, size: 11, gap: 16 });

  const col1 = margin;
  const col2 = pageW - margin;
  const mid = margin + Math.floor(maxW * 0.62);

  const rowH = 18;

  const drawRow = (k, v, header = false) => {
    if (y > pageH - 90) { doc.addPage(); y = 62; }
    doc.setFont("helvetica", header ? "bold" : "normal");
    doc.setFontSize(11);
    doc.text(String(k), col1, y);
    doc.text(String(v), col2, y, { align: "right" });
    y += rowH;
  };

  // Rows
  for (const [k, v] of m.table) drawRow(k, v, false);

  y += 10;
  addLine("Atentamente,", { size: 11, gap: 16 });
  addLine(m.landlord, { size: 11, gap: 16 });

  // Pie
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const foot = "Documento generado automáticamente a partir de los datos facilitados. No constituye asesoramiento jurídico.";
  doc.text(doc.splitTextToSize(foot, maxW), margin, pageH - 44);

  doc.save(`Notificacion_Actualizacion_Renta_IRAV_${calc.period}.pdf`);
}


async function downloadDOCX(calc) {
  if (!requireUnlock()) return;
  await ensureLibs();

  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    AlignmentType,
    BorderStyle,
  } = window.docx;

  const m = buildLetterModel(calc);

  const title = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
    children: [
      new TextRun({ text: "NOTIFICACIÓN DE ACTUALIZACIÓN DE RENTA", bold: true, size: 28 }),
      new TextRun({ text: "
Índice de Referencia de Arrendamientos de Vivienda (IRAV)", size: 22 }),
    ],
  });

  const dateP = new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { after: 180 },
    children: [new TextRun({ text: m.dt, size: 20 })],
  });

  const subjectP = new Paragraph({
    spacing: { after: 180 },
    children: [new TextRun({ text: `Asunto: ${m.subject}`, bold: true, size: 22 })],
  });

  const dest = [];
  if (m.tenant) {
    dest.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: `Destinatario: ${m.tenant}`, size: 22 })] }));
  }
  if (m.address) {
    dest.push(new Paragraph({ spacing: { after: 140 }, children: [new TextRun({ text: `Inmueble: ${m.address}`, size: 22 })] }));
  }

  const body = m.paragraphs.map((t) =>
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: t, size: 22 })],
    })
  );

  const tableTitle = new Paragraph({
    spacing: { before: 120, after: 120 },
    children: [new TextRun({ text: "Detalle del cálculo", bold: true, size: 22 })],
  });

  const rows = m.table.map(([k, v]) =>
    new TableRow({
      children: [
        new TableCell({
          width: { size: 70, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
            left: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
            right: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
          },
          children: [new Paragraph({ children: [new TextRun({ text: String(k), size: 22 })] })],
        }),
        new TableCell({
          width: { size: 30, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
            left: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
            right: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: String(v), size: 22 })],
            }),
          ],
        }),
      ],
    })
  );

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });

  const closing = [
    new Paragraph({ spacing: { before: 200, after: 80 }, children: [new TextRun({ text: "Atentamente,", size: 22 })] }),
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: m.landlord, size: 22 })] }),
  ];

  const disclaimer = new Paragraph({
    spacing: { before: 200 },
    children: [
      new TextRun({
        text: "Documento generado automáticamente a partir de los datos facilitados. No constituye asesoramiento jurídico.",
        italics: true,
        size: 18,
      }),
    ],
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 }, // ~2 cm
          },
        },
        children: [dateP, title, ...dest, subjectP, ...body, tableTitle, table, ...closing, disclaimer],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Notificacion_Actualizacion_Renta_IRAV_${calc.period}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}


function fillPeriods() {
  const sel = els.period;
  sel.innerHTML = "";

  // Si hay datos, construye un rango de 24 meses terminando en el último mes disponible (evita meses futuros sin dato).
  if (DATA?.series?.length) {
    const last = DATA.series[DATA.series.length - 1].period; // e.g., 2025M11
    const y = Number(last.slice(0, 4));
    const m = Number(last.slice(5));
    const end = new Date(y, m - 1, 1);

    for (let i = 0; i < 24; i++) {
      const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
      const yy = d.getFullYear();
      const mm = d.getMonth() + 1;
      const key = `${yy}M${String(mm).padStart(2, "0")}`;

      const opt = document.createElement("option");
      const has = getIravForPeriod(key) !== null;
      opt.value = key;
      opt.textContent = has ? periodLabel(key) : `${periodLabel(key)} (sin dato)`;
      sel.appendChild(opt);
    }

    // Seleccionar por defecto el último mes con dato
    sel.value = last;
    return;
  }

  // Fallback: últimos 24 meses desde hoy
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = 0; i < 24; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const key = `${y}M${String(m).padStart(2, "0")}`;
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = periodLabel(key);
    sel.appendChild(opt);
  }
}


function autoManualIfMissing() {
  const p = els.period.value;
  const has = getIravForPeriod(p) !== null;
  if (!has) {
    els.manualIravToggle.checked = true;
    els.manualIrav.disabled = false;
    setStatus(`No hay dato IRAV para ${periodLabel(p)}. Introduce el porcentaje manualmente.`, "warn");
    try { els.manualIrav.focus(); } catch (e) {}
  }
}

function hookEvents() {
  // Botones de compra (planes)
  document.querySelectorAll("[data-plan]").forEach((btn) => {
    btn.addEventListener("click", () => startCheckout(btn.getAttribute("data-plan") || "one"));
  });

  els.manualIravToggle.addEventListener("change", () => {
    els.manualIrav.disabled = !els.manualIravToggle.checked;
    if (!els.manualIravToggle.checked) els.manualIrav.value = "";
  });

  
  els.period.addEventListener("change", autoManualIfMissing);
els.calcForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const calc = compute();
    if (!calc) return;
    lastCalc = calc;
    render(calc);
  });

  els.btnPdf?.addEventListener("click", async () => {
    if (!lastCalc) return;
    try { await downloadPDF(lastCalc); } catch (e) { setStatus(String(e?.message || e), "warn"); }
  });
  els.btnDocx?.addEventListener("click", async () => {
    if (!lastCalc) return;
    try { await downloadDOCX(lastCalc); } catch (e) { setStatus(String(e?.message || e), "warn"); }
  });

  els.btnExample?.addEventListener("click", () => {
    const example = compute() || {
      rent: 1000, period: els.period.value, periodLabel: periodLabel(els.period.value), irav: 2.0,
      newRent: 1020, delta: 20, contractDate:"", effectiveDate:"", tenantName:"", landlordName:"", address:"", extra:""
    };
    const lines = buildLetterText(example);
    alert(lines.join("\n"));
  });

  els.closeModal?.addEventListener("click", closeModal);
  els.modal?.addEventListener("click", (e) => {
    if (e.target === els.modal) closeModal();
  });

  els.buyBtn?.addEventListener("click", () => startCheckout("one"));
els.unlockBtn?.addEventListener("click", unlockWithCode);

  // Sticky CTA
  els.stickyCalc?.addEventListener("click", () => {
    document.getElementById("calc").scrollIntoView({ behavior: "smooth" });
  });
}

(async function init(){
  await loadData();
  injectPulseCSS();
  fillPeriods();

// If PRO_MODE, show as unlocked
  if (CONFIG.PRO_MODE) localStorage.setItem("iravlisto_unlocked", "1");

  // Disable manual field by default
  els.manualIrav.disabled = true;

  // Disable exports until calculation done
  els.btnPdf.disabled = true;
  els.btnDocx.disabled = true;

  // Set default status
  setStatus("Introduce los datos y pulsa “Calcular gratis”.", "");

  hookEvents();
})();
