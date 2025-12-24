/* IRAVListo app.js v7
   - Robust init (no rompe si falta algún nodo)
   - Period selector filled from irav_data.json (hasta último mes con dato)
   - Botones de compra por data-plan (one/annual)
   - Documentos PDF/Word sin marca “IRAVListo” en el título, con maquetado más profesional
*/

const WORKER_BASE = "https://iravlisto-pay.xqwertyx.workers.dev";

let IRAV_DATA = null;
let lastCalc = null;

function $(id) { return document.getElementById(id); }

const els = {
  form: $("calcForm"),
  rent: $("rent"),
  period: $("period"),
  manualToggle: $("manualIravToggle"),
  manualIrav: $("manualIrav"),
  contractDate: $("contractDate"),
  effectiveDate: $("effectiveDate"),
  tenantName: $("tenantName"),
  landlordName: $("landlordName"),
  address: $("address"),
  extra: $("extra"),
  outIrav: $("outIrav"),
  outOld: $("outOld"),
  outNew: $("outNew"),
  outDelta: $("outDelta"),
  outMonth: $("outMonth"),
  status: $("status"),
  btnPdf: $("btnPdf"),
  btnDocx: $("btnDocx"),
  resultsCard: $("resultsCard"),
};

function setStatus(msg, tone="") {
  if (!els.status) return;
  els.status.textContent = msg || "";
  els.status.className = tone ? `notice ${tone}` : "notice";
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
  const card = els.resultsCard || els.outIrav?.closest(".card");
  if (!card) return;

  const rect = card.getBoundingClientRect();
  const viewportH = window.innerHeight || document.documentElement.clientHeight;

  if (rect.top < 8 || rect.bottom > viewportH - 8) {
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  card.classList.remove("iravlisto-pulse");
  void card.offsetWidth;
  card.classList.add("iravlisto-pulse");
}

function parseEuroNumber(input) {
  const s = String(input ?? "").trim();
  if (!s) return NaN;

  const normalized = s
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

function fmtEUR(n) {
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
  } catch {
    return `${n.toFixed(2)} €`;
  }
}

function periodLabel(key) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, (m - 1), 1);
  return d.toLocaleDateString("es-ES", { year: "numeric", month: "long" });
}

function getLastMonthKey(dataObj) {
  const keys = Object.keys(dataObj || {});
  const sortable = keys
    .filter(k => /^\d{4}-\d{2}$/.test(k))
    .sort();
  return sortable[sortable.length - 1] || null;
}

async function loadData() {
  try {
    const res = await fetch("./irav_data.json", { cache: "no-store" });
    if (!res.ok) throw new Error("No se pudo cargar irav_data.json");
    const data = await res.json();

    const out = {};
    for (const [k, v] of Object.entries(data || {})) {
      if (/^\d{4}-\d{2}$/.test(k)) out[k] = Number(v);
      else if (/^\d{4}M\d{2}$/i.test(k)) out[`${k.slice(0,4)}-${k.slice(5,7)}`] = Number(v);
    }
    IRAV_DATA = out;
  } catch (e) {
    IRAV_DATA = {};
    setStatus("No se han podido cargar los datos IRAV. Usa IRAV manual.", "warn");
    if (els.manualToggle) els.manualToggle.checked = true;
  }
}

function fillPeriods() {
  if (!els.period) return;
  els.period.innerHTML = "";

  const data = IRAV_DATA || {};
  const last = getLastMonthKey(data);

  if (!last) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Sin datos (usa IRAV manual)";
    els.period.appendChild(opt);
    if (els.manualToggle) els.manualToggle.checked = true;
    return;
  }

  const keys = Object.keys(data).filter(k => /^\d{4}-\d{2}$/.test(k)).sort();
  const first = keys[0];

  const [fy, fm] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);

  let y = fy, m = fm;
  while (y < ly || (y === ly && m <= lm)) {
    const key = `${y}-${String(m).padStart(2,"0")}`;
    const opt = document.createElement("option");
    opt.value = key;
    const has = Object.prototype.hasOwnProperty.call(data, key) && Number.isFinite(Number(data[key]));
    opt.textContent = has ? `${periodLabel(key)} · ${Number(data[key]).toFixed(2)}%` : `${periodLabel(key)} · (sin dato)`;
    opt.dataset.has = has ? "1" : "0";
    els.period.appendChild(opt);

    m += 1;
    if (m === 13) { m = 1; y += 1; }
  }

  els.period.value = last;
}

function getIravForSelected() {
  const key = els.period?.value || "";
  const data = IRAV_DATA || {};
  const val = data[key];
  return Number.isFinite(Number(val)) ? Number(val) : null;
}

function compute() {
  const rent = parseEuroNumber(els.rent?.value);
  if (!Number.isFinite(rent) || rent <= 0) {
    setStatus("Introduce una renta válida.", "warn");
    return null;
  }

  const manualMode = !!els.manualToggle?.checked;
  let irav = null;

  if (manualMode) {
    irav = parseEuroNumber(els.manualIrav?.value);
    if (!Number.isFinite(irav)) {
      setStatus("Introduce un IRAV manual válido (porcentaje).", "warn");
      return null;
    }
  } else {
    irav = getIravForSelected();
    if (irav == null) {
      setStatus("Ese mes no tiene dato IRAV. Activa IRAV manual.", "warn");
      if (els.manualToggle) els.manualToggle.checked = true;
      if (els.manualIrav) els.manualIrav.focus();
      return null;
    }
  }

  const newRent = rent * (1 + (irav / 100));
  const delta = newRent - rent;

  const period = els.period?.value || "";
  const periodLabelText = period ? periodLabel(period) : "";

  return {
    rent,
    irav,
    newRent,
    delta,
    period,
    periodLabel: periodLabelText,
    contractDate: els.contractDate?.value || "",
    effectiveDate: els.effectiveDate?.value || "",
    tenantName: (els.tenantName?.value || "").trim(),
    landlordName: (els.landlordName?.value || "").trim(),
    address: (els.address?.value || "").trim(),
    extra: (els.extra?.value || "").trim(),
  };
}

function render(calc) {
  if (!calc) return;
  lastCalc = calc;

  if (els.outIrav) els.outIrav.textContent = `${calc.irav.toFixed(2)}%`;
  if (els.outOld) els.outOld.textContent = fmtEUR(calc.rent);
  if (els.outNew) els.outNew.textContent = fmtEUR(calc.newRent);
  if (els.outDelta) els.outDelta.textContent = fmtEUR(calc.delta);
  if (els.outMonth) els.outMonth.textContent = calc.periodLabel || "—";

  if (els.btnPdf) els.btnPdf.disabled = false;
  if (els.btnDocx) els.btnDocx.disabled = false;

  setStatus("Cálculo listo. Puedes descargar el documento (tras el pago).");
  focusResultsCard();
}

function isUnlocked() {
  if (window.__PRO_MODE__ === true) return true;
  return localStorage.getItem("iravlisto_unlocked") === "1";
}

function unlock() { localStorage.setItem("iravlisto_unlocked", "1"); }

async function startCheckout(planKey) {
  try {
    setStatus("Redirigiendo a pago seguro…");
    const res = await fetch(`${WORKER_BASE}/create-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: planKey }),
    });

    const data = await res.json().catch(() => ({}));
    if (data.ok && data.url) {
      window.location.href = data.url;
      return true;
    }

    setStatus(data.error ? String(data.error) : "No se pudo iniciar el pago.", "warn");
    return false;
  } catch (e) {
    setStatus("Error iniciando el pago. Revisa la URL del Worker y CORS.", "warn");
    return false;
  }
}

async function verifyFromSuccessPage() {
  const url = new URL(window.location.href);
  const sid = url.searchParams.get("session_id");
  if (!sid) return false;

  try {
    setStatus("Verificando pago…");
    const res = await fetch(`${WORKER_BASE}/verify-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sid }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.ok) {
      unlock();
      setStatus("Pago verificado. Descargas habilitadas en este dispositivo.");
      return true;
    }
    setStatus(data.error ? String(data.error) : "No se ha podido verificar el pago.", "warn");
    return false;
  } catch (e) {
    setStatus("Error verificando el pago.", "warn");
    return false;
  }
}

// -------- Document generation (pro, sin marca en título) --------
function safeLine(v) { return (String(v || "").trim()); }

function buildLetter(calc) {
  const today = new Date();
  const placeDate = today.toLocaleDateString("es-ES");

  const landlord = safeLine(calc.landlordName);
  const tenant = safeLine(calc.tenantName);
  const address = safeLine(calc.address);

  const subject = "Actualización de renta conforme a IRAV";
  const contractDate = calc.contractDate ? `Fecha de contrato: ${calc.contractDate}` : "";
  const effDate = calc.effectiveDate ? `Fecha de efecto: ${calc.effectiveDate}` : "";

  const intro = [
    landlord ? `De: ${landlord}` : "",
    tenant ? `Para: ${tenant}` : "",
    address ? `Inmueble: ${address}` : "",
  ].filter(Boolean).join("\n");

  const meta = [contractDate, effDate].filter(Boolean).join(" · ");

  const p1 = "Por la presente, y de conformidad con lo pactado en el contrato de arrendamiento, se comunica la actualización de la renta aplicando el índice IRAV correspondiente al periodo indicado.";
  const p2 = `Conforme al IRAV aplicado, la renta mensual se actualiza desde ${fmtEUR(calc.rent)} a ${fmtEUR(calc.newRent)}, lo que supone una variación de ${fmtEUR(calc.delta)}.`;
  const p3 = calc.extra ? `Observaciones: ${calc.extra}` : "";

  return {
    placeDate,
    subject,
    intro,
    meta,
    paragraphs: [p1, p2, p3].filter(Boolean),
    table: [
      ["Periodo IRAV", calc.periodLabel || calc.period || ""],
      ["IRAV aplicado", `${calc.irav.toFixed(2)}%`],
      ["Renta anterior", fmtEUR(calc.rent)],
      ["Renta actualizada", fmtEUR(calc.newRent)],
      ["Diferencia", fmtEUR(calc.delta)],
    ],
  };
}

async function downloadPDF(calc) {
  if (!window.jspdf?.jsPDF) throw new Error("jsPDF no está cargado.");
  const doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });

  const content = buildLetter(calc);

  const margin = 56;
  const lineH = 16;
  let y = margin;

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  function addPageIfNeeded(extra=0) {
    if (y + extra > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const dateW = doc.getTextWidth(content.placeDate);
  doc.text(content.placeDate, pageW - margin - dateW, y);
  y += 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  const title = "Notificación de actualización de renta";
  const titleW = doc.getTextWidth(title);
  doc.text(title, (pageW - titleW) / 2, y);
  y += 22;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Asunto: ${content.subject}`, margin, y);
  y += 18;

  if (content.intro) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    const lines = doc.splitTextToSize(content.intro, pageW - 2 * margin);
    addPageIfNeeded(lines.length * lineH);
    doc.text(lines, margin, y);
    y += lines.length * lineH + 10;
  }

  if (content.meta) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    const metaLines = doc.splitTextToSize(content.meta, pageW - 2 * margin);
    addPageIfNeeded(metaLines.length * lineH);
    doc.text(metaLines, margin, y);
    y += metaLines.length * lineH + 10;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  for (const p of content.paragraphs) {
    const lines = doc.splitTextToSize(p, pageW - 2 * margin);
    addPageIfNeeded(lines.length * lineH + 10);
    doc.text(lines, margin, y);
    y += lines.length * lineH + 10;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  addPageIfNeeded(18);
  doc.text("Detalle del cálculo", margin, y);
  y += 14;

  const col1W = 170;
  const col2W = pageW - 2 * margin - col1W;
  const rowH = 22;

  doc.setDrawColor(180);
  doc.setLineWidth(0.8);

  for (let i = 0; i < content.table.length; i++) {
    addPageIfNeeded(rowH + 2);
    const rowY = y + i * rowH;
    doc.rect(margin, rowY, col1W + col2W, rowH);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text(String(content.table[i][0]), margin + 8, rowY + 15);

    doc.setFont("helvetica", "normal");
    doc.text(String(content.table[i][1]), margin + col1W + 8, rowY + 15);
  }

  y += content.table.length * rowH + 18;

  addPageIfNeeded(70);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Atentamente,", margin, y);
  y += 38;
  doc.text(calc.landlordName ? calc.landlordName : "__________________________", margin, y);

  doc.save("notificacion_actualizacion_renta.pdf");
}

async function downloadDOCX(calc) {
  if (!window.docx) throw new Error("docx no está cargado.");
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType } = window.docx;

  const content = buildLetter(calc);

  const rows = content.table.map(([k, v]) =>
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(k), bold: true })] })] }),
        new TableCell({ children: [new Paragraph(String(v))] }),
      ],
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: content.placeDate, size: 20 })],
          }),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 260 },
            children: [new TextRun({ text: "Notificación de actualización de renta", bold: true, size: 28 })],
          }),

          new Paragraph({
            spacing: { after: 180 },
            children: [new TextRun({ text: `Asunto: ${content.subject}`, bold: true, size: 22 })],
          }),

          ...(content.intro
            ? content.intro.split("\n").map(line => new Paragraph({ children: [new TextRun({ text: line, size: 22 })] }))
            : []),

          ...(content.meta
            ? [new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: content.meta, size: 22 })] })]
            : [new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: " ", size: 22 })] })]),

          ...content.paragraphs.map(p => new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: p, size: 22 })] })),

          new Paragraph({
            spacing: { after: 120 },
            children: [new TextRun({ text: "Detalle del cálculo", bold: true, size: 24 })],
          }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows,
          }),

          new Paragraph({ spacing: { before: 300, after: 120 }, children: [new TextRun({ text: "Atentamente,", size: 22 })] }),
          new Paragraph({ children: [new TextRun({ text: calc.landlordName ? calc.landlordName : "__________________________", size: 22 })] }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "notificacion_actualizacion_renta.docx";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---- UI wiring ----
function bindEvents() {
  if (els.form) {
    els.form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const calc = compute();
      if (calc) render(calc);
    });
  }

  if (els.manualToggle) {
    els.manualToggle.addEventListener("change", () => {
      if (els.manualToggle.checked) setStatus("Modo IRAV manual activado.");
      else setStatus("Modo IRAV automático activado.");
    });
  }

  if (els.period) {
    els.period.addEventListener("change", () => {
      const has = getIravForSelected();
      if (has == null) setStatus("Ese mes no tiene dato IRAV. Puedes activar IRAV manual.", "warn");
    });
  }

  document.querySelectorAll("[data-plan]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const plan = btn.getAttribute("data-plan") || "one";
      startCheckout(plan);
    });
  });

  if (els.btnPdf) {
    els.btnPdf.addEventListener("click", async () => {
      if (!lastCalc) return setStatus("Primero realiza un cálculo.", "warn");
      if (!isUnlocked()) {
        setStatus("Para descargar, selecciona un plan en la sección de Precios.", "warn");
        document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      try { await downloadPDF(lastCalc); } catch (e) { setStatus(String(e?.message || e), "warn"); }
    });
  }

  if (els.btnDocx) {
    els.btnDocx.addEventListener("click", async () => {
      if (!lastCalc) return setStatus("Primero realiza un cálculo.", "warn");
      if (!isUnlocked()) {
        setStatus("Para descargar, selecciona un plan en la sección de Precios.", "warn");
        document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      try { await downloadDOCX(lastCalc); } catch (e) { setStatus(String(e?.message || e), "warn"); }
    });
  }
}

async function init() {
  try {
    injectPulseCSS();
    await verifyFromSuccessPage();
    await loadData();
    fillPeriods();

    if (els.btnPdf) els.btnPdf.disabled = true;
    if (els.btnDocx) els.btnDocx.disabled = true;

    bindEvents();
  } catch (e) {
    console.error(e);
    setStatus("Error cargando la app. Revisa que app.js y irav_data.json estén en /docs.", "warn");
  }
}

document.addEventListener("DOMContentLoaded", init);
