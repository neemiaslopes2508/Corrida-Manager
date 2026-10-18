import React, { useState } from "react";
import { DRIVERS_2026, TEAMS_2026, TEAM_BY_ID } from "../data/season2026";
import type { PlayerView, RoomView } from "../net/protocol";
import { Badge, Button, Panel, money } from "./Common";
import { DriverPortrait, TeamLogo } from "./Media";

export function MultiplayerHome({
  connected,
  error,
  room,
  you,
  onConnect,
  onCreate,
  onJoin,
  onReconnect,
  onBack,
  onPickTeam,
  onReady,
  onStart,
}: {
  connected: boolean;
  error: string | null;
  room: RoomView | null;
  you: PlayerView | null;
  onConnect: () => void;
  onCreate: (name: string) => void;
  onJoin: (code: string, name: string) => void;
  onReconnect: (code: string, token: string) => void;
  onBack: () => void;
  onPickTeam: (teamId: string) => void;
  onReady: (ready: boolean) => void;
  onStart: () => void;
}) {
  const [name, setName] = useState(() => localStorage.getItem("cm-player-name") ?? "");
  const [code, setCode] = useState(() => localStorage.getItem("cm-last-room") ?? "");
  const savedToken = code ? localStorage.getItem(`cm-room-${code}`) : null;

  if (room && room.phase === "lobby") {
    return (
      <LobbyScreen
        room={room}
        you={you}
        error={error}
        onBack={onBack}
        connected={connected}
        onPickTeam={onPickTeam}
        onReady={onReady}
        onStart={onStart}
      />
    );
  }

  return (
    <div className="multi-screen">
      <header className="page-head">
        <div>
          <span className="kicker">Multiplayer online</span>
          <h1>Sala de jogo</h1>
          <p className="muted">Até 3 jogadores humanos, cada um com uma equipe. O host roda o servidor e controla o ritmo das sessões.</p>
        </div>
        <Button variant="ghost" onClick={onBack}>Voltar</Button>
      </header>
      <div className="multi-grid">
        <Panel title="Criar sala" subtitle="Você será o host e controlará pausa, velocidade e avanço das sessões">
          <label className="field">
            <span>Seu nome</span>
            <input value={name} maxLength={24} placeholder="Ex.: Ana" onChange={(e) => setName(e.target.value)} />
          </label>
          <Button variant="primary" disabled={!connected || !name.trim()} onClick={() => { localStorage.setItem("cm-player-name", name.trim()); onCreate(name.trim()); }}>
            Criar sala
          </Button>
          {!connected && <p className="muted small">Conectando ao servidor...</p>}
        </Panel>
        <Panel title="Entrar em uma sala" subtitle="Peça o código de 5 caracteres ao host">
          <label className="field">
            <span>Seu nome</span>
            <input value={name} maxLength={24} placeholder="Ex.: Bruno" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Código da sala</span>
            <input value={code} maxLength={5} placeholder="ABC12" onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </label>
          <div className="row-gap">
            <Button variant="primary" disabled={!connected || !name.trim() || code.length < 4} onClick={() => { localStorage.setItem("cm-player-name", name.trim()); onJoin(code.trim().toUpperCase(), name.trim()); }}>
              Entrar
            </Button>
            {savedToken && (
              <Button variant="subtle" disabled={!connected || !code} onClick={() => onReconnect(code.trim().toUpperCase(), savedToken)}>
                Reconectar
              </Button>
            )}
          </div>
        </Panel>
        <Panel title="Como conectar pela rede local ou internet" subtitle="LAN ou link público sem hospedagem">
          <ol className="help-list">
            <li>No computador host, rode <code>npm install</code> e depois <code>npm run online</code>.</li>
            <li>O terminal mostra um link <code>https://....trycloudflare.com</code>. Compartilhe esse link com os jogadores.</li>
            <li>Os outros jogadores abrem o link, entram na sala com o código e escolhem equipes diferentes.</li>
            <li>O host clica em “Iniciar carreira”. Todos veem a mesma simulação por HTTPS/WSS.</li>
            <li>Na mesma rede, também funciona <code>npm start</code> e o endereço LAN mostrado no terminal.</li>
            <li>Mantenha o terminal aberto. Se cair, volte pela mesma sala e use “Reconectar”.</li>
          </ol>
        </Panel>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <Panel title="Equipes disponíveis" subtitle="A escolha acontece dentro do lobby, sem duplicação">
        <div className="lobby-teams-preview">
          {TEAMS_2026.map((t) => (
            <div className="lobby-team-preview" key={t.id}>
              <TeamLogo teamId={t.id} size="xs" decorative />
              <span>{t.nome}</span>
              <em className="lobby-team-drivers">
                {DRIVERS_2026.filter((d) => d.equipeId === t.id).map((d) => (
                  <span key={d.id}><DriverPortrait driverId={d.id} size="xs" decorative />{d.codigo}</span>
                ))}
              </em>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function LobbyScreen({
  room,
  you,
  error,
  connected,
  onBack,
  onPickTeam,
  onReady,
  onStart,
}: {
  room: RoomView;
  you: PlayerView | null;
  error: string | null;
  connected: boolean;
  onBack: () => void;
  onPickTeam?: (teamId: string) => void;
  onReady?: (ready: boolean) => void;
  onStart?: () => void;
}) {
  const isHost = !!you?.isHost;
  const taken = new Set(room.players.map((p) => p.teamId).filter(Boolean) as string[]);
  const allReady = room.players.length > 0 && room.players.every((p) => p.ready && p.teamId);
  const [localReady, setLocalReady] = useState(you?.ready ?? false);
  const copyCode = () => navigator.clipboard?.writeText(room.code).catch(() => undefined);

  return (
    <div className="lobby-screen">
      <header className="page-head">
        <div>
          <span className="kicker">Lobby multiplayer</span>
          <h1>Sala <button className="code-button" onClick={copyCode} title="Copiar código">{room.code}</button></h1>
          <p className="muted">Compartilhe o código e o endereço do host. Cada jogador escolhe uma equipe diferente.</p>
        </div>
        <Button variant="ghost" onClick={onBack}>Sair da sala</Button>
      </header>
      <div className="lobby-grid">
        <Panel title="Jogadores" subtitle={`${room.players.length}/3 conectados`}>
          {room.players.map((p) => (
            <div className="player-row" key={p.id}>
              <span className={`presence ${p.connected ? "online" : "offline"}`} />
              <div>
                <strong>{p.name} {p.isHost && <Badge tone="info">Host</Badge>}{p.id === you?.id && <Badge>Você</Badge>}</strong>
                <span className="muted small player-team">
                  {p.teamId ? <><TeamLogo teamId={p.teamId} size="xs" decorative /> {TEAM_BY_ID[p.teamId]?.nome}</> : "Sem equipe"} · {p.ready ? "Pronto" : "Escolhendo"}
                </span>
              </div>
              <span className={`ready-dot ${p.ready ? "on" : ""}`} />
            </div>
          ))}
          {room.players.length < 3 && <p className="muted small">Aguardando mais jogadores. É possível iniciar com 1 ou 2 — as demais equipes ficam com a IA.</p>}
          <div className="divider" />
          <div className="lobby-actions">
            <Button variant={localReady ? "success" : "subtle"} disabled={!you?.teamId || !connected} onClick={() => { setLocalReady(!localReady); onReady?.(!localReady); }}>
              {localReady ? "Pronto ✓" : "Marcar pronto"}
            </Button>
            {isHost && (
              <Button variant="primary" disabled={!allReady} onClick={onStart}>
                Iniciar carreira
              </Button>
            )}
            {isHost && !allReady && <span className="muted small">Todos precisam escolher equipe e marcar pronto.</span>}
          </div>
          {error && <div className="error-banner">{error}</div>}
        </Panel>
        <Panel title="Escolha sua equipe" subtitle="Sem duplicação — equipes ocupadas ficam indisponíveis">
          <div className="lobby-team-grid">
            {TEAMS_2026.map((t) => {
              const owner = room.players.find((p) => p.teamId === t.id);
              const mine = you?.teamId === t.id;
              const disabled = !!owner && !mine;
              return (
                <button key={t.id} className={`lobby-team ${mine ? "mine" : ""} ${disabled ? "taken" : ""}`} disabled={disabled || room.phase !== "lobby"} onClick={() => onPickTeam?.(t.id)} style={{ borderColor: mine ? t.corPrimaria : undefined }}>
                  <TeamLogo teamId={t.id} size="sm" decorative />
                  <div>
                    <strong>{t.nome}</strong>
                    <span className="muted small lobby-team-drivers">
                      {t.pilotos.map((id) => {
                        const d = DRIVERS_2026.find((x) => x.id === id);
                        return <span key={id}><DriverPortrait driverId={id} size="xs" decorative />{d?.codigo}</span>;
                      })}
                    </span>
                  </div>
                  <span className="small">{owner ? (mine ? "Sua" : owner.name) : money(t.orcamentoInicial)}</span>
                </button>
              );
            })}
          </div>
        </Panel>
      </div>
      <div className="lobby-footer">
        <Badge tone={connected ? "good" : "bad"}>{connected ? "Conectado ao servidor" : "Desconectado"}</Badge>
        <span className="muted small">Tokens de reconexão ficam no navegador. O host precisa manter o processo do servidor ativo.</span>
      </div>
    </div>
  );
}
