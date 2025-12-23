
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


const WORKER_BASE = \"https://iravlisto-pay.xqwertyx.workers.dev\";
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
  const rent = Number(String(els.rent.value).replace(",", "."));
  const p = els.period.value;
  const useManual = els.manualIravToggle.checked;
  const manual = Number(String(els.manualIrav.value || "").replace(",", "."));

  const irav = useManual ? manual : getIravForPeriod(p);

  if (!rent || rent <= 0) {
    setStatus("Introduce una renta mensual válida.", "warn");
    return null;
  }
  if (!useManual && (irav === null || Number.isNaN(irav))) {
    setStatus("No hay dato IRAV para ese mes en el archivo local. Activa “Introducir IRAV manualmente” o actualiza irav_data.json.", "warn");
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
  openModal();
  return false;
}

function openModal() {
  els.modal.style.display = "flex";
  els.unlockMsg.textContent = "";
  els.unlockCode.value = "";
}
function closeModal() {
  els.modal.style.display = "none";
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
    els.unlockMsg.textContent = "Desbloqueado. Ya puedes descargar documentos.";
    els.unlockMsg.style.color = "#1B7F5A";
    closeModal();
  } else {
    els.unlockMsg.textContent = "Código inválido. Revisa el formato o contacta soporte.";
    els.unlockMsg.style.color = "#B45309";
  }
}

function buildLetterText(calc) {
  const today = new Date();
  const dt = today.toLocaleDateString("es-ES");
  const effective = calc.effectiveDate ? new Date(calc.effectiveDate).toLocaleDateString("es-ES") : "[Fecha de efecto]";
  const contract = calc.contractDate ? new Date(calc.contractDate).toLocaleDateString("es-ES") : "[Fecha de contrato]";

  const lines = [
    `En ${dt}`,
    "",
    `Asunto: Actualización anual de la renta (IRAV)`,
    "",
    `Estimado/a ${calc.tenantName || "[Nombre del arrendatario]"},`,
    "",
    `De acuerdo con la cláusula de actualización de renta prevista en el contrato de arrendamiento suscrito en fecha ${contract}, le comunicamos la actualización anual de la renta con efectos desde ${effective}.`,
    "",
    `Periodo de referencia del IRAV: ${calc.periodLabel}.`,
    `Porcentaje aplicado (IRAV): ${PCT(calc.irav)}.`,
    `Renta anterior: ${EUR(calc.rent)} / mes.`,
    `Renta actualizada: ${EUR(calc.newRent)} / mes.`,
    `Diferencia: ${EUR(calc.delta)} / mes.`,
    "",
    `La presente comunicación se realiza a efectos informativos y de trazabilidad documental. Se recomienda conservar junto con el contrato y la evidencia del dato del índice correspondiente al periodo indicado.`,
  ];

  if (calc.address) {
    lines.splice(6, 0, `Inmueble: ${calc.address}.`, "");
  }

  if (calc.extra) {
    lines.push("", "Observaciones:", calc.extra);
  }

  lines.push(
    "",
    "Atentamente,",
    "",
    `${calc.landlordName || "[Nombre del arrendador]"}`
  );

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

  const margin = 48;
  let y = 56;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`${CONFIG.BRAND} — Notificación de actualización de renta`, margin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  const lines = buildLetterText(calc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - margin*2;

  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, maxWidth);
    for (const w of wrapped) {
      if (y > 780) { doc.addPage(); y = 56; }
      doc.text(w, margin, y);
      y += 16;
    }
  }

  doc.setFontSize(9);
  doc.text("Aviso: Herramienta informativa basada en fuentes públicas. No constituye asesoramiento jurídico.", margin, 820);

  doc.save(`IRAVListo_Notificacion_${calc.period}.pdf`);
}

async function downloadDOCX(calc) {
  if (!requireUnlock()) return;
  await ensureLibs();

  const { Document, Packer, Paragraph, TextRun } = window.docx;

  const title = new Paragraph({
    children: [ new TextRun({ text: `${CONFIG.BRAND} — Notificación de actualización de renta`, bold: true, size: 28 }) ],
  });

  const bodyLines = buildLetterText(calc).map(line =>
    new Paragraph({ children: [ new TextRun({ text: line, size: 22 }) ] })
  );

  const disclaimer = new Paragraph({
    children: [ new TextRun({ text: "Aviso: Herramienta informativa basada en fuentes públicas. No constituye asesoramiento jurídico.", italics: true, size: 18 }) ],
  });

  const doc = new Document({
    sections: [{
      properties: {},
      children: [title, new Paragraph(""), ...bodyLines, new Paragraph(""), disclaimer],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `IRAVListo_Notificacion_${calc.period}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function fillPeriods() {
  // Populate period dropdown: last 24 months from today, in YYYYMM -> YYYYMY
  const sel = els.period;
  sel.innerHTML = "";
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i=0;i<24;i++) {
    const d = new Date(start.getFullYear(), start.getMonth()-i, 1);
    const y = d.getFullYear();
    const m = d.getMonth()+1;
    const key = `${y}M${String(m).padStart(2, "0")}`;
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = periodLabel(key);
    sel.appendChild(opt);
  }
}

function hookEvents() {
  els.manualIravToggle.addEventListener("change", () => {
    els.manualIrav.disabled = !els.manualIravToggle.checked;
    if (!els.manualIravToggle.checked) els.manualIrav.value = "";
  });

  els.calcForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const calc = compute();
    if (!calc) return;
    lastCalc = calc;
    render(calc);
  });

  els.btnPdf.addEventListener("click", async () => {
    if (!lastCalc) return;
    try { await downloadPDF(lastCalc); } catch (e) { setStatus(String(e?.message || e), "warn"); }
  });
  els.btnDocx.addEventListener("click", async () => {
    if (!lastCalc) return;
    try { await downloadDOCX(lastCalc); } catch (e) { setStatus(String(e?.message || e), "warn"); }
  });

  els.btnExample.addEventListener("click", () => {
    const example = compute() || {
      rent: 1000, period: els.period.value, periodLabel: periodLabel(els.period.value), irav: 2.0,
      newRent: 1020, delta: 20, contractDate:"", effectiveDate:"", tenantName:"", landlordName:"", address:"", extra:""
    };
    const lines = buildLetterText(example);
    alert(lines.join("\n"));
  });

  els.closeModal.addEventListener("click", closeModal);
  els.modal.addEventListener("click", (e) => {
    if (e.target === els.modal) closeModal();
  });

  els.buyBtn.addEventListener("click", async () => {
  try {
    const res = await fetch(`${WORKER_BASE}/create-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const data = await res.json().catch(() => ({}));
    if (data.ok && data.url) {
      window.location.href = data.url; // Stripe Checkout
      return;
    }
    alert("No se pudo iniciar el pago. Intenta de nuevo.");
  } catch (e) {
    alert("Error iniciando el pago. Revisa la URL del Worker y CORS.");
  }
});
els.unlockBtn.addEventListener("click", unlockWithCode);

  // Sticky CTA
  els.stickyCalc?.addEventListener("click", () => {
    document.getElementById("calc").scrollIntoView({ behavior: "smooth" });
  });
}

(async function init(){
  fillPeriods();
  await loadData();

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
