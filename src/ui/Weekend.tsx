import React, { useMemo, useState } from "react";
import { CIRCUITS_2026, DRIVER_BY_ID, TEAM_BY_ID } from "../data/season2026";
import type { Career, SessionResult } from "../engine/types";
import type { CareerAction as Action } from "../net/protocol";
import {
  constructorStandings,
  currentRound,
  driverStandings,
  getDriversOfTeam,
  practiceFor,
  teamState,
} from "../engine/career";
import { createWeather, describeWeather } from "../engine/race";
import { allocateTyreInventory, estimatePitLoss } from "../engine/raceStrategy";
import { formatLapTime } from "../engine/track";
import { Badge, Bar, Button, DriverLabel, Empty, Panel, StatRow, TeamName, TyreBadge, money, ordinal } from "./Common";
import { CircuitPhoto, DriverPortrait, TeamLogo } from "./Media";
import { CountryFlag, SprintIcon, WeatherIcon } from "./Visuals";
import { AdminTrackMap } from "./AdminTrackMap";
import { Championship } from "./Dashboard";
import { RaceStrategyPlanner } from "./RaceStrategyPlanner";

export function PrepScreen({
  career,
  meTeamId,
  onAction,
  isHost,
}: {
  career: Career;
  meTeamId: string;
  onAction: (a: Action) => void;
  isHost: boolean;
}) {
  const circuit = CIRCUITS_2026[career.roundIndex];
  const round = currentRound(career);
  const team = teamState(career, meTeamId)!;
  const drivers = getDriversOfTeam(career, meTeamId);
  const weather = useMemo(() => createWeather(circuit, `${career.seed}:r${career.roundIndex + 1}`), [career.seed, career.roundIndex, circuit.id]);
  const practice = practiceFor(career);
  const window = 0.28 - (practice.confidence / 100) * 0.22;
  const tyreInventory = round.tyreInventory?.[drivers[0]?.driverId ?? ""] ?? allocateTyreInventory(circuit.sprint);
  const pitLoss = estimatePitLoss(circuit, team.pitCrew ?? 70);
  const sessions = circuit.sprint
    ? ["Treino livre", "Classificação Sprint", "Sprint", "Classificação", "Corrida"]
    : ["Treino livre", "Classificação", "Corrida"];

  return (
    <div className="weekend prep-v131">
      <div className="weekend-head prep-page-head">
        <div>
          <span className="kicker">Preparação · Etapa {career.roundIndex + 1}/3</span>
          <div className="prep-title-row">
            <h1><CountryFlag country={circuit.pais} className="page-flag" /> {circuit.gp}</h1>
            <Badge tone={circuit.sprint ? "info" : "neutral"}>{circuit.sprint && <SprintIcon />} {circuit.sprint ? "Fim de semana Sprint" : "Fim de semana tradicional"}</Badge>
          </div>
          <p className="muted">{circuit.nome} · {circuit.cidade}, {circuit.pais} · {circuit.data}</p>
        </div>
        <div className="weekend-actions">
          <Button variant="primary" onClick={() => onAction({ type: "enterPractice" })} disabled={!isHost}>
            Ir para o treino livre <span aria-hidden="true">→</span>
          </Button>
        </div>
      </div>

      <div className="prep-hero-layout">
        <section className="prep-circuit-card">
          <CircuitPhoto circuitId={circuit.id} className="prep-circuit-photo" showCredit />
          <div className="prep-circuit-shade" />
          <div className="prep-circuit-copy">
            <span className="kicker">Circuito</span>
            <h2>{circuit.gp}</h2>
            <p>{circuit.descricao}</p>
            <div className="prep-circuit-facts">
              <div><span>Voltas</span><strong>{circuit.voltas}</strong></div>
              <div><span>Extensão</span><strong>{(circuit.comprimentoM / 1000).toFixed(3)} km</strong></div>
              <div><span>Curvas</span><strong>{circuit.curvas}</strong></div>
              <div><span>Downforce ideal</span><strong>{practice.confidence > 35 ? `${Math.round(Math.max(0, practice.idealDownforce - window) * 100)}–${Math.round(Math.min(1, practice.idealDownforce + window) * 100)}%` : "a revelar"}</strong></div>
              <div><span>Pit loss estimado</span><strong>~{pitLoss.toFixed(1)}s</strong></div>
            </div>
          </div>
          <div className="prep-circuit-map"><AdminTrackMap circuit={circuit} className="prep-admin-map" /></div>
        </section>

        <aside className="prep-side-stack">
          <Panel title="Clima esperado" subtitle="Previsão do fim de semana">
            <div className="prep-weather-list">
              {weather.slice(0, 4).map((phase, index) => (
                <div className="prep-weather-row" key={`${phase.fromLap}-${index}`}>
                  <span>{phase.fromLap === 0 ? "Largada" : `Volta ${phase.fromLap}`}</span>
                  <strong><WeatherIcon rain={phase.rain} /> {describeWeather(phase.rain)}</strong>
                  <span className="muted">{Math.round(phase.rain * 100)}% chuva · {phase.trackTemp}°C pista</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Formato do fim de semana" subtitle="Sequência real de sessões">
            <div className="prep-session-list">
              {sessions.map((session, index) => (
                <div className="prep-session-row" key={session}>
                  <span>{index + 1}</span><strong>{session}</strong>{index === 0 && <Badge tone="info">Próxima</Badge>}
                </div>
              ))}
            </div>
            <div className="divider" />
            <div className="prep-tyre-stock">
              <span className="muted small">Pneus disponíveis</span>
              <div className="tyre-stock-row">
                {(["soft", "medium", "hard", "inter", "wet"] as const).map((compound) => (
                  <span className="tyre-stock-item" key={compound}><TyreBadge compound={compound} /><strong>{tyreInventory[compound] ?? 0}</strong></span>
                ))}
              </div>
            </div>
          </Panel>
        </aside>
      </div>

      <div className="prep-config-layout">
        <Panel className="prep-setup-panel" title="Acerto e pilotos" subtitle="Ajuste o carro para a pista antes do treino">
          <div className="weekend-note">
            <Badge tone="info">Regra 2026</Badge>
            <p>Corrida seca exige dois compostos secos diferentes. No Sprint não há troca obrigatória. O pit stop após a entrada não pode ser cancelado.</p>
          </div>
          <div className="setup-driver-grid">
            {drivers.map((d) => {
              const setup = round.setups[d.driverId] ?? { downforce: circuit.downforceIdeal, focus: "balanced" as const, startingCompound: "medium" as const, fuelLoad: 1 };
              const data = DRIVER_BY_ID[d.driverId];
              return (
                <div className="setup-card setup-card-v131" key={d.driverId}>
                  <div className="setup-driver-head">
                    <DriverPortrait driverId={d.driverId} size="md" decorative />
                    <div>
                      <strong>#{data?.numero} {data?.nome ?? "Reserva"}</strong>
                      <span className="muted small"><CountryFlag country={data?.nacionalidade ?? ""} /> {data?.nacionalidade} · contrato {d.contratoEtapas} etapa(s)</span>
                    </div>
                    <Badge tone="info">Confiança {practice.confidence}%</Badge>
                  </div>
                  <label className="field">
                    <span>Downforce <strong>{Math.round(setup.downforce * 100)}%</strong></span>
                    <input type="range" min={0} max={100} value={Math.round(setup.downforce * 100)} onChange={(e) => onAction({ type: "setSetup", driverId: d.driverId, patch: { downforce: Number(e.target.value) / 100 } })} />
                    <small className="muted">Baixa = reta; alta = curvas. O ideal é revelado pelo treino.</small>
                  </label>
                  <div className="field">
                    <span>Foco do acerto</span>
                    <div className="segmented">
                      {(["qualifying", "balanced", "race"] as const).map((f) => (
                        <button key={f} className={setup.focus === f ? "active" : ""} onClick={() => onAction({ type: "setSetup", driverId: d.driverId, patch: { focus: f } })}>
                          {f === "qualifying" ? "Classificação" : f === "balanced" ? "Equilibrado" : "Corrida"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <span>Composto inicial</span>
                    <div className="compound-picker">
                      {(["soft", "medium", "hard", "inter", "wet"] as const).map((c) => (
                        <button key={c} className={`compound-chip ${setup.startingCompound === c ? "active" : ""}`} onClick={() => onAction({ type: "setSetup", driverId: d.driverId, patch: { startingCompound: c } })}>
                          <TyreBadge compound={c} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="row-between prep-setup-footer">
            <span className="muted small">Equipe: {money(team.budget)} disponíveis · dados de treino alimentam o planejador abaixo</span>
            <Button variant="primary" onClick={() => onAction({ type: "enterPractice" })} disabled={!isHost}>Iniciar treino livre</Button>
          </div>
        </Panel>

        <Panel title="Leitura do circuito" subtitle="Referências reais para a estratégia">
          <div className="circuit-insight-list">
            <div><span>Característica</span><strong>{circuit.descricao}</strong></div>
            <div><span>Ponto forte</span><strong>{circuit.pontosForca}</strong></div>
            <div><span>Ultrapassagem</span><strong>{circuit.dificuldadeUltrapassagem > 0.6 ? "Baixa" : circuit.dificuldadeUltrapassagem > 0.45 ? "Média" : "Alta"}</strong></div>
            <div><span>Chance de chuva</span><strong>{Math.round(circuit.chanceChuva * 100)}%</strong></div>
            <div><span>Pit loss</span><strong>~{pitLoss.toFixed(1)}s</strong></div>
          </div>
          <p className="muted small">O planejamento abaixo é uma estimativa; tráfego, temperatura, chuva e incidentes alteram a execução.</p>
        </Panel>
      </div>

      <RaceStrategyPlanner career={career} onAction={onAction} />
    </div>
  );
}

export function PracticeScreen({
  career,
  meTeamId,
  onAction,
  isHost,
}: {
  career: Career;
  meTeamId: string;
  onAction: (a: Action) => void;
  isHost: boolean;
}) {
  const circuit = CIRCUITS_2026[career.roundIndex];
  const state = practiceFor(career);
  const programs = [
    { id: "qualifying" as const, title: "Simulação de classificação", desc: "Revela a janela de downforce e o potencial em volta rápida." },
    { id: "race" as const, title: "Simulação de corrida", desc: "Estima degradação, consumo e perda no pit lane." },
    { id: "tyres" as const, title: "Comparativo de pneus", desc: "Compara macio, médio e duro em ritmo de corrida." },
  ];
  return (
    <div className="weekend">
      <div className="weekend-head">
        <div>
          <span className="kicker">Treino livre · {circuit.gp}</span>
          <h1>Programa de treino</h1>
          <p className="muted">Três programas disponíveis. Cada um aumenta a confiança do acerto e revela dados.</p>
        </div>
        <div className="weekend-actions">
          <Badge tone="info">Confiança {state.confidence}%</Badge>
          <Button variant="primary" onClick={() => onAction({ type: "finishPractice" })} disabled={!isHost}>
            {circuit.sprint ? "Ir para Classificação Sprint" : "Ir para a classificação"}
          </Button>
        </div>
      </div>
      <div className="practice-grid">
        <Panel title="Programas" subtitle={`${state.runs}/3 programas executados`}>
          {programs.map((p) => (
            <div className="program-card" key={p.id}>
              <div>
                <strong>{p.title}</strong>
                <p className="muted small">{p.desc}</p>
              </div>
              <Button variant="subtle" size="small" disabled={state.runs >= 3} onClick={() => onAction({ type: "runPractice", program: p.id, teamId: meTeamId })}>
                Rodar
              </Button>
            </div>
          ))}
          <div className="confidence-box">
            <span>Confiança do acerto</span>
            <Bar value={state.confidence} color="#4ade80" label={`${state.confidence}%`} />
            <small className="muted">Mais confiança reduz o erro de acerto e melhora a previsão do downforce ideal.</small>
          </div>
          {!isHost && <p className="muted small">Somente o host avança para a classificação. Você ainda pode rodar programas da sua equipe.</p>}
        </Panel>
        <Panel title="Dados coletados" subtitle="Telemetria simplificada">
          {state.programs.length === 0 && <Empty>Nenhum programa executado.</Empty>}
          {state.programs.map((p, i) => (
            <div className="program-result" key={i}>
              <div className="row-between"><strong>{p.label}</strong><Badge tone="good">+{p.confidenceGain}%</Badge></div>
              <p>{p.summary}</p>
              <ul>{p.data.map((d, j) => <li key={j}>{d}</li>)}</ul>
            </div>
          ))}
          <div className="divider" />
          <h4>Janela de acerto</h4>
          <p className="muted small">
            {state.confidence < 35 ? "Rode a simulação de classificação para revelar o downforce ideal." : `Downforce ideal estimado: ${Math.round(state.idealDownforce * 100)}%.`}
          </p>
          <p className="muted small">{state.weatherForecast}</p>
        </Panel>
      </div>
    </div>
  );
}

export function QualifyingResultScreen({
  career,
  onAction,
  isHost,
}: {
  career: Career;
  onAction: (a: Action) => void;
  isHost: boolean;
}) {
  const circuit = CIRCUITS_2026[career.roundIndex];
  const isSprint = career.phase === "sprintQuali";
  const result = isSprint ? currentRound(career).sprintQualifying : currentRound(career).qualifying;
  const [segment, setSegment] = useState<1 | 2 | 3>(1);
  const segmentEntries = result?.segments.find((s) => s.segment === segment)?.entries ?? [];
  const grid = result?.grid ?? [];
  const q3Ids = new Set(result?.segments[2]?.entries.map((entry) => entry.driverId) ?? []);
  const q2Ids = new Set(result?.segments[1]?.entries.map((entry) => entry.driverId) ?? []);
  const title = isSprint ? "Classificação Sprint" : "Classificação";
  return (
    <div className="weekend">
      <div className="weekend-head">
        <div>
          <span className="kicker">{title} · {circuit.gp}</span>
          <h1>Grid de largada</h1>
          <p className="muted">{isSprint ? "SQ1 com 22 carros, SQ2 com 16 e SQ3 com 10." : "Q1 com 22 carros, Q2 com 16 e Q3 com 10."} Resultado da classificação interativa.</p>
        </div>
        <div className="weekend-actions">
          <Badge tone="info">{isSprint ? "Grid do Sprint" : "Grid da corrida"}</Badge>
          <Button variant="primary" onClick={() => onAction({ type: "enterRace", kind: isSprint ? "sprint" : "race" })} disabled={!isHost}>
            {isSprint ? "Iniciar Sprint" : "Iniciar corrida"}
          </Button>
        </div>
      </div>
      <div className="quali-grid">
        <Panel title="Segmentos" subtitle="Eliminados em cada fase">
          <div className="tabs small">
            {([1, 2, 3] as const).map((s) => (
              <button key={s} className={segment === s ? "active" : ""} onClick={() => setSegment(s)}>{isSprint ? "SQ" : "Q"}{s}</button>
            ))}
          </div>
          <div className="table-wrap">
            <table className="data-table quali-table">
              <thead><tr><th>#</th><th>Piloto</th><th>Equipe</th><th>Tempo</th><th>Status</th></tr></thead>
              <tbody>
                {segmentEntries.map((e, i) => {
                  const tag =
                    segment === 1
                      ? e.eliminatedIn === 1
                        ? "Eliminado"
                        : "Avançou"
                      : segment === 2
                        ? e.eliminatedIn === 2
                          ? "Eliminado"
                          : "Q3"
                        : "Q3";
                  return (
                    <tr key={e.driverId} className={career.playerTeams.includes(DRIVER_BY_ID[e.driverId]?.equipeId ?? "") ? "mine" : ""}>
                      <td>{i + 1}</td>
                      <td><DriverLabel driverId={e.driverId} team={false} /></td>
                      <td><TeamName teamId={e.teamId} /></td>
                      <td>{formatQualiTime(segment === 1 ? e.q1 : segment === 2 ? e.q2 : e.q3)}</td>
                      <td>{tag === "Eliminado" ? <Badge tone="bad">Eliminado</Badge> : tag === "Q3" ? <Badge tone="good">Q3</Badge> : <Badge>Avançou</Badge>}</td>
                    </tr>
                  );
                })}
                {segmentEntries.length === 0 && <tr><td colSpan={5}><Empty>Segmento ainda não simulado.</Empty></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Ordem final do grid" subtitle={isSprint ? "Define o grid do Sprint" : "Define o grid da corrida"}>
          <div className="grid-list">
            {grid.map((driverId, i) => {
              const d = DRIVER_BY_ID[driverId];
              const entry = result?.segments.flatMap((s) => s.entries).find((e) => e.driverId === driverId);
              return (
                <div className={`grid-row ${career.playerTeams.includes(d?.equipeId ?? "") ? "mine" : ""}`} key={driverId}>
                  <span className="pos">{i + 1}</span>
                  <TeamLogo teamId={d?.equipeId ?? ""} size="xs" decorative />
                  <DriverPortrait driverId={driverId} size="xs" decorative />
                  <span>{d?.nome ?? driverId}</span>
                  <em>{q3Ids.has(driverId) ? formatQualiTime(entry?.q3) : q2Ids.has(driverId) ? formatQualiTime(entry?.q2) : formatQualiTime(entry?.q1)}</em>
                </div>
              );
            })}
          </div>
          {!isHost && <p className="muted small">Aguardando o host iniciar a sessão.</p>}
        </Panel>
      </div>
      {!isSprint && currentRound(career).sprintResult && (
        <div style={{ marginTop: 16 }}>
          <ResultTable result={currentRound(career).sprintResult!} career={career} title="Resultado do Sprint" />
        </div>
      )}
    </div>
  );
}

export function ResultsScreen({
  career,
  meTeamId,
  onAction,
  isHost,
  onExit,
}: {
  career: Career;
  meTeamId: string;
  onAction: (a: Action) => void;
  isHost: boolean;
  onExit: () => void;
}) {
  const circuit = CIRCUITS_2026[career.roundIndex];
  const result = currentRound(career).raceResult;
  const sprint = currentRound(career).sprintResult;
  const team = teamState(career, meTeamId)!;
  const ledger = team.ledger.filter((l) => l.round === career.roundIndex + 1);
  const standings = constructorStandings(career);
  const myPos = standings.find((s) => s.teamId === meTeamId)?.position ?? 11;
  return (
    <div className="weekend">
      <div className="weekend-head">
        <div>
          <span className="kicker">Resultados · {circuit.gp}</span>
          <h1>{result ? `${DRIVER_BY_ID[result.entries[0]?.driverId ?? ""]?.nome ?? "Vencedor"} vence em ${circuit.cidade}` : "Resultados"}</h1>
          <p className="muted">{result?.weatherSummary} · {result?.safetyCars ?? 0} Safety Car(s) · volta mais rápida: {result?.fastestLapDriverId ? DRIVER_BY_ID[result.fastestLapDriverId]?.nome : "—"}</p>
        </div>
        <div className="weekend-actions">
          <Badge tone={myPos <= team.objectives.targetPosition ? "good" : "warn"}>Sua equipe: {ordinal(myPos)}</Badge>
          <Button variant="primary" onClick={() => onAction({ type: "continue" })} disabled={!isHost}>
            {career.roundIndex >= CIRCUITS_2026.length - 1 ? "Encerrar temporada" : "Próxima etapa"}
          </Button>
        </div>
      </div>
      {result && <ResultTable result={result} career={career} title="Corrida" />}
      {sprint && <ResultTable result={sprint} career={career} title="Sprint" />}
      <div className="two-col">
        <Panel title="Financeiro da etapa" subtitle="Premiação, patrocínio, salários e logística">
          <div className="finance-summary">
            <div><span>Saldo após a etapa</span><strong className={team.budget < 0 ? "text-bad" : "text-good"}>{money(team.budget)}</strong></div>
            <div><span>Resultado líquido</span><strong>{money(ledger.reduce((s, l) => s + l.valor, 0))}</strong></div>
          </div>
          {ledger.length === 0 && <Empty>Nenhum lançamento.</Empty>}
          {ledger.map((l, i) => (
            <div className="ledger-row" key={i}>
              <span className="ledger-round">R{l.round}</span>
              <span>{l.descricao}</span>
              <strong className={l.valor >= 0 ? "text-good" : "text-bad"}>{l.valor >= 0 ? "+" : ""}{money(l.valor)}</strong>
            </div>
          ))}
        </Panel>
        <Panel title="Campeonato após a etapa" subtitle="Pontuação atualizada">
          <div className="table-wrap">
            <table className="data-table compact-table">
              <thead><tr><th>#</th><th>Piloto</th><th>Pts</th></tr></thead>
              <tbody>
                {driverStandings(career).slice(0, 10).map((d) => (
                  <tr key={d.driverId} className={career.playerTeams.includes(DRIVER_BY_ID[d.driverId]?.equipeId ?? "") ? "mine" : ""}>
                    <td>{d.position}</td>
                    <td><DriverLabel driverId={d.driverId} /></td>
                    <td><strong>{d.standing.points}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
      {!isHost && <p className="muted small">Aguardando o host confirmar a próxima etapa.</p>}
      <div className="row-end">
        <Button variant="ghost" onClick={onExit}>Salvar e sair</Button>
      </div>
    </div>
  );
}

function ResultTable({ result, career, title }: { result: SessionResult; career: Career; title: string }) {
  return (
    <Panel title={title} subtitle={`${result.kind === "sprint" ? "Pontuação reduzida (top 8)" : "Pontuação completa (top 10)"} · ${result.entries.filter((e) => e.status === "retired").length} abandono(s)`}>
      <div className="table-wrap">
        <table className="data-table result-table">
          <thead><tr><th>#</th><th>Piloto</th><th>Equipe</th><th>Grid</th><th>Tempo / diferença</th><th>Pits</th><th>Pts</th><th>Obs.</th></tr></thead>
          <tbody>
            {result.entries.map((e) => (
              <tr key={e.driverId} className={career.playerTeams.includes(e.teamId) ? "mine" : ""}>
                <td>{e.position}</td>
                <td><DriverLabel driverId={e.driverId} team={false} /></td>
                <td><TeamName teamId={e.teamId} /></td>
                <td>{e.grid}</td>
                <td>{e.status === "retired" ? <span className="text-bad">{e.reason ?? "Abandono"}</span> : e.position === 1 ? formatLapTime(e.time) : `+${(e.gap ?? 0).toFixed(3)}s`}</td>
                <td>{e.stops}</td>
                <td><strong>{e.points}</strong></td>
                <td className="small muted">{e.penalty > 0 ? `+${e.penalty}s` : ""} {e.fastestLap && result.fastestLapDriverId === e.driverId ? "· VL" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function formatQualiTime(seconds: number | null | undefined): string {
  return seconds != null && seconds > 0 ? formatLapTime(seconds) : "—";
}

export function SeasonEndScreen({ career, meTeamId, onExit }: { career: Career; meTeamId: string; onExit: () => void }) {
  const championDriver = career.champions?.drivers ? DRIVER_BY_ID[career.champions.drivers] : undefined;
  const championTeam = career.champions?.constructors ? TEAM_BY_ID[career.champions.constructors] : undefined;
  const myPos = constructorStandings(career).find((s) => s.teamId === meTeamId)?.position ?? 11;
  const team = teamState(career, meTeamId)!;
  return (
    <div className="season-end">
      <div className="champion-hero">
        <span className="kicker">Temporada 2026 encerrada</span>
        <h1>Campeões da temporada curta</h1>
        <div className="champion-cards">
          <div className="champion-card">
            <span>Campeão de pilotos</span>
            <div className="champion-identity">
              {championDriver && <DriverPortrait driverId={championDriver.id} size="xl" decorative />}
              <strong>{championDriver ? `#${championDriver.numero} ${championDriver.nome}` : "—"}</strong>
            </div>
            <span>{championDriver ? TEAM_BY_ID[championDriver.equipeId]?.nome : ""}</span>
            <em>{career.champions?.drivers ? driverStandings(career).find((d) => d.driverId === career.champions!.drivers)?.standing.points : 0} pts</em>
          </div>
          <div className="champion-card">
            <span>Campeão de construtores</span>
            <div className="champion-identity">
              {championTeam && <TeamLogo teamId={championTeam.id} size="xl" decorative />}
              <strong>{championTeam?.nome ?? "—"}</strong>
            </div>
            <span>{championTeam?.nomeOficial ?? ""}</span>
            <em>{career.champions?.constructors ? constructorStandings(career).find((c) => c.teamId === career.champions!.constructors)?.standing.points : 0} pts</em>
          </div>
        </div>
      </div>
      <div className="two-col">
        <Panel title="Sua campanha" subtitle={TEAM_BY_ID[meTeamId]?.nome}>
          <div className="season-line">
            <span className="season-team"><TeamLogo teamId={meTeamId} size="xs" decorative /> Classificação de construtores</span>
            <strong>{ordinal(myPos)}</strong>
          </div>
          <div className="season-line">
            <span>Objetivo da equipe</span>
            <strong className={team.objectives.completed ? "text-good" : "text-bad"}>{team.objectives.completed ? "Cumprido" : "Não cumprido"}</strong>
          </div>
          <div className="season-line">
            <span>Meta</span>
            <strong>{ordinal(team.objectives.targetPosition)} · bônus {money(team.objectives.bonus)}</strong>
          </div>
          <div className="season-line">
            <span>Saldo final</span>
            <strong className={team.budget < 0 ? "text-bad" : "text-good"}>{money(team.budget)}</strong>
          </div>
          <div className="divider" />
          <h4>Pilotos</h4>
          {getDriversOfTeam(career, meTeamId).map((d) => {
            const data = DRIVER_BY_ID[d.driverId];
            const pos = driverStandings(career).find((s) => s.driverId === d.driverId);
            return (
              <div className="season-line" key={d.driverId}>
                <span className="season-driver">
                  <DriverPortrait driverId={d.driverId} size="xs" decorative />
                  {data ? `#${data.numero} ${data.nome}` : "Reserva"}
                </span>
                <strong>{pos ? `${ordinal(pos.position)} · ${pos.standing.points} pts` : "—"}</strong>
              </div>
            );
          })}
        </Panel>
        <Panel title="Resumo das etapas" subtitle="Vencedores das três corridas">
          {CIRCUITS_2026.map((c, i) => {
            const result = career.results.find((r) => r.round === i + 1 && r.kind === "race");
            const sprint = career.results.find((r) => r.round === i + 1 && r.kind === "sprint");
            return (
              <React.Fragment key={c.id}>
                <div className="season-line">
                  <span className="season-round"><CountryFlag country={c.pais} /> {c.gp}</span>
                  <strong>{result ? DRIVER_BY_ID[result.entries[0]?.driverId ?? ""]?.nome ?? "—" : "—"}</strong>
                </div>
                {sprint && (
                  <div className="season-line">
                    <span className="muted small" style={{ paddingLeft: 18 }}>Sprint</span>
                    <strong className="small">{DRIVER_BY_ID[sprint.entries[0]?.driverId ?? ""]?.nome ?? "—"}</strong>
                  </div>
                )}
              </React.Fragment>
            );
          })}
          <div className="divider" />
          <h4>Notícias finais</h4>
          <ul className="news-list">{career.news.slice(0, 8).map((n, i) => <li key={i}>{n}</li>)}</ul>
        </Panel>
      </div>
      <div style={{ marginTop: 16 }}>
        <Championship career={career} />
      </div>
      <div className="row-end">
        <Button variant="primary" onClick={onExit}>Salvar e voltar ao menu</Button>
      </div>
    </div>
  );
}
