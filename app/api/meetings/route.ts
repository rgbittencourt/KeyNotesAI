import{accessError,getRawDb,requireAccess}from"../../server-access";
import{storeMeetingAudio,type DriveMeeting}from"../../google-drive";
import { driveMeetingAccess } from "../../drive-meeting-access";

export const runtime="edge";
const MAX_AUDIO_BYTES=100*1024*1024;
const cleanMeeting=(value:unknown)=>{const row=value&&typeof value==="object"?{...(value as Record<string,unknown>)}:{};delete row.url;delete row.audioBlob;delete row.meetingPhotoBlob;row.attachments=Array.isArray(row.attachments)?row.attachments.map(item=>{const copy={...(item as Record<string,unknown>)};delete copy.blob;delete copy.url;return copy}):[];return row};

export async function GET(){
 try{const user=await requireAccess(),db=await getRawDb(),rows=user.role==="admin"?await db.prepare("SELECT id,email,data_json,audio_file_id,updated_at FROM meetings ORDER BY updated_at DESC").all<Record<string,unknown>>():await db.prepare("SELECT id,email,data_json,audio_file_id,updated_at FROM meetings WHERE email=? ORDER BY updated_at DESC").bind(user.email).all<Record<string,unknown>>();
  const transferred=await db.prepare("SELECT meeting_id FROM meeting_transfers WHERE source_email=?").bind(user.email).all<{meeting_id:string}>();
  return Response.json({meetings:rows.results.map(row=>{const ownerEmail=String(row.email);return{...JSON.parse(String(row.data_json)),id:Number(row.id),ownerEmail,url:row.audio_file_id?`/api/meetings/${encodeURIComponent(String(row.id))}/audio${user.role==="admin"?`?owner=${encodeURIComponent(ownerEmail)}`:""}`:"",cloudSynced:true}}),transferredMeetingIds:transferred.results.map(row=>Number(row.meeting_id))});
 }catch(error){return accessError(error)}
}

export async function POST(request:Request){
 try{const user=await requireAccess(),form=await request.formData(),raw=form.get("meeting"),audio=form.get("audio");
  if(typeof raw!=="string")return Response.json({error:"Dados da reunião ausentes."},{status:400});
  const meeting=cleanMeeting(JSON.parse(raw)) as Record<string,unknown>;
  if(!meeting.id||!String(meeting.name||"").trim())return Response.json({error:"Reunião inválida."},{status:400});
  if(!(audio instanceof File)||!audio.size)return Response.json({error:"Áudio da reunião ausente."},{status:400});
  if(audio.size>MAX_AUDIO_BYTES)return Response.json({error:"A gravação excede 100 MB."},{status:413});
  delete meeting.driveFolderId;delete meeting.driveFolderUrl;delete meeting.driveFiles;
  try{const stored=await driveMeetingAccess(user,String(meeting.id));meeting.driveFolderId=stored.folderId}catch(error){if(!(error instanceof Response)||![404,409].includes(error.status))throw error}
  const stored=await storeMeetingAudio(meeting as unknown as DriveMeeting,audio),now=new Date().toISOString();
  Object.assign(meeting,{driveFolderId:stored.folder.id,driveFolderUrl:stored.folder.webViewLink,driveFiles:[{id:stored.file.id,name:stored.file.name,webViewLink:stored.file.webViewLink}],driveSyncedAt:now});
  await(await getRawDb()).prepare("INSERT INTO meetings(id,email,data_json,audio_file_id,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(email,id) DO UPDATE SET data_json=excluded.data_json,audio_file_id=excluded.audio_file_id,updated_at=excluded.updated_at").bind(String(meeting.id),user.email,JSON.stringify(meeting),stored.file.id,now,now).run();
  return Response.json({meeting:{...meeting,url:`/api/meetings/${encodeURIComponent(String(meeting.id))}/audio`,cloudSynced:true}});
 }catch(error){if(error instanceof SyntaxError)return Response.json({error:"Dados inválidos."},{status:400});if(error instanceof Response)return accessError(error);console.error("Meeting cloud upload failed",error);return Response.json({error:error instanceof Error?error.message:"Não foi possível salvar a reunião na nuvem."},{status:502})}
}

export async function PUT(request:Request){
 try{const user=await requireAccess(),body=await request.json() as{meeting?:unknown},meeting=cleanMeeting(body.meeting),id=String(meeting.id||"");if(!id)return Response.json({error:"Reunião inválida."},{status:400});
  const ownerEmail=user.role==="admin"&&typeof meeting.ownerEmail==="string"?meeting.ownerEmail.toLowerCase():user.email;
  const existing=await(await getRawDb()).prepare("SELECT data_json FROM meetings WHERE email=? AND id=?").bind(ownerEmail,id).first<{data_json:string}>();
  if(!existing)return Response.json({error:"Reunião não encontrada para este usuário."},{status:404});
  const saved=JSON.parse(existing.data_json);
  for(const key of ["driveFolderId","driveFolderUrl","driveFiles","driveSyncedAt"]){delete meeting[key];if(saved[key]!==undefined)meeting[key]=saved[key]}
  const result=await(await getRawDb()).prepare("UPDATE meetings SET data_json=?,updated_at=? WHERE email=? AND id=?").bind(JSON.stringify(meeting),new Date().toISOString(),ownerEmail,id).run();
  if(!result.meta.changes)return Response.json({error:"Reunião não encontrada para este usuário."},{status:404});return Response.json({ok:true});
 }catch(error){if(error instanceof Response)return accessError(error);return Response.json({error:"Não foi possível sincronizar a reunião."},{status:500})}
}
