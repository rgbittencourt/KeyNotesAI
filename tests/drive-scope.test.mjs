import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("../app/drive-scope.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { requireInstitutionalFile } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const entries = {
  root: { id: "root", name: "KeyNotesAI", mimeType: "application/vnd.google-apps.folder", parents: ["outside"] },
  meeting: { id: "meeting", name: "Reunião", mimeType: "application/vnd.google-apps.folder", parents: ["root"] },
  document: { id: "document", name: "Ata", mimeType: "application/pdf", parents: ["meeting"] },
  outside: { id: "outside", name: "Particular", mimeType: "application/vnd.google-apps.folder" },
  private: { id: "private", name: "Privado", mimeType: "application/pdf", parents: ["outside"] },
  trash: { id: "trash", name: "Excluído", mimeType: "application/pdf", parents: ["meeting"], trashed: true },
  loop: { id: "loop", name: "Ciclo", mimeType: "application/pdf", parents: ["loop"] },
};
const read = async id => { if (!entries[id]) throw new Response("Ausente", { status: 404 }); return entries[id]; };
test("permite raiz institucional", async () => assert.equal((await requireInstitutionalFile("root", "root", read)).id, "root"));
test("permite documento em subpasta a qualquer usuário já autorizado pela rota", async () => assert.equal((await requireInstitutionalFile("document", "root", read)).id, "document"));
test("rejeita arquivo fora do projeto", async () => assert.rejects(requireInstitutionalFile("private", "root", read), error => error.status === 403));
test("rejeita arquivo na lixeira", async () => assert.rejects(requireInstitutionalFile("trash", "root", read), error => error.status === 403));
test("rejeita ciclos de pastas", async () => assert.rejects(requireInstitutionalFile("loop", "root", read), error => error.status === 403));
test("rejeita tentativa de injeção no identificador", async () => assert.rejects(requireInstitutionalFile("root' or trashed=false", "root", read), error => error.status === 400));
test("preserva erro de arquivo removido", async () => assert.rejects(requireInstitutionalFile("missing", "root", read), error => error.status === 404));
test("todas as rotas compartilhadas exigem cadastro no servidor", async () => {
  for (const path of ["status", "library", "file"]) {
    const route = await readFile(new URL(`../app/api/drive/${path}/route.ts`, import.meta.url), "utf8");
    assert.match(route, /await requireAccess\(\)/);
    assert.doesNotMatch(route, /requireAdmin/);
    assert.match(route, /no-store|driveError/);
  }
});
