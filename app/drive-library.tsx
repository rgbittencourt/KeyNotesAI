"use client";
import { useEffect, useState } from "react";
type Entry = { id: string; name: string; mimeType: string };
type Listing = { folder: { id: string; name: string }; parentId: string | null; files: Entry[]; nextPageToken?: string };
export default function DriveLibrary({ isAdmin }: { isAdmin: boolean }) {
  const [folder, setFolder] = useState("");
  const [listing, setListing] = useState<Listing | null>(null);
  const [page, setPage] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [reconnect, setReconnect] = useState(false);
  useEffect(() => { setFolder(new URLSearchParams(location.search).get("driveFolder") || ""); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError(""); setReconnect(false);
    fetch(`/api/drive/library?${new URLSearchParams({ folder, page })}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) { setReconnect(result.code === "DRIVE_RECONNECT_REQUIRED"); throw new Error(result.error || "Não foi possível abrir o Drive institucional."); }
      setListing(previous => page && previous ? { ...result, files: [...previous.files, ...result.files] } : result);
    }).catch(issue => { if (!controller.signal.aborted) { setError(issue.message); window.dispatchEvent(new Event("keynotesai:drive-status")); } }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [folder, page, revision]);
  function openFolder(id: string) { setListing(null); setFolder(id); setPage(""); }
  return <section className="feature-page institutional-drive">
    <div className="feature-title"><div><p className="eyebrow">ACERVO INSTITUCIONAL · INOVALAB</p><h1>Google Drive no KeyNotesAI</h1><p>Todos os usuários cadastrados e ativos têm acesso aos materiais do projeto, sem conectar uma conta Google pessoal.</p></div></div>
    <div className="drive-library-toolbar">
      <button onClick={() => openFolder("")} disabled={busy}>Pasta principal</button>
      {listing?.parentId && <button onClick={() => openFolder(listing.parentId!)} disabled={busy}>← Voltar</button>}
      <button onClick={() => { setPage(""); setRevision(value => value + 1); window.dispatchEvent(new Event("keynotesai:drive-status")); }} disabled={busy}>Atualizar</button>
      {isAdmin && <a href="/api/admin/drive/connect">{reconnect ? "Reconectar conta institucional" : "Gerenciar conexão institucional"}</a>}
    </div>
    {error && <div className="drive-library-error" role="alert"><strong>{reconnect ? "Reconexão institucional necessária" : "Não foi possível acessar agora"}</strong><p>{error}</p>{reconnect && !isAdmin && <p>Peça ao administrador para renovar a conexão do INOVALAB. Seu acesso no KeyNotesAI não precisa ser alterado.</p>}</div>}
    <article className="card drive-library-list" aria-busy={busy}>
      <h2>{listing?.folder.name || "Materiais do KeyNotesAI"}</h2>
      {busy && <p role="status">Consultando o Drive institucional…</p>}
      {!busy && !error && listing?.files.length === 0 && <p>Esta pasta ainda não contém arquivos.</p>}
      {!error && listing?.files.map(file => <div className="drive-library-row" key={file.id}>
        <span aria-hidden="true">{file.mimeType === "application/vnd.google-apps.folder" ? "▣" : "▤"}</span>
        {file.mimeType === "application/vnd.google-apps.folder" ? <button onClick={() => openFolder(file.id)}>{file.name} →</button> : <><a target="_blank" rel="noreferrer" href={`/api/drive/file?id=${encodeURIComponent(file.id)}`}>{file.name}</a><a target="_blank" rel="noreferrer" href={`/api/drive/file?id=${encodeURIComponent(file.id)}&download=1`}>Baixar ↓</a></>}
      </div>)}
      {!error && listing?.nextPageToken && <button disabled={busy} onClick={() => setPage(listing.nextPageToken!)}>Carregar mais</button>}
    </article>
  </section>;
}
