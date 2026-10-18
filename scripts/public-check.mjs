import { WebSocket } from "ws";

const BASE = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!BASE) throw new Error("Uso: node scripts/public-check.mjs https://SEU-LINK.trycloudflare.com");
const WS_URL = `${BASE.replace(/^http/, "ws")}/ws`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUntil(fn, timeout = 15000, label = "condição") {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (fn()) return;
    await sleep(50);
  }
  throw new Error(`Timeout: ${label}`);
}

class Client {
  constructor(name) {
    this.name = name;
    this.room = null;
    this.career = null;
    this.race = null;
    this.token = null;
    this.errors = [];
    this.ws = new WebSocket(WS_URL, { headers: { Origin: BASE } });
    this.ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "room_state") {
        this.room = msg.room;
        this.token = msg.token ?? this.token;
      }
      if (msg.type === "career_state") this.career = msg.career;
      if (msg.type === "race_view") this.race = msg.view;
      if (msg.type === "error") this.errors.push(msg.message);
    });
  }
  open() {
    return new Promise((resolve, reject) => {
      this.ws.once("open", resolve);
      this.ws.once("error", reject);
    });
  }
  send(msg) {
    this.ws.send(JSON.stringify(msg));
  }
  close() {
    this.ws.close();
  }
}

// 1) origem desconhecida deve ser recusada no handshake
const rejected = await new Promise((resolve) => {
  const ws = new WebSocket(WS_URL, { headers: { Origin: "https://evil.example" } });
  const timer = setTimeout(() => resolve(false), 8000);
  ws.on("unexpected-response", (_req, res) => {
    clearTimeout(timer);
    ws.terminate();
    resolve(res.statusCode === 403);
  });
  ws.on("open", () => {
    clearTimeout(timer);
    ws.close();
    resolve(false);
  });
  ws.on("error", () => undefined);
});
if (!rejected) throw new Error("Origem desconhecida NÃO foi recusada");
console.log("origem desconhecida recusada: ok");

// 2) handshake sem Origin deve ser recusado por padrão
const noOrigin = await new Promise((resolve) => {
  const ws = new WebSocket(WS_URL);
  const timer = setTimeout(() => resolve(false), 8000);
  ws.on("unexpected-response", (_req, res) => {
    clearTimeout(timer);
    ws.terminate();
    resolve(res.statusCode === 403);
  });
  ws.on("open", () => {
    clearTimeout(timer);
    ws.close();
    resolve(false);
  });
  ws.on("error", () => undefined);
});
if (!noOrigin) throw new Error("Handshake sem Origin NÃO foi recusado");
console.log("handshake sem origin recusado: ok");

const a = new Client("Ana");
const b = new Client("Bruno");
const c = new Client("Carla");
await Promise.all([a.open(), b.open(), c.open()]);
a.send({ type: "create_room", name: "Ana" });
await waitUntil(() => !!a.room, 10000, "sala");
const code = a.room.code;
b.send({ type: "join_room", code, name: "Bruno" });
c.send({ type: "join_room", code, name: "Carla" });
await waitUntil(() => a.room?.players.length === 3 && b.room?.players.length === 3 && c.room?.players.length === 3, 10000, "3 jogadores");
const teams = ["team_mclaren", "team_ferrari", "team_mercedes"];
a.send({ type: "pick_team", teamId: teams[0] });
b.send({ type: "pick_team", teamId: teams[1] });
c.send({ type: "pick_team", teamId: teams[2] });
await waitUntil(() => a.room.players.filter((p) => p.teamId).length === 3, 8000, "equipes");
for (const x of [a, b, c]) x.send({ type: "set_ready", ready: true });
await waitUntil(() => a.room.players.every((p) => p.ready), 8000, "prontos");
a.send({ type: "start_career" });
await waitUntil(() => [a, b, c].every((x) => x.career?.playerTeams.length === 3), 10000, "carreira");

// reconexão de Carla
const tokenC = c.token;
c.close();
await sleep(300);
const c2 = new Client("Carla");
await c2.open();
c2.send({ type: "reconnect", code, token: tokenC });
await waitUntil(() => c2.room?.players.some((p) => p.name === "Carla" && p.connected), 10000, "reconexão");
if (c2.career?.id !== a.career.id) throw new Error("Carreira divergente após reconexão");
console.log("reconexão por token: ok");

a.send({ type: "career_action", action: { type: "enterPrep" } });
await waitUntil(() => [a, b, c2].every((x) => x.career?.phase === "prep"), 6000, "prep");
a.send({ type: "career_action", action: { type: "enterPractice" } });
await waitUntil(() => [a, b, c2].every((x) => x.career?.phase === "practice"), 6000, "practice");
a.send({ type: "career_action", action: { type: "finishPractice" } });
await waitUntil(() => [a, b, c2].every((x) => x.career?.phase === "qualifying"), 10000, "quali");
a.send({ type: "career_action", action: { type: "enterRace", kind: "race" } });
await waitUntil(() => [a, b, c2].every((x) => x.race), 10000, "race view");
await waitUntil(() => [a, b, c2].every((x) => x.career?.phase === "race"), 6000, "fase race");

const bDriver = b.career.drivers.find((d) => d.teamId === "team_ferrari").driverId;
b.send({ type: "race_command", command: { type: "pace", driverId: bDriver, value: "attack" } });
await waitUntil(() => [a, b, c2].every((x) => x.race.cars.find((car) => car.driverId === bDriver)?.pace === "attack"), 8000, "comando");
a.send({ type: "race_control", action: "pause" });
await waitUntil(() => [a, b, c2].every((x) => x.room?.paused === true), 6000, "pausa");
await sleep(300);
const snap = (x) => x.race.cars.map((car) => `${car.position}:${car.driverId}:${car.lap}:${car.distance.toFixed(1)}`).join("|");
await waitUntil(() => snap(a) === snap(b) && snap(b) === snap(c2), 6000, "estado idêntico");
console.log("pausa e estado idêntico: ok");
a.send({ type: "race_control", action: "resume" });
a.send({ type: "race_control", action: "speed", value: 50 });
await waitUntil(() => [a, b, c2].every((x) => x.career?.phase === "results"), 180000, "fim da corrida");
const signature = (x) => `${x.career.results.length}:${Object.values(x.career.standingsDrivers).map((s) => s.points).join(",")}`;
if (signature(a) !== signature(b) || signature(a) !== signature(c2)) throw new Error("Resultado final divergente");
console.log(JSON.stringify({
  ok: true,
  publicUrl: BASE,
  room: code,
  teams: a.career.playerTeams,
  phase: a.career.phase,
  results: a.career.results.length,
  top5: Object.entries(a.career.standingsDrivers)
    .sort((x, y) => y[1].points - x[1].points)
    .slice(0, 5)
    .map(([driverId, standing]) => ({ driverId, points: standing.points })),
  errors: { a: a.errors, b: b.errors, c: c2.errors },
}, null, 2));
for (const x of [a, b, c2]) { try { x.send({ type: "leave" }); x.close(); } catch {} }
setTimeout(() => process.exit(0), 300);
