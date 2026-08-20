"use client";
import { useEffect, useRef, useState } from "react";

type DeviceRecording = { id: number; name: string; createdAt: string; duration: string; size: string; url: string };

function openRecordingsDb(): Promise<IDBDatabase> { return new Promise((resolve,reject)=>{ const req=indexedDB.open("keynotesai-local",1); req.onupgradeneeded=()=>req.result.createObjectStore("recordings",{keyPath:"id"}); req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); }); }
async function persistRecording(record: Omit<DeviceRecording,"url"> & { blob: Blob }) { const db=await openRecordingsDb(); const tx=db.transaction("recordings","readwrite"); tx.objectStore("recordings").put(record); }
async function loadRecordings(): Promise<DeviceRecording[]> { const db=await openRecordingsDb(); return new Promise((resolve,reject)=>{ const req=db.transaction("recordings").objectStore("recordings").getAll(); req.onsuccess=()=>resolve(req.result.map((r)=>({...r,url:URL.createObjectURL(r.blob)})).reverse()); req.onerror=()=>reject(req.error); }); }

const meetings = [
  { time: "09:00", title: "Planejamento • Sprint 18", meta: "Produto · 8 participantes", tone: "live", label: "Em 12 min" },
  { time: "14:30", title: "Alinhamento com INOVALAB", meta: "Parcerias · 5 participantes", tone: "soon", label: "Hoje" },
  { time: "16:00", title: "Revisão da experiência PWA", meta: "Design · 4 participantes", tone: "later", label: "Hoje" },
];
const actions = [
  { task: "Validar fluxo de onboarding", person: "Ana Lima", initials: "AL", due: "22 ago", priority: "Alta" },
  { task: "Publicar protótipo navegável", person: "Rafael Melo", initials: "RM", due: "25 ago", priority: "Média" },
  { task: "Revisar integração com Trello", person: "João Silva", initials: "JS", due: "28 ago", priority: "Baixa" },
];
const recent = [
  { title: "Kick-off • KeyNotesAI", date: "Ontem, 15:00", duration: "48 min", tag: "Produto", color: "#b98b4e" },
  { title: "Descoberta com usuários", date: "18 ago, 10:30", duration: "1h 12 min", tag: "Pesquisa", color: "#3f765e" },
  { title: "Checkpoint técnico", date: "16 ago, 16:00", duration: "36 min", tag: "Tecnologia", color: "#637183" },
];

function FeatureView({ active, notify, recordings }: { active: string; notify: (message: string) => void; recordings: DeviceRecording[] }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [catchUp, setCatchUp] = useState(false);
  const [synced, setSynced] = useState(false);
  const ask = () => { if (!question.trim()) return; setAnswer("Sim. O cliente aprovou o orçamento de R$ 48 mil, condicionado ao envio do cronograma revisado até 22 de agosto. A decisão foi registrada aos 32:14."); setQuestion(""); };
  const downloadDocument = (name: string, content: string) => { const url=URL.createObjectURL(new Blob([content],{type:"text/plain;charset=utf-8"})); const a=document.createElement("a"); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); notify("Documento baixado"); };

  if (active === "Arquivos") return <section className="feature-page"><div className="feature-title"><div><p className="eyebrow">BIBLIOTECA DA REUNIÃO</p><h1>Gravações e documentos</h1><p>Tudo o que foi capturado ou gerado, organizado em um só lugar.</p></div></div><div className="library-grid"><article className="card library-card"><div className="card-head"><div><p className="eyebrow">NO APARELHO</p><h2>Gravações</h2></div><span>{recordings.length} arquivo(s)</span></div>{recordings.length===0?<div className="empty-library"><span>◉</span><strong>Nenhuma gravação local</strong><p>Use “Gravar nova reunião” na Visão geral e permita o acesso ao microfone.</p></div>:recordings.map(r=><div className="recording-row" key={r.id}><span>▶</span><div><strong>{r.name}</strong><small>{r.createdAt} · {r.duration} · {r.size}</small><audio controls src={r.url}/></div><a href={r.url} download={`${r.name}.webm`}>↓ Baixar</a></div>)}</article><article className="card library-card"><div className="card-head"><div><p className="eyebrow">GERADOS PELA IA</p><h2>Documentos</h2></div><span>4 arquivos</span></div>{[['Ata da reunião','Resumo, participantes, pauta e encaminhamentos','ata-keynotesai.txt'],['Resumo executivo','Leitura rápida para gestores','resumo-executivo.txt'],['Matriz de ações','Responsáveis, prazos e prioridades','matriz-de-acoes.txt'],['Decisões e bloqueios','Registro consolidado das definições','decisoes-e-bloqueios.txt']].map(d=><div className="document-row" key={d[0]}><span>☷</span><div><strong>{d[0]}</strong><small>{d[1]}</small></div><button onClick={()=>downloadDocument(d[2],`${d[0]}\n\nReunião: Planejamento • Sprint 18\nData: 20 de agosto de 2026\n\n${d[1]}\n\nDecisões: priorizar o onboarding e revisar a integração com Trello.\nAções: validar onboarding, publicar protótipo e enviar cronograma revisado.`)}>Abrir e baixar →</button></div>)}</article></div></section>;

  if (active === "Reuniões") return <section className="feature-page">
    <div className="feature-title"><div><p className="eyebrow">REUNIÃO EM ANDAMENTO</p><h1>Planejamento • Sprint 18</h1><p>20 de agosto · 09:00 · 8 participantes</p></div><div className="live-pill"><i /> AO VIVO · 24:18</div></div>
    <div className="meeting-room-grid">
      <article className="card live-agenda"><div className="card-head"><div><p className="eyebrow">LIVE PACE KEEPER</p><h2>Pauta dinâmica</h2></div><span>58% concluída</span></div><div className="pace"><i style={{width:"58%"}} /></div>
        {[['Revisão da sprint anterior','Concluído','8 min'],['Prioridades da Sprint 18','Em discussão','16 / 20 min'],['Riscos e dependências','A seguir','10 min'],['Distribuição de tarefas','Pendente','12 min']].map((x,i)=><div className={`agenda-topic ${i===1?'current':''}`} key={x[0]}><span>{i<1?'✓':i+1}</span><div><strong>{x[0]}</strong><small>{x[1]}</small></div><time>{x[2]}</time></div>)}
        <div className="pace-alert"><span>!</span><div><strong>Atenção ao tempo</strong><p>Este tópico consumiu 80% do tempo previsto.</p></div></div>
      </article>
      <article className="card transcript"><div className="card-head"><div><p className="eyebrow">TRANSCRIÇÃO AO VIVO</p><h2>Conversa</h2></div><span className="listening"><i/> Ouvindo</span></div>
        <div className="speech"><span className="speaker green-bg">AL</span><div><strong>Ana Lima <time>09:21</time></strong><p>Precisamos validar o onboarding com cinco usuários antes de fechar a experiência.</p></div></div><div className="speech"><span className="speaker gold-bg">RM</span><div><strong>Rafael Melo <time>09:22</time></strong><p>Consigo deixar o protótipo navegável pronto até segunda-feira.</p><em>Possível ação identificada</em></div></div><div className="speech"><span className="speaker slate-bg">JS</span><div><strong>João Silva <time>09:23</time></strong><p>Vou revisar a estrutura dos cards e a autenticação com o Trello.</p></div></div>
        <button className="catchup" onClick={()=>setCatchUp(!catchUp)}>Cheguei atrasado · Resumir o que perdi</button>{catchUp&&<div className="catchup-box"><strong>Resumo dos primeiros 24 minutos</strong><ul><li>A Sprint 17 foi concluída com 92% das entregas.</li><li>Onboarding e Trello são as prioridades da Sprint 18.</li><li>Rafael entregará o protótipo até segunda-feira.</li></ul></div>}
      </article>
    </div>
  </section>;

  if (active === "Ações") return <section className="feature-page"><div className="feature-title"><div><p className="eyebrow">ACTION MATRIX</p><h1>Ações e prazos</h1><p>Responsabilidades extraídas automaticamente das reuniões.</p></div><button className="primary-btn" onClick={()=>{setSynced(true);notify("Ações exportadas para o Trello")}}>{synced?'✓ Sincronizado':'Exportar para o Trello'}</button></div><article className="card matrix-full"><div className="matrix-head"><span>AÇÃO</span><span>RESPONSÁVEL</span><span>REUNIÃO</span><span>PRAZO</span><span>PRIORIDADE</span></div>{actions.concat([{task:'Enviar cronograma revisado',person:'Marina Costa',initials:'MC',due:'22 ago',priority:'Alta'}]).map((a,i)=><div className="matrix-row" key={a.task}><button aria-label="Concluir" onClick={()=>notify('Ação concluída')}/><strong>{a.task}</strong><span className="person-chip"><i>{a.initials}</i>{a.person}</span><span>{i===3?'Reunião com cliente':'Planejamento • Sprint 18'}</span><time>{a.due}</time><em className={a.priority.toLowerCase().replace('mé','me')}>{a.priority}</em></div>)}</article></section>;

  if (active === "Decisões") return <section className="feature-page"><div className="feature-title"><div><p className="eyebrow">DECISION & BLOCKERS LOG</p><h1>Decisões e bloqueios</h1><p>Clareza executiva sem precisar reler toda a transcrição.</p></div><button className="ghost-btn" onClick={()=>notify('Relatório copiado')}>Copiar relatório</button></div><div className="decision-grid"><article className="card decision-column accepted"><div className="decision-heading"><span>✓</span><div><small>3 REGISTROS</small><h2>Decisões tomadas</h2></div></div><div><strong>Priorizar o novo onboarding</strong><p>A equipe aprovou a nova experiência como principal entrega da Sprint 18.</p><small>Planejamento · hoje, 09:18</small></div><div><strong>Orçamento aprovado</strong><p>O cliente aprovou R$ 48 mil mediante cronograma atualizado.</p><small>Reunião com cliente · ontem</small></div></article><article className="card decision-column pending"><div className="decision-heading"><span>?</span><div><small>2 REGISTROS</small><h2>Pontos pendentes</h2></div></div><div><strong>Definir ferramenta de analytics</strong><p>Amplitude e PostHog permanecem em avaliação.</p><small>Responsável: Ana Lima</small></div><div><strong>Confirmar data do piloto</strong><p>Depende da disponibilidade de cinco usuários.</p><small>Prazo: 25 de agosto</small></div></article><article className="card decision-column blocked"><div className="decision-heading"><span>!</span><div><small>1 REGISTRO</small><h2>Objeções e bloqueios</h2></div></div><div><strong>Autenticação do Trello</strong><p>O ambiente de homologação ainda aguarda credenciais administrativas.</p><small>Impacto: integração bloqueada</small></div></article></div></section>;

  return <section className="feature-page qa-page"><div className="feature-title"><div><p className="eyebrow">PERGUNTE À REUNIÃO</p><h1>Converse com seu histórico.</h1><p>Respostas fundamentadas nas transcrições, atas e decisões.</p></div></div><div className="qa-grid"><aside className="card meeting-picker"><label>REUNIÃO SELECIONADA</label><button><span className="doc">☷</span><div><strong>Kick-off • KeyNotesAI</strong><small>Ontem · 48 min</small></div><b>⌄</b></button><p>SUGESTÕES</p>{['Quais decisões foram tomadas?','Quem ficou responsável por cada ação?','Quais são os principais riscos?'].map(x=><button className="suggestion" key={x} onClick={()=>setQuestion(x)}>{x}</button>)}</aside><article className="card chat-panel"><div className="chat-empty"><span>✦</span><h2>Pergunte qualquer coisa</h2><p>Eu encontro a resposta e mostro exatamente onde ela apareceu na reunião.</p></div>{answer&&<div className="ai-answer"><span>✦</span><div><p>{answer}</p><button onClick={()=>notify('Trecho da transcrição aberto')}>Ver trecho · 32:14 →</button></div></div>}<div className="ask-box"><input value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>e.key==='Enter'&&ask()} placeholder="Ex.: O cliente aprovou o orçamento?" aria-label="Pergunta"/><button onClick={ask} aria-label="Enviar pergunta">↑</button></div></article></div></section>;
}

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [active, setActive] = useState("Visão geral");
  const [recording, setRecording] = useState(false);
  const [requestingMic, setRequestingMic] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [deviceRecordings, setDeviceRecordings] = useState<DeviceRecording[]>([]);
  const recorderRef = useRef<MediaRecorder|null>(null);
  const streamRef = useRef<MediaStream|null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const audioImportRef = useRef<HTMLInputElement|null>(null);
  const [recordingIssue, setRecordingIssue] = useState("");
  const [toast, setToast] = useState("");
  const [headerPanel, setHeaderPanel] = useState<"help"|"notifications"|"profile"|null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(""), 2600); }
  function runSearch(){ const q=searchTerm.toLowerCase(); if(q.includes("ata")||q.includes("arquivo")||q.includes("grava"))setActive("Arquivos"); else if(q.includes("aç")||q.includes("tarefa"))setActive("Ações"); else if(q.includes("decis")||q.includes("bloque"))setActive("Decisões"); else if(q.includes("pergunta")||q.includes("cliente"))setActive("Pergunte à IA"); else setActive("Reuniões"); setHeaderPanel(null); }
  useEffect(()=>{ loadRecordings().then(setDeviceRecordings).catch(()=>{}); return()=>deviceRecordings.forEach(r=>URL.revokeObjectURL(r.url)); },[]);
  useEffect(()=>{ if(!recording)return; const timer=window.setInterval(()=>setRecordingSeconds(Math.floor((Date.now()-startedAtRef.current)/1000)),1000); return()=>window.clearInterval(timer); },[recording]);
  async function toggleRecording(){
    if(recording){ recorderRef.current?.stop(); streamRef.current?.getTracks().forEach(t=>t.stop()); setRecording(false); return; }
    if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined"){
      setRecordingIssue("Este navegador não oferece gravação direta. Abra o endereço no Chrome completo ou importe um áudio já gravado.");
      return;
    }
    setRequestingMic(true);
    try{ const stream=await navigator.mediaDevices.getUserMedia({audio:true}); const recorder=new MediaRecorder(stream); chunksRef.current=[]; startedAtRef.current=Date.now(); setRecordingSeconds(0); setRecordingIssue(""); recorder.ondataavailable=e=>{if(e.data.size)chunksRef.current.push(e.data)}; recorder.onstop=async()=>{const blob=new Blob(chunksRef.current,{type:recorder.mimeType||"audio/webm"}); const seconds=Math.max(1,Math.round((Date.now()-startedAtRef.current)/1000)); const base={id:Date.now(),name:`Reunião gravada · ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`,createdAt:new Date().toLocaleDateString('pt-BR'),duration:`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`,size:`${(blob.size/1024/1024).toFixed(1)} MB`}; await persistRecording({...base,blob}); setDeviceRecordings(r=>[{...base,url:URL.createObjectURL(blob)},...r]); setActive("Arquivos"); notify("Gravação salva no aparelho");}; recorder.start(1000); recorderRef.current=recorder; streamRef.current=stream; setRecording(true); notify("Gravação iniciada pelo microfone"); }catch(error){ const reason=error instanceof DOMException&&error.name==="NotAllowedError"?"O navegador recusou o microfone. Confira a permissão e se outro aplicativo está usando o dispositivo.":"Não foi possível iniciar o microfone neste navegador."; setRecordingIssue(reason); }finally{setRequestingMic(false);}
  }
  async function importAudio(file?: File){
    if(!file)return; const base={id:Date.now(),name:file.name.replace(/\.[^.]+$/,"")||"Reunião importada",createdAt:new Date().toLocaleDateString("pt-BR"),duration:"áudio importado",size:`${(file.size/1024/1024).toFixed(1)} MB`}; await persistRecording({...base,blob:file}); setDeviceRecordings(r=>[{...base,url:URL.createObjectURL(file)},...r]); setRecordingIssue(""); setActive("Arquivos"); notify("Áudio importado e salvo no aparelho");
  }
  if (!loggedIn) return (
    <main className="cover-page">
      <section className="cover-brand-panel">
        <div className="cover-institution"><div className="ifsc-plate"><img src="/ifsc-continente-branco.png" alt="Instituto Federal de Santa Catarina, Câmpus Florianópolis-Continente" /></div></div>
        <div className="cover-message"><p className="cover-kicker">INTELIGÊNCIA PARA REUNIÕES</p><h1>Conversas mais<br/>produtivas.</h1><h2>Decisões mais<br/>claras.</h2><p className="cover-copy">Gravações, atas, decisões e próximos passos reunidos em um ambiente inteligente e seguro.</p></div>
        <div className="cover-maker"><small>DESENVOLVIDO PELO</small><div><img src="/inovalab-mark.png" alt=""/><strong>INOVALAB</strong></div><p>Laboratório de Inovação e Mídias Digitais</p></div>
      </section>
      <section className="cover-access-panel">
        <div className="access-wrap">
          <div className="cover-app-mark"><img src="/keynotesai-logo.png" alt="Símbolo do KeyNotesAI"/></div><p className="access-kicker">KEYNOTESAI</p><h2>Acesse sua conta</h2><p className="access-subtitle">Entre com sua identidade institucional para continuar.</p>
          <button className="login-button" onClick={()=>setLoggedIn(true)}><span className="login-symbol">○</span><strong>Entrar no KeyNotesAI</strong><span>→</span></button><p className="secure-note">◇ Acesso restrito a usuários autorizados.</p>
          <div className="access-divider"/><h3>O que você encontrará</h3>
          <div className="access-benefits"><div><span>IA</span><p><strong>Reuniões inteligentes</strong><small>Gravação, transcrição e resumos</small></p></div><div><span>AM</span><p><strong>Ações e decisões</strong><small>Responsáveis, prazos e bloqueios claros</small></p></div><div><span>TR</span><p><strong>Integração com Trello</strong><small>Cada reunião organizada em um card</small></p></div></div>
        </div>
        <p className="access-help">Problemas para acessar? Procure a administração do sistema.</p>
      </section>
    </main>
  );
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><img src="/keynotesai-logo.png" alt="" /><div><strong>KeyNotes<span>AI</span></strong><small>Meeting intelligence</small></div></div>
        <nav aria-label="Navegação principal">
          {[['◈','Visão geral'],['▷','Reuniões'],['◉','Arquivos'],['✓','Ações'],['⊙','Decisões'],['⌕','Pergunte à IA']].map(([icon, label]) => <button key={label} className={active === label ? "active" : ""} onClick={() => setActive(label)}><span>{icon}</span>{label}</button>)}
        </nav>
        <div className="sidebar-bottom"><p>INTEGRAÇÕES</p><button onClick={() => notify("Configuração do Trello aberta")}><span className="trello-mini">T</span><span>Trello<small>Conectado</small></span><i>•••</i></button><div className="user"><span>RB</span><div><strong>Rogério Bittencourt</strong><small>Administrador</small></div></div></div>
      </aside>
      <section className="workspace">
        <header><button className="mobile-brand" aria-label="Abrir menu" onClick={()=>notify("Acesse os módulos pela navegação")}><img src="/keynotesai-logo.png" alt="" /></button><div className="search"><span>⌕</span><input aria-label="Buscar" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} onKeyDown={e=>e.key==='Enter'&&runSearch()} placeholder="Buscar reuniões, decisões ou tarefas..." /><button aria-label="Executar busca" onClick={runSearch}>Buscar</button></div><div className="header-actions"><button aria-label="Ajuda" onClick={()=>setHeaderPanel(headerPanel==='help'?null:'help')}>?</button><button aria-label="Notificações" onClick={()=>setHeaderPanel(headerPanel==='notifications'?null:'notifications')}>○<i /></button><button className="avatar" aria-label="Perfil" onClick={()=>setHeaderPanel(headerPanel==='profile'?null:'profile')}>RB</button></div>{headerPanel&&<div className="header-popover">{headerPanel==='help'?<><strong>Central de ajuda</strong><p>Grave na Visão geral. Depois encontre áudio, ata e relatórios em Arquivos.</p><button onClick={()=>{setActive("Arquivos");setHeaderPanel(null)}}>Ir para Arquivos →</button></>:headerPanel==='notifications'?<><strong>Notificações</strong><p>3 ações vencem esta semana.</p><p>O Trello aguarda credenciais.</p><button onClick={()=>{setActive("Ações");setHeaderPanel(null)}}>Ver ações →</button></>:<><strong>Rogério Bittencourt</strong><p>Administrador · IFSC</p><button onClick={()=>setLoggedIn(false)}>Sair da conta</button></>}</div>}</header>
        <div className="content">
          {active !== "Visão geral" ? <FeatureView active={active} notify={notify} recordings={deviceRecordings} /> : <><section className="welcome"><div><p className="eyebrow">QUINTA-FEIRA, 20 DE AGOSTO</p><h1>Bom dia, Rogério.</h1><p>Você foca na reunião, a IA cuida do resto.</p></div><div className="record-actions"><button className={`record ${recording ? "recording" : ""}`} disabled={requestingMic} onClick={toggleRecording}><i />{requestingMic?"Solicitando microfone...":recording ? "Encerrar e salvar" : "Gravar nova reunião"}</button><button className="import-audio" onClick={()=>audioImportRef.current?.click()}>↑ Importar áudio</button><input ref={audioImportRef} type="file" accept="audio/*,.webm" hidden onChange={e=>{void importAudio(e.target.files?.[0]);e.currentTarget.value=""}}/></div></section>{recordingIssue&&<div className="recording-issue" role="alert"><span>!</span><div><strong>A gravação direta não iniciou</strong><p>{recordingIssue}</p></div><button onClick={()=>audioImportRef.current?.click()}>Importar áudio</button><button aria-label="Fechar aviso" onClick={()=>setRecordingIssue("")}>×</button></div>}
          <section className="hero-grid">
            <div className="agenda card"><div className="card-head"><div><p className="eyebrow">SUA AGENDA</p><h2>Próximas reuniões</h2></div><button onClick={() => notify("Calendário aberto")}>Ver calendário →</button></div><div className="meeting-list">{meetings.map((m, i) => <button className="meeting" key={m.title} onClick={() => notify(`Abrindo ${m.title}`)}><time>{m.time}</time><span className={`line ${m.tone}`} /><div><strong>{m.title}</strong><small>{m.meta}</small></div><em className={i === 0 ? "hot" : ""}>{m.label}</em><b>›</b></button>)}</div></div>
            <div className="trello-card card"><div className="trello-top"><span className="trello-logo">T</span><span>Integração ativa</span><i /></div><h2>Cada reunião,<br/>um card completo.</h2><p>Resumo, decisões, arquivos e ações sincronizados automaticamente no Trello.</p><div className="sync-status"><span>✓</span><div><strong>Sincronização em dia</strong><small>12 cards atualizados hoje</small></div></div><button onClick={() => notify("Abrindo quadro KeyNotesAI no Trello")}>Abrir quadro no Trello <span>↗</span></button></div>
          </section>
          <section className="metrics"><article><span className="metric-icon gold">✓</span><div><small>AÇÕES EM ABERTO</small><strong>12</strong><p><b>3</b> vencem esta semana</p></div></article><article><span className="metric-icon green">◇</span><div><small>REUNIÕES ESTE MÊS</small><strong>18</strong><p><b>+12%</b> vs. mês anterior</p></div></article><article><span className="metric-icon slate">◷</span><div><small>TEMPO ECONOMIZADO</small><strong>6h 40</strong><p>Com resumos automáticos</p></div></article></section>
          <section className="lower-grid">
            <div className="actions card"><div className="card-head"><div><p className="eyebrow">ACTION MATRIX</p><h2>Próximas entregas</h2></div><button onClick={() => notify("Todas as ações abertas")}>Ver todas →</button></div><div className="action-table">{actions.map(a => <div className="action-row" key={a.task}><button aria-label={`Concluir ${a.task}`} onClick={() => notify("Ação marcada como concluída")} /><div className="task"><strong>{a.task}</strong><small><span>{a.initials}</span>{a.person}</small></div><time>{a.due}</time><em className={a.priority.toLowerCase().replace('mé','me')}>{a.priority}</em></div>)}</div></div>
            <div className="recent card"><div className="card-head"><div><p className="eyebrow">HISTÓRICO</p><h2>Reuniões recentes</h2></div><button onClick={() => notify("Histórico completo aberto")}>Ver todas →</button></div>{recent.map(r => <button className="recent-row" key={r.title} onClick={() => notify(`Abrindo ${r.title}`)}><span className="doc">☷</span><div><strong>{r.title}</strong><small>{r.date} · {r.duration}</small></div><em style={{'--tag': r.color} as React.CSSProperties}>{r.tag}</em><b>›</b></button>)}</div>
          </section></>}
        </div>
        <footer><div><img src="/inovalab-logo.png" alt="INOVALAB IFSC Campus Continente"/><span></span><img src="/ifsc-logo.png" alt="Instituto Federal de Santa Catarina"/></div><p>KeyNotesAI · Tecnologia que transforma conversa em ação.</p></footer>
      </section>{recording&&<div className="recording-dock" role="status"><div className="recording-live"><i/><span><small>GRAVANDO NESTE APARELHO</small><strong>{String(Math.floor(recordingSeconds/60)).padStart(2,'0')}:{String(recordingSeconds%60).padStart(2,'0')}</strong></span></div><div className="sound-bars">{[1,2,3,4,5,6,7,8].map(n=><i key={n}/>)}</div><p>O áudio será salvo em <b>Arquivos</b> quando você encerrar.</p><button onClick={toggleRecording}><i/> Encerrar e salvar</button></div>}{toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
