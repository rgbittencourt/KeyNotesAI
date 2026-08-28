import{accessError,getRawDb,requireAccess}from"../../../../server-access";
import{readDriveFile}from"../../../../google-drive";
export const runtime="edge";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 try{const user=await requireAccess(),{id}=await params,row=await(await getRawDb()).prepare("SELECT audio_file_id FROM meetings WHERE email=? AND id=?").bind(user.email,id).first<{audio_file_id:string}>();
  if(!row?.audio_file_id)return new Response("Áudio não encontrado",{status:404});const upstream=await readDriveFile(row.audio_file_id,request.headers.get("range"));if(!upstream.ok)return new Response("Áudio indisponível no Google Drive",{status:upstream.status});
  const headers=new Headers({"content-type":upstream.headers.get("content-type")||"application/octet-stream","accept-ranges":"bytes","cache-control":"private, max-age=300"});for(const name of["content-length","content-range"])if(upstream.headers.get(name))headers.set(name,upstream.headers.get(name)!);
  return new Response(upstream.body,{status:upstream.status,headers});
 }catch(error){return error instanceof Response?accessError(error):new Response("Falha ao carregar áudio",{status:500})}
}
