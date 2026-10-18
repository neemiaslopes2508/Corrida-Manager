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
import { formatLapTime } from "../engine/track";
import { Badge, Bar, Button, DriverLabel, Empty, Panel, StatRow, TeamName, TyreBadge, money, ordinal } from "./Common";
import { DriverPortrait, TeamLogo } from "./Media";
import { TrackMap } from "./TrackMap";
import { Championship } from "./Dashboard";

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

  return (
    <div className="weekend">
      <div className="weekend-head">
        <div>
          <span className="kicker">Preparação · Etapa {career.roundIndex + 1}/3</span>
          <h1>{circuit.bandeira} {circuit.gp}</h1>
          <p className="muted">{circuit.nome} · {circuit.cidade}, {circuit.pais} · {circuit.data}</p>
        </div>
        <div className="weekend-actions">
          <Badge tone={circuit.sprint ? "info" : "neutral"}>{circuit.sprint ? "Fim de semana Sprint" : "Fim de semana tradicional"}</Badge>
          <Button variant="primary" onClick={() => onAction({ type: "enterPractice" })} disabled={!isHost}>
            Ir para o treino livre
          </Button>
        </div>
      </div>

      <div className="prep-grid">
        <Panel title="Circuito" subtitle={circuit.descricao}>
          <TrackMap circuit={circuit} compact />
          <div className="prep-facts">
            <StatRow label="Voltas" value={`${circuit.voltas} (Sprint: ${circuit.voltasSprint})`} />
            <StatRow label="Extensão" value={`${(circuit.comprimentoM / 1000).toFixed(3)} km`} />
            <StatRow label="Curvas" value={circuit.curvas} />
            <StatRow label="Downforce ideal" value={practice.confidence > 35 ? `${Math.round(Math.max(0, practice.idealDownforce - window) * 100)}–${Math.round(Math.min(1, practice.idealDownforce + window) * 100)}%` : "ainda desconhecido"} />
            <StatRow label="Dificuldade de ultrapassagem" value={circuit.dificuldadeUltrapassagem > 0.6 ? "Baixa" : circuit.dificuldadeUltrapassagem > 0.45 ? "Média" : "Alta"} />
            <StatRow label="Pit loss" value={`~${circuit.pitLoss.toFixed(1)}s`} />
          </div>
          <div className="divider" />
          <h4>Previsão do tempo</h4>
          <div className="forecast">
            {weather.map((w, i) => (
              <div className="forecast-row" key={i}>
                <span>{w.fromLap === 0 ? "Largada" : `Volta ${w.fromLap}`}</span>
                <strong>{describeWeather(w.rain)}</strong>
                <span className="muted">{Math.round(w.rain * 100)}% chuva · {w.trackTemp}°C pista</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Acerto e estratégia" subtitle="As escolhas alteram o ritmo, o desgaste e o resultado da classificação">
          <div className="weekend-note">
            <Badge tone="info">Regra 2026</Badge>
            <p>Corrida seca exige ao menos dois compostos secos diferentes. No Sprint não há troca obrigatória. Pit stop após a entrada não pode ser cancelado.</p>
          </div>
          {drivers.map((d) => {
            const setup = round.setups[d.driverId] ?? { downforce: circuit.downforceIdeal, focus: "balanced" as const, startingCompound: "medium" as const, fuelLoad: 1 };
            const plan = round.strategyPlans[d.driverId] ?? "";
            const data = DRIVER_BY_ID[d.driverId];
            return (
              <div className="setup-card" key={d.driverId}>
                <div className="setup-head">
                  <div>
                    <strong>#{data?.numero} {data?.nome ?? "Reserva"}</strong>
                    <span className="muted small">{data?.codigo} · contrato {d.contratoEtapas} etapa(s)</span>
                  </div>
                  <span className="muted small">Confiança do acerto: {practice.confidence}%</span>
                </div>
                <label className="field">
                  <span>Downforce <strong>{Math.round(setup.downforce * 100)}%</strong></span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(setup.downforce * 100)}
                    onChange={(e) => onAction({ type: "setSetup", driverId: d.driverId, patch: { downforce: Number(e.target.value) / 100 } })}
                  />
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
                <label className="field inline">
                  <span>Pit planejado (volta)</span>
                  <input
                    type="number"
                    min={1}
                    max={circuit.voltas}
                    value={plan}
                    placeholder={`padrão ${Math.round(circuit.voltas * 0.5)}`}
                    onChange={(e) => onAction({ type: "setStrategyPlan", driverId: d.driverId, lap: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                  <small className="muted">Pode ser alterado durante a corrida.</small>
                </label>
              </div>
            );
          })}
          <div className="row-between">
            <span className="muted small">Equipe: {money(team.budget)} disponíveis</span>
            <Button variant="primary" onClick={() => onAction({ type: "enterPractice" })} disabled={!isHost}>
              Iniciar treino livre
            </Button>
          </div>
        </Panel>
      </div>
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

export function QualifyingScreen({
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
  const title = isSprint ? "Classificação Sprint" : "Classificação";
  return (
    <div className="weekend">
      <div className="weekend-head">
        <div>
          <span className="kicker">{title} · {circuit.gp}</span>
          <h1>Grid de largada</h1>
          <p className="muted">Q1 com 22 carros, Q2 com 15 e Q3 com 10. Tempos simulados a partir de carro, piloto, acerto e clima.</p>
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
              <button key={s} className={segment === s ? "active" : ""} onClick={() => setSegment(s)}>Q{s}</button>
            ))}
          </div>
          <div className="table-wrap">
            <table className="data-table quali-table">
              <thead><tr><th>#</th><th>Piloto</th><th>Equipe</th><th>Tempo</th><th>Status</th></tr></thead>
              <tbody>
                {segmentEntries.map((e, i) => {
                  const tag =
                    segment === 1
                      ? e.q2 != null
                        ? "Avançou"
                        : "Eliminado"
                      : segment === 2
                        ? e.q3 != null
                          ? "Q3"
                          : "Eliminado"
                        : "Q3";
                  return (
                    <tr key={e.driverId} className={career.playerTeams.includes(DRIVER_BY_ID[e.driverId]?.equipeId ?? "") ? "mine" : ""}>
                      <td>{i + 1}</td>
                      <td><DriverLabel driverId={e.driverId} team={false} /></td>
                      <td><TeamName teamId={e.teamId} /></td>
                      <td>{formatLapTime(segment === 1 ? e.q1 : segment === 2 ? e.q2 : e.q3)}</td>
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
                  <em>{entry?.q3 ? formatLapTime(entry.q3) : entry?.q2 ? formatLapTime(entry.q2) : entry?.q1 ? formatLapTime(entry.q1) : "—"}</em>
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
                  <span>{c.bandeira} {c.gp}</span>
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
