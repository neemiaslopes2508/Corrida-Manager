import React, { useMemo, useState } from "react";
import { CIRCUITS_2026, DRIVERS_2026, TEAMS_2026, TEAM_BY_ID } from "../data/season2026";
import type { CareerSummary } from "../engine/types";
import { Badge, Button, Panel, money } from "./Common";
import { DriverPortrait, TeamLogo } from "./Media";

export function MenuScreen({
  saves,
  rooms,
  onSolo,
  onMultiplayer,
  onLoad,
  onReconnect,
  onRefreshRooms,
}: {
  saves: CareerSummary[];
  rooms: { code: string; players: number; phase: string; careerPhase?: string | null }[];
  onSolo: () => void;
  onMultiplayer: () => void;
  onLoad: (id: string) => void;
  onReconnect: (code: string) => void;
  onRefreshRooms: () => void;
}) {
  const [tab, setTab] = useState<"menu" | "load" | "help">("menu");
  return (
    <div className="menu-screen">
      <header className="menu-hero">
        <div className="brand">
          <span className="brand-kicker">TEMPORADA 2026 · AUSTRÁLIA · CHINA · JAPÃO</span>
          <h1>
            CORRIDA<span>MANAGER</span>
          </h1>
          <p>
            Assuma uma equipe de Fórmula 1, desenvolva o carro, defina a estratégia e dispute três Grandes Prêmios com corridas simuladas em tempo real.
          </p>
          <div className="menu-cta">
            <Button variant="primary" onClick={onSolo}>
              Nova carreira solo
            </Button>
            <Button variant="success" onClick={onMultiplayer}>
              Multiplayer · 3 jogadores
            </Button>
            <Button variant="ghost" onClick={() => setTab("load")}>
              Carregar carreira
            </Button>
            <Button variant="ghost" onClick={() => setTab("help")}>
              Como jogar
            </Button>
          </div>
        </div>
        <div className="hero-stats">
          <div><strong>11</strong><span>equipes oficiais 2026</span></div>
          <div><strong>22</strong><span>pilotos com atributos ativos</span></div>
          <div><strong>3</strong><span>circuitos com traçados reais</span></div>
          <div><strong>1</strong><span>motor de corrida autoritativo</span></div>
        </div>
      </header>

      {tab === "load" && (
        <Panel title="Carreiras salvas" subtitle="Arquivos locais deste navegador. Salas multiplayer ficam no servidor host.">
          {saves.length === 0 && <p className="muted">Nenhuma carreira salva neste navegador.</p>}
          <div className="save-list">
            {saves.map((save) => (
              <div className="save-row" key={save.id}>
                <div>
                  <strong>{save.nome}</strong>
                  <span className="muted">
                    {save.modo === "solo" ? "Solo" : "Multiplayer"} · {save.playerTeams.map((t) => TEAM_BY_ID[t]?.nome).join(", ")} · Etapa {save.roundIndex + 1}/3
                  </span>
                  <span className="muted small">{new Date(save.updatedAt).toLocaleString("pt-BR")} · {save.seasonComplete ? "Temporada concluída" : save.phase}</span>
                </div>
                <Button variant="primary" onClick={() => onLoad(save.id)}>
                  Continuar
                </Button>
              </div>
            ))}
          </div>
          <div className="divider" />
          <div className="row-between">
            <h3>Salas no servidor</h3>
            <Button variant="ghost" onClick={onRefreshRooms}>Atualizar</Button>
          </div>
          {rooms.length === 0 && (
            <p className="muted">
              A listagem pública de salas fica desativada por segurança. Entre usando o código compartilhado pelo host.
              Em LAN, o host pode definir <code>CM_EXPOSE_ROOMS=1</code> para habilitar a lista.
            </p>
          )}
          <div className="save-list">
            {rooms.map((room) => (
              <div className="save-row" key={room.code}>
                <div>
                  <strong>Sala {room.code}</strong>
                  <span className="muted">{room.players} jogador(es) · {room.phase === "career" ? `carreira (${room.careerPhase ?? "em andamento"})` : "lobby"}</span>
                </div>
                <Button variant="subtle" onClick={() => onReconnect(room.code)}>
                  Entrar / reconectar
                </Button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {tab === "help" && (
        <Panel title="Como jogar" subtitle="Fluxo completo da V1">
          <div className="help-grid">
            <div>
              <h3>Fim de semana</h3>
              <ol>
                <li>Prepare o carro: downforce, foco de acerto, composto inicial e plano de pit.</li>
                <li>Rode programas de treino livre para ganhar confiança.</li>
                <li>Classifique (Q1/Q2/Q3). Na China há Classificação Sprint e Sprint.</li>
                <li>Acompanhe a corrida em tempo real, ajustando ritmo, energia, pneus e pits.</li>
              </ol>
            </div>
            <div>
              <h3>Corrida</h3>
              <ul>
                <li>Ritmo: conservar, normal ou atacar — afeta volta, desgaste e temperatura.</li>
                <li>Energia: poupar, normal ou empurrar. O Overtake Mode de 2026 é simulado como boost elétrico em disputa.</li>
                <li>Pneu: gestão, normal ou push. O composto seguinte é escolhido no painel.</li>
                <li>Pit: agende uma volta, chame imediatamente ou cancele antes da entrada.</li>
                <li>Safety Car, VSC, chuva, falhas e penalidades são decididos pelo servidor/motor.</li>
              </ul>
            </div>
            <div>
              <h3>Gestão</h3>
              <ul>
                <li>Orçamento real: premiação, patrocínio, salários, logística e desenvolvimento.</li>
                <li>Projetos de melhoria alteram atributos do carro usados na simulação.</li>
                <li>Componentes desgastados reduzem confiabilidade; troque antes de quebrar.</li>
                <li>Contratos vencem após duas etapas — renove para evitar uma renovação automática com salário maior.</li>
              </ul>
            </div>
            <div>
              <h3>Multiplayer</h3>
              <ul>
                <li>O host roda <code>npm run online</code> e compartilha o link público com os jogadores.</li>
                <li>Crie a sala, envie o código e cada jogador escolhe uma equipe diferente.</li>
                <li>Todos marcam “Pronto”; o host inicia. Só o host avança sessões, pausa e velocidade.</li>
                <li>Na mesma rede, <code>npm start</code> e o endereço LAN também funcionam. Para internet, use o link do Quick Tunnel.</li>
              </ul>
            </div>
          </div>
        </Panel>
      )}

      <section className="menu-footer-grid">
        <Panel title="Calendário da V1" subtitle="Três etapas para completar a temporada curta">
          <div className="calendar-strip">
            {CIRCUITS_2026.map((c) => (
              <div className="calendar-chip" key={c.id}>
                <span className="flag">{c.bandeira}</span>
                <div>
                  <strong>{c.gp}</strong>
                  <span>{c.cidade} · {c.voltas} voltas {c.sprint ? "· Sprint" : ""}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Equipes" subtitle="Dados de identidade 2026; desempenho é balanceamento do jogo">
          <div className="team-mini-grid">
            {TEAMS_2026.map((t) => (
              <div className="team-mini" key={t.id}>
                <TeamLogo teamId={t.id} size="xs" decorative />
                <span>{t.nome}</span>
                <em>{Math.round((t.carro.aerodinamica + t.carro.curvas + t.carro.retas + t.carro.energia) / 4)}</em>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  );
}

export function TeamSelectScreen({ onBack, onStart }: { onBack: () => void; onStart: (teamId: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const team = selected ? TEAM_BY_ID[selected] : null;
  const drivers = useMemo(() => (selected ? DRIVERS_2026.filter((d) => d.equipeId === selected) : []), [selected]);

  return (
    <div className="select-screen">
      <header className="page-head">
        <div>
          <span className="kicker">Nova carreira solo</span>
          <h1>Escolha sua equipe</h1>
          <p className="muted">11 equipes, 22 pilotos. Você controla os dois carros da equipe escolhida.</p>
        </div>
        <Button variant="ghost" onClick={onBack}>Voltar</Button>
      </header>
      <div className="team-select-layout">
        <div className="team-grid">
          {TEAMS_2026.map((t) => {
            const carAvg = Math.round((t.carro.aerodinamica + t.carro.curvas + t.carro.retas + t.carro.energia + t.carro.confiabilidade + t.carro.gestaoPneus) / 6);
            return (
              <button
                key={t.id}
                className={`team-card ${selected === t.id ? "selected" : ""}`}
                style={{ borderColor: selected === t.id ? t.corPrimaria : undefined }}
                onClick={() => setSelected(t.id)}
              >
                <span className="team-card-bar" style={{ background: t.corPrimaria }} />
                <div className="team-card-head">
                  <TeamLogo teamId={t.id} size="md" decorative />
                  <div className="team-card-title">
                    <strong>{t.nome}</strong>
                    <span>{t.sigla}</span>
                  </div>
                </div>
                <span className="muted small">{t.pais}</span>
                <div className="team-card-drivers">
                  {t.pilotos.map((id) => {
                    const d = DRIVERS_2026.find((x) => x.id === id)!;
                    return (
                      <span className="team-card-driver" key={id}>
                        <DriverPortrait driverId={id} size="xs" decorative />
                        <span>{d.codigo} <em>{d.nome.split(" ").slice(-1)}</em></span>
                      </span>
                    );
                  })}
                </div>
                <div className="team-card-meta">
                  <span>Carro <strong>{carAvg}</strong></span>
                  <span>Rep. <strong>{t.reputacao}</strong></span>
                  <span>Orç. <strong>{money(t.orcamentoInicial)}</strong></span>
                </div>
              </button>
            );
          })}
        </div>
        <aside className="team-detail">
          {!team && <p className="muted">Selecione uma equipe para ver detalhes.</p>}
          {team && (
            <>
              <div className="team-detail-head" style={{ borderColor: team.corPrimaria }}>
                <div className="team-detail-brand">
                  <TeamLogo teamId={team.id} size="lg" decorative />
                  <div>
                    <span className="kicker">{team.pais}</span>
                    <h2>{team.nomeOficial}</h2>
                  </div>
                </div>
                <p>{team.expectativa}</p>
              </div>
              <h4>Pilotos</h4>
              {drivers.map((d) => (
                <div className="mini-driver" key={d.id}>
                  <div className="mini-driver-person">
                    <DriverPortrait driverId={d.id} size="sm" decorative />
                    <div>
                      <strong>#{d.numero} {d.nome}</strong>
                      <span className="muted small">{d.nacionalidade}</span>
                    </div>
                  </div>
                  <div className="mini-attr">
                    <span>VEL {d.atributos.velocidade}</span>
                    <span>CON {d.atributos.consistencia}</span>
                    <span>PNE {d.atributos.gestaoPneus}</span>
                  </div>
                </div>
              ))}
              <h4>Carro</h4>
              <div className="attr-grid">
                <span>Aero <strong>{team.carro.aerodinamica}</strong></span>
                <span>Curvas <strong>{team.carro.curvas}</strong></span>
                <span>Retas <strong>{team.carro.retas}</strong></span>
                <span>Energia <strong>{team.carro.energia}</strong></span>
                <span>Confiab. <strong>{team.carro.confiabilidade}</strong></span>
                <span>Pneus <strong>{team.carro.gestaoPneus}</strong></span>
              </div>
              <div className="detail-block">
                <Badge tone="info">Objetivo</Badge>
                <p>{team.objetivo}</p>
              </div>
              <Button variant="primary" className="full" disabled={loading} onClick={() => { setLoading(true); onStart(team.id); }}>
                {loading ? "Criando carreira..." : "Iniciar carreira"}
              </Button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
