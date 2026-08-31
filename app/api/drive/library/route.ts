import { requireAccess } from "../../../server-access";
import { DRIVE_ROOT_FOLDER_ID } from "../../../google-drive-oauth";
import { institutionalReader, driveError, DRIVE_FOLDER } from "../../../drive-reader";
import { driveMeetingAccess } from "../../../drive-meeting-access";
import { requireInstitutionalFile } from "../../../drive-scope";
export async function GET(request: Request) {
  try {
    const user = await requireAccess();
    const params = new URL(request.url).searchParams;
    const meeting = await driveMeetingAccess(user, params.get("meetingId") || "", params.get("owner"));
    const id = params.get("folder") || meeting.folderId;
    const reader = await institutionalReader();
    const folder = await requireInstitutionalFile(id, meeting.folderId, reader.check);
    if (folder.mimeType !== DRIVE_FOLDER) throw new Response("Selecione uma pasta.", { status: 400 });
    const query = new URLSearchParams({ q: `'${id}' in parents and trashed = false`, fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime)", pageSize: "100", orderBy: "folder,name", supportsAllDrives: "true", includeItemsFromAllDrives: "true" });
    if (params.get("page")) query.set("pageToken", params.get("page")!);
    const result = await (await reader.request(`files?${query}`)).json();
    return Response.json({ ...result, folder: { id: folder.id, name: folder.name }, rootId: meeting.folderId, parentId: id === meeting.folderId ? null : folder.parents?.[0] }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return driveError(error); }
}
