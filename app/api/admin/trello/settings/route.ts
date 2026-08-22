import{accessError,requireAdmin}from"../../../../server-access";
import{saveSettings,trelloStatus}from"../../../../trello";
export async function GET(){try{await requireAdmin();return Response.json(await trelloStatus());}catch(error){return accessError(error)}}
export async function POST(request:Request){try{await requireAdmin();const body=await request.json()as Record<string,unknown>;for(const key of["boardId","boardName","listId","listName"])if(typeof body[key]!=="string"||!String(body[key]).trim())return Response.json({error:"Selecione um Quadro e uma Lista válidos."},{status:400});return Response.json({settings:await saveSettings(body as{boardId:string;boardName:string;listId:string;listName:string})});}catch(error){return accessError(error)}}
