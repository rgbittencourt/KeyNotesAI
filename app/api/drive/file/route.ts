import { requireAccess } from "../../../server-access";
import { institutionalReader, driveError, DRIVE_FOLDER } from "../../../drive-reader";
import { driveMeetingAccess } from "../../../drive-meeting-access";
import { requireInstitutionalFile } from "../../../drive-scope";
export async function GET(request: Request) {
  try {
    const user = await requireAccess();
    const params = new URL(request.url).searchParams;
    const reader = await institutionalReader();
    const meeting = await driveMeetingAccess(user, params.get("meetingId") || "", params.get("owner"));
    let fileId = params.get("id") || "";
    // Resolve historical links by their exact document name, only inside this meeting.
    const requestedName=params.get("name");
    if(requestedName){
      const escaped=requestedName.replace(/\\/g,"\\\\").replace(/'/g,"\\'");
      const query=new URLSearchParams({q:`'${meeting.folderId}' in parents and name = '${escaped}' and trashed = false`,fields:"files(id)",pageSize:"100",supportsAllDrives:"true",includeItemsFromAllDrives:"true"});
      const live=await(await reader.request(`files?${query}`)).json() as {files:Array<{id:string}>};
      if(live.files.length===1)fileId=live.files[0].id;
    }
    const file = await requireInstitutionalFile(fileId, meeting.folderId, reader.check);
    if (file.mimeType === DRIVE_FOLDER) throw new Response("Abra a pasta na biblioteca do app.", { status: 400 });
    const native = ["application/vnd.google-apps.document", "application/vnd.google-apps.spreadsheet", "application/vnd.google-apps.presentation", "application/vnd.google-apps.drawing"].includes(file.mimeType);
    const range = request.headers.get("range");
    if (range && !/^bytes=\d*-\d*$/.test(range)) throw new Response("Intervalo inválido.", { status: 416 });
    const response = await reader.request(native ? `files/${file.id}/export?mimeType=application%2Fpdf` : `files/${file.id}?alt=media&supportsAllDrives=true`, !native && range ? { range } : {});
    const mime = native ? "application/pdf" : file.mimeType;
    const inline = params.get("download") !== "1" && /^(application\/pdf|audio\/[\w.+-]+|video\/[\w.+-]+|image\/(png|jpeg|webp|gif))$/.test(mime);
    const name = (file.name + (native ? ".pdf" : "")).replace(/[\r\n]/g, "");
    const headers = new Headers({ "content-type": mime, "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name).replace(/'/g,"%27")}`, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "sandbox" });
    for (const key of ["content-length", "content-range", "accept-ranges"]) { const value = response.headers.get(key); if (value) headers.set(key, value); }
    return new Response(response.body, { status: response.status, headers });
  } catch (error) { return driveError(error); }
}
