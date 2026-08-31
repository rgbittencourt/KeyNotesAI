export async function loadSession<T>(signal:AbortSignal, timeoutMs=12000):Promise<T|null>{
  const controller=new AbortController();
  const cancel=()=>controller.abort();signal.addEventListener("abort",cancel,{once:true});
  if(signal.aborted)controller.abort();
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    return await Promise.race([
      (async()=>{
        const response=await fetch("/api/session",{signal:controller.signal,cache:"no-store",credentials:"same-origin"});
        if(response.status===401)return null;
        const body=await response.json();
        if(!response.ok)throw new Error(response.status===403?body.error||"Seu cadastro não está autorizado.":"Não foi possível verificar seu acesso agora. Tente novamente.");
        if(!body.user||typeof body.user.email!=="string"||typeof body.user.name!=="string"||!["admin","user"].includes(body.user.role))throw new Error("O servidor retornou uma resposta de acesso incompleta. Tente novamente.");
        return body.user as T;
      })(),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(new Error("A verificação de acesso demorou mais que o esperado. Tente novamente."));controller.abort()},timeoutMs)}),
    ]);
  } finally {clearTimeout(timer);signal.removeEventListener("abort",cancel)}
}
