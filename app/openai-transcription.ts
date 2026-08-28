export type SpeakerSegment={speaker:string;start:number;end:number;text:string};
export type OpenAITranscription={text:string;segments:SpeakerSegment[];speakerNames:Record<string,string>};
export type TranscriptionProgress=(message:string,percent:number)=>void;
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
type RepairChunk={blob:Blob;offset:number};
function encodeWav(decoded:AudioBuffer,startFrame:number,endFrame:number,sampleRate=16000){
 const duration=(endFrame-startFrame)/decoded.sampleRate,frames=Math.max(1,Math.ceil(duration*sampleRate)),buffer=new ArrayBuffer(44+frames*2),view=new DataView(buffer),channels=Array.from({length:decoded.numberOfChannels},(_,index)=>decoded.getChannelData(index));
 const write=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i))};
 write(0,"RIFF");view.setUint32(4,36+frames*2,true);write(8,"WAVE");write(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,"data");view.setUint32(40,frames*2,true);
 for(let i=0;i<frames;i++){
  const sourcePosition=startFrame+(i/sampleRate)*decoded.sampleRate,left=Math.floor(sourcePosition),right=Math.min(endFrame-1,left+1),fraction=sourcePosition-left;
  let value=0;for(const channel of channels)value+=(channel[left]||0)*(1-fraction)+(channel[right]||0)*fraction;value=Math.max(-1,Math.min(1,value/channels.length));
  view.setInt16(44+i*2,value<0?value*0x8000:value*0x7fff,true);
 }
 return new Blob([buffer],{type:"audio/wav"});
}
async function wavFallback(blob:Blob):Promise<RepairChunk[]>{
 const context=new AudioContext();
 try{
  const decoded=await context.decodeAudioData(await blob.arrayBuffer()),chunkSeconds=12*60,chunkFrames=Math.floor(decoded.sampleRate*chunkSeconds),chunks:RepairChunk[]=[];
  for(let start=0;start<decoded.length;start+=chunkFrames){const end=Math.min(decoded.length,start+chunkFrames);chunks.push({blob:encodeWav(decoded,start,end),offset:start/decoded.sampleRate})}
  return chunks;
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
export async function transcribeAudioWithOpenAI(blob:Blob,options?:{diarize?:boolean;participants?:string},onProgress?:TranscriptionProgress){
 onProgress?.("Preparando o áudio para envio",5);
 if(blob.size<=MAX_UPLOAD_BYTES)try{
  onProgress?.("Transcrevendo arquivo único pela OpenAI",15);
  const result=await requestTranscription(blob,options);onProgress?.("Organizando a transcrição",95);return result;
 }catch(error){const message=error instanceof Error?error.message:"";if(!/corrupt|unsupported|recusou o áudio/i.test(message))throw error}
 onProgress?.("Recuperando e dividindo a gravação",10);
 let repaired:RepairChunk[];
 try{repaired=await wavFallback(blob)}catch{throw new Error("A gravação está incompleta ou corrompida e não pôde ser recuperada. Grave novamente ou importe uma cópia em MP3, M4A ou WAV.")}
 const results:OpenAITranscription[]=[];
 for(let index=0;index<repaired.length;index++){
  onProgress?.(`Transcrevendo parte ${index+1} de ${repaired.length} pela OpenAI`,15+Math.round(index/repaired.length*75));
  results.push(await requestTranscription(repaired[index].blob,options));
  onProgress?.(`Parte ${index+1} de ${repaired.length} concluída`,15+Math.round((index+1)/repaired.length*75));
 }
 if(results.length===1)return results[0];
 onProgress?.("Organizando locutores e horários",95);
 const segments=results.flatMap((result,index)=>result.segments.map(segment=>({...segment,speaker:`Parte ${index+1} · ${segment.speaker}`,start:segment.start+repaired[index].offset,end:segment.end+repaired[index].offset})));
 const speakerNames=Object.assign({},...results.map((result,index)=>Object.fromEntries(Object.entries(result.speakerNames).map(([speaker,name])=>[`Parte ${index+1} · ${speaker}`,name]))));
 return{text:results.map(result=>result.text).join("\n\n"),segments,speakerNames};
}
