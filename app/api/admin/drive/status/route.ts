import { accessError, requireAdmin } from "../../../../server-access";
import { driveIntegrationStatus } from "../../../../google-drive-oauth";
export async function GET() { try { await requireAdmin(); return Response.json(await driveIntegrationStatus()); } catch (error) { return accessError(error); } }
