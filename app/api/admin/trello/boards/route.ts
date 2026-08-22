import{accessError,requireAdmin}from"../../../../server-access";
import{listBoards,listLists}from"../../../../trello";
export async function GET(request:Request){try{await requireAdmin();const boardId=new URL(request.url).searchParams.get("boardId");return Response.json(boardId?{lists:await listLists(boardId)}:{boards:await listBoards()});}catch(error){return error instanceof Response?accessError(error):Response.json({error:error instanceof Error?error.message:"Falha ao consultar o Trello."},{status:502})}}
