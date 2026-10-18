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
import { Badge, Bar, Button, DriverLabel, Empty, Panel, StatRow, TeamName, TyreBadge, money, ordinal } from "./Common";
import { DriverPortrait, TeamLogo } from "./Media";
import { TrackMap } from "./TrackMap";

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
  const team = teamState(career, meTeamId)!;
  const drivers = getDriversOfTeam(career, meTeamId);
  const circuit = CIRCUITS_2026[career.roundIndex];
  const dStandings = driverStandings(career);
  const cStandings = constructorStandings(career);
  const teamPos = cStandings.find((c) => c.teamId === meTeamId)?.position ?? 11;
  const sponsor = SPONSOR_OFFERS.find((s) => s.id === team.sponsorId);

  return (
    <div className="dashboard">
      <div className="career-header">
        <div className="career-team" style={{ borderColor: TEAM_BY_ID[meTeamId]?.corPrimaria }}>
          <span className="kicker">Sua equipe</span>
          <h2><TeamLogo teamId={meTeamId} size="sm" decorative /> {TEAM_BY_ID[meTeamId]?.nome}</h2>
          <span className="muted">{TEAM_BY_ID[meTeamId]?.nomeOficial}</span>
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
        <div className="overview-grid">
          <Panel title={`Próxima etapa · ${circuit.gp}`} subtitle={`${circuit.nome} · ${circuit.cidade}, ${circuit.pais}`}
            actions={<Button variant="primary" onClick={onPrepare} disabled={!isHost}>Preparar GP</Button>}>
            <div className="prep-summary">
              <TrackMap circuit={circuit} compact />
              <div className="prep-facts">
                <StatRow label="Voltas" value={circuit.voltas} />
                <StatRow label="Extensão" value={`${(circuit.comprimentoM / 1000).toFixed(3)} km`} />
                <StatRow label="Formato" value={circuit.sprint ? "Sprint + Corrida" : "Corrida"} />
                <StatRow label="Chance de chuva" value={`${Math.round(circuit.chanceChuva * 100)}%`} />
                <StatRow label="Pit loss" value={`~${circuit.pitLoss.toFixed(1)}s`} />
                <StatRow label="Data" value={circuit.data} />
              </div>
            </div>
            <div className="objective-box">
              <Badge tone={team.objectives.completed ? "good" : "info"}>Objetivo da equipe</Badge>
              <p>{team.objectives.descricao}</p>
              <span className="muted">Bônus: {money(team.objectives.bonus)} se cumprir a meta de construtores.</span>
            </div>
            {!isHost && <p className="muted small">Aguardando o host iniciar a preparação.</p>}
          </Panel>

          <Panel title="Situação no campeonato" subtitle="Após as etapas concluídas">
            <h4>Pilotos da equipe</h4>
            {drivers.map((d) => {
              const pos = dStandings.find((x) => x.driverId === d.driverId);
              return (
                <div className="standing-line" key={d.driverId}>
                  <span className="pos">{pos?.position ?? "—"}º</span>
                  <DriverLabel driverId={d.driverId} />
                  <strong>{pos?.standing.points ?? 0} pts</strong>
                </div>
              );
            })}
            <div className="divider" />
            <h4>Top 5 construtores</h4>
            {cStandings.slice(0, 5).map((c) => (
              <div className={`standing-line ${career.playerTeams.includes(c.teamId) ? "mine" : ""}`} key={c.teamId}>
                <span className="pos">{c.position}º</span>
                <TeamName teamId={c.teamId} />
                <strong>{c.standing.points} pts</strong>
              </div>
            ))}
          </Panel>

          <Panel title="Notícias e rádio da equipe" subtitle="Últimos acontecimentos">
            <ul className="news-list">
              {career.news.slice(0, 8).map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </Panel>

          <Panel title="Resumo técnico" subtitle="Atributos usados pelo motor">
            <div className="attr-grid">
              <span>Aerodinâmica <strong>{team.car.aerodinamica}</strong></span>
              <span>Curvas <strong>{team.car.curvas}</strong></span>
              <span>Retas <strong>{team.car.retas}</strong></span>
              <span>Energia <strong>{team.car.energia}</strong></span>
              <span>Confiabilidade <strong>{team.car.confiabilidade}</strong></span>
              <span>Pneus <strong>{team.car.gestaoPneus}</strong></span>
            </div>
            <div className="divider" />
            <StatRow label="Patrocinador" value={sponsor?.nome ?? "Nenhum"} />
            <StatRow label="Projeto ativo" value={team.project ? `${team.project.nome} (${team.project.etapasRestantes} etapa)` : "Nenhum"} />
            <StatRow label="Motor" value={`${Math.round(team.components.pu)}% de desgaste`} />
            <StatRow label="Contratos" value={drivers.map((d) => `${DRIVER_BY_ID[d.driverId]?.codigo ?? "RES"} ${d.contratoEtapas}et`).join(" · ")} />
          </Panel>
        </div>
      )}

      {tab === "drivers" && (
        <div className="two-col">
          {drivers.map((d) => {
            const data = DRIVER_BY_ID[d.driverId];
            const isReserve = !data;
            return (
              <Panel key={d.driverId} title={isReserve ? "Piloto reserva" : `#${data.numero} ${data.nome}`}
                subtitle={isReserve ? "Contrato encerrado; substituição automática" : `${data.nacionalidade} · ${data.codigo}`}>
                <div className="driver-head">
                  <DriverPortrait driverId={d.driverId} size="xl" decorative />
                  <div className="driver-number" style={{ color: TEAM_BY_ID[meTeamId]?.corPrimaria }}>
                    {data?.numero ?? "R"}
                  </div>
                  <div className="driver-contract">
                    <span>Contrato <strong>{d.contratoEtapas} etapa(s)</strong></span>
                    <span>Salário <strong>{money(d.salario)}/etapa</strong></span>
                    <span>Moral <strong>{d.moral}</strong></span>
                    <Button size="small" variant="subtle" onClick={() => onAction({ type: "renewDriver", driverId: d.driverId })}>
                      Renovar contrato
                    </Button>
                  </div>
                </div>
                <div className="attrs">
                  {Object.entries(d.attributes).map(([k, v]) => (
                    <div className="attr-line" key={k}>
                      <span>{attrLabel(k)}</span>
                      <Bar value={v} color={v >= 90 ? "#4ade80" : v >= 78 ? "#6ea8fe" : v >= 65 ? "#fbbf24" : "#f87171"} label={`${v}`} />
                    </div>
                  ))}
                </div>
              </Panel>
            );
          })}
          <Panel title="Carro e componentes" subtitle="Desgaste reduz confiabilidade na simulação">
            <div className="attrs">
              {(Object.keys(team.car) as (keyof CarAttributes)[]).map((k) => (
                <div className="attr-line" key={k}>
                  <span>{labelArea(k)}</span>
                  <Bar value={team.car[k]} color={k === "confiabilidade" ? "#fbbf24" : "#6ea8fe"} label={`${team.car[k]}`} />
                </div>
              ))}
            </div>
            <div className="divider" />
            <h4>Componentes</h4>
            {(["pu", "cambio", "freios", "bateria"] as const).map((part) => (
              <div className="component-line" key={part}>
                <span>{componentLabel(part)}</span>
                <Bar value={team.components[part]} color={team.components[part] > 70 ? "#f87171" : team.components[part] > 45 ? "#fbbf24" : "#4ade80"} label={`${Math.round(team.components[part])}%`} />
                <Button size="small" variant="ghost" onClick={() => onAction({ type: "replaceComponent", teamId: meTeamId, part })}>
                  Trocar
                </Button>
              </div>
            ))}
          </Panel>
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
  return (
    <div className="dev-grid">
      <Panel title="Projetos de desenvolvimento" subtitle="Cada projeto melhora um atributo usado na simulação">
        {team.project ? (
          <div className="project-active">
            <Badge tone="info">Em andamento</Badge>
            <h3>{team.project.nome}</h3>
            <p>+{team.project.ganho.toFixed(1)} em {labelArea(team.project.area)} · conclui após {team.project.etapasRestantes} etapa(s)</p>
            <Bar value={team.project.etapasTotal - team.project.etapasRestantes} max={team.project.etapasTotal} color="#4ade80" label="progresso" />
          </div>
        ) : (
          <p className="muted">Nenhum projeto ativo. Escolha uma área abaixo. O pacote padrão conclui após a próxima corrida; a atualização imediata é aplicada agora.</p>
        )}
        <div className="area-list">
          {areas.map((area) => (
            <div className="area-row" key={area}>
              <div>
                <strong>{labelArea(area)}</strong>
                <span className="muted small">Atual {team.car[area]} · impacto direto no ritmo/confiabilidade</span>
              </div>
              <div className="area-actions">
                <Button size="small" variant="subtle" disabled={!!team.project || career.seasonComplete} onClick={() => onAction({ type: "startDevelopment", teamId: meTeamId, area, mode: "standard" })}>
                  Padrão · 5.2 mi
                </Button>
                <Button size="small" variant="primary" disabled={career.seasonComplete} onClick={() => onAction({ type: "startDevelopment", teamId: meTeamId, area, mode: "fast" })}>
                  Imediata · 9.2 mi
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Equipe técnica" subtitle="Engenheiro chefe acelera projetos; estrategista reduz perda no pit">
        {staff.map((s) => (
          <div className="staff-line" key={s.id}>
            <div>
              <strong>{s.nome}</strong>
              <span className="muted small">{staffRole(s.funcao)} · rating {s.rating} · {money(s.salario)}/etapa</span>
            </div>
            <Bar value={s.rating} color="#a78bfa" label={`${s.rating}`} />
          </div>
        ))}
        <div className="divider" />
        <h4>Mercado</h4>
        <div className="staff-market">
          {STAFF_MARKET.map((s) => (
            <div className="staff-candidate" key={s.id}>
              <div>
                <strong>{s.nome}</strong>
                <span className="muted small">{staffRole(s.funcao)} · {s.rating} · contratação {money(s.contratacao)}</span>
              </div>
              <Button size="small" variant="ghost" onClick={() => onAction({ type: "hireStaff", teamId: meTeamId, candidateId: s.id })}>
                Contratar
              </Button>
            </div>
          ))}
        </div>
      </Panel>
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
              <div className="calendar-flag">{c.bandeira}</div>
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
