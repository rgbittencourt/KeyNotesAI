export type MeetingAction={id:string;task:string;person:string;due:string;priority:"Alta"|"Média"|"Baixa";done:boolean};
export type MeetingDecision={text:string;kind:"decisão"|"pendência"|"bloqueio"};

const sentences=(text:string)=>text.split(/(?<=[.!?])\s+|\n+/).map(s=>s.trim()).filter(Boolean);

export function processTranscript(text:string){
  const lines=sentences(text);
  const actionLines=lines.filter(s=>/\b(vou|vamos|precisamos|deve|ficou de|respons[aá]vel|entregar|enviar|revisar|validar|publicar)\b/i.test(s));
  const decisionLines=lines.filter(s=>/\b(decidimos|decidido|aprovado|aprovada|definimos|acordado|combinado)\b/i.test(s));
  const blockerLines=lines.filter(s=>/\b(bloqueio|impedimento|depende|problema|risco|não podemos|n[aã]o conseguimos)\b/i.test(s));
  const pendingLines=lines.filter(s=>/\b(pendente|avaliar|confirmar|verificar|a definir)\b/i.test(s));
  const actions:MeetingAction[]=actionLines.slice(0,12).map((task,i)=>({id:`a-${Date.now()}-${i}`,task,person:"A confirmar",due:"Sem prazo",priority:/urgente|hoje|amanhã|alta prioridade/i.test(task)?"Alta":"Média",done:false}));
  const decisions:MeetingDecision[]=[...decisionLines.map(text=>({text,kind:"decisão" as const})),...pendingLines.map(text=>({text,kind:"pendência" as const})),...blockerLines.map(text=>({text,kind:"bloqueio" as const}))].slice(0,15);
  const summary=lines.slice(0,6).join(" ")||"A transcrição ainda não contém conteúdo suficiente para gerar um resumo.";
  const minutes=`ATA DA REUNIÃO\n\nResumo\n${summary}\n\nDecisões\n${decisionLines.length?decisionLines.map(x=>`• ${x}`).join("\n"):"Nenhuma decisão explícita identificada."}\n\nAções\n${actions.length?actions.map(x=>`• ${x.task} — ${x.person} — ${x.due}`).join("\n"):"Nenhuma ação explícita identificada."}\n\nPendências e bloqueios\n${[...pendingLines,...blockerLines].length?[...pendingLines,...blockerLines].map(x=>`• ${x}`).join("\n"):"Nenhuma pendência explícita identificada."}`;
  return{summary,minutes,actions,decisions,processedAt:new Date().toISOString()};
}
