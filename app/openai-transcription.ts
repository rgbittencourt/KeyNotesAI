export type SpeakerSegment={speaker:string;start:number;end:number;text:string};
export type OpenAITranscription={text:string;segments:SpeakerSegment[];speakerNames:Record<string,string>};
export function audioExtension(blob:Blob){
 const type=blob.type.toLowerCase();
 if(type.includes("mpeg")||type.includes("mp3"))return"mp3";
 if(type.includes("mp4")||type.includes("m4a")||type.includes("aac"))return"m4a";
 if(type.includes("ogg"))return"ogg";
 if(type.includes("wav"))return"wav";
 if(type.includes("flac"))return"flac";
 return"webm";
}
export async function transcribeAudioWithOpenAI(blob:Blob,options?:{diarize?:boolean;participants?:string}){
 const data=new FormData();
 data.set("audio",blob,`reuniao.${audioExtension(blob)}`);
 data.set("diarize",options?.diarize?"true":"false");
 if(options?.participants)data.set("participants",options.participants);
 const response=await fetch("/api/transcribe-meeting",{method:"POST",body:data});
 const body=await response.json().catch(()=>({error:"O serviço retornou uma resposta inválida."})) as OpenAITranscription&{error?:string};
 if(!response.ok||!body.text)throw new Error(body.error||"Não foi possível transcrever pela OpenAI.");
 return{ text:body.text,segments:body.segments||[],speakerNames:body.speakerNames||{} };
}
