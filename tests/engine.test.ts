import { describe, expect, it } from "vitest";
import { CIRCUITS_2026, TEAMS_2026 } from "../src/data/season2026";
import { buildTrack, formatLapTime } from "../src/engine/track";
import {
  applySessionResult,
  buildQualifyingInput,
  buildRaceConfig,
  completeQualifyingSession,
  completeSeason,
  constructorStandings,
  continueAfterResults,
  createCareer,
  currentRound,
  driverStandings,
  startDevelopment,
  startQualifyingSession,
} from "../src/engine/career";
import { simulateQualifying } from "../src/engine/qualifying";
import { simulateQualifyingToEnd } from "../src/engine/qualifyingSession";
import { advanceRace, applyRaceCommand, buildRaceView, createRaceState, raceToSessionResult, simulateRaceToEnd } from "../src/engine/race";

function raceFor(seed: string, laps = 5) {
  const career = createCareer({ nome: "Teste", modo: "solo", playerTeams: ["team_mclaren"], seed });
  const quali = simulateQualifying(buildQualifyingInput(career, "quali"));
  career.rounds[0].qualifying = quali;
  const config = buildRaceConfig(career, "race");
  config.totalLaps = laps;
  config.weather = [{ fromLap: 0, rain: 0, airTemp: 25, trackTemp: 36 }];
  const state = createRaceState(config);
  return { career, state };
}

describe("circuitos e traçados", () => {
  it("gera amostras coerentes para as três pistas", () => {
    for (const circuit of CIRCUITS_2026) {
      const track = buildTrack(circuit);
      expect(track.length).toBe(circuit.comprimentoM);
      expect(track.samples.length).toBeGreaterThan(500);
      expect(track.svgPath.length).toBeGreaterThan(100);
      expect(track.pitEntry).toBeLessThan(track.length);
      for (const s of track.samples) {
        expect(Number.isFinite(s.x)).toBe(true);
        expect(Number.isFinite(s.speed)).toBe(true);
        expect(s.speed).toBeGreaterThan(10);
      }
      expect(track.svgPath).toContain("M");
    }
    const paths = CIRCUITS_2026.map((c) => buildTrack(c).svgPath);
    expect(new Set(paths).size).toBe(3);
  });
});

describe("equipes e pilotos", () => {
  it("aceita qualquer uma das 11 equipes e mantém 22 pilotos", () => {
    for (const team of TEAMS_2026) {
      const career = createCareer({ nome: `Carreira ${team.nome}`, modo: "solo", playerTeams: [team.id], seed: `team-${team.id}` });
      expect(career.teams).toHaveLength(11);
      expect(career.drivers).toHaveLength(22);
      expect(career.drivers.filter((d) => d.teamId === team.id)).toHaveLength(2);
      const config = buildRaceConfig(career, "race");
      expect(config.grid).toHaveLength(22);
      expect(new Set(config.grid).size).toBe(22);
      expect(config.teams).toHaveLength(11);
      expect(config.drivers).toHaveLength(22);
    }
  });

  it("desenvolvimento altera o carro usado pelo motor", () => {
    const career = createCareer({ nome: "Dev", modo: "solo", playerTeams: ["team_haas"], seed: "dev-test" });
    const before = buildRaceConfig(career, "race").teams.find((t) => t.teamId === "team_haas")!.car.aerodinamica;
    const res = startDevelopment(career, "team_haas", "aerodinamica", "fast");
    expect(res.ok).toBe(true);
    const after = buildRaceConfig(career, "race").teams.find((t) => t.teamId === "team_haas")!.car.aerodinamica;
    expect(after).toBeGreaterThan(before);
  });
});

describe("classificação", () => {
  it("produz grid único com 22 pilotos e três segmentos", () => {
    const career = createCareer({ nome: "Q", modo: "solo", playerTeams: ["team_ferrari"], seed: "quali-test" });
    const result = simulateQualifying(buildQualifyingInput(career, "quali"));
    expect(result.grid).toHaveLength(22);
    expect(new Set(result.grid).size).toBe(22);
    expect(result.segments).toHaveLength(3);
    expect(result.segments[0].entries).toHaveLength(22);
    expect(result.segments[1].entries).toHaveLength(16);
    expect(result.segments[2].entries).toHaveLength(10);
    const q3 = result.segments[2].entries;
    for (let i = 1; i < q3.length; i++) expect(q3[i].time).toBeGreaterThanOrEqual(q3[i - 1].time);
    expect(new Set(result.grid.slice(0, 22)).size).toBe(22);
  });
});

describe("motor de corrida", () => {
  it("classifica todos os carros sem posições duplicadas", () => {
    const { state } = raceFor("race-integrity", 6);
    simulateRaceToEnd(state);
    const view = buildRaceView(state);
    expect(state.status).toBe("finished");
    expect(view.cars).toHaveLength(22);
    const positions = view.cars.map((c) => c.position);
    expect(new Set(positions).size).toBe(22);
    expect(Math.min(...positions)).toBe(1);
    expect(Math.max(...positions)).toBe(22);
    expect(state.cars.filter((c) => c.status === "retired").length).toBeGreaterThanOrEqual(0);
    for (const car of state.cars) {
      expect(Number.isFinite(car.distance)).toBe(true);
      expect(Number.isFinite(car.tyre.wear)).toBe(true);
      expect(car.tyre.wear).toBeGreaterThanOrEqual(0);
      expect(car.tyre.wear).toBeLessThanOrEqual(100);
      expect(car.energy).toBeGreaterThanOrEqual(0);
      expect(car.energy).toBeLessThanOrEqual(100);
      expect(car.fuelKg).toBeGreaterThanOrEqual(0);
    }
    const winner = view.cars[0];
    expect(winner.lap).toBe(6);
    expect(winner.status).toBe("finished");
  });

  it("respeita a ordem de chegada e pontuação", () => {
    const { career, state } = raceFor("race-points", 5);
    simulateRaceToEnd(state);
    const result = raceToSessionResult(state, "race", [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], 1);
    expect(result.entries[0].points).toBe(25);
    expect(result.entries[1].points).toBe(18);
    expect(result.entries[9].points).toBe(1);
    expect(result.entries[10].points).toBe(0);
    applySessionResult(career, result, "race");
    const standings = driverStandings(career);
    expect(standings[0].driverId).toBe(result.entries[0].driverId);
    expect(standings[0].standing.points).toBe(25);
    const constructors = constructorStandings(career);
    expect(constructors[0].standing.races).toBe(1);
    expect(career.teams.find((t) => t.teamId === result.entries[0].teamId)!.budget).not.toBe(
      TEAMS_2026.find((t) => t.id === result.entries[0].teamId)!.orcamentoInicial,
    );
  });

  it("estratégia padrão do jogador agenda um pit stop válido", () => {
    const { state } = raceFor("default-pit", 20);
    simulateRaceToEnd(state);
    const cars = state.cars.filter((c) => c.teamId === "team_mclaren");
    for (const car of cars) {
      expect(car.pit.stops).toBeGreaterThanOrEqual(1);
      expect(car.tyre.usedCompounds.length).toBeGreaterThanOrEqual(2);
      expect(car.energy).toBeGreaterThan(10);
    }
  });

  it("mantém posições coerentes com a distância percorrida", () => {
    const { state } = raceFor("race-order", 6);
    for (let i = 0; i < 300; i++) {
      advanceRace(state);
      const running = state.cars.filter((c) => c.status === "running").sort((a, b) => a.position - b.position);
      for (let j = 1; j < running.length; j++) {
        expect(running[j - 1].distance).toBeGreaterThanOrEqual(running[j].distance - 0.001);
      }
      for (const car of state.cars) expect(car.distance).toBeGreaterThan(-1000);
    }
  });

  it("aplica comando de pit stop e troca de composto", () => {
    const { state } = raceFor("race-pit", 8);
    const car = state.cars.find((c) => c.teamId === "team_mclaren")!;
    applyRaceCommand(state, { type: "nextCompound", driverId: car.driverId, value: "hard" });
    const res = applyRaceCommand(state, { type: "schedulePit", driverId: car.driverId, lap: 3 });
    expect(res.ok).toBe(true);
    simulateRaceToEnd(state);
    const after = state.cars.find((c) => c.driverId === car.driverId)!;
    expect(after.pit.stops).toBeGreaterThanOrEqual(1);
    expect(after.tyre.usedCompounds.length).toBeGreaterThanOrEqual(2);
  });

  it("estratégias diferentes alteram desgaste e volta", () => {
    const a = raceFor("strategy-same", 8).state;
    const b = raceFor("strategy-same", 8).state;
    const ca = a.cars.find((c) => c.driverId === "driver_lando_norris")!;
    const cb = b.cars.find((c) => c.driverId === "driver_lando_norris")!;
    applyRaceCommand(a, { type: "pace", driverId: ca.driverId, value: "attack" });
    applyRaceCommand(a, { type: "tyreMode", driverId: ca.driverId, value: "push" });
    applyRaceCommand(b, { type: "pace", driverId: cb.driverId, value: "conserve" });
    applyRaceCommand(b, { type: "tyreMode", driverId: cb.driverId, value: "manage" });
    for (let i = 0; i < 400; i++) {
      advanceRace(a);
      advanceRace(b);
    }
    expect(ca.tyre.wear).toBeGreaterThan(cb.tyre.wear);
    expect(ca.bestLap).not.toBeNull();
    expect(cb.bestLap).not.toBeNull();
    expect(ca.bestLap!).toBeLessThan(cb.bestLap!);
  });

  it("estado serializado continua determinístico", () => {
    const a = raceFor("serialize", 6).state;
    const b = raceFor("serialize", 6).state;
    for (let i = 0; i < 80; i++) {
      advanceRace(a);
      advanceRace(b);
    }
    const restored = JSON.parse(JSON.stringify(b)) as typeof b;
    for (let i = 0; i < 400; i++) advanceRace(a);
    for (let i = 0; i < 400; i++) advanceRace(restored);
    const va = buildRaceView(a);
    const vb = buildRaceView(restored);
    expect(va.cars.map((c) => `${c.position}:${c.driverId}:${c.lap}:${c.distance.toFixed(3)}`)).toEqual(
      vb.cars.map((c) => `${c.position}:${c.driverId}:${c.lap}:${c.distance.toFixed(3)}`),
    );
    expect(formatLapTime(va.fastestLap?.time)).toBe(formatLapTime(vb.fastestLap?.time));
  });
});

describe("carreira curta", () => {
  it("completa as três etapas, sprint, finanças e campeões", () => {
    const career = createCareer({ nome: "Carreira", modo: "solo", playerTeams: ["team_mclaren"], seed: "career-test" });
    const initialBudget = career.teams.find((t) => t.teamId === "team_mclaren")!.budget;
    const aeroBefore = career.teams.find((t) => t.teamId === "team_mclaren")!.car.aerodinamica;
    const dev = startDevelopment(career, "team_mclaren", "aerodinamica", "fast");
    expect(dev.ok).toBe(true);
    expect(career.teams.find((t) => t.teamId === "team_mclaren")!.car.aerodinamica).toBeGreaterThan(aeroBefore);
    expect(career.teams.find((t) => t.teamId === "team_mclaren")!.budget).toBeLessThan(initialBudget);

    for (let round = 0; round < 3; round++) {
      const circuit = CIRCUITS_2026[round];
      if (circuit.sprint) {
        const sqSession = startQualifyingSession(career, "sprintQuali");
        simulateQualifyingToEnd(sqSession);
        completeQualifyingSession(career, sqSession);
        const sprintConfig = buildRaceConfig(career, "sprint");
        sprintConfig.totalLaps = 5;
        const sprintState = createRaceState(sprintConfig);
        simulateRaceToEnd(sprintState);
        const sprintResult = raceToSessionResult(sprintState, "sprint", [8, 7, 6, 5, 4, 3, 2, 1], round + 1);
        expect(sprintResult.entries.slice(0, 8).map((e) => e.points)).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
        expect(sprintResult.entries[8]?.points ?? 0).toBe(0);
        applySessionResult(career, sprintResult, "sprint");
        expect(currentRound(career).qualifyingSession).not.toBeNull();
        const gpSession = currentRound(career).qualifyingSession!;
        simulateQualifyingToEnd(gpSession);
        completeQualifyingSession(career, gpSession);
        expect(currentRound(career).qualifying?.grid).toHaveLength(22);
      } else {
        const qSession = startQualifyingSession(career, "quali");
        simulateQualifyingToEnd(qSession);
        completeQualifyingSession(career, qSession);
        expect(currentRound(career).qualifying?.grid).toHaveLength(22);
      }
      const config = buildRaceConfig(career, "race");
      config.totalLaps = 5;
      const state = createRaceState(config);
      simulateRaceToEnd(state);
      const result = raceToSessionResult(state, "race", [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], round + 1);
      applySessionResult(career, result, "race");
      expect(career.phase).toBe("results");
      expect(career.results.filter((r) => r.round === round + 1)).toHaveLength(circuit.sprint ? 2 : 1);
      expect(career.teams.every((t) => t.ledger.length > 0)).toBe(true);
      continueAfterResults(career);
    }
    expect(career.seasonComplete).toBe(true);
    expect(career.phase).toBe("seasonEnd");
    expect(career.champions?.drivers).toBeTruthy();
    expect(career.champions?.constructors).toBeTruthy();
    expect(Object.values(career.standingsDrivers).some((s) => s.points > 0)).toBe(true);
    expect(career.results.length).toBe(4); // 3 corridas + 1 sprint
    const champion = driverStandings(career)[0];
    expect(champion.standing.points).toBeGreaterThan(0);
  });

  it("salva e restaura a carreira em JSON", () => {
    const career = createCareer({ nome: "Save", modo: "solo", playerTeams: ["team_audi"], seed: "save-test" });
    const q = simulateQualifying(buildQualifyingInput(career, "quali"));
    currentRound(career).qualifying = q;
    const config = buildRaceConfig(career, "race");
    config.totalLaps = 4;
    const state = createRaceState(config);
    simulateRaceToEnd(state);
    applySessionResult(career, raceToSessionResult(state, "race", [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], 1), "race");
    const restored = JSON.parse(JSON.stringify(career));
    expect(restored.phase).toBe("results");
    expect(restored.results).toHaveLength(1);
    expect(restored.standingsDrivers).toEqual(career.standingsDrivers);
    continueAfterResults(restored);
    expect(restored.roundIndex).toBe(1);
    expect(restored.phase).toBe("management");
  });

  it("encerra a temporada com campeões mesmo sem etapas restantes", () => {
    const career = createCareer({ nome: "End", modo: "solo", playerTeams: ["team_mercedes"], seed: "end-test" });
    career.roundIndex = 2;
    career.phase = "results";
    completeSeason(career);
    expect(career.seasonComplete).toBe(true);
    expect(career.phase).toBe("seasonEnd");
    expect(career.champions?.constructors).toBeTruthy();
  });
});
