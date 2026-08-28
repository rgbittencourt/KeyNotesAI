"use client";
import { useCallback, useEffect, useState } from "react";
type User = {
  email: string;
  name: string | null;
  role: "admin" | "user";
  status: "active" | "disabled";
  monthlyLimit: number;
  used: number;
};
type AdminMeeting={id:string;ownerEmail:string;name:string;createdAt:string;updatedAt:string};
export default function AdminPanel({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [users, setUsers] = useState<User[]>([]),
    [meetings,setMeetings]=useState<AdminMeeting[]>([]),
    [meetingOwners,setMeetingOwners]=useState<Record<string,string>>({}),
    [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [limit, setLimit] = useState(50),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const [r,mr]=await Promise.all([fetch("/api/admin/users"),fetch("/api/admin/meetings")]),b = await r.json(),mb=await mr.json()as{meetings?:AdminMeeting[]};
    if (r.ok) setUsers(b.users);
    else notify(b.error || "Não foi possível carregar usuários");
    setLoading(false);
    if(mr.ok){setMeetings(mb.meetings||[]);setMeetingOwners(Object.fromEntries((mb.meetings||[]).map(meeting=>[`${meeting.ownerEmail}:${meeting.id}`,meeting.ownerEmail])))}
  }, [notify]);
  useEffect(() => {
    void load();
  }, [load]);
  async function create() {
    const r = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, name, monthlyLimit: limit }),
      }),
      b = await r.json();
    if (!r.ok) return notify(b.error);
    setEmail("");
    setName("");
    notify("Usuário autorizado");
    await load();
  }
  async function update(user: User, patch: Partial<User>) {
    const next = { ...user, ...patch };
    const r = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      }),
      b = await r.json();
    if (!r.ok) return notify(b.error);
    notify("Usuário atualizado");
    await load();
  }
  async function remove(user: User) {
    if (!confirm(`Excluir o acesso de ${user.email}?`)) return;
    const r = await fetch(
        `/api/admin/users?email=${encodeURIComponent(user.email)}`,
        { method: "DELETE" },
      ),
      b = await r.json();
    if (!r.ok) return notify(b.error);
    notify("Usuário excluído");
    await load();
  }
  async function impersonate(user:User){
    const response=await fetch("/api/admin/impersonation",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:user.email})}),body=await response.json()as{error?:string};
    if(!response.ok)return notify(body.error||"Não foi possível visualizar como este usuário");
    location.reload();
  }
  async function transferMeeting(meeting:AdminMeeting){
    const key=`${meeting.ownerEmail}:${meeting.id}`,toEmail=meetingOwners[key];if(!toEmail||toEmail===meeting.ownerEmail)return notify("Selecione um novo proprietário");
    const target=users.find(user=>user.email===toEmail);if(!confirm(`Transferir “${meeting.name}” e todos os seus dados de ${meeting.ownerEmail} para ${target?.name||toEmail}?`))return;
    const response=await fetch("/api/admin/meetings",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({meetingId:meeting.id,fromEmail:meeting.ownerEmail,toEmail})}),body=await response.json()as{error?:string};
    if(!response.ok)return notify(body.error||"Não foi possível transferir a reunião");notify("Reunião e todos os vínculos transferidos");await load();
  }
  return (
    <section className="feature-page">
      <div className="feature-title">
        <div>
          <p className="eyebrow">ADMINISTRAÇÃO</p>
          <h1>Usuários e limites</h1>
          <p>
            Cada operação corresponde a uma transcrição pela OpenAI ou à geração
            de documentos.
          </p>
        </div>
      </div>
      <article className="card admin-create">
        <div>
          <strong>Autorizar novo usuário</strong>
          <small>
            O usuário entrará com a conta ChatGPT vinculada a este e-mail.
          </small>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="usuario@ifsc.edu.br"
          type="email"
        />
        <label>
          <span>Operações/mês</span>
          <input
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            type="number"
            min="0"
            max="10000"
          />
        </label>
        <button onClick={create} disabled={!email.includes("@")}>
          Cadastrar usuário
        </button>
      </article>
      <article className="card admin-users">
        <div className="admin-users-head">
          <span>USUÁRIO</span>
          <span>USO MENSAL</span>
          <span>LIMITE</span>
          <span>STATUS</span>
          <span>AÇÕES</span>
        </div>
        {loading ? (
          <div className="admin-empty">Carregando usuários…</div>
        ) : (
          users.map((user) => (
            <div className="admin-user" key={user.email}>
              <div>
                <strong>{user.name || user.email}</strong>
                <small>
                  {user.email} ·{" "}
                  {user.role === "admin" ? "Administrador" : "Usuário"}
                </small>
              </div>
              <span>{user.used} operações</span>
              <input
                type="number"
                min="0"
                max="10000"
                value={user.monthlyLimit}
                onChange={(e) =>
                  setUsers((rows) =>
                    rows.map((x) =>
                      x.email === user.email
                        ? { ...x, monthlyLimit: Number(e.target.value) }
                        : x,
                    ),
                  )
                }
              />
              <button
                className={user.status}
                onClick={() =>
                  update(user, {
                    status: user.status === "active" ? "disabled" : "active",
                  })
                }
              >
                {user.status === "active" ? "Ativo" : "Desativado"}
              </button>
              <div>
                {user.role!=="admin"&&<button onClick={()=>void impersonate(user)}>Visualizar como</button>}
                <button
                  onClick={() =>
                    update(user, { monthlyLimit: user.monthlyLimit })
                  }
                >
                  Salvar
                </button>
                <button className="danger" onClick={() => remove(user)}>
                  Excluir
                </button>
              </div>
            </div>
          ))
        )}
      </article>
      <article className="card admin-meetings">
        <div className="admin-meetings-title"><div><strong>Propriedade das reuniões</strong><small>Transfira a reunião completa, incluindo documentos, ações, decisões, pendências, bloqueios, Drive e Trello.</small></div><span>{meetings.length} reunião(ões)</span></div>
        {loading?<div className="admin-empty">Carregando reuniões…</div>:meetings.length===0?<div className="admin-empty">Nenhuma reunião armazenada.</div>:meetings.map(meeting=>{const key=`${meeting.ownerEmail}:${meeting.id}`;return <div className="admin-meeting" key={key}><div><strong>{meeting.name}</strong><small>{meeting.createdAt||"Data não informada"} · Proprietário atual: {users.find(user=>user.email===meeting.ownerEmail)?.name||meeting.ownerEmail}</small></div><select value={meetingOwners[key]||meeting.ownerEmail} onChange={event=>setMeetingOwners(values=>({...values,[key]:event.target.value}))}>{users.filter(user=>user.status==="active").map(user=><option key={user.email} value={user.email}>{user.name||user.email}{user.email===meeting.ownerEmail?" · atual":""}</option>)}</select><button disabled={!meetingOwners[key]||meetingOwners[key]===meeting.ownerEmail} onClick={()=>void transferMeeting(meeting)}>Transferir tudo</button></div>})}
      </article>
    </section>
  );
}
