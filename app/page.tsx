"use client";
import { useEffect, useRef, useState } from "react";
import { type MeetingAction, type MeetingDecision } from "./local-processing";
import type { MindMap } from "./local-processing";
import RealFeatureView from "./real-feature-view";
import AdminPanel from "./admin-panel";
import TrelloIntegrationPanel from "./trello-integration-panel";
type SessionUser = {
  email: string;
  name: string;
  role: "admin" | "user";
  monthlyLimit: number;
  used: number;
  impersonatedBy?: { email: string; name: string };
};
type DriveStatus = {
  connected: boolean;
  accountEmail: string;
  rootFolderUrl: string;
  credentialsReady: boolean;
};
type TrelloStatus={credentialsReady:boolean;configured:boolean;settings?:{boardName:string;listName:string}|null;boardUrl?:string|null};

export type DeviceRecording = {
  id: number;
  name: string;
  createdAt: string;
  duration: string;
  size: string;
  url: string;
  audioBlob?: Blob;
  cloudSynced?: boolean;
  ownerEmail?: string;
  audioMimeType?: string;
  meetingDate?: string;
  meetingTime?: string;
  participants?: string;
  department?: string;
  agenda?: string;
  transcript?: string;
  summary?: string;
  themes?: string[];
  mindMap?: MindMap;
  minutes?: string;
  actions?: MeetingAction[];
  decisions?: MeetingDecision[];
  documentOverrides?: Partial<
    Record<"ata" | "resumo" | "acoes" | "decisoes" | "mapa", string>
  >;
  processedAt?: string;
  processingMode?: "semantic" | "local";
  transcriptionMode?: "hybrid" | "openai" | "diarized";
  speakerSegments?: Array<{
    speaker: string;
    start: number;
    end: number;
    text: string;
  }>;
  speakerNames?: Record<string, string>;
  voiceSamples?: Array<{ name: string; reference: string }>;
  speakerReviewStatus?: "pending" | "confirmed";
  recordingSource?: "microphone" | "google-meet" | "google-meet-microphone";
  driveFolderUrl?: string;
  driveFolderId?: string;
  driveFiles?: Array<{ id: string; name: string; webViewLink: string }>;
  driveSyncedAt?: string;
  trelloCardId?: string;
  trelloCardUrl?: string;
  trelloSyncedAt?: string;
  meetingPhotoBlob?: Blob;
  meetingPhotoUrl?: string;
  meetingPhotoName?: string;
  chatHistory?: Array<{
    id: string;
    role: "user" | "assistant";
    text: string;
    createdAt: string;
  }>;
  attachments?: MeetingAttachment[];
};
export type MeetingAttachment={id:string;name:string;type:"file"|"link";mimeType?:string;size?:string;blob?:Blob;url?:string;externalUrl?:string;createdAt:string};
type ScheduledMeeting = {
  id: number;
  title: string;
  date: string;
  time: string;
};

function openRecordingsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("keynotesai-local", 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore("recordings", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function persistRecording(
  record: Omit<DeviceRecording, "url"> & { blob: Blob },
) {
  const db = await openRecordingsDb();
  const tx = db.transaction("recordings", "readwrite");
  tx.objectStore("recordings").put(record);
}
async function patchRecording(id: number, patch: Partial<DeviceRecording>) {
  const db = await openRecordingsDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("recordings", "readwrite"),
      store = tx.objectStore("recordings"),
      get = store.get(id);
    get.onsuccess = () => {
      store.put({ ...get.result, ...patch, id });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function removeRecording(id: number) {
  const db = await openRecordingsDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("recordings", "readwrite");
    tx.objectStore("recordings").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function loadRecordings(): Promise<DeviceRecording[]> {
  const db = await openRecordingsDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("recordings").objectStore("recordings").getAll();
    req.onsuccess = () =>
      resolve(
        req.result
          .map((r) => ({
            ...r,
            url: URL.createObjectURL(r.blob),
            audioBlob: r.blob,
            audioMimeType: r.audioMimeType || r.blob?.type,
            meetingPhotoUrl: r.meetingPhotoBlob
              ? URL.createObjectURL(r.meetingPhotoBlob)
              : undefined,
            attachments: (r.attachments || []).map((attachment: MeetingAttachment) =>
              attachment.type === "file" && attachment.blob
                ? { ...attachment, url: URL.createObjectURL(attachment.blob) }
                : attachment,
            ),
          }))
          .reverse(),
      );
    req.onerror = () => reject(req.error);
  });
}

function cloudMeeting(record:DeviceRecording){
  const copy={...record} as Record<string,unknown>;delete copy.url;delete copy.audioBlob;delete copy.meetingPhotoBlob;
  copy.attachments=(record.attachments||[]).map(({blob:_blob,url:_url,...item})=>item);
  return copy;
}
async function uploadMeetingToCloud(record:DeviceRecording,blob:Blob){
  const form=new FormData();form.set("meeting",JSON.stringify(cloudMeeting(record)));form.set("audio",blob,`${record.name}.${record.audioMimeType?.includes("mp4")?"m4a":record.audioMimeType?.includes("mpeg")?"mp3":"webm"}`);
  const response=await fetch("/api/meetings",{method:"POST",body:form}),body=await response.json() as{meeting?:DeviceRecording;error?:string};
  if(!response.ok||!body.meeting)throw new Error(body.error||"Não foi possível sincronizar a reunião");return body.meeting;
}
async function saveMeetingToCloud(record:DeviceRecording){
  const response=await fetch("/api/meetings",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({meeting:cloudMeeting(record)})});
  if(!response.ok){const body=await response.json().catch(()=>({})) as{error?:string};throw new Error(body.error||"Não foi possível sincronizar a reunião")}
}

const meetings = [
  {
    time: "09:00",
    title: "Planejamento • Sprint 18",
    meta: "Produto · 8 participantes",
    tone: "live",
    label: "Em 12 min",
  },
  {
    time: "14:30",
    title: "Alinhamento com INOVALAB",
    meta: "Parcerias · 5 participantes",
    tone: "soon",
    label: "Hoje",
  },
  {
    time: "16:00",
    title: "Revisão da experiência PWA",
    meta: "Design · 4 participantes",
    tone: "later",
    label: "Hoje",
  },
];
const actions = [
  {
    task: "Validar fluxo de onboarding",
    person: "Ana Lima",
    initials: "AL",
    due: "22 ago",
    priority: "Alta",
  },
  {
    task: "Publicar protótipo navegável",
    person: "Rafael Melo",
    initials: "RM",
    due: "25 ago",
    priority: "Média",
  },
  {
    task: "Revisar integração com Trello",
    person: "João Silva",
    initials: "JS",
    due: "28 ago",
    priority: "Baixa",
  },
];
const recent = [
  {
    title: "Kick-off • KeyNotesAI",
    date: "Ontem, 15:00",
    duration: "48 min",
    tag: "Produto",
    color: "#b98b4e",
  },
  {
    title: "Descoberta com usuários",
    date: "18 ago, 10:30",
    duration: "1h 12 min",
    tag: "Pesquisa",
    color: "#3f765e",
  },
  {
    title: "Checkpoint técnico",
    date: "16 ago, 16:00",
    duration: "36 min",
    tag: "Tecnologia",
    color: "#637183",
  },
];

function FeatureView({
  active,
  notify,
  recordings,
  recording,
  recordingSeconds,
  stopRecording,
}: {
  active: string;
  notify: (message: string) => void;
  recordings: DeviceRecording[];
  recording: boolean;
  recordingSeconds: number;
  stopRecording: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [catchUp, setCatchUp] = useState(false);
  const [synced, setSynced] = useState(false);
  const [selectedRecordingId, setSelectedRecordingId] = useState<number | null>(
    null,
  );
  const ask = () => {
    if (!question.trim()) return;
    setAnswer(
      "Sim. O cliente aprovou o orçamento de R$ 48 mil, condicionado ao envio do cronograma revisado até 22 de agosto. A decisão foi registrada aos 32:14.",
    );
    setQuestion("");
  };
  const downloadDocument = (name: string, content: string) => {
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    notify("Documento baixado");
  };

  if (active === "Arquivos") {
    const selected = recordings.find(
      (r) => r.id === (selectedRecordingId ?? recordings[0]?.id),
    );
    return (
      <section className="feature-page">
        <div className="feature-title">
          <div>
            <p className="eyebrow">BIBLIOTECA DA REUNIÃO</p>
            <h1>Gravações e documentos</h1>
            <p>
              Cada gravação possui seu próprio conjunto de documentos e estado
              de processamento.
            </p>
          </div>
        </div>
        <div className="library-grid">
          <article className="card library-card">
            <div className="card-head">
              <div>
                <p className="eyebrow">REUNIÕES NO APARELHO</p>
                <h2>Gravações</h2>
              </div>
              <span>{recordings.length} reunião(ões)</span>
            </div>
            {recordings.length === 0 ? (
              <div className="empty-library">
                <span>◉</span>
                <strong>Nenhuma gravação local</strong>
                <p>
                  Use “Gravar nova reunião” na Visão geral e permita o acesso ao
                  microfone.
                </p>
              </div>
            ) : (
              recordings.map((r) => (
                <div
                  className={`recording-row ${selected?.id === r.id ? "selected" : ""}`}
                  key={r.id}
                  onClick={() => setSelectedRecordingId(r.id)}
                >
                  <span>▶</span>
                  <div>
                    <strong>{r.name}</strong>
                    <small>
                      {r.createdAt} · {r.duration} · {r.size}
                    </small>
                    <audio
                      controls
                      src={r.url}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <a
                    href={r.url}
                    download={`${r.name}.webm`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    ↓ Baixar
                  </a>
                </div>
              ))
            )}
          </article>
          <article className="card library-card">
            <div className="card-head">
              <div>
                <p className="eyebrow">DOCUMENTOS DA REUNIÃO</p>
                <h2>{selected?.name ?? "Selecione uma reunião"}</h2>
              </div>
              {selected && (
                <span className="processing-badge">Aguardando IA</span>
              )}
            </div>
            {!selected ? (
              <div className="empty-library">
                <span>☷</span>
                <strong>Nenhuma reunião selecionada</strong>
                <p>Grave ou importe um áudio para iniciar.</p>
              </div>
            ) : (
              <>
                <div className="processing-note">
                  <span>◷</span>
                  <div>
                    <strong>Áudio registrado com sucesso</strong>
                    <p>
                      A transcrição e a geração automática dependem da conexão
                      com o serviço de IA. Nenhum conteúdo demonstrativo será
                      misturado à sua reunião.
                    </p>
                  </div>
                </div>
                {[
                  [
                    "Ata da reunião",
                    "Resumo, participantes, pauta e encaminhamentos",
                  ],
                  ["Resumo executivo", "Leitura rápida para gestores"],
                  ["Matriz de ações", "Responsáveis, prazos e prioridades"],
                  [
                    "Decisões e bloqueios",
                    "Registro consolidado das definições",
                  ],
                ].map((d) => (
                  <div className="document-row pending-doc" key={d[0]}>
                    <span>☷</span>
                    <div>
                      <strong>{d[0]}</strong>
                      <small>{d[1]}</small>
                    </div>
                    <em>Aguardando transcrição</em>
                  </div>
                ))}
              </>
            )}
          </article>
        </div>
      </section>
    );
  }

  if (active === "Reuniões")
    return (
      <section className="feature-page">
        {recording ? (
          <>
            <div className="feature-title">
              <div>
                <p className="eyebrow">SUA REUNIÃO EM ANDAMENTO</p>
                <h1>Nova reunião</h1>
                <p>Gravação iniciada neste aparelho · áudio salvo localmente</p>
              </div>
              <div className="live-pill">
                <i /> AO VIVO ·{" "}
                {String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:
                {String(recordingSeconds % 60).padStart(2, "0")}
              </div>
            </div>
            <div className="active-meeting-grid">
              <article className="card active-capture">
                <div className="capture-orbit">
                  <span>●</span>
                </div>
                <p className="eyebrow">CAPTURA DE ÁUDIO</p>
                <h2>Gravação em andamento</h2>
                <strong>
                  {String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:
                  {String(recordingSeconds % 60).padStart(2, "0")}
                </strong>
                <div className="capture-bars">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                    <i key={n} />
                  ))}
                </div>
                <p>
                  Mantenha esta página aberta. Ao encerrar, a reunião será
                  registrada no dashboard e o áudio aparecerá em Arquivos.
                </p>
                <button onClick={stopRecording}>
                  <i /> Encerrar e salvar reunião
                </button>
              </article>
              <article className="card meeting-live-status">
                <p className="eyebrow">PROCESSAMENTO DA REUNIÃO</p>
                <h2>O que acontecerá depois</h2>
                {[
                  ["1", "Áudio", "Sendo capturado agora"],
                  ["2", "Reunião", "Será adicionada ao histórico"],
                  ["3", "Transcrição", "Aguardará conexão com a IA"],
                  [
                    "4",
                    "Documentos",
                    "Serão associados somente a esta reunião",
                  ],
                ].map((x, i) => (
                  <div className={i === 0 ? "current" : ""} key={x[0]}>
                    <span>{i === 0 ? "●" : x[0]}</span>
                    <p>
                      <strong>{x[1]}</strong>
                      <small>{x[2]}</small>
                    </p>
                  </div>
                ))}
              </article>
            </div>
          </>
        ) : (
          <div className="no-live-meeting card">
            <span>◉</span>
            <p className="eyebrow">NENHUMA REUNIÃO EM ANDAMENTO</p>
            <h1>Comece pela Visão geral</h1>
            <p>
              Ao iniciar uma gravação, esta área mostrará somente a sua reunião
              real, o tempo decorrido e o estado do processamento.
            </p>
          </div>
        )}
      </section>
    );

  if (active === "Ações")
    return (
      <section className="feature-page">
        <div className="feature-title">
          <div>
            <p className="eyebrow">ACTION MATRIX</p>
            <h1>Ações e prazos</h1>
            <p>Responsabilidades extraídas automaticamente das reuniões.</p>
          </div>
          <button
            className="primary-btn"
            onClick={() => {
              setSynced(true);
              notify("Ações exportadas para o Trello");
            }}
          >
            {synced ? "✓ Sincronizado" : "Exportar para o Trello"}
          </button>
        </div>
        <article className="card matrix-full">
          <div className="matrix-head">
            <span>AÇÃO</span>
            <span>RESPONSÁVEL</span>
            <span>REUNIÃO</span>
            <span>PRAZO</span>
            <span>PRIORIDADE</span>
          </div>
          {actions
            .concat([
              {
                task: "Enviar cronograma revisado",
                person: "Marina Costa",
                initials: "MC",
                due: "22 ago",
                priority: "Alta",
              },
            ])
            .map((a, i) => (
              <div className="matrix-row" key={a.task}>
                <button
                  aria-label="Concluir"
                  onClick={() => notify("Ação concluída")}
                />
                <strong>{a.task}</strong>
                <span className="person-chip">
                  <i>{a.initials}</i>
                  {a.person}
                </span>
                <span>
                  {i === 3 ? "Reunião com cliente" : "Planejamento • Sprint 18"}
                </span>
                <time>{a.due}</time>
                <em className={a.priority.toLowerCase().replace("mé", "me")}>
                  {a.priority}
                </em>
              </div>
            ))}
        </article>
      </section>
    );

  if (active === "Decisões")
    return (
      <section className="feature-page">
        <div className="feature-title">
          <div>
            <p className="eyebrow">DECISION & BLOCKERS LOG</p>
            <h1>Decisões e bloqueios</h1>
            <p>Clareza executiva sem precisar reler toda a transcrição.</p>
          </div>
          <button
            className="ghost-btn"
            onClick={() => notify("Relatório copiado")}
          >
            Copiar relatório
          </button>
        </div>
        <div className="decision-grid">
          <article className="card decision-column accepted">
            <div className="decision-heading">
              <span>✓</span>
              <div>
                <small>3 REGISTROS</small>
                <h2>Decisões tomadas</h2>
              </div>
            </div>
            <div>
              <strong>Priorizar o novo onboarding</strong>
              <p>
                A equipe aprovou a nova experiência como principal entrega da
                Sprint 18.
              </p>
              <small>Planejamento · hoje, 09:18</small>
            </div>
            <div>
              <strong>Orçamento aprovado</strong>
              <p>O cliente aprovou R$ 48 mil mediante cronograma atualizado.</p>
              <small>Reunião com cliente · ontem</small>
            </div>
          </article>
          <article className="card decision-column pending">
            <div className="decision-heading">
              <span>?</span>
              <div>
                <small>2 REGISTROS</small>
                <h2>Pontos pendentes</h2>
              </div>
            </div>
            <div>
              <strong>Definir ferramenta de analytics</strong>
              <p>Amplitude e PostHog permanecem em avaliação.</p>
              <small>Responsável: Ana Lima</small>
            </div>
            <div>
              <strong>Confirmar data do piloto</strong>
              <p>Depende da disponibilidade de cinco usuários.</p>
              <small>Prazo: 25 de agosto</small>
            </div>
          </article>
          <article className="card decision-column blocked">
            <div className="decision-heading">
              <span>!</span>
              <div>
                <small>1 REGISTRO</small>
                <h2>Objeções e bloqueios</h2>
              </div>
            </div>
            <div>
              <strong>Autenticação do Trello</strong>
              <p>
                O ambiente de homologação ainda aguarda credenciais
                administrativas.
              </p>
              <small>Impacto: integração bloqueada</small>
            </div>
          </article>
        </div>
      </section>
    );

  return (
    <section className="feature-page qa-page">
      <div className="feature-title">
        <div>
          <p className="eyebrow">PERGUNTE À REUNIÃO</p>
          <h1>Converse com seu histórico.</h1>
          <p>Respostas fundamentadas nas transcrições, atas e decisões.</p>
        </div>
      </div>
      <div className="qa-grid">
        <aside className="card meeting-picker">
          <label>REUNIÃO SELECIONADA</label>
          <button>
            <span className="doc">☷</span>
            <div>
              <strong>Kick-off • KeyNotesAI</strong>
              <small>Ontem · 48 min</small>
            </div>
            <b>⌄</b>
          </button>
          <p>SUGESTÕES</p>
          {[
            "Quais decisões foram tomadas?",
            "Quem ficou responsável por cada ação?",
            "Quais são os principais riscos?",
          ].map((x) => (
            <button
              className="suggestion"
              key={x}
              onClick={() => setQuestion(x)}
            >
              {x}
            </button>
          ))}
        </aside>
        <article className="card chat-panel">
          <div className="chat-empty">
            <span>✦</span>
            <h2>Pergunte qualquer coisa</h2>
            <p>
              Eu encontro a resposta e mostro exatamente onde ela apareceu na
              reunião.
            </p>
          </div>
          {answer && (
            <div className="ai-answer">
              <span>✦</span>
              <div>
                <p>{answer}</p>
                <button onClick={() => notify("Trecho da transcrição aberto")}>
                  Ver trecho · 32:14 →
                </button>
              </div>
            </div>
          )}
          <div className="ask-box">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              placeholder="Ex.: O cliente aprovou o orçamento?"
              aria-label="Pergunta"
            />
            <button onClick={ask} aria-label="Enviar pergunta">
              ↑
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}

export default function Home() {
  const [session, setSession] = useState<SessionUser | null | undefined>(
    undefined,
  );
  const [active, setActive] = useState("Visão geral");
  const [recording, setRecording] = useState(false);
  const [recordingPaused,setRecordingPaused]=useState(false);
  const [requestingMic, setRequestingMic] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [deviceRecordings, setDeviceRecordings] = useState<DeviceRecording[]>(
    [],
  );
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceStreamsRef = useRef<MediaStream[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const pausedAtRef=useRef(0);
  const pausedDurationRef=useRef(0);
  const participantsRef = useRef<string[]>([]);
  const voiceSamplesRef = useRef<Array<{ name: string; reference: string }>>([]);
  const audioImportRef = useRef<HTMLInputElement | null>(null);
  const [recordingIssue, setRecordingIssue] = useState("");
  const [toast, setToast] = useState("");
  const [headerPanel, setHeaderPanel] = useState<
    "help" | "notifications" | "profile" | null
  >(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [scheduledMeetings, setScheduledMeetings] = useState<
    ScheduledMeeting[]
  >([]);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [meetingTitleNow, setMeetingTitleNow] = useState("");
  const [newMeetingTranscriptionMode, setNewMeetingTranscriptionMode] =
    useState<"openai" | "diarized">("diarized");
  const [newMeetingRecordingSource, setNewMeetingRecordingSource] = useState<
    "microphone" | "google-meet" | "google-meet-microphone"
  >("google-meet-microphone");
  const [liveParticipants, setLiveParticipants] = useState<string[]>([]);
  const [liveVoiceSampleNames,setLiveVoiceSampleNames]=useState<string[]>([]);
  const [listeningParticipant, setListeningParticipant] = useState(false);
  const[pendingMeeting,setPendingMeeting]=useState<(Omit<DeviceRecording,"url">&{blob:Blob})|null>(null);
  const[postMeetingName,setPostMeetingName]=useState("");
  const [driveIntegration, setDriveIntegration] =
    useState<DriveStatus | null>(null);
  const [trelloIntegration,setTrelloIntegration]=useState<TrelloStatus|null>(null);
  useEffect(() => {
    fetch("/api/session")
      .then(async (r) => (r.ok ? (await r.json()).user : null))
      .then(setSession)
      .catch(() => setSession(null));
  }, []);
  useEffect(() => {
    if (session?.role !== "admin") return;
    fetch("/api/admin/drive/status")
      .then(async (response) =>
        response.ok ? ((await response.json()) as DriveStatus) : null,
      )
      .then(setDriveIntegration)
      .catch(() => setDriveIntegration(null));
  }, [session]);
  useEffect(()=>{if(!session)return;const load=()=>fetch("/api/trello/status").then(async response=>response.ok?(await response.json() as TrelloStatus):null).then(setTrelloIntegration).catch(()=>setTrelloIntegration(null));void load();window.addEventListener("keynotesai:trello-configured",load);return()=>window.removeEventListener("keynotesai:trello-configured",load)},[session,active]);
  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }
  function registerParticipant(name: string, reference?: string) {
    const clean = name
      .replace(/^(meu nome [eé]|eu sou|sou o|sou a)\s+/i, "")
      .replace(/\s+(e estou presente|presente)$/i, "")
      .trim();
    if (!clean) return;
    const next = [...participantsRef.current];
    if (!next.some((x) => x.toLocaleLowerCase() === clean.toLocaleLowerCase()))
      next.push(clean);
    participantsRef.current = next;
    if(reference){
      voiceSamplesRef.current=[...voiceSamplesRef.current.filter(sample=>sample.name.toLocaleLowerCase()!==clean.toLocaleLowerCase()),{name:clean,reference}];
      setLiveVoiceSampleNames(voiceSamplesRef.current.map(sample=>sample.name));
    }
    setLiveParticipants(next);
    notify(`${clean} registrado(a)${reference?" com amostra de voz":""}`);
  }
  async function captureParticipant(forcedName?: string) {
    const SpeechRecognition =
      (
        window as unknown as {
          SpeechRecognition?: new () => any;
          webkitSpeechRecognition?: new () => any;
        }
      ).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => any })
        .webkitSpeechRecognition;
    if (!SpeechRecognition && !forcedName) {
      notify("Reconhecimento de nomes indisponível; digite o nome manualmente");
      return;
    }
    const recognition = SpeechRecognition&&!forcedName?new SpeechRecognition():null;
    if(recognition){recognition.lang = "pt-BR";recognition.interimResults = false;recognition.maxAlternatives = 1}
    setListeningParticipant(true);
    let recognizedName=forcedName||"",sampleRecorder:MediaRecorder|null=null;const sampleChunks:Blob[]=[];
    const source=streamRef.current;
    if(source?.getAudioTracks().length&&typeof MediaRecorder!=="undefined"){
      const sampleStream=new MediaStream(source.getAudioTracks().map(track=>track.clone()));
      const mime=["audio/webm;codecs=opus","audio/mp4","audio/webm"].find(type=>MediaRecorder.isTypeSupported(type));
      sampleRecorder=new MediaRecorder(sampleStream,{audioBitsPerSecond:24000,...(mime?{mimeType:mime}:{})});
      sampleRecorder.ondataavailable=event=>{if(event.data.size)sampleChunks.push(event.data)};
      sampleRecorder.onstop=()=>{void(async()=>{
        sampleStream.getTracks().forEach(track=>track.stop());
        if(!recognizedName||!sampleChunks.length){setListeningParticipant(false);return}
        const sample=new Blob(sampleChunks,{type:sampleRecorder?.mimeType||"audio/webm"}),bytes=new Uint8Array(await sample.arrayBuffer());let binary="";
        for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));
        registerParticipant(recognizedName,`data:${sample.type};base64,${btoa(binary)}`);setListeningParticipant(false);
      })()};
      sampleRecorder.start();window.setTimeout(()=>{if(sampleRecorder?.state==="recording")sampleRecorder.stop()},5000);
    }
    if(recognition)recognition.onresult = (event: any) => {
      recognizedName=event.results[0][0].transcript;
      if(!sampleRecorder)registerParticipant(recognizedName);
    };
    if(recognition)recognition.onerror = () =>
      notify("Não entendi o nome. Tente novamente ou digite manualmente");
    if(recognition)recognition.onend = () => {if(!sampleRecorder)setListeningParticipant(false)};
    if(recognition)recognition.start();
    else if(!sampleRecorder){registerParticipant(recognizedName);setListeningParticipant(false)}
  }
  function runSearch() {
    const q = searchTerm.toLowerCase();
    if (q.includes("ata") || q.includes("arquivo") || q.includes("grava"))
      setActive("Arquivos");
    else if (q.includes("aç") || q.includes("tarefa")) setActive("Ações");
    else if (q.includes("decis") || q.includes("bloque")) setActive("Decisões");
    else if (q.includes("pergunta") || q.includes("cliente"))
      setActive("Pergunte à IA");
    else setActive("Reuniões");
    setHeaderPanel(null);
  }
  useEffect(() => {
    if(!session)return;
    let cancelled=false;
    void(async()=>{try{
      const local=session.impersonatedBy?[]:await loadRecordings(),response=await fetch("/api/meetings"),body=await response.json() as{meetings?:DeviceRecording[]};
      const cloud=response.ok?body.meetings||[]:[],cloudOwnIds=new Set(cloud.filter(row=>!row.ownerEmail||row.ownerEmail===session.email).map(row=>row.id)),localById=new Map(local.map(row=>[row.id,row]));
      const merged=[...cloud.map(row=>{const localRecord=!row.ownerEmail||row.ownerEmail===session.email?localById.get(row.id):undefined;return localRecord?{...localRecord,...row,url:localRecord.url,audioBlob:localRecord.audioBlob,cloudSynced:true}:row}),...local.filter(row=>!cloudOwnIds.has(row.id))].sort((a,b)=>b.id-a.id);
      if(!cancelled)setDeviceRecordings(merged);
      for(const record of local.filter(row=>!cloudOwnIds.has(row.id))){
        try{const saved=await uploadMeetingToCloud(record,record.audioBlob!);if(!cancelled)setDeviceRecordings(rows=>rows.map(row=>row.id===record.id?{...saved,url:record.url,audioBlob:record.audioBlob}:row))}catch{}
      }
    }catch{if(!cancelled){if(session.impersonatedBy)setDeviceRecordings([]);else loadRecordings().then(setDeviceRecordings).catch(()=>{})}}})();
    return()=>{cancelled=true};
  }, [session?.email,session?.impersonatedBy?.email]);
  useEffect(() => {
    if(session?.impersonatedBy){setScheduledMeetings([]);return}
    try {
      setScheduledMeetings(
        JSON.parse(localStorage.getItem("keynotesai-meetings") || "[]"),
      );
    } catch {}
  }, [session?.impersonatedBy?.email]);
  useEffect(() => {
    if (!recording||recordingPaused) return;
    const timer = window.setInterval(
      () =>
        setRecordingSeconds(
          Math.floor((Date.now() - startedAtRef.current-pausedDurationRef.current) / 1000),
        ),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [recording,recordingPaused]);
  function togglePauseRecording(){const recorder=recorderRef.current;if(!recorder||recorder.state==="inactive")return;if(recorder.state==="recording"){recorder.pause();pausedAtRef.current=Date.now();setRecordingPaused(true);notify("Gravação pausada") }else if(recorder.state==="paused"){pausedDurationRef.current+=Date.now()-pausedAtRef.current;pausedAtRef.current=0;recorder.resume();setRecordingPaused(false);notify("Gravação retomada")}}
  async function releaseRecordingSources() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    sourceStreamsRef.current.forEach((stream) =>
      stream.getTracks().forEach((track) => track.stop()),
    );
    sourceStreamsRef.current = [];
    streamRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") await context.close().catch(() => {});
  }
  async function captureRecordingStream(
    source: "microphone" | "google-meet" | "google-meet-microphone",
  ) {
    if (source === "microphone") {
      const microphone = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      sourceStreamsRef.current = [microphone];
      return microphone;
    }
    if (!navigator.mediaDevices.getDisplayMedia)
      throw new DOMException(
        "A captura da aba não está disponível neste navegador.",
        "NotSupportedError",
      );
    const display = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
    sourceStreamsRef.current = [display];
    if (!display.getAudioTracks().length) {
      display.getTracks().forEach((track) => track.stop());
      sourceStreamsRef.current = [];
      throw new DOMException(
        "Selecione a aba do Google Meet e marque Compartilhar áudio da guia.",
        "NotFoundError",
      );
    }
    if (source === "google-meet")
      return new MediaStream(display.getAudioTracks());
    const microphone = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    sourceStreamsRef.current.push(microphone);
    const context = new AudioContext();
    audioContextRef.current = context;
    const destination = context.createMediaStreamDestination();
    context.createMediaStreamSource(display).connect(destination);
    context.createMediaStreamSource(microphone).connect(destination);
    return destination.stream;
  }
  async function toggleRecording() {
    if (recording) {
      if(recordingPaused&&pausedAtRef.current)pausedDurationRef.current+=Date.now()-pausedAtRef.current;
      recorderRef.current?.stop();
      await releaseRecordingSources();
      setRecording(false);
      setRecordingPaused(false);
      return;
    }
    if (
      !window.isSecureContext ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setRecordingIssue(
        "Este navegador não oferece gravação direta. Abra o endereço no Chrome completo ou importe um áudio já gravado.",
      );
      return;
    }
    setRequestingMic(true);
    try {
      const recordingSource = newMeetingRecordingSource;
      const stream = await captureRecordingStream(recordingSource);
      const preferredMimeType=["audio/webm;codecs=opus","audio/mp4;codecs=mp4a.40.2","audio/mp4","audio/webm"].find(type=>MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, {
        audioBitsPerSecond: 24000,
        ...(preferredMimeType ? { mimeType: preferredMimeType } : {}),
      });
      const title =
          meetingTitleNow.trim() ||
          `Reunião · ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
        transcriptionMode = newMeetingTranscriptionMode;
      chunksRef.current = [];
      participantsRef.current = [];
      voiceSamplesRef.current = [];
      setLiveParticipants([]);
      setLiveVoiceSampleNames([]);
      startedAtRef.current = Date.now();
      pausedAtRef.current=0;pausedDurationRef.current=0;
      setRecordingSeconds(0);
      setRecordingIssue("");
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const seconds = Math.max(1,Math.round((Date.now()-startedAtRef.current-pausedDurationRef.current)/1000));
        const now = new Date();
        const base = {
          id: Date.now(),
          name: title,
          createdAt: now.toLocaleDateString("pt-BR"),
          meetingDate: now.toISOString().slice(0, 10),
          meetingTime: now.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          participants: participantsRef.current.join("\n"),
          voiceSamples: voiceSamplesRef.current,
          duration: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
          size: `${(blob.size / 1024 / 1024).toFixed(1)} MB`,
          audioMimeType: blob.type,
          transcriptionMode,
          recordingSource,
        };
        setPendingMeeting({...base,blob});
        setMeetingTitleNow("");
        notify("Gravação encerrada. Confirme a presença antes de salvar.");
      };
      // Um único contêiner final evita WebM/MP4 fragmentado, que pode tocar no
      // navegador mas ser recusado por serviços de transcrição.
      recorder.start();
      recorderRef.current = recorder;
      streamRef.current = stream;
      const displayVideoTrack = sourceStreamsRef.current
        .flatMap((sourceStream) => sourceStream.getVideoTracks())[0];
      if (displayVideoTrack)
        displayVideoTrack.onended = () => {
          if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
          void releaseRecordingSources();
          setRecording(false);
          setRecordingPaused(false);
          notify("Captura encerrada. Confirme a presença antes de salvar.");
        };
      setRecording(true);
      setRecordingPaused(false);
      setActive("Reuniões");
      notify(
        recordingSource === "microphone"
          ? "Gravação iniciada pelo microfone"
          : recordingSource === "google-meet"
            ? "Áudio da aba do Google Meet sendo gravado"
            : "Google Meet e microfone sendo gravados juntos",
      );
    } catch (error) {
      await releaseRecordingSources();
      const reason = error instanceof DOMException
        ? error.name === "NotAllowedError"
          ? "A captura foi cancelada ou recusada. Autorize a aba do Google Meet e o microfone quando solicitado."
          : error.name === "NotFoundError"
            ? error.message
            : error.name === "NotSupportedError"
              ? "Abra o KeyNotesAI no Chrome ou Edge para capturar o áudio do Google Meet."
              : "Não foi possível iniciar a captura de áudio."
        : "Não foi possível iniciar a captura de áudio.";
      setRecordingIssue(reason);
    } finally {
      setRequestingMic(false);
    }
  }
  async function importAudio(file?: File) {
    if (!file) return;
    const base = {
      id: Date.now(),
      name: file.name.replace(/\.[^.]+$/, "") || "Reunião importada",
      createdAt: new Date().toLocaleDateString("pt-BR"),
      duration: "áudio importado",
      size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
      audioMimeType: file.type,
      transcriptionMode: newMeetingTranscriptionMode,
      ownerEmail:session?.email,
    };
    await persistRecording({ ...base, blob: file });
    const local={...base,url:URL.createObjectURL(file),audioBlob:file} as DeviceRecording;
    try{const saved=await uploadMeetingToCloud(local,file);setDeviceRecordings(r=>[{...saved,url:local.url,audioBlob:file},...r])}catch{setDeviceRecordings(r=>[local,...r]);notify("Áudio salvo neste aparelho; sincronização com a nuvem pendente")}
    setRecordingIssue("");
    setActive("Arquivos");
    notify("Áudio importado e salvo no aparelho");
  }
  async function finalizePendingMeeting(){if(!pendingMeeting)return;const record={...pendingMeeting,ownerEmail:session?.email,participants:participantsRef.current.join("\n"),voiceSamples:voiceSamplesRef.current};await persistRecording(record);const local={...record,url:URL.createObjectURL(record.blob),audioBlob:record.blob} as DeviceRecording;try{const saved=await uploadMeetingToCloud(local,record.blob);setDeviceRecordings(rows=>[{...saved,ownerEmail:session?.email,url:local.url,audioBlob:record.blob},...rows]);notify("Reunião salva e disponível em qualquer computador")}catch{setDeviceRecordings(rows=>[local,...rows]);notify("Reunião salva neste aparelho; sincronização com a nuvem pendente")}setPendingMeeting(null);setPostMeetingName("");setActive("Arquivos")}
  async function updateRecording(id: number, patch: Partial<DeviceRecording>) {
    const current=deviceRecordings.find(row=>row.id===id);if(!current)return;
    if(current.audioBlob)await patchRecording(id, patch);
    const updated={...current,...patch};
    try{await saveMeetingToCloud(updated)}catch{notify("Alteração salva neste aparelho; sincronização pendente")}
    setDeviceRecordings((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }
  async function deleteRecording(id: number) {
    if (session?.role !== "admin") {
      notify("Somente o administrador pode excluir reuniões");
      return;
    }
    const target = deviceRecordings.find((r) => r.id === id);
    if (!target) return;
    const response = await fetch("/api/admin/meetings", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ meetingId: id, ownerEmail: target.ownerEmail }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      trashedFolders?: number;
    };
    if (!response.ok) {
      notify(body.error || "Não foi possível excluir a reunião por completo");
      return;
    }
    await removeRecording(id);
    URL.revokeObjectURL(target.url);
    if (target.meetingPhotoUrl) URL.revokeObjectURL(target.meetingPhotoUrl);
    target.attachments?.forEach((attachment) => {
      if (attachment.type === "file" && attachment.url)
        URL.revokeObjectURL(attachment.url);
    });
    setDeviceRecordings((rows) => rows.filter((r) => r.id !== id));
    notify(
      body.trashedFolders
        ? "Reunião excluída e pasta do Drive movida para a lixeira"
        : "Reunião e todos os dados locais foram excluídos",
    );
  }
  function saveScheduledMeeting() {
    if (!meetingTitle.trim() || !meetingDate || !meetingTime) {
      notify("Preencha título, data e horário");
      return;
    }
    const next = [
      ...scheduledMeetings,
      {
        id: Date.now(),
        title: meetingTitle.trim(),
        date: meetingDate,
        time: meetingTime,
      },
    ].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    setScheduledMeetings(next);
    localStorage.setItem("keynotesai-meetings", JSON.stringify(next));
    setMeetingTitle("");
    setMeetingDate("");
    setMeetingTime("");
    setShowScheduleForm(false);
    notify("Reunião adicionada à agenda");
  }
  const dashboardRecent = deviceRecordings
    .map((r) => ({
      title: r.name,
      date: r.createdAt,
      duration: r.duration,
      tag: "Gravação",
      color: "#b98b4e",
      local: true,
    }))
    .slice(0, 5);
  const dashboardOpenActions = deviceRecordings
    .flatMap((recording) =>
      (recording.actions || []).map((action) => ({
        ...action,
        recordingId: recording.id,
        meetingName: recording.name,
      })),
    )
    .filter((action) => !action.done)
    .slice(0, 5);
  if (session === undefined)
    return (
      <main className="auth-loading">
        <span>◉</span>
        <strong>Verificando acesso…</strong>
      </main>
    );
  if (!session)
    return (
      <main className="cover-page">
        <section className="cover-brand-panel">
          <div className="cover-institution">
            <div className="ifsc-plate">
              <img
                src="/ifsc-continente-branco.png"
                alt="Instituto Federal de Santa Catarina, Câmpus Florianópolis-Continente"
              />
            </div>
          </div>
          <div className="cover-message">
            <p className="cover-kicker">INTELIGÊNCIA PARA REUNIÕES</p>
            <h1>
              Conversas mais
              <br />
              produtivas.
            </h1>
            <h2>
              Decisões mais
              <br />
              claras.
            </h2>
            <p className="cover-copy">
              Gravações, atas, decisões e próximos passos reunidos em um
              ambiente inteligente e seguro.
            </p>
          </div>
          <div className="cover-maker">
            <small>DESENVOLVIDO POR</small>
            <p className="cover-developer">Prof. Rogério G. Bittencourt</p>
            <div>
              <img src="/inovalab-mark.png" alt="" />
              <strong>INOVALAB</strong>
            </div>
            <p>Laboratório de Inovação e Mídias Digitais</p>
          </div>
        </section>
        <section className="cover-access-panel">
          <div className="access-wrap">
            <div className="cover-app-mark">
              <img src="/keynotesai-logo.png" alt="Símbolo do KeyNotesAI" />
            </div>
            <p className="access-kicker">KEYNOTESAI</p>
            <h2>Acesse sua conta</h2>
            <p className="access-subtitle">
              Entre com sua identidade institucional para continuar.
            </p>
            <button
              className="login-button"
              onClick={() =>
                (location.href = "/signin-with-chatgpt?return_to=%2F")
              }
            >
              <span className="login-symbol">○</span>
              <strong>Entrar com ChatGPT</strong>
              <span>→</span>
            </button>
            <p className="secure-note">
              ◇ Acesso restrito a usuários autorizados.
            </p>
            <div className="access-divider" />
            <h3>O que você encontrará</h3>
            <div className="access-benefits">
              <div>
                <span>IA</span>
                <p>
                  <strong>Reuniões inteligentes</strong>
                  <small>Gravação, transcrição e resumos</small>
                </p>
              </div>
              <div>
                <span>AM</span>
                <p>
                  <strong>Ações e decisões</strong>
                  <small>Responsáveis, prazos e bloqueios claros</small>
                </p>
              </div>
              <div>
                <span>TR</span>
                <p>
                  <strong>Integração com Trello</strong>
                  <small>Cada reunião organizada em um card</small>
                </p>
              </div>
            </div>
          </div>
          <p className="access-help">
            Problemas para acessar? Procure a administração do sistema.
          </p>
        </section>
      </main>
    );
  return (
    <main className={`app-shell ${session.impersonatedBy?"impersonating":""}`}>
      {session.impersonatedBy&&<div className="impersonation-banner" role="status"><span>Você está acessando como <strong>{session.name}</strong> · {session.email}</span><button onClick={async()=>{const response=await fetch("/api/admin/impersonation",{method:"DELETE"});if(response.ok)location.reload();else notify("Não foi possível voltar ao administrador")}}>Voltar ao administrador</button></div>}
      <aside className="sidebar">
        <div className="brand">
          <button
            className="brand-signout"
            type="button"
            aria-label="Sair do KeyNotesAI e voltar à capa"
            title="Sair e voltar à capa"
            onClick={() =>
              (location.href = "/signout-with-chatgpt?return_to=%2F")
            }
          >
            <img src="/keynotesai-logo.png" alt="" />
          </button>
          <div>
            <strong>
              KeyNotes<span>AI</span>
            </strong>
            <small>Meeting intelligence</small>
          </div>
        </div>
        <nav aria-label="Navegação principal">
          {[
            ["◈", "Visão geral"],
            ["▷", "Reuniões"],
            ["◉", "Arquivos"],
            ["✓", "Ações"],
            ["⊙", "Decisões"],
            ["⌕", "Pergunte à IA"],
            ...(session.role === "admin" ? [["⚙", "Administração"]] : []),
          ].map(([icon, label]) => (
            <button
              key={label}
              className={active === label ? "active" : ""}
              onClick={() => setActive(label)}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <p>INTEGRAÇÕES</p>
          <button className={active==="Trello"?"active":""} onClick={() => setActive("Trello")}>
            <img
              className="integration-logo"
              src="/trello-logo.png"
              alt="Trello"
            />
            <span>
              Trello<small>{trelloIntegration?.configured?"Conectado":trelloIntegration?.credentialsReady?"Selecionar destino":"Configurando"}</small>
            </span>
            <i>•••</i>
          </button>
          <button
            onClick={() => {
              if (session.role !== "admin") {
                notify("Google Drive gerenciado pelo Admin do INOVALAB");
                return;
              }
              if (!driveIntegration?.credentialsReady) {
                notify("A integração do Google Drive ainda não está pronta");
                return;
              }
              location.href = "/api/admin/drive/connect";
            }}
            title={
              session.role === "admin"
                ? "Conectar ou reconectar o Google Drive do INOVALAB"
                : "Integração gerenciada pelo administrador"
            }
          >
            <img
              className="integration-logo"
              src="/google-drive-logo.png"
              alt="Google Drive"
            />
            <span>
              Google Drive
              <small>
                {session.role !== "admin"
                  ? "INOVALAB"
                  : driveIntegration?.connected
                    ? "Conectado"
                    : driveIntegration?.credentialsReady
                      ? "Autorizar"
                      : "Configurando"}
              </small>
            </span>
            <i>•••</i>
          </button>
          <div className="user">
            <span>{session.name.slice(0, 2).toUpperCase()}</span>
            <div>
              <strong>{session.name}</strong>
              <small>
                {session.role === "admin"
                  ? "Administrador"
                  : `${session.used}/${session.monthlyLimit} operações`}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <section className="workspace">
        <header>
          <button
            className="mobile-brand"
            aria-label="Sair do KeyNotesAI e voltar à capa"
            title="Sair e voltar à capa"
            onClick={() =>
              (location.href = "/signout-with-chatgpt?return_to=%2F")
            }
          >
            <img src="/keynotesai-logo.png" alt="" />
          </button>
          <div className="search">
            <span>⌕</span>
            <input
              aria-label="Buscar"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Buscar reuniões, decisões ou tarefas..."
            />
            <button aria-label="Executar busca" onClick={runSearch}>
              Buscar
            </button>
          </div>
          <div className="header-actions">
            <button
              aria-label="Ajuda"
              onClick={() =>
                setHeaderPanel(headerPanel === "help" ? null : "help")
              }
            >
              ?
            </button>
            <button
              aria-label="Notificações"
              onClick={() =>
                setHeaderPanel(
                  headerPanel === "notifications" ? null : "notifications",
                )
              }
            >
              ○<i />
            </button>
            <button
              className="avatar"
              aria-label="Perfil"
              onClick={() =>
                setHeaderPanel(headerPanel === "profile" ? null : "profile")
              }
            >
              RB
            </button>
          </div>
          {headerPanel && (
            <div className="header-popover">
              {headerPanel === "help" ? (
                <>
                  <strong>Central de ajuda</strong>
                  <p>
                    Consulte o Manual completo, incluindo Google Meet,
                    documentos, Drive, Trello e administração.
                  </p>
                  <button
                    onClick={() =>
                      window.open("/Manual-KeyNotesAI.pdf", "_blank", "noopener,noreferrer")
                    }
                  >
                    Abrir Manual em PDF ↗
                  </button>
                  <button
                    onClick={() => {
                      setActive("Arquivos");
                      setHeaderPanel(null);
                    }}
                  >
                    Ir para Arquivos →
                  </button>
                </>
              ) : headerPanel === "notifications" ? (
                <>
                  <strong>Notificações</strong>
                  <p>3 ações vencem esta semana.</p>
                  <p>O Trello aguarda credenciais.</p>
                  <button
                    onClick={() => {
                      setActive("Ações");
                      setHeaderPanel(null);
                    }}
                  >
                    Ver ações →
                  </button>
                </>
              ) : (
                <>
                  <strong>{session.name}</strong>
                  <p>{session.role==="admin"?"Administrador":"Usuário autorizado"} · {session.email}</p>
                  <button onClick={() => location.href="/signout-with-chatgpt?return_to=%2F"}>
                    Sair da conta
                  </button>
                </>
              )}
            </div>
          )}
        </header>
        <div className="content">
          {active === "Administração"&&session.role==="admin" ? <AdminPanel notify={notify}/> : active === "Trello" ? <TrelloIntegrationPanel isAdmin={session.role==="admin"} notify={notify}/> : active !== "Visão geral" ? (
            <RealFeatureView
              isAdmin={session.role === "admin"}
              active={active}
              notify={notify}
              recordings={deviceRecordings}
              recording={recording}
              recordingPaused={recordingPaused}
              recordingSeconds={recordingSeconds}
              stopRecording={toggleRecording}
              togglePauseRecording={togglePauseRecording}
              updateRecording={updateRecording}
              deleteRecording={deleteRecording}
              liveParticipants={liveParticipants}
              liveVoiceSampleNames={liveVoiceSampleNames}
              listeningParticipant={listeningParticipant}
              captureParticipant={captureParticipant}
              registerParticipant={registerParticipant}
              navigate={setActive}
            />
          ) : (
            <>
              <section className="welcome">
                <div>
                  <p className="eyebrow">QUINTA-FEIRA, 20 DE AGOSTO</p>
                  <h1>Bom dia, Rogério.</h1>
                  <p>Você foca na reunião, a IA cuida do resto.</p>
                </div>
                <div className="record-actions">
                  <button
                    className={`record ${recording ? "recording" : ""}`}
                    disabled={requestingMic}
                    onClick={toggleRecording}
                  >
                    <i />
                    {requestingMic
                      ? "Aguardando autorização..."
                      : recording
                        ? "Encerrar e salvar"
                        : "Gravar nova reunião"}
                  </button>
                  <button
                    className="import-audio"
                    onClick={() => audioImportRef.current?.click()}
                  >
                    ↑ Importar áudio
                  </button>
                  <input
                    ref={audioImportRef}
                    type="file"
                    accept="audio/*,.webm"
                    hidden
                    onChange={(e) => {
                      void importAudio(e.target.files?.[0]);
                      e.currentTarget.value = "";
                    }}
                  />
                </div>
              </section>
              {recordingIssue && (
                <div className="recording-issue" role="alert">
                  <span>!</span>
                  <div>
                    <strong>A gravação direta não iniciou</strong>
                    <p>{recordingIssue}</p>
                  </div>
                  <button onClick={() => audioImportRef.current?.click()}>
                    Importar áudio
                  </button>
                  <button
                    aria-label="Fechar aviso"
                    onClick={() => setRecordingIssue("")}
                  >
                    ×
                  </button>
                </div>
              )}
              <section className="hero-grid">
                <div className="agenda card start-meeting-card">
                  <div className="card-head">
                    <div>
                      <p className="eyebrow">REUNIÃO AGORA</p>
                      <h2>Cadastrar e iniciar</h2>
                    </div>
                    <span>Sem calendário</span>
                  </div>
                  <div className="start-meeting-body">
                    <div>
                      <strong>Dê um nome à reunião</strong>
                      <p>
                        O título identificará a gravação, o histórico, a
                        transcrição e todos os documentos gerados.
                      </p>
                    </div>
                    <input
                      value={meetingTitleNow}
                      onChange={(e) => setMeetingTitleNow(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && void toggleRecording()
                      }
                      placeholder="Ex.: Reunião de alinhamento"
                      aria-label="Nome da reunião"
                    />
                    <label className="meeting-mode-select">
                      <span>Origem do áudio</span>
                      <select
                        value={newMeetingRecordingSource}
                        onChange={(e) =>
                          setNewMeetingRecordingSource(
                            e.target.value as
                              | "microphone"
                              | "google-meet"
                              | "google-meet-microphone",
                          )
                        }
                      >
                        <option value="google-meet-microphone">
                          Google Meet + microfone (recomendado)
                        </option>
                        <option value="google-meet">
                          Google Meet · somente áudio da aba
                        </option>
                        <option value="microphone">
                          Presencial · somente microfone
                        </option>
                      </select>
                      {newMeetingRecordingSource !== "microphone" && (
                        <small>
                          Ao iniciar, selecione a aba do Meet e marque “Compartilhar áudio da guia”.
                        </small>
                      )}
                    </label>
                    <label className="meeting-mode-select">
                      <span>Processamento da reunião</span>
                      <select
                        value={newMeetingTranscriptionMode}
                        onChange={(e) =>
                          setNewMeetingTranscriptionMode(
                            e.target.value as
                              | "openai"
                              | "diarized",
                          )
                        }
                      >
                        <option value="openai">
                          Totalmente OpenAI · áudio e documentos
                        </option>
                        <option value="diarized">
                          OpenAI + identificação de locutores
                        </option>
                      </select>
                    </label>
                    <button onClick={toggleRecording} disabled={requestingMic}>
                      <i />
                      {requestingMic
                        ? "Aguardando autorização..."
                        : newMeetingRecordingSource === "microphone"
                          ? "Iniciar reunião presencial"
                          : "Gravar reunião do Google Meet"}
                    </button>
                  </div>
                </div>
                <div className="trello-card card">
                  <div className="trello-top">
                    <img
                      className="trello-logo-image"
                      src="/trello-logo.png"
                      alt="Trello"
                    />
                    <span>Integração ativa</span>
                    <i />
                  </div>
                  <h2>
                    Cada reunião,
                    <br />
                    um card completo.
                  </h2>
                  <p>
                    Resumo, decisões, arquivos e ações sincronizados
                    automaticamente no Trello.
                  </p>
                  <div className="sync-status">
                    <span>✓</span>
                    <div>
                      <strong>Sincronização em dia</strong>
                      <small>12 cards atualizados hoje</small>
                    </div>
                  </div>
                  {trelloIntegration?.boardUrl ? (
                    <a className="trello-board-link" href={trelloIntegration.boardUrl} target="_blank" rel="noopener noreferrer" style={{position:"relative",zIndex:1,display:"block",width:"100%",border:"1px solid #565751",color:"#fff",padding:"10px",borderRadius:"6px",fontSize:"9px",fontWeight:700,textAlign:"center",textDecoration:"none"}}>
                      Abrir quadro no Trello <span style={{float:"right"}}>↗</span>
                    </a>
                  ) : (
                    <button onClick={() => notify("Selecione primeiro o Quadro e a Lista no menu Trello")}>
                      Selecionar quadro no Trello <span>↗</span>
                    </button>
                  )}
                </div>
              </section>
              <section className="metrics">
                <article>
                  <span className="metric-icon gold">✓</span>
                  <div>
                    <small>AÇÕES EM ABERTO</small>
                    <strong>
                      {
                        deviceRecordings
                          .flatMap((r) => r.actions || [])
                          .filter((a) => !a.done).length
                      }
                    </strong>
                    <p>Extraídas de reuniões processadas</p>
                  </div>
                </article>
                <article>
                  <span className="metric-icon green">◇</span>
                  <div>
                    <small>REUNIÕES REGISTRADAS</small>
                    <strong>{deviceRecordings.length}</strong>
                    <p>Gravações reais neste aparelho</p>
                  </div>
                </article>
                <article>
                  <span className="metric-icon slate">◷</span>
                  <div>
                    <small>REUNIÕES PROCESSADAS</small>
                    <strong>
                      {deviceRecordings.filter((r) => r.processedAt).length}
                    </strong>
                    <p>Com documentos gerados</p>
                  </div>
                </article>
              </section>
              <section className="lower-grid">
                <div className="actions card">
                  <div className="card-head">
                    <div>
                      <p className="eyebrow">ACTION MATRIX</p>
                      <h2>Próximas entregas</h2>
                    </div>
                    <button onClick={() => setActive("Ações")}>
                      Ver todas →
                    </button>
                  </div>
                  {dashboardOpenActions.length === 0 ? (
                    <div className="dashboard-empty">
                      <span>✓</span>
                      <strong>Nenhuma ação identificada</strong>
                      <p>
                        As tarefas aparecerão aqui somente após uma reunião real
                        ser transcrita e processada.
                      </p>
                    </div>
                  ) : (
                    <div className="action-table">
                      {dashboardOpenActions.map((action, index) => (
                        <div
                          className="action-row"
                          key={`${action.recordingId}-${action.id || index}`}
                        >
                          <button
                            aria-label={`Concluir ação: ${action.task}`}
                            onClick={() =>
                              void updateRecording(action.recordingId, {
                                actions: deviceRecordings
                                  .find(
                                    (recording) =>
                                      recording.id === action.recordingId,
                                  )
                                  ?.actions?.map((item) =>
                                    item.id === action.id
                                      ? { ...item, done: true }
                                      : item,
                                  ),
                              })
                            }
                          />
                          <div className="task">
                            <strong>{action.task}</strong>
                            <small>
                              <span>
                                {(action.person || "?")
                                  .split(/\s+/)
                                  .map((part) => part[0])
                                  .join("")
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </span>
                              {action.person || "Responsável a confirmar"} ·{" "}
                              {action.meetingName}
                            </small>
                          </div>
                          <time>{action.due || "Sem prazo"}</time>
                          <em
                            className={(action.priority || "").toLowerCase()}
                          >
                            {action.priority || "Normal"}
                          </em>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="recent card">
                  <div className="card-head">
                    <div>
                      <p className="eyebrow">HISTÓRICO</p>
                      <h2>Reuniões recentes</h2>
                    </div>
                    <button onClick={() => setActive("Arquivos")}>
                      Ver todas →
                    </button>
                  </div>
                  {dashboardRecent.length === 0 ? (
                    <div className="dashboard-empty">
                      <span>▶</span>
                      <strong>Nenhuma reunião gravada</strong>
                      <p>
                        As gravações concluídas aparecerão aqui automaticamente.
                      </p>
                    </div>
                  ) : (
                    dashboardRecent.map((r, i) => (
                      <button
                        className="recent-row"
                        key={`${r.title}-${i}`}
                        onClick={() => setActive("Arquivos")}
                      >
                        <span className="doc">▶</span>
                        <div>
                          <strong>{r.title}</strong>
                          <small>
                            {r.date} · {r.duration}
                          </small>
                        </div>
                        <em style={{ "--tag": r.color } as React.CSSProperties}>
                          {r.tag}
                        </em>
                        <b>›</b>
                      </button>
                    ))
                  )}
                </div>
              </section>
            </>
          )}
        </div>
        <footer className="app-footer">
          <div className="footer-party footer-inovalab">
            <span className="footer-logo-frame footer-logo-inovalab">
              <img
                src="/inovalab-logo.png"
                alt="INOVALAB IFSC Campus Continente"
              />
            </span>
            <div className="footer-copy footer-copy-left">
              <p className="footer-inovalab-title">INOVALAB</p>
              <p>Laboratório de Inovação e Mídias Digitais</p>
              <p className="footer-motto">
                “Onde ideias se transformam em realidade.”
              </p>
              <p className="footer-product">
                KeyNotesAI · Tecnologia que transforma conversa em ação.
              </p>
            </div>
          </div>
          <div className="footer-party footer-ifsc">
            <div className="footer-copy footer-copy-right">
              <p>
                <strong>Instituto Federal de Santa Catarina</strong> — Câmpus
                Florianópolis-Continente
              </p>
              <p>
                R. Quatorze de Julho, 150 — Coqueiros — Florianópolis — SC —
                88075-010
              </p>
              <a href="mailto:inovalab.cte@ifsc.edu.br">
                inovalab.cte@ifsc.edu.br
              </a>
            </div>
            <img
              className="footer-logo footer-logo-ifsc"
              src="/ifsc-logo.png"
              alt="Instituto Federal de Santa Catarina"
            />
          </div>
        </footer>
      </section>
      {recording && (
        <div className={`recording-dock ${recordingPaused ? "paused" : ""}`} role="status">
          <div className="recording-live">
            <i />
            <span>
              <small>{recordingPaused ? "GRAVAÇÃO PAUSADA" : "GRAVANDO NESTE APARELHO"}</small>
              <strong>
                {String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:
                {String(recordingSeconds % 60).padStart(2, "0")}
              </strong>
            </span>
          </div>
          <div className="sound-bars">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <i key={n} />
            ))}
          </div>
          <p>
            {recordingPaused ? "O áudio está preservado. Retome quando a reunião continuar." : <>O áudio será salvo em <b>Arquivos</b> quando você encerrar.</>}
          </p>
          <div className="recording-dock-actions">
            <button onClick={togglePauseRecording}>{recordingPaused ? "▶ Retomar" : "Ⅱ Pausar"}</button>
            <button onClick={toggleRecording}><i /> Encerrar</button>
          </div>
        </div>
      )}
      {pendingMeeting && (
        <div className="finalize-overlay" role="dialog" aria-modal="true" aria-labelledby="finalize-title">
          <section className="finalize-panel">
            <p className="eyebrow">GRAVAÇÃO ENCERRADA</p>
            <h2 id="finalize-title">Confirme a presença</h2>
            <p>Você pode registrar nomes por voz agora, completar manualmente e salvar quando terminar.</p>
            <button className={`voice-attendance ${listeningParticipant ? "listening" : ""}`} onClick={()=>void captureParticipant()}>
              {listeningParticipant ? "Ouvindo o nome…" : "◉ Registrar uma pessoa por voz"}
            </button>
            <div className="finalize-manual">
              <input value={postMeetingName} onChange={(event)=>setPostMeetingName(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"&&postMeetingName.trim()){registerParticipant(postMeetingName);setPostMeetingName("")}}} placeholder="Ou digite o nome da pessoa" />
              <button onClick={()=>{if(postMeetingName.trim()){registerParticipant(postMeetingName);setPostMeetingName("")}}}>Adicionar</button>
            </div>
            <div className="finalize-presence-list">
              <strong>{liveParticipants.length} participante(s)</strong>
              {liveParticipants.length ? <ul>{liveParticipants.map(name=><li key={name}>✓ {name}{liveVoiceSampleNames.some(sample=>sample.toLocaleLowerCase()===name.toLocaleLowerCase())?" · voz cadastrada":" · sem amostra"}</li>)}</ul> : <p>Nenhum nome registrado. Você ainda pode salvar e preencher depois nos dados da reunião.</p>}
            </div>
            <button className="finalize-save" onClick={()=>void finalizePendingMeeting()}>Salvar reunião e abrir os arquivos</button>
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
}
