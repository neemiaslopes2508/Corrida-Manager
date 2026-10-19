import { describe, expect, it } from "vitest";
import { buildRaceConfig, buildQualifyingInput, createCareer } from "../src/engine/career";
import { simulateQualifying } from "../src/engine/qualifying";
import { advanceRace, createRaceState, registerTrackLimitOffence, simulateRaceToEnd } from "../src/engine/race";
import type { RaceState } from "../src/engine/types";
import { simulateWithMetrics } from "./raceMetrics";

const CIRCUIT_INDEX = { melbourne: 0, shanghai: 1, suzuka: 2 } as const;

function raceFor(seed: string, laps = 4, circuit: keyof typeof CIRCUIT_INDEX = "melbourne"): RaceState {
  const career = createCareer({ nome: "Teste V1.3.6A", modo: "solo", playerTeams: ["team_mclaren"], seed });
  career.roundIndex = CIRCUIT_INDEX[circuit];
  const quali = simulateQualifying(buildQualifyingInput(career, "quali"));
  career.rounds[career.roundIndex].qualifying = quali;
  const config = buildRaceConfig(career, "race");
  config.totalLaps = laps;
  config.weather = [{ fromLap: 0, rain: 0, airTemp: 25, trackTemp: 36 }];
  config.initialTrackStatus = "green";
  return createRaceState(config);
}

describe("V1.3.6A — cronometragem precisa", () => {
  it("interpola o cruzamento da linha e não quantiza tempos de volta", () => {
    const metrics = simulateWithMetrics(raceFor("v136-timing", 3));
    expect(metrics.lapSamples).toBeGreaterThan(0);
    expect(metrics.inconsistentLapTimes).toBe(0);
    // Antes da V1.3.6A todos os tempos eram múltiplos exatos de 0,25 s.
    expect(metrics.lapTimeFractionalSteps.length).toBeGreaterThan(1);
    expect(metrics.lapTimeFractionalSteps.some((step) => step !== 0)).toBe(true);
  });

  it("mantém a soma dos setores coerente com o tempo de volta", () => {
    const metrics = simulateWithMetrics(raceFor("v136-sectors", 3));
    expect(metrics.sectorSumMaxError).toBeLessThan(0.02);
  });

  it("não duplica volta quando a linha é cruzada em ticks sucessivos", () => {
    const state = raceFor("v136-no-duplicate", 3);
    const laps = new Map(state.cars.map((car) => [car.driverId, 0]));
    for (let tick = 0; tick < 1200 && state.status === "running"; tick++) {
      advanceRace(state);
      for (const car of state.cars) {
        const previous = laps.get(car.driverId) ?? 0;
        expect(car.lap).toBeGreaterThanOrEqual(previous);
        expect(car.lap - previous).toBeLessThanOrEqual(1);
        expect(car.lapTimes.length).toBeLessThanOrEqual(car.lap);
        laps.set(car.driverId, car.lap);
      }
    }
    expect(state.cars.some((car) => car.lap > 0)).toBe(true);
  });
});

describe("V1.3.6A — largada individual", () => {
  it("gera perfis determinísticos para a mesma seed", () => {
    const a = simulateWithMetrics(raceFor("v136-launch", 1)).launches;
    const b = simulateWithMetrics(raceFor("v136-launch", 1)).launches;
    expect(a).toEqual(b);
  });

  it("varia entre pilotos sem quantidade fixa de largadas", () => {
    const launches = simulateWithMetrics(raceFor("v136-launch-variety", 1)).launches;
    expect(launches).toHaveLength(22);
    expect(new Set(launches.map((entry) => entry.reaction.toFixed(4))).size).toBeGreaterThan(5);
    const min = Math.min(...launches.map((entry) => entry.reaction));
    const max = Math.max(...launches.map((entry) => entry.reaction));
    expect(max - min).toBeGreaterThan(0.05);
    for (const entry of launches) {
      expect(entry.reaction).toBeGreaterThanOrEqual(0);
      expect(entry.traction).toBeGreaterThan(0.5);
      expect(entry.quality).toBeGreaterThanOrEqual(0);
      expect(entry.quality).toBeLessThanOrEqual(1);
    }
  });

  it("não privilegia o jogador nem equipes específicas", () => {
    // A largada depende apenas dos atributos e do RNG por piloto: recriar o
    // mesmo grid com outra equipe humana não muda os perfis dos demais.
    const a = simulateWithMetrics(raceFor("v136-fairness", 1)).launches;
    const careerB = createCareer({ nome: "Outro jogador", modo: "solo", playerTeams: ["team_haas"], seed: "v136-fairness" });
    const configB = buildRaceConfig(careerB, "race");
    configB.totalLaps = 1;
    configB.weather = [{ fromLap: 0, rain: 0, airTemp: 25, trackTemp: 36 }];
    const b = createRaceState(configB).cars.map((car) => ({ driverId: car.driverId, reaction: car.launchReaction }));
    for (const entry of b) {
      const same = a.find((item) => item.driverId === entry.driverId);
      if (same) expect(same.reaction).toBeCloseTo(entry.reaction, 6);
    }
  });
});

describe("V1.3.6A — primeira volta e ultrapassagens", () => {
  it("não registra passes sob bandeira e não deixa passes fantasma em cadeia", () => {
    for (const circuit of Object.keys(CIRCUIT_INDEX) as (keyof typeof CIRCUIT_INDEX)[]) {
      const metrics = simulateWithMetrics(raceFor(`v136-first-lap-${circuit}`, 6, circuit));
      expect(metrics.scPasses).toBe(0);
      expect(metrics.officialPasses).toBeGreaterThanOrEqual(0);
      // Todo passe oficial tem uma causa válida: ataque, ritmo, pneus ou erro.
      // Inversões por leitura defasada e passes em cadeia continuam proibidos.
      expect(metrics.officialPasses).toBe(
        metrics.attackPasses + metrics.pacePasses + metrics.tyrePasses + metrics.mistakePasses,
      );
    }
  });

  it("mantém o motor de ataques da V1.3.5 ativo", () => {
    const state = raceFor("v136-attacks", 10, "shanghai");
    simulateRaceToEnd(state);
    const attempts = state.cars.reduce((total, car) => total + car.overtakeAttempts, 0);
    expect(attempts).toBeGreaterThan(0);
  });
});

describe("V1.3.6A — penalidades progressivas", () => {
  it("adverte nas primeira e segunda infrações e pune na terceira", () => {
    const state = raceFor("v136-penalty", 1);
    const car = state.cars[0];
    const beforeEvents = state.events.length;
    registerTrackLimitOffence(state, car);
    expect(car.trackLimitWarnings).toBe(1);
    expect(car.penalties).toBe(0);

    registerTrackLimitOffence(state, car);
    expect(car.trackLimitWarnings).toBe(2);
    expect(car.penalties).toBe(0);

    registerTrackLimitOffence(state, car);
    expect(car.trackLimitWarnings).toBe(3);
    expect(car.penalties).toBe(5);
    expect(car.penaltyNotes[car.penaltyNotes.length - 1]).toContain("reincidência");

    const newEvents = state.events.slice(beforeEvents);
    expect(newEvents.filter((event) => event.type === "penalty")).toHaveLength(1);
    expect(newEvents.filter((event) => event.message.includes("Advertência"))).toHaveLength(2);
  });

  it("reduz a frequência de penalidades de limites de pista frente à V1.3.5", () => {
    const metrics = simulateWithMetrics(raceFor("v136-penalty-volume", 12, "melbourne"));
    const trackLimits = metrics.penaltyByKind.limites_pista ?? 0;
    // A V1.3.5 aplicava ~13 +5s por corrida; agora advertências absorvem a
    // maioria e só a reincidência vira tempo.
    expect(trackLimits).toBeLessThan(8);
  });
});

describe("V1.3.6A — compatibilidade e determinismo", () => {
  it("inicializa campos novos em corridas antigas", () => {
    const state = raceFor("v136-legacy", 2);
    const car = state.cars[0] as unknown as Record<string, unknown>;
    delete car.launchReaction;
    delete car.launchTraction;
    delete car.launchQuality;
    delete car.sectors;
    delete car.bestSectors;
    delete car.sectorBuffer;
    delete car.trackLimitWarnings;
    delete car.contactWarnings;
    delete car.dangerousWarnings;
    advanceRace(state);
    expect(typeof state.cars[0].launchReaction).toBe("number");
    expect(state.cars[0].launchTraction).toBe(1);
    expect(state.cars[0].sectors).toHaveLength(3);
    expect(state.cars[0].trackLimitWarnings).toBe(0);
  });

  it("segue determinístico após serializar o estado no meio da corrida", () => {
    const a = raceFor("v136-serialize", 4);
    const b = raceFor("v136-serialize", 4);
    for (let i = 0; i < 60; i++) {
      advanceRace(a);
      advanceRace(b);
    }
    const restored = JSON.parse(JSON.stringify(b)) as RaceState;
    for (let i = 0; i < 500; i++) {
      advanceRace(a);
      advanceRace(restored);
    }
    expect(restored.cars.map((car) => `${car.driverId}:${car.lap}:${car.distance.toFixed(3)}`)).toEqual(
      a.cars.map((car) => `${car.driverId}:${car.lap}:${car.distance.toFixed(3)}`),
    );
    expect(restored.cars.map((car) => car.lastLap)).toEqual(a.cars.map((car) => car.lastLap));
  });
});
