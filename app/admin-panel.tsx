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
type TrelloChoice={id:string;name:string};
export default function AdminPanel({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [users, setUsers] = useState<User[]>([]),
    [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [limit, setLimit] = useState(50),
    [trelloReady,setTrelloReady]=useState(false),
    [boards,setBoards]=useState<TrelloChoice[]>([]),
    [lists,setLists]=useState<TrelloChoice[]>([]),
    [boardId,setBoardId]=useState(""),
    [listId,setListId]=useState(""),
    [trelloLoading,setTrelloLoading]=useState(true),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/admin/users"),
      b = await r.json();
    if (r.ok) setUsers(b.users);
    else notify(b.error || "Não foi possível carregar usuários");
    setLoading(false);
  }, [notify]);
  useEffect(() => {
    void load();
  }, [load]);
  const loadTrello=useCallback(async()=>{
    setTrelloLoading(true);
    const statusResponse=await fetch("/api/admin/trello/settings"),status=await statusResponse.json();
    if(!statusResponse.ok){notify(status.error||"Não foi possível consultar o Trello");setTrelloLoading(false);return}
    setTrelloReady(status.credentialsReady);setBoardId(status.settings?.boardId||"");setListId(status.settings?.listId||"");
    if(status.credentialsReady){
      const boardResponse=await fetch("/api/admin/trello/boards"),boardBody=await boardResponse.json();
      if(boardResponse.ok)setBoards(boardBody.boards||[]);else notify(boardBody.error||"Não foi possível carregar os Quadros");
      if(status.settings?.boardId){const listResponse=await fetch(`/api/admin/trello/boards?boardId=${encodeURIComponent(status.settings.boardId)}`),listBody=await listResponse.json();if(listResponse.ok)setLists(listBody.lists||[])}
    }
    setTrelloLoading(false);
  },[notify]);
  useEffect(()=>{void loadTrello()},[loadTrello]);
  async function chooseBoard(id:string){setBoardId(id);setListId("");setLists([]);if(!id)return;const response=await fetch(`/api/admin/trello/boards?boardId=${encodeURIComponent(id)}`),body=await response.json();if(response.ok)setLists(body.lists||[]);else notify(body.error)}
  async function saveTrello(){const board=boards.find(x=>x.id===boardId),list=lists.find(x=>x.id===listId);if(!board||!list)return notify("Selecione o Quadro e a Lista");const response=await fetch("/api/admin/trello/settings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({boardId:board.id,boardName:board.name,listId:list.id,listName:list.name})}),body=await response.json();if(!response.ok)return notify(body.error);notify("Destino do Trello salvo")}
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
      <article className="card admin-integration">
        <div><img src="/trello-logo.png" alt="Trello"/><span><strong>Trello institucional</strong><small>Escolha onde o KeyNotesAI manterá um único card por reunião.</small></span></div>
        {trelloLoading?<p>Consultando integração…</p>:!trelloReady?<p className="integration-warning">As credenciais da conta Trello do INOVALAB ainda precisam ser configuradas com segurança no Sites.</p>:<div className="integration-selectors"><label><span>Quadro</span><select value={boardId} onChange={e=>void chooseBoard(e.target.value)}><option value="">Selecione…</option>{boards.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label><label><span>Lista</span><select value={listId} onChange={e=>setListId(e.target.value)} disabled={!boardId}><option value="">Selecione…</option>{lists.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label><button onClick={saveTrello} disabled={!boardId||!listId}>Salvar destino</button></div>}
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
    </section>
  );
}
