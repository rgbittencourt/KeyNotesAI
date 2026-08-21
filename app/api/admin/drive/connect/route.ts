import { accessError, requireAdmin } from "../../../../server-access";
import { authorizationUrl } from "../../../../google-drive-oauth";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const state = crypto.randomUUID(), origin = new URL(request.url).origin;
    return new Response(null, { status: 302, headers: { location: authorizationUrl(origin, state), "set-cookie": `keynotesai_google_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600` } });
  } catch (error) { return accessError(error); }
}
