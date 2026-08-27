import{accessError,consumeUsage,refundUsage,requireAccess}from"../../server-access";

const MAX_AUDIO_BYTES=25*1024*1024;
type Segment={speaker:string;start:number;end:number;text:string};
const clean=(value:FormDataEntryValue|null)=>typeof value==="string"?value.trim():"";
const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
function associateSpeakers(segments:Segment[],participantsText:string){
 const participants=participantsText.split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean),mapping:Record<string,string>={};
 for(const segment of segments){
  if(mapping[segment.speaker])continue;
  const spoken=normalize(segment.text);
  const introduced=/\b(meu nome (?:e|é)|eu sou|sou o|sou a|aqui e|aqui é|quem fala e|quem fala é)\b/.test(spoken);
  if(!introduced)continue;
  const matches=participants.filter(name=>{
   const normalized=normalize(name),parts=normalized.split(/\s+/).filter(x=>x.length>2);
   return spoken.includes(normalized)||parts.some(part=>spoken.includes(part));
  });
  if(matches.length===1)mapping[segment.speaker]=matches[0];
 }
 return mapping;
}

export async function POST(request:Request){
 let reservedEmail:string|null=null;
 try{
  const user=await requireAccess();
  const key=process.env.OPENAI_API_KEY;
  if(!key)return Response.json({error:"A transcrição pela OpenAI ainda não foi conectada pelo administrador."},{status:503});
  const data=await request.formData(),audio=data.get("audio"),diarize=clean(data.get("diarize"))==="true",participants=clean(data.get("participants"));
  if(!(audio instanceof File)||audio.size===0)return Response.json({error:"Envie um arquivo de áudio válido."},{status:400});
  if(audio.size>MAX_AUDIO_BYTES)return Response.json({error:"O áudio excede 25 MB. Use a transcrição híbrida ou divida a gravação."},{status:413});
  await consumeUsage(user.email);
  reservedEmail=user.email;
  const upstream=new FormData();
  upstream.set("file",audio,audio.name||"reuniao.webm");
  upstream.set("model",diarize?"gpt-4o-transcribe-diarize":process.env.OPENAI_TRANSCRIPTION_MODEL||"gpt-4o-mini-transcribe");
  upstream.set("language","pt");
  upstream.set("response_format",diarize?"diarized_json":"json");
  if(diarize)upstream.set("chunking_strategy","auto");
  const response=await fetch("https://api.openai.com/v1/audio/transcriptions",{method:"POST",headers:{authorization:`Bearer ${key}`},body:upstream,signal:AbortSignal.timeout(600000)});
  const result=await response.json().catch(()=>null)as{error?:{code?:string;message?:string;type?:string};text?:unknown;segments?:unknown}|null;
  if(!response.ok){
   await refundUsage(user.email);
   reservedEmail=null;
   if(result?.error?.code==="insufficient_quota")return Response.json({error:"A transcrição pela OpenAI está sem créditos disponíveis."},{status:503});
   if(response.status===429)return Response.json({error:"A transcrição está temporariamente ocupada. Aguarde e tente novamente."},{status:429});
   const detail=result?.error?.message?.trim();
   console.error("OpenAI transcription rejected",{status:response.status,code:result?.error?.code,type:result?.error?.type,message:detail});
   return Response.json({error:detail?`A OpenAI recusou o áudio: ${detail}`:"A OpenAI não conseguiu transcrever este áudio. Tente o modo híbrido."},{status:502});
  }
  reservedEmail=null;
  if(typeof result?.text!=="string"||!result.text.trim())throw new Error("Transcrição vazia");
  const segments=diarize&&Array.isArray(result.segments)?result.segments.map(item=>{
   const row=item as Record<string,unknown>;
   return{speaker:String(row.speaker||"Locutor"),start:Number(row.start)||0,end:Number(row.end)||0,text:String(row.text||"").trim()};
  }).filter(item=>item.text):[];
  const speakerNames=associateSpeakers(segments,participants);
  return Response.json({text:result.text.trim(),segments,speakerNames});
 }catch(error){
  if(reservedEmail)await refundUsage(reservedEmail);
  if(error instanceof Response)return accessError(error);
  if(error instanceof Error&&error.name==="TimeoutError")return Response.json({error:"A transcrição demorou mais que o esperado. Tente novamente."},{status:504});
  console.error("OpenAI meeting transcription failed",error);
  return Response.json({error:"Falha inesperada na transcrição pela OpenAI."},{status:500});
 }
}
