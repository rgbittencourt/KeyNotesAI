import{accessError,requireAccess}from"../../server-access";
export async function GET(){
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const user=await Promise.race([requireAccess(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Response("A verificação de acesso está demorando. Tente novamente.",{status:503})),10000)})]);
  return Response.json({user},{headers:{"cache-control":"private, no-store"}});
 }catch(error){const response=await accessError(error);response.headers.set("cache-control","private, no-store");return response}
 finally{clearTimeout(timer)}
}
