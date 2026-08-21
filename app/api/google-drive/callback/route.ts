import { exchangeCode, saveRefreshToken } from "../../../google-drive-oauth";
const cookie = (request: Request, name: string) => request.headers.get("cookie")?.split(";").map((x) => x.trim()).find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1);
export async function GET(request: Request) {
  const url = new URL(request.url), state = url.searchParams.get("state"), expected = cookie(request, "keynotesai_google_state"), code = url.searchParams.get("code");
  if (!state || !expected || state !== expected || !code) return Response.json({ error: "A autorização do Google expirou ou é inválida." }, { status: 400 });
  try {
    await saveRefreshToken(await exchangeCode(url.origin, code));
    return new Response(null, { status: 302, headers: { location: "/?drive=connected", "set-cookie": "keynotesai_google_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível conectar o Google Drive." }, { status: 502 });
  }
}
