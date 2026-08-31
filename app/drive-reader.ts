import { DRIVE_ROOT_FOLDER_ID, DriveConnectionError, getDriveAccessToken } from "./google-drive-oauth";
import { requireInstitutionalFile, type DriveEntry } from "./drive-scope";
export const DRIVE_FOLDER = "application/vnd.google-apps.folder";
export async function institutionalReader() {
  let token = await getDriveAccessToken();
  const request = async (path: string, headers: Record<string,string> = {}) => {
    const send = () => fetch(`https://www.googleapis.com/drive/v3/${path}`, { headers: { ...headers, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
    let response = await send();
    if (response.status === 401) { await response.body?.cancel(); token = await getDriveAccessToken(); response = await send(); }
    if (response.status === 401) throw new DriveConnectionError();
    if (!response.ok && response.status !== 416) throw new Response("Não foi possível acessar este arquivo institucional. Verifique se ele ainda existe e tente novamente.", { status: response.status === 404 ? 404 : 502 });
    return response;
  };
  const read = async (id: string): Promise<DriveEntry> => (await request(`files/${encodeURIComponent(id)}?fields=id,name,mimeType,parents,trashed&supportsAllDrives=true`)).json();
  return { request, check: (id: string) => requireInstitutionalFile(id, DRIVE_ROOT_FOLDER_ID, read) };
}
export async function driveError(error: unknown) {
  const status = error instanceof Response ? error.status : 503;
  const message = error instanceof Response ? await error.text() : error instanceof DriveConnectionError ? error.message : "O Drive institucional está temporariamente indisponível. Tente novamente ou avise o administrador.";
  return Response.json({ error: message, code: error instanceof DriveConnectionError ? error.code : "DRIVE_UNAVAILABLE" }, { status, headers: { "cache-control": "private, no-store" } });
}
