import { requireAccess, accessError } from "../../../server-access";
import { driveIntegrationStatus } from "../../../google-drive-oauth";
export async function GET() {
  try { await requireAccess(); return Response.json(await driveIntegrationStatus(), { headers: { "cache-control": "private, no-store" } }); }
  catch (error) { return accessError(error); }
}
