import { accessError, getRawDb, requireAccess } from "../../../server-access";
import { archiveMeetingInDrive, type DriveMeeting } from "../../../google-drive";

export const runtime = "edge";
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const user = await requireAccess();
    const form = await request.formData();
    const raw = form.get("meeting");
    const audio = form.get("audio");
    if (typeof raw !== "string") return Response.json({ error: "Dados da reunião ausentes." }, { status: 400 });
    const meeting = JSON.parse(raw) as DriveMeeting;
    if (!meeting?.id || !meeting.name?.trim()) return Response.json({ error: "Reunião inválida." }, { status: 400 });
    if (audio instanceof File && audio.size > MAX_AUDIO_BYTES) return Response.json({ error: "A gravação excede 100 MB. Comprima ou divida o áudio antes de arquivar." }, { status: 413 });
    const result = await archiveMeetingInDrive(meeting, audio instanceof File ? audio : null);
    const id = crypto.randomUUID(), createdAt = new Date().toISOString();
    await (await getRawDb()).prepare("INSERT INTO drive_exports(id,email,local_meeting_id,meeting_title,folder_id,folder_url,files_json,created_at) VALUES(?,?,?,?,?,?,?,?)")
      .bind(id, user.email, String(meeting.id), meeting.name.trim(), result.folder.id, result.folder.webViewLink, JSON.stringify(result.files), createdAt).run();
    return Response.json({ id, folder: result.folder, files: result.files, createdAt });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Os dados da reunião estão corrompidos." }, { status: 400 });
    if (error instanceof Response) return accessError(error);
    console.error("Google Drive archive failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível arquivar a reunião no Drive." }, { status: 502 });
  }
}
