import type{DeviceRecording}from"./page";

const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim();
const stop=new Set("a o as os de da do das dos e em para por com que qual quais foi foram um uma na no nas nos sobre me minha meu suas seus tem teve ficou ficaram quero saber".split(" "));
const families:Record<string,string[]>={tarefa:["tarefa","tarefas","acao","acoes","encaminhamento","encaminhamentos","responsavel","responsabilidade","entregar","fazer","revisar","enviar","prazo"],decisao:["decisao","decisoes","decidido","definido","aprovado","acordado","combinado"],prazo:["prazo","data","quando","entrega","ate","dia"],participante:["participante","participantes","presenca","presentes","participou"],pendencia:["pendencia","pendencias","bloqueio","bloqueios","risco","riscos","problema"]};
const expand=(words:string[])=>new Set(words.flatMap(word=>Object.values(families).find(group=>group.includes(word))||[word]));
const tokens=(value:string)=>normalize(value).split(" ").filter(word=>word.length>2&&!stop.has(word));

export function answerMeetingQuestion(recording:DeviceRecording,question:string){
 const q=tokens(question),expanded=expand(q),normalizedQuestion=normalize(question);
 const asksActions=[...families.tarefa].some(x=>normalizedQuestion.includes(x));
 const asksDecisions=families.decisao.some(x=>normalizedQuestion.includes(x));
 const asksPending=families.pendencia.some(x=>normalizedQuestion.includes(x));
 const asksParticipants=families.participante.some(x=>normalizedQuestion.includes(x));
 if(asksParticipants){const people=(recording.participants||"").split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);return people.length?`Participantes registrados: ${people.join(", ")}.`:"A lista de presença desta reunião ainda não foi preenchida."}
 if(asksActions&&recording.actions?.length){const relevant=recording.actions.filter(action=>score(`${action.task} ${action.person} ${action.due}`,expanded)>0);const selected=relevant.length?relevant:recording.actions;return`Encontrei ${selected.length} encaminhamento(s):\n${selected.map(action=>`• ${action.task}\n  Responsável: ${action.person} · Prazo: ${action.due} · Prioridade: ${action.priority}`).join("\n")}`}
 if((asksDecisions||asksPending)&&recording.decisions?.length){const wanted=recording.decisions.filter(item=>asksDecisions?item.kind==="decisão":item.kind!=="decisão");const selected=wanted.length?wanted:recording.decisions;return`${asksDecisions?"Decisões":"Pendências e bloqueios"} encontrados:\n${selected.map(item=>`• ${item.text}`).join("\n")}`}
 const sources=[recording.summary||"",...(recording.transcript||"").split(/(?<=[.!?])\s+|\n+/)].map(text=>text.trim()).filter(Boolean);
 const ranked=sources.map((text,index)=>({text,index,value:score(text,expanded)})).filter(x=>x.value>0).sort((a,b)=>b.value-a.value||a.index-b.index).slice(0,5);
 if(!ranked.length)return"Não encontrei evidência suficiente para responder com segurança. Tente usar nomes, assuntos ou termos mencionados na reunião.";
 return`Com base na reunião, encontrei estes trechos relevantes:\n${ranked.map(item=>`• ${item.text}`).join("\n")}`;
}
function score(text:string,query:Set<string>){const words=tokens(text),normalized=normalize(text);let points=0;for(const term of query){if(normalized.includes(term))points+=term.length>6?4:2;else if(words.some(word=>word.startsWith(term.slice(0,Math.max(4,term.length-2)))||term.startsWith(word.slice(0,Math.max(4,word.length-2)))))points+=1}return points}
