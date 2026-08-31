"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { type MeetingAction, type MeetingDecision } from "./local-processing";
import { analyzeTranscriptSemantically } from "./semantic-processing";
import {
  audioExtension,
  transcribeAudioWithOpenAI,
  type SpeakerSegment,
} from "./openai-transcription";
import { openProfessionalDocument } from "./professional-documents";
import type { DeviceRecording, MeetingAttachment } from "./page";
import DriveLibrary, { openDriveDocumentWindow } from "./drive-library";

type Props = {
  isAdmin: boolean;
  active: string;
  recordings: DeviceRecording[];
  recording: boolean;
  recordingPaused: boolean;
  recordingSeconds: number;
  stopRecording: () => void;
  togglePauseRecording: () => void;
  notify: (s: string) => void;
  updateRecording: (
    id: number,
    patch: Partial<DeviceRecording>,
  ) => Promise<void>;
  deleteRecording: (id: number) => Promise<void>;
  liveParticipants: string[];
  liveVoiceSampleNames: string[];
  listeningParticipant: boolean;
  captureParticipant: (name?:string) => void | Promise<void>;
  registerParticipant: (name: string) => void;
  navigate: (active: string) => void;
};
const download = (name: string, content: string) => {
  const u = URL.createObjectURL(
      new Blob([content], { type: "text/plain;charset=utf-8" }),
    ),
    a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  URL.revokeObjectURL(u);
};
const speakerLabel=(speaker:string,names:Record<string,string>)=>names[speaker]?.trim()||(/^[a-z0-9]+$/i.test(speaker)?`Locutor ${speaker}`:speaker.replace(/^speaker[_ -]?/i,"Locutor "));
const speakerTranscript=(segments:SpeakerSegment[],names:Record<string,string>)=>segments.map(segment=>{
  const minutes=Math.floor(segment.start/60),seconds=Math.floor(segment.start%60);
  return`[${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}] ${speakerLabel(segment.speaker,names)}: ${segment.text}`;
}).join("\n\n");

export default function RealFeatureView(p: Props) {
  const [showDrive,setShowDrive]=useState(false);
  const filePhotoRef = useRef<HTMLInputElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const recoveredDriveRef=useRef(new Set<number>());
  const [selectedId, setSelectedId] = useState<number | null>(null),
    [draft, setDraft] = useState(""),
    [question, setQuestion] = useState(""),
    [asking, setAsking] = useState(false),
    [transcribing, setTranscribing] = useState(false),
    [analyzing, setAnalyzing] = useState(false),
    [archivingDrive, setArchivingDrive] = useState(false),
    [syncingTrello, setSyncingTrello] = useState(false),
    [driveStatus, setDriveStatus] = useState(""),
    [cameraOpen, setCameraOpen] = useState(false),
    [cameraError, setCameraError] = useState(""),
    [cameraFacing, setCameraFacing] = useState<"user" | "environment">(
      "environment",
    ),
    [analysisIssue, setAnalysisIssue] = useState(""),
    [transcriptionStatus, setTranscriptionStatus] = useState(""),
    [transcriptionProgress, setTranscriptionProgress] = useState(0),
    [transcriptionStartedAt, setTranscriptionStartedAt] = useState(0),
    [transcriptionElapsed, setTranscriptionElapsed] = useState(0);
  const selected = p.recordings.find(
    (r) => r.id === (selectedId ?? p.recordings[0]?.id),
  );
  useEffect(()=>{setShowDrive(false)},[selected?.id,selected?.ownerEmail]);
  useEffect(
    () => setDraft(selected?.transcript || ""),
    [selected?.id, selected?.transcript],
  );
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.data?.type !== "keynotesai:save-document"
      )
        return;
      const recording = p.recordings.find(
          (r) => r.id === event.data.recordingId,
        ),
        kind = event.data.kind as
          | "ata"
          | "resumo"
          | "acoes"
          | "decisoes"
          | "mapa";
      if (
        !recording ||
        !["ata", "resumo", "acoes", "decisoes", "mapa"].includes(kind) ||
        typeof event.data.html !== "string"
      )
        return;
      void p
        .updateRecording(recording.id, {
          documentOverrides: {
            ...recording.documentOverrides,
            [kind]: event.data.html,
          },
        })
        .then(() => p.notify("Documento revisado salvo na reunião"));
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [p.recordings, p.updateRecording, p.notify]);
  useEffect(()=>{
    if(!selected||selected.driveFolderUrl||recoveredDriveRef.current.has(selected.id))return;
    recoveredDriveRef.current.add(selected.id);
    const query=new URLSearchParams({meetingId:String(selected.id)});if(selected.ownerEmail)query.set("owner",selected.ownerEmail);
    void fetch(`/api/drive/archive-meeting?${query}`).then(async response=>response.ok?await response.json()as{archive?:{folderId:string;folderUrl:string;files:DeviceRecording["driveFiles"];createdAt:string}|null}:null).then(body=>{if(body?.archive)return p.updateRecording(selected.id,{driveFolderId:body.archive.folderId,driveFolderUrl:body.archive.folderUrl,driveFiles:body.archive.files||[],driveSyncedAt:body.archive.createdAt})}).catch(()=>{});
  },[selected?.id,selected?.driveFolderUrl,selected?.ownerEmail]);
  useEffect(
    () => () =>
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop()),
    [],
  );
  useEffect(()=>{
    if(!transcribing||!transcriptionStartedAt)return;
    const update=()=>setTranscriptionElapsed(Math.floor((Date.now()-transcriptionStartedAt)/1000));
    update();const timer=window.setInterval(update,1000);return()=>window.clearInterval(timer);
  },[transcribing,transcriptionStartedAt]);
  const allActions = useMemo(
    () =>
      p.recordings.flatMap((r) =>
        (r.actions || []).map((a) => ({
          ...a,
          meeting: r.name,
          recordingId: r.id,
        })),
      ),
    [p.recordings],
  );
  const allDecisions = useMemo(
    () =>
      p.recordings.flatMap((r) =>
        (r.decisions || []).map((d, decisionIndex) => ({
          ...d,
          meeting: r.name,
          meetingDate: r.meetingDate || r.createdAt,
          recordingId: r.id,
          decisionIndex,
        })),
      ),
    [p.recordings],
  );
  async function process() {
    if (!selected || !draft.trim()) {
      p.notify("Digite ou cole a transcrição primeiro");
      return;
    }
    if(selected.transcriptionMode==="diarized"&&selected.speakerSegments?.length&&selected.speakerReviewStatus!=="confirmed"){
      p.notify("Confirme todos os locutores antes de gerar os documentos");
      return;
    }
    setAnalyzing(true);
    setAnalysisIssue("");
    try {
      const result = await analyzeTranscriptSemantically(draft);
      await p.updateRecording(selected.id, {
        transcript: draft,
        ...result,
        documentOverrides: {},
      });
      p.notify("Análise semântica e documentos concluídos");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível analisar a reunião";
      setAnalysisIssue(message);
      p.notify("Falha na análise semântica");
    } finally {
      setAnalyzing(false);
    }
  }
  async function transcribeWithOpenAI() {
    if (!selected || transcribing) return;
    setTranscribing(true);
    setTranscriptionStartedAt(Date.now());setTranscriptionElapsed(0);
    setTranscriptionProgress(0);
    setTranscriptionStatus("Enviando áudio com segurança para a OpenAI…");
    try {
      const blob = await fetch(selected.url).then((r) => r.blob());
      setTranscriptionStatus("A OpenAI está transcrevendo a reunião…");
      const diarize=selected.transcriptionMode!=="openai";
      const result = await transcribeAudioWithOpenAI(blob,{diarize,participants:selected.participants,knownSpeakers:selected.voiceSamples},(status,progress)=>{
        setTranscriptionStatus(status);setTranscriptionProgress(progress);
      });
      const text=diarize&&result.segments.length?speakerTranscript(result.segments,result.speakerNames):result.text;
      setDraft(text);
      await p.updateRecording(selected.id, {
        transcript: text,
        transcriptionMode: diarize?"diarized":"openai",
        speakerSegments: result.segments,
        speakerNames: result.speakerNames,
        speakerReviewStatus: diarize?"pending":undefined,
      });
      setTranscriptionProgress(100);
      setTranscriptionStatus("Transcrição concluída pela OpenAI");
      p.notify("Áudio transcrito pela OpenAI");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível transcrever pela OpenAI";
      setTranscriptionStatus(message);
      p.notify("Falha na transcrição pela OpenAI");
    } finally {
      setTranscribing(false);
    }
  }
  async function renameSpeaker(speaker:string,name:string){
    if(!selected?.speakerSegments)return;
    const speakerNames={...(selected.speakerNames||{}),[speaker]:name};
    const transcript=speakerTranscript(selected.speakerSegments,speakerNames);
    setDraft(transcript);
    await p.updateRecording(selected.id,{speakerNames,transcript,speakerReviewStatus:"pending"});
  }
  async function confirmSpeakers(){
    if(!selected?.speakerSegments?.length)return;
    const unresolved=[...new Set(selected.speakerSegments.map(segment=>segment.speaker))].filter(speaker=>!selected.speakerNames?.[speaker]?.trim());
    if(unresolved.length){p.notify(`Ainda há ${unresolved.length} voz(es) sem identificação`);return}
    await p.updateRecording(selected.id,{speakerReviewStatus:"confirmed",transcript:draft});
    p.notify("Locutores confirmados. A geração de documentos foi liberada");
  }
  async function markUnidentified(){
    if(!selected?.speakerSegments?.length)return;
    const speakerNames={...(selected.speakerNames||{})};for(const segment of selected.speakerSegments)if(!speakerNames[segment.speaker]?.trim())speakerNames[segment.speaker]="Não identificado";
    const transcript=speakerTranscript(selected.speakerSegments,speakerNames);setDraft(transcript);await p.updateRecording(selected.id,{speakerNames,transcript,speakerReviewStatus:"pending"});p.notify("Vozes pendentes mantidas como não identificadas");
  }
  async function archiveInDrive() {
    if (!selected || archivingDrive) return;
    setArchivingDrive(true);
    setDriveStatus("Preparando arquivos e gravação…");
    try {
      let audio:Blob|null=null;
      if(selected.url){const response=await fetch(selected.url);if(response.ok)audio=await response.blob();else if(!selected.driveFolderId)throw new Error("Não foi possível recuperar a gravação. Seus documentos não foram alterados.");}
      const form = new FormData();
      const { meetingPhotoBlob: _photo, ...meeting } = selected;
      form.set("meeting", JSON.stringify(meeting));
      if(audio)form.set("audio", audio, `${selected.name}.${audioExtension(audio)}`);
      if (selected.meetingPhotoBlob)
        form.set(
          "photo",
          selected.meetingPhotoBlob,
          selected.meetingPhotoName || "Foto da reunião.jpg",
        );
      setDriveStatus(
        selected.driveFolderUrl
          ? "Atualizando os arquivos na pasta existente…"
          : "Criando a pasta e enviando os arquivos…",
      );
      const response = await fetch("/api/drive/archive-meeting", { method: "POST", body: form });
      const body = await response.json() as { error?: string; folder?: { id: string; webViewLink: string }; files?: Array<{ id: string; name: string; webViewLink: string }>; createdAt?: string };
      if (!response.ok || !body.folder) throw new Error(body.error || "Não foi possível arquivar no Drive.");
      const drivePatch = { driveFolderId: body.folder.id, driveFolderUrl: body.folder.webViewLink, driveFiles: body.files || [], driveSyncedAt: body.createdAt || new Date().toISOString() };
      await p.updateRecording(selected.id, drivePatch);
      const updatedMeeting = { ...selected, ...drivePatch };
      try {
        const trello = await syncMeetingToTrello(updatedMeeting);
        setDriveStatus(selected.driveFolderUrl ? "Drive atualizado e mesmo card atualizado no Trello" : "Reunião arquivada no Drive e card criado no Trello");
        p.notify(trello.created ? "Drive salvo e card criado no Trello" : "Drive e card do Trello atualizados");
      } catch (trelloError) {
        const detail = trelloError instanceof Error ? trelloError.message : "Falha no Trello";
        setDriveStatus(`Drive salvo. Trello pendente: ${detail}`);
        p.notify("Drive salvo; não foi possível atualizar o Trello");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao salvar no Google Drive";
      setDriveStatus(message);
      window.dispatchEvent(new Event("keynotesai:drive-status"));
      p.notify("Falha ao arquivar no Google Drive");
    } finally {
      setArchivingDrive(false);
    }
  }
  async function syncMeetingToTrello(recording: DeviceRecording) {
    const { meetingPhotoBlob: _photo, meetingPhotoUrl: _photoUrl, url: _audioUrl, ...meeting } = recording;
    const response = await fetch("/api/trello/sync-meeting", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(meeting) });
    const body = await response.json() as { error?: string; cardId?: string; cardUrl?: string; syncedAt?: string; created?: boolean };
    if (!response.ok || !body.cardUrl) throw new Error(body.error || "Não foi possível sincronizar com o Trello.");
    await p.updateRecording(recording.id, { trelloCardId: body.cardId, trelloCardUrl: body.cardUrl, trelloSyncedAt: body.syncedAt || new Date().toISOString() });
    return body;
  }
  async function syncSelectedToTrello() {
    if (!selected || syncingTrello) return;
    setSyncingTrello(true);
    try {
      const body = await syncMeetingToTrello(selected);
      p.notify(body.created ? "Card da reunião criado no Trello" : "Mesmo card atualizado no Trello");
    } catch (error) {
      p.notify(error instanceof Error ? error.message : "Falha ao sincronizar com o Trello");
    } finally { setSyncingTrello(false); }
  }
  async function saveMeetingPhoto(file?: File) {
    if (!selected || !file) return;
    if (!file.type.startsWith("image/")) {
      p.notify("Selecione um arquivo de imagem");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      p.notify("A foto deve ter no máximo 15 MB");
      return;
    }
    if (selected.meetingPhotoUrl)
      URL.revokeObjectURL(selected.meetingPhotoUrl);
    await p.updateRecording(selected.id, {
      meetingPhotoBlob: file,
      meetingPhotoUrl: URL.createObjectURL(file),
      meetingPhotoName: file.name || "Foto da reunião.jpg",
    });
    p.notify("Foto vinculada à reunião");
  }
  function stopCamera() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
  }
  function closeCamera() {
    stopCamera();
    setCameraOpen(false);
    setCameraError("");
  }
  async function openCamera(
    facing: "user" | "environment" = cameraFacing,
  ) {
    setCameraOpen(true);
    setCameraError("");
    stopCamera();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "A câmera não está disponível neste navegador. Use Selecionar arquivo.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setCameraFacing(facing);
      window.setTimeout(() => {
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          void cameraVideoRef.current.play();
        }
      });
    } catch (error) {
      setCameraError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Permissão da câmera recusada. Autorize a câmera no navegador ou selecione um arquivo."
          : "Não foi possível abrir a câmera deste dispositivo.",
      );
    }
  }
  async function captureCameraPhoto() {
    const video = cameraVideoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setCameraError("A câmera ainda está iniciando. Aguarde um instante.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (!blob) {
      setCameraError("Não foi possível capturar a imagem.");
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await saveMeetingPhoto(
      new File([blob], `foto-reuniao-${stamp}.jpg`, { type: "image/jpeg" }),
    );
    closeCamera();
  }
  async function removeMeetingPhoto() {
    if (!selected?.meetingPhotoBlob) return;
    if (!confirm("Remover a foto desta reunião?")) return;
    if (selected.meetingPhotoUrl)
      URL.revokeObjectURL(selected.meetingPhotoUrl);
    await p.updateRecording(selected.id, {
      meetingPhotoBlob: undefined,
      meetingPhotoUrl: undefined,
      meetingPhotoName: undefined,
    });
    p.notify("Foto removida da reunião");
  }
  async function ask() {
    const target = selected || p.recordings.find((recording) => recording.transcript);
    const cleanQuestion = question.trim();
    if (!target) {
      p.notify("Selecione uma reunião");
      return;
    }
    if (!cleanQuestion) {
      p.notify("Digite uma pergunta sobre a reunião");
      return;
    }
    if (asking) return;
    const history = target.chatHistory || [];
    const now = new Date().toISOString();
    const userMessage = {
      id: crypto.randomUUID(),
      role: "user" as const,
      text: cleanQuestion,
      createdAt: now,
    };
    setAsking(true);
    setQuestion("");
    try {
      await p.updateRecording(target.id, {
        chatHistory: [...history, userMessage],
      });
      const response = await fetch("/api/ask-meeting", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: cleanQuestion,
          history: history.map(({ role, text }) => ({ role, text })),
          meeting: {
            name: target.name,
            meetingDate: target.meetingDate || target.createdAt,
            meetingTime: target.meetingTime,
            duration: target.duration,
            participants: target.participants,
            department: target.department,
            agenda: target.agenda,
            transcript: target.transcript,
            summary: target.summary,
            themes: target.themes,
            actions: target.actions,
            decisions: target.decisions,
          },
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | { answer?: string; error?: string }
        | null;
      if (!response.ok || !result?.answer)
        throw new Error(result?.error || "Não foi possível obter a resposta.");
      await p.updateRecording(target.id, {
        chatHistory: [
          ...history,
          userMessage,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: result.answer,
            createdAt: new Date().toISOString(),
          },
        ],
      });
    } catch (error) {
      p.notify(
        error instanceof Error
          ? error.message
          : "Não foi possível consultar a reunião.",
      );
    } finally {
      setAsking(false);
      window.setTimeout(() =>
        chatLogRef.current?.scrollTo({
          top: chatLogRef.current.scrollHeight,
          behavior: "smooth",
        }),
      );
    }
  }
  async function clearMeetingChat() {
    if (!qaMeeting?.chatHistory?.length) {
      p.notify("Esta reunião ainda não possui conversa para apagar");
      return;
    }
    if (
      !confirm(
        `Apagar todas as perguntas e respostas da reunião “${qaMeeting.name}”?`,
      )
    )
      return;
    await p.updateRecording(qaMeeting.id, { chatHistory: [] });
    setQuestion("");
    p.notify("Conversa da reunião apagada");
  }
  async function updateActionFields(
    recordingId: number,
    actionId: string,
    patch: Partial<Pick<MeetingAction, "person" | "due" | "priority" | "done">>,
  ) {
    const recording = p.recordings.find((item) => item.id === recordingId);
    if (!recording?.actions) return;
    await p.updateRecording(recordingId, {
      actions: recording.actions.map((action) =>
        action.id === actionId ? { ...action, ...patch } : action,
      ),
    });
    if (!("done" in patch)) p.notify("Ação atualizada");
  }
  if (p.active === "Reuniões")
    return (
      <section className="feature-page">
        {p.recording ? (
          <>
            <div className="feature-title">
              <div>
                <p className="eyebrow">SUA REUNIÃO EM ANDAMENTO</p>
                <h1>Nova reunião</h1>
                <p>Captura real neste aparelho</p>
              </div>
              <div className={`live-pill ${p.recordingPaused ? "paused" : ""}`}>
                <i /> {p.recordingPaused ? "PAUSADA" : "AO VIVO"} ·{" "}
                {String(Math.floor(p.recordingSeconds / 60)).padStart(2, "0")}:
                {String(p.recordingSeconds % 60).padStart(2, "0")}
              </div>
            </div>
            <div className="active-meeting-grid">
              <article className="card active-capture">
                <div className="capture-orbit">
                  <span>●</span>
                </div>
                <p className="eyebrow">CAPTURA DE ÁUDIO</p>
                <h2>{p.recordingPaused ? "Gravação pausada" : "Gravação em andamento"}</h2>
                <strong>
                  {String(Math.floor(p.recordingSeconds / 60)).padStart(2, "0")}
                  :{String(p.recordingSeconds % 60).padStart(2, "0")}
                </strong>
                <div className={`capture-bars ${p.recordingPaused ? "paused" : ""}`}>
                  {Array.from({ length: 12 }, (_, i) => (
                    <i key={i} />
                  ))}
                </div>
                <p>
                  Ao encerrar, o áudio será registrado no histórico e aberto em
                  Arquivos.
                </p>
                <div className="capture-actions">
                  <button onClick={p.togglePauseRecording}>{p.recordingPaused ? "▶ Retomar gravação" : "Ⅱ Pausar gravação"}</button>
                  <button onClick={p.stopRecording}><i /> Encerrar gravação</button>
                </div>
              </article>
              <SmartAttendance
                participants={p.liveParticipants}
                voiceSampleNames={p.liveVoiceSampleNames}
                listening={p.listeningParticipant}
                capture={p.captureParticipant}
                register={p.registerParticipant}
              />
            </div>
          </>
        ) : (
          <div className="no-live-meeting card">
            <span>◉</span>
            <p className="eyebrow">NENHUMA REUNIÃO EM ANDAMENTO</p>
            <h1>Inicie uma gravação</h1>
            <p>
              Use a Visão geral para começar. Esta área mostrará somente a
              reunião real.
            </p>
          </div>
        )}
      </section>
    );
  if (p.active === "Arquivos")
    return (
      <section className="feature-page">
        <div className="feature-title">
          <div>
            <p className="eyebrow">BIBLIOTECA</p>
            <h1>Reuniões e documentos</h1>
            <p>
              Selecione uma reunião para ouvir, transcrever e gerar seus
              documentos.
            </p>
          </div>
        </div>
        <div className="library-grid">
          <article className="card library-card">
            <div className="card-head">
              <div>
                <p className="eyebrow">REUNIÕES REAIS</p>
                <h2>Gravações</h2>
              </div>
              <span>{p.recordings.length}</span>
            </div>
            {p.recordings.length === 0 ? (
              <Empty text="Nenhuma gravação concluída" />
            ) : (
              p.recordings.map((r) => (
                <div
                  className={`recording-row ${selected?.id === r.id ? "selected" : ""}`}
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                >
                  <span>▶</span>
                  <div>
                    <strong>{r.name}</strong>
                    <small>
                      {r.createdAt} · {r.duration} · {r.size}
                    </small>
                    {p.isAdmin&&r.ownerEmail&&<small className="meeting-owner">Proprietário: {r.ownerEmail}</small>}
                    <audio
                      controls
                      src={r.url}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div className="record-file-actions">
                    <a
                      href={r.url}
                      download={`${r.name}.${audioExtension(new Blob([], {type:r.audioMimeType||"audio/webm"}))}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      ↓ Baixar
                    </a>
                    {p.isAdmin && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (
                            confirm(
                              `Excluir completamente “${r.name}”? A gravação, foto, transcrição, chat, documentos, ações e decisões serão apagados deste aparelho, e todas as pastas vinculadas serão movidas para a lixeira do Google Drive.`,
                            )
                          ) {
                            await p.deleteRecording(r.id);
                            if (selectedId === r.id) setSelectedId(null);
                          }
                        }}
                      >
                        Excluir reunião e tudo
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </article>
          <article className="card library-card meeting-workspace">
            <div className="card-head">
              <div>
                <p className="eyebrow">REUNIÃO SELECIONADA</p>
                <h2>{selected?.name || "Nenhuma reunião"}</h2>
                {p.isAdmin&&selected?.ownerEmail&&<small className="meeting-owner">Proprietário: {selected.ownerEmail}</small>}
              </div>
              {selected && (
                <span className="processing-badge">
                  {selected.processedAt
                    ? selected.processingMode === "semantic"
                      ? "Analisada semanticamente"
                      : "Processada no modo antigo"
                    : selected.transcript
                      ? "Transcrita"
                      : "Aguardando transcrição"}
                </span>
              )}
            </div>
            {selected ? (
              <>
                <MeetingMetadata
                  recording={selected}
                  update={p.updateRecording}
                  notify={p.notify}
                />
                <MeetingResources recording={selected} update={p.updateRecording} notify={p.notify} />
                <div className="meeting-photo-card">
                  <input
                    ref={filePhotoRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => {
                      void saveMeetingPhoto(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                  {selected.meetingPhotoUrl ? (
                    <img
                      src={selected.meetingPhotoUrl}
                      alt={`Registro fotográfico de ${selected.name}`}
                    />
                  ) : (
                    <div className="meeting-photo-placeholder">▣</div>
                  )}
                  <div>
                    <strong>Foto da reunião</strong>
                    <small>
                      Anexo separado para registro dos participantes. Não será
                      inserido na ata.
                    </small>
                    {selected.meetingPhotoName && (
                      <em>{selected.meetingPhotoName}</em>
                    )}
                  </div>
                  <div className="meeting-photo-actions">
                    <button onClick={() => void openCamera()}>
                      Tirar foto
                    </button>
                    <button onClick={() => filePhotoRef.current?.click()}>
                      Selecionar arquivo
                    </button>
                    {selected.meetingPhotoBlob && (
                      <button className="danger" onClick={removeMeetingPhoto}>
                        Remover
                      </button>
                    )}
                  </div>
                  <p>
                    Registre a imagem somente com o conhecimento e consentimento
                    dos participantes.
                  </p>
                </div>
                {cameraOpen && (
                  <div
                    className="camera-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Tirar foto da reunião"
                  >
                    <div className="camera-panel">
                      <div className="camera-panel-head">
                        <div>
                          <strong>Foto da reunião</strong>
                          <small>Posicione os participantes na câmera.</small>
                        </div>
                        <button onClick={closeCamera} aria-label="Fechar câmera">
                          ×
                        </button>
                      </div>
                      <div className="camera-preview">
                        <video ref={cameraVideoRef} autoPlay muted playsInline />
                        {cameraError && <p role="alert">{cameraError}</p>}
                      </div>
                      <div className="camera-controls">
                        <button
                          onClick={() =>
                            void openCamera(
                              cameraFacing === "environment"
                                ? "user"
                                : "environment",
                            )
                          }
                        >
                          Trocar câmera
                        </button>
                        <button
                          className="capture"
                          onClick={() => void captureCameraPhoto()}
                          disabled={Boolean(cameraError)}
                        >
                          ● Capturar foto
                        </button>
                        <button onClick={closeCamera}>Cancelar</button>
                      </div>
                    </div>
                  </div>
                )}
                <div className="local-transcriber">
                  <div className="mode-heading">
                    <strong>Transcrição profissional</strong>
                    <small>O modo recomendado usa a OpenAI para separar os locutores e criar uma revisão assistida.</small>
                  </div>
                  <div className="mode-options">
                    <label className={selected.transcriptionMode!=="openai"?"selected recommended":""}>
                      <input type="radio" name="transcription-mode" checked={selected.transcriptionMode!=="openai"} onChange={()=>p.updateRecording(selected.id,{transcriptionMode:"diarized"})}/>
                      <span><b>Recomendado · OpenAI + locutores</b><small>Transcreve, separa as vozes e permite identificar cada pessoa ouvindo um trecho</small></span>
                    </label>
                    <label className={selected.transcriptionMode==="openai"?"selected":""}>
                      <input type="radio" name="transcription-mode" checked={selected.transcriptionMode==="openai"} onChange={()=>p.updateRecording(selected.id,{transcriptionMode:"openai"})}/>
                      <span><b>OpenAI sem locutores</b><small>Mais simples, sem separar quem falou cada trecho</small></span>
                    </label>
                  </div>
                  <div className="transcription-controls">
                    <button onClick={transcribeWithOpenAI} disabled={transcribing}>
                      {transcribing?"Processando…":selected.transcriptionMode==="openai"?"Transcrever pela OpenAI":"Transcrever e identificar locutores"}
                    </button>
                  </div>
                  {transcriptionStatus && (
                    <div className={`transcription-progress ${transcribing&&transcriptionProgress===0?"indeterminate":""}`}>
                      <i style={{ width: `${transcriptionProgress}%` }} />
                      <span>
                        {transcriptionStatus}
                        {transcriptionProgress > 0 &&
                        transcriptionProgress < 100
                          ? ` · ${transcriptionProgress}%`
                          : ""}
                        {transcribing&&transcriptionElapsed>0?` · ${Math.floor(transcriptionElapsed/60)}:${String(transcriptionElapsed%60).padStart(2,"0")}`:""}
                      </span>
                    </div>
                  )}
                </div>
                {selected.speakerSegments?.length ? <SpeakerReview recording={selected} rename={renameSpeaker} confirm={confirmSpeakers} markUnidentified={markUnidentified}/>:null}
                <label className="transcript-editor">
                  <strong>Transcrição da reunião</strong>
                  <small>
                    Revise o texto antes da análise. A IA usará somente esta
                    transcrição como fonte.
                  </small>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="A transcrição automática aparecerá aqui."
                  />
                </label>
                <div className="semantic-note">
                  <strong>Análise semântica estruturada</strong>
                  <p>
                    Seleciona os temas mais importantes e extrai decisões,
                    ações, responsáveis, prazos, riscos, evidências e confiança
                    sem depender de palavras-chave.
                  </p>
                </div>
                {analysisIssue && (
                  <div className="analysis-issue" role="alert">
                    {analysisIssue}
                  </div>
                )}
                <div className="processing-actions">
                  <button
                    onClick={async () => {
                      await p.updateRecording(selected.id, {
                        transcript: draft,
                      });
                      p.notify("Transcrição salva");
                    }}
                  >
                    Salvar transcrição
                  </button>
                  <button
                    className="primary-btn"
                    onClick={process}
                    disabled={analyzing||(selected.transcriptionMode==="diarized"&&Boolean(selected.speakerSegments?.length)&&selected.speakerReviewStatus!=="confirmed")}
                  >
                    {analyzing
                      ? "Analisando reunião…"
                      : "Analisar com IA e gerar documentos"}
                  </button>
                </div>
                {selected.processedAt && (
                  <>
                  <div className="generated-docs">
                    <Doc
                      title="Ata da reunião"
                      onClick={() => openProfessionalDocument(selected, "ata")}
                    />
                    <Doc
                      title="Resumo executivo"
                      onClick={() =>
                        openProfessionalDocument(selected, "resumo")
                      }
                    />
                    <Doc
                      title="Matriz de ações"
                      onClick={() =>
                        openProfessionalDocument(selected, "acoes")
                      }
                    />
                    <Doc
                      title="Decisões e bloqueios"
                      onClick={() =>
                        openProfessionalDocument(selected, "decisoes")
                      }
                    />
                    <Doc
                      title={
                        selected.mindMap
                          ? "Mapa mental automático"
                          : "Mapa mental automático · reanalisar para detalhar"
                      }
                      onClick={() =>
                        openProfessionalDocument(selected, "mapa")
                      }
                    />
                  </div>
                  </>
                )}
                {(selected.processedAt||selected.driveFolderUrl)&&<div className="drive-archive">
                  <div><strong>Documentos institucionais no Google Drive</strong><small>{selected.driveFolderUrl?"Arquivos já preservados e recuperados para esta reunião.":"Cria uma subpasta com a gravação e todos os documentos desta reunião."}</small></div>
                  {selected.processedAt&&<button onClick={archiveInDrive} disabled={archivingDrive}>{archivingDrive?"Enviando ao Drive…":selected.driveFolderUrl?"Atualizar no Drive":"Arquivar no Drive"}</button>}
                  {driveStatus&&<p>{driveStatus}</p>}
                  {selected.driveFolderUrl&&<div className="drive-links"><button onClick={()=>setShowDrive(v=>!v)}>{showDrive?"Fechar pasta":"Abrir pasta completa ↗"}</button>{(selected.driveFiles||[]).map(file=><button key={file.id} onClick={()=>openDriveDocumentWindow(selected,file)}>{file.name} ↗</button>)}</div>}
                  {showDrive&&<DriveLibrary key={`${selected.ownerEmail}:${selected.id}`} isAdmin={p.isAdmin} meeting={selected}/>}
                </div>}
              </>
            ) : (
              <Empty text="Grave ou importe um áudio para começar" />
            )}
          </article>
        </div>
      </section>
    );
  if (p.active === "Ações")
    return (
      <section className="feature-page">
        <div className="feature-title">
          <div>
            <p className="eyebrow">ACTION MATRIX</p>
            <h1>Ações reais</h1>
            <p>Itens extraídos das transcrições processadas.</p>
          </div>
          <button
            className="primary-btn"
            onClick={syncSelectedToTrello}
            disabled={!selected || syncingTrello}
          >
            {syncingTrello ? "Sincronizando…" : selected?.trelloCardUrl ? "Atualizar no Trello" : "Sincronizar com Trello"}
          </button>
        </div>
        <article className="card matrix-full">
          {selected?.trelloCardUrl && <div className="trello-sync-result"><span>✓ Esta reunião está vinculada a um único card.</span><a href={selected.trelloCardUrl} target="_blank" rel="noreferrer">Abrir card no Trello ↗</a></div>}
          {allActions.length === 0 ? (
            <Empty text="Nenhuma ação identificada nas reuniões processadas" />
          ) : (
            allActions.map((a) => (
              <div className="local-action" key={a.id}>
                <button
                  className={a.done ? "done" : ""}
                  onClick={() =>
                    void updateActionFields(a.recordingId, a.id, {
                      done: !a.done,
                    })
                  }
                >
                  {a.done ? "✓" : ""}
                </button>
                <div>
                  <strong>{a.task}</strong>
                  <small>{a.meeting}</small>
                </div>
                <label className="action-edit-field">
                  <small>Responsável</small>
                  <input
                    defaultValue={a.person}
                    placeholder="A confirmar"
                    aria-label={`Responsável por ${a.task}`}
                    onBlur={(event) => {
                      const person = event.currentTarget.value.trim() || "A confirmar";
                      if (person !== a.person)
                        void updateActionFields(a.recordingId, a.id, { person });
                    }}
                  />
                </label>
                <label className="action-edit-field">
                  <small>Prazo</small>
                  <input
                    defaultValue={a.due}
                    placeholder="Sem prazo"
                    aria-label={`Prazo de ${a.task}`}
                    onBlur={(event) => {
                      const due = event.currentTarget.value.trim() || "Sem prazo";
                      if (due !== a.due)
                        void updateActionFields(a.recordingId, a.id, { due });
                    }}
                  />
                </label>
                <label className="action-edit-field">
                  <small>Prioridade</small>
                  <select
                    value={a.priority}
                    aria-label={`Prioridade de ${a.task}`}
                    onChange={(event) =>
                      void updateActionFields(a.recordingId, a.id, {
                        priority: event.currentTarget.value as
                          | "Alta"
                          | "Média"
                          | "Baixa",
                      })
                    }
                  >
                    <option value="Alta">Alta</option>
                    <option value="Média">Média</option>
                    <option value="Baixa">Baixa</option>
                  </select>
                </label>
              </div>
            ))
          )}
        </article>
      </section>
    );
  if (p.active === "Decisões")
    return (
      <DecisionBoard
        decisions={allDecisions}
        recordings={p.recordings}
        update={p.updateRecording}
        notify={p.notify}
        openMeeting={(id) => {
          setSelectedId(id);
          p.navigate("Arquivos");
        }}
      />
    );
  const qaMeeting = selected || p.recordings.find((r) => r.transcript);
  return (
    <section className="feature-page qa-page">
      <div className="feature-title">
        <div>
          <p className="eyebrow">PERGUNTE À REUNIÃO</p>
          <h1>Converse com a reunião.</h1>
          <p>
            Pergunte com suas próprias palavras. As respostas usam somente os
            dados reais da reunião.
          </p>
        </div>
        {qaMeeting?.chatHistory?.length ? (
          <button
            className="ghost-btn danger-btn"
            disabled={asking}
            onClick={() => void clearMeetingChat()}
          >
            Apagar conversa
          </button>
        ) : null}
      </div>
      <div className="qa-grid">
        <aside className="card meeting-picker">
          <label>REUNIÃO</label>
          <select
            value={qaMeeting?.id || ""}
            onChange={(e) => setSelectedId(Number(e.target.value))}
          >
            <option value="">Selecione</option>
            {p.recordings.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </aside>
        <article className="card chat-panel">
          {qaMeeting?.chatHistory?.length ? (
            <div className="chat-history" ref={chatLogRef}>
              {qaMeeting.chatHistory.map((message) => (
                <div
                  className={`chat-message ${message.role}`}
                  key={message.id}
                >
                  <span>{message.role === "assistant" ? "⌕" : "Você"}</span>
                  <p>{message.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="chat-empty">
              <span>⌕</span>
              <h2>Pergunte sobre a reunião</h2>
              <p>
                Pergunte sobre participantes, data, pauta, decisões, tarefas,
                responsáveis ou qualquer assunto discutido.
              </p>
            </div>
          )}
          <div className="ask-box">
            <input
              value={question}
              disabled={asking}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void ask();
                }
              }}
              placeholder={
                asking
                  ? "Analisando a reunião…"
                  : "Ex.: Qual aplicativo foi mencionado?"
              }
            />
            <button
              disabled={asking}
              onClick={() => void ask()}
              aria-label={
                asking ? "Analisando a reunião" : "Enviar pergunta"
              }
            >
              {asking ? "…" : "↑"}
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}
function SpeakerReview({recording,rename,confirm,markUnidentified}:{recording:DeviceRecording;rename:(speaker:string,name:string)=>Promise<void>;confirm:()=>Promise<void>;markUnidentified:()=>Promise<void>}){
  const audioRef=useRef<HTMLAudioElement|null>(null);
  const [playing,setPlaying]=useState("");
  const [stopAt,setStopAt]=useState(0);
  const [showIdentified,setShowIdentified]=useState(false);
  const speakers=useMemo(()=>{
    const grouped=new Map<string,SpeakerSegment[]>();
    for(const segment of recording.speakerSegments||[])grouped.set(segment.speaker,[...(grouped.get(segment.speaker)||[]),segment]);
    return[...grouped.entries()].map(([speaker,segments])=>({speaker,sample:[...segments].sort((a,b)=>Math.min(10,b.end-b.start)-Math.min(10,a.end-a.start))[0]}));
  },[recording.speakerSegments]);
  const unresolved=speakers.filter(({speaker})=>!recording.speakerNames?.[speaker]?.trim()).length;
  const identified=speakers.filter(({speaker})=>recording.speakerNames?.[speaker]?.trim()),pending=speakers.filter(({speaker})=>!recording.speakerNames?.[speaker]?.trim()),visible=showIdentified?speakers:pending;
  const identifiedPeople=[...new Set(identified.map(({speaker})=>recording.speakerNames?.[speaker]?.trim()).filter(Boolean))];
  async function playSample(speaker:string,sample:SpeakerSegment){
    const audio=audioRef.current;if(!audio)return;
    if(playing===speaker&&!audio.paused){audio.pause();setPlaying("");return}
    audio.currentTime=Math.max(0,sample.start);setStopAt(Math.min(sample.end,sample.start+10));setPlaying(speaker);
    try{await audio.play()}catch{setPlaying("")}
  }
  return <section className="speaker-review">
    <div><strong>Revise somente o que ainda falta</strong><small>{identified.length} trecho(s) já classificados em {identifiedPeople.length} participante(s). A lista abaixo mostra {showIdentified?"todos os trechos":"somente as vozes pendentes"}.</small></div>
    {identifiedPeople.length>0&&<div className="identified-speaker-summary">{identifiedPeople.map(name=><span key={name}>✓ {name}</span>)}<button onClick={()=>setShowIdentified(value=>!value)}>{showIdentified?"Ocultar identificados":`Revisar identificados (${identified.length})`}</button></div>}
    <audio ref={audioRef} src={recording.url} preload="metadata" onTimeUpdate={event=>{if(stopAt&&event.currentTarget.currentTime>=stopAt){event.currentTarget.pause();setPlaying("")}}} onEnded={()=>setPlaying("")} />
    <div className="speaker-review-grid">
      {visible.map(({speaker,sample},index)=><article key={speaker}>
        <button className={playing===speaker?"playing":""} onClick={()=>void playSample(speaker,sample)} aria-label={`Ouvir amostra do locutor ${index+1}`}>{playing===speaker?"Ⅱ":"▶"}</button>
        <div><span>{speakerLabel(speaker,{})}</span><small>{Math.floor(sample.start/60)}:{String(Math.floor(sample.start%60)).padStart(2,"0")} · “{sample.text.slice(0,110)}{sample.text.length>110?"…":""}”</small></div>
        <input list={`participants-${recording.id}`} value={recording.speakerNames?.[speaker]||""} placeholder={`Escreva o nome do locutor ${index+1}`} onChange={event=>void rename(speaker,event.currentTarget.value)}/>
      </article>)}
    </div>
    <datalist id={`participants-${recording.id}`}>{(recording.participants||"").split(/[\n,;]+/).map(name=>name.trim()).filter(Boolean).map(name=><option value={name} key={name}/>)}</datalist>
    <div className={`speaker-review-confirm ${unresolved?"pending":"ready"}`}>
      <span>{unresolved?`${unresolved} voz(es) ainda não identificada(s)`:recording.speakerReviewStatus==="confirmed"?"✓ Identificação revisada e confirmada":"Todas as vozes possuem um nome"}</span>
      {unresolved>0&&<button className="unidentified" onClick={()=>void markUnidentified()}>Manter como não identificado</button>}
      <button disabled={Boolean(unresolved)||recording.speakerReviewStatus==="confirmed"} onClick={()=>void confirm()}>{recording.speakerReviewStatus==="confirmed"?"Revisão confirmada":"Confirmar locutores"}</button>
    </div>
  </section>
}
function MeetingResources({recording,update,notify}:{recording:DeviceRecording;update:Props["updateRecording"];notify:Props["notify"]}) {
  const fileRef=useRef<HTMLInputElement|null>(null);
  const [linkName,setLinkName]=useState("");
  const [linkUrl,setLinkUrl]=useState("");
  const attachments=recording.attachments||[];
  async function addFiles(files?:FileList|null){
    if(!files?.length)return;
    const additions:MeetingAttachment[]=Array.from(files).map(file=>({id:crypto.randomUUID(),name:file.name,type:"file",mimeType:file.type,size:`${(file.size/1024/1024).toFixed(2)} MB`,blob:file,url:URL.createObjectURL(file),createdAt:new Date().toISOString()}));
    await update(recording.id,{attachments:[...attachments,...additions]});
    notify(`${additions.length} arquivo(s) vinculado(s) à reunião`);
  }
  async function addLink(){
    if(!linkUrl.trim())return notify("Informe o endereço do link");
    let normalized=linkUrl.trim();if(!/^https?:\/\//i.test(normalized))normalized=`https://${normalized}`;
    try{new URL(normalized)}catch{return notify("Informe um link válido")}
    const attachment:MeetingAttachment={id:crypto.randomUUID(),name:linkName.trim()||"Link da reunião",type:"link",externalUrl:normalized,createdAt:new Date().toISOString()};
    await update(recording.id,{attachments:[...attachments,attachment]});setLinkName("");setLinkUrl("");notify("Link vinculado à reunião");
  }
  async function removeAttachment(item:MeetingAttachment){if(item.type==="file"&&item.url)URL.revokeObjectURL(item.url);await update(recording.id,{attachments:attachments.filter(candidate=>candidate.id!==item.id)});notify("Material removido da reunião")}
  return <details className="meeting-resources" open>
    <summary><span><b>Materiais utilizados</b><small>Apresentações, memorandos, minutas, decretos, fichas e links externos</small></span><i>{attachments.length} item(ns)</i></summary>
    <div className="resource-tools">
      <input ref={fileRef} type="file" multiple hidden onChange={event=>{void addFiles(event.target.files);event.target.value=""}} />
      <button onClick={()=>fileRef.current?.click()}>＋ Inserir arquivos</button>
      <div className="resource-link-form"><input value={linkName} onChange={event=>setLinkName(event.target.value)} placeholder="Nome do link (opcional)"/><input value={linkUrl} onChange={event=>setLinkUrl(event.target.value)} placeholder="https://drive.google.com/…"/><button onClick={()=>void addLink()}>Adicionar link</button></div>
    </div>
    {attachments.length ? <div className="resource-list">{attachments.map(item=><div key={item.id}><span>{item.type==="file"?"▣":"↗"}</span><div><strong>{item.name}</strong><small>{item.type==="file"?`${item.size||"Arquivo"}${item.mimeType?` · ${item.mimeType}`:""}`:item.externalUrl}</small></div>{item.type==="file"?<a href={item.url} download={item.name}>Baixar</a>:<a href={item.externalUrl} target="_blank" rel="noreferrer">Abrir</a>}<button onClick={()=>void removeAttachment(item)}>Remover</button></div>)}</div>:<p className="resource-empty">Nenhum material vinculado ainda.</p>}
  </details>
}
function MeetingMetadata({
  recording,
  update,
  notify,
}: {
  recording: DeviceRecording;
  update: Props["updateRecording"];
  notify: Props["notify"];
}) {
  const [form, setForm] = useState({
    name: recording.name,
    meetingDate: recording.meetingDate || recording.createdAt,
    meetingTime: recording.meetingTime || "",
    participants: recording.participants || "",
    department: recording.department || "",
    agenda: recording.agenda || "",
  });
  useEffect(
    () =>
      setForm({
        name: recording.name,
        meetingDate: recording.meetingDate || recording.createdAt,
        meetingTime: recording.meetingTime || "",
        participants: recording.participants || "",
        department: recording.department || "",
        agenda: recording.agenda || "",
      }),
    [recording.id],
  );
  const field = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <details className="meeting-metadata" open>
      <summary>
        <span>
          <b>Dados da reunião</b>
          <small>Usados no cabeçalho e nas seções dos documentos</small>
        </span>
        <i>Editar</i>
      </summary>
      <div className="metadata-form">
        <label>
          Título
          <input
            value={form.name}
            onChange={(e) => field("name", e.target.value)}
          />
        </label>
        <label>
          Data
          <input
            type="date"
            value={form.meetingDate.includes("/") ? "" : form.meetingDate}
            onChange={(e) => field("meetingDate", e.target.value)}
          />
        </label>
        <label>
          Hora
          <input
            type="time"
            value={form.meetingTime}
            onChange={(e) => field("meetingTime", e.target.value)}
          />
        </label>
        <label>
          Setor ou local
          <input
            value={form.department}
            onChange={(e) => field("department", e.target.value)}
            placeholder="Ex.: Direção de Ensino"
          />
        </label>
        <label className="wide">
          Participantes
          <textarea
            value={form.participants}
            onChange={(e) => field("participants", e.target.value)}
            placeholder="Um nome por linha ou separados por vírgula"
          />
        </label>
        <label className="wide">
          Pauta
          <textarea
            value={form.agenda}
            onChange={(e) => field("agenda", e.target.value)}
            placeholder="Um tópico por linha"
          />
        </label>
        <button
          onClick={async () => {
            await update(recording.id, form);
            notify("Dados da reunião salvos");
          }}
        >
          Salvar dados da reunião
        </button>
      </div>
    </details>
  );
}
function SmartAttendance({
  participants,
  voiceSampleNames,
  listening,
  capture,
  register,
}: {
  participants: string[];
  voiceSampleNames: string[];
  listening: boolean;
  capture: (name?:string) => void | Promise<void>;
  register: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <article className="card smart-attendance">
      <p className="eyebrow">CHAMADA INTELIGENTE</p>
      <h2>Registro de presença</h2>
      <p className="attendance-help">
        Clique em ouvir e peça ao participante:{" "}
        <b>“Meu nome é… e estou presente.”</b>
      </p>
      <button
        className={listening ? "listening" : ""}
        onClick={()=>void capture()}
        disabled={listening}
      >
        <span>◉</span>
        {listening ? "Ouvindo o nome…" : "Ouvir próximo participante"}
      </button>
      <div className="manual-attendance">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) {
              register(name);
              setName("");
            }
          }}
          placeholder="Ou digite o nome"
        />
        <button
          onClick={() => {
            if (name.trim()) {
              register(name);
              setName("");
            }
          }}
        >
          Adicionar
        </button>
        <button
          className="record-voice"
          disabled={!name.trim()||listening}
          onClick={()=>{if(name.trim()){void capture(name);setName("")}}}
          title="Gravar cinco segundos da voz e vincular ao nome"
        >
          Gravar voz
        </button>
      </div>
      <div className="attendance-list">
        <small>{participants.length} PRESENTE(S)</small>
        {participants.length === 0 ? (
          <p>Nenhuma presença registrada.</p>
        ) : (
          participants.map((person) => (
            <div key={person}>
              <span>✓</span>
              <strong>{person}</strong>
              <time>
                {voiceSampleNames.some(name=>name.toLocaleLowerCase()===person.toLocaleLowerCase())?"VOZ ✓":new Date().toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"})}
              </time>
            </div>
          ))
        )}
      </div>
      <p className="attendance-note">
        A lista será salva na reunião e incluída automaticamente na ata.
      </p>
    </article>
  );
}
type ManagedDecision = MeetingDecision & {
  meeting: string;
  meetingDate: string;
  recordingId: number;
  decisionIndex: number;
};
function DecisionBoard({
  decisions,
  recordings,
  update,
  notify,
  openMeeting,
}: {
  decisions: ManagedDecision[];
  recordings: DeviceRecording[];
  update: Props["updateRecording"];
  notify: Props["notify"];
  openMeeting: (id: number) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null),
    [draft, setDraft] = useState<MeetingDecision | null>(null);
  const key = (item: ManagedDecision) =>
    item.id || `${item.recordingId}-${item.decisionIndex}`;
  const change = async (
    item: ManagedDecision,
    patch: Partial<MeetingDecision>,
  ) => {
    const recording = recordings.find((r) => r.id === item.recordingId);
    if (!recording) return;
    await update(item.recordingId, {
      decisions: (recording.decisions || []).map((row, index) =>
        index === item.decisionIndex ? { ...row, ...patch } : row,
      ),
    });
    notify("Registro atualizado");
  };
  const remove = async (item: ManagedDecision) => {
    const recording = recordings.find((r) => r.id === item.recordingId);
    if (!recording || !confirm("Excluir este registro?")) return;
    await update(item.recordingId, {
      decisions: (recording.decisions || []).filter(
        (_, index) => index !== item.decisionIndex,
      ),
    });
    notify("Registro excluído");
  };
  return (
    <section className="feature-page">
      <div className="feature-title">
        <div>
          <p className="eyebrow">DECISION LOG</p>
          <h1>Decisões, pendências e bloqueios</h1>
          <p>
            Revise, classifique e acompanhe os registros provenientes das
            reuniões.
          </p>
        </div>
      </div>
      {decisions.length === 0 ? (
        <div className="card">
          <Empty text="Nenhuma decisão identificada nas reuniões processadas" />
        </div>
      ) : (
        <div className="decision-grid">
          {(["decisão", "pendência", "bloqueio"] as const).map((kind) => (
            <article className={`card decision-column ${kind}`} key={kind}>
              <div className="decision-heading">
                <span>
                  {kind === "decisão" ? "✓" : kind === "pendência" ? "?" : "!"}
                </span>
                <div>
                  <small>
                    {decisions.filter((d) => d.kind === kind).length} REGISTROS
                  </small>
                  <h2>
                    {kind === "decisão"
                      ? "Decisões tomadas"
                      : kind === "pendência"
                        ? "Pontos pendentes"
                        : "Bloqueios"}
                  </h2>
                </div>
              </div>
              {decisions
                .filter((d) => d.kind === kind)
                .map((item) => {
                  const isEditing = editing === key(item);
                  return (
                    <div
                      className={`decision-record ${item.resolved ? "resolved" : ""}`}
                      key={key(item)}
                    >
                      {isEditing && draft ? (
                        <div className="decision-editor">
                          <label>
                            Texto
                            <textarea
                              value={draft.text}
                              onChange={(e) =>
                                setDraft({ ...draft, text: e.target.value })
                              }
                            />
                          </label>
                          <div>
                            <label>
                              Classificação
                              <select
                                value={draft.kind}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    kind: e.target
                                      .value as MeetingDecision["kind"],
                                  })
                                }
                              >
                                <option value="decisão">Decisão</option>
                                <option value="pendência">Pendência</option>
                                <option value="bloqueio">Bloqueio</option>
                              </select>
                            </label>
                            <label>
                              Responsável
                              <input
                                value={draft.person || ""}
                                onChange={(e) =>
                                  setDraft({ ...draft, person: e.target.value })
                                }
                              />
                            </label>
                            <label>
                              Prazo
                              <input
                                value={draft.due || ""}
                                onChange={(e) =>
                                  setDraft({ ...draft, due: e.target.value })
                                }
                              />
                            </label>
                          </div>
                          <footer>
                            <button
                              onClick={() => {
                                setEditing(null);
                                setDraft(null);
                              }}
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={async () => {
                                await change(item, draft);
                                setEditing(null);
                                setDraft(null);
                              }}
                            >
                              Salvar alterações
                            </button>
                          </footer>
                        </div>
                      ) : (
                        <>
                          <button className="decision-meeting-origin" onClick={()=>openMeeting(item.recordingId)} title="Abrir a reunião de origem"><span>REUNIÃO</span><strong>{item.meeting}</strong><small>{item.meetingDate}</small><b>→</b></button>
                          <strong>{item.text}</strong>
                          <div className="decision-meta">
                            <span>{item.person || "A confirmar"}</span>
                            <span>{item.due || "Sem prazo"}</span>
                            {typeof item.confidence === "number" && (
                              <span>
                                {Math.round(item.confidence * 100)}% confiança
                              </span>
                            )}
                            {item.resolved && <em>Resolvido</em>}
                          </div>
                          <details>
                            <summary>Ver evidência e origem</summary>
                            <blockquote>
                              {item.evidence || item.text}
                            </blockquote>
                            <button
                              onClick={() => openMeeting(item.recordingId)}
                            >
                              Abrir reunião: {item.meeting}
                            </button>
                          </details>
                          <div className="decision-tools">
                            <button
                              onClick={() =>
                                change(item, { resolved: !item.resolved })
                              }
                            >
                              {item.resolved ? "Reabrir" : "Marcar resolvido"}
                            </button>
                            <button
                              onClick={() => {
                                setEditing(key(item));
                                setDraft({ ...item });
                              }}
                            >
                              Editar
                            </button>
                            <button
                              className="danger"
                              onClick={() => remove(item)}
                            >
                              Excluir
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="dashboard-empty">
      <span>◇</span>
      <strong>{text}</strong>
      <p>Não exibimos informações demonstrativas.</p>
    </div>
  );
}
function Doc({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button className="generated-doc" onClick={onClick}>
      <span>☷</span>
      <strong>{title}</strong>
      <small>Abrir e baixar →</small>
    </button>
  );
}
