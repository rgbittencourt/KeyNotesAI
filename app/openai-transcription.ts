export async function transcribeAudioWithOpenAI(blob:Blob){
 const data=new FormData();
 data.set("audio",blob,"reuniao.webm");
 const response=await fetch("/api/transcribe-meeting",{method:"POST",body:data});
 const body=await response.json().catch(()=>({error:"O serviço retornou uma resposta inválida."}))as{text?:string;error?:string};
 if(!response.ok||!body.text)throw new Error(body.error||"Não foi possível transcrever pela OpenAI.");
 return body.text;
}
