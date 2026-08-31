import { getRawDb } from "./server-access";

export const DRIVE_ACCOUNT_EMAIL = "inovalab.cte@gmail.com";
export const DRIVE_ROOT_FOLDER_ID = "15eNIgl3Zxu9j-eKCz8HS01a3KgXOvMIC";
export const DRIVE_ROOT_FOLDER_URL = `https://drive.google.com/drive/folders/${DRIVE_ROOT_FOLDER_ID}`;
export class DriveConnectionError extends Error {
  code = "DRIVE_RECONNECT_REQUIRED";
  constructor() { super("A conexão institucional do INOVALAB precisa ser renovada pelo administrador. Seu cadastro continua autorizado; você não precisa conectar uma conta Google pessoal."); }
}
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/drive"].join(" ");

const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64 = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0));
};
async function encryptionKey() {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Response("Proteção das credenciais do Google ainda não configurada.", { status: 503 });
  const bytes = unb64(raw);
  if (bytes.length !== 32) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY deve conter 32 bytes.");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encryptToken(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), enc.encode(value));
  return `${b64(iv)}.${b64(new Uint8Array(encrypted))}`;
}
async function decryptToken(value: string) {
  const [iv, data] = value.split(".");
  if (!iv || !data) throw new Error("Credencial do Google inválida.");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await encryptionKey(), unb64(data));
  return dec.decode(decrypted);
}
function client() {
  const clientId = process.env.GOOGLE_CLIENT_ID, clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Response("Credenciais OAuth do Google ainda não configuradas.", { status: 503 });
  return { clientId, clientSecret };
}
export function authorizationUrl(origin: string, state: string) {
  const { clientId } = client();
  return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: clientId, redirect_uri: `${origin}/api/google-drive/callback`, response_type: "code", scope: SCOPES, access_type: "offline", prompt: "consent", state, login_hint: DRIVE_ACCOUNT_EMAIL }).toString()}`;
}
export async function exchangeCode(origin: string, code: string) {
  const { clientId, clientSecret } = client();
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: `${origin}/api/google-drive/callback`, grant_type: "authorization_code" }) });
  const body = await response.json() as { access_token?: string; refresh_token?: string; error_description?: string };
  if (!response.ok || !body.access_token || !body.refresh_token) throw new Error(body.error_description || "O Google não forneceu acesso permanente ao Drive.");
  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${body.access_token}` } });
  const profile = await profileResponse.json() as { email?: string };
  if (!profileResponse.ok || profile.email?.toLowerCase() !== DRIVE_ACCOUNT_EMAIL) throw new Error(`Conecte especificamente a conta ${DRIVE_ACCOUNT_EMAIL}.`);
  return body.refresh_token;
}
export async function saveRefreshToken(refreshToken: string) {
  const now = new Date().toISOString(), encrypted = await encryptToken(refreshToken), db = await getRawDb();
  await db.prepare("INSERT INTO google_drive_integrations(id,account_email,encrypted_refresh_token,root_folder_id,created_at,updated_at) VALUES('inovalab',?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET account_email=excluded.account_email,encrypted_refresh_token=excluded.encrypted_refresh_token,root_folder_id=excluded.root_folder_id,updated_at=excluded.updated_at")
    .bind(DRIVE_ACCOUNT_EMAIL, encrypted, DRIVE_ROOT_FOLDER_ID, now, now).run();
}
export async function driveIntegrationStatus() {
  const row = await (await getRawDb()).prepare("SELECT account_email,root_folder_id,updated_at FROM google_drive_integrations WHERE id='inovalab'").first<Record<string, unknown>>();
  const base = { connected: false, accountEmail: row ? String(row.account_email) : DRIVE_ACCOUNT_EMAIL, rootFolderId: DRIVE_ROOT_FOLDER_ID, rootFolderUrl: DRIVE_ROOT_FOLDER_URL, updatedAt: row?.updated_at ? String(row.updated_at) : null, credentialsReady: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_TOKEN_ENCRYPTION_KEY) };
  try {
    const token = await getDriveAccessToken();
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${DRIVE_ROOT_FOLDER_ID}?fields=id,trashed&supportsAllDrives=true`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("A pasta institucional está indisponível. O administrador precisa verificar as permissões no Google Drive.");
    const folder = await response.json() as { trashed?: boolean };
    if (folder.trashed) throw new Error("A pasta institucional foi movida para a lixeira.");
    return { ...base, connected: true, state: "connected", message: "Acesso institucional disponível para todos os usuários cadastrados e ativos." };
  } catch (error) {
    return { ...base, state: error instanceof DriveConnectionError ? "reconnect_required" : "unavailable", message: error instanceof Response ? await error.text() : error instanceof DriveConnectionError ? error.message : "Não foi possível verificar a conexão institucional agora. Tente novamente ou avise o administrador." };
  }
}
export async function getDriveAccessToken() {
  const row = await (await getRawDb()).prepare("SELECT encrypted_refresh_token FROM google_drive_integrations WHERE id='inovalab'").first<{ encrypted_refresh_token: string }>();
  if (!row) throw new DriveConnectionError();
  const { clientId, clientSecret } = client(), refreshToken = await decryptToken(row.encrypted_refresh_token);
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }), signal: AbortSignal.timeout(15000) });
  const body = await response.json() as { access_token?: string; error?: string; error_description?: string };
  if (body.error === "invalid_grant") throw new DriveConnectionError();
  if (!response.ok || !body.access_token) throw new Error("Não foi possível renovar a conexão institucional agora. Avise o administrador.");
  return body.access_token;
}
