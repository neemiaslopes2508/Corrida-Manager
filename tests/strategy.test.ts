import { describe, expect, it } from "vitest";
import { CIRCUITS_2026 } from "../src/data/season2026";
import { buildRaceConfig, createCareer, getDriversOfTeam, setRaceStrategy, teamState } from "../src/engine/career";
import { advanceRace, applyRaceCommand, createRaceState, simulateRaceToEnd } from "../src/engine/race";
import {
  allocateTyreInventory,
  buildPlanWithStops,
  estimatePitLoss,
  makeDefaultRacePlan,
  projectOvercut,
  projectRaceStrategy,
  projectUndercut,
  recommendRaceAction,
  validateRacePlan,
  type RecommendationContext,
} from "../src/engine/raceStrategy";

function setup(seed = "strategy-v13") {
  const career = createCareer({ nome: "Estratégia", modo: "solo", playerTeams: ["team_ferrari"], seed });
  const circuit = CIRCUITS_2026[0];
  const team = teamState(career, "team_ferrari")!;
  const driver = getDriversOfTeam(career, "team_ferrari")[0];
  return { career, circuit, team, driver };
}

function recommendationContext(overrides: Partial<RecommendationContext> = {}): RecommendationContext {
  return {
    lap: 20,
    totalLaps: 50,
    raceRemainingLaps: 30,
    tyreWear: 50,
    tyreAge: 10,
    remainingLaps: 12,
    plannedPitLap: 25,
    windowStart: 23,
    windowEnd: 27,
    fuelKg: 70,
    fuelPerLap: 2,
    energy: 50,
    rain: 0,
    nextRainLap: -1,
    trackStatus: "green",
    undercutRisk: 0.2,
    rivalPlannedStop: false,
    pitLoss: 22,
    compound: "medium",
    ...overrides,
  };
}

describe("estratégia V1.3", () => {
  it("aplica o fator de degradação aprendido no treino à projeção", () => {
    const { circuit, team, driver } = setup("strategy-practice-factor");
    const plan = buildPlanWithStops(driver.driverId, 58, 1, ["medium", "hard"]);
    const base = projectRaceStrategy({
      plan,
      circuit,
      car: team.car,
      driver: driver.attributes,
      setup: { downforce: circuit.downforceIdeal, focus: "balanced" },
      rain: 0,
      trackTemp: 35,
      airTemp: 25,
      pitCrew: team.pitCrew ?? 70,
      inventory: allocateTyreInventory(false),
      degradationFactor: 1,
    });
    const learned = projectRaceStrategy({
      plan,
      circuit,
      car: team.car,
      driver: driver.attributes,
      setup: { downforce: circuit.downforceIdeal, focus: "balanced" },
      rain: 0,
      trackTemp: 35,
      airTemp: 25,
      pitCrew: team.pitCrew ?? 70,
      inventory: allocateTyreInventory(false),
      degradationFactor: 1.2,
    });
    expect(learned.stints[0].endWear).toBeGreaterThan(base.stints[0].endWear);
  });

  it("corrige combustível, Safety Car e undercut nas recomendações", () => {
    const fuel = recommendRaceAction(recommendationContext({ fuelKg: 10, raceRemainingLaps: 30 }));
    expect(fuel?.key).toBe("fuel");
    expect(fuel?.severity).toBe("danger");

    const sc = recommendRaceAction(recommendationContext({ trackStatus: "sc", remainingLaps: 10, raceRemainingLaps: 4, tyreAge: 8 }));
    expect(sc?.key).toBe("sc-pit");
    const lateSc = recommendRaceAction(recommendationContext({ trackStatus: "sc", remainingLaps: 10, raceRemainingLaps: 2, tyreAge: 8 }));
    expect(lateSc?.key).not.toBe("sc-pit");

    expect(recommendRaceAction(recommendationContext({ lap: 24, undercutRisk: 0.8, rivalPlannedStop: false }))?.key).not.toBe("undercut");
    expect(recommendRaceAction(recommendationContext({ lap: 24, undercutRisk: 0.8, rivalPlannedStop: true }))?.key).toBe("undercut");
  });

  it("projeta planos diferentes com desgaste e pit loss reais", () => {
    const { circuit, team, driver } = setup();
    const one = buildPlanWithStops(driver.driverId, 58, 1, ["medium", "hard"]);
    const two = buildPlanWithStops(driver.driverId, 58, 2, ["soft", "medium", "hard"]);
    const oneProjection = projectRaceStrategy({
      plan: one,
      circuit,
      car: team.car,
      driver: driver.attributes,
      setup: { downforce: circuit.downforceIdeal, focus: "balanced" },
      rain: 0,
      trackTemp: 35,
      airTemp: 25,
      pitCrew: team.pitCrew ?? 70,
      inventory: allocateTyreInventory(false),
    });
    const twoProjection = projectRaceStrategy({
      plan: two,
      circuit,
      car: team.car,
      driver: driver.attributes,
      setup: { downforce: circuit.downforceIdeal, focus: "balanced" },
      rain: 0,
      trackTemp: 35,
      airTemp: 25,
      pitCrew: team.pitCrew ?? 70,
      inventory: allocateTyreInventory(false),
    });
    expect(oneProjection.stints).toHaveLength(2);
    expect(twoProjection.stints).toHaveLength(3);
    expect(oneProjection.pitLoss).toBeGreaterThan(0);
    expect(twoProjection.pitLoss * 2).toBeGreaterThan(oneProjection.pitLoss);
    expect(Number.isFinite(oneProjection.totalTime)).toBe(true);
    expect(Number.isFinite(twoProjection.totalTime)).toBe(true);
    expect(oneProjection.stints[0].endWear).not.toBe(twoProjection.stints[0].endWear);
  });

  it("valida regra de dois compostos e estoque", () => {
    const { circuit, driver } = setup("strategy-validation");
    const invalid = buildPlanWithStops(driver.driverId, 58, 1, ["medium", "medium"]);
    expect(validateRacePlan(invalid, 58, true, true).ok).toBe(false);
    const valid = buildPlanWithStops(driver.driverId, 58, 1, ["medium", "hard"]);
    expect(validateRacePlan(valid, 58, true, true).ok).toBe(true);
    expect(validateRacePlan(valid, 58, true, true, { soft: 2, medium: 0, hard: 1, inter: 2, wet: 2 }).ok).toBe(false);
    expect(estimatePitLoss(circuit, 80)).toBeGreaterThan(0);
  });

  it("calcula undercut e overcut a partir da diferença de ritmo", () => {
    const favorable = projectUndercut({ pitLoss: 20, oldLapTime: 80, newLapTime: 78, laps: 15 });
    const unfavorable = projectOvercut({ pitLoss: 20, oldLapTime: 80, newLapTime: 78, laps: 5 });
    expect(favorable).toBeGreaterThan(0);
    expect(unfavorable).toBeLessThan(0);
  });

  it("aplica plano na corrida, agenda pit e consome o estoque", () => {
    const { career, driver } = setup("strategy-race");
    const config = buildRaceConfig(career, "race");
    config.totalLaps = 20;
    const plan = buildPlanWithStops(driver.driverId, 20, 1, ["medium", "hard"]);
    config.strategyPlansV2 = { ...config.strategyPlansV2, [driver.driverId]: plan };
    const state = createRaceState(config);
    const car = state.cars.find((entry) => entry.driverId === driver.driverId)!;
    expect(car.pit.plannedLap).toBe(10);
    const revision = car.strategy.version;
    const scheduled = applyRaceCommand(state, { type: "schedulePit", driverId: car.driverId, lap: 8, revision });
    expect(scheduled.ok).toBe(true);
    expect(car.strategy.version).toBe(revision + 1);
    expect(applyRaceCommand(state, { type: "cancelPit", driverId: car.driverId, revision }).ok).toBe(false);
    const replacement = buildPlanWithStops(driver.driverId, 20, 2, ["medium", "hard", "medium"]);
    expect(applyRaceCommand(state, { type: "applyStrategyPlan", driverId: car.driverId, plan: replacement, revision: car.strategy.version }).ok).toBe(true);
    expect(car.strategy.plan.stints).toHaveLength(3);
    car.nextCompound = "hard";
    simulateRaceToEnd(state);
    expect(car.pit.stops).toBeGreaterThanOrEqual(1);
    expect(car.tyre.usedCompounds).toContain("hard");
    expect(car.tyreInventory.hard).toBeLessThan(3);
  });

  it("usa a margem de combustível sem reabastecimento", () => {
    const { career, driver } = setup("strategy-fuel");
    const full = createRaceState(buildRaceConfig(career, "race"));
    const lightConfig = buildRaceConfig(career, "race");
    lightConfig.setups = { ...lightConfig.setups, [driver.driverId]: { ...lightConfig.setups[driver.driverId], fuelLoad: 0.92 } };
    const light = createRaceState(lightConfig);
    const fullCar = full.cars.find((car) => car.driverId === driver.driverId)!;
    const lightCar = light.cars.find((car) => car.driverId === driver.driverId)!;
    expect(lightCar.fuelStartKg).toBeLessThan(fullCar.fuelStartKg);
    expect(lightCar.fuelStartKg).toBeGreaterThan(100);
  });

  it("mantém Safety Car com duração por voltas e retorno à pista verde", () => {
    const { career } = setup("strategy-sc");
    const config = buildRaceConfig(career, "race");
    config.totalLaps = 8;
    config.initialTrackStatus = "sc";
    const state = createRaceState(config);
    expect(state.trackStatus).toBe("sc");
    expect(state.trackStatusUntilLap).toBe(3);
    for (let i = 0; i < 2500 && state.trackStatus !== "green"; i++) advanceRace(state);
    expect(state.trackStatus).toBe("green");
  });

  it("mantém planos e inventário na carreira", () => {
    const { career, driver } = setup("strategy-career");
    expect(career.rounds[0].raceStrategyPlans?.[driver.driverId]).toBeTruthy();
    expect(career.rounds[0].tyreInventory?.[driver.driverId]).toBeTruthy();
    const plan = makeDefaultRacePlan({
      driverId: driver.driverId,
      totalLaps: CIRCUITS_2026[0].voltas,
      circuit: CIRCUITS_2026[0],
      startRain: 0,
      mandatoryStop: true,
      startingCompound: "medium",
    });
    expect(plan.stints.length).toBeGreaterThan(1);
    const changed = buildPlanWithStops(driver.driverId, CIRCUITS_2026[0].voltas, 2, ["medium", "hard", "medium"]);
    expect(setRaceStrategy(career, driver.driverId, changed).ok).toBe(true);
    expect(career.rounds[0].raceStrategyPlans?.[driver.driverId]?.stints).toHaveLength(3);
  });
});
