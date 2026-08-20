/// <reference lib="webworker" />
import{pipeline,env}from"@huggingface/transformers";

env.allowLocalModels=false;
let transcriber:Promise<any>|null=null;
async function getTranscriber(){
 if(!transcriber)transcriber=pipeline("automatic-speech-recognition","onnx-community/whisper-tiny",{
  device:("gpu" in navigator?"webgpu":"wasm") as any,
  dtype:("gpu" in navigator?"q4":"q8") as any,
  progress_callback:(x:any)=>self.postMessage({type:"progress",progress:(x.progress??0)>1?(x.progress??0)/100:(x.progress??0),status:x.status??"loading",file:x.file??""})
 });
 return transcriber;
}
self.onmessage=async(e:MessageEvent<{audio:Float32Array}>)=>{
 try{self.postMessage({type:"status",message:"Carregando o modelo local…"});const pipe=await getTranscriber();self.postMessage({type:"status",message:"Transcrevendo o áudio no aparelho…"});const out=await pipe(e.data.audio,{language:"portuguese",task:"transcribe",chunk_length_s:30,stride_length_s:5});self.postMessage({type:"complete",text:Array.isArray(out)?out.map((x:any)=>x.text).join(" "):out.text||""});}
 catch(error){self.postMessage({type:"error",message:error instanceof Error?error.message:"Falha na transcrição local"});}
};
