import React, { useEffect, useMemo, useRef, useState } from "react";
import { CIRCUITS_2026, DRIVER_BY_ID, TEAM_BY_ID } from "../data/season2026";
import type { Career, Compound, EnergyMode, PaceMode, RaceCommand, RaceState, RaceView, TyreMode } from "../engine/types";
import { applyRaceCommand, buildRaceView, advanceRace } from "../engine/race";
import { sessionResultFromRace } from "../engine/career";
import { formatClock, formatGap, formatLapTime } from "../engine/track";
import { COMPOUNDS } from "../engine/tyres";
import { Badge, Button, TyreBadge, delta, money, ordinal } from "./Common";
import { DriverPortrait } from "./Media";
import { CountryFlag, WeatherIcon } from "./Visuals";
import { TrackMap } from "./TrackMap";
import {
  autoControlAction,
  canEmitAlert,
  eventAlertCategory,
  isAlertExpired,
  makeRaceAlert,
  mergeRaceAlerts,
  type AlertMode,
  type RaceAlert,
} from "./raceAlerts";

export function SoloRaceScreen({
  career,
  kind,
  initialState,
  onFinish,
  onCheckpoint,
  onExit,
}: {
  career: Career;
  kind: "race" | "sprint";
  initialState?: RaceState;
  onFinish: (result: ReturnType<typeof sessionResultFromRace>) => void;
  onCheckpoint: (state: RaceState) => void;
  onExit: () => void;
}) {
  const raceRef = useRef<RaceState | null>(initialState ?? null);
  if (!raceRef.current) {
    // criado pelo App antes da montagem; fallback defensivo
    raceRef.current = null;
  }
  const [view, setView] = useState<RaceView | null>(initialState ? buildRaceView(initialState) : null);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [finished, setFinished] = useState(false);
  const pausedRef = useRef(paused);
  const speedRef = useRef(speed);
  const finishedRef = useRef(false);
  const checkpointRef = useRef(onCheckpoint);
  checkpointRef.current = onCheckpoint;

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    const race = raceRef.current;
    if (!race) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastRender = 0;
    let lastSave = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.4, (now - last) / 1000);
      last = now;
      if (!pausedRef.current && race.status === "running") {
        acc += dt * speedRef.current;
        let guard = 0;
        while (acc >= 0.25 && race.status === "running" && guard < 900) {
          advanceRace(race);
          acc -= 0.25;
          guard++;
        }
      }
      if (now - lastRender > 95 || race.status !== "running") {
        setView(buildRaceView(race));
        lastRender = now;
      }
      if (now - lastSave > 5000) {
        checkpointRef.current(race);
        lastSave = now;
      }
      if (race.status === "finished" && !finishedRef.current) {
        finishedRef.current = true;
        setFinished(true);
        setView(buildRaceView(race));
        checkpointRef.current(race);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!raceRef.current || !view) {
    return <div className="race-screen"><p>Corrida indisponível.</p><Button onClick={onExit}>Voltar</Button></div>;
  }
  const circuit = CIRCUITS_2026.find((c) => c.id === raceRef.current!.circuitId)!;

  const command = (cmd: RaceCommand) => {
    if (!raceRef.current) return;
    const res = applyRaceCommand(raceRef.current, cmd);
    if (res.ok) setView(buildRaceView(raceRef.current));
  };

  return (
    <RaceScreen
      career={career}
      circuit={circuit}
      view={view}
      kind={kind}
      paused={paused}
      speed={speed}
      isHost
      canControl
      finished={finished}
      soloMode
      onPause={() => setPaused((p) => !p)}
      onSetPaused={(value) => setPaused(value)}
      onSpeed={(s) => setSpeed(s)}
      onCommand={command}
      onFinish={() => onFinish(sessionResultFromRace(career, raceRef.current!, kind))}
      onExit={onExit}
      onSimulate={() => {
        const race = raceRef.current!;
        let guard = 0;
        while (race.status === "running" && guard < 120000) {
          advanceRace(race);
          guard++;
        }
        setView(buildRaceView(race));
        finishedRef.current = true;
        setFinished(true);
        checkpointRef.current(race);
      }}
    />
  );
}

export function MultiRaceScreen({
  career,
  view,
  kind,
  paused,
  speed,
  isHost,
  onControl,
  onCommand,
  onExit,
}: {
  career: Career;
  view: RaceView;
  kind: "race" | "sprint";
  paused: boolean;
  speed: number;
  isHost: boolean;
  onControl: (a: { action: "pause" | "resume" | "speed"; value?: number }) => void;
  onCommand: (cmd: RaceCommand) => void;
  onExit: () => void;
}) {
  const circuit = CIRCUITS_2026.find((c) => c.id === view.circuitId) ?? CIRCUITS_2026[0];
  return (
    <RaceScreen
      career={career}
      circuit={circuit}
      view={view}
      kind={kind}
      paused={paused}
      speed={speed}
      isHost={isHost}
      canControl={isHost}
      finished={view.status === "finished"}
      soloMode={false}
      onPause={() => onControl({ action: paused ? "resume" : "pause" })}
      onSpeed={(s) => onControl({ action: "speed", value: s })}
      onCommand={onCommand}
      onExit={onExit}
    />
  );
}

function useRaceAlerts(view: RaceView): { alerts: RaceAlert[]; dismiss: (id: string) => void } {
  const [alerts, setAlerts] = useState<RaceAlert[]>([]);
  const lastEventId = useRef<number>(-1);
  const initialized = useRef(false);
  const lastAlertAt = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const maxId = view.events.length > 0 ? Math.max(...view.events.map((event) => event.id)) : 0;
    if (!initialized.current) {
      initialized.current = true;
      lastEventId.current = maxId;
      return;
    }
    const newEvents = view.events
      .filter((event) => event.id > lastEventId.current)
      .sort((a, b) => a.id - b.id);
    lastEventId.current = maxId;
    if (newEvents.length === 0) return;

    const now = Date.now();
    for (const event of newEvents) {
      const car = event.driverId ? view.cars.find((entry) => entry.driverId === event.driverId) : null;
      const relevant = car ? view.playerTeams.includes(car.teamId) : false;
      const category = eventAlertCategory(event, relevant);
      if (!category) continue;
      const recommendationKey = car?.strategy.recommendation?.key ?? null;
      const alert = makeRaceAlert(event, category, recommendationKey, now);
      if (!canEmitAlert(lastAlertAt.current.get(alert.key), now, category)) continue;
      lastAlertAt.current.set(alert.key, now);
      setAlerts((current) => mergeRaceAlerts(current, alert));
    }
  }, [view]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setAlerts((current) => current.filter((alert) => !isAlertExpired(alert, now)));
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

  const dismiss = (id: string) => setAlerts((current) => current.filter((alert) => alert.id !== id));
  return { alerts, dismiss };
}

function RaceAlertStack({ alerts, onDismiss }: { alerts: RaceAlert[]; onDismiss: (id: string) => void }) {
  if (alerts.length === 0) return null;
  return (
    <div className="race-alert-stack" aria-live="polite">
      {alerts.map((alert) => (
        <div key={alert.id} className={`race-alert race-alert-${alert.category}`} role={alert.category === "critical" ? "alert" : "status"}>
          <div className="race-alert-copy">
            <span>{alert.title} · V{alert.lap}</span>
            <strong>{alert.message}</strong>
          </div>
          <button type="button" className="race-alert-dismiss" aria-label="Dispensar notificação" onClick={() => onDismiss(alert.id)}>×</button>
        </div>
      ))}
    </div>
  );
}

function RaceScreen({
  career,
  circuit,
  view,
  kind,
  paused,
  speed,
  isHost,
  canControl,
  finished,
  soloMode,
  onPause,
  onSetPaused,
  onSpeed,
  onCommand,
  onFinish,
  onExit,
  onSimulate,
}: {
  career: Career;
  circuit: (typeof CIRCUITS_2026)[number];
  view: RaceView;
  kind: "race" | "sprint";
  paused: boolean;
  speed: number;
  isHost: boolean;
  canControl: boolean;
  finished: boolean;
  soloMode: boolean;
  onPause: () => void;
  onSetPaused?: (paused: boolean) => void;
  onSpeed: (s: number) => void;
  onCommand: (cmd: RaceCommand) => void;
  onFinish?: () => void;
  onExit: () => void;
  onSimulate?: () => void;
}) {
  const myDrivers = useMemo(() => view.cars.filter((c) => view.playerTeams.includes(c.teamId)), [view]);
  const [selected, setSelected] = useState<string | null>(myDrivers[0]?.driverId ?? view.cars[0]?.driverId ?? null);
  const [showTelemetry, setShowTelemetry] = useState(false);
  const [alertMode, setAlertMode] = useState<AlertMode>(() => {
    try {
      const stored = localStorage.getItem("cm-alert-mode");
      return stored === "notify" || stored === "slow" || stored === "pause" ? stored : "slow";
    } catch {
      return "slow";
    }
  });
  const { alerts, dismiss } = useRaceAlerts(view);
  const lastCriticalAlert = useRef<string | null>(null);

  useEffect(() => {
    if (!soloMode) return;
    const critical = alerts.find((alert) => alert.category === "critical");
    if (!critical || critical.id === lastCriticalAlert.current) return;
    lastCriticalAlert.current = critical.id;
    const action = autoControlAction(soloMode, alertMode, critical.category);
    if (action === "slow" && speed !== 1) onSpeed(1);
    else if (action === "pause" && !paused) onSetPaused?.(true);
  }, [alerts, alertMode, paused, soloMode, speed, onSetPaused, onSpeed]);

  const changeAlertMode = (mode: AlertMode) => {
    setAlertMode(mode);
    try {
      localStorage.setItem("cm-alert-mode", mode);
    } catch {
      // Armazenamento indisponível: mantém a preferência apenas na sessão.
    }
  };
  const selectedCar = view.cars.find((c) => c.driverId === selected) ?? myDrivers[0] ?? view.cars[0];
  const selectedDriver = selectedCar ? DRIVER_BY_ID[selectedCar.driverId] : undefined;
  const selectedTeam = selectedCar ? TEAM_BY_ID[selectedCar.teamId] : undefined;
  const leader = view.cars[0];
  const trackStatus = view.trackStatus;
  const lastEvents = [...view.events].slice(-40).reverse();
  const nextWeather = view.weather.forecast.find((phase) => phase.fromLap > view.lap);

  return (
    <div className={`race-screen ${kind === "sprint" ? "sprint" : ""}`}>
      <header className="race-header">
        <div className="race-title">
          <span className="kicker">{kind === "sprint" ? "Sprint" : "Corrida"} · Etapa {career.roundIndex + 1}/3</span>
          <h1><CountryFlag country={circuit.pais} className="page-flag" /> {circuit.gp}</h1>
          <div className="race-meta">
            <span>{circuit.nome}</span>
            <span className={`status-pill status-${trackStatus}`}>{statusText(trackStatus)}</span>
            <span><WeatherIcon rain={view.weather.rain} /> {describeWeather(view.weather.rain)} · {Math.round(view.weather.rain * 100)}% chuva · pista {view.weather.trackTemp}°C</span>
            {nextWeather && (
              <span>Próxima mudança: V{nextWeather.fromLap} · {describeWeather(nextWeather.rain)}</span>
            )}
          </div>
        </div>
        <div className="race-scoreboard">
          <div><span>Volta</span><strong>{Math.min(view.lap, view.totalLaps)}/{view.totalLaps}</strong></div>
          <div><span>Líder</span><strong>{leader ? DRIVER_BY_ID[leader.driverId]?.codigo : "—"}</strong></div>
          <div><span>Tempo</span><strong>{formatClock(view.elapsed)}</strong></div>
          <div><span>Volta rápida</span><strong>{view.fastestLap ? `${DRIVER_BY_ID[view.fastestLap.driverId]?.codigo} ${formatLapTime(view.fastestLap.time)}` : "—"}</strong></div>
        </div>
        <div className="race-controls">
          <Button size="small" variant={paused ? "success" : "subtle"} onClick={onPause} disabled={!canControl || finished}>
            {paused ? "▶ Retomar" : "❚❚ Pausar"}
          </Button>
          <div className="speed-buttons">
            {[1, 2, 5, 10, 20, 50].map((s) => (
              <button key={s} className={speed === s ? "active" : ""} disabled={!canControl || finished} onClick={() => onSpeed(s)}>
                {s}x
              </button>
            ))}
          </div>
          {soloMode && (
            <label className="alert-mode-control">
              <span>Alertas</span>
              <select value={alertMode} onChange={(event) => changeAlertMode(event.target.value as AlertMode)}>
                <option value="notify">Notificar</option>
                <option value="slow">1x em crítico</option>
                <option value="pause">Pausar crítico</option>
              </select>
            </label>
          )}
          {!canControl && <span className="host-hint">Host controla pausa/velocidade</span>}
          <Button className="race-bottom-toggle" size="small" variant={showTelemetry ? "success" : "ghost"} onClick={() => setShowTelemetry((value) => !value)}>
            {showTelemetry ? "Estratégia" : "Telemetria"}
          </Button>
          {onSimulate && !finished && (
            <Button size="small" variant="subtle" onClick={onSimulate}>Simular fim</Button>
          )}
          <Button size="small" variant="ghost" onClick={onExit}>Sair</Button>
        </div>
      </header>

      {trackStatus !== "green" && !finished && (
        <div className={`track-banner banner-${trackStatus}`}>
          {trackStatus === "sc"
            ? `SAFETY CAR — ritmo controlado e ultrapassagens proibidas${view.trackStatusUntilLap ? ` · até a volta ${view.trackStatusUntilLap}` : ""}`
            : trackStatus === "vsc"
              ? `VIRTUAL SAFETY CAR — ritmo reduzido${view.trackStatusUntilLap ? ` · até a volta ${view.trackStatusUntilLap}` : ""}`
              : trackStatus === "red"
                ? `BANDEIRA VERMELHA — corrida suspensa${view.redFlagReason ? ` · ${view.redFlagReason}` : ""}`
                : `AMARELA — setores ${view.yellowSectors.map((zone) => `S${zone.sector}`).join(", ")}`}
        </div>
      )}
      {trackStatus === "green" && !finished && view.yellowSectors.length > 0 && (
        <div className="track-banner banner-yellow">
          AMARELA LOCAL — {view.yellowSectors.map((zone) => `S${zone.sector}: ${zone.cause}`).join(" · ")}
        </div>
      )}
      {trackStatus === "green" && !finished && view.restartUntil > view.elapsed && (
        <div className="track-banner banner-restart">RELARGADA — ultrapassagens proibidas</div>
      )}
      {finished && (
        <div className="track-banner banner-finished">
          🏁 Corrida encerrada — {view.cars[0] ? DRIVER_BY_ID[view.cars[0].driverId]?.nome : ""} vence
          {onFinish && <Button variant="primary" size="small" onClick={onFinish}>Ver resultados</Button>}
        </div>
      )}
      {paused && !finished && <div className="paused-banner">Simulação pausada</div>}

      <div className="race-layout">
        <div className="race-left">
          <div className="map-panel">
            <TrackMap
              circuit={circuit}
              cars={view.cars}
              selectedDriverId={selected}
              onSelect={setSelected}
              highlightTeams={view.playerTeams}
            />
            <RaceAlertStack alerts={alerts} onDismiss={dismiss} />
            <div className="map-overlay">
              <span>Líder: {leader ? `${DRIVER_BY_ID[leader.driverId]?.codigo} (${leader.lap}/${view.totalLaps})` : "—"}</span>
              <span>{view.status === "finished" ? "Classificação final" : `${view.cars.filter((c) => c.status === "running").length} carros em pista`}</span>
              <span>{view.weather.condition}</span>
            </div>
          </div>
        </div>

        <div className="race-right">
          <div className="timing-panel">
            <div className="panel-head tight">
              <h2>Classificação</h2>
              <span className="muted small">{view.cars.length} carros</span>
            </div>
            <div className="timing-head">
              <span>P</span><span>Piloto</span><span>Int.</span><span>Pneu</span><span>Pit</span>
            </div>
            <div className="timing-body">
              {view.cars.map((car) => {
                const d = DRIVER_BY_ID[car.driverId];
                const inside = view.playerTeams.includes(car.teamId);
                const retired = car.status === "retired";
                const finished = car.status === "finished";
                return (
                  <button
                    key={car.driverId}
                    className={`timing-row ${inside ? "mine" : ""} ${selected === car.driverId ? "selected" : ""} ${retired ? "retired" : ""}`}
                    onClick={() => setSelected(car.driverId)}
                  >
                    <span className="t-pos">{car.position}</span>
                    <span className="t-driver">
                      <i className="team-stripe" style={{ background: TEAM_BY_ID[car.teamId]?.corPrimaria }} />
                      <strong>{d?.codigo ?? "—"}</strong>
                      <em>{d?.sobrenome ?? car.driverId}</em>
                    </span>
                    <span className="t-gap">{retired ? "DNF" : finished ? "🏁" : car.position === 1 ? "LÍDER" : formatGap(car.gapAhead)}</span>
                    <span className="t-tyre"><TyreBadge compound={car.tyre.compound} wear={car.tyre.wear} /></span>
                    <span className="t-pit">{car.stops}{car.pit.state !== "none" ? "⏱" : ""}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="feed-panel">
            <div className="panel-head tight"><h2>Rádio e eventos</h2><span className="muted small">ao vivo</span></div>
            <div className="event-feed">
              {lastEvents.map((e) => (
                <div className={`event-row ev-${e.severity}`} key={e.id}>
                  <span className="event-time">{formatClock(e.time)}</span>
                  <span className="event-lap">V{e.lap}</span>
                  <span>{e.message}</span>
                </div>
              ))}
              {view.events.length === 0 && <p className="muted">Aguardando a largada...</p>}
            </div>
          </div>
        </div>
      </div>

      <div className={`race-bottom ${showTelemetry ? "show-telemetry" : ""}`}>
        {selectedCar && (
          <div className="telemetry-panel">
            <div className="telemetry-head">
              <DriverPortrait driverId={selectedCar.driverId} size="md" className="telemetry-portrait" decorative />
              <div className="telemetry-driver">
                <span className="kicker">Telemetria</span>
                <h3>{selectedDriver?.nome ?? selectedCar.driverId}</h3>
              </div>
              <div className="telemetry-pos">
                <strong>{selectedCar.position}º</strong>
                <span>{selectedCar.status === "retired" ? selectedCar.retiredReason : `${selectedCar.lap} voltas`}</span>
              </div>
              <div className="telemetry-buttons">
                {myDrivers.map((c) => (
                  <button key={c.driverId} className={selected === c.driverId ? "active" : ""} onClick={() => setSelected(c.driverId)}>
                    {DRIVER_BY_ID[c.driverId]?.codigo}
                  </button>
                ))}
              </div>
            </div>
            <div className="telemetry-grid">
              <Metric label="Velocidade" value={`${Math.round(selectedCar.speed * 3.6)} km/h`} />
              <Metric label="Pneu" value={<TyreBadge compound={selectedCar.tyre.compound} wear={selectedCar.tyre.wear} age={selectedCar.tyre.ageLaps} />} />
              <Metric label="Temp. pneu" value={`${Math.round(selectedCar.tyre.temp)}°C`} tone={selectedCar.tyre.temp > 115 ? "bad" : selectedCar.tyre.temp > 105 ? "warn" : "good"} />
              <Metric label="Energia" value={`${Math.round(selectedCar.energy)}%`} tone={selectedCar.energy < 15 ? "bad" : "good"} />
              <Metric label="Combustível" value={`${selectedCar.fuelKg.toFixed(1)} kg`} />
              <Metric label="Dano" value={`${Math.round(selectedCar.damage * 100)}%`} tone={selectedCar.damage > 0.3 ? "bad" : "good"} />
              {selectedCar.blueFlag && <Metric label="Bandeira" value="AZUL · facilitar passagem" tone="warn" />}
              <Metric label="Última volta" value={formatLapTime(selectedCar.lastLap)} />
              <Metric label="Melhor volta" value={formatLapTime(selectedCar.bestLap)} />
              <Metric
                label="Setores"
                value={selectedCar.sectors.map((sector) => (sector == null ? "—" : formatLapTime(sector))).join(" · ")}
              />
              {selectedCar.penalty > 0 && (
                <Metric
                  label="Penalidade"
                  value={`+${selectedCar.penalty}s${selectedCar.penaltyNotes.length ? ` · ${selectedCar.penaltyNotes[selectedCar.penaltyNotes.length - 1]}` : ""}`}
                  tone="bad"
                />
              )}
              {selectedCar.trackLimitWarnings > 0 && (
                <Metric
                  label="Advertências"
                  value={`${selectedCar.trackLimitWarnings} · limites de pista`}
                  tone="warn"
                />
              )}
              <Metric label="Intervalo" value={selectedCar.position === 1 ? "LÍDER" : formatGap(selectedCar.gapAhead)} />
              <Metric label="Pit stops" value={selectedCar.stops} />
              <Metric label="Ritmo" value={paceLabel(selectedCar.pace)} />
              <Metric label="Energia modo" value={energyLabel(selectedCar.energyMode)} />
            </div>
            <div className="energy-bar-row">
              <span>Bateria</span>
              <div className="energy-bar"><i style={{ width: `${selectedCar.energy}%` }} /></div>
              <span>Pneu {Math.round(selectedCar.tyre.wear)}%</span>
              <div className="wear-bar"><i style={{ width: `${selectedCar.tyre.wear}%` }} /></div>
            </div>
          </div>
        )}

        <div className="strategy-panel">
          <div className="panel-head tight">
            <h2>Estratégia da sua equipe</h2>
            <span className="muted small">Comandos são privados e aplicados pelo motor</span>
          </div>
          <div className="strategy-grid">
            {myDrivers.map((car) => (
              <StrategyCard key={car.driverId} car={car} view={view} onCommand={onCommand} selected={selected === car.driverId} onSelect={() => setSelected(car.driverId)} />
            ))}
            {myDrivers.length === 0 && <p className="muted">Você é espectador nesta corrida.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function StrategyCard({ car, view, onCommand, selected, onSelect }: { car: RaceView["cars"][number]; view: RaceView; onCommand: (cmd: RaceCommand) => void; selected: boolean; onSelect: () => void }) {
  const d = DRIVER_BY_ID[car.driverId];
  const [pitLap, setPitLap] = useState<string>("");
  const disabled = car.status !== "running";
  return (
    <div className={`strategy-card ${selected ? "selected" : ""} ${disabled ? "disabled" : ""}`} onClick={onSelect}>
      <div className="strategy-head">
        <span className="strategy-pos">{car.position}º</span>
        <DriverPortrait driverId={car.driverId} size="sm" decorative />
        <div>
          <strong>{d?.nome ?? car.driverId}</strong>
          <span className="muted small">{car.pit.state !== "none" ? `Nos boxes (${car.pit.state})` : car.pit.requested ? "Pit solicitado" : car.pit.plannedLap ? `Pit planejado: volta ${car.pit.plannedLap}` : "Sem pit planejado"}</span>
        </div>
        <TyreBadge compound={car.tyre.compound} wear={car.tyre.wear} age={car.tyre.ageLaps} />
      </div>
      <div className="strategy-plan-mini">
        <div className="strategy-plan-stints">
          {car.strategy.plan?.stints.map((stint, index) => (
            <span key={`${stint.compound}-${index}`} className="strategy-stint-chip" style={{ borderColor: COMPOUNDS[stint.compound].cor }}>
              {COMPOUNDS[stint.compound].sigla}{stint.laps}
            </span>
          ))}
          {!car.strategy.plan && <span className="muted small">Plano privado</span>}
        </div>
        <span className="muted small">
          {car.strategy.stopsPlanned} parada(s) · janela {car.strategy.windowStart != null ? `V${car.strategy.windowStart}–V${car.strategy.windowEnd}` : "livre"} · pit ~{car.strategy.pitLoss.toFixed(1)}s
        </span>
      </div>
      <div className="strategy-projection">
        <span>Vida restante: <strong>{car.strategy.projection ? `~${Math.max(0, car.strategy.projection.remainingLaps)} voltas` : "—"}</strong></span>
        <span>Desgaste no fim: <strong>{car.strategy.projection ? `${Math.round(car.strategy.projection.endWear)}%` : "—"}</strong></span>
        <span>Jogos: <strong>{car.strategy.inventory ? `${car.strategy.inventory.soft}S ${car.strategy.inventory.medium}M ${car.strategy.inventory.hard}H` : "—"}</strong></span>
        <span>Undercut 5v: <strong className={car.strategy.undercutProjection >= 0 ? "text-good" : "text-bad"}>{car.strategy.undercutProjection >= 0 ? "+" : ""}{car.strategy.undercutProjection.toFixed(1)}s</strong></span>
        <span>Overcut 3v: <strong className={car.strategy.overcutProjection >= 0 ? "text-good" : "text-bad"}>{car.strategy.overcutProjection >= 0 ? "+" : ""}{car.strategy.overcutProjection.toFixed(1)}s</strong></span>
      </div>
      {car.strategy.recommendation && (
        <div className={`engineer-advice advice-${car.strategy.recommendation.severity}`}>
          <span>Engenheiro</span>
          <strong>{car.strategy.recommendation.message}</strong>
        </div>
      )}
      <div className="strategy-row">
        <span>Ritmo</span>
        <div className="segmented">
          {(["conserve", "normal", "attack"] as PaceMode[]).map((p) => (
            <button key={p} className={car.pace === p ? "active" : ""} disabled={disabled} onClick={() => onCommand({ type: "pace", driverId: car.driverId, value: p })}>
              {paceLabel(p)}
            </button>
          ))}
        </div>
      </div>
      <div className="strategy-row">
        <span>Energia</span>
        <div className="segmented">
          {(["save", "normal", "push"] as EnergyMode[]).map((p) => (
            <button key={p} className={car.energyMode === p ? "active" : ""} disabled={disabled} onClick={() => onCommand({ type: "energy", driverId: car.driverId, value: p })}>
              {energyLabel(p)}
            </button>
          ))}
        </div>
      </div>
      <div className="strategy-row">
        <span>Pneu</span>
        <div className="segmented">
          {(["manage", "normal", "push"] as TyreMode[]).map((p) => (
            <button key={p} className={car.tyreMode === p ? "active" : ""} disabled={disabled} onClick={() => onCommand({ type: "tyreMode", driverId: car.driverId, value: p })}>
              {p === "manage" ? "Gestão" : p === "normal" ? "Normal" : "Push"}
            </button>
          ))}
        </div>
      </div>
      <div className="strategy-row">
        <span>Próximo pneu</span>
        <select value={car.nextCompound} disabled={disabled} onChange={(e) => onCommand({ type: "nextCompound", driverId: car.driverId, value: e.target.value as Compound })}>
          {(["soft", "medium", "hard", "inter", "wet"] as Compound[]).map((c) => <option key={c} value={c}>{COMPOUNDS[c].nome}</option>)}
        </select>
      </div>
      <div className="strategy-pit">
        <Button size="small" variant="primary" disabled={disabled || car.pit.state !== "none"} onClick={() => onCommand({ type: "pitNow", driverId: car.driverId, revision: car.strategy.version })}>
          Box agora
        </Button>
        <input type="number" placeholder={`volta (${Math.min(view.lap + 1, view.totalLaps)})`} value={pitLap} min={view.lap + 1} max={view.totalLaps} onChange={(e) => setPitLap(e.target.value)} disabled={disabled} />
        <Button size="small" variant="subtle" disabled={disabled || !pitLap} onClick={() => { onCommand({ type: "schedulePit", driverId: car.driverId, lap: Number(pitLap), revision: car.strategy.version }); setPitLap(""); }}>
          Agendar
        </Button>
        <Button size="small" variant="ghost" disabled={disabled || (!car.pit.requested && !car.pit.plannedLap)} onClick={() => onCommand({ type: "cancelPit", driverId: car.driverId, revision: car.strategy.version })}>
          Cancelar
        </Button>
      </div>
      <div className="strategy-foot">
        <span>{Math.round(car.fuelKg)} kg</span>
        <span>{Math.round(car.energy)}% energia</span>
        <span>Pneu {Math.round(car.tyre.wear)}% · {Math.round(car.tyre.temp)}°C</span>
        {car.penalty > 0 && <span className="text-bad">+{car.penalty}s</span>}
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

function statusText(status: string): string {
  return {
    green: "Pista verde",
    yellow: "Amarela local",
    sc: "Safety Car",
    vsc: "VSC",
    red: "Bandeira vermelha",
    chequered: "Bandeirada",
  }[status] ?? status;
}

function paceLabel(p: PaceMode): string {
  return { conserve: "Conservar", normal: "Normal", attack: "Atacar" }[p];
}

function energyLabel(e: EnergyMode): string {
  return { save: "Poupar", normal: "Normal", push: "Empurrar" }[e];
}

function describeWeather(rain: number): string {
  if (rain <= 0.03) return "Seco";
  if (rain <= 0.18) return "Garoa";
  if (rain <= 0.45) return "Chuva leve";
  if (rain <= 0.72) return "Chuva";
  return "Chuva forte";
}
