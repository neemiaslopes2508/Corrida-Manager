import React, { useEffect, useMemo, useRef, useState } from "react";
import { CIRCUITS_2026, DRIVER_BY_ID, TEAM_BY_ID } from "../data/season2026";
import type { Career, QualifyingCommand, QualifyingSessionState, QualifyingView, TyreMode } from "../engine/types";
import { buildQualifyingView, QUALIFYING_SPEEDS, advanceQualifyingSegment, advanceQualifyingSession, applyQualifyingCommand, simulateQualifyingToEnd } from "../engine/qualifyingSession";
import { COMPOUNDS } from "../engine/tyres";
import { formatClock, formatLapTime } from "../engine/track";
import { Button, TyreBadge } from "./Common";
import { DriverPortrait, TeamLogo } from "./Media";
import { CountryFlag, WeatherIcon } from "./Visuals";
import { TrackMap } from "./TrackMap";

type Control = { action: "pause" | "resume" | "speed" | "next" | "skip"; value?: number };

export function SoloQualifyingScreen({
  career,
  meTeamId,
  type,
  initialState,
  onCheckpoint,
  onFinish,
  onExit,
}: {
  career: Career;
  meTeamId: string;
  type: "quali" | "sprintQuali";
  initialState: QualifyingSessionState;
  onCheckpoint: (state: QualifyingSessionState) => void;
  onFinish: (state: QualifyingSessionState) => void;
  onExit: () => void;
}) {
  const stateRef = useRef(initialState);
  const [view, setView] = useState(() => buildQualifyingView(initialState));
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(20);
  const pausedRef = useRef(paused);
  const speedRef = useRef(speed);
  const finishedRef = useRef(false);
  const finishRef = useRef(onFinish);
  const checkpointRef = useRef(onCheckpoint);
  finishRef.current = onFinish;
  checkpointRef.current = onCheckpoint;

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastRender = 0;
    let lastSave = 0;
    const tick = (now: number) => {
      const state = stateRef.current;
      const dt = Math.min(0.4, (now - last) / 1000);
      last = now;
      if (!pausedRef.current && state.status === "running") {
        acc += dt * speedRef.current;
        let guard = 0;
        while (acc >= 0.25 && state.status === "running" && guard < 1200) {
          advanceQualifyingSession(state, 0.25);
          acc -= 0.25;
          guard++;
        }
      }
      if (now - lastRender > 100) {
        setView(buildQualifyingView(state));
        lastRender = now;
      }
      if (now - lastSave > 5000) {
        checkpointRef.current(structuredClone(state));
        lastSave = now;
      }
      if (state.status === "finished" && !finishedRef.current) {
        finishedRef.current = true;
        checkpointRef.current(structuredClone(state));
        setView(buildQualifyingView(state));
        finishRef.current(structuredClone(state));
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const command = (cmd: QualifyingCommand) => {
    const res = applyQualifyingCommand(stateRef.current, cmd, meTeamId);
    if (res.ok) {
      checkpointRef.current(structuredClone(stateRef.current));
      setView(buildQualifyingView(stateRef.current));
    }
  };
  const control = (ctrl: Control) => {
    const state = stateRef.current;
    if (ctrl.action === "pause") setPaused(true);
    else if (ctrl.action === "resume") setPaused(false);
    else if (ctrl.action === "speed" && ctrl.value) setSpeed(ctrl.value);
    else if (ctrl.action === "next") {
      const res = advanceQualifyingSegment(state);
      if (res.ok) {
        checkpointRef.current(structuredClone(state));
        setView(buildQualifyingView(state));
      }
    } else if (ctrl.action === "skip") {
      simulateQualifyingToEnd(state);
      setView(buildQualifyingView(state));
      if (state.status === "finished" && !finishedRef.current) {
        finishedRef.current = true;
        finishRef.current(structuredClone(state));
      }
    }
  };

  return (
    <LiveQualifyingScreen
      career={career}
      meTeamId={meTeamId}
      type={type}
      view={view}
      paused={paused}
      speed={speed}
      isHost
      canControl
      onControl={control}
      onCommand={command}
      onExit={() => {
        checkpointRef.current(structuredClone(stateRef.current));
        onExit();
      }}
    />
  );
}

export function MultiQualifyingScreen({
  career,
  meTeamId,
  view,
  paused,
  speed,
  isHost,
  onControl,
  onCommand,
  onExit,
}: {
  career: Career;
  meTeamId: string;
  view: QualifyingView;
  paused: boolean;
  speed: number;
  isHost: boolean;
  onControl: (ctrl: Control) => void;
  onCommand: (cmd: QualifyingCommand) => void;
  onExit: () => void;
}) {
  return (
    <LiveQualifyingScreen
      career={career}
      meTeamId={meTeamId}
      type={view.type}
      view={view}
      paused={paused}
      speed={speed}
      isHost={isHost}
      canControl={isHost}
      onControl={onControl}
      onCommand={onCommand}
      onExit={onExit}
    />
  );
}

function LiveQualifyingScreen({
  career,
  meTeamId,
  type,
  view,
  paused,
  speed,
  isHost,
  canControl,
  onControl,
  onCommand,
  onExit,
}: {
  career: Career;
  meTeamId: string;
  type: "quali" | "sprintQuali";
  view: QualifyingView;
  paused: boolean;
  speed: number;
  isHost: boolean;
  canControl: boolean;
  onControl: (ctrl: Control) => void;
  onCommand: (cmd: QualifyingCommand) => void;
  onExit: () => void;
}) {
  const circuit = CIRCUITS_2026.find((c) => c.id === view.circuitId) ?? CIRCUITS_2026[career.roundIndex];
  const myCars = useMemo(() => {
    const ids = career.drivers.filter((driver) => driver.teamId === meTeamId).map((driver) => driver.driverId);
    return ids.map((id) => view.cars.find((car) => car.driverId === id)).filter((car): car is QualifyingView["cars"][number] => !!car);
  }, [view, meTeamId, career.drivers]);
  const [selected, setSelected] = useState<string | null>(myCars[0]?.driverId ?? view.cars[0]?.driverId ?? null);
  const selectedCar = view.cars.find((car) => car.driverId === selected) ?? myCars[0] ?? view.cars[0];
  const onTrack = view.cars.filter((car) => car.status === "out" || car.status === "flying" || car.status === "in");
  const fastest = view.fastestLap ? DRIVER_BY_ID[view.fastestLap.driverId]?.codigo ?? view.fastestLap.driverId : "—";
  const label = `${type === "sprintQuali" ? "SQ" : "Q"}${view.segment}`;
  const next = view.segment < 3 ? `Iniciar ${type === "sprintQuali" ? "SQ" : "Q"}${view.segment + 1}` : "Encerrar";
  const mapCars = onTrack.map((car) => ({
    driverId: car.driverId,
    teamId: car.teamId,
    position: car.position,
    distance: car.distance,
    lane: 0,
    status: car.status,
    pit: { state: "none" },
  }));
  const lastEvents = [...view.events].slice(-12).reverse();

  return (
    <div className="race-screen quali-screen">
      <header className="race-header">
        <div className="race-title">
          <span className="kicker">{type === "sprintQuali" ? "Classificação Sprint" : "Classificação"} · Etapa {career.roundIndex + 1}/3</span>
          <h1><CountryFlag country={circuit.pais} className="page-flag" /> {circuit.gp}</h1>
          <div className="race-meta">
            <span>{circuit.nome}</span>
            <span className={`status-pill ${view.rain > 0.12 ? "status-sc" : "status-green"}`}><WeatherIcon rain={view.rain} /> {view.condition}</span>
            <span>pista {view.trackTemp}°C · borracha {Math.round(view.trackEvolution * 100)}%</span>
          </div>
        </div>
        <div className="race-scoreboard">
          <div><span>Sessão</span><strong>{label}</strong></div>
          <div><span>Tempo</span><strong className={view.clock < 60 ? "text-bad" : ""}>{formatClock(view.clock)}</strong></div>
          <div><span>Em pista</span><strong>{onTrack.length}/22</strong></div>
          <div><span>Volta rápida</span><strong>{view.fastestLap ? `${fastest} ${formatLapTime(view.fastestLap.time)}` : "—"}</strong></div>
        </div>
        <div className="race-controls">
          <Button size="small" variant={paused ? "success" : "subtle"} onClick={() => onControl({ action: paused ? "resume" : "pause" })} disabled={!canControl || view.status === "finished"}>
            {paused ? "▶ Retomar" : "❚❚ Pausar"}
          </Button>
          <div className="speed-buttons">
            {QUALIFYING_SPEEDS.map((s) => (
              <button key={s} className={speed === s ? "active" : ""} disabled={!canControl || view.status === "finished"} onClick={() => onControl({ action: "speed", value: s })}>
                {s}x
              </button>
            ))}
          </div>
          {view.status === "between" && canControl && <Button size="small" variant="primary" onClick={() => onControl({ action: "next" })}>{next}</Button>}
          {view.status === "between" && !isHost && <span className="host-hint">Aguardando o host para {next.toLowerCase()}</span>}
          {canControl && view.status === "running" && <Button size="small" variant="ghost" onClick={() => onControl({ action: "skip" })}>Simular restante</Button>}
          <Button size="small" variant="ghost" onClick={onExit}>Sair</Button>
        </div>
      </header>

      {paused && <div className="paused-banner">Classificação pausada</div>}
      {view.status === "between" && <div className="track-banner banner-finished">{label} encerrada · prepare a próxima fase</div>}

      <div className="race-layout">
        <div className="race-left">
          <div className="map-panel">
            <TrackMap
              circuit={circuit}
              cars={mapCars}
              selectedDriverId={selected}
              onSelect={setSelected}
              highlightTeams={[meTeamId]}
            />
            <div className="map-overlay">
              <span>{onTrack.length} carros em pista</span>
              <span>{view.rain > 0.12 ? `${view.condition} · pista molhada` : "Pista seca"}</span>
              <span>Evolução da pista: {Math.round(view.trackEvolution * 100)}%</span>
              <span>{view.cutoff ? `Corte: ${view.cutoff} primeiros avançam` : "Q3: grid definitivo"}</span>
            </div>
          </div>
        </div>

        <div className="quali-side">
          <div className="timing-panel">
            <div className="panel-head tight">
              <h2>Torre de classificação</h2>
              <span className="muted small">{label} · {view.cars.filter((car) => car.status !== "eliminated").length} carros</span>
            </div>
            <div className="quali-timing-head">
              <span>P</span><span>Piloto</span><span>Melhor</span><span>Última</span><span>Pneu</span><span>Estado</span>
            </div>
            <div className="timing-body">
              {view.cars.map((car, index) => {
                const driver = DRIVER_BY_ID[car.driverId];
                const isMine = career.playerTeams.includes(car.teamId);
                const cutoff = view.cutoff;
                return (
                  <React.Fragment key={car.driverId}>
                    <button
                      className={`quali-timing-row ${isMine ? "mine" : ""} ${selected === car.driverId ? "selected" : ""} ${car.status === "eliminated" ? "eliminated" : ""} ${car.status === "flying" ? "flying" : ""}`}
                      onClick={() => setSelected(car.driverId)}
                    >
                      <span className="t-pos">{car.position}</span>
                      <span className="t-driver">
                        <i className="team-stripe" style={{ background: TEAM_BY_ID[car.teamId]?.corPrimaria }} />
                        <strong>{driver?.codigo ?? "—"}</strong>
                        <em>{driver?.sobrenome ?? car.driverId}</em>
                      </span>
                      <span className="t-time">{formatLapTime(car.bestLap)}{car.improved && <i className="q-improved">▲</i>}</span>
                      <span className="t-time muted">{formatLapTime(car.lastLap)}</span>
                      <span className="t-tyre"><TyreBadge compound={car.compound} wear={car.tyreWear} /></span>
                      <span className={`q-state state-${car.status}`}>{stateLabel(car.status)}</span>
                    </button>
                    {cutoff != null && index + 1 === cutoff && (
                      <div className="quali-cutoff"><span>linha de corte · {cutoff} avançam</span></div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          <div className="feed-panel">
            <div className="panel-head tight"><h2>Rádio e eventos</h2><span className="muted small">ao vivo</span></div>
            <div className="event-feed">
              {lastEvents.map((event) => (
                <div className={`event-row ev-${event.severity}`} key={event.id}>
                  <span className="event-time">{formatClock(event.clock)}</span>
                  <span className="event-lap">Q{event.segment}</span>
                  <span>{event.message}</span>
                </div>
              ))}
              {view.events.length === 0 && <p className="muted">Aguardando os primeiros carros...</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="race-bottom quali-bottom">
        <div className="strategy-panel quali-controls-panel">
          <div className="panel-head tight">
            <h2>Controle dos seus pilotos</h2>
            <span className="muted small">{isHost ? "Você controla os comandos da pista" : "Comandos privados da sua equipe"}</span>
          </div>
          <div className="quali-driver-grid">
            {myCars.map((car) => (
              <DriverQualiCard
                key={car.driverId}
                car={car}
                view={view}
                paused={paused}
                selected={selected === car.driverId}
                onSelect={() => setSelected(car.driverId)}
                onCommand={onCommand}
              />
            ))}
            {myCars.length === 0 && <p className="muted">Sua equipe não está nesta sessão.</p>}
          </div>
        </div>

        <div className="telemetry-panel quali-selected-panel">
          {selectedCar && (
            <>
              <div className="telemetry-head">
                <DriverPortrait driverId={selectedCar.driverId} size="md" className="telemetry-portrait" decorative />
                <div className="telemetry-driver">
                  <span className="kicker">Detalhe do piloto</span>
                  <h3>{DRIVER_BY_ID[selectedCar.driverId]?.nome ?? selectedCar.driverId}</h3>
                </div>
                <div className="telemetry-pos">
                  <strong>{selectedCar.position}º</strong>
                  <span>{stateLabel(selectedCar.status)} · {Math.round(selectedCar.tyreWear)}% pneu</span>
                </div>
              </div>
              <div className="quali-detail-grid">
                <Metric label="Setor 1" value={formatSector(selectedCar.bestSectors[0] ?? selectedCar.lastSectors[0])} />
                <Metric label="Setor 2" value={formatSector(selectedCar.bestSectors[1] ?? selectedCar.lastSectors[1])} />
                <Metric label="Setor 3" value={formatSector(selectedCar.bestSectors[2] ?? selectedCar.lastSectors[2])} />
                <Metric label="Tentativas" value={selectedCar.attempts} />
                <Metric label="Pneu" value={<TyreBadge compound={selectedCar.compound} wear={selectedCar.tyreWear} age={0} />} />
                <Metric label="Temperatura" value={`${Math.round(selectedCar.tyreTemp)}°C`} tone={selectedCar.tyreTemp > 115 ? "bad" : "good"} />
                <Metric label="Combustível" value={(selectedCar.status === "garage" ? selectedCar.nextFuelLoad : selectedCar.fuelLoad) >= 0.4 ? "2 voltas" : "1 volta"} />
                <Metric label="Pista" value={selectedCar.status === "garage" ? "Boxes" : stateLabel(selectedCar.status)} />
                <Metric label="Tráfego" value={`${selectedCar.trafficLoss.toFixed(1)}s`} />
                <Metric label="Jogos" value={`${selectedCar.setsRemaining.soft}S ${selectedCar.setsRemaining.medium}M ${selectedCar.setsRemaining.hard}H`} />
              </div>
              <div className="quali-history">
                <span className="muted small">Histórico recente</span>
                {selectedCar.recentLaps.length === 0 && <span className="muted small">Sem voltas lançadas neste segmento.</span>}
                {selectedCar.recentLaps.map((lap, index) => (
                  <span key={`${lap.id}-${index}`} className={lap.aborted ? "text-bad" : lap.valid ? "" : "text-warn"}>
                    {lap.aborted ? "ABORT" : lap.valid ? formatLapTime(lap.time) : "INV"} · {COMPOUNDS[lap.compound].sigla}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DriverQualiCard({
  car,
  view,
  paused,
  selected,
  onSelect,
  onCommand,
}: {
  car: QualifyingView["cars"][number];
  view: QualifyingView;
  paused: boolean;
  selected: boolean;
  onSelect: () => void;
  onCommand: (cmd: QualifyingCommand) => void;
}) {
  const driver = DRIVER_BY_ID[car.driverId];
  const garage = car.status === "garage";
  const active = car.status === "out" || car.status === "flying" || car.status === "in";
  const sessionOpen = !paused && view.status === "running";
  return (
    <div className={`quali-driver-card ${selected ? "selected" : ""} ${garage ? "" : "on-track"}`} onClick={onSelect}>
      <div className="quali-driver-head">
        <DriverPortrait driverId={car.driverId} size="sm" decorative />
        <TeamLogo teamId={car.teamId} size="xs" decorative />
        <div>
          <strong>{driver?.nome ?? car.driverId}</strong>
          <span className="muted small">{stateLabel(car.status)} · {car.position}º · {formatLapTime(car.bestLap)}</span>
        </div>
        <TyreBadge compound={car.compound} wear={car.tyreWear} age={0} />
      </div>
      <div className="quali-plan-row">
        <span>Composto</span>
        <div className="compound-picker compact">
          {view.allowedCompounds.map((compound) => (
            <button key={compound} className={`compound-chip ${car.nextCompound === compound ? "active" : ""}`} disabled={!sessionOpen || !garage || (car.setsRemaining[compound] ?? 0) <= 0} onClick={() => onCommand({ type: "plan", driverId: car.driverId, compound })}>
              <TyreBadge compound={compound} />
            </button>
          ))}
        </div>
      </div>
      <div className="quali-plan-row">
        <span>Combustível</span>
        <div className="segmented">
          <button className={car.nextFuelLoad < 0.4 ? "active" : ""} disabled={!sessionOpen || !garage} onClick={() => onCommand({ type: "plan", driverId: car.driverId, fuelLoad: 0.25 })}>1 volta</button>
          <button className={car.nextFuelLoad >= 0.4 ? "active" : ""} disabled={!sessionOpen || !garage} onClick={() => onCommand({ type: "plan", driverId: car.driverId, fuelLoad: 0.45 })}>2 voltas</button>
        </div>
      </div>
      <div className="quali-plan-row">
        <span>Preparação</span>
        <div className="segmented">
          {(["manage", "normal", "push"] as TyreMode[]).map((mode) => (
            <button key={mode} className={car.nextTyrePrep === mode ? "active" : ""} disabled={!sessionOpen || !garage} onClick={() => onCommand({ type: "plan", driverId: car.driverId, tyrePrep: mode })}>
              {mode === "manage" ? "Gestão" : mode === "normal" ? "Normal" : "Push"}
            </button>
          ))}
        </div>
      </div>
      <div className="quali-driver-actions">
        <Button size="small" variant="primary" disabled={!sessionOpen || !car.canSend} onClick={() => onCommand({ type: "sendOut", driverId: car.driverId })}>
          Enviar à pista
        </Button>
        <Button size="small" variant="danger" disabled={!sessionOpen || !active} onClick={() => onCommand({ type: "abort", driverId: car.driverId })}>
          Abortar
        </Button>
        <span className="muted small">{car.status === "eliminated" ? "Eliminado" : garage ? `necessário ~${formatClock(car.requiredTime)}` : `${car.flyingRemaining} volta(s)`}</span>
      </div>
      <div className="quali-history">
        {car.recentLaps.slice(-2).map((lap, index) => (
          <span key={`${lap.id}-${index}`} className={lap.aborted ? "text-bad" : lap.valid ? "" : "text-warn"}>
            {lap.aborted ? "ABORT" : lap.valid ? formatLapTime(lap.time) : "INV"} · {COMPOUNDS[lap.compound].sigla}
          </span>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={tone ? `text-${tone}` : ""}>{value}</strong>
    </div>
  );
}

function stateLabel(status: string): string {
  return {
    garage: "BOX",
    out: "OUT",
    flying: "FLY",
    in: "IN",
    eliminated: "ELIM",
    finished: "FIM",
  }[status] ?? status;
}

function formatSector(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(3);
}
