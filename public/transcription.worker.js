import{pipeline,env}from"https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

env.allowLocalModels=false;
const models={fast:"onnx-community/whisper-tiny",balanced:"onnx-community/whisper-base",accurate:"onnx-community/whisper-small"};
const transcribers=new Map();
async function getTranscriber(quality){
 const selected=models[quality]||models.accurate;
 if(!transcribers.has(selected))transcribers.set(selected,pipeline("automatic-speech-recognition",selected,{
  device:("gpu" in navigator?"webgpu":"wasm"),
  dtype:("gpu" in navigator?"q4":"q8"),
  progress_callback:x=>self.postMessage({type:"progress",progress:(x.progress??0)>1?(x.progress??0)/100:(x.progress??0),status:x.status??"loading",file:x.file??""})
 }));
 return transcribers.get(selected);
}
self.onmessage=async e=>{
 try{
  self.postMessage({type:"status",message:"Carregando o modelo de transcrição…"});
  const pipe=await getTranscriber(e.data.quality);
  self.postMessage({type:"status",message:"Transcrevendo o áudio no aparelho…"});
  const out=await pipe(e.data.audio,{language:"portuguese",task:"transcribe",chunk_length_s:30,stride_length_s:6,return_timestamps:false});
  self.postMessage({type:"complete",text:Array.isArray(out)?out.map(x=>x.text).join(" "):out.text||""});
 }catch(error){self.postMessage({type:"error",message:error instanceof Error?error.message:"Falha na transcrição local"});}
};
