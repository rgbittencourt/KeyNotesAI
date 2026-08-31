import { accessError, getRawDb, requireAdmin } from "../../../server-access";
import { trashDriveFolders } from "../../../google-drive";

export const runtime = "edge";

export async function GET(){
 try{await requireAdmin();const rows=await(await getRawDb()).prepare("SELECT id,email,data_json,updated_at FROM meetings ORDER BY updated_at DESC").all<Record<string,unknown>>();return Response.json({meetings:rows.results.map(row=>{let data:Record<string,unknown>={};try{data=JSON.parse(String(row.data_json))}catch{}return{id:String(row.id),ownerEmail:String(row.email),name:String(data.name||"Reunião sem título"),createdAt:String(data.createdAt||""),updatedAt:String(row.updated_at)}})})}catch(error){return accessError(error)}
}

export async function PATCH(request:Request){
 try{
  await requireAdmin();const body=await request.json()as{meetingId?:unknown;fromEmail?:unknown;toEmail?:unknown},meetingId=String(body.meetingId||"").trim(),fromEmail=String(body.fromEmail||"").trim().toLowerCase(),toEmail=String(body.toEmail||"").trim().toLowerCase();
  if(!meetingId||!fromEmail||!toEmail)return Response.json({error:"Informe a reunião e os dois proprietários."},{status:400});
  if(fromEmail===toEmail)return Response.json({error:"Selecione um proprietário diferente."},{status:400});
  const db=await getRawDb(),target=await db.prepare("SELECT email,status FROM app_users WHERE email=?").bind(toEmail).first<Record<string,unknown>>();
  if(!target||target.status!=="active")return Response.json({error:"O novo proprietário precisa ser um usuário ativo."},{status:400});
  const source=await db.prepare("SELECT id FROM meetings WHERE email=? AND id=?").bind(fromEmail,meetingId).first();if(!source)return Response.json({error:"Reunião não encontrada."},{status:404});
  const collision=await db.prepare("SELECT id FROM meetings WHERE email=? AND id=?").bind(toEmail,meetingId).first();if(collision)return Response.json({error:"O usuário de destino já possui uma reunião com este identificador."},{status:409});
  const now=new Date().toISOString();
  await db.batch([
   db.prepare("UPDATE meetings SET email=?,updated_at=? WHERE email=? AND id=?").bind(toEmail,now,fromEmail,meetingId),
   db.prepare("UPDATE drive_exports SET email=? WHERE email=? AND local_meeting_id=?").bind(toEmail,fromEmail,meetingId),
   db.prepare("UPDATE trello_exports SET email=?,updated_at=? WHERE email=? AND local_meeting_id=?").bind(toEmail,now,fromEmail,meetingId),
   db.prepare("INSERT INTO meeting_transfers(source_email,meeting_id,target_email,transferred_at) VALUES(?,?,?,?) ON CONFLICT(source_email,meeting_id) DO UPDATE SET target_email=excluded.target_email,transferred_at=excluded.transferred_at").bind(fromEmail,meetingId,toEmail,now),
   db.prepare("DELETE FROM meeting_transfers WHERE source_email=? AND meeting_id=?").bind(toEmail,meetingId),
  ]);
  return Response.json({ok:true,meetingId,fromEmail,toEmail});
 }catch(error){if(error instanceof Response)return accessError(error);console.error("Meeting ownership transfer failed",error);return Response.json({error:"Não foi possível transferir a reunião e seus vínculos."},{status:500})}
}

export async function DELETE(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = (await request.json()) as { meetingId?: number | string;ownerEmail?:string };
    const meetingId = String(body.meetingId || "").trim();
    if (!meetingId)
      return Response.json({ error: "Reunião não informada." }, { status: 400 });
    const ownerEmail=body.ownerEmail?.trim().toLowerCase()||admin.email;

    const db = await getRawDb();
    const rows = await db
      .prepare(
        "SELECT DISTINCT folder_id FROM drive_exports WHERE email=? AND local_meeting_id=?",
      )
      .bind(ownerEmail, meetingId)
      .all<{ folder_id: string }>();
    const folderIds = (rows.results || []).map((row) => row.folder_id);
    const cloudMeeting=await db.prepare("SELECT data_json FROM meetings WHERE email=? AND id=?").bind(ownerEmail,meetingId).first<{data_json:string}>();
    if(cloudMeeting?.data_json)try{const folderId=JSON.parse(cloudMeeting.data_json)?.driveFolderId;if(folderId&&!folderIds.includes(folderId))folderIds.push(folderId)}catch{}

    if (folderIds.length) await trashDriveFolders(folderIds);
    await db
      .prepare("DELETE FROM drive_exports WHERE email=? AND local_meeting_id=?")
      .bind(ownerEmail, meetingId)
      .run();
    await db.prepare("DELETE FROM meetings WHERE email=? AND id=?").bind(ownerEmail,meetingId).run();

    return Response.json({ deleted: true, trashedFolders: folderIds.length });
  } catch (error) {
    if (error instanceof Response) return accessError(error);
    console.error("Meeting deletion failed", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível excluir a reunião por completo.",
      },
      { status: 502 },
    );
  }
}
