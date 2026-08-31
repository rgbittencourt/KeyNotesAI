import { getRawDb, type AccessUser } from "./server-access";
import { DRIVE_ROOT_FOLDER_ID } from "./google-drive-oauth";
import { validDriveId } from "./drive-scope";

export async function driveMeetingAccess(user: AccessUser, meetingId: string, requestedOwner?: string | null) {
  if (!meetingId) throw new Response("Selecione uma reunião para abrir seus documentos.", { status: 400 });
  const owner = user.role === "admin" && requestedOwner ? requestedOwner.toLowerCase() : user.email;
  const db = await getRawDb();
  const meeting = await db.prepare("SELECT data_json FROM meetings WHERE email=? AND id=?").bind(owner, meetingId).first<{data_json:string}>();
  const archive = await db.prepare("SELECT folder_id,folder_url,files_json,created_at FROM drive_exports WHERE email=? AND local_meeting_id=? ORDER BY created_at DESC LIMIT 1").bind(owner, meetingId).first<{folder_id:string;folder_url:string;files_json:string;created_at:string}>();
  if (!meeting && !archive) throw new Response("Reunião não encontrada para este usuário.", { status: 404 });
  const data = meeting ? JSON.parse(meeting.data_json) : {};
  const latest = archive && (!data.driveSyncedAt || archive.created_at >= data.driveSyncedAt);
  const folderId = latest ? archive.folder_id : data.driveFolderId || data.driveFolderUrl?.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1];
  if (!folderId || !validDriveId(folderId) || folderId === DRIVE_ROOT_FOLDER_ID) throw new Response("Esta reunião ainda não tem uma pasta válida. Use Arquivar no Drive na reunião.", { status: 409 });
  return { owner, folderId: String(folderId), files: latest ? JSON.parse(archive.files_json || "[]") : data.driveFiles || [], data };
}
