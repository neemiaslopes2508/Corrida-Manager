import { describe, expect, it } from "vitest";
import { CIRCUIT_BY_ID } from "../src/data/season2026";
import { buildQualifyingInput, buildRaceConfig, createCareer } from "../src/engine/career";
import { simulateQualifying } from "../src/engine/qualifying";
import {
  advanceRace,
  createRaceState,
  deployRedFlag,
  deploySafetyCar,
  triggerLocalYellow,
} from "../src/engine/race";
import { buildTrack } from "../src/engine/track";
import type { RaceState } from "../src/engine/types";
import { simulateWithMetrics } from "./raceMetrics";

const CIRCUIT_INDEX = { melbourne: 0, shanghai: 1, suzuka: 2 } as const;

function raceFor(seed: string, laps = 6, circuit: keyof typeof CIRCUIT_INDEX = "melbourne", rain = 0): RaceState {
  const career = createCareer({ nome: "Teste V1.3.6C", modo: "solo", playerTeams: ["team_mclaren"], seed });
  career.roundIndex = CIRCUIT_INDEX[circuit];
  career.rounds[career.roundIndex].qualifying = simulateQualifying(buildQualifyingInput(career, "quali"));
  const config = buildRaceConfig(career, "race");
  config.totalLaps = laps;
  config.weather = [{ fromLap: 0, rain, airTemp: 20, trackTemp: rain > 0.3 ? 28 : 36 }];
  config.initialTrackStatus = "green";
  config.playerTeams = [];
  return createRaceState(config);
}

function armAttack(state: RaceState, passerId: string, passedId: string): void {
  const passer = state.cars.find((car) => car.driverId === passerId)!;
  const passed = state.cars.find((car) => car.driverId === passedId)!;
  passer.attacking = true;
  passer.targetDriverId = passed.driverId;
  passer.attackStartedAt = state.elapsed;
  passer.disputePhase = "attempt";
  passer.passKind = "attack";
  passer.paceAdvantageTicks = 6;
  passer.defendingUntil = state.elapsed + 30;
  passer.distance = passed.distance - 2;
}

describe("V1.3.6C — amarela local", () => {
  it("cria amarela por setor sem neutralizar o circuito inteiro", () => {
    const state = raceFor("v136c-yellow");
    const car = state.cars[4];
    triggerLocalYellow(state, car, "Saída de pista");
    expect(state.trackStatus).toBe("green");
    expect(state.yellowZones).toHaveLength(1);
    expect(state.yellowZones[0].sector).toBeGreaterThanOrEqual(1);
    expect(state.yellowZones[0].sector).toBeLessThanOrEqual(3);
    expect(state.events.some((event) => event.type === "yellow" && event.sector === state.yellowZones[0].sector)).toBe(true);
  });

  it("bloqueia ultrapassagem na zona amarela", () => {
    const state = raceFor("v136c-yellow-pass");
    const track = buildTrack(CIRCUIT_BY_ID[state.circuitId]);
    const passed = state.cars[0];
    const passer = state.cars[1];
    const distance = track.sectorDistance[0] * 0.5;
    passed.distance = distance;
    passer.distance = distance - 2;
    passed.lap = 0;
    passer.lap = 0;
    state.elapsed = 1;
    triggerLocalYellow(state, passed, "Teste de zona");
    armAttack(state, passer.driverId, passed.driverId);
    for (let i = 0; i < 20; i++) advanceRace(state);
    expect(state.events.some((event) => event.type === "overtake" && event.driverId === passer.driverId)).toBe(false);
  });
});

describe("V1.3.6C — Safety Car, VSC e relargada", () => {
  it("mantém Safety Car sem passes, preserva a ordem e retorna com relargada", () => {
    const state = raceFor("v136c-sc", 10);
    for (const car of state.cars) {
      car.pit.requested = false;
      car.pit.plannedLap = null;
      car.strategy.plannedPitLap = null;
      car.tyre.ageLaps = 1;
    }
    const beforeOrder = state.cars
      .filter((car) => car.status === "running")
      .sort((a, b) => a.position - b.position)
      .map((car) => car.driverId);
    deploySafetyCar(state, true);
    expect(state.trackStatus).toBe("sc");
    expect(state.trackStatusUntilLap).not.toBeNull();
    armAttack(state, state.cars[1].driverId, state.cars[0].driverId);
    for (let i = 0; i < 20; i++) advanceRace(state);
    expect(state.trackStatus).toBe("sc");
    expect(state.events.some((event) => event.type === "overtake" && event.driverId === state.cars[1].driverId)).toBe(false);
    const afterOrder = state.cars
      .filter((car) => car.status === "running")
      .sort((a, b) => a.position - b.position)
      .map((car) => car.driverId);
    expect(afterOrder).toEqual(beforeOrder);
    state.trackStatusUntil = state.elapsed;
    state.trackStatusUntilLap = null;
    advanceRace(state);
    expect(state.trackStatus).toBe("green");
    expect(state.restartUntil).toBeGreaterThan(state.elapsed);
    armAttack(state, state.cars[1].driverId, state.cars[0].driverId);
    for (let i = 0; i < 3; i++) advanceRace(state);
    expect(state.events.some((event) => event.type === "overtake" && event.driverId === state.cars[1].driverId)).toBe(false);
  });

  it("mantém VSC com ritmo reduzido e sem passes", () => {
    const state = raceFor("v136c-vsc", 10, "suzuka");
    deploySafetyCar(state, false);
    expect(state.trackStatus).toBe("vsc");
    armAttack(state, state.cars[1].driverId, state.cars[0].driverId);
    for (let i = 0; i < 12; i++) advanceRace(state);
    expect(state.trackStatus).toBe("vsc");
    expect(state.events.some((event) => event.type === "overtake" && event.driverId === state.cars[1].driverId)).toBe(false);
  });
});

describe("V1.3.6C — bandeira vermelha", () => {
  it("suspende o relógio, congela carros e preserva a ordem", () => {
    const state = raceFor("v136c-red", 10);
    const before = state.cars.map((car) => ({ position: car.position, distance: car.distance }));
    const beforeElapsed = state.elapsed;
    deployRedFlag(state, "Acidente grave");
    expect(state.trackStatus).toBe("red");
    expect(state.redFlagReason).toContain("Acidente");
    for (let i = 0; i < 10; i++) advanceRace(state);
    expect(state.elapsed).toBe(beforeElapsed);
    expect(state.cars.map((car) => ({ position: car.position, distance: car.distance }))).toEqual(before);
    state.redFlagTicks = 1;
    advanceRace(state);
    expect(state.trackStatus).toBe("green");
    expect(state.restartUntil).toBeGreaterThan(state.elapsed);
    expect(state.events.some((event) => event.type === "red")).toBe(true);
  });
});

describe("V1.3.6C — bandeira azul e retardatários", () => {
  it("marca retardatário sob pressão e não conta passe sobre ele como posição", () => {
    const state = raceFor("v136c-blue", 10);
    const lapped = state.cars[4];
    const leader = state.cars[0];
    lapped.lap = 3;
    leader.lap = 4;
    state.leaderLap = 4;
    lapped.distance = 1000;
    leader.distance = 980;
    lapped.speed = 25;
    leader.speed = 55;
    advanceRace(state);
    expect(lapped.blueFlag).toBe(true);
    expect(state.events.some((event) => event.type === "blue" && event.driverId === lapped.driverId)).toBe(true);
    leader.distance = lapped.distance - 8;
    leader.speed = 65;
    leader.attacking = true;
    leader.targetDriverId = lapped.driverId;
    leader.attackStartedAt = state.elapsed;
    leader.disputePhase = "attempt";
    leader.passKind = "pace";
    leader.paceAdvantageTicks = 5;
    leader.defendingUntil = state.elapsed + 20;
    const events = advanceRace(state);
    expect(events.some((event) => event.type === "overtake" && event.passedDriverId === lapped.driverId)).toBe(false);
  });
});

describe("V1.3.6C — danos e compatibilidade", () => {
  it("repara danos no pit stop e adiciona tempo de serviço", () => {
    const state = raceFor("v136c-repair", 8);
    const car = state.cars[0];
    const track = buildTrack(CIRCUIT_BY_ID[state.circuitId]);
    car.damage = 0.4;
    car.distance = track.length * 0.99;
    car.lap = 0;
    car.pit.state = "entering";
    state.elapsed = 1;
    advanceRace(state);
    expect(car.damage).toBeLessThan(0.4);
    expect(car.pit.serviceTime).toBeGreaterThan(2);
    expect(state.events.some((event) => event.type === "pit" && event.message.includes("reparo"))).toBe(true);
  });

  it("mantém incidentes de chuva sem passes sob bandeira", () => {
    const metrics = simulateWithMetrics(raceFor("v136c-rain", 12, "suzuka", 0.65));
    expect(metrics.scPasses).toBe(0);
    expect(metrics.yellowPasses).toBe(0);
    expect(metrics.incidents).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(metrics.maxDamage)).toBe(true);
    expect(metrics.maxDamage).toBeGreaterThanOrEqual(0);
    expect(metrics.maxDamage).toBeLessThanOrEqual(1);
  });

  it("inicializa campos de bandeiras em saves antigos", () => {
    const state = raceFor("v136c-legacy", 2);
    const car = state.cars[0] as unknown as Record<string, unknown>;
    delete car.blueFlag;
    delete (state as unknown as Record<string, unknown>).yellowZones;
    delete (state as unknown as Record<string, unknown>).redFlagTicks;
    delete (state as unknown as Record<string, unknown>).redFlagReason;
    delete (state as unknown as Record<string, unknown>).restartUntil;
    advanceRace(state);
    expect(state.yellowZones).toEqual([]);
    expect(state.redFlagTicks).toBe(0);
    expect(state.redFlagReason).toBeNull();
    expect(state.restartUntil).toBe(0);
    expect(state.cars[0].blueFlag).toBe(false);
  });
});
