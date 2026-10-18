import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import type { ClientMessage, RoomView, ServerMessage } from "../src/net/protocol";
import type { Career, RaceView } from "../src/engine/types";

const PORT = 8899 + Math.floor(Math.random() * 200);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "cm-rooms-"));
let server: ChildProcess | null = null;

class Client {
  ws: WebSocket;
  room: RoomView | null = null;
  career: Career | null = null;
  race: RaceView | null = null;
  token: string | null = null;
  errors: string[] = [];
  messages: ServerMessage[] = [];
  constructor() {
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Origin: BASE } });
    this.ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      this.messages.push(msg);
      if (msg.type === "room_state") {
        this.room = msg.room;
        this.token = msg.token ?? this.token;
      }
      if (msg.type === "career_state") this.career = msg.career;
      if (msg.type === "race_view") this.race = msg.view;
      if (msg.type === "error") this.errors.push(msg.message);
    });
  }
  async open(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise<void>((resolve, reject) => {
      this.ws.once("open", () => resolve());
      this.ws.once("error", reject);
    });
  }
  send(msg: ClientMessage): void {
    this.ws.send(JSON.stringify(msg));
  }
  close(): void {
    this.ws.close();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitUntil(fn: () => boolean, timeout = 12000, label = "condição"): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (fn()) return;
    await sleep(40);
  }
  throw new Error(`Timeout aguardando ${label}`);
}

beforeAll(async () => {
  server = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "server/index.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT), CM_DATA_DIR: DATA, CM_RACE_LAPS: "4" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const start = Date.now();
  while (Date.now() - start < 20000) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // servidor ainda subindo
    }
    await sleep(150);
  }
  throw new Error("Servidor de teste não iniciou");
});

afterAll(() => {
  server?.kill();
  try {
    fs.rmSync(DATA, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe("multiplayer autoritativo", () => {
  it("rejeita handshake de origem desconhecida e sem Origin", async () => {
    const expectRejected = (options: Record<string, unknown>) =>
      new Promise<number>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, options);
        const timer = setTimeout(() => {
          ws.terminate();
          reject(new Error("handshake não foi recusado"));
        }, 6000);
        ws.on("unexpected-response", (_req, res) => {
          clearTimeout(timer);
          ws.terminate();
          resolve(res.statusCode ?? 0);
        });
        ws.on("open", () => {
          clearTimeout(timer);
          ws.close();
          reject(new Error("handshake foi aceito"));
        });
        ws.on("error", () => undefined);
      });
    await expect(expectRejected({ headers: { Origin: "https://evil.example" } })).resolves.toBe(403);
    await expect(expectRejected({})).resolves.toBe(403);
  });

  it("aceita três jogadores, sincroniza a carreira, aplica comandos e conclui a corrida", async () => {
    const a = new Client();
    const b = new Client();
    const c = new Client();
    await Promise.all([a.open(), b.open(), c.open()]);

    a.send({ type: "create_room", name: "Ana" });
    await waitUntil(() => !!a.room, 6000, "sala criada");
    const code = a.room!.code;
    expect(code).toHaveLength(5);

    b.send({ type: "join_room", code, name: "Bruno" });
    c.send({ type: "join_room", code, name: "Carla" });
    await waitUntil(() => a.room?.players.length === 3 && b.room?.players.length === 3 && c.room?.players.length === 3, 6000, "três jogadores");

    const hostId = a.room!.players.find((p) => p.isHost)!.id;
    expect(hostId).toBe(a.room!.players[0].id);

    const teams = ["team_mclaren", "team_ferrari", "team_mercedes"];
    a.send({ type: "pick_team", teamId: teams[0] });
    b.send({ type: "pick_team", teamId: teams[1] });
    c.send({ type: "pick_team", teamId: teams[2] });
    await waitUntil(() => [a, b, c].every((x) => x.room?.players.every((p) => p.teamId)), 6000, "equipes escolhidas");
    const chosen = a.room!.players.map((p) => p.teamId).filter(Boolean) as string[];
    expect(new Set(chosen).size).toBe(3);

    a.send({ type: "set_ready", ready: true });
    b.send({ type: "set_ready", ready: true });
    c.send({ type: "set_ready", ready: true });
    await waitUntil(() => [a, b, c].every((x) => x.room?.players.every((p) => p.ready)), 6000, "prontos");

    a.send({ type: "start_career" });
    await waitUntil(() => [a, b, c].every((x) => x.career?.playerTeams.length === 3), 8000, "carreira criada");
    const cid = a.career!.id;
    expect(b.career!.id).toBe(cid);
    expect(c.career!.id).toBe(cid);
    expect(new Set(a.career!.playerTeams).size).toBe(3);

    const otherDriver = a.career!.drivers.find((d) => d.teamId === "team_ferrari")!.driverId;
    a.send({ type: "career_action", action: { type: "setSetup", driverId: otherDriver, patch: { downforce: 0.1 } } });
    await waitUntil(() => a.errors.some((e) => e.includes("permissão")), 3000, "bloqueio de setup alheio");

    // reconexão simples de Carla
    const tokenC = c.token!;
    c.close();
    await sleep(250);
    const c2 = new Client();
    await c2.open();
    c2.send({ type: "reconnect", code, token: tokenC });
    await waitUntil(() => !!c2.room?.players.some((p) => p.name === "Carla" && p.connected), 6000, "reconexão");
    expect(c2.career?.id).toBe(cid);

    // host avança até a classificação
    a.send({ type: "career_action", action: { type: "enterPrep" } });
    await waitUntil(() => [a, b, c2].every((x) => x.career?.phase === "prep"), 5000, "preparação");
    a.send({ type: "career_action", action: { type: "enterPractice" } });
    await waitUntil(() => [a, b, c2].every((x) => x.career?.phase === "practice"), 5000, "treino");
    a.send({ type: "career_action", action: { type: "finishPractice" } });
    await waitUntil(() => [a, b, c2].every((x) => x.career?.phase === "qualifying"), 8000, "classificação");
    expect(a.career!.rounds[0].qualifying?.grid).toHaveLength(22);

    // cliente não-host não pode controlar a corrida
    b.send({ type: "race_control", action: "pause" });
    await waitUntil(() => b.errors.some((e) => e.includes("host")), 3000, "bloqueio de controle");

    a.send({ type: "career_action", action: { type: "enterRace", kind: "race" } });
    await waitUntil(() => [a, b, c2].every((x) => x.race), 8000, "corrida iniciada");
    await waitUntil(() => [a, b, c2].every((x) => x.career?.phase === "race"), 5000, "fase de corrida sincronizada");
    const firstTick = a.race!.tick;
    expect(a.race!.cars).toHaveLength(22);
    expect(b.race!.cars).toHaveLength(22);
    expect(a.race!.playerTeams).toEqual(["team_mclaren"]);
    expect(b.race!.playerTeams).toEqual(["team_ferrari"]);
    expect(c2.race!.playerTeams).toEqual(["team_mercedes"]);

    // comanda o próprio piloto; o servidor aplica e todos veem
    const bDriver = b.career!.drivers.find((d) => d.teamId === "team_ferrari")!.driverId;
    a.send({ type: "race_command", command: { type: "pace", driverId: bDriver, value: "attack" } });
    await waitUntil(() => a.errors.some((e) => e.includes("próprios pilotos")), 3000, "bloqueio de comando alheio");
    b.send({ type: "race_command", command: { type: "pace", driverId: bDriver, value: "attack" } });
    await waitUntil(() => [a, b, c2].every((x) => x.race?.cars.find((car) => car.driverId === bDriver)?.pace === "attack"), 5000, "comando sincronizado");

    a.send({ type: "race_control", action: "speed", value: 50 });
    await waitUntil(() => [a, b, c2].every((x) => x.race && x.race.tick > firstTick + 4), 10000, "simulação avançando");

    // host pausa: os três clientes devem convergir para exatamente o mesmo estado
    a.send({ type: "race_control", action: "pause" });
    await waitUntil(() => [a, b, c2].every((x) => x.room?.paused === true), 3000, "pausa sincronizada");
    await sleep(300);
    const snapshot = (x: Client) => x.race!.cars.map((c) => `${c.position}:${c.driverId}:${c.lap}:${c.distance.toFixed(1)}`).join("|");
    await waitUntil(() => snapshot(a) === snapshot(b) && snapshot(b) === snapshot(c2), 5000, "estado idêntico após pausa");
    a.send({ type: "race_control", action: "resume" });

    const ticks = [a.race!.tick, b.race!.tick, c2.race!.tick];
    expect(Math.max(...ticks) - Math.min(...ticks)).toBeLessThan(20);

    await waitUntil(() => [a, b, c2].every((x) => x.career?.phase === "results"), 30000, "fim da corrida");
    expect(a.career!.results).toHaveLength(1);
    expect(b.career!.results[0].entries[0].driverId).toBe(a.career!.results[0].entries[0].driverId);
    expect(a.career!.standingsDrivers).toEqual(b.career!.standingsDrivers);
    expect(c2.career!.standingsDrivers).toEqual(a.career!.standingsDrivers);

    // estado final idêntico nos três clientes
    const signature = (career: Career) =>
      `${career.phase}:${career.roundIndex}:${career.results.length}:${Object.values(career.standingsConstructors).map((s) => s.points).join(",")}`;
    expect(signature(b.career!)).toBe(signature(a.career!));
    expect(signature(c2.career!)).toBe(signature(a.career!));

    a.send({ type: "leave" });
    b.send({ type: "leave" });
    c2.send({ type: "leave" });
    a.close();
    b.close();
    c2.close();
  }, 90000);
});
