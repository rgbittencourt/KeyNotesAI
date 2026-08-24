import type{MeetingAction,MeetingAnalysis,MeetingDecision,MindMap}from"./local-processing";

type SemanticPayload={summary:string;themes:string[];mindMap:MindMap;actions:Array<Omit<MeetingAction,"id"|"done">>;decisions:Array<Omit<MeetingDecision,"id"|"resolved">>};

const bullets=(items:string[],empty:string)=>items.length?items.map(item=>`• ${item}`).join("\n"):empty;

export async function analyzeTranscriptSemantically(transcript:string):Promise<MeetingAnalysis>{
 const response=await fetch("/api/analyze-meeting",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({transcript})});
 const body=await response.json().catch(()=>({error:"O serviço retornou uma resposta inválida."})) as SemanticPayload&{error?:string};
 if(!response.ok)throw new Error(body.error||"Não foi possível analisar esta reunião.");
 const stamp=Date.now();
 const actions=(body.actions||[]).map((item,index)=>({...item,id:`a-${stamp}-${index}`,done:false}));
 const decisions=(body.decisions||[]).map((item,index)=>({...item,id:`d-${stamp}-${index}`,resolved:false}));
 const taken=decisions.filter(item=>item.kind==="decisão").map(item=>item.text),pending=decisions.filter(item=>item.kind==="pendência").map(item=>item.text),blocked=decisions.filter(item=>item.kind==="bloqueio").map(item=>item.text);
 const minutes=`ATA DA REUNIÃO\n\nSíntese das discussões\n${body.summary}\n\nTemas principais\n${bullets(body.themes||[],"Nenhum tema central identificado com segurança.")}\n\nDecisões\n${bullets(taken,"Nenhuma decisão confirmada identificada.")}\n\nEncaminhamentos\n${bullets(actions.map(item=>`${item.task} — ${item.person} — ${item.due}`),"Nenhum encaminhamento confirmado identificado.")}\n\nPendências\n${bullets(pending,"Nenhuma pendência identificada.")}\n\nBloqueios e riscos\n${bullets(blocked,"Nenhum bloqueio ou risco identificado.")}`;
 return{summary:body.summary,themes:body.themes||[],mindMap:body.mindMap,actions,decisions,minutes,processedAt:new Date().toISOString(),processingMode:"semantic"};
}
