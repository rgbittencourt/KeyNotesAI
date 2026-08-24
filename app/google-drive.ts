import { DRIVE_ROOT_FOLDER_ID, getDriveAccessToken } from "./google-drive-oauth";
import { buildStandaloneMindMapSvg } from "./mind-map-svg";
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";

type DriveFile = { id: string; name: string; mimeType?: string; webViewLink: string };
type MeetingAction = { task?: string; person?: string; due?: string; priority?: string; evidence?: string; confidence?: number };
type MeetingDecision = { kind?: string; text?: string; evidence?: string; person?: string; due?: string; confidence?: number };
export type DriveMeeting = {
  id: number | string;
  name: string;
  meetingDate?: string;
  meetingTime?: string;
  createdAt?: string;
  participants?: string;
  department?: string;
  agenda?: string;
  transcript?: string;
  summary?: string;
  themes?: string[];
  mindMap?: { title: string; branches: Array<{ topic: string; summary: string; subtopics: string[] }> };
  actions?: MeetingAction[];
  decisions?: MeetingDecision[];
  driveFolderId?: string;
  driveFolderUrl?: string;
  driveFiles?: Array<{ id: string; name?: string; webViewLink?: string }>;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const list = (items: string[], empty: string) =>
  items.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p>${escapeHtml(empty)}</p>`;
const safeName = (value: string) => value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim().slice(0, 140) || "Reunião";

function folderDate(value?: string) {
  const raw = value || new Date().toISOString().slice(0, 10);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : new Date().toISOString().slice(0, 10);
}
function folderTime(value?: string) {
  const time = value?.match(/(?:^|\s)([01]\d|2[0-3]):([0-5]\d)/);
  return time ? `${time[1]}:${time[2]}` : "00:00";
}

async function googleFetch<T>(token: string, url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const body = await response.json().catch(() => null) as (T & { error?: { message?: string } }) | null;
  if (!response.ok || !body) throw new Error(body?.error?.message || "Falha ao gravar arquivo no Google Drive.");
  return body;
}

async function createFolder(token: string, name: string, parent: string) {
  return googleFetch<DriveFile>(token, "https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,webViewLink", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parent] }),
  });
}

async function upload(token: string, folderId: string, name: string, content: Blob, targetMime?: string) {
  const boundary = `keynotesai_${crypto.randomUUID()}`;
  const metadata = { name, parents: [folderId], ...(targetMime ? { mimeType: targetMime } : {}) };
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${content.type || "application/octet-stream"}\r\n\r\n`,
    content,
    `\r\n--${boundary}--`,
  ]);
  return googleFetch<DriveFile>(token, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink", {
    method: "POST",
    headers: { "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });
}

async function trashFile(token: string, fileId: string) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
  if (response.status === 404) return;
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message || "Não foi possível mover o item para a lixeira do Google Drive.");
  }
}

export async function trashDriveFolders(folderIds: string[]) {
  const token = await getDriveAccessToken();
  for (const folderId of [...new Set(folderIds.filter(Boolean))])
    await trashFile(token, folderId);
}

function folderIdFromMeeting(meeting: DriveMeeting) {
  if (meeting.driveFolderId?.trim()) return meeting.driveFolderId.trim();
  return meeting.driveFolderUrl?.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1] || null;
}

function documentShell(title: string, meeting: DriveMeeting, body: string) {
  const styles = `@page{size:A4;margin:16mm}*{box-sizing:border-box}body{margin:0;color:#20231f;font:11pt Arial,sans-serif}.institutional{width:100%;border-collapse:collapse;margin:0 0 4px}.institutional td{border:0;padding:6px 0;vertical-align:middle}.institutional .product{font-size:18pt;font-weight:700;color:#1d2922}.institutional .product span{color:#b98b4e}.institutional .tagline{display:block;margin-top:3px;font-size:6.5pt;letter-spacing:1.4px;color:#777}.institutional .org{text-align:right;font-size:8pt;color:#526158}.rule{height:4px;background:#3f765e;border-right:80px solid #b98b4e;margin-bottom:18mm}.kicker{font-size:7pt;letter-spacing:2px;color:#9a7545;font-weight:bold;margin:0 0 7px}h1{font:30pt Georgia,serif;margin:0;color:#18231d}h2{font:16pt Georgia,serif;font-weight:normal;color:#536158;margin:7px 0 12px}h3{font:15pt Georgia,serif;border-bottom:1px solid #dfe5df;padding-bottom:6px;color:#263b2f;margin:18px 0 10px}p,li{line-height:1.55}.meta{width:100%;border-collapse:separate;border-spacing:7px 0;margin:0 0 18px}.meta td{border:0;border-radius:18px;background:#eef3ef;color:#42604f;padding:6px 10px;font-size:8pt;text-align:center}.executive{background:#eef3ef;border-left:5px solid #3f765e;padding:15px 18px;margin:18px 0}.info{width:100%;border-collapse:separate;border-spacing:8px}.info td{width:50%;border:0;background:#f6f7f4;padding:10px}.info b{display:block;font-size:7pt;text-transform:uppercase;letter-spacing:1px;color:#987442;margin-bottom:5px}table.action{width:100%;border-collapse:collapse;font-size:8pt}table.action th{text-align:left;background:#263b2f;color:#fff;padding:8px}table.action td{padding:8px;border:0;border-bottom:1px solid #dfe4df;vertical-align:top}table.action tr{page-break-inside:avoid;break-inside:avoid}.evidence{display:block;margin-top:5px;color:#6f756f;font-style:italic;line-height:1.35}.priority{background:#f2eadb;color:#805f32;border-radius:12px;padding:4px 7px}.note{background:#fbf6ed;padding:12px 16px}.empty{color:#858982;font-style:italic}.document-footer{margin-top:24px;border-top:1px solid #d9ddd9;padding-top:8px;color:#777;font-size:7pt}`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${styles}</style></head><body><table class="institutional"><tr><td><div class="product">KeyNotes<span>AI</span></div><span class="tagline">INTELIGÊNCIA PARA REUNIÕES</span></td><td class="org"><b>INOVALAB</b><br>IFSC Câmpus Florianópolis-Continente</td></tr></table><div class="rule"></div><p class="kicker">DOCUMENTO INSTITUCIONAL</p><h1>${escapeHtml(title)}</h1><h2>${escapeHtml(meeting.name)}</h2><table class="meta"><tr><td>${escapeHtml(meeting.meetingDate || meeting.createdAt || "Data não informada")}</td><td>${escapeHtml(meeting.meetingTime || "Horário não informado")}</td><td>${escapeHtml(meeting.department || "Setor não informado")}</td></tr></table>${body}<div class="document-footer">Gerado pelo KeyNotesAI · INOVALAB · IFSC Câmpus Florianópolis-Continente</div></body></html>`;
}

function documents(meeting: DriveMeeting) {
  const participants = (meeting.participants || "").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
  const agenda = (meeting.agenda || "").split("\n").map((x) => x.trim()).filter(Boolean);
  const decisions = (meeting.decisions || []).filter((x) => x.kind === "decisão");
  const pending = (meeting.decisions || []).filter((x) => x.kind === "pendência");
  const blockers = (meeting.decisions || []).filter((x) => x.kind === "bloqueio");
  const actionRows = (meeting.actions || []).map((a) => `<tr><td>${escapeHtml(a.task || "")}${a.evidence ? `<small class="evidence">Evidência: “${escapeHtml(a.evidence)}”</small>` : ""}</td><td>${escapeHtml(a.person || "A confirmar")}</td><td>${escapeHtml(a.due || "Sem prazo")}</td><td><span class="priority">${escapeHtml(a.priority || "")}</span></td><td>${typeof a.confidence === "number" ? `${Math.round(a.confidence * 100)}%` : "-"}</td></tr>`).join("");
  const actionTable = actionRows ? `<table class="action"><thead><tr><th>Ação e evidência</th><th>Responsável</th><th>Prazo</th><th>Prioridade</th><th>Confiança</th></tr></thead><tbody>${actionRows}</tbody></table>` : `<p class="empty">Nenhuma ação explícita identificada.</p>`;
  const fallbackBranches = (meeting.themes || []).map((topic) => ({ topic, summary: "Tópico identificado na análise anterior.", subtopics: ["Reanalise a reunião para detalhar este ramo automaticamente."] }));
  const mindMap = meeting.mindMap || { title: meeting.name, branches: fallbackBranches };
  const mindMapSvg = buildStandaloneMindMapSvg(mindMap);
  return [
    { name: "01 - Ata da reunião", html: documentShell("Ata da reunião", meeting, `<h3>1. Identificação</h3><table class="info"><tr><td><b>Setor/local</b>${escapeHtml(meeting.department || "Não informado")}</td><td><b>Data e horário</b>${escapeHtml(meeting.meetingDate || meeting.createdAt || "Não informada")} · ${escapeHtml(meeting.meetingTime || "Não informado")}</td></tr></table><h3>2. Participantes</h3>${list(participants, "Participantes não informados.")}<h3>3. Pauta</h3>${list(agenda, "Pauta não informada.")}<h3>4. Síntese das discussões</h3><p>${escapeHtml(meeting.summary || "")}</p><h3>5. Decisões</h3>${list(decisions.map((x) => x.text || ""), "Nenhuma decisão explícita identificada.")}<h3>6. Encaminhamentos</h3>${actionTable}<h3>7. Pendências e bloqueios</h3>${list([...pending, ...blockers].map((x) => `${x.kind}: ${x.text}`), "Nenhuma pendência ou bloqueio identificado.")}`) },
    { name: "02 - Resumo executivo", html: documentShell("Resumo executivo", meeting, `<div class="executive"><h3>Visão geral</h3><p>${escapeHtml(meeting.summary || "")}</p></div><h3>Temas centrais</h3>${list(meeting.themes || [], "Nenhum tema central identificado com segurança.")}<h3>Decisões-chave</h3>${list(decisions.map((x) => x.text || ""), "Nenhuma decisão explícita identificada.")}<h3>Próximos passos</h3>${actionTable}<h3>Riscos e pontos de atenção</h3>${list([...pending, ...blockers].map((x) => `${x.kind}: ${x.text}`), "Nenhum risco explícito identificado.")}`) },
    { name: "03 - Plano de ação", html: documentShell("Matriz de ações", meeting, `<h3>Plano de ação consolidado</h3>${actionTable}<div class="note"><h3>Critérios</h3><p>Responsáveis e prazos não mencionados na conversa permanecem sinalizados para confirmação.</p></div>`) },
    { name: "04 - Decisões, pendências e bloqueios", html: documentShell("Decisões e bloqueios", meeting, `<h3>Decisões tomadas</h3>${list(decisions.map((x) => x.text || ""), "Nenhuma decisão explícita identificada.")}<h3>Pontos pendentes</h3>${list(pending.map((x) => x.text || ""), "Nenhuma pendência explícita identificada.")}<h3>Bloqueios e riscos</h3>${list(blockers.map((x) => x.text || ""), "Nenhum bloqueio explícito identificado.")}`) },
    { name: "05 - Mapa mental automático.svg", html: mindMapSvg, raw: true },
    { name: "06 - Transcrição", html: documentShell("Transcrição", meeting, `<p style="white-space:pre-wrap">${escapeHtml(meeting.transcript || "Transcrição não disponível.")}</p>`) },
  ];
}

export async function archiveMeetingInDrive(meeting: DriveMeeting, audio?: File | null, photo?: File | null) {
  const root = DRIVE_ROOT_FOLDER_ID;
  const token = await getDriveAccessToken();
  const folderName = `${folderDate(meeting.meetingDate || meeting.createdAt)} : ${folderTime(meeting.meetingTime)} - ${safeName(meeting.name)}`;
  const existingFolderId = folderIdFromMeeting(meeting);
  const folder = existingFolderId
    ? { id: existingFolderId, name: folderName, mimeType: "application/vnd.google-apps.folder", webViewLink: `https://drive.google.com/drive/folders/${existingFolderId}` }
    : await createFolder(token, folderName, root);
  const generated = await Promise.all(documents(meeting).map((doc) => upload(token, folder.id, doc.name, new Blob([doc.html], { type: doc.raw ? "image/svg+xml;charset=utf-8" : "text/html;charset=utf-8" }), doc.raw ? undefined : GOOGLE_DOC_MIME)));
  const files = [...generated];
  if (audio?.size) files.push(await upload(token, folder.id, `00 - Gravação - ${safeName(meeting.name)}.${audio.type.includes("mpeg") ? "mp3" : audio.type.includes("mp4") ? "m4a" : "webm"}`, audio));
  if (photo?.size) {
    const extension = photo.type.includes("png") ? "png" : photo.type.includes("webp") ? "webp" : photo.type.includes("heic") ? "heic" : "jpg";
    files.push(await upload(token, folder.id, `07 - Foto da reunião - ${safeName(meeting.name)}.${extension}`, photo));
  }
  if (existingFolderId && meeting.driveFiles?.length)
    await Promise.all(meeting.driveFiles.map((file) => trashFile(token, file.id)));
  return { folder, files };
}
