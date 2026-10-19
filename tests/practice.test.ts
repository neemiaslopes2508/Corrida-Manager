import { describe, expect, it } from "vitest";
import {
  buildQualifyingSessionInput,
  createCareer,
  currentRound,
  enterPractice,
  enterPrep,
  finishPracticeAndQualify,
  getDriversOfTeam,
  migrateCareer,
  practiceDriverFor,
  runPractice,
  setSetup,
} from "../src/engine/career";
import type { PracticeState } from "../src/engine/types";

describe("treino livre V1.3.4", () => {
  it("permite aprender, ajustar o setup e só então iniciar a classificação", () => {
    const career = createCareer({ nome: "Treino", modo: "solo", playerTeams: ["team_mclaren"], seed: "practice-flow" });
    enterPrep(career);
    enterPractice(career);
    const drivers = getDriversOfTeam(career, "team_mclaren");
    const first = drivers[0];
    const second = drivers[1];

    const before = practiceDriverFor(career, "team_mclaren", first.driverId)!;
    const marginBefore = before.downforceMargin;
    expect(before.confidence).toBe(35);
    expect(before.runs).toBe(0);

    const result = runPractice(career, "qualifying", "team_mclaren", first.driverId);
    expect(result.ok).toBe(true);
    const learned = practiceDriverFor(career, "team_mclaren", first.driverId)!;
    expect(learned.runs).toBe(1);
    expect(learned.confidence).toBeGreaterThan(35);
    expect(learned.downforceMargin).toBeLessThan(marginBefore);
    expect(learned.bestQualifyingLap).not.toBeNull();
    expect(learned.programs[0].data.some((line) => line.includes("Faixa provável"))).toBe(true);

    const adjusted = setSetup(career, first.driverId, { downforce: 0.42, focus: "qualifying" });
    expect(adjusted.ok).toBe(true);
    expect(currentRound(career).setups[first.driverId].downforce).toBeCloseTo(0.42, 5);

    const finish = finishPracticeAndQualify(career);
    expect(finish.ok).toBe(true);
    expect(career.phase).toBe("qualifying");
    const session = currentRound(career).qualifyingSession!;
    expect(session.cars.find((car) => car.driverId === first.driverId)?.setup.downforce).toBeCloseTo(0.42, 5);

    const confidence = buildQualifyingSessionInput(career, "quali").confidence;
    expect(confidence[first.driverId]).toBe(learned.confidence);
    expect(confidence[second.driverId]).toBe(35);

    expect(setSetup(career, first.driverId, { downforce: 0.8 }).ok).toBe(false);
  });

  it("faz o programa de classificação depender do acerto utilizado", () => {
    const runWith = (downforce: number) => {
      const career = createCareer({ nome: "Acerto", modo: "solo", playerTeams: ["team_mclaren"], seed: "practice-setup" });
      enterPrep(career);
      enterPractice(career);
      const driver = getDriversOfTeam(career, "team_mclaren")[0];
      expect(setSetup(career, driver.driverId, { downforce, focus: "qualifying" }).ok).toBe(true);
      expect(runPractice(career, "qualifying", "team_mclaren", driver.driverId).ok).toBe(true);
      return practiceDriverFor(career, "team_mclaren", driver.driverId)!.bestQualifyingLap!;
    };
    const low = runWith(0.15);
    const high = runWith(0.9);
    expect(low).not.toBeCloseTo(high, 3);
  });

  it("não pune quem entra no treino e avança sem rodar programas", () => {
    const career = createCareer({ nome: "Sem voltas", modo: "solo", playerTeams: ["team_ferrari"], seed: "practice-zero" });
    enterPrep(career);
    enterPractice(career);
    const driver = getDriversOfTeam(career, "team_ferrari")[0];
    expect(practiceDriverFor(career, "team_ferrari", driver.driverId)?.confidence).toBe(35);
    const input = buildQualifyingSessionInput(career, "quali");
    expect(input.confidence[driver.driverId]).toBe(35);
    expect(finishPracticeAndQualify(career).ok).toBe(true);
    expect(currentRound(career).qualifyingSession?.confidence[driver.driverId]).toBe(35);
  });

  it("mantém limite e confiança independentes por equipe e piloto", () => {
    const teams = ["team_mclaren", "team_ferrari", "team_mercedes"];
    const career = createCareer({ nome: "Multi treino", modo: "multi", playerTeams: teams, seed: "practice-multi" });
    enterPrep(career);
    enterPractice(career);
    const firstDrivers = teams.map((teamId) => getDriversOfTeam(career, teamId)[0]);

    for (let index = 0; index < teams.length; index++) {
      expect(runPractice(career, "qualifying", teams[index], firstDrivers[index].driverId).ok).toBe(true);
    }
    for (let run = 0; run < 2; run++) {
      expect(runPractice(career, run === 0 ? "race" : "tyres", teams[0], firstDrivers[0].driverId).ok).toBe(true);
    }

    expect(practiceDriverFor(career, teams[0], firstDrivers[0].driverId)?.runs).toBe(3);
    expect(practiceDriverFor(career, teams[1], firstDrivers[1].driverId)?.runs).toBe(1);
    expect(practiceDriverFor(career, teams[2], firstDrivers[2].driverId)?.runs).toBe(1);
    expect(runPractice(career, "race", teams[0], firstDrivers[0].driverId).ok).toBe(false);
    expect(runPractice(career, "race", teams[1], firstDrivers[1].driverId).ok).toBe(true);
  });

  it("migra o treino global de saves antigos para equipes e pilotos", () => {
    const career = createCareer({ nome: "Save antigo", modo: "solo", playerTeams: ["team_mclaren"], seed: "practice-migrate" });
    const legacy = {
      runs: 2,
      confidence: 54,
      programs: [],
      idealDownforce: 0.55,
      tyreInfo: "Dados antigos",
      weatherForecast: "Seco",
    } as PracticeState;
    career.rounds[0].practice = legacy;
    career.version = 2;
    migrateCareer(career);
    const migrated = career.rounds[0].practice!;
    expect(migrated.teams?.["team_mclaren"]).toBeTruthy();
    const driver = getDriversOfTeam(career, "team_mclaren")[0];
    const learned = migrated.teams!["team_mclaren"].drivers[driver.driverId];
    expect(learned.runs).toBe(2);
    expect(learned.confidence).toBe(54);
    expect(learned.downforceMargin).toBeLessThan(0.25);
  });

  it("preserva a progressão de fim de semana Sprint", () => {
    const career = createCareer({ nome: "Sprint", modo: "solo", playerTeams: ["team_mclaren"], seed: "practice-sprint" });
    career.roundIndex = 1;
    enterPrep(career);
    enterPractice(career);
    expect(finishPracticeAndQualify(career).ok).toBe(true);
    expect(career.phase).toBe("sprintQuali");
    expect(currentRound(career).qualifyingSession?.type).toBe("sprintQuali");
  });
});
