import{pipeline,env}from"https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

env.allowLocalModels=false;
let transcriber=null;
async function getTranscriber(){
 if(!transcriber)transcriber=pipeline("automatic-speech-recognition","onnx-community/whisper-tiny",{
  device:("gpu" in navigator?"webgpu":"wasm"),
  dtype:("gpu" in navigator?"q4":"q8"),
  progress_callback:x=>self.postMessage({type:"progress",progress:(x.progress??0)>1?(x.progress??0)/100:(x.progress??0),status:x.status??"loading",file:x.file??""})
 });
 return transcriber;
}
self.onmessage=async e=>{
 try{
  self.postMessage({type:"status",message:"Carregando o modelo local…"});
  const pipe=await getTranscriber();
  self.postMessage({type:"status",message:"Transcrevendo o áudio no aparelho…"});
  const out=await pipe(e.data.audio,{language:"portuguese",task:"transcribe",chunk_length_s:30,stride_length_s:5});
  self.postMessage({type:"complete",text:Array.isArray(out)?out.map(x=>x.text).join(" "):out.text||""});
 }catch(error){self.postMessage({type:"error",message:error instanceof Error?error.message:"Falha na transcrição local"});}
};
