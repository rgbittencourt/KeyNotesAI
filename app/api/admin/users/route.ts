import {
  ADMIN_EMAIL,
  accessError,
  getRawDb,
  requireAdmin,
} from "../../../server-access";
const cleanEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";
export async function GET() {
  try {
    await requireAdmin();
    const db = await getRawDb(),
      period = new Date().toISOString().slice(0, 7);
    const rows = await db
      .prepare(
        "SELECT u.email,u.name,u.role,u.status,u.monthly_limit monthlyLimit,COALESCE(x.used,0) used FROM app_users u LEFT JOIN api_usage x ON x.email=u.email AND x.period=? ORDER BY u.role ASC,u.email ASC",
      )
      .bind(period)
      .all();
    return Response.json({ users: rows.results });
  } catch (error) {
    return accessError(error);
  }
}
export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as {
        email?: unknown;
        name?: unknown;
        monthlyLimit?: unknown;
      },
      email = cleanEmail(body.email),
      limit = Math.max(
        0,
        Math.min(10000, Math.floor(Number(body.monthlyLimit) || 0)),
      ),
      name = typeof body.name === "string" ? body.name.trim() : "";
    if (!email.includes("@"))
      return Response.json(
        { error: "Informe um e-mail válido." },
        { status: 400 },
      );
    const now = new Date().toISOString(),
      db = await getRawDb();
    await db
      .prepare(
        "INSERT INTO app_users(email,name,role,status,monthly_limit,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,status='active',monthly_limit=excluded.monthly_limit,updated_at=excluded.updated_at",
      )
      .bind(
        email,
        name || null,
        email === ADMIN_EMAIL ? "admin" : "user",
        "active",
        limit,
        now,
        now,
      )
      .run();
    return Response.json({ ok: true });
  } catch (error) {
    return accessError(error);
  }
}
export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as {
        email?: unknown;
        name?: unknown;
        monthlyLimit?: unknown;
        status?: unknown;
      },
      email = cleanEmail(body.email);
    if (!email)
      return Response.json({ error: "Usuário inválido." }, { status: 400 });
    if (email === ADMIN_EMAIL && body.status === "disabled")
      return Response.json(
        { error: "O administrador principal não pode ser desativado." },
        { status: 400 },
      );
    const limit = Math.max(
        0,
        Math.min(10000, Math.floor(Number(body.monthlyLimit) || 0)),
      ),
      status = body.status === "disabled" ? "disabled" : "active",
      name = typeof body.name === "string" ? body.name.trim() : "";
    await (
      await getRawDb()
    )
      .prepare(
        "UPDATE app_users SET name=?,monthly_limit=?,status=?,updated_at=? WHERE email=?",
      )
      .bind(name || null, limit, status, new Date().toISOString(), email)
      .run();
    return Response.json({ ok: true });
  } catch (error) {
    return accessError(error);
  }
}
export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const email = cleanEmail(new URL(request.url).searchParams.get("email"));
    if (email === ADMIN_EMAIL)
      return Response.json(
        { error: "O administrador principal não pode ser excluído." },
        { status: 400 },
      );
    await (await getRawDb())
      .prepare("DELETE FROM app_users WHERE email=?")
      .bind(email)
      .run();
    return Response.json({ ok: true });
  } catch (error) {
    return accessError(error);
  }
}
