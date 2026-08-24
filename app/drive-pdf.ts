import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { DriveMeeting } from "./google-drive";

type PdfKind = "ata" | "resumo" | "acoes" | "decisoes" | "transcricao";
type Fonts = { sans: PDFFont; bold: PDFFont; serif: PDFFont; serifBold: PDFFont; italic: PDFFont };
type Context = { pdf: PDFDocument; page: PDFPage; fonts: Fonts; ifsc?: PDFImage; inovalab?: PDFImage; y: number; title: string };

const A4 = { width: 595.28, height: 841.89 };
const M = 52;
const green = rgb(0.15, 0.25, 0.19);
const muted = rgb(0.33, 0.39, 0.35);
const gold = rgb(0.64, 0.46, 0.27);
const pale = rgb(0.93, 0.96, 0.94);
const cream = rgb(0.98, 0.96, 0.91);
const line = rgb(0.85, 0.88, 0.85);
const ink = rgb(0.12, 0.14, 0.12);

const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const split = (value?: string) => (value || "").split(/[,;\n]/).map(clean).filter(Boolean);

async function image(pdf: PDFDocument, url: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return undefined;
    return pdf.embedPng(await response.arrayBuffer());
  } catch { return undefined; }
}

function fitText(text: string, font: PDFFont, size: number, width: number) {
  const words = clean(text).split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width || !current) current = candidate;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines;
}

function footer(ctx: Context) {
  const { page, fonts } = ctx;
  page.drawLine({ start: { x: M, y: 34 }, end: { x: A4.width - M, y: 34 }, thickness: 0.7, color: line });
  page.drawText("Gerado pelo KeyNotesAI", { x: M, y: 22, size: 7, font: fonts.sans, color: muted });
  const right = "INOVALAB · IFSC Câmpus Florianópolis-Continente";
  page.drawText(right, { x: A4.width - M - fonts.sans.widthOfTextAtSize(right, 7), y: 22, size: 7, font: fonts.sans, color: muted });
}

function header(ctx: Context) {
  const { page, fonts, ifsc, inovalab } = ctx;
  if (ifsc) page.drawImage(ifsc, { x: M, y: 772, width: 125, height: 42 });
  else page.drawText("INSTITUTO FEDERAL\nSanta Catarina", { x: M, y: 790, size: 9, font: fonts.bold, color: ink, lineHeight: 11 });
  page.drawText("KeyNotes", { x: 258, y: 793, size: 13, font: fonts.bold, color: ink });
  page.drawText("AI", { x: 314, y: 793, size: 13, font: fonts.bold, color: gold });
  page.drawText("I N T E L I G Ê N C I A   P A R A   R E U N I Õ E S", { x: 230, y: 781, size: 4.8, font: fonts.sans, color: muted });
  if (inovalab) page.drawImage(inovalab, { x: 478, y: 774, width: 60, height: 38 });
  else page.drawText("INOVALAB", { x: 482, y: 792, size: 9, font: fonts.bold, color: muted });
  page.drawRectangle({ x: M, y: 761, width: 335, height: 3, color: rgb(0.25, 0.47, 0.36) });
  page.drawRectangle({ x: M + 335, y: 761, width: A4.width - M * 2 - 335, height: 3, color: gold });
  footer(ctx);
}

function addPage(ctx: Context) {
  footer(ctx);
  ctx.page = ctx.pdf.addPage([A4.width, A4.height]);
  ctx.y = 735;
  header(ctx);
  ctx.page.drawText(ctx.title, { x: M, y: 716, size: 9, font: ctx.fonts.bold, color: muted });
  ctx.y = 694;
}

function need(ctx: Context, amount: number) { if (ctx.y - amount < 54) addPage(ctx); }

function heading(ctx: Context, text: string, boxed = false) {
  need(ctx, 40);
  ctx.y -= boxed ? 13 : 6;
  ctx.page.drawText(text, { x: M + (boxed ? 14 : 0), y: ctx.y, size: 15, font: ctx.fonts.serif, color: green });
  ctx.y -= 9;
  ctx.page.drawLine({ start: { x: M + (boxed ? 14 : 0), y: ctx.y }, end: { x: A4.width - M - (boxed ? 14 : 0), y: ctx.y }, thickness: 0.7, color: line });
  ctx.y -= 16;
}

function paragraph(ctx: Context, text: string, options: { indent?: number; size?: number; italic?: boolean } = {}) {
  const size = options.size || 10.5;
  const font = options.italic ? ctx.fonts.italic : ctx.fonts.sans;
  const indent = options.indent || 0;
  const lines = fitText(text || "Não informado.", font, size, A4.width - M * 2 - indent);
  for (const lineText of lines) {
    need(ctx, 15);
    ctx.page.drawText(lineText, { x: M + indent, y: ctx.y, size, font, color: options.italic ? muted : ink });
    ctx.y -= 15;
  }
  ctx.y -= 5;
}

function bullets(ctx: Context, items: string[], empty: string) {
  if (!items.length) return paragraph(ctx, empty, { italic: true });
  for (const item of items) {
    const lines = fitText(item, ctx.fonts.sans, 10.5, A4.width - M * 2 - 25);
    need(ctx, lines.length * 15 + 3);
    ctx.page.drawCircle({ x: M + 5, y: ctx.y + 3, size: 2, color: ink });
    lines.forEach((value, index) => {
      ctx.page.drawText(value, { x: M + 17, y: ctx.y, size: 10.5, font: ctx.fonts.sans, color: ink });
      if (index < lines.length - 1) ctx.y -= 15;
    });
    ctx.y -= 17;
  }
  ctx.y -= 4;
}

function card(ctx: Context, title: string, items: string[], empty: string) {
  const normalized = items.length ? items : [empty];
  const lineCount = normalized.reduce((sum, item) => sum + Math.max(1, fitText(item, ctx.fonts.sans, 10.5, A4.width - M * 2 - 54).length), 0);
  const height = 58 + lineCount * 15 + normalized.length * 4;
  need(ctx, height + 14);
  const top = ctx.y;
  ctx.page.drawRectangle({ x: M, y: top - height, width: A4.width - M * 2, height, borderWidth: 0.8, borderColor: line, color: rgb(0.995, 0.997, 0.995) });
  ctx.y = top - 27;
  ctx.page.drawText(title, { x: M + 14, y: ctx.y, size: 15, font: ctx.fonts.serif, color: green });
  ctx.y -= 10;
  ctx.page.drawLine({ start: { x: M + 14, y: ctx.y }, end: { x: A4.width - M - 14, y: ctx.y }, thickness: 0.7, color: line });
  ctx.y -= 19;
  if (items.length) bullets(ctx, items, empty); else paragraph(ctx, empty, { indent: 14, italic: true });
  ctx.y = top - height - 18;
}

function titleBlock(ctx: Context, meeting: DriveMeeting) {
  ctx.page.drawText("D O C U M E N T O   I N S T I T U C I O N A L", { x: M + 14, y: 707, size: 5.8, font: ctx.fonts.bold, color: gold });
  ctx.page.drawText(ctx.title, { x: M + 14, y: 667, size: 29, font: ctx.fonts.serif, color: green });
  ctx.page.drawText(clean(meeting.name), { x: M + 14, y: 640, size: 16, font: ctx.fonts.serif, color: muted });
  const labels = [clean(meeting.meetingDate || meeting.createdAt || "Data não informada"), clean(meeting.meetingTime || "Horário não informado"), clean(meeting.department || "Setor não informado")];
  let x = M + 14;
  labels.forEach((label) => {
    const width = ctx.fonts.sans.widthOfTextAtSize(label, 7.5) + 18;
    ctx.page.drawRectangle({ x, y: 608, width, height: 20, color: pale });
    ctx.page.drawText(label, { x: x + 9, y: 615, size: 7.5, font: ctx.fonts.sans, color: muted });
    x += width + 7;
  });
  ctx.y = 581;
}

function actionTable(ctx: Context, meeting: DriveMeeting) {
  const actions = meeting.actions || [];
  if (!actions.length) return paragraph(ctx, "Nenhuma ação explícita identificada.", { italic: true });
  const cols = [245, 72, 56, 63, 55];
  const headers = ["Ação e evidência", "Responsável", "Prazo", "Prioridade", "Confiança"];
  need(ctx, 34);
  let x = M;
  headers.forEach((headerText, index) => { ctx.page.drawRectangle({ x, y: ctx.y - 22, width: cols[index], height: 24, color: green }); ctx.page.drawText(headerText, { x: x + 6, y: ctx.y - 14, size: 7.2, font: ctx.fonts.bold, color: rgb(1,1,1) }); x += cols[index]; });
  ctx.y -= 31;
  for (const action of actions) {
    const taskLines = fitText(clean(action.task), ctx.fonts.sans, 7.8, cols[0] - 12);
    const evidenceLines = action.evidence ? fitText(`Evidência: “${clean(action.evidence)}”`, ctx.fonts.italic, 6.5, cols[0] - 12) : [];
    const rowHeight = Math.max(36, (taskLines.length * 11) + (evidenceLines.length * 9) + 10);
    need(ctx, rowHeight + 4);
    x = M;
    const values = ["", clean(action.person || "A confirmar"), clean(action.due || "Sem prazo"), clean(action.priority || "—"), typeof action.confidence === "number" ? `${Math.round(action.confidence * 100)}%` : "—"];
    ctx.page.drawLine({ start: { x: M, y: ctx.y - rowHeight + 4 }, end: { x: A4.width - M, y: ctx.y - rowHeight + 4 }, thickness: 0.7, color: line });
    taskLines.forEach((value, i) => ctx.page.drawText(value, { x: M + 6, y: ctx.y - i * 11, size: 7.8, font: ctx.fonts.sans, color: ink }));
    evidenceLines.forEach((value, i) => ctx.page.drawText(value, { x: M + 6, y: ctx.y - taskLines.length * 11 - 3 - i * 9, size: 6.5, font: ctx.fonts.italic, color: muted }));
    x += cols[0];
    for (let i = 1; i < values.length; i++) { fitText(values[i], ctx.fonts.sans, 7.5, cols[i] - 10).slice(0, 3).forEach((value, lineIndex) => ctx.page.drawText(value, { x: x + 5, y: ctx.y - lineIndex * 10, size: 7.5, font: ctx.fonts.sans, color: ink })); x += cols[i]; }
    ctx.y -= rowHeight;
  }
  ctx.y -= 8;
}

export async function buildDrivePdf(meeting: DriveMeeting, kind: PdfKind, assetOrigin: string) {
  const pdf = await PDFDocument.create();
  const fonts: Fonts = { sans: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold), serif: await pdf.embedFont(StandardFonts.TimesRoman), serifBold: await pdf.embedFont(StandardFonts.TimesRomanBold), italic: await pdf.embedFont(StandardFonts.HelveticaOblique) };
  const labels: Record<PdfKind, string> = { ata: "Ata da reunião", resumo: "Resumo executivo", acoes: "Matriz de ações", decisoes: "Decisões e bloqueios", transcricao: "Transcrição" };
  const ctx: Context = { pdf, page: pdf.addPage([A4.width, A4.height]), fonts, ifsc: await image(pdf, `${assetOrigin}/ifsc-logo.png`), inovalab: await image(pdf, `${assetOrigin}/inovalab-logo.png`), y: 0, title: labels[kind] };
  header(ctx); titleBlock(ctx, meeting);
  const decisions = (meeting.decisions || []).filter((x) => x.kind === "decisão").map((x) => clean(x.text));
  const pending = (meeting.decisions || []).filter((x) => x.kind === "pendência").map((x) => clean(x.text));
  const blockers = (meeting.decisions || []).filter((x) => x.kind === "bloqueio").map((x) => clean(x.text));
  if (kind === "ata") {
    heading(ctx, "1. Identificação"); paragraph(ctx, `${clean(meeting.department || "Não informado")} · ${clean(meeting.meetingDate || meeting.createdAt || "Data não informada")} · ${clean(meeting.meetingTime || "Horário não informado")}`);
    heading(ctx, "2. Participantes"); bullets(ctx, split(meeting.participants), "Participantes não informados.");
    heading(ctx, "3. Pauta"); bullets(ctx, (meeting.agenda || "").split("\n").map(clean).filter(Boolean), "Pauta não informada.");
    heading(ctx, "4. Síntese das discussões"); paragraph(ctx, clean(meeting.summary));
    heading(ctx, "5. Decisões"); bullets(ctx, decisions, "Nenhuma decisão explícita identificada.");
    heading(ctx, "6. Encaminhamentos"); actionTable(ctx, meeting);
    heading(ctx, "7. Pendências e bloqueios"); bullets(ctx, [...pending, ...blockers], "Nenhuma pendência ou bloqueio identificado.");
    need(ctx, 62);
    const signatureY = ctx.y - 34;
    ctx.page.drawLine({ start: { x: M + 24, y: signatureY }, end: { x: 260, y: signatureY }, thickness: 0.7, color: muted });
    ctx.page.drawLine({ start: { x: 335, y: signatureY }, end: { x: A4.width - M - 24, y: signatureY }, thickness: 0.7, color: muted });
    ctx.page.drawText("Responsável pela ata", { x: 124, y: signatureY - 12, size: 7, font: fonts.sans, color: muted });
    ctx.page.drawText("Coordenação/chefia", { x: 392, y: signatureY - 12, size: 7, font: fonts.sans, color: muted });
  } else if (kind === "resumo") {
    const overview = clean(meeting.summary || "Resumo não disponível.");
    const overviewLines = fitText(overview, fonts.sans, 10.5, A4.width - M * 2 - 36);
    const boxHeight = 58 + overviewLines.length * 15;
    need(ctx, boxHeight);
    const top = ctx.y;
    ctx.page.drawRectangle({ x: M, y: top - boxHeight, width: A4.width - M * 2, height: boxHeight, color: pale });
    ctx.page.drawRectangle({ x: M, y: top - boxHeight, width: 4, height: boxHeight, color: rgb(0.25,0.47,0.36) });
    ctx.page.drawText("Visão geral", { x: M + 18, y: top - 27, size: 15, font: fonts.serif, color: green });
    ctx.y = top - 52;
    overviewLines.forEach((value) => { ctx.page.drawText(value, { x: M + 18, y: ctx.y, size: 10.5, font: fonts.sans, color: ink }); ctx.y -= 15; });
    ctx.y = top - boxHeight - 10; heading(ctx, "Temas centrais"); bullets(ctx, meeting.themes || [], "Nenhum tema central identificado com segurança."); heading(ctx, "Decisões-chave"); bullets(ctx, decisions, "Nenhuma decisão explícita identificada."); heading(ctx, "Próximos passos"); actionTable(ctx, meeting); heading(ctx, "Riscos e pontos de atenção"); bullets(ctx, [...pending, ...blockers], "Nenhum risco explícito identificado.");
  } else if (kind === "acoes") {
    heading(ctx, "Plano de ação consolidado"); actionTable(ctx, meeting); need(ctx, 95); ctx.page.drawRectangle({ x: M, y: ctx.y - 82, width: A4.width - M * 2, height: 82, color: cream }); ctx.y -= 26; ctx.page.drawText("Critérios", { x: M + 14, y: ctx.y, size: 15, font: fonts.serif, color: green }); ctx.y -= 22; paragraph(ctx, "Responsáveis e prazos não mencionados na conversa permanecem sinalizados para confirmação.", { indent: 14 });
  } else if (kind === "decisoes") {
    card(ctx, "Decisões tomadas", decisions, "Nenhuma decisão explícita identificada."); card(ctx, "Pontos pendentes", pending, "Nenhuma pendência explícita identificada."); card(ctx, "Bloqueios e riscos", blockers, "Nenhum bloqueio explícito identificado.");
  } else { heading(ctx, "Transcrição integral"); paragraph(ctx, clean(meeting.transcript || "Transcrição não disponível."), { size: 9 }); }
  footer(ctx);
  pdf.setTitle(`${labels[kind]} — ${clean(meeting.name)}`); pdf.setAuthor("KeyNotesAI · INOVALAB · IFSC");
  return pdf.save();
}
