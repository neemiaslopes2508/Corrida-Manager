import type { CircuitData } from "../data/season2026";
import { CIRCUIT_BY_ID } from "../data/season2026";
import { createRng } from "./rng";
import { buildTrack, wrapDistance, sampleAt, type TrackModel } from "./track";
import {
  COMPOUNDS,
  compoundForConditions,
  dryCompoundsUsed,
  initialTyre,
  isWetCompound,
  tyreGrip,
  updateTyreTemperature,
  wearPerLap,
} from "./tyres";
import {
  FUEL_ATTACK_EXTRA,
  FUEL_CONSUMPTION_PER_METER,
  PIT_LANE_SPEED,
  PIT_SERVICE_BASE,
  allocateTyreInventory,
  cloneInventory,
  consumeTyreSet,
  estimateLapTime,
  estimatePitLoss,
  hasTyreSet,
  makeDefaultRacePlan,
  normalizeRacePlan,
  paceFactor,
  planPitLaps,
  projectPitGain,
  projectTyreLife,
  recommendRaceAction,
  requiredFuelKg,
  validateRacePlan,
} from "./raceStrategy";
import type {
  CarSetup,
  Compound,
  DriverRaceSpec,
  PaceMode,
  PassKind,
  RaceCar,
  RaceCommand,
  RaceConfig,
  RaceEvent,
  RaceState,
  RaceStrategyPlan,
  RaceView,
  TeamRaceSpec,
  WeatherPhase,
} from "./types";

export const RACE_STEP_SECONDS = 0.25;
const PIT_SERVICE_FRACTION = 0.985;
const FINAL_GRACE_SECONDS = 100;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const gauss = (rng: { next: () => number }) => (rng.next() + rng.next() + rng.next() - 1.5) / 1.5;

export function defaultSetup(): CarSetup {
  return { downforce: 0.6, focus: "balanced", startingCompound: "medium", fuelLoad: 1 };
}

export function createWeather(circuit: CircuitData, seed: string): WeatherPhase[] {
  const rng = createRng(`${seed}:weather`);
  const willRain = rng.chance(circuit.chanceChuva);
  const baseTemp = 22 + rng.range(0, 9);
  const phases: WeatherPhase[] = [];
  if (!willRain) {
    phases.push({ fromLap: 0, rain: 0, airTemp: Math.round(baseTemp), trackTemp: Math.round(baseTemp + 13) });
    if (rng.chance(0.35)) {
      phases.push({ fromLap: Math.floor(circuit.voltas * rng.range(0.4, 0.8)), rain: 0, airTemp: Math.round(baseTemp - 2), trackTemp: Math.round(baseTemp + 8) });
    }
    return phases;
  }
  const startRain = rng.chance(0.35) ? rng.range(0.18, 0.5) : 0;
  phases.push({ fromLap: 0, rain: startRain, airTemp: Math.round(baseTemp - 2), trackTemp: Math.round(baseTemp + 7) });
  const rainLap = Math.floor(circuit.voltas * rng.range(0.18, 0.62));
  const intensity = rng.range(0.28, 0.88);
  phases.push({ fromLap: rainLap, rain: intensity, airTemp: Math.round(baseTemp - 5), trackTemp: Math.round(baseTemp + 2) });
  if (rng.chance(0.7)) {
    phases.push({ fromLap: rainLap + Math.floor(circuit.voltas * rng.range(0.1, 0.3)), rain: intensity * rng.range(0.2, 0.6), airTemp: Math.round(baseTemp - 3), trackTemp: Math.round(baseTemp + 5) });
  }
  return phases;
}

export function describeWeather(rain: number): string {
  if (rain <= 0.03) return "Seco";
  if (rain <= 0.18) return "Garoa";
  if (rain <= 0.45) return "Chuva leve";
  if (rain <= 0.72) return "Chuva";
  return "Chuva forte";
}

interface LaunchProfile {
  reaction: number;
  traction: number;
  quality: number;
}

/**
 * Perfil de largada determinístico por piloto. Usa um fluxo de RNG próprio
 * (`seed:launch:piloto`) para não deslocar a sequência principal da corrida e
 * preservar o determinismo. Nenhuma equipe ou piloto recebe vantagem fixa:
 * reação, tração e qualidade dependem apenas dos atributos e do sorteio
 * reprodutível.
 */
function launchProfile(seed: string, driverId: string, d: DriverRaceSpec["atributos"]): LaunchProfile {
  const rng = createRng(`${seed}:launch:${driverId}`);
  const exp = clamp((d.experiencia - 50) / 50, -1, 1);
  const cons = clamp((d.consistencia - 50) / 50, -1, 1);
  const aggr = clamp((d.agressividade - 50) / 50, -1, 1);
  const baseReaction = 0.26 - exp * 0.05 - cons * 0.02;
  const spread = 0.05 * (1.3 - cons * 0.6);
  let reaction = baseReaction + rng.range(-spread, spread * 1.4);
  let traction = 1 + exp * 0.03 + cons * 0.02 + aggr * 0.01 + rng.range(-0.04, 0.04) * (1.25 - cons * 0.4);
  let quality = 0.5 + exp * 0.16 + cons * 0.12 + aggr * 0.05 + rng.range(-0.18, 0.18);
  if (rng.chance(0.04)) {
    // largada ruim: patina ou apaga o motor
    reaction += rng.range(0.1, 0.25);
    traction -= rng.range(0.05, 0.1);
    quality -= rng.range(0.2, 0.35);
  } else if (rng.chance(0.04)) {
    // largada excelente
    reaction = Math.max(0.02, reaction - rng.range(0.05, 0.12));
    traction += rng.range(0.04, 0.08);
    quality += rng.range(0.15, 0.3);
  }
  return {
    reaction: clamp(reaction, 0.04, 0.7),
    traction: clamp(traction, 0.88, 1.12),
    quality: clamp(quality, 0, 1),
  };
}

/**
 * Ritmo da volta atual. O sorteio usa um RNG próprio (`seed:lappace:piloto:volta`)
 * para não consumir a sequência principal: a variação é idêntica em saves,
 * replays e multiplayer, mas nunca é aplicada a cada tick.
 */
function ensureLapPace(state: RaceState, car: RaceCar): void {
  if (car.lapPaceLap === car.lap && car.lapPace > 0) return;
  const d = driverOf(state, car.driverId)?.atributos;
  if (!d) {
    car.lapPace = 1;
    car.lapPaceLap = car.lap;
    return;
  }
  const rng = createRng(`${state.seed}:lappace:${car.driverId}:${car.lap}`);
  const cons = clamp(d.consistencia / 100, 0, 1);
  const exp = clamp(d.experiencia / 100, 0, 1);
  const sigma = 0.0015 + (1 - cons) * 0.0045;
  let pace = 1 + gauss(rng) * 3 * sigma;
  const mistakeChance = clamp(0.014 + (1 - cons) * 0.06 - exp * 0.014, 0.005, 0.08);
  if (rng.chance(mistakeChance)) {
    // volta ruim: erro pequeno, não um abandono; a consistência e a
    // experiência reduzem a frequência, mas não eliminam o risco.
    pace -= rng.range(0.004, 0.010);
  } else if (rng.chance(0.02 + exp * 0.012)) {
    pace += rng.range(0.0015, 0.004);
  }
  car.lapPace = clamp(pace, 0.982, 1.014);
  car.lapPaceLap = car.lap;
}

/**
 * Decide se o piloto defende a posição. Defesa alta e experiência aumentam a
 * disposição; pneus gastos, dano e pilotos fora da zona de pontos reduzem o
 * risco aceitável. Jogadores mantêm defesa automática enquanto houver energia.
 */
function defenderWillFight(state: RaceState, car: RaceCar, attacker: RaceCar | null): boolean {
  if (state.playerTeams.includes(car.teamId)) return car.energy > 15;
  const d = driverOf(state, car.driverId)?.atributos;
  if (!d) return false;
  const wearRisk = clamp((car.tyre.wear - 55) / 45, 0, 1);
  const damageRisk = clamp(car.damage, 0, 1);
  const score =
    (d.defesa / 100) * 0.55 +
    (d.experiencia / 100) * 0.25 +
    (d.agressividade / 100) * 0.08 +
    (car.position <= 10 ? 0.06 : 0) +
    (attacker ? 0 : -0.2) -
    wearRisk * 0.20 -
    damageRisk * 0.15;
  return score > 0.50;
}

/** Classifica um passe legítimo que não veio de uma tentativa aleatória. */
function classifyPacePass(car: RaceCar, ahead: RaceCar, gripDelta: number): PassKind {
  if (ahead.lapPace < 0.996 && car.lapPace > 0.998) return "mistake";
  if (gripDelta > 0.006) return "tyre";
  return "pace";
}

/**
 * Registra a passagem por cada setor interpolando o instante exato dentro do
 * tick. O terceiro limite coincide com a linha de chegada; o cruzamento da
 * volta é tratado no bloco de voltas usando a mesma velocidade.
 */
function recordSectors(state: RaceState, car: RaceCar, track: TrackModel, speed: number): void {
  if (car.lap >= state.totalLaps) return;
  const boundaries = [track.sectorDistance[0], track.sectorDistance[1], track.length];
  const base = car.lap * track.length;
  for (let i = car.sectorIndex; i < boundaries.length; i++) {
    const threshold = base + boundaries[i];
    if (car.distance < threshold) break;
    const overshoot = car.distance - threshold;
    const crossingTime = Math.max(car.sectorStartTime, state.elapsed - overshoot / speed);
    const sectorTime = Math.max(0.001, crossingTime - car.sectorStartTime);
    car.sectorBuffer[i] = sectorTime;
    car.bestSectors[i] = car.bestSectors[i] == null ? sectorTime : Math.min(car.bestSectors[i]!, sectorTime);
    car.sectorStartTime = crossingTime;
    car.sectorIndex = i + 1;
  }
}

/**
 * Aplica uma infração de limites de pista com tratamento progressivo: as duas
 * primeiras ocorrências geram advertência; a cada terceira ocorrência incide
 * +5s. Exportada para os testes de advertência e reincidência.
 */
export function registerTrackLimitOffence(state: RaceState, car: RaceCar): void {
  car.trackLimitWarnings += 1;
  const warnings = car.trackLimitWarnings;
  if (warnings % 3 === 0) {
    car.penalties += 5;
    car.penaltyNotes.push(`Limites de pista (reincidência ${warnings}) na volta ${car.lap} (+5s)`);
    addEvent(state, "penalty", `${carName(state, car)} recebe 5s por reincidência em limites de pista (advertência ${warnings}).`, car.driverId, "warn");
  } else {
    addEvent(state, "info", `Advertência para ${carName(state, car)}: limites de pista (${warnings}/2 antes de penalidade).`, car.driverId, "warn");
  }
}

export function createRaceState(config: RaceConfig): RaceState {
  const track = buildTrack(config.circuit);
  const rng = createRng(`${config.seed}:race`);
  const weather = config.weather.length > 0 ? config.weather : createWeather(config.circuit, config.seed);
  const startRain = weather[0]?.rain ?? 0;
  const teamMap = new Map(config.teams.map((t) => [t.teamId, t]));
  const raceFuel = requiredFuelKg(config.circuit, config.totalLaps);
  const mandatory = config.mandatoryStop && startRain < 0.15;
  const cars: RaceCar[] = [];

  config.grid.forEach((driverId, index) => {
    const spec = config.drivers.find((d) => d.driverId === driverId);
    if (!spec) return;
    const team = teamMap.get(spec.teamId);
    const setup = config.setups[driverId] ?? { ...defaultSetup(), downforce: config.circuit.downforceIdeal };
    const inventory = cloneInventory(config.tyreInventory?.[driverId] ?? allocateTyreInventory(config.circuit.sprint));
    let plan = config.strategyPlansV2?.[driverId];
    if (!plan || plan.stints.reduce((sum, stint) => sum + stint.laps, 0) !== config.totalLaps) {
      plan = makeDefaultRacePlan({
        driverId,
        totalLaps: config.totalLaps,
        circuit: config.circuit,
        startRain,
        mandatoryStop: mandatory,
        startingCompound: setup.startingCompound,
        source: config.playerTeams.includes(spec.teamId) ? "player" : "ai",
        strategyRating: team?.strategist ?? 75,
      });
    }
    plan = normalizeRacePlan({ ...plan, driverId }, config.totalLaps);
    let compound = plan.stints[0]?.compound ?? setup.startingCompound;
    if (startRain > 0.5) compound = "wet";
    else if (startRain > 0.15 && !isWetCompound(compound)) compound = "inter";
    if (!hasTyreSet(inventory, compound)) {
      const fallback = (["soft", "medium", "hard", "inter", "wet"] as Compound[]).find((candidate) => hasTyreSet(inventory, candidate));
      if (fallback) compound = fallback;
    }
    plan.stints[0] = { ...plan.stints[0], compound };
    consumeTyreSet(inventory, compound);
    if (startRain > 0.15 && plan.stints.length > 1 && !isWetCompound(plan.stints[1].compound)) {
      plan.stints[1] = { ...plan.stints[1], compound: startRain > 0.62 ? "wet" : "inter" };
    }
    const driver = spec.atributos;
    const form = 1 + gauss(rng) * 0.0012 * (1 + (100 - driver.consistencia) / 120) + ((spec.moral ?? 60) - 60) * 0.00002;
    const launch = launchProfile(config.seed, driverId, driver);
    const pitLaps = planPitLaps(plan);
    const window = plan.pitWindows[0] ?? { before: 2, after: 2 };
    const plannedPitLap = pitLaps[0] ?? null;
    const fuelMargin = Math.max(0.92, Math.min(1, setup.fuelLoad ?? 1));
    cars.push({
      driverId,
      teamId: spec.teamId,
      gridPosition: index + 1,
      position: index + 1,
      distance: -index * 8 - (index % 2) * 3,
      startOffset: -index * 8 - (index % 2) * 3,
      speed: 0,
      form,
      launchReaction: launch.reaction,
      launchTraction: launch.traction,
      launchQuality: launch.quality,
      lapPace: 1,
      lapPaceLap: -1,
      attacking: false,
      targetDriverId: null,
      attackStartedAt: null,
      overtakeAttempts: 0,
      attackAttempts: 0,
      disputePhase: "none",
      disputeStartedAt: null,
      passKind: null,
      paceAdvantageTicks: 0,
      defending: false,
      defendTargetId: null,
      defendStartedAt: null,
      counterUntil: 0,
      sideBySideTicks: 0,
      defendedAttempts: 0,
      lap: 0,
      status: "running",
      finishTime: null,
      retiredReason: null,
      lapStartTime: 0,
      lastLap: null,
      bestLap: null,
      lapTimes: [],
      sectors: [null, null, null],
      bestSectors: [null, null, null],
      sectorBuffer: [null, null, null],
      sectorStartTime: 0,
      sectorIndex: 0,
      tyre: initialTyre(compound),
      fuelKg: raceFuel * fuelMargin,
      fuelStartKg: raceFuel * fuelMargin,
      energy: 95,
      pace: "normal",
      energyMode: "normal",
      tyreMode: "normal",
      nextCompound: plan.stints[1]?.compound ?? (startRain > 0.45 ? "wet" : "medium"),
      pit: { plannedLap: plannedPitLap, requested: false, state: "none", timer: 0, stops: 0, serviceTime: 0, lastStopLap: null, lapDelta: 0 },
      penalties: 0,
      penaltyNotes: [],
      trackLimitWarnings: 0,
      contactWarnings: 0,
      dangerousWarnings: 0,
      damage: 0,
      overtakeMode: false,
      overtakeCooldown: 0,
      defendingUntil: 0,
      attackLane: 0,
      lane: 0,
      positionGapAhead: 0,
      positionGapLeader: 0,
      incidents: 0,
      strategy: {
        plan,
        stintIndex: 0,
        plannedPitLap,
        windowStart: plannedPitLap == null ? null : Math.max(1, plannedPitLap - window.before),
        windowEnd: plannedPitLap == null ? null : Math.min(config.totalLaps, plannedPitLap + window.after),
        version: plan.version,
        lastAdviceKey: null,
        lastAdviceLap: -1,
      },
      tyreInventory: inventory,
      advice: null,
      lastAdviceLap: -1,
      lastAdviceKey: null,
    });
  });

  const state: RaceState = {
    seed: config.seed,
    rngState: rng.getState(),
    tick: 0,
    stepMs: RACE_STEP_SECONDS * 1000,
    elapsed: 0,
    circuitId: config.circuit.id,
    trackKey: config.circuit.trackKey,
    totalLaps: config.totalLaps,
    isSprint: config.isSprint,
    status: "running",
    trackStatus: config.initialTrackStatus ?? "green",
    trackStatusUntil: 0,
    trackStatusUntilLap: null,
    weather: {
      rain: startRain,
      condition: describeWeather(startRain),
      airTemp: weather[0]?.airTemp ?? 26,
      trackTemp: weather[0]?.trackTemp ?? 40,
      forecast: weather,
      nextChangeLap: weather[1]?.fromLap ?? -1,
      wetDeclared: startRain > 0.15,
    },
    cars,
    teams: config.teams,
    drivers: config.drivers,
    setups: config.setups,
    events: [],
    nextEventId: 1,
    leaderLap: 0,
    finishOrder: [],
    fastestLap: null,
    mandatoryStop: config.mandatoryStop && startRain < 0.15,
    playerTeams: config.playerTeams,
    startedAt: 0,
    endedAt: null,
    scLaps: 0,
    lastScLap: 0,
    safetyCarDeployed: 0,
  };

  addEvent(state, "start", `Largada do ${config.isSprint ? "Sprint" : "GP"} — ${config.totalLaps} voltas.`, undefined, "info");
  if (config.initialTrackStatus === "sc") {
    state.trackStatusUntil = 3 * config.circuit.baseLapTime;
    state.trackStatusUntilLap = 3;
    addEvent(state, "sc", "Safety Car no início por pista molhada.", undefined, "warn");
  }
  // Planos legados de uma parada continuam aceitos quando não há plano V1.3.
  if (config.strategyPlans) {
    for (const car of state.cars) {
      const legacyLap = config.strategyPlans[car.driverId];
      if (car.strategy.plan.source === "player" && legacyLap != null && legacyLap > 0 && legacyLap < config.totalLaps && car.strategy.plan.stints.length === 2) {
        const first = { ...car.strategy.plan.stints[0], laps: legacyLap };
        const second = { ...car.strategy.plan.stints[1], laps: config.totalLaps - legacyLap };
        car.strategy.plan = normalizeRacePlan({ ...car.strategy.plan, stints: [first, second] }, config.totalLaps);
        car.strategy.plannedPitLap = legacyLap;
        car.strategy.windowStart = Math.max(1, legacyLap - 2);
        car.strategy.windowEnd = Math.min(config.totalLaps, legacyLap + 2);
        car.pit.plannedLap = legacyLap;
      }
    }
  }
  updatePositions(state);
  return state;
}

function addEvent(
  state: RaceState,
  type: RaceEvent["type"],
  message: string,
  driverId?: string,
  severity: RaceEvent["severity"] = "info",
  adviceKey?: string,
): void {
  state.events.push({
    id: state.nextEventId++,
    time: state.elapsed,
    tick: state.tick,
    lap: Math.max(0, state.leaderLap),
    type,
    message,
    driverId,
    severity,
    adviceKey,
  });
  if (state.events.length > 400) state.events.splice(0, state.events.length - 400);
}

function teamOf(state: RaceState, teamId: string): TeamRaceSpec | undefined {
  return state.teams.find((t) => t.teamId === teamId);
}

function driverOf(state: RaceState, driverId: string): DriverRaceSpec | undefined {
  return state.drivers.find((d) => d.driverId === driverId);
}

function carName(state: RaceState, car: RaceCar): string {
  return driverOf(state, car.driverId)?.nome ?? car.driverId;
}

function tyreForNext(car: RaceCar, target: Compound): void {
  const previous = car.tyre;
  const used = [...previous.usedCompounds];
  if (!used.includes(target)) used.push(target);
  car.tyre = initialTyre(target);
  car.tyre.usedCompounds = used;
  car.tyre.stints = previous.stints + 1;
  // Pneus recém-colocados saem frios; o aquecimento depende do composto,
  // do ritmo e da temperatura da pista.
  car.tyre.temp = COMPOUNDS[target].optimalTemp - 28;
}

function availableCompound(car: RaceCar, preferred: Compound, rain: number): Compound {
  if (hasTyreSet(car.tyreInventory, preferred)) return preferred;
  const order: Compound[] = rain > 0.55
    ? ["wet", "inter", "medium", "hard", "soft"]
    : rain > 0.15
      ? ["inter", "wet", "medium", "hard", "soft"]
      : ["soft", "medium", "hard", "inter", "wet"];
  return order.find((compound) => hasTyreSet(car.tyreInventory, compound)) ?? preferred;
}

function advanceStint(state: RaceState, car: RaceCar, circuit: CircuitData): void {
  car.strategy.stintIndex += 1;
  const currentStint = car.strategy.plan.stints[car.strategy.stintIndex];
  const nextStint = car.strategy.plan.stints[car.strategy.stintIndex + 1];
  const nextPit = currentStint && nextStint ? car.lap + currentStint.laps : null;
  if (nextPit != null && nextPit > car.lap && nextPit <= state.totalLaps) {
    const window = car.strategy.plan.pitWindows[car.strategy.stintIndex] ?? { before: 2, after: 2 };
    car.strategy.plannedPitLap = nextPit;
    car.strategy.windowStart = Math.max(1, nextPit - window.before);
    car.strategy.windowEnd = Math.min(state.totalLaps, nextPit + window.after);
    car.pit.plannedLap = nextPit;
    car.nextCompound = nextStint?.compound ?? car.nextCompound;
  } else {
    car.strategy.plannedPitLap = null;
    car.strategy.windowStart = null;
    car.strategy.windowEnd = null;
    car.pit.plannedLap = null;
  }
  void circuit;
}

function ensureRaceState(state: RaceState): void {
  if (state.trackStatusUntilLap === undefined) state.trackStatusUntilLap = null;
  for (const car of state.cars) {
    if (!car.tyreInventory) car.tyreInventory = allocateTyreInventory(state.isSprint);
    if (!car.strategy || !car.strategy.plan) {
      const team = state.teams.find((entry) => entry.teamId === car.teamId);
      const setup = state.setups[car.driverId] ?? defaultSetup();
      const plan = makeDefaultRacePlan({
        driverId: car.driverId,
        totalLaps: state.totalLaps,
        circuit: circuitStub(state),
        startRain: state.weather.rain,
        mandatoryStop: state.mandatoryStop,
        startingCompound: car.tyre.compound,
        source: state.playerTeams.includes(car.teamId) ? "player" : "ai",
        strategyRating: team?.strategist ?? 75,
      });
      car.strategy = {
        plan,
        stintIndex: 0,
        plannedPitLap: planPitLaps(plan)[0] ?? null,
        windowStart: planPitLaps(plan)[0] ? Math.max(1, planPitLaps(plan)[0] - 2) : null,
        windowEnd: planPitLaps(plan)[0] ? Math.min(state.totalLaps, planPitLaps(plan)[0] + 2) : null,
        version: plan.version,
        lastAdviceKey: null,
        lastAdviceLap: -1,
      };
      car.pit.plannedLap = car.strategy.plannedPitLap;
    }
    if (!car.strategy.plan.stints.length) car.strategy.plan = makeDefaultRacePlan({
      driverId: car.driverId,
      totalLaps: state.totalLaps,
      circuit: circuitStub(state),
      startRain: state.weather.rain,
      mandatoryStop: state.mandatoryStop,
      startingCompound: car.tyre.compound,
    });
    if (car.advice === undefined) car.advice = null;
    if (car.lastAdviceLap == null) car.lastAdviceLap = -1;
    if (car.lastAdviceKey === undefined) car.lastAdviceKey = null;
    if (car.targetDriverId === undefined) car.targetDriverId = null;
    if (car.attackStartedAt === undefined) car.attackStartedAt = null;
    if (car.overtakeAttempts === undefined) car.overtakeAttempts = 0;
    if (car.attackAttempts === undefined) car.attackAttempts = 0;
    if (car.attacking && !car.targetDriverId) car.attacking = false;
    // compatibilidade com saves anteriores à V1.3.6A
    if (car.launchReaction == null) car.launchReaction = 0;
    if (car.launchTraction == null) car.launchTraction = 1;
    if (car.launchQuality == null) car.launchQuality = 0.5;
    // compatibilidade com saves anteriores à V1.3.6B
    if (car.lapPace == null || !Number.isFinite(car.lapPace) || car.lapPace <= 0) car.lapPace = 1;
    if (car.lapPaceLap == null) car.lapPaceLap = -1;
    if (car.disputePhase == null) car.disputePhase = car.attacking ? "attempt" : "none";
    if (car.disputeStartedAt === undefined) car.disputeStartedAt = car.attackStartedAt ?? null;
    if (car.passKind === undefined) car.passKind = car.attacking ? "attack" : null;
    if (car.paceAdvantageTicks == null) car.paceAdvantageTicks = 0;
    if (car.defending == null) car.defending = false;
    if (car.defendTargetId === undefined) car.defendTargetId = null;
    if (car.defendStartedAt === undefined) car.defendStartedAt = null;
    if (car.counterUntil == null) car.counterUntil = 0;
    if (car.sideBySideTicks == null) car.sideBySideTicks = 0;
    if (car.defendedAttempts == null) car.defendedAttempts = 0;
    if (!car.sectors) car.sectors = [null, null, null];
    if (!car.bestSectors) car.bestSectors = [null, null, null];
    if (!car.sectorBuffer) car.sectorBuffer = [null, null, null];
    if (car.sectorStartTime == null) car.sectorStartTime = car.lapStartTime ?? 0;
    if (car.sectorIndex == null) car.sectorIndex = 0;
    if (car.trackLimitWarnings == null) car.trackLimitWarnings = 0;
    if (car.contactWarnings == null) car.contactWarnings = 0;
    if (car.dangerousWarnings == null) car.dangerousWarnings = 0;
  }
}

function updateAdvice(state: RaceState): void {
  const circuit = circuitStub(state);
  for (const car of state.cars) {
    const team = teamOf(state, car.teamId);
    const pitLoss = estimatePitLoss(circuit, team?.pitCrew ?? 70, state.trackStatus === "sc" ? "sc" : state.trackStatus === "vsc" ? "vsc" : "green");
    if (car.status !== "running" || !state.playerTeams.includes(car.teamId)) {
      car.advice = null;
      continue;
    }
    if (car.lap === car.lastAdviceLap && state.tick % 48 !== 0) continue;
    const remaining = state.totalLaps - car.lap;
    const projection = projectTyreLife({
      tyre: car.tyre,
      circuit,
      car: state.teams.find((entry) => entry.teamId === car.teamId)?.car ?? { aerodinamica: 80, curvas: 80, retas: 80, energia: 80, confiabilidade: 80, gestaoPneus: 80 },
      driver: driverOf(state, car.driverId)!.atributos,
      setup: state.setups[car.driverId] ?? defaultSetup(),
      rain: state.weather.rain,
      trackTemp: state.weather.trackTemp,
      airTemp: state.weather.airTemp,
      remainingLaps: Math.max(1, remaining),
      pace: car.pace,
      tyreMode: car.tyreMode,
    });
    const nextWet = state.weather.forecast.find((phase) => phase.fromLap > car.lap && phase.rain > 0.15)?.fromLap ?? -1;
    const rivalBehind = state.cars.find((other) => other.position === car.position + 1 && other.status === "running");
    const rivalPlannedStop = rivalBehind
      ? rivalBehind.strategy.plannedPitLap != null || rivalBehind.strategy.plan.stints.length - 1 > rivalBehind.pit.stops
      : false;
    const undercutRisk = rivalBehind && rivalPlannedStop && rivalBehind.positionGapAhead < 5 && rivalBehind.tyre.ageLaps + 2 < car.tyre.ageLaps ? 0.7 : 0.2;
    const actualFuelPerLap = circuit.comprimentoM * (FUEL_CONSUMPTION_PER_METER + (car.pace === "attack" ? FUEL_ATTACK_EXTRA : 0));
    const recommendation = recommendRaceAction({
      lap: car.lap,
      totalLaps: state.totalLaps,
      raceRemainingLaps: Math.max(0, state.totalLaps - car.lap),
      tyreWear: car.tyre.wear,
      tyreAge: car.tyre.ageLaps,
      remainingLaps: projection.remainingLaps,
      plannedPitLap: car.strategy.plannedPitLap,
      windowStart: car.strategy.windowStart,
      windowEnd: car.strategy.windowEnd,
      fuelKg: car.fuelKg,
      fuelPerLap: actualFuelPerLap,
      energy: car.energy,
      rain: state.weather.rain,
      nextRainLap: nextWet,
      trackStatus: state.trackStatus,
      undercutRisk,
      rivalPlannedStop,
      pitLoss,
      compound: car.tyre.compound,
    });
    if (recommendation) {
      const changed = recommendation.key !== car.lastAdviceKey;
      car.advice = recommendation;
      if (changed) {
        car.lastAdviceKey = recommendation.key;
        car.lastAdviceLap = car.lap;
        addEvent(
          state,
          "info",
          `${carName(state, car)}: ${recommendation.message}`,
          car.driverId,
          recommendation.severity === "danger" ? "danger" : recommendation.severity === "success" ? "success" : "warn",
          recommendation.key,
        );
      }
    } else {
      car.advice = null;
      // Rearma a condição: se ela voltar depois de desaparecer, o aviso pode
      // ser emitido novamente; enquanto persistir, não há repetição.
      car.lastAdviceKey = null;
    }
  }
}

interface RaceOrderSnapshot {
  running: Set<string>;
  rank: Map<string, number>;
  aheadId: Map<string, string | null>;
  pit: Map<string, boolean>;
  lap: Map<string, number>;
  distance: Map<string, number>;
}

function captureRaceOrder(state: RaceState): RaceOrderSnapshot {
  const running = state.cars
    .filter((car) => car.status === "running")
    .sort((a, b) => a.position - b.position);
  return {
    running: new Set(running.map((car) => car.driverId)),
    rank: new Map(running.map((car, index) => [car.driverId, index])),
    aheadId: new Map(running.map((car, index) => [car.driverId, index > 0 ? running[index - 1].driverId : null])),
    pit: new Map(state.cars.map((car) => [car.driverId, car.pit.state !== "none"])),
    lap: new Map(state.cars.map((car) => [car.driverId, car.lap])),
    distance: new Map(state.cars.map((car) => [car.driverId, car.distance])),
  };
}

function endAttack(car: RaceCar, cooldown: number): void {
  car.attacking = false;
  car.targetDriverId = null;
  car.attackStartedAt = null;
  car.attackLane = 0;
  car.overtakeMode = false;
  car.disputePhase = "none";
  car.disputeStartedAt = null;
  car.passKind = null;
  car.paceAdvantageTicks = 0;
  car.overtakeCooldown = Math.max(car.overtakeCooldown, cooldown);
}

/**
 * Garante que nenhum carro atravesse o rival que estava imediatamente à frente
 * no início do tick sem estar atacando. Roda depois de todos os updates para
 * que a distância do rival seja a final daquele tick, evitando inversões por
 * leitura defasada. Um atacante pode avançar no máximo 1,5 m além do seu alvo
 * direto, o que impede saltos em cadeia.
 */
function enforceFollowingOrder(state: RaceState, before: RaceOrderSnapshot): void {
  const backoff = state.leaderLap === 0 ? 3.5 : 2.5;
  for (const driverId of before.running) {
    const car = state.cars.find((entry) => entry.driverId === driverId);
    if (!car || car.status !== "running" || car.pit.state !== "none") continue;
    const aheadId = before.aheadId.get(driverId);
    if (!aheadId) continue;
    const ahead = state.cars.find((entry) => entry.driverId === aheadId);
    if (!ahead || ahead.status !== "running" || ahead.pit.state !== "none" || ahead.lap !== car.lap) continue;
    // O carro nunca é movido para trás: o bloqueio limita apenas o avanço do
    // tick. Assim o rival à frente também nunca recua e a ordem não inverte
    // por leitura defasada.
    const start = before.distance.get(driverId) ?? car.distance;
    const attackingAhead = car.attacking && car.targetDriverId === aheadId;
    // Passe legítimo sem tentativa prévia: o carro estava atrás no início do
    // tick, cruzou o rival direto e tinha vantagem real de velocidade, ritmo ou
    // pneus. A inversão fantasma (sem vantagem) continua bloqueada.
    const gripEdge = tyreGrip(car.tyre, state.weather.rain) - tyreGrip(ahead.tyre, state.weather.rain);
    const paceEdge =
      car.speed > ahead.speed * 1.001 ||
      gripEdge > 0.004 ||
      car.lapPace > ahead.lapPace + 0.003;
    const sustainedEdge = car.paceAdvantageTicks >= (state.leaderLap === 0 ? 0 : 1);
    const pacePass =
      !attackingAhead &&
      car.distance > ahead.distance &&
      start < ahead.distance &&
      paceEdge &&
      sustainedEdge;
    if (pacePass) {
      car.attacking = true;
      car.targetDriverId = aheadId;
      car.attackStartedAt = state.elapsed;
      car.disputePhase = "attempt";
      car.passKind = gripEdge > 0.006 ? "tyre" : ahead.lapPace < 0.9985 && car.lapPace > 0.999 ? "mistake" : "pace";
      // Passe por ritmo não é uma tentativa de ataque: não consome a cota de
      // tentativas nem exige bateria. A ultrapassagem ainda é registrada.
      car.defendingUntil = Math.max(car.defendingUntil, state.elapsed + 1.0);
    }
    const canCross = attackingAhead || pacePass;
    let ceiling = canCross ? ahead.distance + 1.5 : ahead.distance - backoff;
    if (canCross) {
      // Não permite saltar dois carros no mesmo tick: o atacante ainda precisa
      // deixar espaço para o rival seguinte.
      const nextAheadId = before.aheadId.get(aheadId);
      const nextAhead = nextAheadId ? state.cars.find((entry) => entry.driverId === nextAheadId) : undefined;
      if (nextAhead && nextAhead.status === "running" && nextAhead.pit.state === "none" && nextAhead.lap === car.lap) {
        ceiling = Math.min(ceiling, nextAhead.distance - backoff);
      }
    }
    car.distance = Math.min(car.distance, Math.max(start, ceiling));
  }
}

/**
 * Detecta ultrapassagens reais depois que todas as distâncias do tick foram
 * atualizadas. Inversões de ordem só contam quando os dois carros estão em
 * pista, na mesma volta e nenhum deles está no pit lane.
 */
function resolveRacePasses(state: RaceState, before: RaceOrderSnapshot): void {
  // Ultrapassar sob Safety Car/VSC é ilegal; nenhuma troca de posição deve
  // virar evento oficial enquanto a pista não estiver verde.
  if (state.trackStatus !== "green") return;
  const afterRunning = state.cars
    .filter((car) => car.status === "running")
    .sort((a, b) => a.position - b.position);
  const afterRank = new Map(afterRunning.map((car, index) => [car.driverId, index]));
  const common = [...before.running].filter((driverId) => afterRank.has(driverId));

  for (let i = 0; i < common.length; i++) {
    for (let j = i + 1; j < common.length; j++) {
      const a = common[i];
      const b = common[j];
      const beforeSign = Math.sign((before.rank.get(a) ?? 0) - (before.rank.get(b) ?? 0));
      const afterSign = Math.sign((afterRank.get(a) ?? 0) - (afterRank.get(b) ?? 0));
      if (beforeSign === 0 || afterSign === 0 || beforeSign === afterSign) continue;

      const carA = state.cars.find((car) => car.driverId === a);
      const carB = state.cars.find((car) => car.driverId === b);
      if (!carA || !carB) continue;
      const passer = (afterRank.get(a) ?? 0) < (afterRank.get(b) ?? 0) ? carA : carB;
      const passed = passer === carA ? carB : carA;
      const pitInvolved =
        passer.pit.state !== "none" ||
        passed.pit.state !== "none" ||
        before.pit.get(passer.driverId) ||
        before.pit.get(passed.driverId);
      if (pitInvolved) continue;
      if (passer.lap !== passed.lap) continue;
      // A ordem já é protegida por enforceFollowingOrder; qualquer diferença
      // positiva de distância representa uma passagem real. O limiar antigo de
      // 0,5 m descartava ultrapassagens legítimas feitas no limite do tick.
      if (passer.distance <= passed.distance + 0.01) continue;
      // Uma inversão só é uma ultrapassagem genuína se o carro passado era o
      // adversário imediatamente à frente no início do tick. Isso evita que
      // carros "peguem carona" em uma disputa alheia e subam na ordem sem
      // disputar posição (passes fantasmas).
      const expectedAhead = before.aheadId.get(passer.driverId);
      if (expectedAhead !== passed.driverId) continue;

      const passKind = passer.passKind ?? "attack";
      const attackSuccess = passer.attacking && passer.targetDriverId === passed.driverId && passKind === "attack";
      const counterAttack = passer.counterUntil > state.elapsed;
      const suffix = passKind === "pace"
        ? " por diferença de ritmo."
        : passKind === "tyre"
          ? " com melhor gestão de pneus."
          : passKind === "mistake"
            ? " após erro do rival."
            : "!";
      addEvent(state, "overtake", `${carName(state, passer)} ultrapassa ${carName(state, passed)}${suffix}`, passer.driverId, "success");
      const passEvent = state.events[state.events.length - 1];
      passEvent.passedDriverId = passed.driverId;
      passEvent.attackSuccess = attackSuccess;
      passEvent.passKind = passKind;
      passEvent.counterAttack = counterAttack;
      // O carro passado pode responder, mas não no tick seguinte: a posição
      // precisa se estabilizar por alguns segundos antes de uma nova disputa.
      passed.counterUntil = Math.max(passed.counterUntil, state.elapsed + 7.0);
      passed.overtakeCooldown = Math.max(passed.overtakeCooldown, 2.5);
      passed.defending = false;
      passed.defendTargetId = null;
      passed.defendStartedAt = null;
      passer.counterUntil = 0;
      endAttack(passer, passKind === "attack" ? 4.0 : 3.0);
    }
  }
}

function resolveAttacks(state: RaceState): void {
  const attackersByTarget = new Map<string, RaceCar>();
  for (const car of state.cars) {
    if (!car.attacking) {
      if (car.targetDriverId) car.targetDriverId = null;
      if (car.disputePhase === "attempt" || car.disputePhase === "sideBySide") car.disputePhase = "none";
      continue;
    }
    if (car.status !== "running" || car.pit.state !== "none") {
      endAttack(car, 1.0);
      continue;
    }
    const target = car.targetDriverId
      ? state.cars.find((entry) => entry.driverId === car.targetDriverId)
      : null;
    if (!target || target.status !== "running" || target.pit.state !== "none" || target.lap !== car.lap) {
      endAttack(car, 1.0);
      continue;
    }
    if (state.elapsed > car.defendingUntil) {
      target.defendedAttempts += 1;
      endAttack(car, 4.2 + (1 - (driverOf(state, car.driverId)?.atributos.experiencia ?? 50) / 100) * 1.4);
      continue;
    }
    const current = attackersByTarget.get(target.driverId);
    if (!current || car.distance > current.distance) attackersByTarget.set(target.driverId, car);
  }

  // Defesa: o alvo decide se aceita o risco. A escolha é determinística e
  // depende de defesa, experiência, agressividade, pneus e posição.
  for (const car of state.cars) {
    const attacker = attackersByTarget.get(car.driverId) ?? null;
    if (!attacker || state.trackStatus !== "green") {
      car.defending = false;
      car.defendTargetId = null;
      car.defendStartedAt = null;
      continue;
    }
    car.defending = defenderWillFight(state, car, attacker);
    if (car.defending) {
      car.defendTargetId = attacker.driverId;
      car.defendStartedAt ??= state.elapsed;
    } else {
      car.defendTargetId = null;
      car.defendStartedAt = null;
    }
  }
}

/** Avança a simulação em um passo. Muta o estado e devolve eventos novos. */
export function advanceRace(state: RaceState, dt = RACE_STEP_SECONDS): RaceEvent[] {
  if (state.status === "finished") return [];
  ensureRaceState(state);
  const before = state.events.length;
  const rng = createRng(state.seed, state.rngState);
  state.tick += 1;
  state.elapsed += dt;

  if (state.tick === 1) {
    state.startedAt = 0;
    addEvent(state, "info", "Luzes apagadas. Todos os carros em movimento.", undefined, "info");
  }

  updateWeather(state, rng);
  updateTrackStatus(state, dt);
  const beforeOrder = captureRaceOrder(state);

  for (const car of state.cars) {
    if (car.status !== "running") continue;
    car.overtakeCooldown = Math.max(0, car.overtakeCooldown - dt);
    if (state.tick % 12 === 0) aiDecisions(state, car, rng);
  }

  const runningOrder = orderCars(state.cars);
  const indexOf = new Map(runningOrder.map((c, i) => [c.driverId, i]));
  // A ordem do array de carros é estável e o gap é calculado antes de cada
  // atualização; isso mantém a janela de ataque coerente com o início do tick.
  for (const car of state.cars) {
    if (car.status !== "running") continue;
    const idx = indexOf.get(car.driverId) ?? 0;
    const ahead = idx > 0 ? runningOrder[idx - 1] : null;
    updateCar(state, car, ahead, dt, rng);
  }

  enforceFollowingOrder(state, beforeOrder);
  updatePositions(state);
  state.leaderLap = Math.max(...state.cars.map((c) => c.lap));
  resolveRacePasses(state, beforeOrder);
  resolveAttacks(state);
  if (state.trackStatus === "sc" || state.trackStatus === "vsc") {
    state.scLaps = Math.max(0, state.leaderLap - state.lastScLap);
  }
  updateAdvice(state);

  const running = state.cars.filter((c) => c.status === "running");
  const leaderFinished = state.cars.some((c) => c.status === "finished");
  if (leaderFinished && state.endedAt == null) state.endedAt = state.elapsed + FINAL_GRACE_SECONDS;
  if (running.length === 0 || (state.endedAt != null && state.elapsed >= state.endedAt)) {
    finishRace(state);
  }

  state.rngState = rng.getState();
  return state.events.slice(before);
}

function updateWeather(state: RaceState, rng: ReturnType<typeof createRng>): void {
  const lap = state.leaderLap;
  let active = state.weather.forecast[0];
  for (const phase of state.weather.forecast) if (lap >= phase.fromLap) active = phase;
  if (active && Math.abs(active.rain - state.weather.rain) > 0.004) {
    state.weather.rain = active.rain;
    state.weather.airTemp = active.airTemp;
    state.weather.trackTemp = active.trackTemp;
    if (active.rain > 0.15) state.weather.wetDeclared = true;
    const cond = describeWeather(active.rain);
    if (cond !== state.weather.condition) {
      state.weather.condition = cond;
      addEvent(state, "weather", `Mudança de tempo: ${cond.toLowerCase()} (${Math.round(active.rain * 100)}% de intensidade).`, undefined, "warn");
    }
  }
  const next = state.weather.forecast.find((p) => p.fromLap > lap);
  state.weather.nextChangeLap = next?.fromLap ?? -1;
  void rng;
}

function updateTrackStatus(state: RaceState, _dt: number): void {
  const lapReached = state.trackStatusUntilLap != null && state.leaderLap >= state.trackStatusUntilLap;
  if (state.trackStatus === "sc" && (state.elapsed >= state.trackStatusUntil || lapReached)) {
    state.trackStatus = "green";
    state.trackStatusUntilLap = null;
    addEvent(state, "green", "Safety Car entra e a corrida é relançada.", undefined, "success");
  } else if (state.trackStatus === "vsc" && (state.elapsed >= state.trackStatusUntil || lapReached)) {
    state.trackStatus = "green";
    state.trackStatusUntilLap = null;
    addEvent(state, "green", "VSC encerrado. Pista verde.", undefined, "success");
  }
}

function deploySafetyCar(state: RaceState, full: boolean): void {
  if (state.trackStatus !== "green") return;
  const circuit = circuitStub(state);
  const laps = full ? 3 : 2;
  state.trackStatus = full ? "sc" : "vsc";
  state.trackStatusUntil = state.elapsed + laps * circuit.baseLapTime;
  state.trackStatusUntilLap = state.leaderLap + laps;
  state.lastScLap = state.leaderLap;
  state.scLaps = 0;
  state.safetyCarDeployed += 1;
  addEvent(state, full ? "sc" : "vsc", full ? "ACIDENTE! Safety Car na pista." : "Virtual Safety Car decretado.", undefined, "danger");
}

function effectivePaceFactor(state: RaceState, car: RaceCar): { base: number; corner: number; straight: number } {
  const team = teamOf(state, car.teamId);
  const driver = driverOf(state, car.driverId);
  if (!team || !driver) return { base: 1, corner: 1, straight: 1 };
  return paceFactor(team.car, driver.atributos);
}

function updateCar(state: RaceState, car: RaceCar, ahead: RaceCar | null, dt: number, rng: ReturnType<typeof createRng>): void {
  const circuit = circuitStub(state);
  const track = buildTrack(circuit);
  const sample = sampleAt(track, car.distance);
  const team = teamOf(state, car.teamId);
  const driver = driverOf(state, car.driverId);
  if (!team || !driver) return;
  const setup = state.setups[car.driverId] ?? defaultSetup();
  const d = driver.atributos;
  const rain = state.weather.rain;
  const lapLength = track.length;
  const distanceInLap = wrapDistance(car.distance, lapLength);
  const pace = effectivePaceFactor(state, car);
  ensureLapPace(state, car);

  // --- pit stops ---
  let pitCap = Infinity;
  if (car.pit.plannedLap != null && car.lap >= car.pit.plannedLap - 1) {
    car.pit.requested = true;
    car.pit.plannedLap = null;
  }
  if (car.pit.state === "none" && car.pit.requested && distanceInLap >= track.pitEntry && distanceInLap < track.pitEntry + 25) {
    car.pit.state = "entering";
    car.pit.timer = 0;
    car.pit.requested = false;
    car.pit.lapDelta = estimatePitLoss(circuit, team.pitCrew, state.trackStatus === "sc" ? "sc" : state.trackStatus === "vsc" ? "vsc" : "green");
    if (!state.playerTeams.includes(car.teamId)) {
      const usedDry = dryCompoundsUsed(car.tyre);
      const planned = car.strategy.plan.stints[car.strategy.stintIndex + 1]?.compound;
      if (state.weather.rain > 0.2) {
        car.nextCompound = state.weather.rain > 0.62 ? "wet" : "inter";
      } else if (state.mandatoryStop && usedDry < 2) {
        car.nextCompound = chooseDryCompound(circuit, state.totalLaps - car.lap, car.tyre.usedCompounds);
      } else if (planned) {
        car.nextCompound = planned;
      } else if (car.nextCompound === car.tyre.compound) {
        car.nextCompound = chooseDryCompound(circuit, state.totalLaps - car.lap, car.tyre.usedCompounds);
      }
    }
    car.nextCompound = availableCompound(car, car.nextCompound, state.weather.rain);
    addEvent(state, "pit", `${carName(state, car)} entra nos boxes.`, car.driverId, "info");
  }
  if (car.pit.state === "entering") {
    pitCap = PIT_LANE_SPEED;
    if (distanceInLap >= track.length * PIT_SERVICE_FRACTION) {
      car.pit.state = "service";
      car.pit.serviceTime = PIT_SERVICE_BASE + (100 - team.pitCrew) * 0.011 + rng.range(0, 0.7);
      car.pit.timer = car.pit.serviceTime;
      car.pit.plannedLap = null;
      const target = availableCompound(car, car.nextCompound, state.weather.rain);
      consumeTyreSet(car.tyreInventory, target);
      tyreForNext(car, target);
      car.pit.stops += 1;
      car.pit.lastStopLap = car.lap + 1;
      advanceStint(state, car, circuit);
      addEvent(state, "tyre", `${carName(state, car)} troca para ${COMPOUNDS[car.tyre.compound].nome.toLowerCase()}.`, car.driverId, "info");
    }
  } else if (car.pit.state === "service") {
    pitCap = 0.7;
    car.pit.timer -= dt;
    if (car.pit.timer <= 0) car.pit.state = "exiting";
  } else if (car.pit.state === "exiting") {
    pitCap = PIT_LANE_SPEED;
    if (distanceInLap >= track.length * 0.022 && distanceInLap < track.length * 0.25) {
      car.pit.state = "none";
      addEvent(state, "pit", `${carName(state, car)} retorna à pista.`, car.driverId, "info");
    }
  }

  // --- combate / máquina de disputa ---
  const gapToAhead = ahead ? ahead.distance - car.distance : Infinity;
  const aheadOnTrack = Boolean(ahead && ahead.status === "running" && ahead.pit.state === "none");
  // Só existe disputa por posição entre carros na mesma volta e em pista.
  const sameLap = Boolean(ahead && ahead.lap === car.lap);
  // Primeira volta: a largada abre espaço para disputa, mas o motor evita que
  // diferenças de ritmo virem ultrapassagens inevitáveis antes do pelotão se
  // estabilizar. A proteção vale apenas enquanto o líder não completa a volta.
  const startPhase = state.leaderLap === 0;
  const dirtyAirGap = 7;
  const approachGap = startPhase
    ? Math.max(12, Math.min(24, car.speed * 0.38))
    : Math.max(9, Math.min(20, car.speed * 0.30));
  const prepareGap = startPhase
    ? Math.max(7.0, Math.min(11.0, car.speed * 0.17))
    : Math.max(5.8, Math.min(10.0, car.speed * 0.15));
  const attemptGap = startPhase
    ? Math.max(7.0, Math.min(8.5, car.speed * 0.14))
    : Math.max(6.0, Math.min(7.2, car.speed * 0.12));
  const overtakeRange = Boolean(aheadOnTrack && sameLap && gapToAhead > 0 && gapToAhead < Math.max(18, car.speed * 0.85) && state.trackStatus === "green");
  const underAttack = state.cars.some((other) => other !== car && other.attacking && other.targetDriverId === car.driverId && Math.abs(other.distance - car.distance) < 25);
  const attackerNow = underAttack
    ? state.cars.find((other) => other !== car && other.attacking && other.targetDriverId === car.driverId) ?? null
    : null;
  const defendingNow = underAttack &&
    (state.playerTeams.includes(car.teamId) ? car.energy > 15 : car.defending);
  const relativeSpeed = ahead ? car.speed - ahead.speed : 0;
  const gripDelta = ahead ? tyreGrip(car.tyre, rain) - tyreGrip(ahead.tyre, rain) : 0;
  const aheadDriver = ahead ? driverOf(state, ahead.driverId) : undefined;
  const defenderSkill = ahead
    ? clamp((aheadDriver?.atributos.defesa ?? 70) / 100, 0, 1)
    : 0;
  // Vantagem potencial calculada antes do ar sujo limitar a velocidade real.
  // Sem isso, o carro mais rápido nunca "parece" mais rápido preso atrás.
  const pacePotential = ahead && aheadDriver
    ? (d.velocidade - aheadDriver.atributos.velocidade) * 0.00025 +
      (car.form - ahead.form) +
      (car.lapPace - ahead.lapPace) * 0.7 +
      gripDelta * 0.6 +
      (car.pace === "attack" ? 0.003 : 0)
    : 0;
  const personality = {
    experience: clamp(d.experiencia / 100, 0, 1),
    consistency: clamp(d.consistencia / 100, 0, 1),
    aggression: clamp(d.agressividade / 100, 0, 1),
    overtaking: clamp(d.ultrapassagem / 100, 0, 1),
    defense: clamp(d.defesa / 100, 0, 1),
  };
  const passScore = aheadOnTrack && sameLap
    ? clamp(
        (relativeSpeed / Math.max(14, car.speed)) * 4.2 +
        gripDelta * 24 +
        (personality.overtaking - 0.65) * 0.22 +
        (personality.aggression - 0.5) * 0.12 +
        (personality.experience - 0.5) * 0.10 +
        pacePotential * 30 +
        (sample.straight - 0.25) * 0.55 +
        (car.energy / 100) * 0.18 -
        defenderSkill * 0.28 +
        (state.elapsed < car.counterUntil ? 0.22 : 0),
        0,
        2,
      )
    : 0;

  const startAttempt = (kind: PassKind): void => {
    if (!ahead) return;
    car.attacking = true;
    car.targetDriverId = ahead.driverId;
    car.attackStartedAt = state.elapsed;
    if (car.disputeStartedAt == null) car.disputeStartedAt = state.elapsed;
    car.disputePhase = "attempt";
    car.passKind = kind;
    car.overtakeAttempts += 1;
    if (kind === "attack") car.attackAttempts += 1;
    car.paceAdvantageTicks = 0;
    car.defendingUntil = state.elapsed + (kind === "attack" ? 5.6 : 5.2) +
      (1 - circuit.dificuldadeUltrapassagem) * 0.6 + (car.energy / 100) * 0.3;
  };

  if (car.attacking) {
    const target = car.targetDriverId
      ? state.cars.find((entry) => entry.driverId === car.targetDriverId) ?? null
      : null;
    if (!target || target !== ahead || target.status !== "running" || target.pit.state !== "none" || target.lap !== car.lap) {
      endAttack(car, 1.5);
    } else if (state.elapsed > car.defendingUntil) {
      target.defendedAttempts += 1;
      endAttack(car, 3.0);
    } else if (gapToAhead < 2.2) {
      // Lado a lado: a disputa continua por mais de uma curva sem trocar a
      // ordem por oscilações mínimas.
      car.disputePhase = "sideBySide";
      car.sideBySideTicks += 1;
    } else if (gapToAhead > 18) {
      endAttack(car, 2.0);
    }
  } else if (
    state.trackStatus === "green" &&
    aheadOnTrack &&
    sameLap &&
    ahead &&
    gapToAhead > 0 &&
    gapToAhead < approachGap &&
    car.pit.state === "none" &&
    car.energy > 12 &&
    car.overtakeCooldown <= 0
  ) {
    if (car.disputePhase === "none" || car.targetDriverId !== ahead.driverId) {
      car.disputePhase = "approach";
      car.targetDriverId = ahead.driverId;
      car.disputeStartedAt = state.elapsed;
    }
    // Uma vantagem sustentada por cerca de 1 s vira oportunidade real de
    // passe, mesmo sem um ataque aleatório prévio. Isso devolve passes
    // legítimos por ritmo e pneus sem liberar inversões fantasmas.
    const sustained = gapToAhead < 10 &&
      (pacePotential > 0.0002 || relativeSpeed > (startPhase ? 0.30 : 0.50) || gripDelta > (startPhase ? 0.004 : 0.008));
    car.paceAdvantageTicks = sustained ? car.paceAdvantageTicks + 1 : Math.max(0, car.paceAdvantageTicks - 1);
    if (car.disputePhase === "approach" && gapToAhead < prepareGap && passScore > 0.10) {
      car.disputePhase = "prepare";
    }
    const prepareTime = startPhase ? 0.20 : 0.40;
    const prepared = car.disputePhase === "prepare" && state.elapsed - (car.disputeStartedAt ?? state.elapsed) >= prepareTime;
    const paceTicks = state.elapsed < car.counterUntil ? 2 : startPhase ? 1 : 2;
    const paceReady = car.paceAdvantageTicks >= paceTicks && gapToAhead < attemptGap;
    if ((prepared && gapToAhead < attemptGap && passScore > (startPhase ? 0.10 : 0.18)) || paceReady) {
      startAttempt(paceReady ? classifyPacePass(car, ahead, gripDelta) : "attack");
    } else {
      const chance =
        (startPhase ? 0.010 : 0.0015) *
        (0.55 + personality.aggression * 0.9) *
        (0.65 + personality.overtaking * 0.7) *
        (0.55 + sample.straight) *
        (1.25 - circuit.dificuldadeUltrapassagem * 0.45) *
        (startPhase ? 2.5 : 1) *
        (passScore > 0.40 ? 1.4 : 0.55) *
        (car.energy > 30 ? 1.1 : 0.75);
      const launchBattle = startPhase &&
        state.elapsed < 35 &&
        gapToAhead < 8 &&
        car.energy > 15 &&
        (car.launchQuality - (ahead.launchQuality ?? 0.5) > 0.04 ||
          car.launchTraction - (ahead.launchTraction ?? 1) > 0.01 ||
          personality.aggression > 0.62);
      const launchEdge = startPhase &&
        state.elapsed < 40 &&
        gapToAhead < 8 &&
        (
          car.launchQuality - (ahead.launchQuality ?? 0.5) > 0.04 ||
          car.launchTraction - (ahead.launchTraction ?? 1) > 0.012 ||
          (personality.aggression > 0.60 && car.launchQuality < (ahead.launchQuality ?? 0.5) - 0.04)
        );
      if (
        gapToAhead < (startPhase ? 7.5 : 4.5) &&
        passScore > (startPhase ? 0.10 : 0.32) &&
        rng.chance(Math.max(0, chance))
      ) {
        startAttempt("attack");
      } else if (launchEdge) {
        // Disputa de largada: diferenças reais de reação/tração e agressividade
        // viram uma tentativa; o resultado ainda depende de fechar a distância.
        startAttempt("attack");
      } else if (launchBattle && rng.chance(0.010 * (0.5 + personality.aggression) * (0.6 + personality.overtaking))) {
        startAttempt("attack");
      }
    }
  } else if (
    !car.attacking &&
    car.disputePhase !== "defend" &&
    car.disputePhase !== "counter" &&
    car.disputePhase !== "none"
  ) {
    car.disputePhase = "none";
    car.disputeStartedAt = null;
    car.targetDriverId = null;
    car.paceAdvantageTicks = 0;
  }

  let attackBonus = 0;
  if (car.attacking) {
    const target = car.targetDriverId ? state.cars.find((entry) => entry.driverId === car.targetDriverId) : null;
    const targetDriver = target ? driverOf(state, target.driverId) : undefined;
    const energyFactor = clamp(car.energy / 100, 0, 1);
    const defenseResistance = targetDriver
      ? clamp(1.12 - targetDriver.atributos.defesa / 420, 0.82, 1.06)
      : 1;
    attackBonus =
      (0.020 + energyFactor * 0.014) *
      (1.12 - circuit.dificuldadeUltrapassagem * 0.24) *
      defenseResistance;
    // Ataques sustentados ganham embalo: o piloto constrói a aproximação e
    // não desiste no primeiro tick.
    const attackProgress = car.attackStartedAt == null
      ? 0
      : clamp((state.elapsed - car.attackStartedAt) / 4.5, 0, 1);
    attackBonus *= 1 + attackProgress * 0.50;
    // Um passe por ritmo/pneus usa menos o modo de ataque do que uma tentativa
    // deliberada; o custo de bateria também é menor.
    if (car.passKind !== "attack") attackBonus *= 0.55;
    car.energy = Math.max(0, car.energy - (car.passKind === "attack" ? 2.0 : 1.1) * dt);
  }

  // --- velocidade alvo ---
  let factor = pace.base * (pace.corner * (1 - sample.straight) + pace.straight * sample.straight);
  factor *= car.form;
  // A qualidade da largada continua influenciando a primeira volta depois que
  // a tração inicial termina: uma largada excelente rende posição, uma ruim
  // custa tempo. O efeito é determinístico e some quando o líder completa a volta.
  if (startPhase) factor *= 1 + (car.launchQuality - 0.5) * 0.018;
  // Ritmo puro da volta (determinístico) e preservação do stint por gestão de
  // pneus. Não há ruído por tick.
  factor *= car.lapPace;
  factor *= 1 - Math.max(0, car.tyre.ageLaps - 3) * 0.00016 * (1 - d.gestaoPneus / 100);
  factor *= 1 + (car.fuelStartKg - car.fuelKg) * 0.000038;
  const tyreG = tyreGrip(car.tyre, rain);
  factor *= tyreG;
  factor *= 1 - car.damage * 0.07;
  factor *= 1 + (d.chuva - 80) * 0.0015 * rain;
  if (state.elapsed < car.counterUntil) factor *= 1.0015;
  factor *= 1 + (1 - Math.abs(setup.downforce - circuit.downforceIdeal)) * 0.004;
  factor *= setup.focus === "qualifying" ? 0.9995 : setup.focus === "race" ? 1.001 : 1;
  factor *= car.pace === "attack" ? 1.011 : car.pace === "conserve" ? 0.987 : 1;
  factor *= car.tyreMode === "push" ? 1.0025 : car.tyreMode === "manage" ? 0.999 : 1;
  const energyBoost = car.energy > 8 ? (car.energyMode === "push" ? 0.0042 : car.energyMode === "save" ? -0.0016 : 0) : -0.007;
  factor *= 1 + energyBoost + (car.energy - 50) * 0.00005;
  factor *= 1 + attackBonus;
  // Overtake Mode 2026: boost elétrico/ativo quando o carro está ao alcance
  // do carro da frente, em pista verde e com bateria disponível.
  if (overtakeRange && car.energy > 22 && sample.straight > 0.18) {
    factor *= 1.005;
    car.overtakeMode = true;
  } else {
    car.overtakeMode = false;
  }
  // Defesa ativa: só o piloto que decidiu aceitar a disputa gasta bateria e
  // ganha o pequeno bônus de defesa. Quem evita o risco não recebe bônus.
  if (defendingNow && car.energy > 18 && state.trackStatus === "green") {
    factor *= 1.0015;
    car.energy = Math.max(0, car.energy - 0.4 * dt);
  }
  // ar sujo / aspiração
  if (aheadOnTrack && sameLap && gapToAhead > 0 && gapToAhead < 30) {
    const prox = 1 - gapToAhead / 30;
    factor *= 1 - prox * 0.014;
    factor *= 1 + sample.straight * prox * 0.018;
    car.tyre.temp += prox * 0.12 * dt;
  }
  // aero ativa (reta) — abstracção do regulamento 2026
  factor *= 1 + sample.straight * 0.0035;

  // curvas molhadas são mais lentas
  factor *= rain > 0.05 ? 1 - rain * 0.05 : 1;
  if (car.fuelKg <= 0.05) factor *= 0.93;

  let target = sample.speed * factor;
  // Largada: cada piloto reage em um instante próprio. Até lá o carro não é
  // empurrado por script; ele simplesmente ainda está parado.
  if (startPhase && state.elapsed < car.launchReaction) {
    target = 0;
  }
  if (state.trackStatus !== "green" && car.pit.state === "none") {
    if (car.attacking) endAttack(car, 1.0);
    car.overtakeMode = false;
    if (state.trackStatus === "sc") {
      const gap = gapToAhead;
      target = Math.min(target, gap > 80 ? 38 : gap > 40 ? 30 : gap > 15 ? 24 : 19);
    } else {
      target = Math.min(target, sample.speed * 0.82);
    }
  }
  if (car.attacking) {
    car.attackLane = clamp(car.attackLane + 2.8 * dt, 0, 1);
  } else {
    car.attackLane = Math.max(0, car.attackLane - 2.4 * dt);
  }
  if (car.pit.state !== "none") {
    target = Math.min(target, pitCap);
  } else if (!car.attacking && defendingNow && attackerNow && car.energy > 12) {
    // Defesa ativa: cobre o lado por onde o atacante está tentando passar.
    const attackerLane = clamp(attackerNow.lane + attackerNow.attackLane, 0, 1);
    const cover = attackerLane > 0.5 ? 0.62 : 0.28;
    car.lane = clamp(car.lane + clamp(cover - car.lane, -1.8 * dt, 1.8 * dt), 0, 1);
  } else if (!startPhase && aheadOnTrack && sameLap && gapToAhead > 0 && gapToAhead < dirtyAirGap && !car.attacking) {
    target = Math.min(target, Math.max(16, (ahead?.speed ?? 0) * (pacePotential > 0.0008 ? 1.010 : 0.995)));
    car.lane = Math.min(car.lane + dt * 1.2, 0.3);
  } else {
    car.lane = Math.max(0, car.lane - dt * 1.5);
  }

  if (state.trackStatus === "sc") {
    car.energy = Math.min(100, car.energy + 0.35 * dt);
  }
  // energia: colheita passiva e em frenagem, deploy conforme modo
  car.energy = Math.min(100, car.energy + 0.50 * dt);
  const braking = target < car.speed - 2;
  if (braking) car.energy = Math.min(100, car.energy + (0.95 + (car.energyMode === "save" ? 0.3 : 0)) * dt);
  car.energy = clamp(car.energy - (car.energyMode === "push" ? 0.55 : car.energyMode === "save" ? 0.10 : 0.2) * dt, 0, 100);
  if (car.overtakeMode) car.energy = Math.max(0, car.energy - 0.9 * dt);

  // dinâmica longitudinal
  // A qualidade da largada modula a tração inicial (0,92x a 1,08x). Assim os
  // três componentes do perfil têm efeito real e nenhum piloto recebe bônus
  // fixo por equipe ou fama.
  const launchAccel = startPhase && car.speed < 30
    ? 8.8 * car.launchTraction * (0.92 + 0.16 * car.launchQuality)
    : 8.8;
  const accel = target > car.speed ? launchAccel : 22;
  const delta = target - car.speed;
  const maxChange = accel * dt;
  car.speed += clamp(delta, -maxChange, maxChange);
  // Durante a reação às luzes o carro fica realmente parado; fora da largada
  // mantém-se o piso de 0,5 m/s usado pelo modelo de interpolação.
  const waitingForLights = startPhase && state.elapsed < car.launchReaction;
  car.speed = clamp(car.speed, waitingForLights ? 0 : 0.5, 100);
  const moved = car.speed * dt;
  car.distance += moved;

  // Sem ataque ativo, o carro não atravessa o carro da frente. O bloqueio é
  // aplicado depois de todos os carros atualizarem (enforceFollowingOrder),
  // para usar a distância final do rival e não uma leitura defasada.


  // combustível
  const consumption = moved * (FUEL_CONSUMPTION_PER_METER + (car.pace === "attack" ? FUEL_ATTACK_EXTRA : 0));
  car.fuelKg = Math.max(0, car.fuelKg - consumption);

  // pneus
  const wearRate = wearPerLap(car.tyre, car.tyre.compound, car.pace, car.tyreMode, d, circuit.abrasividade, rain, state.weather.trackTemp) *
    (1.08 - team.car.gestaoPneus * 0.0016);
  if (car.pit.state !== "service") {
    car.tyre.wear = clamp(car.tyre.wear + wearRate * (moved / lapLength), 0, 100);
  }
  car.tyre.temp = updateTyreTemperature(car.tyre, car.pace, car.tyreMode, car.speed, state.weather.airTemp, state.weather.trackTemp, rain, dt);
  if (car.tyre.wear > 86 && !car.tyre.punctured && rng.chance(0.000012 * (car.tyre.wear - 86))) {
    car.tyre.punctured = true;
    addEvent(state, "incident", `Pneu furado para ${carName(state, car)}!`, car.driverId, "danger");
  }

  // --- setores, voltas e chegada ---
  // A velocidade é constante durante o deslocamento do tick, então o instante
  // exato do cruzamento é recuperado por interpolação. Isso elimina a
  // quantização de 0,25 s nos tempos de volta e nos setores.
  const crossSpeed = Math.max(0.5, car.speed);
  recordSectors(state, car, track, crossSpeed);
  while (car.lap < state.totalLaps && car.distance >= (car.lap + 1) * lapLength) {
    const threshold = (car.lap + 1) * lapLength;
    const overshoot = car.distance - threshold;
    const crossingTime = Math.max(car.lapStartTime, state.elapsed - overshoot / crossSpeed);
    const lapTime = Math.max(0.001, crossingTime - car.lapStartTime);
    car.lap += 1;
    car.lapStartTime = crossingTime;
    car.lastLap = lapTime;
    car.lapTimes.push(lapTime);
    if (car.lapTimes.length > 8) car.lapTimes.shift();
    if (car.bestLap == null || lapTime < car.bestLap) car.bestLap = lapTime;
    if (car.sectorBuffer.every((value) => value != null)) car.sectors = [...car.sectorBuffer];
    car.sectorBuffer = [null, null, null];
    car.sectorIndex = 0;
    car.sectorStartTime = crossingTime;
    car.tyre.ageLaps += 1;
    if (!state.fastestLap || lapTime < state.fastestLap.time) {
      state.fastestLap = { driverId: car.driverId, lap: car.lap, time: lapTime };
      if (car.lap > 1) addEvent(state, "fastest", `Volta mais rápida: ${carName(state, car)} (${lapTime.toFixed(3)}s).`, car.driverId, "success");
    }
    onLapCompleted(state, car, rng);
    if (car.lap >= state.totalLaps) {
      car.status = "finished";
      car.finishTime = crossingTime;
      state.finishOrder.push(car.driverId);
      car.speed = 0;
      addEvent(
        state,
        "finish",
        `${carName(state, car)} cruza a linha em ${(car.finishTime / 60).toFixed(0)}min ${(car.finishTime % 60).toFixed(1)}s${car.penalties > 0 ? ` (+${car.penalties}s de penalidade)` : ""}.`,
        car.driverId,
        state.finishOrder.length === 1 ? "success" : "info",
      );
      if (state.finishOrder.length === 1) state.endedAt = state.elapsed + FINAL_GRACE_SECONDS;
      break;
    }
  }

  // --- erros e falhas ---
  if (car.status === "running" && car.pit.state === "none") {
    rollIncidents(state, car, rng, gapToAhead);
  }

  // contato
  if (
    aheadOnTrack &&
    gapToAhead > -2 &&
    gapToAhead < 2 &&
    Math.abs((car.lane + car.attackLane) - (ahead!.lane + ahead!.attackLane)) < 0.85 &&
    car.speed > ahead!.speed &&
    state.trackStatus === "green" &&
    rng.chance(0.006)
  ) {
    car.damage = Math.min(1, car.damage + 0.18);
    ahead!.damage = Math.min(1, ahead!.damage + 0.1);
    car.contactWarnings += 1;
    car.penalties += 5;
    car.penaltyNotes.push("Contato com rival (+5s)");
    addEvent(state, "penalty", `Contato entre ${carName(state, car)} e ${carName(state, ahead!)}. Penalidade de 5s.`, car.driverId, "warn");
  }

  car.tyre.wear = clamp(car.tyre.wear, 0, 100);
}

function circuitStub(state: RaceState): CircuitData {
  const circuit = CIRCUIT_BY_ID[state.circuitId];
  if (!circuit) throw new Error(`Circuito não registrado: ${state.circuitId}`);
  return circuit;
}

function onLapCompleted(state: RaceState, car: RaceCar, rng: ReturnType<typeof createRng>): void {
  if (car.pit.state !== "none") return;
  // Limites de pista: a chance cai em relação à versão anterior e a punição
  // é progressiva (advertência antes do tempo). Nem toda saída vira +5s.
  if (rng.chance(0.0075 + car.tyre.wear / 12000 + state.weather.rain * 0.002)) {
    registerTrackLimitOffence(state, car);
  }
  // troca obrigatória de compostos em corrida seca
  if (state.mandatoryStop && car.lap === state.totalLaps - 2 && car.pit.stops === 0 && dryCompoundsUsed(car.tyre) < 2) {
    addEvent(state, "info", `${carName(state, car)} ainda não fez a troca obrigatória de compostos.`, car.driverId, "warn");
  }
}

function rollIncidents(state: RaceState, car: RaceCar, rng: ReturnType<typeof createRng>, gapToAhead: number): void {
  const d = driverOf(state, car.driverId)!.atributos;
  const rain = state.weather.rain;
  const battle = Number.isFinite(gapToAhead) && gapToAhead < 12 ? 1.5 : 1;
  const base =
    0.000011 *
    (1 + (100 - d.consistencia) / 65) *
    (1 + (100 - d.experiencia) / 180) *
    (1 + car.tyre.wear / 150) *
    (1 + rain * 1.1) *
    (1 + d.agressividade / 320) *
    battle;
  if (rng.chance(base)) {
    const roll = rng.next();
    car.incidents += 1;
    if (roll < 0.1) {
      // acidente grave
      car.status = "retired";
      car.retiredReason = "Acidente";
      car.speed = 0;
      addEvent(state, "retirement", `${carName(state, car)} abandona após acidente.`, car.driverId, "danger");
      if (state.trackStatus === "green" && rng.chance(0.8)) deploySafetyCar(state, true);
    } else if (roll < 0.22) {
      car.damage = Math.min(1, car.damage + rng.range(0.12, 0.3));
      car.speed *= 0.6;
      addEvent(state, "incident", `${carName(state, car)} toca no muro e danifica o carro.`, car.driverId, "danger");
    } else if (roll < 0.55) {
      car.speed = Math.min(car.speed, 8);
      car.attacking = false;
      addEvent(state, "incident", `${carName(state, car)} sai da pista e perde tempo.`, car.driverId, "warn");
    } else {
      car.dangerousWarnings += 1;
      car.penalties += 5;
      car.penaltyNotes.push("Manobra perigosa (+5s)");
      addEvent(state, "penalty", `${carName(state, car)} recebe 5s por manobra perigosa.`, car.driverId, "warn");
    }
  }
  // falha mecânica
  const team = teamOf(state, car.teamId)!;
  const reliability = team.car.confiabilidade;
  if (rng.chance(0.00000085 * (1 + (100 - reliability) / 34))) {
    car.status = "retired";
    car.retiredReason = rng.chance(0.5) ? "Falha de motor" : "Falha mecânica";
    car.speed = 0;
    addEvent(state, "retirement", `${carName(state, car)} para com ${car.retiredReason!.toLowerCase()}.`, car.driverId, "danger");
    if (rng.chance(0.25) && state.trackStatus === "green") deploySafetyCar(state, false);
  }
}

function aiDecisions(state: RaceState, car: RaceCar, rng: ReturnType<typeof createRng>): void {
  if (state.playerTeams.includes(car.teamId)) return;
  if (car.status !== "running") return;
  const circuit = circuitStub(state);
  const team = teamOf(state, car.teamId)!;
  const d = driverOf(state, car.driverId)!.atributos;
  const skill = Math.max(0, Math.min(1, ((team.strategist ?? 75) - 55) / 40));
  const remaining = state.totalLaps - car.lap;
  const rain = state.weather.rain;
  const wet = isWetCompound(car.tyre.compound);
  const wear = car.tyre.wear;
  const lapsOnTyre = car.tyre.ageLaps;
  const plan = car.strategy.plan;
  const nextStint = plan.stints[car.strategy.stintIndex + 1];
  const plannedPit = car.strategy.plannedPitLap;
  const inWindow = plannedPit != null && car.lap >= (car.strategy.windowStart ?? plannedPit - 2) - 1 && car.lap <= (car.strategy.windowEnd ?? plannedPit + 2);
  // A IA precisa administrar a bateria para não entrar em todo ataque vazio.
  if (car.energy < 28) car.energyMode = "save";
  else if (car.energy > 72 && remaining < 10) car.energyMode = "push";
  else if (car.energy > 45) car.energyMode = "normal";
  const canStop = nextStint != null || remaining > 3 || rain > 0.15 || car.tyre.punctured;

  if (rain > 0.2 && !wet) {
    car.nextCompound = rain > 0.62 ? "wet" : "inter";
    if (car.pit.state === "none" && canStop) car.pit.requested = true;
    return;
  }
  if (rain <= 0.08 && wet && remaining > 2) {
    car.nextCompound = chooseDryCompound(circuit, remaining, car.tyre.usedCompounds);
    if (car.pit.state === "none" && canStop) car.pit.requested = true;
    return;
  }
  if (car.tyre.punctured) {
    car.nextCompound = compoundForConditions(rain);
    car.pit.requested = true;
    return;
  }

  const nextWet = state.weather.forecast.find((phase) => phase.fromLap > car.lap && phase.rain > 0.15);
  if (nextWet && nextWet.fromLap - car.lap <= 2 && rain < 0.15 && canStop && lapsOnTyre >= 5) {
    car.nextCompound = nextWet.rain > 0.62 ? "wet" : "inter";
    if (car.pit.state === "none") car.pit.requested = true;
    return;
  }

  const needsCompounds = state.mandatoryStop && !state.isSprint && dryCompoundsUsed(car.tyre) < 2;
  const scPit = state.trackStatus === "sc" && lapsOnTyre >= 5 && remaining > 3 && canStop;
  // Gestão de pneus e leitura do estrategista deslocam a janela: pilotos que
  // preservam mais podem esticar o stint; os mais agressivos antecipam a parada.
  const targetWear = 58 + (d.gestaoPneus / 100) * 20 + skill * 4;
  const wearPit = wear > targetWear && remaining > 4 && lapsOnTyre >= 4 && canStop;
  const windowPit = inWindow && canStop && (wear > 45 || needsCompounds);
  const nextCompoundForGain = nextStint?.compound ?? chooseDryCompound(circuit, remaining, car.tyre.usedCompounds);
  const freshEstimate = estimateLapTime({
    circuit,
    car: team.car,
    driver: driverOf(state, car.driverId)!.atributos,
    setup: state.setups[car.driverId] ?? defaultSetup(),
    tyre: initialTyre(nextCompoundForGain),
    rain,
    fuelKg: car.fuelKg,
    fuelStartKg: car.fuelStartKg,
    pace: car.pace,
    tyreMode: car.tyreMode,
  });
  const recent = car.lapTimes.slice(-3);
  const oldLap = car.lap >= 3 && recent.length ? recent.reduce((sum, time) => sum + time, 0) / recent.length : circuit.baseLapTime;
  const freshLap = Math.max(freshEstimate, oldLap - 1.6);
  const pitGain = projectPitGain({
    pitLoss: estimatePitLoss(circuit, team.pitCrew, state.trackStatus === "sc" ? "sc" : state.trackStatus === "vsc" ? "vsc" : "green"),
    oldLapTime: oldLap,
    newLapTime: freshLap,
    laps: 5,
    warmupLoss: 1.2,
  });
  const undercut = canStop && wear > 58 && remaining > 10 && car.positionGapAhead > 0.2 && car.positionGapAhead < 5 && lapsOnTyre >= 8 && skill > 0.35 && pitGain > 0.3;
  const cover = canStop && state.cars.some((other) =>
    other.position === car.position - 1 &&
    other.pit.stops > 0 &&
    other.tyre.ageLaps + 3 < car.tyre.ageLaps &&
    car.positionGapAhead < 4.5 &&
    car.lap > 6
  );
  if ((wearPit || undercut || scPit || windowPit || cover || (needsCompounds && car.pit.stops === 0 && car.lap >= Math.max(6, Math.floor(state.totalLaps * 0.35)))) && car.pit.state === "none" && !car.pit.requested) {
    car.nextCompound = scPit
      ? (rain > 0.62 ? "wet" : rain > 0.15 ? "inter" : (nextStint?.compound ?? chooseDryCompound(circuit, remaining, car.tyre.usedCompounds)))
      : (nextStint?.compound ?? chooseDryCompound(circuit, remaining, car.tyre.usedCompounds));
    car.pit.requested = true;
  }

  // Personalidade e estado da disputa: cada piloto decide com seus atributos,
  // não com uma ordem fixa da equipe. Dois companheiros podem atacar, defender
  // ou economizar de formas diferentes na mesma situação.
  const underAttack = state.cars.some((other) => other !== car && other.attacking && other.targetDriverId === car.driverId);
  const attacking = car.attacking || car.disputePhase === "approach" || car.disputePhase === "prepare";
  const closeBattle = car.positionGapAhead > 0 && car.positionGapAhead < 0.45;
  const energyFloor = 20 + (d.experiencia / 100) * 8;

  if (state.trackStatus !== "green") {
    car.pace = "normal";
    car.tyreMode = wear > 62 ? "manage" : "normal";
    car.energyMode = car.energy < 30 ? "save" : "normal";
  } else if (wear > 78) {
    car.pace = "conserve";
    car.tyreMode = "manage";
    car.energyMode = "save";
  } else if (attacking || closeBattle || car.counterUntil > state.elapsed) {
    car.pace = wear > 72 ? "normal" : "attack";
    car.tyreMode = wear > 66 ? "manage" : "normal";
    car.energyMode = car.energy > energyFloor ? "push" : "save";
  } else if (underAttack) {
    if (car.defending) {
      car.pace = "normal";
      car.tyreMode = wear > 70 ? "manage" : "normal";
      car.energyMode = car.energy > 20 ? "push" : "save";
    } else {
      // Evita risco desnecessário: preserva pneus e bateria para outra janela.
      car.pace = "normal";
      car.tyreMode = wear > 58 ? "manage" : "normal";
      car.energyMode = "save";
    }
  } else if (remaining < 8 && car.energy > 32 && wear < 68) {
    car.pace = "normal";
    car.tyreMode = "normal";
    car.energyMode = "push";
  } else {
    car.pace = "normal";
    car.tyreMode = wear > 55 ? "manage" : "normal";
    car.energyMode = car.energy < 30 ? "save" : "normal";
  }
  if (state.trackStatus === "green" && state.elapsed - state.trackStatusUntil < 3) {
    car.pace = "attack";
  }
}

function gapable(state: RaceState, car: RaceCar, rng: ReturnType<typeof createRng>): boolean {
  void rng;
  return car.positionGapAhead > 0.4 && car.positionGapAhead < 6;
}

function chooseDryCompound(circuit: CircuitData, remaining: number, used: Compound[]): Compound {
  const usedDry = used.filter((c) => c === "soft" || c === "medium" || c === "hard");
  if (remaining <= 3) return "soft";
  if (usedDry.length === 1) {
    // cumprir a regra dos dois compostos
    const other: Compound = usedDry[0] === "medium" ? "hard" : "medium";
    if (remaining > 10) return other;
  }
  if (remaining <= 16) return "soft";
  if (remaining <= 28) return "medium";
  if (circuit.abrasividade > 0.62 && remaining > 22) return "hard";
  return remaining > 22 ? "hard" : "medium";
}

function orderCars(cars: RaceCar[]): RaceCar[] {
  return [...cars].sort((a, b) => {
    const af = a.status === "finished";
    const bf = b.status === "finished";
    if (af && bf) return (a.finishTime! + a.penalties) - (b.finishTime! + b.penalties);
    if (af) return -1;
    if (bf) return 1;
    const ar = a.status === "retired";
    const br = b.status === "retired";
    if (ar && !br) return 1;
    if (!ar && br) return -1;
    return b.distance - a.distance;
  });
}

export function updatePositions(state: RaceState): void {
  const ordered = orderCars(state.cars);
  ordered.forEach((car, i) => {
    car.position = i + 1;
  });
  const leader = ordered[0];
  ordered.forEach((car, i) => {
    const ahead = i > 0 ? ordered[i - 1] : null;
    if (!leader) {
      car.positionGapLeader = 0;
      car.positionGapAhead = 0;
      return;
    }
    if (car.status === "finished" && leader.status === "finished") {
      car.positionGapLeader = Math.max(0, car.finishTime! + car.penalties - (leader.finishTime! + leader.penalties));
      car.positionGapAhead = ahead ? Math.max(0, car.finishTime! + car.penalties - (ahead.finishTime! + ahead.penalties)) : 0;
    } else {
      const leaderSpeed = Math.max(22, leader.speed);
      const aheadSpeed = Math.max(22, ahead?.speed ?? leaderSpeed);
      car.positionGapLeader = Math.max(0, (leader.distance - car.distance) / leaderSpeed);
      car.positionGapAhead = ahead ? Math.max(0, (ahead.distance - car.distance) / aheadSpeed) : 0;
    }
  });
}

function finishRace(state: RaceState): void {
  const ordered = orderCars(state.cars);
  const leader = ordered[0];
  // carros ainda em pista são classificados por projeção, não abandonam
  for (const car of state.cars) {
    if (car.status === "running") {
      const remaining = Math.max(0, state.totalLaps * buildTrack(circuitStub(state)).length - car.distance);
      car.finishTime = state.elapsed + remaining / Math.max(20, car.speed || 30);
      car.status = "finished";
    }
  }
  state.trackStatus = "chequered";
  state.status = "finished";
  state.endedAt = state.elapsed;
  if (leader) {
    addEvent(state, "finish", `Bandeirada final. ${carName(state, leader)} vence!`, leader.driverId, "success");
  }
  updatePositions(state);
}

export function applyRaceCommand(state: RaceState, command: RaceCommand): { ok: boolean; reason?: string } {
  ensureRaceState(state);
  const car = state.cars.find((c) => c.driverId === command.driverId);
  if (!car) return { ok: false, reason: "Piloto não encontrado." };
  if (state.status === "finished") return { ok: false, reason: "Corrida encerrada." };
  if (car.status !== "running") return { ok: false, reason: "Piloto fora da corrida." };
  const revision = "revision" in command ? command.revision : undefined;
  if (revision != null && revision !== car.strategy.version) {
    return { ok: false, reason: "Plano desatualizado. Recarregue o estado da equipe." };
  }
  switch (command.type) {
    case "pace":
      car.pace = command.value;
      return { ok: true };
    case "energy":
      car.energyMode = command.value;
      return { ok: true };
    case "tyreMode":
      car.tyreMode = command.value;
      return { ok: true };
    case "nextCompound":
      if (!hasTyreSet(car.tyreInventory, command.value)) return { ok: false, reason: "Não há jogos deste composto." };
      car.nextCompound = command.value;
      return { ok: true };
    case "pitNow":
      if (car.pit.state !== "none") return { ok: false, reason: "Carro já está no pit lane." };
      car.pit.requested = true;
      car.pit.plannedLap = null;
      car.strategy.plannedPitLap = null;
      car.strategy.version += 1;
      addEvent(state, "info", `${carName(state, car)} chamado aos boxes.`, car.driverId, "info");
      return { ok: true };
    case "schedulePit":
      if (command.lap <= car.lap) return { ok: false, reason: "Volta inválida para o pit stop." };
      car.pit.plannedLap = command.lap;
      car.pit.requested = false;
      car.strategy.plannedPitLap = command.lap;
      car.strategy.windowStart = Math.max(1, command.lap - 2);
      car.strategy.windowEnd = Math.min(state.totalLaps, command.lap + 2);
      car.strategy.version += 1;
      addEvent(state, "info", `${carName(state, car)} planeja parar na volta ${command.lap}.`, car.driverId, "info");
      return { ok: true };
    case "cancelPit":
      if (car.pit.state === "entering" || car.pit.state === "service") return { ok: false, reason: "Pit stop já comprometido." };
      car.pit.requested = false;
      car.pit.plannedLap = null;
      car.strategy.plannedPitLap = null;
      car.strategy.version += 1;
      addEvent(state, "info", `Pit stop cancelado para ${carName(state, car)}.`, car.driverId, "info");
      return { ok: true };
    case "applyStrategyPlan": {
      if (revision !== car.strategy.version) return { ok: false, reason: "Plano desatualizado." };
      const circuit = circuitStub(state);
      const normalized = normalizeRacePlan({ ...command.plan, driverId: car.driverId }, state.totalLaps);
      const validation = validateRacePlan(normalized, state.totalLaps, state.mandatoryStop, state.weather.rain < 0.15, car.tyreInventory);
      if (!validation.ok) return { ok: false, reason: validation.error };
      car.strategy.plan = normalized;
      car.strategy.stintIndex = 0;
      car.strategy.version += 1;
      const pitLaps = planPitLaps(normalized);
      const nextPit = pitLaps.find((lap) => lap > car.lap) ?? null;
      car.strategy.plannedPitLap = nextPit;
      car.strategy.windowStart = nextPit == null ? null : Math.max(1, nextPit - 2);
      car.strategy.windowEnd = nextPit == null ? null : Math.min(state.totalLaps, nextPit + 2);
      car.pit.plannedLap = nextPit;
      const nextStint = normalized.stints[normalized.stints.length > 1 ? 1 : 0];
      if (nextStint) car.nextCompound = nextStint.compound;
      void circuit;
      addEvent(state, "info", `${carName(state, car)} atualizou o plano de corrida.`, car.driverId, "info");
      return { ok: true };
    }
  }
}

export function buildRaceView(state: RaceState, visibleTeams: string[] = state.playerTeams): RaceView {
  ensureRaceState(state);
  const ordered = orderCars(state.cars);
  const leader = ordered[0];
  const circuit = circuitStub(state);
  const visible = new Set(visibleTeams);
  const defaultPitLoss = estimatePitLoss(circuit, state.teams[0]?.pitCrew ?? 70, "green");
  return {
    tick: state.tick,
    elapsed: state.elapsed,
    circuitId: state.circuitId,
    totalLaps: state.totalLaps,
    lap: Math.min(state.totalLaps, Math.max(0, state.leaderLap + (state.status === "finished" ? 0 : 1))),
    isSprint: state.isSprint,
    status: state.status,
    trackStatus: state.trackStatus,
    trackStatusUntilLap: state.trackStatusUntilLap,
    weather: state.weather,
    cars: ordered.map((car) => {
      const isVisible = visible.has(car.teamId);
      const team = state.teams.find((entry) => entry.teamId === car.teamId);
      const remainingLaps = Math.max(1, state.totalLaps - car.lap);
      const projection = projectTyreLife({
        tyre: car.tyre,
        circuit,
        car: team?.car ?? { aerodinamica: 80, curvas: 80, retas: 80, energia: 80, confiabilidade: 80, gestaoPneus: 80 },
        driver: driverOf(state, car.driverId)?.atributos ?? { velocidade: 80, consistencia: 80, gestaoPneus: 80, ultrapassagem: 80, defesa: 80, chuva: 80, experiencia: 80, agressividade: 50 },
        setup: state.setups[car.driverId] ?? defaultSetup(),
        rain: state.weather.rain,
        trackTemp: state.weather.trackTemp,
        airTemp: state.weather.airTemp,
        remainingLaps,
        pace: car.pace,
        tyreMode: car.tyreMode,
      });
      const pitLoss = estimatePitLoss(circuit, team?.pitCrew ?? 70, state.trackStatus === "sc" ? "sc" : state.trackStatus === "vsc" ? "vsc" : "green");
      const recentLaps = car.lapTimes.slice(-3);
      const oldLapTime = car.lap >= 3 && recentLaps.length > 0
        ? recentLaps.reduce((sum, time) => sum + time, 0) / recentLaps.length
        : circuit.baseLapTime;
      const nextTyre = initialTyre(car.nextCompound);
      const freshEstimate = estimateLapTime({
        circuit,
        car: team?.car ?? { aerodinamica: 80, curvas: 80, retas: 80, energia: 80, confiabilidade: 80, gestaoPneus: 80 },
        driver: driverOf(state, car.driverId)?.atributos ?? { velocidade: 80, consistencia: 80, gestaoPneus: 80, ultrapassagem: 80, defesa: 80, chuva: 80, experiencia: 80, agressividade: 50 },
        setup: state.setups[car.driverId] ?? defaultSetup(),
        tyre: nextTyre,
        rain: state.weather.rain,
        fuelKg: car.fuelKg,
        fuelStartKg: car.fuelStartKg,
        pace: car.pace,
        tyreMode: car.tyreMode,
      });
      const newLapTime = Math.max(freshEstimate, oldLapTime - 1.6);
      return {
        driverId: car.driverId,
        teamId: car.teamId,
        gridPosition: car.gridPosition,
        position: car.position,
        distance: car.distance,
        speed: car.speed,
        lap: car.lap,
        status: car.status,
        tyre: car.tyre,
        fuelKg: car.fuelKg,
        energy: car.energy,
        pace: car.pace,
        energyMode: car.energyMode,
        tyreMode: car.tyreMode,
        nextCompound: car.nextCompound,
        pit: car.pit,
        lastLap: car.lastLap,
        bestLap: car.bestLap,
        sectors: car.sectors,
        bestSectors: car.bestSectors,
        gapLeader: car.positionGapLeader,
        gapAhead: car.positionGapAhead,
        penalty: car.penalties,
        penaltyNotes: car.penaltyNotes,
        trackLimitWarnings: car.trackLimitWarnings,
        damage: car.damage,
        stops: car.pit.stops,
        overtakeMode: car.overtakeMode,
        lane: car.lane + car.attackLane,
        retiredReason: car.retiredReason,
        finishTime: car.finishTime,
        strategy: {
          stintIndex: car.strategy.stintIndex,
          plannedPitLap: car.strategy.plannedPitLap,
          windowStart: car.strategy.windowStart,
          windowEnd: car.strategy.windowEnd,
          stopsPlanned: Math.max(0, car.strategy.plan.stints.length - 1),
          version: car.strategy.version,
          planVisible: isVisible,
          plan: isVisible ? car.strategy.plan : null,
          projection,
          inventory: isVisible ? car.tyreInventory : null,
          recommendation: isVisible ? car.advice : null,
          pitLoss,
          undercutProjection: projectPitGain({ pitLoss, oldLapTime, newLapTime, laps: 5 }),
          overcutProjection: projectPitGain({ pitLoss, oldLapTime, newLapTime, laps: 3 }),
        },
      };
    }),
    events: state.events.slice(-90),
    fastestLap: state.fastestLap,
    playerTeams: state.playerTeams,
    leaderLap: state.leaderLap,
    pitLossEstimate: defaultPitLoss,
  };
}

/** Simula até o fim (usado por testes e por "simular corrida" no modo rápido). */
export function simulateRaceToEnd(state: RaceState, maxTicks = 120_000): RaceState {
  let guard = 0;
  while (state.status === "running" && guard < maxTicks) {
    advanceRace(state);
    guard++;
  }
  return state;
}

/** Converte o estado final em resultados de sessão. */
export function raceToSessionResult(
  state: RaceState,
  kind: "race" | "sprint",
  pointsTable: number[],
  round: number,
  completedAt = new Date().toISOString(),
) {
  const ordered = orderCars(state.cars);
  if (state.mandatoryStop && !state.isSprint) {
    for (const car of ordered) {
      if (car.status !== "retired" && dryCompoundsUsed(car.tyre) < 2 && state.weather.rain < 0.15) {
        car.penalties += 30;
        car.penaltyNotes.push("Não usou dois compostos secos (+30s)");
      }
    }
  }
  const classified = [...state.cars].sort((a, b) => {
    if (a.status === "finished" && b.status === "finished") return a.finishTime! + a.penalties - (b.finishTime! + b.penalties);
    if (a.status === "finished") return -1;
    if (b.status === "finished") return 1;
    return b.distance - a.distance;
  });
  const winnerTime = classified.find((c) => c.status === "finished")?.finishTime ?? null;
  const entries = classified.map((car, i) => {
    const points = car.status === "retired" ? 0 : pointsTable[i] ?? 0;
    const time = car.finishTime != null ? car.finishTime + car.penalties : null;
    return {
      driverId: car.driverId,
      teamId: car.teamId,
      position: i + 1,
      grid: car.gridPosition,
      status: (car.status === "retired" ? "retired" : "finished") as "finished" | "retired",
      time,
      gap: time != null && winnerTime != null ? Math.max(0, time - winnerTime) : null,
      laps: car.lap,
      points,
      stops: car.pit.stops,
      penalty: car.penalties,
      fastestLap: car.bestLap,
      reason: car.retiredReason ?? undefined,
    };
  });
  return {
    round,
    circuitId: state.circuitId,
    kind,
    entries,
    fastestLapDriverId: state.fastestLap?.driverId ?? null,
    weatherSummary: state.weather.wetDeclared ? "Corrida com pista molhada" : "Corrida seca",
    safetyCars: state.safetyCarDeployed,
    seed: state.seed,
    completedAt,
  };
}
