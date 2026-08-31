"use client";
import { useEffect, useState } from "react";
type Meeting = {id:number;name:string;ownerEmail?:string};
type Entry = {id:string;name:string;mimeType?:string};
const queryFor=(meeting:Meeting)=>new URLSearchParams({meetingId:String(meeting.id),owner:meeting.ownerEmail||""});
export function openDriveDocumentWindow(meeting:Meeting,file:Entry){
  const query=queryFor(meeting);query.set("id",file.id);query.set("name",file.name);query.set("meeting",meeting.name);
  window.open(`/drive-document?${query}`,"_blank","noopener,noreferrer");
}
export default function DriveLibrary({isAdmin,meeting:fixed}:{isAdmin:boolean;meeting?:Meeting}){
  const [meetings,setMeetings]=useState<Meeting[]>([]),[selected,setSelected]=useState("");
  const meeting=fixed||meetings.find(item=>`${item.ownerEmail}:${item.id}`===selected);
  const [folder,setFolder]=useState(""),[files,setFiles]=useState<Entry[]>([]),[parent,setParent]=useState<string|null>(null),[folderName,setFolderName]=useState("");
  const [revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{if(fixed)return;const controller=new AbortController();fetch("/api/meetings",{signal:controller.signal,cache:"no-store"}).then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.error);setMeetings(body.meetings||[])}).catch(e=>{if(!controller.signal.aborted)setError(e.message)});return()=>controller.abort()},[fixed]);
  useEffect(()=>{setFolder("");setFiles([]);setParent(null)},[meeting?.id,meeting?.ownerEmail]);
  useEffect(()=>{
    if(!meeting)return;
    const controller=new AbortController();setBusy(true);setError("");setFiles([]);
    void(async()=>{try{
      const all:Entry[]=[];let page="";
      do {const query=queryFor(meeting);query.set("folder",folder);query.set("page",page);
        const response=await fetch(`/api/drive/library?${query}`,{signal:controller.signal,cache:"no-store"});const result=await response.json();
        if(!response.ok)throw new Error(result.error||"Não foi possível abrir esta pasta.");
        all.push(...result.files);page=result.nextPageToken||"";
        if(!controller.signal.aborted){setParent(result.parentId);setFolderName(result.folder.name)}
      }while(page&&!controller.signal.aborted);
      if(!controller.signal.aborted)setFiles(all);
    }catch(issue){if(!controller.signal.aborted)setError(issue instanceof Error?issue.message:"Falha ao consultar documentos.")}
    finally{if(!controller.signal.aborted)setBusy(false)}})();return()=>controller.abort();
  },[meeting?.id,meeting?.ownerEmail,folder,revision]);
  return <section className="institutional-drive">
    <h2>Arquivos da reunião</h2><p>Somente a pasta da reunião selecionada. O acesso é validado pelo seu cadastro.</p>
    {!fixed&&<label>Reunião <select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Selecione a reunião</option>{meetings.map(item=><option key={`${item.ownerEmail}:${item.id}`} value={`${item.ownerEmail}:${item.id}`}>{item.name}</option>)}</select></label>}
    <div className="drive-library-toolbar">
      {meeting&&<button onClick={()=>setRevision(v=>v+1)} disabled={busy}>Atualizar lista de arquivos</button>}
      {parent&&<button onClick={()=>setFolder(parent)} disabled={busy}>← Voltar dentro da reunião</button>}
      {isAdmin&&<a href="/api/admin/drive/connect">Gerenciar conexão institucional</a>}
    </div>
    {error&&<p className="drive-library-error" role="alert">{error}</p>}{busy&&<p role="status">Consultando arquivos…</p>}
    {meeting&&!busy&&!error&&<article className="drive-library-list"><h3>{folderName}</h3>{files.length===0&&<p>Nenhum arquivo nesta pasta.</p>}{files.map(item=><div key={item.id} className="drive-library-row"><button onClick={()=>item.mimeType==="application/vnd.google-apps.folder"?setFolder(item.id):openDriveDocumentWindow(meeting,item)}>{item.name} {item.mimeType==="application/vnd.google-apps.folder"?"→":"↗"}</button></div>)}</article>}
  </section>;
}
