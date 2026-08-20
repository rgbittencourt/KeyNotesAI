type Progress=(message:string,percent:number)=>void;

async function findFrame(blob:Blob,approx:number){
 const end=Math.min(blob.size,approx+131072),bytes=new Uint8Array(await blob.slice(approx,end).arrayBuffer());
 for(let i=0;i<bytes.length-1;i++)if(bytes[i]===0xff&&(bytes[i+1]&0xe0)===0xe0&&((bytes[i+1]>>1)&3)!==0)return approx+i;
 return approx;
}
async function splitAudio(blob:Blob){
 if(!/mpeg|mp3/i.test(blob.type)||blob.size<6_000_000)return[blob];
 const target=3_000_000,bounds=[0];
 for(let at=target;at<blob.size;at+=target)bounds.push(await findFrame(blob,at));
 bounds.push(blob.size);
 return bounds.slice(0,-1).map((start,i)=>blob.slice(start,bounds[i+1],"audio/mpeg"));
}
async function decode(chunk:Blob){
 const ctx=new AudioContext();
 try{const decoded=await ctx.decodeAudioData(await chunk.arrayBuffer()),offline=new OfflineAudioContext(1,Math.max(1,Math.ceil(decoded.duration*16000)),16000),source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();const rendered=await offline.startRendering();return rendered.getChannelData(0).slice();}
 finally{await ctx.close();}
}
function transcribeChunk(worker:Worker,audio:Float32Array,onProgress:Progress,chunk:number,total:number){return new Promise<string>((resolve,reject)=>{worker.onmessage=e=>{const m=e.data;if(m.type==="progress")onProgress("Baixando o modelo Whisper local…",Math.min(35,Math.round((m.progress||0)*35)));if(m.type==="status"&&m.message.includes("Transcrevendo"))onProgress(`Transcrevendo parte ${chunk} de ${total}…`,35+Math.round(((chunk-1)/total)*65));if(m.type==="complete")resolve((m.text||"").trim());if(m.type==="error")reject(new Error(m.message));};worker.postMessage({audio},[audio.buffer]);});}

export async function transcribeAudioInChunks(blob:Blob,onProgress:Progress){
 const chunks=await splitAudio(blob),worker=new Worker("/transcription.worker.js",{type:"module"}),texts:string[]=[];
 try{for(let i=0;i<chunks.length;i++){onProgress(`Preparando parte ${i+1} de ${chunks.length}…`,Math.round((i/chunks.length)*25));const audio=await decode(chunks[i]);texts.push(await transcribeChunk(worker,audio,onProgress,i+1,chunks.length));onProgress(`Parte ${i+1} de ${chunks.length} concluída`,Math.round(((i+1)/chunks.length)*100));}return texts.filter(Boolean).join("\n\n");}
 finally{worker.terminate();}
}
