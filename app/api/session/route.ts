import{accessError,requireAccess}from"../../server-access";
export async function GET(){try{const user=await requireAccess();return Response.json({user})}catch(error){return accessError(error)}}
