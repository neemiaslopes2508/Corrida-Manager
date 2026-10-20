import React, { useEffect, useMemo, useRef, useState } from "react";
import { CIRCUITS_2026, TEAM_BY_ID } from "./data/season2026";
import type { Career, CareerSummary, QualifyingSessionState, QualifyingView, RaceState, RaceView, SessionResult } from "./engine/types";
import type { CareerAction, ClientMessage, PlayerView, RoomSummary, RoomView, ServerMessage } from "./net/protocol";
import { applySessionResult, completeQualifyingSession, createCareer, makeRaceForCurrentRound, migrateCareer, phaseLabel, startQualifyingSession, summary } from "./engine/career";
import { dispatchCareerAction } from "./engine/actions";
import { createRaceState } from "./engine/race";
import { MPClient } from "./net/client";
import { apiUrl, MULTIPLAYER_AVAILABLE } from "./net/config";
import { MenuScreen, TeamSelectScreen } from "./ui/Menu";
import { MultiplayerHome } from "./ui/Lobby";
import { Dashboard } from "./ui/Dashboard";
import { PrepScreen, PracticeScreen, QualifyingResultScreen, ResultsScreen, SeasonEndScreen } from "./ui/Weekend";
import { SoloRaceScreen, MultiRaceScreen } from "./ui/Race";
import { MultiQualifyingScreen, SoloQualifyingScreen } from "./ui/Qualifying";
import { Badge, Button, money } from "./ui/Common";
import { TeamLogo } from "./ui/Media";

type Screen = "menu" | "select" | "multi" | "career";

export function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [career, setCareer] = useState<Career | null>(null);
  const [mode, setMode] = useState<"solo" | "multi">("solo");
  const [soloRace, setSoloRace] = useState<{ kind: "race" | "sprint"; state: RaceState } | null>(null);
  const [soloQuali, setSoloQuali] = useState<QualifyingSessionState | null>(null);
  const [qualiView, setQualiView] = useState<{ view: QualifyingView; paused: boolean; speed: number } | null>(null);
  const [saves, setSaves] = useState<CareerSummary[]>([]);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [toast, setToast] = useState<{ text: string; tone: "info" | "error" | "success" } | null>(null);

  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [you, setYou] = useState<PlayerView | null>(null);
  const [multiError, setMultiError] = useState<string | null>(null);
  const [raceView, setRaceView] = useState<{ view: RaceView; kind: "race" | "sprint"; paused: boolean; speed: number } | null>(null);
  const clientRef = useRef<MPClient | null>(null);
  const autoReconnectRef = useRef(false);
  const roomRef = useRef<RoomView | null>(null);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("cm-career-index");
      if (raw) setSaves(JSON.parse(raw) as CareerSummary[]);
    } catch {
      // índice corrompido
    }
    void refreshRooms();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [career?.phase, career?.roundIndex, screen, mode]);

  const notify = (text: string, tone: "info" | "error" | "success" = "info") => setToast({ text, tone });

  async function refreshRooms() {
    if (!MULTIPLAYER_AVAILABLE) {
      setRooms([]);
      return;
    }
    try {
      const res = await fetch(apiUrl("/api/rooms"));
      if (!res.ok) return;
      const list = (await res.json()) as RoomSummary[];
      setRooms(list.filter((r) => r.phase === "career" || r.players > 0));
    } catch {
      // servidor desligado no modo solo
    }
  }

  function persistCareer(c: Career) {
    try {
      localStorage.setItem(`cm-career-${c.id}`, JSON.stringify(c));
      const s = summary(c);
      const next = [s, ...saves.filter((x) => x.id !== c.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      localStorage.setItem("cm-career-index", JSON.stringify(next));
      setSaves(next);
    } catch {
      notify("Falha ao salvar no navegador (armazenamento cheio?).", "error");
    }
  }

  function saveLive(c: Career, state: RaceState) {
    try {
      localStorage.setItem(`cm-live-${c.id}`, JSON.stringify(state));
    } catch {
      // checkpoint é best-effort
    }
  }

  function saveLiveQuali(c: Career, state: QualifyingSessionState) {
    try {
      localStorage.setItem(`cm-quali-${c.id}`, JSON.stringify(state));
    } catch {
      // checkpoint é best-effort
    }
  }

  function clearLiveQuali(c: Career) {
    try {
      localStorage.removeItem(`cm-quali-${c.id}`);
    } catch {
      // ignore
    }
  }

  function createSoloCareer(teamId: string) {
    const c = makeSoloCareer(teamId);
    setCareer(c);
    setMode("solo");
    setSoloRace(null);
    setSoloQuali(null);
    setQualiView(null);
    setScreen("career");
    persistCareer(c);
    notify("Carreira criada. Prepare o carro para Melbourne.", "success");
  }

  function makeSoloCareer(teamId: string): Career {
    const seed = `solo-${Date.now().toString(36)}`;
    return createCareer({ nome: "Carreira solo", modo: "solo", playerTeams: [teamId], seed });
  }

  function loadCareer(id: string) {
    try {
      const raw = localStorage.getItem(`cm-career-${id}`);
      if (!raw) {
        notify("Carreira não encontrada.", "error");
        return;
      }
      const c = migrateCareer(JSON.parse(raw) as Career);
      setMode("solo");
      setCareer(c);
      setSoloRace(null);
      setSoloQuali(null);
      setQualiView(null);
      if (c.phase === "qualifying" || c.phase === "sprintQuali") {
        const round = c.rounds[c.roundIndex];
        const legacyResult = c.phase === "sprintQuali" ? round.sprintQualifying : round.qualifying;
        if (!legacyResult) {
          let session = round.qualifyingSession ?? null;
          const live = localStorage.getItem(`cm-quali-${c.id}`);
          if (live) {
            try {
              session = JSON.parse(live) as QualifyingSessionState;
            } catch {
              // checkpoint inválido; usa o estado da carreira
            }
          }
          if (!session) session = startQualifyingSession(c, c.phase === "sprintQuali" ? "sprintQuali" : "quali");
          setSoloQuali(session);
          persistCareer(c);
        }
      }
      if (c.phase === "race" || c.phase === "sprint") {
        const kind = c.phase === "sprint" ? "sprint" : "race";
        const live = localStorage.getItem(`cm-live-${c.id}`);
        if (live) {
          try {
            setSoloRace({ kind, state: JSON.parse(live) as RaceState });
          } catch {
            setSoloRace({ kind, state: makeRaceForCurrentRound(c, kind) });
          }
        } else {
          setSoloRace({ kind, state: makeRaceForCurrentRound(c, kind) });
        }
      }
      setScreen("career");
      notify("Carreira carregada.", "success");
    } catch {
      notify("Arquivo de carreira inválido.", "error");
    }
  }

  function soloAction(action: CareerAction) {
    if (!career) return;
    try {
      const draft = structuredClone(career);
      const res = dispatchCareerAction(draft, action, draft.playerTeams);
      if (!res.ok) {
        notify(res.error ?? "Ação rejeitada.", "error");
        return;
      }
      if (action.type === "finishPractice") {
        const session = draft.rounds[draft.roundIndex]?.qualifyingSession ?? null;
        setSoloQuali(session);
        setQualiView(null);
        if (session) saveLiveQuali(draft, session);
      }
      if (action.type === "enterRace") {
        const state = makeRaceForCurrentRound(draft, action.kind);
        setSoloRace({ kind: action.kind, state });
        saveLive(draft, state);
        clearLiveQuali(draft);
      }
      draft.updatedAt = new Date().toISOString();
      setCareer(draft);
      persistCareer(draft);
      if (action.type === "runPractice") {
        const learned = action.driverId
          ? draft.rounds[draft.roundIndex].practice?.teams?.[action.teamId]?.drivers[action.driverId]
          : undefined;
        const last = learned?.programs[learned.programs.length - 1];
        if (last) notify(last.summary, "success");
      }
      if (action.type === "startDevelopment") notify("Solicitação registrada no desenvolvimento.", "success");
      if (action.type === "hireStaff") notify("Equipe técnica atualizada.", "success");
      if (action.type === "signSponsor") notify("Patrocínio assinado.", "success");
      if (action.type === "renewDriver") notify("Contrato renovado.", "success");
      if (action.type === "replaceComponent") notify("Componente substituído.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Falha ao executar a ação.", "error");
    }
  }

  function finishSoloRace(result: SessionResult) {
    if (!career || !soloRace) return;
    const draft = structuredClone(career);
    applySessionResult(draft, result, soloRace.kind);
    localStorage.removeItem(`cm-live-${career.id}`);
    setSoloRace(null);
    const nextQuali = draft.rounds[draft.roundIndex]?.qualifyingSession ?? null;
    setSoloQuali(nextQuali);
    if (nextQuali) saveLiveQuali(draft, nextQuali);
    setCareer(draft);
    persistCareer(draft);
    notify(soloRace.kind === "sprint" ? "Sprint concluído. Classificação interativa liberada." : "Corrida concluída. Resultados e campeonato atualizados.", "success");
  }

  function finishSoloQualifying(session: QualifyingSessionState) {
    if (!career) return;
    const draft = structuredClone(career);
    completeQualifyingSession(draft, session);
    clearLiveQuali(draft);
    setSoloQuali(null);
    setCareer(draft);
    persistCareer(draft);
    notify(session.type === "sprintQuali" ? "Classificação Sprint concluída. Grid do Sprint definido." : "Classificação concluída. Grid definido.", "success");
  }

  function exitSoloRace() {
    if (career && soloRace) saveLive(career, soloRace.state);
    setCareer(null);
    setSoloRace(null);
    setSoloQuali(null);
    setQualiView(null);
    setScreen("menu");
    void refreshRooms();
  }

  // ---------- multiplayer ----------
  function ensureClient(): MPClient {
    if (clientRef.current) return clientRef.current;
    const client = new MPClient(handleServerMessage, (ok, err) => {
      setConnected(ok);
      if (err) setMultiError(err);
      if (ok && roomRef.current) {
        const code = roomRef.current.code;
        const token = localStorage.getItem(`cm-room-${code}`);
        if (token) clientRef.current?.send({ type: "reconnect", code, token });
      }
    });
    clientRef.current = client;
    client.connect();
    return client;
  }

  function handleServerMessage(msg: ServerMessage) {
    switch (msg.type) {
      case "room_state": {
        setRoom(msg.room);
        setYou(msg.you);
        setMultiError(null);
        if (msg.token) {
          localStorage.setItem(`cm-room-${msg.room.code}`, msg.token);
          localStorage.setItem("cm-last-room", msg.room.code);
        }
        if (msg.room.phase === "lobby") {
          setCareer(null);
          setRaceView(null);
          setQualiView(null);
        }
        break;
      }
      case "career_state": {
        setCareer(msg.career);
        setMode("multi");
        if (msg.career.phase !== "race" && msg.career.phase !== "sprint") {
          setRaceView(null);
        }
        if (msg.career.phase !== "qualifying" && msg.career.phase !== "sprintQuali") setQualiView(null);
        break;
      }
      case "qualifying_view": {
        setQualiView({ view: msg.view, paused: msg.paused, speed: msg.speed });
        break;
      }
      case "qualifying_finished": {
        setQualiView(null);
        break;
      }
      case "race_started": {
        setRaceView(null);
        break;
      }
      case "race_view": {
        setRaceView({ view: msg.view, kind: msg.kind, paused: msg.paused, speed: msg.speed });
        break;
      }
      case "race_finished": {
        setRaceView(null);
        break;
      }
      case "error": {
        setMultiError(msg.message);
        notify(msg.message, "error");
        break;
      }
      case "saved": {
        notify("Sessão salva no servidor host.", "success");
        break;
      }
      case "pong":
        break;
    }
  }

  function openMultiplayer() {
    if (!MULTIPLAYER_AVAILABLE) {
      notify(
        "Esta versão é estática (GitHub Pages) e roda apenas o modo solo. O multiplayer precisa do servidor Node/WebSocket.",
        "info",
      );
      return;
    }
    setScreen("multi");
    setMode("multi");
    setMultiError(null);
    const client = ensureClient();
    autoReconnectRef.current = false;
    setTimeout(() => {
      if (autoReconnectRef.current) return;
      const code = localStorage.getItem("cm-last-room");
      const token = code ? localStorage.getItem(`cm-room-${code}`) : null;
      if (code && token && !room) {
        autoReconnectRef.current = true;
        client.send({ type: "reconnect", code, token });
      }
    }, 400);
  }

  function mpSend(msg: ClientMessage) {
    ensureClient().send(msg);
  }

  function multiAction(action: CareerAction) {
    mpSend({ type: "career_action", action });
  }

  function leaveRoom() {
    if (room) mpSend({ type: "leave" });
    setRoom(null);
    setYou(null);
    setCareer(null);
    setRaceView(null);
    setQualiView(null);
    clientRef.current?.close();
    clientRef.current = null;
    setConnected(false);
    setScreen("menu");
    void refreshRooms();
  }

  function exitMultiCareer() {
    clientRef.current?.close();
    clientRef.current = null;
    setCareer(null);
    setRoom(null);
    setYou(null);
    setRaceView(null);
    setQualiView(null);
    setConnected(false);
    setScreen("menu");
    void refreshRooms();
  }

  // ---------- render ----------
  const meTeamId = mode === "multi" ? you?.teamId ?? career?.playerTeams[0] ?? "" : career?.playerTeams[0] ?? "";
  const isHost = mode === "solo" ? true : !!you?.isHost;
  const action = mode === "multi" ? multiAction : soloAction;

  let content: React.ReactNode;
  if (screen === "menu") {
    content = (
      <MenuScreen
        saves={saves}
        rooms={rooms}
        multiplayerAvailable={MULTIPLAYER_AVAILABLE}
        onSolo={() => setScreen("select")}
        onMultiplayer={openMultiplayer}
        onLoad={loadCareer}
        onReconnect={(code) => {
          openMultiplayer();
          setTimeout(() => {
            const token = localStorage.getItem(`cm-room-${code}`);
            if (token) mpSend({ type: "reconnect", code, token });
            else {
              localStorage.setItem("cm-last-room", code);
              setScreen("multi");
            }
          }, 500);
        }}
        onRefreshRooms={() => void refreshRooms()}
      />
    );
  } else if (screen === "select") {
    content = <TeamSelectScreen onBack={() => setScreen("menu")} onStart={createSoloCareer} />;
  } else if (mode === "multi" && (!career || room?.phase !== "career")) {
    content = (
      <MultiplayerHome
        connected={connected}
        error={multiError}
        room={room}
        you={you}
        onConnect={() => ensureClient()}
        onCreate={(name) => { setMultiError(null); mpSend({ type: "create_room", name }); }}
        onJoin={(code, name) => { setMultiError(null); mpSend({ type: "join_room", code, name }); }}
        onReconnect={(code, token) => { setMultiError(null); mpSend({ type: "reconnect", code, token }); }}
        onBack={() => { if (room) mpSend({ type: "leave" }); clientRef.current?.close(); clientRef.current = null; setRoom(null); setYou(null); setConnected(false); setScreen("menu"); }}
        onPickTeam={(teamId) => mpSend({ type: "pick_team", teamId })}
        onReady={(ready) => mpSend({ type: "set_ready", ready })}
        onStart={() => mpSend({ type: "start_career" })}
      />
    );
  } else if (!career) {
    content = (
      <div className="waiting-screen">
        <p className="muted">Carregando carreira da sala...</p>
        <Button variant="ghost" onClick={() => setScreen("menu")}>Voltar</Button>
      </div>
    );
  } else {
    const inRace = career.phase === "race" || career.phase === "sprint";
    const raceKind = career.phase === "sprint" ? "sprint" : "race";
    const qualifyingRound = career.rounds[career.roundIndex];
    const legacyQualifyingResult = career.phase === "sprintQuali" ? qualifyingRound?.sprintQualifying : career.phase === "qualifying" ? qualifyingRound?.qualifying : null;
    const liveQualifying = (career.phase === "qualifying" || career.phase === "sprintQuali") && !legacyQualifyingResult && (mode === "solo" ? !!soloQuali : !!qualiView);
    const fullScreenSession = inRace || liveQualifying;
    content = (
      <div className={`career-shell ${fullScreenSession ? "race-active" : ""}`}>
        <TopBar
          career={career}
          mode={mode}
          teamId={meTeamId}
          connected={connected}
          onSave={() => {
            if (mode === "solo") {
              persistCareer(career);
              if (soloRace) saveLive(career, soloRace.state);
              if (soloQuali) saveLiveQuali(career, soloQuali);
              notify("Carreira salva neste navegador.", "success");
            } else {
              mpSend({ type: "career_action", action: { type: "save" } });
            }
          }}
          onExit={() => {
            if (mode === "solo") {
              if (career) persistCareer(career);
              if (career && soloRace) saveLive(career, soloRace.state);
              if (career && soloQuali) saveLiveQuali(career, soloQuali);
              setCareer(null);
              setSoloRace(null);
              setSoloQuali(null);
              setScreen("menu");
              void refreshRooms();
            } else {
              exitMultiCareer();
            }
          }}
        />
        <main className={`career-main ${fullScreenSession ? "race-main" : ""}`}>
          {career.phase === "management" && (
            <Dashboard
              career={career}
              meTeamId={meTeamId}
              onAction={action}
              onPrepare={() => action({ type: "enterPrep" })}
              isHost={isHost}
            />
          )}
          {career.phase === "prep" && <PrepScreen career={career} meTeamId={meTeamId} onAction={action} isHost={isHost} />}
          {career.phase === "practice" && <PracticeScreen career={career} meTeamId={meTeamId} onAction={action} isHost={isHost} />}
          {career.phase === "sprintQuali" || career.phase === "qualifying" ? (
            mode === "solo" ? (
              soloQuali && !legacyQualifyingResult ? (
                <SoloQualifyingScreen
                  key={soloQuali.id}
                  career={career}
                  meTeamId={meTeamId}
                  type={soloQuali.type}
                  initialState={soloQuali}
                  onCheckpoint={(state) => {
                    setSoloQuali(state);
                    saveLiveQuali(career, state);
                  }}
                  onFinish={finishSoloQualifying}
                  onExit={() => {
                    if (soloQuali) saveLiveQuali(career, soloQuali);
                    setCareer(null);
                    setSoloQuali(null);
                    setScreen("menu");
                  }}
                />
              ) : legacyQualifyingResult ? (
                <QualifyingResultScreen career={career} onAction={action} isHost={isHost} />
              ) : (
                <div className="waiting-screen"><p>Preparando a classificação...</p></div>
              )
            ) : qualiView && !legacyQualifyingResult ? (
              <MultiQualifyingScreen
                career={career}
                meTeamId={meTeamId}
                view={qualiView.view}
                paused={qualiView.paused}
                speed={qualiView.speed}
                isHost={isHost}
                onControl={(ctrl) => mpSend({ type: "qualifying_control", ...ctrl })}
                onCommand={(command) => mpSend({ type: "qualifying_command", command })}
                onExit={exitMultiCareer}
              />
            ) : legacyQualifyingResult ? (
              <QualifyingResultScreen career={career} onAction={action} isHost={isHost} />
            ) : (
              <div className="waiting-screen"><div className="pulse-dot" /><p>Aguardando a classificação do servidor...</p></div>
            )
          ) : null}
          {inRace && mode === "solo" && soloRace && (
            <SoloRaceScreen
              key={`${career.id}-${career.roundIndex}-${raceKind}`}
              career={career}
              kind={raceKind}
              initialState={soloRace.state}
              onCheckpoint={(state) => saveLive(career, state)}
              onFinish={finishSoloRace}
              onExit={exitSoloRace}
            />
          )}
          {inRace && mode === "solo" && !soloRace && (
            <div className="waiting-screen">
              <p>A corrida não foi inicializada.</p>
              <Button variant="primary" onClick={() => { const state = makeRaceForCurrentRound(career, raceKind); setSoloRace({ kind: raceKind, state }); saveLive(career, state); }}>
                Iniciar corrida
              </Button>
            </div>
          )}
          {inRace && mode === "multi" && raceView && (
            <MultiRaceScreen
              career={career}
              view={raceView.view}
              kind={raceView.kind}
              paused={raceView.paused}
              speed={raceView.speed}
              isHost={isHost}
              onControl={(ctrl) => mpSend({ type: "race_control", ...ctrl })}
              onCommand={(command) => mpSend({ type: "race_command", command })}
              onExit={exitMultiCareer}
            />
          )}
          {inRace && mode === "multi" && !raceView && (
            <div className="waiting-screen">
              <div className="pulse-dot" />
              <p>Aguardando o estado da corrida do servidor...</p>
            </div>
          )}
          {career.phase === "results" && (
            <ResultsScreen career={career} meTeamId={meTeamId} onAction={action} isHost={isHost} onExit={() => (mode === "solo" ? (setCareer(null), setScreen("menu")) : exitMultiCareer())} />
          )}
          {career.phase === "seasonEnd" && (
            <SeasonEndScreen career={career} meTeamId={meTeamId} onExit={() => (mode === "solo" ? (setCareer(null), setScreen("menu"), void refreshRooms()) : exitMultiCareer())} />
          )}
        </main>
      </div>
    );
  }

  return (
    <div className={`app ${mode === "multi" ? "multi" : ""}`}>
      {content}
      {toast && <div className={`toast toast-${toast.tone}`}>{toast.text}</div>}
    </div>
  );
}

function TopBar({
  career,
  mode,
  teamId,
  connected,
  onSave,
  onExit,
}: {
  career: Career;
  mode: "solo" | "multi";
  teamId: string;
  connected: boolean;
  onSave: () => void;
  onExit: () => void;
}) {
  const team = career.teams.find((t) => t.teamId === teamId);
  const circuit = CIRCUITS_2026[career.roundIndex];
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="brand-mark">CM</span>
        <div>
          <strong>CORRIDA MANAGER</strong>
          <span>{mode === "solo" ? "Carreira solo" : "Multiplayer"}</span>
        </div>
      </div>
      <div className="topbar-center">
        <span className="topbar-round">{circuit.gp}</span>
        <Badge tone="info">{phaseLabel(career.phase)}</Badge>
        <span className="muted small">Etapa {career.roundIndex + 1}/3</span>
      </div>
      <div className="topbar-team">
        <TeamLogo teamId={teamId} size="xs" decorative />
        <strong>{TEAM_BY_ID[teamId]?.nome ?? "Equipe"}</strong>
        <span className={team && team.budget < 0 ? "text-bad" : "text-good"}>{team ? money(team.budget) : "—"}</span>
      </div>
      <div className="topbar-actions">
        {mode === "multi" && <Badge tone={connected ? "good" : "bad"}>{connected ? "Online" : "Offline"}</Badge>}
        <Button size="small" variant="ghost" onClick={onSave}>Salvar</Button>
        <Button size="small" variant="ghost" onClick={onExit}>Menu</Button>
      </div>
    </header>
  );
}
