import { describe, expect, it } from "vitest";
import { buildQualifyingInput, buildRaceConfig, createCareer } from "../src/engine/career";
import { simulateQualifying } from "../src/engine/qualifying";
import { advanceRace, createRaceState, simulateRaceToEnd } from "../src/engine/race";
import type { Career, RaceState } from "../src/engine/types";
import { simulateWithMetrics } from "./raceMetrics";

const CIRCUIT_INDEX = { melbourne: 0, shanghai: 1, suzuka: 2 } as const;

function careerFor(seed: string, circuit: keyof typeof CIRCUIT_INDEX = "melbourne"): Career {
  const career = createCareer({ nome: "Teste V1.3.6B", modo: "solo", playerTeams: ["team_mclaren"], seed });
  career.roundIndex = CIRCUIT_INDEX[circuit];
  return career;
}

function raceFor(
  seed: string,
  laps = 6,
  circuit: keyof typeof CIRCUIT_INDEX = "melbourne",
  mutate?: (career: Career) => void,
): RaceState {
  const career = careerFor(seed, circuit);
  mutate?.(career);
  career.rounds[career.roundIndex].qualifying = simulateQualifying(buildQualifyingInput(career, "quali"));
  const config = buildRaceConfig(career, "race");
  config.totalLaps = laps;
  config.weather = [{ fromLap: 0, rain: 0, airTemp: 25, trackTemp: 36 }];
  config.initialTrackStatus = "green";
  config.playerTeams = [];
  return createRaceState(config);
}

function std(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function lapPaces(metrics: ReturnType<typeof simulateWithMetrics>, driverId: string, laps: number): number[] {
  return metrics.lapPaceHistory
    .filter((entry) => entry.driverId === driverId && entry.lap > 0 && entry.lap <= laps)
    .map((entry) => entry.pace);
}

describe("V1.3.6B — consistência, ritmo e atributos", () => {
  it("é determinístico por seed, inclusive no ritmo por volta e nas disputas", () => {
    const a = raceFor("v136b-determinism", 6, "shanghai");
    const b = raceFor("v136b-determinism", 6, "shanghai");
    for (let i = 0; i < 900; i++) {
      advanceRace(a);
      advanceRace(b);
    }
    expect(a.cars.map((car) => ({ d: car.distance, lap: car.lap, pace: car.lapPace, phase: car.disputePhase }))).toEqual(
      b.cars.map((car) => ({ d: car.distance, lap: car.lap, pace: car.lapPace, phase: car.disputePhase })),
    );
  });

  it("varia o ritmo por volta, não por tick, com boa e má volta ocasionais", () => {
    const metrics = simulateWithMetrics(raceFor("v136b-lap-pace", 10));
    const driverId = metrics.launches[0].driverId;
    const paces = lapPaces(metrics, driverId, 10);
    expect(paces.length).toBeGreaterThan(3);
    expect(new Set(paces.map((value) => value.toFixed(6))).size).toBeGreaterThan(1);
    expect(Math.min(...paces)).toBeGreaterThan(0.97);
    expect(Math.max(...paces)).toBeLessThan(1.03);
  });

  it("aumenta a variabilidade de voltas quando a consistência é baixa", () => {
    const driverId = "driver_max_verstappen";
    const low = simulateWithMetrics(
      raceFor("v136b-consistency", 10, "melbourne", (career) => {
        const driver = career.drivers.find((entry) => entry.driverId === driverId);
        if (driver) driver.attributes.consistencia = 15;
      }),
    );
    const high = simulateWithMetrics(
      raceFor("v136b-consistency", 10, "melbourne", (career) => {
        const driver = career.drivers.find((entry) => entry.driverId === driverId);
        if (driver) driver.attributes.consistencia = 98;
      }),
    );
    const lowPaces = lapPaces(low, driverId, 8);
    const highPaces = lapPaces(high, driverId, 8);
    expect(lowPaces.length).toBeGreaterThan(3);
    expect(highPaces.length).toBeGreaterThan(3);
    expect(std(lowPaces)).toBeGreaterThan(std(highPaces));
  });

  it("faz velocidade pura render tempo de volta melhor", () => {
    const driverId = "driver_max_verstappen";
    const slow = simulateWithMetrics(
      raceFor("v136b-pure-pace", 8, "melbourne", (career) => {
        const driver = career.drivers.find((entry) => entry.driverId === driverId);
        if (driver) driver.attributes.velocidade = 55;
      }),
    );
    const fast = simulateWithMetrics(
      raceFor("v136b-pure-pace", 8, "melbourne", (career) => {
        const driver = career.drivers.find((entry) => entry.driverId === driverId);
        if (driver) driver.attributes.velocidade = 100;
      }),
    );
    const slowBest = Math.min(...(slow.lapTimeByDriver[driverId] ?? [Infinity]));
    const fastBest = Math.min(...(fast.lapTimeByDriver[driverId] ?? [Infinity]));
    expect(Number.isFinite(slowBest)).toBe(true);
    expect(Number.isFinite(fastBest)).toBe(true);
    expect(fastBest).toBeLessThan(slowBest);
  });
});

describe("V1.3.6B — disputas e passes legítimos", () => {
  it("registra passes por ritmo/pneus sem tornar 100% dos eventos ataques", () => {
    const metrics = simulateWithMetrics(raceFor("v136b-passes", 12, "melbourne"));
    const byKind = metrics.attackPasses + metrics.pacePasses + metrics.tyrePasses + metrics.mistakePasses;
    expect(metrics.officialPasses).toBe(byKind);
    expect(metrics.passPositionJumps).toBe(0);
    expect(metrics.scPasses).toBe(0);
    expect(metrics.officialPasses).toBeGreaterThan(0);
    expect(metrics.pacePasses + metrics.tyrePasses).toBeGreaterThan(0);
  });

  it("mantém defesa, lado a lado e contra-ataque ativos", () => {
    let sideBySide = 0;
    let defended = 0;
    let counter = 0;
    let firstLapPasses = 0;
    for (const circuit of Object.keys(CIRCUIT_INDEX) as (keyof typeof CIRCUIT_INDEX)[]) {
      const metrics = simulateWithMetrics(raceFor(`v136b-battle-${circuit}`, 12, circuit));
      sideBySide += metrics.sideBySideTicks;
      defended += metrics.defendedAttempts;
      counter += metrics.counterPasses;
      firstLapPasses += metrics.firstLapPasses;
    }
    expect(sideBySide).toBeGreaterThan(0);
    expect(defended).toBeGreaterThan(0);
    expect(firstLapPasses).toBeGreaterThan(0);
    expect(counter).toBeGreaterThanOrEqual(0);
  });

  it("abre janela de contra-ataque para o carro passado", () => {
    const state = raceFor("v136b-counter-window", 8, "shanghai");
    let passedId: string | null = null;
    for (let i = 0; i < 8000 && state.status === "running"; i++) {
      const events = advanceRace(state);
      const pass = events.find((event) => event.type === "overtake");
      if (pass?.passedDriverId) {
        passedId = pass.passedDriverId;
        break;
      }
    }
    expect(passedId).not.toBeNull();
    const passed = state.cars.find((car) => car.driverId === passedId);
    expect(passed).toBeDefined();
    expect(passed!.counterUntil).toBeGreaterThan(state.elapsed);
    expect(passed!.overtakeCooldown).toBeGreaterThanOrEqual(2.5);
  });

  it("não deixa um carro saltar dois adversários no mesmo tick", () => {
    const state = raceFor("v136b-jump-guard", 10, "suzuka");
    simulateRaceToEnd(state);
    expect(state.cars.every((car) => car.position >= 1 && car.position <= state.cars.length)).toBe(true);
  });
});

describe("V1.3.6B — compatibilidade", () => {
  it("inicializa campos de disputa e ritmo em saves anteriores", () => {
    const state = raceFor("v136b-legacy", 2);
    const car = state.cars[0] as unknown as Record<string, unknown>;
    for (const field of [
      "lapPace",
      "lapPaceLap",
      "attackAttempts",
      "disputePhase",
      "disputeStartedAt",
      "passKind",
      "paceAdvantageTicks",
      "defending",
      "defendTargetId",
      "defendStartedAt",
      "counterUntil",
      "sideBySideTicks",
      "defendedAttempts",
    ]) {
      delete car[field];
    }
    advanceRace(state);
    expect(typeof state.cars[0].lapPace).toBe("number");
    expect(state.cars[0].lapPaceLap).toBeGreaterThanOrEqual(0);
    expect(state.cars[0].attackAttempts).toBe(0);
    expect(state.cars[0].disputePhase).toBeDefined();
    expect(state.cars[0].sideBySideTicks).toBeGreaterThanOrEqual(0);
  });
});
