export type DriveEntry = { id: string; name: string; mimeType: string; parents?: string[]; trashed?: boolean };
export function validDriveId(id: string) { return /^[a-zA-Z0-9_-]{1,200}$/.test(id); }
// Never trust a file ID supplied by the browser as proof of authorization.
export async function requireInstitutionalFile(id: string, root: string, read: (id: string) => Promise<DriveEntry>): Promise<DriveEntry> {
  if (!validDriveId(id)) throw new Response("Identificador inválido.", { status: 400 });
  const item = await read(id);
  let current = item;
  const seen = new Set<string>();
  for (let depth = 0; depth < 32; depth++) {
    if (current.trashed || seen.has(current.id)) break;
    if (current.id === root) return item;
    seen.add(current.id);
    const parent = current.parents?.[0];
    if (!parent) break;
    current = await read(parent);
  }
  throw new Response("Este arquivo não pertence à pasta institucional do KeyNotesAI.", { status: 403 });
}
