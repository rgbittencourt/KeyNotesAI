const analysisSchema={
 type:"object",additionalProperties:false,required:["summary","themes","actions","decisions"],properties:{
  summary:{type:"string",description:"Síntese executiva fiel, temática e não cronológica, em dois a quatro parágrafos."},
  themes:{type:"array",maxItems:8,items:{type:"string"}},
  actions:{type:"array",maxItems:30,items:{type:"object",additionalProperties:false,required:["task","person","due","priority","evidence","confidence"],properties:{task:{type:"string"},person:{type:"string"},due:{type:"string"},priority:{type:"string",enum:["Alta","Média","Baixa"]},evidence:{type:"string"},confidence:{type:"number",minimum:0,maximum:1}}}},
  decisions:{type:"array",maxItems:30,items:{type:"object",additionalProperties:false,required:["text","kind","evidence","person","due","confidence"],properties:{text:{type:"string"},kind:{type:"string",enum:["decisão","pendência","bloqueio"]},evidence:{type:"string"},person:{type:"string"},due:{type:"string"},confidence:{type:"number",minimum:0,maximum:1}}}}
 }
}as const;

const instructions=`Você é um analista de reuniões em português brasileiro. Analise somente a transcrição fornecida. Produza uma síntese temática: selecione assuntos materialmente importantes, resultados, argumentos e consequências; não resuma apenas o começo nem siga a ordem cronológica. Diferencie rigorosamente decisão confirmada, sugestão, pergunta, intenção, pendência e bloqueio. Uma ação exige compromisso ou encaminhamento suficientemente claro. Extraia responsável e prazo somente quando sustentados pelo texto; caso contrário use exatamente "A confirmar" e "Sem prazo". Cada item deve conter uma evidência curta copiada ou minimamente normalizada da transcrição e confiança entre 0 e 1. Não transforme frases negadas, hipóteses ou exemplos em fatos. Não invente nomes, datas, valores ou conclusões. Una duplicatas e preserve divergências relevantes.`;

export async function POST(request:Request){
 try{
  const key=process.env.OPENAI_API_KEY;
  if(!key)return Response.json({error:"A análise semântica ainda não foi conectada pelo administrador."},{status:503});
  const payload=await request.json().catch(()=>null)as{transcript?:unknown}|null,transcript=typeof payload?.transcript==="string"?payload.transcript.trim():"";
  if(transcript.length<40)return Response.json({error:"A transcrição é curta demais para uma análise confiável."},{status:400});
  if(transcript.length>400000)return Response.json({error:"A transcrição excede o limite de análise. Divida a reunião em partes menores."},{status:413});
  const apiResponse=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{authorization:`Bearer ${key}`,"content-type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_ANALYSIS_MODEL||"gpt-5.4",store:false,instructions,input:`TRANSCRIÇÃO DA REUNIÃO:\n\n${transcript}`,text:{format:{type:"json_schema",name:"meeting_analysis",strict:true,schema:analysisSchema}}})});
  const result=await apiResponse.json()as{error?:{message?:string};output?:Array<{type?:string;content?:Array<{type?:string;text?:string}>}>};
  if(!apiResponse.ok)return Response.json({error:result.error?.message||"O modelo não conseguiu analisar a reunião."},{status:502});
  const outputText=result.output?.flatMap(item=>item.type==="message"?(item.content||[]):[]).find(item=>item.type==="output_text")?.text;
  if(!outputText)throw new Error("A análise retornou sem conteúdo estruturado.");
  return Response.json(JSON.parse(outputText));
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Falha inesperada na análise semântica."},{status:500})}
}
