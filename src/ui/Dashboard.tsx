import React, { useMemo, useState } from "react";
import { CIRCUITS_2026, DRIVER_BY_ID, SPONSOR_OFFERS, STAFF_MARKET, TEAM_BY_ID, type CarAttributes } from "../data/season2026";
import type { Career } from "../engine/types";
import type { CareerAction as Action } from "../net/protocol";
import {
  constructorStandings,
  driverStandings,
  getDriversOfTeam,
  labelArea,
  sponsorsFor,
  teamState,
} from "../engine/career";
import { Badge, Bar, Button, DriverLabel, Empty, Panel, TeamName, money, ordinal } from "./Common";
import { CircuitPhoto, DriverPortrait, TeamLogo } from "./Media";
import { CountryFlag, SprintIcon, WeatherIcon } from "./Visuals";
import { AdminTrackMap } from "./AdminTrackMap";
import { createWeather, describeWeather } from "../engine/race";
import { estimatePitLoss } from "../engine/raceStrategy";
import { COMPOUNDS } from "../engine/tyres";

type Tab = "overview" | "drivers" | "development" | "finance" | "calendar" | "championship";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Visão geral" },
  { id: "drivers", label: "Pilotos e carros" },
  { id: "development", label: "Desenvolvimento" },
  { id: "finance", label: "Finanças" },
  { id: "calendar", label: "Calendário" },
  { id: "championship", label: "Campeonato" },
];

export function Dashboard({
  career,
  meTeamId,
  onAction,
  onPrepare,
  isHost = true,
}: {
  career: Career;
  meTeamId: string;
  onAction: (action: Action) => void;
  onPrepare: () => void;
  isHost?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [standingView, setStandingView] = useState<"constructors" | "drivers" | "team">("constructors");
  const team = teamState(career, meTeamId)!;
  const drivers = getDriversOfTeam(career, meTeamId);
  const circuit = CIRCUITS_2026[career.roundIndex];
  const dStandings = driverStandings(career);
  const cStandings = constructorStandings(career);
  const teamPos = cStandings.find((c) => c.teamId === meTeamId)?.position ?? 11;
  const sponsor = SPONSOR_OFFERS.find((s) => s.id === team.sponsorId);
  const weather = useMemo(() => createWeather(circuit, `${career.seed}:r${career.roundIndex + 1}`), [career.seed, career.roundIndex, circuit]);
  const pitLoss = estimatePitLoss(circuit, team.pitCrew ?? 70);
  const sessions = circuit.sprint
    ? ["Treino livre", "Classificação Sprint", "Sprint", "Classificação", "Corrida"]
    : ["Treino livre", "Classificação", "Corrida"];
  const driverComparison = ["velocidade", "consistencia", "gestaoPneus", "ultrapassagem", "defesa", "chuva", "experiencia", "agressividade"] as const;
  const carOverall = Math.round((team.car.aerodinamica + team.car.curvas + team.car.retas + team.car.energia + team.car.confiabilidade + team.car.gestaoPneus) / 6);

  return (
    <div className="dashboard">
      <div className="career-header">
        <div className="career-team" style={{ borderColor: TEAM_BY_ID[meTeamId]?.corPrimaria }}>
          <span className="kicker">Sua equipe</span>
          <h2><TeamLogo teamId={meTeamId} size="sm" decorative /> {TEAM_BY_ID[meTeamId]?.nome}</h2>
          <span className="muted"><CountryFlag country={TEAM_BY_ID[meTeamId]?.pais ?? ""} /> {TEAM_BY_ID[meTeamId]?.nomeOficial}</span>
        </div>
        <div className="career-kpis">
          <div><span>Etapa</span><strong>{career.roundIndex + 1}/3</strong><small>{circuit.gp}</small></div>
          <div><span>Orçamento</span><strong className={team.budget < 5 ? "text-bad" : "text-good"}>{money(team.budget)}</strong><small>saldo atual</small></div>
          <div><span>Construtores</span><strong>{ordinal(teamPos)}</strong><small>{cStandings.find((c) => c.teamId === meTeamId)?.standing.points ?? 0} pts</small></div>
          <div><span>Objetivo</span><strong>{ordinal(team.objectives.targetPosition)}</strong><small>{team.objectives.completed ? "cumprido" : "em disputa"}</small></div>
        </div>
      </div>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="overview-layout">
          <div className="overview-main">
            <section className="next-race-hero">
              <CircuitPhoto circuitId={circuit.id} className="next-race-photo" showCredit />
              <div className="next-race-shade" />
              <div className="next-race-content">
                <div className="next-race-copy">
                  <div className="next-race-kicker">
                    <span className="kicker">Próxima etapa · {circuit.sprint ? "Fim de semana Sprint" : "Fim de semana tradicional"}</span>
                    <Badge tone="info">{circuit.data}</Badge>
                    {circuit.sprint && <Badge tone="warn"><SprintIcon /> Sprint</Badge>}
                  </div>
                  <h2><CountryFlag country={circuit.pais} className="hero-flag" /> {circuit.gp}</h2>
                  <p>{circuit.nome} · {circuit.cidade}, {circuit.pais}</p>
                  <div className="next-race-facts">
                    <div><span>Voltas</span><strong>{circuit.voltas}</strong></div>
                    <div><span>Extensão</span><strong>{(circuit.comprimentoM / 1000).toFixed(3)} km</strong></div>
                    <div><span>Curvas</span><strong>{circuit.curvas}</strong></div>
                    <div><span>Chuva</span><strong>{Math.round(circuit.chanceChuva * 100)}%</strong></div>
                    <div><span>Pit loss</span><strong>~{pitLoss.toFixed(1)}s</strong></div>
                  </div>
                  <div className="next-race-actions">
                    <Button variant="primary" onClick={onPrepare} disabled={!isHost}>Preparar GP <span aria-hidden="true">→</span></Button>
                    <span className="muted small">{circuit.descricao}</span>
                  </div>
                </div>
                <div className="next-race-track"><AdminTrackMap circuit={circuit} className="overview-admin-map" /></div>
              </div>
            </section>

            <div className="overview-columns">
              <Panel title="Sequência do fim de semana" subtitle="Etapas reais do fluxo de jogo; sem horários simulados">
                <div className="weekend-sequence">
                  {sessions.map((session, index) => (
                    <div className={`sequence-step ${index === 0 ? "next" : ""}`} key={session}>
                      <span className="sequence-index">{index + 1}</span>
                      <strong>{session}</strong>
                      {index < sessions.length - 1 && <span className="sequence-line" />}
                    </div>
                  ))}
                </div>
                <div className="weekend-note compact">
                  <Badge tone="info">{circuit.sprint ? "Sprint" : "Tradicional"}</Badge>
                  <span>{circuit.sprint ? "SQ1/SQ2/SQ3, Sprint e classificação principal." : "Treino, classificação e corrida."}</span>
                </div>
              </Panel>

              <Panel title="Clima esperado" subtitle="Previsão determinística do fim de semana">
                <div className="weather-strip">
                  {weather.slice(0, 4).map((phase, index) => (
                    <div className="weather-cell" key={`${phase.fromLap}-${index}`}>
                      <div className="weather-cell-head"><WeatherIcon rain={phase.rain} /><span>{phase.fromLap === 0 ? "Largada" : `Volta ${phase.fromLap}`}</span></div>
                      <strong>{describeWeather(phase.rain)}</strong>
                      <small>{Math.round(phase.rain * 100)}% chuva · {phase.trackTemp}°C pista</small>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <div className="overview-columns">
              <Panel title="Eventos da carreira" subtitle="Registros produzidos pelo jogo">
                <ul className="news-list news-list-wide">
                  {career.news.length > 0 ? career.news.slice(0, 6).map((n, i) => <li key={i}>{n}</li>) : <li className="muted">Nenhum evento registrado ainda.</li>}
                </ul>
              </Panel>

              <Panel title="Resumo técnico" subtitle="Atributos usados pelo motor">
                <div className="technical-bars">
                  {(["aerodinamica", "curvas", "retas", "energia", "confiabilidade", "gestaoPneus"] as const).map((key) => (
                    <div className="technical-line" key={key}>
                      <span>{labelArea(key)}</span>
                      <Bar value={team.car[key]} color={key === "confiabilidade" ? "#fbbf24" : "#6ea8fe"} label={`${Math.round(team.car[key])}`} />
                    </div>
                  ))}
                </div>
                <div className="technical-foot">
                  <span>Patrocinador <strong>{sponsor?.nome ?? "Nenhum"}</strong></span>
                  <span>Componentes <strong>{Math.round((team.components.pu + team.components.cambio + team.components.freios + team.components.bateria) / 4)}% desgaste médio</strong></span>
                </div>
              </Panel>
            </div>
          </div>

          <aside className="overview-side">
            <Panel title="Situação no campeonato" subtitle="Classificação atual da carreira">
              <div className="segmented compact standing-switch">
                {(["constructors", "drivers", "team"] as const).map((view) => (
                  <button key={view} className={standingView === view ? "active" : ""} onClick={() => setStandingView(view)}>
                    {view === "constructors" ? "Construtores" : view === "drivers" ? "Pilotos" : "Desempenho"}
                  </button>
                ))}
              </div>
              {standingView === "constructors" && (
                <div className="standing-list">
                  {cStandings.slice(0, 8).map((c) => (
                    <div className={`standing-line ${career.playerTeams.includes(c.teamId) ? "mine" : ""}`} key={c.teamId}>
                      <span className="pos">{c.position}º</span>
                      <TeamName teamId={c.teamId} />
                      <strong>{c.standing.points} pts</strong>
                    </div>
                  ))}
                </div>
              )}
              {standingView === "drivers" && (
                <div className="standing-list">
                  {dStandings.slice(0, 8).map((entry) => (
                    <div className={`standing-line ${drivers.some((d) => d.driverId === entry.driverId) ? "mine" : ""}`} key={entry.driverId}>
                      <span className="pos">{entry.position}º</span>
                      <DriverLabel driverId={entry.driverId} />
                      <strong>{entry.standing.points} pts</strong>
                    </div>
                  ))}
                </div>
              )}
              {standingView === "team" && (
                <div className="team-performance">
                  <div className="standing-line mine"><span className="pos">{teamPos}º</span><TeamName teamId={meTeamId} /><strong>{cStandings.find((c) => c.teamId === meTeamId)?.standing.points ?? 0} pts</strong></div>
                  {(["aerodinamica", "curvas", "retas", "energia", "confiabilidade", "gestaoPneus"] as const).map((key) => (
                    <div className="technical-line" key={key}><span>{labelArea(key)}</span><Bar value={team.car[key]} color={key === "confiabilidade" ? "#fbbf24" : "#6ea8fe"} label={`${Math.round(team.car[key])}`} /></div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Objetivo da equipe" subtitle={team.objectives.completed ? "Meta cumprida" : "Em disputa"}>
              <div className="objective-box">
                <Badge tone={team.objectives.completed ? "good" : "info"}>{team.objectives.completed ? "Cumprido" : "Meta da temporada"}</Badge>
                <p>{team.objectives.descricao}</p>
                <span className="muted">Bônus: {money(team.objectives.bonus)} se cumprir a meta de construtores.</span>
              </div>
            </Panel>
            {!isHost && <p className="muted small">Aguardando o host iniciar a preparação.</p>}
          </aside>
        </div>
      )}

      {tab === "drivers" && (
        <div className="drivers-layout">
          <div className="driver-pair-grid">
            {drivers.map((d) => {
              const data = DRIVER_BY_ID[d.driverId];
              const isReserve = !data;
              return (
                <section className="driver-profile-card" key={d.driverId}>
                  <div className="driver-profile-hero">
                    <div className="driver-profile-photo-wrap">
                      <DriverPortrait driverId={d.driverId} size="xl" className="driver-profile-photo" decorative />
                      <span className="driver-profile-number" style={{ color: TEAM_BY_ID[meTeamId]?.corPrimaria }}>{data?.numero ?? "R"}</span>
                    </div>
                    <div className="driver-profile-identity">
                      <span className="kicker">{isReserve ? "Piloto reserva" : <><CountryFlag country={data?.nacionalidade ?? ""} /> {data?.nacionalidade ?? "—"} · {data?.codigo ?? "—"}</>}</span>
                      <h2>{isReserve ? d.driverId : data.nome}</h2>
                      <p>{isReserve ? "Contrato encerrado; substituição automática" : `#${data.numero} · ${TEAM_BY_ID[meTeamId]?.nomeOficial}`}</p>
                    </div>
                    <div className="driver-contract-card">
                      <div><span>Contrato</span><strong>{d.contratoEtapas} etapa(s)</strong></div>
                      <div><span>Salário</span><strong>{money(d.salario)}/etapa</strong></div>
                      <div><span>Moral</span><strong>{d.moral}</strong></div>
                      <Button size="small" variant="subtle" onClick={() => onAction({ type: "renewDriver", driverId: d.driverId })}>Renovar contrato</Button>
                    </div>
                  </div>
                  <div className="driver-profile-attrs">
                    {Object.entries(d.attributes).map(([k, v]) => (
                      <div className="attr-line" key={k}>
                        <span>{attrLabel(k)}</span>
                        <Bar value={v} color={v >= 90 ? "#4ade80" : v >= 78 ? "#6ea8fe" : v >= 65 ? "#fbbf24" : "#f87171"} label={`${v}`} />
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          <div className="driver-bottom-grid">
            <Panel className="car-panel" title="Carro e componentes" subtitle="Desgaste reduz confiabilidade na simulação">
              <div className="car-overall-row">
                <div className="car-overall">
                  <span>OVR</span>
                  <strong>{carOverall}</strong>
                  <small>média dos atributos</small>
                </div>
                <div className="car-overall-bars">
                  {(["aerodinamica", "curvas", "retas", "energia"] as const).map((key) => (
                    <div className="technical-line" key={key}><span>{labelArea(key)}</span><Bar value={team.car[key]} color="#6ea8fe" label={`${Math.round(team.car[key])}`} /></div>
                  ))}
                </div>
              </div>
              <div className="divider" />
              <h4>Componentes principais</h4>
              <div className="component-table">
                <div className="component-table-head"><span>Componente</span><span>Desgaste</span><span>Status</span><span>Ação</span></div>
                {(["pu", "cambio", "freios", "bateria"] as const).map((part) => (
                  <div className="component-table-row" key={part}>
                    <span>{componentLabel(part)}</span>
                    <Bar value={team.components[part]} color={team.components[part] > 70 ? "#f87171" : team.components[part] > 45 ? "#fbbf24" : "#4ade80"} label={`${Math.round(team.components[part])}%`} />
                    <span className={team.components[part] > 70 ? "text-bad" : team.components[part] > 45 ? "text-warn" : "text-good"}>
                      {team.components[part] > 70 ? "Atenção" : team.components[part] > 45 ? "Monitorar" : "Bom"}
                    </span>
                    <Button size="small" variant="ghost" onClick={() => onAction({ type: "replaceComponent", teamId: meTeamId, part })}>Trocar</Button>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Resumo da dupla" subtitle="Comparação direta dos atributos reais">
              <div className="driver-comparison-head">
                <span>{DRIVER_BY_ID[drivers[0]?.driverId]?.codigo ?? "P1"}</span>
                <strong>Atributo</strong>
                <span>{DRIVER_BY_ID[drivers[1]?.driverId]?.codigo ?? "P2"}</span>
              </div>
              {driverComparison.map((key) => {
                const first = drivers[0]?.attributes[key] ?? 0;
                const second = drivers[1]?.attributes[key] ?? 0;
                return (
                  <div className="driver-comparison-row" key={key}>
                    <span className={first >= second ? "win" : ""}>{first}</span>
                    <span>{attrLabel(key)}</span>
                    <span className={second >= first ? "win" : ""}>{second}</span>
                  </div>
                );
              })}
              <div className="comparison-legend">
                <span><i className="legend-dot good" /> Melhor valor</span>
                <span><i className="legend-dot neutral" /> Comparação dos dois pilotos</span>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {tab === "development" && <Development career={career} meTeamId={meTeamId} onAction={onAction} />}
      {tab === "finance" && <Finance career={career} meTeamId={meTeamId} onAction={onAction} />}
      {tab === "calendar" && <Calendar career={career} />}
      {tab === "championship" && <Championship career={career} />}
    </div>
  );
}

function Development({ career, meTeamId, onAction }: { career: Career; meTeamId: string; onAction: (a: Action) => void }) {
  const team = teamState(career, meTeamId)!;
  const areas = Object.keys(team.car) as (keyof CarAttributes)[];
  const staff = Object.values(team.staff);
  const history = [...team.ledger].reverse().filter((entry) => entry.categoria === "desenvolvimento");
  const expectedGain = (area: keyof CarAttributes, mode: "standard" | "fast") => {
    const staffBonus =
      1 +
      (team.staff.engenheiro_chefe.rating - 70) * 0.008 +
      (area === "aerodinamica" ? (team.staff.aerodinamicista.rating - 70) * 0.006 : 0);
    return Math.max(0.6, Math.round((mode === "fast" ? 1.15 : 1.85) * staffBonus * 10) / 10);
  };
  return (
    <div className="development-layout">
      <div className="development-main">
        <section className={`project-banner ${team.project ? "active" : ""}`}>
          <div>
            <div className="project-banner-kicker">
              <Badge tone={team.project ? "good" : "info"}>{team.project ? "Projeto ativo" : "Sem projeto ativo"}</Badge>
              <span className="muted small">{team.project ? "Conclusão após a próxima etapa" : "Escolha uma área para iniciar"}</span>
            </div>
            <h2>{team.project ? team.project.nome : "Próximo desenvolvimento"}</h2>
            <p>
              {team.project
                ? `${labelArea(team.project.area)} · ${team.project.ganho >= 0 ? "+" : ""}${team.project.ganho.toFixed(1)} previsto`
                : "Projetos padrão concluem após a próxima corrida; atualizações imediatas são aplicadas agora."}
            </p>
          </div>
          <div className="project-banner-stats">
            <div><span>Atributo atual</span><strong>{team.project ? Math.round(team.car[team.project.area]) : "—"}</strong></div>
            <div><span>Ganho previsto</span><strong className="text-good">{team.project ? `+${team.project.ganho.toFixed(1)}` : "—"}</strong></div>
            <div><span>Custo</span><strong>{team.project ? money(team.project.custo) : "—"}</strong></div>
            <div><span>Progresso</span><strong>{team.project ? `${team.project.etapasTotal - team.project.etapasRestantes}/${team.project.etapasTotal}` : "—"}</strong></div>
          </div>
          {team.project && <Bar value={team.project.etapasTotal - team.project.etapasRestantes} max={team.project.etapasTotal} color="#4ade80" label="progresso" />}
        </section>

        <Panel title="Áreas de desenvolvimento" subtitle="Cada melhoria usa atributos reais do carro">
          <div className="dev-area-table">
            <div className="dev-area-head"><span>Área</span><span>Atual</span><span>Ganho padrão</span><span>Ganho imediato</span><span>Custo / prazo</span><span>Ações</span></div>
            {areas.map((area) => (
              <div className="dev-area-row" key={area}>
                <div className="dev-area-name">
                  <strong>{labelArea(area)}</strong>
                  <span className="muted small">Atributo usado no ritmo/confiabilidade</span>
                </div>
                <div className="dev-area-value"><Bar value={team.car[area]} color={area === "confiabilidade" ? "#fbbf24" : "#6ea8fe"} label={`${Math.round(team.car[area])}`} /></div>
                <strong className="text-good">+{expectedGain(area, "standard").toFixed(1)}</strong>
                <strong className="text-good">+{expectedGain(area, "fast").toFixed(1)}</strong>
                <span className="muted small">5.2 mi · 1 etapa / 9.2 mi · imediato</span>
                <div className="dev-area-actions">
                  <Button size="small" variant="subtle" disabled={!!team.project || career.seasonComplete} onClick={() => onAction({ type: "startDevelopment", teamId: meTeamId, area, mode: "standard" })}>Padrão</Button>
                  <Button size="small" variant="primary" disabled={career.seasonComplete} onClick={() => onAction({ type: "startDevelopment", teamId: meTeamId, area, mode: "fast" })}>Imediata</Button>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <details className="disclosure">
          <summary>Histórico de desenvolvimento <span>{history.length}</span></summary>
          <div className="disclosure-body">
            {history.length > 0 ? history.map((entry, index) => (
              <div className="history-line" key={`${entry.round}-${index}`}>
                <span>R{entry.round}</span>
                <strong>{entry.descricao}</strong>
                <span className={entry.valor >= 0 ? "text-good" : "text-bad"}>{money(entry.valor)}</span>
              </div>
            )) : <Empty>Nenhum desenvolvimento registrado.</Empty>}
          </div>
        </details>
      </div>

      <aside className="development-side">
        <Panel title="Equipe técnica" subtitle="Engenheiro chefe acelera projetos; estrategista orienta a IA">
          {staff.map((s) => (
            <div className="staff-line" key={s.id}>
              <div>
                <strong>{s.nome}</strong>
                <span className="muted small">{staffRole(s.funcao)} · rating {s.rating} · {money(s.salario)}/etapa</span>
              </div>
              <Bar value={s.rating} color="#a78bfa" label={`${s.rating}`} />
            </div>
          ))}
        </Panel>

        <details className="disclosure" open>
          <summary>Mercado de funcionários <span>{STAFF_MARKET.length}</span></summary>
          <div className="disclosure-body staff-market">
            {STAFF_MARKET.map((s) => (
              <div className="staff-candidate" key={s.id}>
                <div>
                  <strong>{s.nome}</strong>
                  <span className="muted small">{staffRole(s.funcao)} · rating {s.rating} · contratação {money(s.contratacao)}</span>
                </div>
                <Button size="small" variant="ghost" onClick={() => onAction({ type: "hireStaff", teamId: meTeamId, candidateId: s.id })}>Contratar</Button>
              </div>
            ))}
          </div>
        </details>
      </aside>
    </div>
  );
}

function Finance({ career, meTeamId, onAction }: { career: Career; meTeamId: string; onAction: (a: Action) => void }) {
  const team = teamState(career, meTeamId)!;
  const offers = sponsorsFor(team);
  const ledger = [...team.ledger].reverse().slice(0, 30);
  const income = team.ledger.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0);
  const expense = team.ledger.filter((l) => l.valor < 0).reduce((s, l) => s + l.valor, 0);
  return (
    <div className="finance-grid">
      <Panel title="Orçamento" subtitle="Receitas, despesas e saldo por etapa">
        <div className="budget-hero">
          <span>Saldo disponível</span>
          <strong className={team.budget < 0 ? "text-bad" : "text-good"}>{money(team.budget)}</strong>
        </div>
        <div className="finance-summary">
          <div><span>Receitas</span><strong className="text-good">{money(income)}</strong></div>
          <div><span>Despesas</span><strong className="text-bad">−{money(Math.abs(expense))}</strong></div>
          <div><span>Patrocínios</span><strong>{money(team.ledger.filter((l) => l.categoria === "patrocinio").reduce((s, l) => s + l.valor, 0))}</strong></div>
        </div>
        <div className="divider" />
        <h4>Movimentações</h4>
        {ledger.length === 0 && <Empty>Nenhuma movimentação ainda. A primeira etapa gera premiação, patrocínio e salários.</Empty>}
        <div className="ledger">
          {ledger.map((l, i) => (
            <div className="ledger-row" key={i}>
              <span className="ledger-round">R{l.round}</span>
              <span>{l.descricao}</span>
              <strong className={l.valor >= 0 ? "text-good" : "text-bad"}>{l.valor >= 0 ? "+" : ""}{money(l.valor)}</strong>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Patrocinadores" subtitle="Assinatura paga agora; pagamento por etapa e bônus por resultado">
        {offers.map((s) => (
          <div className={`sponsor-card ${team.sponsorId === s.id ? "active" : ""}`} key={s.id}>
            <div>
              <strong>{s.nome}</strong>
              <span className="muted small">{s.setor} · {s.objetivo}</span>
              <span className="small">Assinatura {money(s.assinatura)} · {money(s.porEtapa)}/etapa · bônus {money(s.bonusObjetivo)}</span>
            </div>
            <Button size="small" variant={team.sponsorId === s.id ? "success" : "subtle"} disabled={team.sponsorId === s.id} onClick={() => onAction({ type: "signSponsor", teamId: meTeamId, sponsorId: s.id })}>
              {team.sponsorId === s.id ? "Ativo" : "Assinar"}
            </Button>
          </div>
        ))}
        <div className="divider" />
        <p className="muted small">Premiação por etapa (construtores): P1 {money(9)} até P11 {money(1.2)}. Custos fixos: logística, salários de pilotos e equipe técnica.</p>
      </Panel>
    </div>
  );
}

function Calendar({ career }: { career: Career }) {
  return (
    <Panel title="Calendário 2026" subtitle="Três etapas da temporada curta">
      <div className="calendar-list">
        {CIRCUITS_2026.map((c, index) => {
          const result = career.results.find((r) => r.round === index + 1 && r.kind === "race");
          const sprint = career.results.find((r) => r.round === index + 1 && r.kind === "sprint");
          const winner = result ? DRIVER_BY_ID[result.entries[0]?.driverId ?? ""]?.nome : null;
          const sprintWinner = sprint ? DRIVER_BY_ID[sprint.entries[0]?.driverId ?? ""]?.nome : null;
          const state = index < career.roundIndex || (index === career.roundIndex && result) ? "done" : index === career.roundIndex ? "next" : "future";
          return (
            <div className={`calendar-row ${state}`} key={c.id}>
              <div className="calendar-round">R{index + 1}</div>
              <div className="calendar-flag"><CountryFlag country={c.pais} /></div>
              <div className="calendar-info">
                <strong>{c.gp}</strong>
                <span>{c.nome} · {c.cidade}, {c.pais}</span>
                <span className="muted small">{c.voltas} voltas · {(c.comprimentoM / 1000).toFixed(3)} km · {c.data} {c.sprint ? "· Sprint" : ""}</span>
              </div>
              <div className="calendar-result">
                {winner && <span>🏆 {winner}{sprintWinner ? ` · Sprint: ${sprintWinner}` : ""}</span>}
                {!winner && state === "next" && <Badge tone="info">Próxima etapa</Badge>}
                {state === "future" && <Badge>Futura</Badge>}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export function Championship({ career }: { career: Career }) {
  const drivers = driverStandings(career);
  const teams = constructorStandings(career);
  return (
    <div className="two-col">
      <Panel title="Campeonato de pilotos" subtitle="Pontos de corrida + Sprint">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>#</th><th>Piloto</th><th>Equipe</th><th>Pts</th><th>Vit.</th><th>Pód.</th></tr></thead>
            <tbody>
              {drivers.map((d) => {
                const data = DRIVER_BY_ID[d.driverId];
                const highlight = career.playerTeams.includes(data?.equipeId ?? "");
                return (
                  <tr key={d.driverId} className={highlight ? "mine" : ""}>
                    <td>{d.position}</td>
                    <td><DriverLabel driverId={d.driverId} team={false} /></td>
                    <td>{data ? <TeamName teamId={data.equipeId} /> : <span className="muted">Reserva</span>}</td>
                    <td><strong>{d.standing.points}</strong></td>
                    <td>{d.standing.wins}</td>
                    <td>{d.standing.podiums}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Campeonato de construtores" subtitle="Soma dos pontos da equipe">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>#</th><th>Equipe</th><th>Pts</th><th>Vit.</th><th>Melhor</th></tr></thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.teamId} className={career.playerTeams.includes(t.teamId) ? "mine" : ""}>
                  <td>{t.position}</td>
                  <td><TeamName teamId={t.teamId} /></td>
                  <td><strong>{t.standing.points}</strong></td>
                  <td>{t.standing.wins}</td>
                  <td>{t.standing.bestFinish === 99 ? "—" : `${t.standing.bestFinish}º`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function attrLabel(key: string): string {
  return {
    velocidade: "Velocidade",
    consistencia: "Consistência",
    gestaoPneus: "Gestão de pneus",
    ultrapassagem: "Ultrapassagem",
    defesa: "Defesa",
    chuva: "Chuva",
    experiencia: "Experiência",
    agressividade: "Agressividade",
  }[key] ?? key;
}

function staffRole(role: string): string {
  return { engenheiro_chefe: "Engenheiro chefe", aerodinamicista: "Aerodinamicista", estrategista: "Estrategista" }[role] ?? role;
}

function componentLabel(part: string): string {
  return { pu: "Unidade de potência", cambio: "Câmbio", freios: "Freios", bateria: "Bateria" }[part] ?? part;
}
