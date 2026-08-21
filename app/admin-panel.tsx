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
export default function AdminPanel({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [users, setUsers] = useState<User[]>([]),
    [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [limit, setLimit] = useState(50),
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
