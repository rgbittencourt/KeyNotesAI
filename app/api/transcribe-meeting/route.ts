import{accessError,consumeUsage,refundUsage,requireAccess}from"../../server-access";

const MAX_AUDIO_BYTES=25*1024*1024;

export async function POST(request:Request){
 let reservedEmail:string|null=null;
 try{
  const user=await requireAccess();
  const key=process.env.OPENAI_API_KEY;
  if(!key)return Response.json({error:"A transcrição pela OpenAI ainda não foi conectada pelo administrador."},{status:503});
  const data=await request.formData(),audio=data.get("audio");
  if(!(audio instanceof File)||audio.size===0)return Response.json({error:"Envie um arquivo de áudio válido."},{status:400});
  if(audio.size>MAX_AUDIO_BYTES)return Response.json({error:"O áudio excede 25 MB. Use a transcrição híbrida ou divida a gravação."},{status:413});
  await consumeUsage(user.email);
  reservedEmail=user.email;
  const upstream=new FormData();
  upstream.set("file",audio,audio.name||"reuniao.webm");
  upstream.set("model",process.env.OPENAI_TRANSCRIPTION_MODEL||"gpt-transcribe");
  upstream.set("language","pt");
  upstream.set("response_format","json");
  const response=await fetch("https://api.openai.com/v1/audio/transcriptions",{method:"POST",headers:{authorization:`Bearer ${key}`},body:upstream,signal:AbortSignal.timeout(120000)});
  const result=await response.json().catch(()=>null)as{error?:{code?:string};text?:unknown}|null;
  if(!response.ok){
   await refundUsage(user.email);
   reservedEmail=null;
   if(result?.error?.code==="insufficient_quota")return Response.json({error:"A transcrição pela OpenAI está sem créditos disponíveis."},{status:503});
   if(response.status===429)return Response.json({error:"A transcrição está temporariamente ocupada. Aguarde e tente novamente."},{status:429});
   return Response.json({error:"A OpenAI não conseguiu transcrever este áudio."},{status:502});
  }
  reservedEmail=null;
  if(typeof result?.text!=="string"||!result.text.trim())throw new Error("Transcrição vazia");
  return Response.json({text:result.text.trim()});
 }catch(error){
  if(reservedEmail)await refundUsage(reservedEmail);
  if(error instanceof Response)return accessError(error);
  if(error instanceof Error&&error.name==="TimeoutError")return Response.json({error:"A transcrição demorou mais que o esperado. Tente novamente."},{status:504});
  console.error("OpenAI meeting transcription failed",error);
  return Response.json({error:"Falha inesperada na transcrição pela OpenAI."},{status:500});
 }
}
