import{accessError,requireAccess}from"../../../server-access";
import{trelloStatus}from"../../../trello";
export async function GET(){try{const user=await requireAccess();const status=await trelloStatus();return Response.json({...status,isAdmin:user.role==="admin"});}catch(error){return accessError(error)}}
