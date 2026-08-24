export type MeetingAction={id:string;task:string;person:string;due:string;priority:"Alta"|"Média"|"Baixa";done:boolean;evidence?:string;confidence?:number};
export type MeetingDecision={id?:string;text:string;kind:"decisão"|"pendência"|"bloqueio";evidence?:string;person?:string;due?:string;resolved?:boolean;confidence?:number};
export type MindMapBranch={topic:string;summary:string;subtopics:string[]};
export type MindMap={title:string;branches:MindMapBranch[]};
export type MeetingAnalysis={summary:string;minutes:string;actions:MeetingAction[];decisions:MeetingDecision[];themes?:string[];mindMap?:MindMap;processedAt:string;processingMode?:"semantic"|"local"};

const sentences=(text:string)=>text.split(/(?<=[.!?])\s+|\n+/).map(s=>s.trim()).filter(Boolean);

export function processTranscript(text:string):MeetingAnalysis{
  const lines=sentences(text);
  const actionLines=lines.filter(s=>/\b(vou|vamos|precisamos|deve|ficou de|respons[aá]vel|entregar|enviar|revisar|validar|publicar)\b/i.test(s));
  const decisionLines=lines.filter(s=>/\b(decidimos|decidido|aprovado|aprovada|definimos|acordado|combinado)\b/i.test(s));
  const blockerLines=lines.filter(s=>/\b(bloqueio|impedimento|depende|problema|risco|não podemos|n[aã]o conseguimos)\b/i.test(s));
  const pendingLines=lines.filter(s=>/\b(pendente|avaliar|confirmar|verificar|a definir)\b/i.test(s));
  const actions:MeetingAction[]=actionLines.slice(0,12).map((task,i)=>({id:`a-${Date.now()}-${i}`,task,person:"A confirmar",due:"Sem prazo",priority:/urgente|hoje|amanhã|alta prioridade/i.test(task)?"Alta":"Média",done:false}));
  const decisions:MeetingDecision[]=[...decisionLines.map(text=>({text,kind:"decisão" as const})),...pendingLines.map(text=>({text,kind:"pendência" as const})),...blockerLines.map(text=>({text,kind:"bloqueio" as const}))].slice(0,15).map((item,index)=>({...item,id:`d-${Date.now()}-${index}`,evidence:item.text,person:"A confirmar",due:"Sem prazo",resolved:false}));
  const summary=lines.slice(0,6).join(" ")||"A transcrição ainda não contém conteúdo suficiente para gerar um resumo.";
  const minutes=`ATA DA REUNIÃO\n\nResumo\n${summary}\n\nDecisões\n${decisionLines.length?decisionLines.map(x=>`• ${x}`).join("\n"):"Nenhuma decisão explícita identificada."}\n\nAções\n${actions.length?actions.map(x=>`• ${x.task} — ${x.person} — ${x.due}`).join("\n"):"Nenhuma ação explícita identificada."}\n\nPendências e bloqueios\n${[...pendingLines,...blockerLines].length?[...pendingLines,...blockerLines].map(x=>`• ${x}`).join("\n"):"Nenhuma pendência explícita identificada."}`;
  return{summary,minutes,actions,decisions,processedAt:new Date().toISOString(),processingMode:"local"};
}
