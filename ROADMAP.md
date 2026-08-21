# Roadmap do KeyNotesAI

Registro das melhorias aprovadas como ideias para evolução futura. Este arquivo
é a referência para retomarmos a priorização e a implementação sem depender do
histórico da conversa.

## Ordem recomendada

1. Sincronização central entre dispositivos.
2. Integração completa com o Trello.
3. Chat semântico real com evidências.
4. Identificação automática de falantes.
5. Calendário, notificações e aprovações.
6. Custos, auditoria, privacidade e retenção.

## 1. Sincronização central entre dispositivos

- Tornar o Drive a fonte dos arquivos institucionais.
- Manter no banco central metadados, ações, decisões, chat, estados e links.
- Permitir que um usuário encontre suas reuniões em outro aparelho.
- Definir permissões de proprietário, participante, revisor e administrador.
- Tratar conflitos e manter versão/histórico das alterações.
- Preservar funcionamento offline com sincronização posterior, quando viável.

## 2. Integração completa com o Trello

- Conectar uma conta institucional do INOVALAB.
- Permitir ao Admin selecionar Quadro e Lista.
- Criar um único card por reunião.
- Inserir resumo, decisões, ações e responsáveis.
- Adicionar links da pasta, documentos, gravação e foto no Google Drive.
- Atualizar sempre o mesmo card e impedir duplicatas.
- Guardar no KeyNotesAI o identificador e o link do card.
- Refletir responsáveis, prazos, prioridades e conclusão das ações.

## 3. Chat semântico real com evidências

- Responder usando a API da OpenAI e somente dados da reunião selecionada.
- Manter todo o histórico de perguntas e respostas por reunião.
- Citar trechos da transcrição e, quando possível, seus horários.
- Entender perguntas de continuidade e referências ao contexto anterior.
- Informar claramente quando não houver evidência suficiente.
- Permitir busca simultânea em várias reuniões autorizadas.

## 4. Identificação automática de falantes

- Avaliar transcrição com diarização de falantes.
- Associar cada trecho ao participante correto.
- Melhorar a extração de responsáveis por ações e de autoria das decisões.
- Permitir correção manual dos nomes identificados.
- Gerar estatísticas opcionais de tempo de fala, sem inseri-las na ata por
  padrão.

## 5. Calendário, notificações e aprovações

- Integrar reuniões e prazos ao Google Calendar.
- Criar reuniões recorrentes e lembretes.
- Notificar responsáveis sobre ações próximas ou atrasadas.
- Adotar estados: Rascunho, Em revisão, Aprovado, Arquivado e Sincronizado.
- Tratar somente a versão aprovada como documento oficial.
- Permitir modelos diferentes de ata e documentos por tipo de reunião.

## 6. Custos, auditoria, privacidade e retenção

- Mostrar minutos transcritos, operações de IA e custo estimado em reais.
- Comparar uso do modo híbrido e do modo totalmente OpenAI.
- Alertar usuários e Admin sobre aproximação dos limites.
- Definir teto financeiro mensal e bloqueio automático opcional.
- Registrar quem criou, alterou, arquivou ou excluiu cada reunião.
- Permitir restaurar versões anteriores e itens enviados à lixeira.
- Configurar prazo de retenção para gravações e outros arquivos.
- Registrar consentimento para gravação e fotos da reunião.
- Restringir downloads e compartilhamentos quando necessário.

## Outras ideias preservadas

- Transcrição e legendas ao vivo.
- Identificação de decisões e ações durante a reunião.
- Alertas quando uma ação estiver sem responsável ou prazo.
- Comparação entre reuniões recorrentes e acompanhamento de pendências.
- Pesquisa geral por reuniões, participantes, temas, decisões e ações.
- Compartilhamento externo com link temporário e controlado.
- Envio de resumo por e-mail.
- Suporte a múltiplas fotos e anexos.
- Importação de reuniões do Google Meet, Microsoft Teams e Zoom.
- Painel de saúde das integrações, sincronizações e falhas.

## Ideia de autenticação já preservada

Manter por enquanto o acesso com ChatGPT. Se a adoção crescer, implementar
acesso por e-mail autorizado e código temporário, com vinculação opcional de
uma conta ChatGPT. Usuários institucionais ou pessoais continuariam sujeitos ao
cadastro, bloqueio e limites definidos pelo Admin.
