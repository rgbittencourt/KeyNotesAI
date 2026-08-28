import { accessError, getRawDb, requireAccess } from "../../../server-access";
import { archiveMeetingInDrive, type DriveMeeting } from "../../../google-drive";

export const runtime = "edge";
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export async function GET(request:Request){
 try{
  const user=await requireAccess(),url=new URL(request.url),meetingId=url.searchParams.get("meetingId")||"",requestedOwner=(url.searchParams.get("owner")||"").toLowerCase(),owner=user.role==="admin"&&requestedOwner?requestedOwner:user.email;
  if(!meetingId)return Response.json({error:"Reunião não informada."},{status:400});
  const row=await(await getRawDb()).prepare("SELECT folder_id,folder_url,files_json,created_at FROM drive_exports WHERE email=? AND local_meeting_id=? ORDER BY created_at DESC LIMIT 1").bind(owner,meetingId).first<Record<string,unknown>>();
  if(!row)return Response.json({archive:null});
  return Response.json({archive:{folderId:String(row.folder_id),folderUrl:String(row.folder_url),files:JSON.parse(String(row.files_json||"[]")),createdAt:String(row.created_at)}});
 }catch(error){return accessError(error)}
}

export async function POST(request: Request) {
  try {
    const user = await requireAccess();
    const form = await request.formData();
    const raw = form.get("meeting");
    const audio = form.get("audio");
    const photo = form.get("photo");
    if (typeof raw !== "string") return Response.json({ error: "Dados da reunião ausentes." }, { status: 400 });
    const meeting = JSON.parse(raw) as DriveMeeting;
    if (!meeting?.id || !meeting.name?.trim()) return Response.json({ error: "Reunião inválida." }, { status: 400 });
    if (audio instanceof File && audio.size > MAX_AUDIO_BYTES) return Response.json({ error: "A gravação excede 100 MB. Comprima ou divida o áudio antes de arquivar." }, { status: 413 });
    if (photo instanceof File && (!photo.type.startsWith("image/") || photo.size > MAX_PHOTO_BYTES)) return Response.json({ error: "A foto deve ser uma imagem de até 15 MB." }, { status: 413 });
    const result = await archiveMeetingInDrive(meeting, audio instanceof File ? audio : null, photo instanceof File ? photo : null);
    const id = crypto.randomUUID(), createdAt = new Date().toISOString();
    await (await getRawDb()).prepare("INSERT INTO drive_exports(id,email,local_meeting_id,meeting_title,folder_id,folder_url,files_json,created_at) VALUES(?,?,?,?,?,?,?,?)")
      .bind(id, user.email, String(meeting.id), meeting.name.trim(), result.folder.id, result.folder.webViewLink, JSON.stringify(result.files), createdAt).run();
    const audioFile=result.files.find(file=>file.name.startsWith("00 - Gravação"));
    if(audioFile)await(await getRawDb()).prepare("UPDATE meetings SET audio_file_id=?,updated_at=? WHERE email=? AND id=?").bind(audioFile.id,createdAt,user.email,String(meeting.id)).run();
    return Response.json({ id, folder: result.folder, files: result.files, createdAt });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Os dados da reunião estão corrompidos." }, { status: 400 });
    if (error instanceof Response) return accessError(error);
    console.error("Google Drive archive failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível arquivar a reunião no Drive." }, { status: 502 });
  }
}
