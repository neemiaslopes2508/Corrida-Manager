import { describe, expect, it } from "vitest";
import { buildRaceConfig, createCareer } from "../src/engine/career";
import { advanceRace, createRaceState, updatePositions } from "../src/engine/race";
import type { RaceState } from "../src/engine/types";

function duelState(): { state: RaceState; passed: RaceState["cars"][number]; passer: RaceState["cars"][number] } {
  const career = createCareer({ nome: "Duelo", modo: "solo", playerTeams: ["team_mclaren"], seed: "overtake-duel" });
  const config = buildRaceConfig(career, "race");
  config.totalLaps = 5;
  config.weather = [{ fromLap: 0, rain: 0, airTemp: 25, trackTemp: 36 }];
  config.playerTeams = [];
  const state = createRaceState(config);
  const passed = state.cars[4];
  const passer = state.cars[5];
  for (const car of state.cars) {
    if (car !== passed && car !== passer) {
      car.status = "retired";
      car.speed = 0;
    }
  }
  for (const car of [passed, passer]) {
    car.status = "running";
    car.lap = 0;
    car.pit.state = "none";
    car.pit.timer = 0;
    car.energy = 85;
    car.attacking = false;
    car.targetDriverId = null;
    car.attackStartedAt = null;
    car.overtakeCooldown = 0;
    car.defendingUntil = 0;
  }
  passed.distance = 5000;
  passed.speed = 20;
  passer.distance = 4997;
  passer.speed = 65;
  passed.position = 1;
  passer.position = 2;
  updatePositions(state);
  return { state, passed, passer };
}

function armAttack(passer: RaceState["cars"][number], passed: RaceState["cars"][number], state: RaceState): void {
  passer.attacking = true;
  passer.targetDriverId = passed.driverId;
  passer.attackStartedAt = state.elapsed;
  passer.defendingUntil = state.elapsed + 5;
  passer.overtakeAttempts += 1;
}

function runUntilPass(state: RaceState, passerId: string): void {
  for (let tick = 0; tick < 30; tick++) {
    advanceRace(state);
    if (state.events.some((event) => event.type === "overtake" && event.driverId === passerId)) return;
  }
}

describe("ultrapassagens V1.3.4", () => {
  it("emite evento quando o carro atacado é realmente ultrapassado", () => {
    const { state, passed, passer } = duelState();
    armAttack(passer, passed, state);
    runUntilPass(state, passer.driverId);
    const events = state.events.filter((event) => event.type === "overtake");
    expect(events).toHaveLength(1);
    expect(events[0].driverId).toBe(passer.driverId);
    expect(events[0].passedDriverId).toBe(passed.driverId);
    expect(events[0].attackSuccess).toBe(true);
    expect(events[0].message).toContain("ultrapassa");
  });

  it("não registra ultrapassagem sob Safety Car/VSC", () => {
    const { state, passed, passer } = duelState();
    state.trackStatus = "sc";
    state.trackStatusUntil = state.elapsed + 100;
    state.trackStatusUntilLap = null;
    armAttack(passer, passed, state);
    for (let tick = 0; tick < 20; tick++) advanceRace(state);
    expect(state.events.filter((event) => event.type === "overtake")).toHaveLength(0);
    expect(passer.attacking).toBe(false);
  });

  it("não cria evento quando a posição é ganha com o rival no pit lane", () => {
    const { state, passed, passer } = duelState();
    passed.pit.state = "service";
    passed.pit.timer = 5;
    armAttack(passer, passed, state);
    runUntilPass(state, passer.driverId);
    expect(state.events.filter((event) => event.type === "overtake")).toHaveLength(0);
  });

  it("não cria evento quando o rival abandonou", () => {
    const { state, passed, passer } = duelState();
    passed.status = "retired";
    passed.speed = 0;
    updatePositions(state);
    armAttack(passer, passed, state);
    runUntilPass(state, passer.driverId);
    expect(state.events.filter((event) => event.type === "overtake")).toHaveLength(0);
  });

  it("não inicia ataque sem energia", () => {
    const { state, passed, passer } = duelState();
    passer.energy = 0;
    passer.attacking = false;
    passer.targetDriverId = null;
    const before = passer.overtakeAttempts;
    for (let tick = 0; tick < 20; tick++) advanceRace(state);
    expect(passer.overtakeAttempts).toBe(before);
  });

  it("inicializa campos novos em corridas antigas", () => {
    const { state, passed, passer } = duelState();
    const legacy = passer as unknown as Record<string, unknown>;
    delete legacy.targetDriverId;
    delete legacy.attackStartedAt;
    delete legacy.overtakeAttempts;
    advanceRace(state);
    expect(passer.targetDriverId === null || typeof passer.targetDriverId === "string").toBe(true);
    expect(passer.overtakeAttempts).toBeGreaterThanOrEqual(0);
    expect(passed.overtakeAttempts).toBeGreaterThanOrEqual(0);
  });
});
