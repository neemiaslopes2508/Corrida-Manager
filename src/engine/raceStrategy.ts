import type { CarAttributes, CircuitData, DriverAttributes } from "../data/season2026";
import type {
  Compound,
  PaceMode,
  RaceStrategyPlan,
  RaceStrategyProjection,
  StrategyRecommendation,
  StrategyStint,
  TyreProjection,
  TyreState,
  TyreMode,
} from "./types";
import { buildTrack } from "./track";
import { COMPOUNDS, initialTyre, tyreGrip, updateTyreTemperature, wearPerLap } from "./tyres";

/** Valores compartilhados pelo motor de corrida e pelas projeções. */
export const FUEL_CONSUMPTION_PER_METER = 0.000352;
export const FUEL_ATTACK_EXTRA = 0.000012;
export const PIT_LANE_SPEED = 15;
export const PIT_SERVICE_BASE = 2.05;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function allocateTyreInventory(sprint: boolean): Record<Compound, number> {
  // Alocação simplificada de fim de semana. A classificação consome os mesmos
  // jogos que a corrida, deixando o estoque restante para os stints.
  return sprint
    ? { soft: 7, medium: 5, hard: 2, inter: 3, wet: 2 }
    : { soft: 8, medium: 5, hard: 3, inter: 3, wet: 2 };
}

export function cloneInventory(inventory: Record<Compound, number>): Record<Compound, number> {
  return { soft: inventory.soft ?? 0, medium: inventory.medium ?? 0, hard: inventory.hard ?? 0, inter: inventory.inter ?? 0, wet: inventory.wet ?? 0 };
}

export function countDrySets(inventory: Record<Compound, number>): number {
  return inventory.soft + inventory.medium + inventory.hard;
}

export function hasTyreSet(inventory: Record<Compound, number>, compound: Compound): boolean {
  return (inventory[compound] ?? 0) > 0;
}

export function consumeTyreSet(inventory: Record<Compound, number>, compound: Compound): boolean {
  if ((inventory[compound] ?? 0) <= 0) return false;
  inventory[compound] -= 1;
  return true;
}

export function fuelPerLap(circuit: CircuitData): number {
  return 1.85 + circuit.abrasividade * 0.15;
}

export function requiredFuelKg(circuit: CircuitData, totalLaps: number): number {
  return totalLaps * fuelPerLap(circuit) + 1.4;
}

export function carPaceScore(car: CarAttributes): number {
  return car.aerodinamica * 0.25 + car.curvas * 0.3 + car.retas * 0.25 + car.energia * 0.2;
}

export function driverPaceScore(driver: DriverAttributes): number {
  return driver.velocidade * 0.52 + driver.consistencia * 0.18 + driver.experiencia * 0.12 + driver.ultrapassagem * 0.1 + driver.gestaoPneus * 0.08;
}

export function paceFactor(car: CarAttributes, driver: DriverAttributes): { base: number; corner: number; straight: number } {
  const base = 1 + (carPaceScore(car) - 81) * 0.00058 + (driverPaceScore(driver) - 81) * 0.00048;
  const corner = 1 + (car.aerodinamica - 80) * 0.00016 + (car.curvas - 80) * 0.00022 + (driver.velocidade - 80) * 0.00008;
  const straight = 1 + (car.retas - 80) * 0.0002 + (car.energia - 80) * 0.00014 + (driver.ultrapassagem - 80) * 0.00004;
  return { base, corner, straight };
}

/**
 * Perda de pit estimada a partir da mesma geometria usada pela simulação,
 * sem adicionar uma segunda penalidade de tempo ao pit stop físico.
 */
export function estimatePitLoss(circuit: CircuitData, pitCrew: number, trackStatus: "green" | "sc" | "vsc" = "green"): number {
  const track = buildTrack(circuit);
  const service = PIT_SERVICE_BASE + (100 - clamp(pitCrew, 0, 100)) * 0.011 + 0.35;
  const pitDistance = Math.max(0, track.length * 0.985 - track.pitEntry) + track.length * 0.022;
  const normalSpeed = Math.max(25, track.length / Math.max(45, circuit.baseLapTime));
  const pitTime = pitDistance / PIT_LANE_SPEED;
  const racingTime = pitDistance / normalSpeed;
  const transition = 3.0;
  const statusFactor = trackStatus === "sc" ? 0.62 : trackStatus === "vsc" ? 0.82 : 1;
  return Math.max(6, (service + pitTime - racingTime + transition) * statusFactor);
}

export function makePitWindows(pitLaps: number[], before = 2, after = 2): { before: number; after: number }[] {
  return pitLaps.map(() => ({ before, after }));
}

export function planPitLaps(plan: RaceStrategyPlan): number[] {
  let lap = 0;
  return plan.stints.slice(0, -1).map((stint) => {
    lap += stint.laps;
    return lap;
  });
}

export function planStops(plan: RaceStrategyPlan): number {
  return Math.max(0, plan.stints.length - 1);
}

function normalizeWindows(windows: { before: number; after: number }[] | undefined, stops: number): { before: number; after: number }[] {
  return Array.from({ length: stops }, (_, index) => {
    const window = windows?.[index];
    return { before: Math.max(0, Math.round(window?.before ?? 2)), after: Math.max(0, Math.round(window?.after ?? 2)) };
  });
}

export function normalizeRacePlan(plan: RaceStrategyPlan, totalLaps: number): RaceStrategyPlan {
  const stints = plan.stints
    .filter((stint) => stint.laps > 0)
    .map((stint) => ({ compound: stint.compound, laps: Math.max(1, Math.round(stint.laps)) }));
  const safe = stints.length > 0 ? stints : [{ compound: "medium" as Compound, laps: totalLaps }];
  const sum = safe.reduce((total, stint) => total + stint.laps, 0);
  if (sum !== totalLaps) {
    const diff = totalLaps - sum;
    safe[safe.length - 1].laps = Math.max(1, safe[safe.length - 1].laps + diff);
    const corrected = safe.reduce((total, stint) => total + stint.laps, 0);
    if (corrected !== totalLaps) {
      safe[0].laps = Math.max(1, safe[0].laps + (totalLaps - corrected));
    }
  }
  return {
    ...plan,
    stints: safe,
    pitWindows: normalizeWindows(plan.pitWindows, Math.max(0, safe.length - 1)),
  };
}

export function buildPlanWithStops(
  driverId: string,
  totalLaps: number,
  stops: number,
  compounds: Compound[],
  source: "player" | "ai" = "player",
  windows = 2,
  version = 1,
): RaceStrategyPlan {
  const stintCount = clamp(Math.round(stops) + 1, 1, 4);
  const plans = compounds.slice(0, stintCount);
  while (plans.length < stintCount) plans.push(plans[plans.length - 1] ?? "medium");
  const laps: number[] = [];
  if (stintCount === 1) {
    laps.push(totalLaps);
  } else {
    const base = Math.floor(totalLaps / stintCount);
    for (let i = 0; i < stintCount - 1; i++) laps.push(Math.max(1, base));
    laps.push(Math.max(1, totalLaps - laps.reduce((a, b) => a + b, 0)));
  }
  const stints: StrategyStint[] = laps.map((count, index) => ({ compound: plans[index] ?? "medium", laps: count }));
  return normalizeRacePlan(
    {
      driverId,
      stints,
      pitWindows: makePitWindows(planPitLaps({ driverId, stints, pitWindows: [], source, version }), windows, windows),
      source,
      version,
    },
    totalLaps,
  );
}

export function makeDefaultRacePlan(params: {
  driverId: string;
  totalLaps: number;
  circuit: CircuitData;
  startRain: number;
  mandatoryStop: boolean;
  startingCompound: Compound;
  source?: "player" | "ai";
  strategyRating?: number;
}): RaceStrategyPlan {
  const { driverId, totalLaps, circuit, startRain, mandatoryStop, startingCompound } = params;
  const source = params.source ?? "player";
  const wet = startRain > 0.15;
  if (wet) {
    const compound: Compound = startRain > 0.62 ? "wet" : "inter";
    return normalizeRacePlan(
      {
        driverId,
        stints: [{ compound, laps: totalLaps }],
        pitWindows: [],
        source,
        version: 1,
      },
      totalLaps,
    );
  }
  if (!mandatoryStop) {
    return normalizeRacePlan(
      {
        driverId,
        stints: [{ compound: startingCompound, laps: totalLaps }],
        pitWindows: [],
        source,
        version: 1,
      },
      totalLaps,
    );
  }
  const preferredStops = totalLaps >= 35 || (circuit.abrasividade > 0.64 && totalLaps >= 24) ? 2 : 1;
  const other: Compound = startingCompound === "medium" ? "hard" : "medium";
  const compounds: Compound[] = preferredStops === 2
    ? [startingCompound, other, startingCompound]
    : [startingCompound, other];
  return buildPlanWithStops(driverId, totalLaps, preferredStops, compounds, source);
}

export function validateRacePlan(
  plan: RaceStrategyPlan,
  totalLaps: number,
  mandatoryStop: boolean,
  dry: boolean,
  inventory?: Record<Compound, number>,
): { ok: boolean; error?: string } {
  if (!plan.stints.length || plan.stints.length > 4) return { ok: false, error: "O plano deve ter entre 1 e 4 stints." };
  const sum = plan.stints.reduce((total, stint) => total + stint.laps, 0);
  if (sum !== totalLaps) return { ok: false, error: `A soma dos stints deve ser ${totalLaps} voltas.` };
  if (plan.stints.some((stint) => stint.laps <= 0)) return { ok: false, error: "Cada stint precisa ter ao menos uma volta." };
  if (dry && mandatoryStop && plan.stints.length < 2) return { ok: false, error: "Corrida seca exige ao menos uma parada." };
  if (dry && mandatoryStop) {
    const dryCompounds = new Set(plan.stints.map((stint) => stint.compound).filter((compound) => compound === "soft" || compound === "medium" || compound === "hard"));
    if (dryCompounds.size < 2) return { ok: false, error: "Use ao menos dois compostos secos diferentes." };
  }
  if (inventory) {
    const counts: Partial<Record<Compound, number>> = {};
    for (const stint of plan.stints) counts[stint.compound] = (counts[stint.compound] ?? 0) + 1;
    for (const [compound, count] of Object.entries(counts) as [Compound, number][]) {
      if ((inventory[compound] ?? 0) < count) return { ok: false, error: `Jogos insuficientes de ${COMPOUNDS[compound].nome}.` };
    }
  }
  return { ok: true };
}

export function estimateLapTime(params: {
  circuit: CircuitData;
  car: CarAttributes;
  driver: DriverAttributes;
  setup: { downforce: number; focus: "qualifying" | "balanced" | "race" };
  tyre: TyreState;
  rain: number;
  fuelKg: number;
  fuelStartKg: number;
  pace?: PaceMode;
  tyreMode?: TyreMode;
  speed?: number;
}): number {
  const { circuit, car, driver, setup, tyre, rain, fuelKg, fuelStartKg } = params;
  const pace = params.pace ?? "normal";
  const tyreMode = params.tyreMode ?? "normal";
  const pf = paceFactor(car, driver);
  let factor = pf.base;
  factor *= 1 + (fuelStartKg - fuelKg) * 0.000038;
  factor /= Math.max(0.9, tyreGrip(tyre, rain));
  factor *= 1 + (driver.chuva - 80) * 0.0009 * rain;
  factor *= 1 + (1 - Math.abs(setup.downforce - circuit.downforceIdeal)) * 0.004;
  factor *= setup.focus === "qualifying" ? 0.9995 : setup.focus === "race" ? 1.001 : 1;
  factor *= pace === "attack" ? 1.011 : pace === "conserve" ? 0.987 : 1;
  factor *= tyreMode === "push" ? 1.0025 : tyreMode === "manage" ? 0.999 : 1;
  factor *= rain > 0.05 ? 1 - rain * 0.05 : 1;
  let lap = circuit.baseLapTime / Math.max(0.95, factor);
  // Pneus frios: pequeno custo explícito de aquecimento na primeira volta.
  if (tyre.ageLaps === 0 && tyre.wear < 3 && tyre.temp < COMPOUNDS[tyre.compound].optimalTemp - 20) {
    lap += 0.8;
  }
  return Math.max(circuit.baseLapTime * 0.9, lap);
}

export interface StintProjectionInput {
  circuit: CircuitData;
  car: CarAttributes;
  driver: DriverAttributes;
  setup: { downforce: number; focus: "qualifying" | "balanced" | "race" };
  tyre: TyreState;
  laps: number;
  startLap: number;
  rain: number;
  trackTemp: number;
  airTemp: number;
  pace?: PaceMode;
  tyreMode?: TyreMode;
  fuelKg: number;
  fuelStartKg: number;
}

export function projectStint(input: StintProjectionInput): TyreProjection {
  const tyre: TyreState = {
    ...input.tyre,
    usedCompounds: [...input.tyre.usedCompounds],
  };
  let totalTime = 0;
  let fuelKg = input.fuelKg;
  let warmupLaps = 0;
  const track = buildTrack(input.circuit);
  for (let index = 0; index < Math.max(1, Math.round(input.laps)); index++) {
    const lapTime = estimateLapTime({
      circuit: input.circuit,
      car: input.car,
      driver: input.driver,
      setup: input.setup,
      tyre,
      rain: input.rain,
      fuelKg,
      fuelStartKg: input.fuelStartKg,
      pace: input.pace,
      tyreMode: input.tyreMode,
    });
    totalTime += lapTime;
    const speed = track.length / Math.max(30, lapTime);
    tyre.temp = updateTyreTemperature(tyre, input.pace ?? "normal", input.tyreMode ?? "normal", speed, input.airTemp, input.trackTemp, input.rain, 1);
    const wear = wearPerLap(tyre, tyre.compound, input.pace ?? "normal", input.tyreMode ?? "normal", input.driver, input.circuit.abrasividade, input.rain, input.trackTemp) *
      (1.08 - input.car.gestaoPneus * 0.0016);
    tyre.wear = clamp(tyre.wear + wear, 0, 100);
    tyre.ageLaps += 1;
    if (Math.abs(tyre.temp - COMPOUNDS[tyre.compound].optimalTemp) > 8) warmupLaps += 1;
    fuelKg = Math.max(0, fuelKg - track.length * (FUEL_CONSUMPTION_PER_METER + (input.pace === "attack" ? FUEL_ATTACK_EXTRA : 0)));
  }
  const lastWear = Math.max(0.1, wearPerLap(tyre, tyre.compound, input.pace ?? "normal", input.tyreMode ?? "normal", input.driver, input.circuit.abrasividade, input.rain, input.trackTemp));
  const remainingLaps = tyre.wear >= 85 ? 0 : Math.max(0, Math.floor((85 - tyre.wear) / lastWear));
  return {
    compound: tyre.compound,
    startLap: input.startLap,
    endLap: input.startLap + Math.max(1, Math.round(input.laps)),
    laps: Math.max(1, Math.round(input.laps)),
    endWear: tyre.wear,
    remainingLaps,
    averageLapTime: totalTime / Math.max(1, Math.round(input.laps)),
    warmupLaps,
    risk: clamp(Math.max(0, tyre.wear - 62) / 38 + (remainingLaps <= 2 ? 0.2 : 0), 0, 1),
  };
}

export function projectRaceStrategy(params: {
  plan: RaceStrategyPlan;
  circuit: CircuitData;
  car: CarAttributes;
  driver: DriverAttributes;
  setup: { downforce: number; focus: "qualifying" | "balanced" | "race" };
  rain: number;
  trackTemp: number;
  airTemp: number;
  pitCrew: number;
  inventory?: Record<Compound, number>;
  trackStatus?: "green" | "sc" | "vsc";
}): RaceStrategyProjection {
  let startLap = 0;
  let fuelKg = requiredFuelKg(params.circuit, params.plan.stints.reduce((total, stint) => total + stint.laps, 0));
  const fuelStartKg = fuelKg;
  const pitLaps = planPitLaps(params.plan);
  const pitLoss = estimatePitLoss(params.circuit, params.pitCrew, params.trackStatus ?? "green");
  const stints: TyreProjection[] = [];
  for (const stint of params.plan.stints) {
    const tyre = initialTyre(stint.compound);
    const projection = projectStint({
      circuit: params.circuit,
      car: params.car,
      driver: params.driver,
      setup: params.setup,
      tyre,
      laps: stint.laps,
      startLap,
      rain: params.rain,
      trackTemp: params.trackTemp,
      airTemp: params.airTemp,
      fuelKg,
      fuelStartKg,
    });
    stints.push(projection);
    startLap += stint.laps;
    fuelKg = Math.max(0, fuelKg - params.circuit.comprimentoM * stint.laps * FUEL_CONSUMPTION_PER_METER);
  }
  const totalTime = stints.reduce((total, stint) => total + stint.averageLapTime * stint.laps, 0) + pitLoss * Math.max(0, stints.length - 1);
  const risk = clamp(
    Math.max(...stints.map((stint) => stint.risk)) +
      (params.inventory && params.plan.stints.some((stint) => (params.inventory![stint.compound] ?? 0) <= 0) ? 0.25 : 0),
    0,
    1,
  );
  return { stints, pitLaps, pitLoss, totalTime, risk };
}

export function projectPitGain(params: {
  pitLoss: number;
  oldLapTime: number;
  newLapTime: number;
  laps: number;
  trafficLoss?: number;
  warmupLoss?: number;
}): number {
  return (params.oldLapTime - params.newLapTime) * Math.max(1, params.laps) - params.pitLoss - (params.trafficLoss ?? 0) - (params.warmupLoss ?? 0);
}

export function projectUndercut(params: {
  pitLoss: number;
  oldLapTime: number;
  newLapTime: number;
  laps: number;
  trafficLoss?: number;
  warmupLoss?: number;
}): number {
  return projectPitGain(params);
}

export function projectOvercut(params: {
  pitLoss: number;
  oldLapTime: number;
  newLapTime: number;
  laps: number;
  trafficLoss?: number;
  warmupLoss?: number;
}): number {
  return projectPitGain(params);
}

export function projectTyreLife(params: {
  tyre: TyreState;
  circuit: CircuitData;
  car: CarAttributes;
  driver: DriverAttributes;
  setup: { downforce: number; focus: "qualifying" | "balanced" | "race" };
  rain: number;
  trackTemp: number;
  airTemp: number;
  remainingLaps: number;
  pace?: PaceMode;
  tyreMode?: TyreMode;
}): TyreProjection {
  const tyre: TyreState = { ...params.tyre, usedCompounds: [...params.tyre.usedCompounds] };
  const track = buildTrack(params.circuit);
  const limit = Math.max(1, Math.min(params.remainingLaps, 60));
  let laps = 0;
  let totalTime = 0;
  let warmupLaps = 0;
  while (laps < limit && tyre.wear < 85) {
    const lapTime = estimateLapTime({
      circuit: params.circuit,
      car: params.car,
      driver: params.driver,
      setup: params.setup,
      tyre,
      rain: params.rain,
      fuelKg: 20,
      fuelStartKg: 20,
      pace: params.pace,
      tyreMode: params.tyreMode,
    });
    totalTime += lapTime;
    const speed = track.length / Math.max(30, lapTime);
    tyre.temp = updateTyreTemperature(tyre, params.pace ?? "normal", params.tyreMode ?? "normal", speed, params.airTemp, params.trackTemp, params.rain, 1);
    const wear = wearPerLap(tyre, tyre.compound, params.pace ?? "normal", params.tyreMode ?? "normal", params.driver, params.circuit.abrasividade, params.rain, params.trackTemp) *
      (1.08 - params.car.gestaoPneus * 0.0016);
    tyre.wear = clamp(tyre.wear + wear, 0, 100);
    tyre.ageLaps += 1;
    if (Math.abs(tyre.temp - COMPOUNDS[tyre.compound].optimalTemp) > 8) warmupLaps += 1;
    laps += 1;
  }
  return {
    compound: tyre.compound,
    startLap: 0,
    endLap: laps,
    laps,
    endWear: tyre.wear,
    remainingLaps: laps,
    averageLapTime: totalTime / Math.max(1, laps),
    warmupLaps,
    risk: clamp(Math.max(0, tyre.wear - 62) / 38 + (laps <= 2 ? 0.2 : 0), 0, 1),
  };
}

export interface RecommendationContext {
  lap: number;
  totalLaps: number;
  tyreWear: number;
  tyreAge: number;
  remainingLaps: number;
  plannedPitLap: number | null;
  windowStart: number | null;
  windowEnd: number | null;
  fuelKg: number;
  fuelPerLap: number;
  energy: number;
  rain: number;
  nextRainLap: number;
  trackStatus: "green" | "sc" | "vsc" | "chequered";
  undercutRisk: number;
  pitLoss: number;
  compound: Compound;
}

export function recommendRaceAction(context: RecommendationContext): StrategyRecommendation | null {
  if (context.lap < 1) return null;
  const keyFor = (key: string) => `${key}:${Math.floor(context.lap / 3)}`;
  if (context.trackStatus === "sc" && context.tyreAge >= 6 && context.remainingLaps < 12) {
    return { key: keyFor("sc-pit"), lap: context.lap, severity: "success", action: "pit", message: "Safety Car: janela de pit stop vantajosa. Considere trocar os pneus." };
  }
  if (context.tyreWear >= 82) {
    return { key: keyFor("tyre-limit"), lap: context.lap, severity: "danger", action: "pit", message: `Pneus em ${Math.round(context.tyreWear)}%: risco alto de perda de desempenho.` };
  }
  if (context.tyreWear >= 70 && context.plannedPitLap != null && context.lap >= context.plannedPitLap - 2) {
    return { key: keyFor("extend"), lap: context.lap, severity: "warn", action: "extend", message: `Desgaste em ${Math.round(context.tyreWear)}%. Prolongar o stint aumenta o risco.` };
  }
  if (context.nextRainLap > 0 && context.nextRainLap - context.lap <= 3 && context.rain < 0.15) {
    return { key: keyFor("rain"), lap: context.lap, severity: "warn", action: "info", message: `Chuva prevista para a volta ${context.nextRainLap}. Prepare a troca de pneus.` };
  }
  const lapsOfFuel = context.fuelKg / Math.max(0.01, context.fuelPerLap);
  if (lapsOfFuel + 0.8 < context.totalLaps - context.lap) {
    return { key: keyFor("fuel"), lap: context.lap, severity: "danger", action: "save", message: `Combustível para ~${Math.floor(lapsOfFuel)} voltas. Reduza o consumo ou arrisque perder ritmo.` };
  }
  if (context.energy < 8 && context.lap > 3) {
    return { key: keyFor("energy"), lap: context.lap, severity: "warn", action: "save", message: "Bateria baixa: poupe energia para defender ou atacar." };
  }
  if (context.undercutRisk > 0.65 && context.windowStart != null && context.lap >= context.windowStart - 1) {
    return { key: keyFor("undercut"), lap: context.lap, severity: "warn", action: "pit", message: "Rival em zona de undercut. Considere antecipar a parada." };
  }
  return null;
}
