"use client";
import {useEffect,useState} from "react";

export default function DriveDocumentPage(){
  const [url,setUrl]=useState(""),[mime,setMime]=useState(""),[error,setError]=useState("");
  const [name,setName]=useState("Documento"),[meeting,setMeeting]=useState("Reunião");
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search),controller=new AbortController();let objectUrl="";
    const fileName=params.get("name")||"Documento",meetingName=params.get("meeting")||"Reunião";
    setName(fileName);setMeeting(meetingName);document.title=`${fileName} — KeyNotesAI`;
    fetch(`/api/drive/file?${params}`,{signal:controller.signal,cache:"no-store"}).then(async response=>{
      if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||"Não foi possível abrir o documento.")}
      const blob=await response.blob();if(controller.signal.aborted)return;
      objectUrl=URL.createObjectURL(blob);setMime(blob.type.split(";")[0]);setUrl(objectUrl);
    }).catch(issue=>{if(!controller.signal.aborted)setError(issue instanceof Error?issue.message:"Não foi possível abrir o documento.")});
    return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)};
  },[]);
  return <main className="drive-reader-page">
    <header className="drive-reader-header">
      <div className="drive-reader-brand"><img src="/keynotesai-logo.png" alt=""/><span><b>KeyNotes<span>AI</span></b><small>INTELIGÊNCIA PARA REUNIÕES</small></span></div>
      <div className="drive-reader-title"><small>{meeting}</small><strong>{name}</strong></div>
      <div className="drive-reader-actions">{url&&<a href={url} download={name}>Baixar arquivo ↓</a>}<button onClick={()=>window.close()}>Fechar ×</button></div>
    </header>
    <section className="drive-reader-content">
      {error?<div className="drive-reader-message error" role="alert"><strong>Não foi possível abrir o documento</strong><p>{error}</p></div>:!url?<div className="drive-reader-message" role="status"><span>◇</span><strong>Carregando documento…</strong></div>:mime==="application/pdf"?<iframe title={name} src={url}/>:mime.startsWith("audio/")?<audio controls src={url}/>:mime.startsWith("video/")?<video controls src={url}/>:mime.startsWith("image/")?<img alt={name} src={url}/>:<div className="drive-reader-message"><strong>Pré-visualização indisponível</strong><p>Use o botão “Baixar arquivo” para abrir este formato.</p></div>}
    </section>
  </main>;
}
