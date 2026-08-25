"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { type MeetingAction, type MeetingDecision } from "./local-processing";
import { analyzeTranscriptSemantically } from "./semantic-processing";
import {
  transcribeAudioInChunks,
  type TranscriptionQuality,
} from "./chunked-transcription";
import {
  transcribeAudioWithOpenAI,
  type SpeakerSegment,
} from "./openai-transcription";
import { openProfessionalDocument } from "./professional-documents";
import type { DeviceRecording } from "./page";

type Props = {
  isAdmin: boolean;
  active: string;
  recordings: DeviceRecording[];
  recording: boolean;
  recordingSeconds: number;
  stopRecording: () => void;
  notify: (s: string) => void;
  updateRecording: (
    id: number,
    patch: Partial<DeviceRecording>,
  ) => Promise<void>;
  deleteRecording: (id: number) => Promise<void>;
  liveParticipants: string[];
  listeningParticipant: boolean;
  captureParticipant: () => void;
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
  const filePhotoRef = useRef<HTMLInputElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
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
    [transcriptionQuality, setTranscriptionQuality] =
      useState<TranscriptionQuality>("accurate");
  const selected = p.recordings.find(
    (r) => r.id === (selectedId ?? p.recordings[0]?.id),
  );
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
  useEffect(
    () => () =>
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop()),
    [],
  );
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
  async function transcribeLocally() {
    if (!selected || transcribing) return;
    setTranscribing(true);
    setTranscriptionProgress(0);
    setTranscriptionStatus("Preparando o áudio em partes…");
    try {
      const blob = await fetch(selected.url).then((r) => r.blob());
      const text = await transcribeAudioInChunks(
        blob,
        (message, percent) => {
          setTranscriptionStatus(message);
          setTranscriptionProgress(percent);
        },
        transcriptionQuality,
      );
      setDraft(text);
      await p.updateRecording(selected.id, { transcript: text });
      setTranscriptionProgress(100);
      setTranscriptionStatus("Transcrição concluída");
      p.notify("Áudio transcrito em partes neste aparelho");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível transcrever este áudio";
      setTranscriptionStatus(message);
      p.notify("Falha na transcrição local");
    } finally {
      setTranscribing(false);
    }
  }
  async function transcribeWithOpenAI() {
    if (!selected || transcribing) return;
    setTranscribing(true);
    setTranscriptionProgress(15);
    setTranscriptionStatus("Enviando áudio com segurança para a OpenAI…");
    try {
      const blob = await fetch(selected.url).then((r) => r.blob());
      setTranscriptionProgress(45);
      setTranscriptionStatus("A OpenAI está transcrevendo a reunião…");
      const diarize=selected.transcriptionMode==="diarized";
      const result = await transcribeAudioWithOpenAI(blob,{diarize,participants:selected.participants});
      const text=diarize&&result.segments.length?speakerTranscript(result.segments,result.speakerNames):result.text;
      setDraft(text);
      await p.updateRecording(selected.id, {
        transcript: text,
        transcriptionMode: diarize?"diarized":"openai",
        speakerSegments: result.segments,
        speakerNames: result.speakerNames,
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
    await p.updateRecording(selected.id,{speakerNames,transcript});
  }
  async function archiveInDrive() {
    if (!selected || archivingDrive) return;
    setArchivingDrive(true);
    setDriveStatus("Preparando arquivos e gravação…");
    try {
      const audio = await fetch(selected.url).then((response) => response.blob());
      const form = new FormData();
      const { meetingPhotoBlob: _photo, ...meeting } = selected;
      form.set("meeting", JSON.stringify(meeting));
      form.set("audio", audio, `${selected.name}.webm`);
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
              <div className="live-pill">
                <i /> AO VIVO ·{" "}
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
                <h2>Gravação em andamento</h2>
                <strong>
                  {String(Math.floor(p.recordingSeconds / 60)).padStart(2, "0")}
                  :{String(p.recordingSeconds % 60).padStart(2, "0")}
                </strong>
                <div className="capture-bars">
                  {Array.from({ length: 12 }, (_, i) => (
                    <i key={i} />
                  ))}
                </div>
                <p>
                  Ao encerrar, o áudio será registrado no histórico e aberto em
                  Arquivos.
                </p>
                <button onClick={p.stopRecording}>
                  <i /> Encerrar e salvar reunião
                </button>
              </article>
              <SmartAttendance
                participants={p.liveParticipants}
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
                    <audio
                      controls
                      src={r.url}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div className="record-file-actions">
                    <a
                      href={r.url}
                      download={`${r.name}.webm`}
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
                    <strong>Como transcrever esta reunião?</strong>
                    <small>O modo híbrido é sempre o padrão e mantém o áudio neste aparelho.</small>
                  </div>
                  <div className="mode-options">
                    <label className={(selected.transcriptionMode||"hybrid")==="hybrid"?"selected":""}>
                      <input type="radio" name="transcription-mode" checked={(selected.transcriptionMode||"hybrid")==="hybrid"} onChange={()=>p.updateRecording(selected.id,{transcriptionMode:"hybrid"})}/>
                      <span><b>Híbrido</b><small>Transcrição local + documentos pela OpenAI · ~R$ 0,50/h</small></span>
                    </label>
                    <label className={selected.transcriptionMode==="openai"?"selected":""}>
                      <input type="radio" name="transcription-mode" checked={selected.transcriptionMode==="openai"} onChange={()=>p.updateRecording(selected.id,{transcriptionMode:"openai"})}/>
                      <span><b>Totalmente OpenAI</b><small>Áudio e documentos pela API · ~R$ 2,00/h</small></span>
                    </label>
                    <label className={selected.transcriptionMode==="diarized"?"selected":""}>
                      <input type="radio" name="transcription-mode" checked={selected.transcriptionMode==="diarized"} onChange={()=>p.updateRecording(selected.id,{transcriptionMode:"diarized"})}/>
                      <span><b>OpenAI + locutores</b><small>Separa as vozes e relaciona nomes pela chamada inicial</small></span>
                    </label>
                  </div>
                  <div className="transcription-controls">
                    {(selected.transcriptionMode||"hybrid")==="hybrid"&&<select value={transcriptionQuality} onChange={(e)=>setTranscriptionQuality(e.target.value as TranscriptionQuality)} disabled={transcribing} aria-label="Qualidade da transcrição">
                      <option value="accurate">Mais preciso</option><option value="balanced">Equilibrado</option><option value="fast">Mais rápido</option>
                    </select>}
                    <button onClick={(selected.transcriptionMode||"hybrid")==="hybrid"?transcribeLocally:transcribeWithOpenAI} disabled={transcribing}>
                      {transcribing?"Transcrevendo…":(selected.transcriptionMode||"hybrid")==="hybrid"?"Transcrever no aparelho":selected.transcriptionMode==="diarized"?"Transcrever e identificar locutores":"Transcrever pela OpenAI"}
                    </button>
                  </div>
                  {transcriptionStatus && (
                    <div className="transcription-progress">
                      <i style={{ width: `${transcriptionProgress}%` }} />
                      <span>
                        {transcriptionStatus}
                        {transcriptionProgress > 0 &&
                        transcriptionProgress < 100
                          ? ` · ${transcriptionProgress}%`
                          : ""}
                      </span>
                    </div>
                  )}
                </div>
                {selected.speakerSegments?.length ? (
                  <section className="speaker-review">
                    <div>
                      <strong>Conferir identificação dos locutores</strong>
                      <small>Revise os nomes antes de gerar os documentos. A chamada inicial é usada para a associação automática.</small>
                    </div>
                    <div className="speaker-review-grid">
                      {[...new Set(selected.speakerSegments.map(item=>item.speaker))].map((speaker,index)=>(
                        <label key={speaker}>
                          <span>{speakerLabel(speaker,{})}</span>
                          <input
                            list={`participants-${selected.id}`}
                            value={selected.speakerNames?.[speaker]||""}
                            placeholder={`Nome do locutor ${index+1}`}
                            onChange={event=>void renameSpeaker(speaker,event.currentTarget.value)}
                          />
                        </label>
                      ))}
                    </div>
                    <datalist id={`participants-${selected.id}`}>
                      {(selected.participants||"").split(/[\n,;]+/).map(name=>name.trim()).filter(Boolean).map(name=><option value={name} key={name}/>) }
                    </datalist>
                  </section>
                ):null}
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
                    disabled={analyzing}
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
                  <div className="drive-archive">
                    <div>
                      <strong>Arquivo institucional no Google Drive</strong>
                      <small>Cria uma subpasta com a gravação e todos os documentos desta reunião.</small>
                    </div>
                    <button onClick={archiveInDrive} disabled={archivingDrive}>
                      {archivingDrive ? "Enviando ao Drive…" : selected.driveFolderUrl ? "Atualizar no Drive" : "Arquivar no Drive"}
                    </button>
                    {driveStatus && <p>{driveStatus}</p>}
                    {selected.driveFolderUrl && (
                      <div className="drive-links">
                        <a href={selected.driveFolderUrl} target="_blank" rel="noreferrer">Abrir pasta completa ↗</a>
                        {(selected.driveFiles || []).map((file) => <a key={file.id} href={file.webViewLink} target="_blank" rel="noreferrer">{file.name} ↗</a>)}
                      </div>
                    )}
                  </div>
                  </>
                )}
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
  listening,
  capture,
  register,
}: {
  participants: string[];
  listening: boolean;
  capture: () => void;
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
        onClick={capture}
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
      </div>
      <div className="attendance-list">
        <small>{participants.length} PRESENTE(S)</small>
        {participants.length === 0 ? (
          <p>Nenhuma presença registrada.</p>
        ) : (
          participants.map((person, i) => (
            <div key={person}>
              <span>✓</span>
              <strong>{person}</strong>
              <time>
                {new Date().toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
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
