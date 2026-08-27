export type SpeakerSegment={speaker:string;start:number;end:number;text:string};
export type OpenAITranscription={text:string;segments:SpeakerSegment[];speakerNames:Record<string,string>};
const MAX_UPLOAD_BYTES=25*1024*1024;
export function audioExtension(blob:Blob){
 const type=blob.type.toLowerCase();
 if(type.includes("mpeg")||type.includes("mp3"))return"mp3";
 if(type.includes("mp4")||type.includes("m4a")||type.includes("aac"))return"m4a";
 if(type.includes("ogg"))return"ogg";
 if(type.includes("wav"))return"wav";
 if(type.includes("flac"))return"flac";
 return"webm";
}
async function wavFallback(blob:Blob){
 const context=new AudioContext();
 try{
  const decoded=await context.decodeAudioData(await blob.arrayBuffer()),sampleRate=16000,
   frames=Math.max(1,Math.ceil(decoded.duration*sampleRate)),offline=new OfflineAudioContext(1,frames,sampleRate),
   source=offline.createBufferSource();
  if(44+frames*2>MAX_UPLOAD_BYTES)throw new Error("A gravação precisa ser convertida para MP3 ou M4A antes da transcrição porque a recuperação em WAV ultrapassaria 25 MB.");
  source.buffer=decoded;source.connect(offline.destination);source.start();
  const rendered=await offline.startRendering(),samples=rendered.getChannelData(0),buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);
  const write=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i))};
  write(0,"RIFF");view.setUint32(4,36+samples.length*2,true);write(8,"WAVE");write(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,"data");view.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++){const value=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+i*2,value<0?value*0x8000:value*0x7fff,true)}
  return new Blob([buffer],{type:"audio/wav"});
 }finally{await context.close().catch(()=>{})}
}
async function requestTranscription(blob:Blob,options?:{diarize?:boolean;participants?:string}){
 const data=new FormData();
 data.set("audio",blob,`reuniao.${audioExtension(blob)}`);
 data.set("diarize",options?.diarize?"true":"false");
 if(options?.participants)data.set("participants",options.participants);
 const response=await fetch("/api/transcribe-meeting",{method:"POST",body:data});
 const body=await response.json().catch(()=>({error:"O serviço retornou uma resposta inválida."})) as OpenAITranscription&{error?:string};
 if(!response.ok||!body.text){const error=new Error(body.error||"Não foi possível transcrever pela OpenAI.") as Error&{status?:number};error.status=response.status;throw error}
 return{ text:body.text,segments:body.segments||[],speakerNames:body.speakerNames||{} };
}
export async function transcribeAudioWithOpenAI(blob:Blob,options?:{diarize?:boolean;participants?:string}){
 try{return await requestTranscription(blob,options)}catch(error){
  const message=error instanceof Error?error.message:"";
  if(!/corrupt|unsupported|recusou o áudio/i.test(message))throw error;
  let repaired:Blob;
  try{repaired=await wavFallback(blob)}catch(repairError){
   if(repairError instanceof Error&&repairError.message.includes("25 MB"))throw repairError;
   throw new Error("A gravação está incompleta ou corrompida e não pôde ser recuperada. Grave novamente ou importe uma cópia em MP3, M4A ou WAV.");
  }
  return requestTranscription(repaired,options);
 }
}
