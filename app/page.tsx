"use client";
import { useState } from "react";

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

function FeatureView({ active, notify }: { active: string; notify: (message: string) => void }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [catchUp, setCatchUp] = useState(false);
  const [synced, setSynced] = useState(false);
  const ask = () => { if (!question.trim()) return; setAnswer("Sim. O cliente aprovou o orçamento de R$ 48 mil, condicionado ao envio do cronograma revisado até 22 de agosto. A decisão foi registrada aos 32:14."); setQuestion(""); };

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
  const [toast, setToast] = useState("");
  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(""), 2600); }
  if (!loggedIn) return (
    <main className="cover-page">
      <section className="cover-brand-panel">
        <div className="cover-institution"><div className="ifsc-plate"><img src="/ifsc-logo.png" alt="Instituto Federal de Santa Catarina, Câmpus Florianópolis-Continente" /></div><p>CÂMPUS FLORIANÓPOLIS-CONTINENTE</p></div>
        <div className="cover-message"><p className="cover-kicker">INTELIGÊNCIA PARA REUNIÕES</p><h1>Conversas mais<br/>produtivas.</h1><h2>Decisões mais<br/>claras.</h2><p className="cover-copy">Gravações, atas, decisões e próximos passos reunidos em um ambiente inteligente e seguro.</p></div>
        <div className="cover-maker"><small>DESENVOLVIDO PELO</small><div><img src="/inovalab-mark.png" alt=""/><strong>INOVALAB</strong></div><p>Laboratório de Inovação e Mídias Digitais</p></div>
      </section>
      <section className="cover-access-panel">
        <div className="access-wrap">
          <div className="cover-app-mark"><img src="/inovalab-mark.png" alt=""/></div><p className="access-kicker">KEYNOTESAI</p><h2>Acesse sua conta</h2><p className="access-subtitle">Entre com sua identidade institucional para continuar.</p>
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
        <div className="brand"><img src="/inovalab-mark.png" alt="" /><div><strong>KeyNotes<span>AI</span></strong><small>Meeting intelligence</small></div></div>
        <nav aria-label="Navegação principal">
          {[['◈','Visão geral'],['▷','Reuniões'],['✓','Ações'],['⊙','Decisões'],['⌕','Pergunte à IA']].map(([icon, label]) => <button key={label} className={active === label ? "active" : ""} onClick={() => { setActive(label); notify(`${label} selecionado`); }}><span>{icon}</span>{label}</button>)}
        </nav>
        <div className="sidebar-bottom"><p>INTEGRAÇÕES</p><button onClick={() => notify("Configuração do Trello aberta")}><span className="trello-mini">T</span><span>Trello<small>Conectado</small></span><i>•••</i></button><div className="user"><span>RB</span><div><strong>Rogério Bittencourt</strong><small>Administrador</small></div></div></div>
      </aside>
      <section className="workspace">
        <header><button className="mobile-brand" aria-label="Abrir menu"><img src="/inovalab-mark.png" alt="" /></button><div className="search"><span>⌕</span><input aria-label="Buscar" placeholder="Buscar reuniões, decisões ou tarefas..." /><kbd>Ctrl K</kbd></div><div className="header-actions"><button aria-label="Ajuda">?</button><button aria-label="Notificações">○<i /></button><span className="avatar">RB</span></div></header>
        <div className="content">
          {active !== "Visão geral" ? <FeatureView active={active} notify={notify} /> : <><section className="welcome"><div><p className="eyebrow">QUINTA-FEIRA, 20 DE AGOSTO</p><h1>Bom dia, Rogério.</h1><p>Você foca na reunião, a IA cuida do resto.</p></div><button className={`record ${recording ? "recording" : ""}`} onClick={() => { setRecording(!recording); notify(recording ? "Gravação pausada" : "Gravação iniciada"); }}><i />{recording ? "Pausar gravação" : "Gravar nova reunião"}</button></section>
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
      </section>{toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
