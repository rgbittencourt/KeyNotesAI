import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";
let rows={};const bindings=[];
globalThis.driveTestDb={
  prepare(sql){
    return {bind(owner,id){
      bindings.push([owner,id]);
      return {async first(){return rows[owner+":"+id]?.[sql.includes("drive_exports")?"archive":"meeting"]||null}};
    }};
  }
};
const source=(await readFile(new URL("../app/drive-meeting-access.ts",import.meta.url),"utf8")).replace(/^import .*;\r?\n/gm,"");
const code=ts.transpileModule(`const getRawDb=async()=>globalThis.driveTestDb;const DRIVE_ROOT_FOLDER_ID='root';const validDriveId=(id)=>/^[a-zA-Z0-9_-]+$/.test(id);\n${source}`,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {driveMeetingAccess}=await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const user={email:"sabrina@test",role:"user"};
test("Sabrina não pode selecionar proprietário diferente",async()=>{rows={"admin@test:1":{meeting:{data_json:JSON.stringify({driveFolderId:"private"})}}};bindings.length=0;await assert.rejects(driveMeetingAccess(user,"1","admin@test"),e=>e.status===404);assert.ok(bindings.every(([owner])=>owner===user.email))});
test("Sabrina pode abrir sua reunião sem ser admin",async()=>{rows={"sabrina@test:1":{meeting:{data_json:JSON.stringify({driveFolderId:"own"})}}};assert.equal((await driveMeetingAccess(user,"1")).folderId,"own")});
test("arquivo mais recente prevalece sobre links obsoletos",async()=>{rows={"sabrina@test:1":{meeting:{data_json:JSON.stringify({driveFolderId:"old",driveSyncedAt:"2026-08-20"})},archive:{folder_id:"current",files_json:"[]",created_at:"2026-08-31"}}};assert.equal((await driveMeetingAccess(user,"1")).folderId,"current")});
test("raiz geral não é uma pasta de reunião válida",async()=>{rows={"sabrina@test:1":{meeting:{data_json:JSON.stringify({driveFolderId:"root"})}}};await assert.rejects(driveMeetingAccess(user,"1"),e=>e.status===409)});
test("exige reunião explícita",async()=>assert.rejects(driveMeetingAccess(user,""),e=>e.status===400));
test("visualizador não abre erros em janelas externas",async()=>{const ui=await readFile(new URL("../app/drive-library.tsx",import.meta.url),"utf8");assert.doesNotMatch(ui,/target="_blank"|window.open/);assert.match(ui,/response.ok/);assert.match(ui,/role="alert"/)});
test("atualização não exclui os documentos anteriores",async()=>{const server=await readFile(new URL("../app/google-drive.ts",import.meta.url),"utf8");const archive=server.split("export async function archiveMeetingInDrive")[1];assert.doesNotMatch(archive,/trashFile/);assert.match(archive,/method:"PATCH"/);assert.match(archive,/trashed = false/)});
