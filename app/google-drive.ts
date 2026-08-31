import { DRIVE_ROOT_FOLDER_ID, getDriveAccessToken } from "./google-drive-oauth";
import { buildStandaloneMindMapSvg } from "./mind-map-svg";
import { buildDrivePdf } from "./drive-pdf";
import { requireInstitutionalFile, type DriveEntry } from "./drive-scope";
import { institutionalReader } from "./drive-reader";
const SITE_ASSET_ORIGIN = (process.env.SITE_URL || "https://keynotes-ai.rogerio-bittencourt.chatgpt.site").replace(/\/$/, "");

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

export async function storeMeetingAudio(meeting:DriveMeeting,audio:File){
  const token=await getDriveAccessToken(),folderName=`${folderDate(meeting.meetingDate||meeting.createdAt)} : ${folderTime(meeting.meetingTime)} - ${safeName(meeting.name)}`;
  const existingFolderId=folderIdFromMeeting(meeting);
  if(existingFolderId){
    const reader=await institutionalReader(),target=await reader.check(existingFolderId);
    if(target.mimeType!=="application/vnd.google-apps.folder"||existingFolderId===DRIVE_ROOT_FOLDER_ID)throw new Response("Selecione uma subpasta de reunião válida no KeyNotesAI.",{status:403});
  }
  const folder=existingFolderId?{id:existingFolderId,name:folderName,mimeType:"application/vnd.google-apps.folder",webViewLink:`https://drive.google.com/drive/folders/${existingFolderId}`} : await createFolder(token,folderName,DRIVE_ROOT_FOLDER_ID);
  const extension=audio.type.includes("mpeg")?"mp3":audio.type.includes("mp4")?"m4a":audio.type.includes("wav")?"wav":"webm";
  const file=await upload(token,folder.id,`00 - Gravação - ${safeName(meeting.name)}.${extension}`,audio);
  return{folder,file};
}

export async function readDriveFile(fileId:string,range?:string|null){
  const reader=await institutionalReader();
  await reader.check(fileId);
  return reader.request(`files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,range?{range}:{});
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

function documents(meeting: DriveMeeting) {
  const fallbackBranches = (meeting.themes || []).map((topic) => ({ topic, summary: "Tópico identificado na análise anterior.", subtopics: ["Reanalise a reunião para detalhar este ramo automaticamente."] }));
  const mindMap = meeting.mindMap || { title: meeting.name, branches: fallbackBranches };
  return [
    { name: "01 - Ata da reunião.pdf", kind: "ata" as const },
    { name: "02 - Resumo executivo.pdf", kind: "resumo" as const },
    { name: "03 - Plano de ação.pdf", kind: "acoes" as const },
    { name: "04 - Decisões, pendências e bloqueios.pdf", kind: "decisoes" as const },
    { name: "05 - Mapa mental automático.svg", svg: buildStandaloneMindMapSvg(mindMap) },
    { name: "06 - Transcrição.pdf", kind: "transcricao" as const },
  ];
}

export async function archiveMeetingInDrive(meeting: DriveMeeting, audio?: File | null, photo?: File | null) {
  const root = DRIVE_ROOT_FOLDER_ID;
  const token = await getDriveAccessToken();
  const folderName = `${folderDate(meeting.meetingDate || meeting.createdAt)} : ${folderTime(meeting.meetingTime)} - ${safeName(meeting.name)}`;
  const existingFolderId = folderIdFromMeeting(meeting);
  // Destination is resolved from the authorized meeting by the route.
  const read = (id: string) => googleFetch<DriveEntry>(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,parents,trashed&supportsAllDrives=true`, {});
  if (existingFolderId) {
    const target = await requireInstitutionalFile(existingFolderId, root, read);
    if (target.mimeType !== "application/vnd.google-apps.folder" || existingFolderId === root) throw new Error("Selecione uma subpasta de reunião válida no KeyNotesAI.");
  }
  const folder = existingFolderId
    ? { id: existingFolderId, name: folderName, mimeType: "application/vnd.google-apps.folder", webViewLink: `https://drive.google.com/drive/folders/${existingFolderId}` }
    : await createFolder(token, folderName, root);
  const existing: DriveFile[] = [];
  let pageToken = "";
  if(existingFolderId) do {
    const query = new URLSearchParams({q:`'${folder.id}' in parents and trashed = false`,fields:"nextPageToken,files(id,name,mimeType,webViewLink)",pageSize:"100",supportsAllDrives:"true",includeItemsFromAllDrives:"true",...(pageToken?{pageToken}:{})});
    const page = await googleFetch<{files:DriveFile[];nextPageToken?:string}>(token,`https://www.googleapis.com/drive/v3/files?${query}`,{});
    existing.push(...page.files); pageToken=page.nextPageToken||"";
  } while(pageToken);
  async function save(name:string,content:Blob){
    const prior=existing.find(file=>file.name===name&&file.mimeType!=="application/vnd.google-apps.folder");
    if(!prior)return upload(token,folder.id,name,content);
    return googleFetch<DriveFile>(token,`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(prior.id)}?uploadType=media&fields=id,name,mimeType,webViewLink&supportsAllDrives=true`,{method:"PATCH",headers:{"content-type":content.type||"application/octet-stream"},body:content});
  }
  const generated = await Promise.all(documents(meeting).map(async (doc) => {
    if ("svg" in doc) return save(doc.name, new Blob([doc.svg || ""], { type: "image/svg+xml;charset=utf-8" }));
    const bytes = await buildDrivePdf(meeting, doc.kind, SITE_ASSET_ORIGIN);
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return save(doc.name, new Blob([buffer], { type: "application/pdf" }));
  }));
  const files = [...existing.filter(file=>!generated.some(doc=>doc.id===file.id)), ...generated];
  const retain=(file:DriveFile)=>{const index=files.findIndex(item=>item.id===file.id);if(index>=0)files[index]=file;else files.push(file)};
  if (audio?.size) retain(await save(`00 - Gravação - ${safeName(meeting.name)}.${audio.type.includes("mpeg") ? "mp3" : audio.type.includes("mp4") ? "m4a" : "webm"}`, audio));
  if (photo?.size) {
    const extension = photo.type.includes("png") ? "png" : photo.type.includes("webp") ? "webp" : photo.type.includes("heic") ? "heic" : "jpg";
    retain(await save(`07 - Foto da reunião - ${safeName(meeting.name)}.${extension}`, photo));
  }
  return { folder, files };
}
