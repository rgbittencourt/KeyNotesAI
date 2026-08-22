import { getRawDb } from "./server-access";

type TrelloAction={id:string;task:string;person:string;due:string;priority:string;done:boolean};
export type TrelloMeeting={id:number|string;name:string;createdAt:string;meetingDate?:string;meetingTime?:string;participants?:string;department?:string;agenda?:string;summary?:string;actions?:TrelloAction[];decisions?:Array<{text:string;kind?:string;evidence?:string}>;driveFolderUrl?:string;driveFiles?:Array<{name?:string;webViewLink?:string}>;driveSyncedAt?:string};
type TrelloSettings={boardId:string;boardName:string;listId:string;listName:string;updatedAt:string};

function credentials(){
 const key=process.env.TRELLO_API_KEY,token=process.env.TRELLO_TOKEN;
 if(!key||!token) throw new Response("As credenciais da conta Trello do INOVALAB ainda não foram configuradas.",{status:503});
 return{key,token};
}
async function trelloFetch<T>(path:string,init?:RequestInit){
 const {key,token}=credentials(),url=new URL(`https://api.trello.com/1${path}`);
 url.searchParams.set("key",key);url.searchParams.set("token",token);
 const response=await fetch(url,{...init,headers:{accept:"application/json",...(init?.body?{"content-type":"application/json"}:{}),...init?.headers}});
 const body=await response.json().catch(()=>({})) as T&{message?:string};
 if(!response.ok) throw new Error(body.message||"O Trello recusou a operação.");
 return body;
}
export async function trelloStatus(){
 const row=await(await getRawDb()).prepare("SELECT board_id boardId,board_name boardName,list_id listId,list_name listName,updated_at updatedAt FROM trello_settings WHERE id='inovalab'").first<TrelloSettings>();
 return{credentialsReady:Boolean(process.env.TRELLO_API_KEY&&process.env.TRELLO_TOKEN),configured:Boolean(row),settings:row||null};
}
export async function listBoards(){return trelloFetch<Array<{id:string;name:string;url:string}>>("/members/me/boards?fields=name,url&filter=open");}
export async function listLists(boardId:string){return trelloFetch<Array<{id:string;name:string;closed:boolean}>>(`/boards/${encodeURIComponent(boardId)}/lists?fields=name,closed&filter=open`);}
export async function saveSettings(value:{boardId:string;boardName:string;listId:string;listName:string}){
 const now=new Date().toISOString();
 await(await getRawDb()).prepare("INSERT INTO trello_settings(id,board_id,board_name,list_id,list_name,updated_at) VALUES('inovalab',?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET board_id=excluded.board_id,board_name=excluded.board_name,list_id=excluded.list_id,list_name=excluded.list_name,updated_at=excluded.updated_at").bind(value.boardId,value.boardName,value.listId,value.listName,now).run();
 return{...value,updatedAt:now};
}
const line=(label:string,value?:string)=>value?.trim()?`**${label}:** ${value.trim()}`:"";
function description(m:TrelloMeeting){
 const decisions=(m.decisions||[]).map(d=>`- ${d.text}`).join("\n")||"- Nenhuma decisão registrada.";
 const actions=(m.actions||[]).map(a=>`- [${a.done?"x":" "}] ${a.task} — ${a.person||"A confirmar"} — ${a.due||"Sem prazo"} — ${a.priority||"Média"}`).join("\n")||"- Nenhuma ação registrada.";
 const files=(m.driveFiles||[]).filter(f=>f.webViewLink).map(f=>`- [${f.name||"Arquivo"}](${f.webViewLink})`).join("\n")||"- Nenhum arquivo do Drive registrado.";
 return ["# KeyNotesAI",line("Data",[m.meetingDate,m.meetingTime].filter(Boolean).join(" · ")||m.createdAt),line("Setor/local",m.department),line("Participantes",m.participants),line("Pauta",m.agenda),"","## Resumo",m.summary?.trim()||"Resumo ainda não gerado.","","## Decisões",decisions,"","## Ações",actions,"","## Arquivos",m.driveFolderUrl?`- [Pasta completa no Google Drive](${m.driveFolderUrl})`:"- Pasta do Google Drive ainda não vinculada.",files,"",`_Atualizado automaticamente pelo KeyNotesAI em ${new Date().toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})}._`].filter(Boolean).join("\n");
}
export async function syncMeeting(email:string,m:TrelloMeeting){
 const db=await getRawDb(),settings=await db.prepare("SELECT list_id listId FROM trello_settings WHERE id='inovalab'").first<{listId:string}>();
 if(!settings) throw new Response("O Admin ainda precisa escolher o Quadro e a Lista do Trello.",{status:503});
 const existing=await db.prepare("SELECT id,card_id cardId,card_url cardUrl,checklist_id checklistId,created_at createdAt FROM trello_exports WHERE email=? AND local_meeting_id=?").bind(email,String(m.id)).first<{id:string;cardId:string;cardUrl:string;checklistId?:string;createdAt:string}>();
 let card:{id:string;url:string};
 if(existing){
   card=await trelloFetch<{id:string;url:string}>(`/cards/${encodeURIComponent(existing.cardId)}`,{method:"PUT",body:JSON.stringify({name:m.name,desc:description(m),idList:settings.listId})});
 }else{
   card=await trelloFetch<{id:string;url:string}>("/cards",{method:"POST",body:JSON.stringify({idList:settings.listId,name:m.name,desc:description(m),pos:"top"})});
 }
 let checklistId=existing?.checklistId;
 if(checklistId) await trelloFetch(`/checklists/${encodeURIComponent(checklistId)}`,{method:"DELETE"});
 if(m.actions?.length){
   const checklist=await trelloFetch<{id:string}>(`/cards/${encodeURIComponent(card.id)}/checklists`,{method:"POST",body:JSON.stringify({name:"Ações da reunião",pos:"bottom"})});
   checklistId=checklist.id;
   for(const action of m.actions) await trelloFetch(`/checklists/${encodeURIComponent(checklist.id)}/checkItems`,{method:"POST",body:JSON.stringify({name:`${action.task} | ${action.person||"A confirmar"} | ${action.due||"Sem prazo"} | ${action.priority||"Média"}`,checked:Boolean(action.done),pos:"bottom"})});
 }
 const now=new Date().toISOString(),id=existing?.id||crypto.randomUUID();
 await db.prepare("INSERT INTO trello_exports(id,email,local_meeting_id,card_id,card_url,checklist_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(email,local_meeting_id) DO UPDATE SET card_id=excluded.card_id,card_url=excluded.card_url,checklist_id=excluded.checklist_id,updated_at=excluded.updated_at").bind(id,email,String(m.id),card.id,card.url,checklistId||null,existing?.createdAt||now,now).run();
 return{cardId:card.id,cardUrl:card.url,syncedAt:now,created:!existing};
}
