import { requireAccess } from "../../../server-access";
import { institutionalReader, driveError, DRIVE_FOLDER } from "../../../drive-reader";
export async function GET(request: Request) {
  try {
    await requireAccess();
    const params = new URL(request.url).searchParams;
    const reader = await institutionalReader();
    const file = await reader.check(params.get("id") || "");
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
