import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";
const compile=source=>`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString("base64")}`;
const {loadSession}=await import(compile(await readFile(new URL("../app/session-client.ts",import.meta.url),"utf8")));
test("sessão válida libera usuário autorizado",async t=>{t.mock.method(globalThis,"fetch",async()=>Response.json({user:{name:"Sabrina",email:"sabrina@test",role:"user"}}));assert.equal((await loadSession(new AbortController().signal)).role,"user")});
test("401 oferece entrada sem conceder acesso",async t=>{t.mock.method(globalThis,"fetch",async()=>new Response(null,{status:401}));assert.equal(await loadSession(new AbortController().signal),null)});
test("403 mantém recusa do servidor",async t=>{t.mock.method(globalThis,"fetch",async()=>Response.json({error:"Usuário desativado"},{status:403}));await assert.rejects(loadSession(new AbortController().signal),/Usuário desativado/)});
test("resposta sem usuário não deixa carregamento indefinido",async t=>{t.mock.method(globalThis,"fetch",async()=>Response.json({}));await assert.rejects(loadSession(new AbortController().signal),/incompleta/)});
test("timeout encerra espera mesmo se a conexão nunca responder",async t=>{let signal;t.mock.method(globalThis,"fetch",(_url,options)=>{signal=options.signal;return new Promise(()=>{})});await assert.rejects(loadSession(new AbortController().signal,15),/demorou/);assert.equal(signal.aborted,true)});
test("erro transitório permite nova tentativa bem-sucedida",async t=>{let attempt=0;t.mock.method(globalThis,"fetch",async()=>++attempt===1?Response.json({error:"Falha"},{status:503}):Response.json({user:{name:"Admin",email:"admin@test",role:"admin"}}));await assert.rejects(loadSession(new AbortController().signal));assert.equal((await loadSession(new AbortController().signal)).role,"admin")});
test("inicialização suspensa não bloqueia requisição seguinte",async()=>{
 const source=await readFile(new URL("../app/server-access.ts",import.meta.url),"utf8");
 let batches=0;globalThis.sessionTestDb={prepare:()=>({}),batch:()=>++batches===1?new Promise(()=>{}):Promise.resolve()};
 const code='const env={DB:globalThis.sessionTestDb};\n'+source.slice(source.indexOf("let initialized"),source.indexOf("export type AccessUser"))+'\nexport {init};';
 const {init}=await import(compile(code));
 void init();await init();assert.equal(batches,2);await init();assert.equal(batches,2);
});
