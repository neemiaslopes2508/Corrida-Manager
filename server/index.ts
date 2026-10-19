import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { WebSocketServer, WebSocket } from "ws";
import type { Career, QualifyingSessionState, RaceState, SessionResult } from "../src/engine/types";
import type { ClientMessage, RoomView, ServerMessage } from "../src/net/protocol";
import { applySessionResult, completeQualifyingSession, createCareer, makeRaceForCurrentRound, migrateCareer, sessionResultFromRace, startQualifyingSession } from "../src/engine/career";
import { advanceRace, applyRaceCommand, buildRaceView } from "../src/engine/race";
import { QUALIFYING_SPEEDS, advanceQualifyingSegment, advanceQualifyingSession, applyQualifyingCommand, buildQualifyingView, setQualifyingTeamAI, simulateQualifyingToEnd } from "../src/engine/qualifyingSession";
import { dispatchCareerAction } from "../src/engine/actions";
import { TEAM_BY_ID } from "../src/data/season2026";
import { loadRoomFiles, saveRoomFile, deleteRoomFile } from "./storage";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "0.0.0.0";
const MAX_WS_PAYLOAD = Number(process.env.CM_WS_MAX_PAYLOAD ?? 64 * 1024);
const ALLOW_ANY_ORIGIN = process.env.CM_ALLOW_ANY_ORIGIN === "1";
const ALLOW_NO_ORIGIN = process.env.CM_ALLOW_NO_ORIGIN === "1";
const PUBLIC_URL = process.env.PUBLIC_URL?.replace(/\/+$/, "") ?? "";

function parseOrigin(value: string | undefined): string | null {
  if (!value || value === "null") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

const PUBLIC_ORIGIN = parseOrigin(PUBLIC_URL) ?? "";
const EXTRA_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((v) => parseOrigin(v.trim()))
    .filter((v): v is string => !!v),
);

function isLoopback(host: string): boolean {
  const name = host.replace(/^\[/, "").split("]")[0].split(":")[0].toLowerCase();
  return name === "localhost" || name === "127.0.0.1" || name === "::1";
}

/** Abre uma URL no navegador padrão quando solicitado pelo iniciador. */
function openBrowser(url: string): void {
  try {
    const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", () => undefined);
    child.unref();
  } catch {
    // abrir o navegador é opcional; nunca deve impedir o servidor de subir
  }
}

/** Valida a origem do handshake WebSocket. */
function isOriginAllowed(req: http.IncomingMessage): boolean {
  const rawOrigin = req.headers.origin;
  if (!rawOrigin) return ALLOW_NO_ORIGIN;
  if (ALLOW_ANY_ORIGIN) return true;
  const origin = parseOrigin(rawOrigin);
  if (!origin) return false;
  if (PUBLIC_ORIGIN && origin === PUBLIC_ORIGIN) return true;
  if (EXTRA_ORIGINS.has(origin)) return true;

  const hostHeader = String(req.headers.host ?? "").toLowerCase();
  try {
    const originUrl = new URL(origin);
    if (hostHeader && originUrl.host.toLowerCase() === hostHeader) return true;
    // desenvolvimento local (Vite em outra porta, inclusive via LAN)
    if (isLoopback(originUrl.host) && isLoopback(hostHeader)) return true;
  } catch {
    return false;
  }
  return false;
}

function rejectUpgrade(socket: import("node:stream").Duplex, status: number, message: string): void {
  const body = `${status} ${message}`;
  socket.write(
    `HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
  );
  socket.destroy();
}

interface ServerPlayer {
  id: string;
  token: string;
  name: string;
  teamId: string | null;
  ready: boolean;
  connected: boolean;
  joinedAt: string;
}

interface ServerRoom {
  code: string;
  phase: "lobby" | "career";
  players: ServerPlayer[];
  career: Career | null;
  race: RaceState | null;
  raceKind: "race" | "sprint" | null;
  paused: boolean;
  speed: number;
  acc: number;
  createdAt: string;
  updatedAt: string;
  lastSaved: number;
  lastTick?: number;
}

interface SocketSession {
  code: string;
  playerId: string;
}

const rooms = new Map<string, ServerRoom>();
const sessions = new WeakMap<WebSocket, SocketSession>();
const sockets = new Set<WebSocket>();

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeCode(): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = "";
    for (let i = 0; i < 5; i++) code += ALPHABET[crypto.randomInt(ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
  throw new Error("Não foi possível gerar código de sala.");
}

const token = () => crypto.randomBytes(18).toString("hex");
const id = (prefix: string) => `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
const isValidToken = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{36}$/.test(value);
const isValidRoomCode = (value: unknown): value is string => typeof value === "string" && /^[A-Z0-9]{4,8}$/.test(value);

function loadRooms(): void {
  for (const raw of loadRoomFiles()) {
    if (!raw?.code) continue;
    const room: ServerRoom = {
      code: String(raw.code),
      phase: raw.phase === "career" ? "career" : "lobby",
      players: Array.isArray(raw.players)
        ? raw.players.map((p: ServerPlayer) => ({ ...p, connected: false, ready: false }))
        : [],
      career: raw.career ? migrateCareer(raw.career) : null,
      race: raw.race ?? null,
      raceKind: raw.raceKind ?? null,
      paused: true,
      speed: Number(raw.speed ?? 1),
      acc: 0,
      createdAt: raw.createdAt ?? new Date().toISOString(),
      updatedAt: raw.updatedAt ?? new Date().toISOString(),
      lastSaved: 0,
    };
    ensureQualifyingSession(room);
    rooms.set(room.code, room);
  }
  if (rooms.size > 0) console.log(`[salas] ${rooms.size} sala(s) carregada(s) do disco.`);
}

function persist(room: ServerRoom, force = false): void {
  const now = Date.now();
  if (!force && now - room.lastSaved < 2500) return;
  room.lastSaved = now;
  try {
    saveRoomFile(room, room.code);
  } catch (err) {
    console.error("[salas] falha ao salvar", room.code, err);
  }
}

function playerView(room: ServerRoom, player: ServerPlayer) {
  return {
    id: player.id,
    name: player.name,
    teamId: player.teamId,
    ready: player.ready,
    connected: player.connected,
    isHost: room.players[0]?.id === player.id,
  };
}

function roomView(room: ServerRoom): RoomView {
  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map((p) => playerView(room, p)),
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    paused: room.paused,
    speed: room.speed,
    raceKind: room.raceKind,
    totalLaps: room.race?.totalLaps ?? null,
    careerPhase: room.career?.phase ?? null,
    raceId: room.race ? `${room.code}:${room.raceKind}` : null,
  };
}

function activeQualifying(room: ServerRoom): QualifyingSessionState | null {
  if (!room.career) return null;
  return room.career.rounds[room.career.roundIndex]?.qualifyingSession ?? null;
}

function ensureQualifyingSession(room: ServerRoom): void {
  const career = room.career;
  if (!career) return;
  if (career.phase !== "qualifying" && career.phase !== "sprintQuali") return;
  const round = career.rounds[career.roundIndex];
  if (!round || round.qualifyingSession) return;
  const type = career.phase === "sprintQuali" ? "sprintQuali" : "quali";
  if (type === "sprintQuali" ? round.sprintQualifying : round.qualifying) return;
  startQualifyingSession(career, type);
}

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

function broadcast(room: ServerRoom, message: ServerMessage, except?: WebSocket): void {
  for (const ws of sockets) {
    const session = sessions.get(ws);
    if (!session || session.code !== room.code) continue;
    if (ws === except) continue;
    const player = room.players.find((p) => p.id === session.playerId);
    if (!player) continue;
    send(ws, message);
  }
}

function broadcastRoom(room: ServerRoom): void {
  for (const ws of sockets) {
    const session = sessions.get(ws);
    if (!session || session.code !== room.code) continue;
    const player = room.players.find((p) => p.id === session.playerId);
    if (!player) continue;
    send(ws, { type: "room_state", room: roomView(room), you: playerView(room, player) });
  }
}

function careerForPlayer(career: Career, teamId: string | null): Career {
  const copy = JSON.parse(JSON.stringify(career)) as Career;
  const ownTeam = teamId ?? "";
  for (const round of copy.rounds ?? []) {
    for (const driver of copy.drivers ?? []) {
      if (driver.teamId !== ownTeam) {
        if (round.raceStrategyPlans) delete round.raceStrategyPlans[driver.driverId];
        if (round.tyreInventory) delete round.tyreInventory[driver.driverId];
        if (round.strategyPlans) delete round.strategyPlans[driver.driverId];
      }
    }
  }
  return copy;
}

function broadcastCareer(room: ServerRoom): void {
  if (!room.career) return;
  for (const ws of sockets) {
    const session = sessions.get(ws);
    if (!session || session.code !== room.code) continue;
    const player = room.players.find((entry) => entry.id === session.playerId);
    if (!player) continue;
    send(ws, { type: "career_state", career: careerForPlayer(room.career, player.teamId) });
  }
}

function broadcastRace(room: ServerRoom): void {
  if (!room.race) return;
  for (const ws of sockets) {
    const session = sessions.get(ws);
    if (!session || session.code !== room.code) continue;
    const player = room.players.find((p) => p.id === session.playerId);
    if (!player) continue;
    const visibleTeams = player.teamId ? [player.teamId] : [];
    const view = buildRaceView(room.race, visibleTeams);
    send(ws, {
      type: "race_view",
      view: { ...view, playerTeams: visibleTeams },
      kind: room.raceKind ?? "race",
      paused: room.paused,
      speed: room.speed,
      totalLaps: room.race.totalLaps,
    });
  }
}

function broadcastQualifying(room: ServerRoom): void {
  const session = activeQualifying(room);
  if (!session) return;
  const view = buildQualifyingView(session);
  broadcast(room, { type: "qualifying_view", view, paused: room.paused, speed: room.speed });
}

function sendAuth(ws: WebSocket, room: ServerRoom, player: ServerPlayer): void {
  sessions.set(ws, { code: room.code, playerId: player.id });
  send(ws, { type: "room_state", room: roomView(room), you: playerView(room, player), token: player.token });
  if (room.career) send(ws, { type: "career_state", career: careerForPlayer(room.career, player.teamId) });
  const quali = activeQualifying(room);
  if (quali) send(ws, { type: "qualifying_view", view: buildQualifyingView(quali), paused: room.paused, speed: room.speed });
  if (room.race) {
    const visibleTeams = player.teamId ? [player.teamId] : [];
    send(ws, {
      type: "race_view",
      view: { ...buildRaceView(room.race, visibleTeams), playerTeams: visibleTeams },
      kind: room.raceKind ?? "race",
      paused: room.paused,
      speed: room.speed,
      totalLaps: room.race.totalLaps,
    });
  }
}

function findRoomPlayer(ws: WebSocket): { room: ServerRoom; player: ServerPlayer } | null {
  const session = sessions.get(ws);
  if (!session) return null;
  const room = rooms.get(session.code);
  if (!room) return null;
  const player = room.players.find((p) => p.id === session.playerId);
  if (!player) return null;
  return { room, player };
}

function touch(room: ServerRoom): void {
  room.updatedAt = new Date().toISOString();
}

function startCareer(room: ServerRoom): string | null {
  if (room.players.length === 0) return "Nenhum jogador na sala.";
  if (room.players.some((p) => !p.teamId)) return "Todos os jogadores precisam escolher uma equipe.";
  if (room.players.some((p) => !p.ready)) return "Todos os jogadores precisam estar prontos.";
  const teams = room.players.map((p) => p.teamId!) as string[];
  if (new Set(teams).size !== teams.length) return "Há equipes duplicadas.";
  room.career = createCareer({
    nome: `Sala ${room.code}`,
    modo: "multi",
    playerTeams: teams,
    seed: `room-${room.code}-${Date.now().toString(36)}`,
    id: `career_${room.code}`,
  });
  room.phase = "career";
  room.paused = false;
  room.speed = 1;
  touch(room);
  persist(room, true);
  broadcastRoom(room);
  broadcastCareer(room);
  return null;
}

function startRace(room: ServerRoom, kind: "race" | "sprint"): string | null {
  if (!room.career) return "Carreira não iniciada.";
  if (activeQualifying(room)) return "Conclua a classificação antes de iniciar a corrida.";
  if (kind === "sprint" && room.career.phase !== "sprint") return "Fase inválida para Sprint.";
  if (kind === "race" && room.career.phase !== "race") return "Fase inválida para corrida.";
  try {
    room.race = makeRaceForCurrentRound(room.career, kind);
    const testLaps = Number(process.env.CM_RACE_LAPS ?? 0);
    if (testLaps > 0) room.race.totalLaps = Math.min(room.race.totalLaps, testLaps);
    room.raceKind = kind;
    room.paused = false;
    room.speed = 1;
    room.acc = 0;
    room.lastTick = Date.now();
    room.career.raceInProgress = null;
    touch(room);
    persist(room, true);
    broadcast(room, { type: "race_started", kind, totalLaps: room.race.totalLaps });
    broadcastRace(room);
    broadcastRoom(room);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Falha ao iniciar a corrida.";
  }
}

function finishServerRace(room: ServerRoom): void {
  if (!room.race || !room.career || !room.raceKind) return;
  const kind = room.raceKind;
  const result: SessionResult = sessionResultFromRace(room.career, room.race, kind);
  applySessionResult(room.career, result, kind);
  room.race = null;
  room.raceKind = null;
  room.paused = false;
  if (room.career.phase === "qualifying" || room.career.phase === "sprintQuali") {
    room.speed = 20;
    room.acc = 0;
    room.lastTick = Date.now();
  }
  touch(room);
  persist(room, true);
  broadcast(room, { type: "race_finished", result, kind });
  broadcastCareer(room);
  broadcastRoom(room);
  broadcastQualifying(room);
  console.log(`[corrida] sala ${room.code}: ${kind} concluído, fase ${room.career.phase}.`);
}

function finishServerQualifying(room: ServerRoom): void {
  const session = activeQualifying(room);
  if (!room.career || !session || session.status !== "finished") return;
  const result = completeQualifyingSession(room.career, session);
  room.paused = false;
  touch(room);
  persist(room, true);
  broadcast(room, { type: "qualifying_finished", sessionType: session.type, grid: result.grid });
  broadcastCareer(room);
  broadcastRoom(room);
  console.log(`[classificação] sala ${room.code}: ${session.type} concluída.`);
}

function hostAction(room: ServerRoom, player: ServerPlayer, action: ClientMessage & { type: "career_action" }): void {
  const isHost = room.players[0]?.id === player.id;
  const phaseTransitions = new Set(["enterPrep", "enterPractice", "finishPractice", "enterRace", "continue"]);
  if (phaseTransitions.has(action.action.type) && !isHost) {
    sendToPlayer(room, player, { type: "error", message: "Somente o host pode avançar as sessões." });
    return;
  }
  if (!room.career) return;
  const res = dispatchCareerAction(room.career, action.action, player.teamId ? [player.teamId] : []);
  if (!res.ok) {
    sendToPlayer(room, player, { type: "error", message: res.error ?? "Ação rejeitada." });
    return;
  }
  touch(room);
  if (action.action.type === "enterRace") {
    const err = startRace(room, action.action.kind);
    if (err) sendToPlayer(room, player, { type: "error", message: err });
    else broadcastCareer(room);
  } else {
    if (action.action.type === "finishPractice") {
      room.paused = false;
      room.speed = Math.max(room.speed, 20);
      room.acc = 0;
      room.lastTick = Date.now();
    }
    broadcastCareer(room);
    broadcastRoom(room);
    if (action.action.type === "finishPractice") broadcastQualifying(room);
  }
  if (action.action.type === "save") sendToPlayer(room, player, { type: "saved" });
  persist(room, true);
}

function sendToPlayer(room: ServerRoom, player: ServerPlayer, message: ServerMessage): void {
  for (const ws of sockets) {
    const session = sessions.get(ws);
    if (session?.code === room.code && session.playerId === player.id) send(ws, message);
  }
}

function handleMessage(ws: WebSocket, msg: ClientMessage): void {
  if (msg.type === "ping") {
    send(ws, { type: "pong" });
    return;
  }

  if (msg.type === "create_room") {
    if (rooms.size >= 500) {
      send(ws, { type: "error", message: "Servidor cheio. Tente novamente mais tarde." });
      return;
    }
    const name = String(msg.name ?? "").trim().slice(0, 24) || "Host";
    const code = makeCode();
    const player: ServerPlayer = {
      id: id("player"),
      token: token(),
      name,
      teamId: null,
      ready: false,
      connected: true,
      joinedAt: new Date().toISOString(),
    };
    const room: ServerRoom = {
      code,
      phase: "lobby",
      players: [player],
      career: null,
      race: null,
      raceKind: null,
      paused: false,
      speed: 1,
      acc: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastSaved: 0,
    };
    rooms.set(code, room);
    sendAuth(ws, room, player);
    persist(room, true);
    console.log(`[salas] ${code} criada por ${name}.`);
    return;
  }

  if (msg.type === "join_room") {
    const code = String(msg.code ?? "").trim().toUpperCase();
    if (!isValidRoomCode(code)) {
      send(ws, { type: "error", message: "Código de sala inválido." });
      return;
    }
    const room = rooms.get(code);
    if (!room) {
      send(ws, { type: "error", message: "Sala não encontrada." });
      return;
    }
    if (room.phase !== "lobby") {
      send(ws, { type: "error", message: "A partida já começou. Use o código e o token para reconectar." });
      return;
    }
    if (room.players.length >= 3) {
      send(ws, { type: "error", message: "Sala cheia (máximo de 3 jogadores)." });
      return;
    }
    const name = String(msg.name ?? "").trim().slice(0, 24) || "Jogador";
    const player: ServerPlayer = {
      id: id("player"),
      token: token(),
      name,
      teamId: null,
      ready: false,
      connected: true,
      joinedAt: new Date().toISOString(),
    };
    room.players.push(player);
    touch(room);
    sendAuth(ws, room, player);
    broadcastRoom(room);
    persist(room, true);
    console.log(`[salas] ${name} entrou na sala ${code}.`);
    return;
  }

  if (msg.type === "reconnect") {
    const code = String(msg.code ?? "").trim().toUpperCase();
    if (!isValidRoomCode(code) || !isValidToken(msg.token)) {
      send(ws, { type: "error", message: "Credenciais de reconexão inválidas." });
      return;
    }
    const room = rooms.get(code);
    if (!room) {
      send(ws, { type: "error", message: "Sala não encontrada no servidor." });
      return;
    }
    const player = room.players.find((p) => p.token === msg.token);
    if (!player) {
      send(ws, { type: "error", message: "Token de reconexão inválido." });
      return;
    }
    player.connected = true;
    touch(room);
    sendAuth(ws, room, player);
    broadcastRoom(room);
    persist(room, true);
    console.log(`[salas] ${player.name} reconectou em ${code}.`);
    return;
  }

  const found = findRoomPlayer(ws);
  if (!found) {
    send(ws, { type: "error", message: "Sessão não identificada. Crie, entre ou reconecte em uma sala." });
    return;
  }
  const { room, player } = found;

  switch (msg.type) {
    case "pick_team": {
      if (room.phase !== "lobby") {
        send(ws, { type: "error", message: "A seleção de equipe já foi encerrada." });
        return;
      }
      if (!TEAM_BY_ID[msg.teamId]) {
        send(ws, { type: "error", message: "Equipe inválida." });
        return;
      }
      if (room.players.some((p) => p.id !== player.id && p.teamId === msg.teamId)) {
        send(ws, { type: "error", message: "Equipe já escolhida por outro jogador." });
        return;
      }
      player.teamId = msg.teamId;
      player.ready = false;
      touch(room);
      broadcastRoom(room);
      persist(room, true);
      return;
    }
    case "set_ready": {
      player.ready = !!msg.ready && !!player.teamId;
      touch(room);
      broadcastRoom(room);
      persist(room, true);
      return;
    }
    case "start_career": {
      if (room.players[0]?.id !== player.id) {
        send(ws, { type: "error", message: "Somente o host pode iniciar a carreira." });
        return;
      }
      const err = startCareer(room);
      if (err) send(ws, { type: "error", message: err });
      return;
    }
    case "career_action": {
      hostAction(room, player, msg);
      return;
    }
    case "qualifying_command": {
      const session = activeQualifying(room);
      if (!session) {
        send(ws, { type: "error", message: "Nenhuma classificação em andamento." });
        return;
      }
      if (room.paused) {
        send(ws, { type: "error", message: "A classificação está pausada." });
        return;
      }
      const res = applyQualifyingCommand(session, msg.command, player.teamId);
      if (!res.ok) send(ws, { type: "error", message: res.error ?? "Comando rejeitado." });
      else {
        touch(room);
        broadcastQualifying(room);
        persist(room);
      }
      return;
    }
    case "qualifying_control": {
      if (room.players[0]?.id !== player.id) {
        send(ws, { type: "error", message: "Somente o host controla a classificação." });
        return;
      }
      const session = activeQualifying(room);
      if (!session) return;
      if (msg.action === "pause") room.paused = true;
      else if (msg.action === "resume") room.paused = false;
      else if (msg.action === "speed") {
        if (msg.value && QUALIFYING_SPEEDS.includes(msg.value)) room.speed = msg.value;
      } else if (msg.action === "next") {
        const res = advanceQualifyingSegment(session);
        if (!res.ok) send(ws, { type: "error", message: res.error ?? "Não é possível avançar." });
        else broadcastCareer(room);
      } else if (msg.action === "skip") {
        simulateQualifyingToEnd(session);
        finishServerQualifying(room);
        return;
      }
      room.lastTick = Date.now();
      touch(room);
      broadcastRoom(room);
      broadcastQualifying(room);
      persist(room, true);
      return;
    }
    case "race_command": {
      if (!room.race || !room.career) {
        send(ws, { type: "error", message: "Nenhuma corrida em andamento." });
        return;
      }
      const car = room.race.cars.find((c) => c.driverId === msg.command.driverId);
      if (!car || car.teamId !== player.teamId) {
        send(ws, { type: "error", message: "Você só pode comandar seus próprios pilotos." });
        return;
      }
      const res = applyRaceCommand(room.race, msg.command);
      if (!res.ok) send(ws, { type: "error", message: res.reason ?? "Comando rejeitado." });
      persist(room);
      return;
    }
    case "race_control": {
      if (room.players[0]?.id !== player.id) {
        send(ws, { type: "error", message: "Somente o host controla pausa e velocidade." });
        return;
      }
      if (!room.race) return;
      if (msg.action === "pause") room.paused = true;
      else if (msg.action === "resume") room.paused = false;
      else if (msg.action === "speed") {
        const allowed = [1, 2, 5, 10, 20, 50];
        if (msg.value && allowed.includes(msg.value)) room.speed = msg.value;
      }
      room.lastTick = Date.now();
      touch(room);
      broadcastRoom(room);
      broadcastRace(room);
      persist(room, true);
      return;
    }
    case "leave": {
      if (room.phase === "career" && room.career && player.teamId) {
        const team = room.career.teams.find((t) => t.teamId === player.teamId);
        if (team) team.ai = true;
        const session = activeQualifying(room);
        if (session) setQualifyingTeamAI(session, player.teamId, true);
        room.career.playerTeams = room.career.playerTeams.filter((id) => id !== player.teamId);
        if (room.race) room.race.playerTeams = room.race.playerTeams.filter((id) => id !== player.teamId);
        broadcastCareer(room);
      }
      room.players = room.players.filter((p) => p.id !== player.id);
      if (room.players.length === 0) {
        rooms.delete(room.code);
        deleteRoomFile(room.code);
      } else {
        broadcastRoom(room);
        persist(room, true);
      }
      sessions.delete(ws);
      return;
    }
    default:
      return;
  }
}

const server = http.createServer((req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (url.pathname === "/api/health") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, version: "1.3.3", time: new Date().toISOString() }));
    return;
  }
  if (url.pathname === "/api/rooms") {
    if (process.env.CM_EXPOSE_ROOMS !== "1") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store", "x-room-list": "disabled" });
      res.end(JSON.stringify([]));
      return;
    }
    const list = [...rooms.values()].map((room) => ({
      code: room.code,
      players: room.players.length,
      phase: room.phase,
      updatedAt: room.updatedAt,
      teams: room.players.map((p) => p.teamId).filter(Boolean),
      careerPhase: room.career?.phase ?? null,
    }));
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(list));
    return;
  }
  if (url.pathname.startsWith("/api/rooms/")) {
    if (process.env.CM_EXPOSE_ROOMS !== "1") {
      res.writeHead(403, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ error: "room_list_disabled" }));
      return;
    }
    const code = url.pathname.split("/").pop()?.toUpperCase() ?? "";
    const room = rooms.get(code);
    res.writeHead(room ? 200 : 404, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(room ? { code: room.code, players: room.players.length, phase: room.phase, career: !!room.career, careerPhase: room.career?.phase ?? null } : { error: "not_found" }));
    return;
  }
  serveStatic(req, res);
});

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): void {
  const dist = path.resolve(process.cwd(), "dist");
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let filePath = path.join(dist, urlPath === "/" ? "index.html" : urlPath);
  const normalized = path.resolve(filePath);
  if (!normalized.startsWith(path.resolve(dist))) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(normalized) || fs.statSync(normalized).isDirectory()) {
    filePath = path.join(dist, "index.html");
    if (!fs.existsSync(filePath)) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(
        `<html><body style="font-family:system-ui;background:#0b0e14;color:#e6e9ef;padding:40px"><h1>Corrida Manager — servidor online</h1><p>O build do cliente ainda não existe. Rode <code>npm run build</code> ou use <code>npm run dev</code> durante o desenvolvimento.</p><p>API: <a style="color:#ffd166" href="/api/health">/api/health</a></p></body></html>`,
      );
      return;
    }
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "content-type": MIME[ext] ?? "application/octet-stream",
    "cache-control": ext === ".html" ? "no-cache" : "public, max-age=3600",
  });
  fs.createReadStream(filePath).pipe(res);
}

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_PAYLOAD, perMessageDeflate: false });

interface WsGuard {
  alive: boolean;
  windowStart: number;
  messages: number;
}
const wsGuards = new WeakMap<WebSocket, WsGuard>();

server.on("upgrade", (req, socket, head) => {
  let pathname = "";
  try {
    pathname = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`).pathname;
  } catch {
    rejectUpgrade(socket, 400, "Bad Request");
    return;
  }
  if (pathname !== "/ws") {
    rejectUpgrade(socket, 404, "Not Found");
    return;
  }
  if (!isOriginAllowed(req)) {
    console.warn(`[ws] origem rejeitada: ${req.headers.origin ?? "(ausente)"} host=${req.headers.host ?? "?"}`);
    rejectUpgrade(socket, 403, "Forbidden");
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

wss.on("connection", (ws, req) => {
  sockets.add(ws);
  wsGuards.set(ws, { alive: true, windowStart: Date.now(), messages: 0 });
  const remote = req.headers["cf-connecting-ip"] ?? req.socket.remoteAddress ?? "?";
  console.log(`[ws] conexão ${remote} origem=${req.headers.origin ?? "ausente"}`);

  ws.on("pong", () => {
    const guard = wsGuards.get(ws);
    if (guard) guard.alive = true;
  });

  ws.on("message", (raw) => {
    const guard = wsGuards.get(ws);
    if (guard) {
      const now = Date.now();
      if (now - guard.windowStart > 10_000) {
        guard.windowStart = now;
        guard.messages = 0;
      }
      guard.messages += 1;
      if (guard.messages > 400) {
        ws.close(1008, "Muitas mensagens");
        return;
      }
    }
    const data = Array.isArray(raw) ? Buffer.concat(raw) : Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    if (data.length > MAX_WS_PAYLOAD) {
      ws.close(1009, "Mensagem grande");
      return;
    }
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString()) as ClientMessage;
    } catch {
      send(ws, { type: "error", message: "Mensagem inválida." });
      return;
    }
    if (!msg || typeof msg !== "object" || typeof msg.type !== "string") {
      send(ws, { type: "error", message: "Mensagem inválida." });
      return;
    }
    try {
      handleMessage(ws, msg);
    } catch (error) {
      console.error("[ws] erro ao processar mensagem", error);
      send(ws, { type: "error", message: "Erro interno ao processar a mensagem." });
    }
  });

  ws.on("close", () => {
    sockets.delete(ws);
    wsGuards.delete(ws);
    const session = sessions.get(ws);
    if (!session) return;
    const room = rooms.get(session.code);
    const player = room?.players.find((p) => p.id === session.playerId);
    if (room && player) {
      player.connected = false;
      touch(room);
      broadcastRoom(room);
      persist(room, true);
    }
  });
  ws.on("error", () => undefined);
});

// keepalive: detecta conexões mortas atrás de proxies/túneis
setInterval(() => {
  for (const ws of sockets) {
    const guard = wsGuards.get(ws);
    if (!guard) continue;
    if (!guard.alive) {
      ws.terminate();
      continue;
    }
    guard.alive = false;
    try {
      ws.ping();
    } catch {
      ws.terminate();
    }
  }
}, 30_000);

// loop autoritativo de simulação
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.race && room.race.status === "running" && !room.paused) {
      const dt = Math.min(0.5, Math.max(0, (now - (room.lastTick ?? now)) / 1000));
      room.lastTick = now;
      room.acc += dt * room.speed;
      let guard = 0;
      while (room.acc >= 0.25 && guard < 500 && room.race.status === "running") {
        advanceRace(room.race);
        room.acc -= 0.25;
        guard++;
      }
      if ((room.race.status as string) === "finished") finishServerRace(room);
      else persist(room);
      continue;
    }
    const session = activeQualifying(room);
    if (session && session.status === "finished") {
      finishServerQualifying(room);
      continue;
    }
    if (!session || session.status !== "running" || room.paused) continue;
    const dt = Math.min(0.5, Math.max(0, (now - (room.lastTick ?? now)) / 1000));
    room.lastTick = now;
    room.acc += dt * room.speed;
    let guard = 0;
    while (room.acc >= 0.25 && guard < 500 && session.status === "running") {
      advanceQualifyingSession(session, 0.25);
      room.acc -= 0.25;
      guard++;
    }
    if ((session.status as string) === "finished") finishServerQualifying(room);
    else persist(room);
  }
}, 50);

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.race) broadcastRace(room);
    else if (activeQualifying(room)) broadcastQualifying(room);
  }
}, 120);

// salvar periodicamente salas em corrida
setInterval(() => {
  for (const room of rooms.values()) if (room.race) persist(room, true);
}, 8000);

loadRooms();

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Porta ${PORT} já está em uso. Pare o outro processo ou use PORT=outra.`);
  } else {
    console.error("[http] erro no servidor:", error);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`\nCorrida Manager — servidor autoritativo`);
  console.log(`  Local:  http://localhost:${PORT}`);
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const net of list ?? []) {
      if (net.family === "IPv4" && !net.internal) console.log(`  LAN:    http://${net.address}:${PORT}`);
    }
  }
  console.log(`  WebSocket: /ws   (API: /api/health)`);
  if (PUBLIC_URL) console.log(`  Público: ${PUBLIC_URL}`);
  console.log(`  Para internet: npm run online (Cloudflare Quick Tunnel)\n`);
  if (process.env.CM_OPEN_BROWSER === "local") {
    console.log(`  Abrindo o navegador em http://localhost:${PORT}\n`);
    openBrowser(`http://localhost:${PORT}`);
  }
});
