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

export default function Home() {
  const [active, setActive] = useState("Visão geral");
  const [recording, setRecording] = useState(false);
  const [toast, setToast] = useState("");
  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(""), 2600); }
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
          <section className="welcome"><div><p className="eyebrow">QUINTA-FEIRA, 20 DE AGOSTO</p><h1>Bom dia, Rogério.</h1><p>Você foca na reunião, a IA cuida do resto.</p></div><button className={`record ${recording ? "recording" : ""}`} onClick={() => { setRecording(!recording); notify(recording ? "Gravação pausada" : "Gravação iniciada"); }}><i />{recording ? "Pausar gravação" : "Gravar nova reunião"}</button></section>
          <section className="hero-grid">
            <div className="agenda card"><div className="card-head"><div><p className="eyebrow">SUA AGENDA</p><h2>Próximas reuniões</h2></div><button onClick={() => notify("Calendário aberto")}>Ver calendário →</button></div><div className="meeting-list">{meetings.map((m, i) => <button className="meeting" key={m.title} onClick={() => notify(`Abrindo ${m.title}`)}><time>{m.time}</time><span className={`line ${m.tone}`} /><div><strong>{m.title}</strong><small>{m.meta}</small></div><em className={i === 0 ? "hot" : ""}>{m.label}</em><b>›</b></button>)}</div></div>
            <div className="trello-card card"><div className="trello-top"><span className="trello-logo">T</span><span>Integração ativa</span><i /></div><h2>Cada reunião,<br/>um card completo.</h2><p>Resumo, decisões, arquivos e ações sincronizados automaticamente no Trello.</p><div className="sync-status"><span>✓</span><div><strong>Sincronização em dia</strong><small>12 cards atualizados hoje</small></div></div><button onClick={() => notify("Abrindo quadro KeyNotesAI no Trello")}>Abrir quadro no Trello <span>↗</span></button></div>
          </section>
          <section className="metrics"><article><span className="metric-icon gold">✓</span><div><small>AÇÕES EM ABERTO</small><strong>12</strong><p><b>3</b> vencem esta semana</p></div></article><article><span className="metric-icon green">◇</span><div><small>REUNIÕES ESTE MÊS</small><strong>18</strong><p><b>+12%</b> vs. mês anterior</p></div></article><article><span className="metric-icon slate">◷</span><div><small>TEMPO ECONOMIZADO</small><strong>6h 40</strong><p>Com resumos automáticos</p></div></article></section>
          <section className="lower-grid">
            <div className="actions card"><div className="card-head"><div><p className="eyebrow">ACTION MATRIX</p><h2>Próximas entregas</h2></div><button onClick={() => notify("Todas as ações abertas")}>Ver todas →</button></div><div className="action-table">{actions.map(a => <div className="action-row" key={a.task}><button aria-label={`Concluir ${a.task}`} onClick={() => notify("Ação marcada como concluída")} /><div className="task"><strong>{a.task}</strong><small><span>{a.initials}</span>{a.person}</small></div><time>{a.due}</time><em className={a.priority.toLowerCase().replace('mé','me')}>{a.priority}</em></div>)}</div></div>
            <div className="recent card"><div className="card-head"><div><p className="eyebrow">HISTÓRICO</p><h2>Reuniões recentes</h2></div><button onClick={() => notify("Histórico completo aberto")}>Ver todas →</button></div>{recent.map(r => <button className="recent-row" key={r.title} onClick={() => notify(`Abrindo ${r.title}`)}><span className="doc">☷</span><div><strong>{r.title}</strong><small>{r.date} · {r.duration}</small></div><em style={{'--tag': r.color} as React.CSSProperties}>{r.tag}</em><b>›</b></button>)}</div>
          </section>
        </div>
        <footer><div><img src="/inovalab-logo.png" alt="INOVALAB IFSC Campus Continente"/><span></span><img src="/ifsc-logo.png" alt="Instituto Federal de Santa Catarina"/></div><p>KeyNotesAI · Tecnologia que transforma conversa em ação.</p></footer>
      </section>{toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
