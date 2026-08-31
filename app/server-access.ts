import { env } from "cloudflare:workers";
import { getChatGPTUser } from "./chatgpt-auth";

export const ADMIN_EMAIL = "rogerio.bittencourt@ifsc.edu.br";
const period = () => new Date().toISOString().slice(0, 7);
let initialized = false;

function db() {
  if (!env.DB) throw new Error("Banco de usuários indisponível.");
  return env.DB;
}
async function init() {
  if (!initialized) {
      // Cache only completion, never request-owned I/O: an interrupted request
      // must not leave later requests waiting on its suspended promise.
      const d = db();
      await d.batch([
        d.prepare(
          "CREATE TABLE IF NOT EXISTS app_users (email TEXT PRIMARY KEY, user_id TEXT UNIQUE, name TEXT, role TEXT NOT NULL DEFAULT 'user', status TEXT NOT NULL DEFAULT 'active', monthly_limit INTEGER NOT NULL DEFAULT 50, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
        ),
        d.prepare(
          "CREATE TABLE IF NOT EXISTS api_usage (email TEXT NOT NULL, period TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (email, period), FOREIGN KEY (email) REFERENCES app_users(email) ON DELETE CASCADE)",
        ),
        d.prepare(
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_user_id ON app_users(user_id) WHERE user_id IS NOT NULL",
        ),
        d.prepare(
          "CREATE INDEX IF NOT EXISTS idx_api_usage_period ON api_usage(period)",
        ),
        d.prepare(
          "CREATE TABLE IF NOT EXISTS drive_exports (id TEXT PRIMARY KEY, email TEXT NOT NULL, local_meeting_id TEXT NOT NULL, meeting_title TEXT NOT NULL, folder_id TEXT NOT NULL, folder_url TEXT NOT NULL, files_json TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (email) REFERENCES app_users(email) ON DELETE CASCADE)",
        ),
        d.prepare(
          "CREATE INDEX IF NOT EXISTS idx_drive_exports_email_created ON drive_exports(email,created_at)",
        ),
        d.prepare(
          "CREATE TABLE IF NOT EXISTS google_drive_integrations (id TEXT PRIMARY KEY, account_email TEXT NOT NULL, encrypted_refresh_token TEXT NOT NULL, root_folder_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
        ),
        d.prepare(
          "CREATE TABLE IF NOT EXISTS trello_settings (id TEXT PRIMARY KEY, board_id TEXT NOT NULL, board_name TEXT NOT NULL, list_id TEXT NOT NULL, list_name TEXT NOT NULL, updated_at TEXT NOT NULL)",
        ),
        d.prepare(
          "CREATE TABLE IF NOT EXISTS trello_exports (id TEXT PRIMARY KEY, email TEXT NOT NULL, local_meeting_id TEXT NOT NULL, card_id TEXT NOT NULL, card_url TEXT NOT NULL, checklist_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (email) REFERENCES app_users(email) ON DELETE CASCADE)",
        ),
        d.prepare(
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_trello_exports_meeting ON trello_exports(email,local_meeting_id)",
        ),
        d.prepare(
          "CREATE TABLE IF NOT EXISTS meetings (id TEXT NOT NULL, email TEXT NOT NULL, data_json TEXT NOT NULL, audio_file_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(email,id), FOREIGN KEY (email) REFERENCES app_users(email) ON DELETE CASCADE)",
        ),
        d.prepare(
          "CREATE INDEX IF NOT EXISTS idx_meetings_email_updated ON meetings(email,updated_at DESC)",
        ),
        d.prepare(
          "CREATE TABLE IF NOT EXISTS meeting_transfers (source_email TEXT NOT NULL, meeting_id TEXT NOT NULL, target_email TEXT NOT NULL, transferred_at TEXT NOT NULL, PRIMARY KEY(source_email,meeting_id))",
        ),
      ]);
      initialized = true;
  }
}

export type AccessUser = {
  userId: string;
  email: string;
  name: string;
  role: "admin" | "user";
  status: "active" | "disabled";
  monthlyLimit: number;
  used: number;
  impersonatedBy?: { email: string; name: string };
};
function impersonationEmail(cookie:string|null){const match=cookie?.match(/(?:^|;\s*)keynotesai_impersonate=([^;]+)/);if(!match)return"";try{return decodeURIComponent(match[1]).toLowerCase()}catch{return""}}
export async function requireAccess(options?:{ignoreImpersonation?:boolean}): Promise<AccessUser> {
  const identity = await getChatGPTUser();
  if (!identity) throw new Response("Autenticação necessária", { status: 401 });
  await init();
  const d = db(),
    email = identity.email.toLowerCase(),
    now = new Date().toISOString();
  if (email === ADMIN_EMAIL)
    await d
      .prepare(
        "INSERT INTO app_users(email,user_id,name,role,status,monthly_limit,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET user_id=excluded.user_id,name=excluded.name,role='admin',status='active',updated_at=excluded.updated_at",
      )
      .bind(
        email,
        identity.userId,
        identity.displayName,
        "admin",
        "active",
        1000,
        now,
        now,
      )
      .run();
  else
    await d
      .prepare(
        "UPDATE app_users SET user_id=?,name=COALESCE(name,?),updated_at=? WHERE email=? AND (user_id IS NULL OR user_id=?)",
      )
      .bind(identity.userId, identity.displayName, now, email, identity.userId)
      .run();
  const row = await d
    .prepare(
      "SELECT u.email,u.user_id,u.name,u.role,u.status,u.monthly_limit,COALESCE(x.used,0) used FROM app_users u LEFT JOIN api_usage x ON x.email=u.email AND x.period=? WHERE u.email=?",
    )
    .bind(period(), email)
    .first<Record<string, unknown>>();
  if (!row) throw new Response("Usuário não autorizado", { status: 403 });
  if (row.status !== "active")
    throw new Response("Usuário desativado", { status: 403 });
  if(email===ADMIN_EMAIL&&!options?.ignoreImpersonation){
    const requestHeaders=await import("next/headers").then(module=>module.headers()),targetEmail=impersonationEmail(requestHeaders.get("cookie"));
    if(targetEmail&&targetEmail!==ADMIN_EMAIL){
      const target=await d.prepare("SELECT u.email,u.user_id,u.name,u.role,u.status,u.monthly_limit,COALESCE(x.used,0) used FROM app_users u LEFT JOIN api_usage x ON x.email=u.email AND x.period=? WHERE u.email=?").bind(period(),targetEmail).first<Record<string,unknown>>();
      if(target&&target.status==="active")return{userId:String(target.user_id||target.email),email:String(target.email),name:String(target.name||target.email),role:"user",status:"active",monthlyLimit:Number(target.monthly_limit),used:Number(target.used),impersonatedBy:{email,name:String(row.name||identity.displayName)}};
    }
  }
  return {
    userId: String(row.user_id || identity.userId),
    email: String(row.email),
    name: String(row.name || identity.displayName),
    role: row.role === "admin" ? "admin" : "user",
    status: "active",
    monthlyLimit: Number(row.monthly_limit),
    used: Number(row.used),
  };
}
export async function requireAdmin() {
  const user = await requireAccess();
  if (user.role !== "admin")
    throw new Response("Acesso administrativo necessário", { status: 403 });
  return user;
}
export async function requireActualAdmin(){const user=await requireAccess({ignoreImpersonation:true});if(user.role!=="admin")throw new Response("Acesso administrativo necessário",{status:403});return user}
export async function consumeUsage(email: string) {
  await init();
  const result = await db()
    .prepare(
      "INSERT INTO api_usage(email,period,used) SELECT email,?,1 FROM app_users WHERE email=? AND status='active' AND monthly_limit>0 ON CONFLICT(email,period) DO UPDATE SET used=used+1 WHERE used < (SELECT monthly_limit FROM app_users WHERE email=excluded.email)",
    )
    .bind(period(), email)
    .run();
  if (!result.meta.changes)
    throw new Response("Seu limite mensal de operações de IA foi atingido.", {
      status: 429,
    });
}
export async function refundUsage(email: string) {
  await init();
  await db()
    .prepare(
      "UPDATE api_usage SET used=MAX(0,used-1) WHERE email=? AND period=?",
    )
    .bind(email, period())
    .run();
}
export async function getRawDb() {
  await init();
  return db();
}
export async function accessError(error: unknown) {
  return error instanceof Response
    ? Response.json({ error: await error.text() }, { status: error.status })
    : Response.json({ error: "Falha ao verificar acesso." }, { status: 500 });
}
