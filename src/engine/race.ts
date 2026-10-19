import type { CircuitData } from "../data/season2026";
import { CIRCUIT_BY_ID } from "../data/season2026";
import { createRng } from "./rng";
import { buildTrack, wrapDistance, sampleAt } from "./track";
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
      attacking: false,
      lap: 0,
      status: "running",
      finishTime: null,
      retiredReason: null,
      lapStartTime: 0,
      lastLap: null,
      bestLap: null,
      lapTimes: [],
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
    const undercutRisk = rivalBehind && rivalBehind.positionGapAhead < 5 && rivalBehind.tyre.ageLaps + 2 < car.tyre.ageLaps ? 0.7 : 0.2;
    const recommendation = recommendRaceAction({
      lap: car.lap,
      totalLaps: state.totalLaps,
      tyreWear: car.tyre.wear,
      tyreAge: car.tyre.ageLaps,
      remainingLaps: projection.remainingLaps,
      plannedPitLap: car.strategy.plannedPitLap,
      windowStart: car.strategy.windowStart,
      windowEnd: car.strategy.windowEnd,
      fuelKg: car.fuelKg,
      fuelPerLap: 1.85 + circuit.abrasividade * 0.15,
      energy: car.energy,
      rain: state.weather.rain,
      nextRainLap: nextWet,
      trackStatus: state.trackStatus,
      undercutRisk,
      pitLoss,
      compound: car.tyre.compound,
    });
    if (recommendation && (recommendation.key !== car.lastAdviceKey || car.lap - car.lastAdviceLap >= 3)) {
      car.advice = recommendation;
      car.lastAdviceKey = recommendation.key;
      car.lastAdviceLap = car.lap;
      addEvent(state, "info", `${carName(state, car)}: ${recommendation.message}`, car.driverId, recommendation.severity === "danger" ? "danger" : "warn");
    } else if (!recommendation) {
      car.advice = null;
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

  for (const car of state.cars) {
    if (car.status !== "running") continue;
    car.overtakeCooldown = Math.max(0, car.overtakeCooldown - dt);
    if (state.tick % 12 === 0) aiDecisions(state, car, rng);
    if (state.tick % 200 === 0) {
      // rádio de tráfego ocasional para carros do jogador
      if (state.playerTeams.includes(car.teamId) && car.tyre.wear > 55) {
        addEvent(state, "info", `${carName(state, car)}: pneus em ${Math.round(car.tyre.wear)}%.`, car.driverId, "warn");
      }
    }
  }

  const runningOrder = orderCars(state.cars);
  const indexOf = new Map(runningOrder.map((c, i) => [c.driverId, i]));
  for (const car of state.cars) {
    if (car.status !== "running") continue;
    const idx = indexOf.get(car.driverId) ?? 0;
    const ahead = idx > 0 ? runningOrder[idx - 1] : null;
    updateCar(state, car, ahead, dt, rng);
  }

  updatePositions(state);
  state.leaderLap = Math.max(...state.cars.map((c) => c.lap));
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

  // --- combate ---
  const gapToAhead = ahead ? ahead.distance - car.distance : Infinity;
  const aheadOnTrack = ahead && ahead.status === "running" && ahead.pit.state === "none";
  const sameLap = ahead ? Math.abs(ahead.lap - car.lap) <= 1 : false;

  if (
    aheadOnTrack &&
    sameLap &&
    !car.attacking &&
    car.overtakeCooldown <= 0 &&
    gapToAhead > 0 &&
    gapToAhead < Math.max(18, car.speed * 1.1) &&
    car.pit.state === "none"
  ) {
    const speedAdvantage = car.speed / Math.max(15, ahead.speed) - 1;
    const tyreAdv = tyreGrip(car.tyre, rain) - tyreGrip(ahead.tyre, rain);
    const straight = sample.straight;
    const defender = ahead ? driverOf(state, ahead.driverId) : undefined;
    const defenseFactor = defender ? 1.18 - defender.atributos.defesa / 240 : 1;
    const chance =
      0.011 *
      (1 + Math.max(0, speedAdvantage) * 90 + tyreAdv * 45) *
      (0.55 + d.ultrapassagem / 180) *
      (0.9 + d.agressividade / 420) *
      defenseFactor *
      (1.35 - circuit.dificuldadeUltrapassagem) *
      (0.5 + straight * 0.9) *
      (state.trackStatus === "green" ? 1 : 0);
    if (rng.chance(Math.max(0, chance))) {
      car.attacking = true;
      car.defendingUntil = state.elapsed + 4.5;
    }
  }

  let attackBonus = 0;
  if (car.attacking) {
    attackBonus = 0.009;
    car.energy = Math.max(0, car.energy - 3.2 * dt);
    if (ahead && car.distance > ahead.distance + 1.5 && car.pit.state === "none") {
      addEvent(state, "overtake", `${carName(state, car)} ultrapassa ${carName(state, ahead)}!`, car.driverId, "success");
      car.attacking = false;
      car.overtakeCooldown = 6;
      car.lane = 0;
      car.attackLane = 0;
    } else if (state.elapsed > car.defendingUntil) {
      car.attacking = false;
      car.overtakeCooldown = 5;
      car.attackLane = 0;
    }
  }

  // --- velocidade alvo ---
  let factor = pace.base * (pace.corner * (1 - sample.straight) + pace.straight * sample.straight);
  factor *= car.form;
  factor *= 1 + (car.fuelStartKg - car.fuelKg) * 0.000038;
  const tyreG = tyreGrip(car.tyre, rain);
  factor *= tyreG;
  factor *= 1 - car.damage * 0.07;
  factor *= 1 + (d.chuva - 80) * 0.0009 * rain;
  factor *= 1 + (1 - Math.abs(setup.downforce - circuit.downforceIdeal)) * 0.004;
  factor *= setup.focus === "qualifying" ? 0.9995 : setup.focus === "race" ? 1.001 : 1;
  factor *= car.pace === "attack" ? 1.011 : car.pace === "conserve" ? 0.987 : 1;
  factor *= car.tyreMode === "push" ? 1.0025 : car.tyreMode === "manage" ? 0.999 : 1;
  const energyBoost = car.energy > 8 ? (car.energyMode === "push" ? 0.0042 : car.energyMode === "save" ? -0.0016 : 0) : -0.007;
  factor *= 1 + energyBoost + (car.energy - 50) * 0.00005;
  factor *= 1 + attackBonus;
  if (car.attacking && car.energy > 12) {
    factor *= 1.005;
    car.overtakeMode = true;
  } else {
    car.overtakeMode = false;
  }
  // ar sujo / aspiração
  if (aheadOnTrack && sameLap && gapToAhead > 0 && gapToAhead < 30) {
    const prox = 1 - gapToAhead / 30;
    factor *= 1 - prox * 0.018;
    factor *= 1 + sample.straight * prox * 0.016;
    car.tyre.temp += prox * 0.12 * dt;
  }
  // aero ativa (reta) — abstracção do regulamento 2026
  factor *= 1 + sample.straight * 0.0035;

  // curvas molhadas são mais lentas
  factor *= rain > 0.05 ? 1 - rain * 0.05 : 1;
  if (car.fuelKg <= 0.05) factor *= 0.93;

  let target = sample.speed * factor;
  if (state.trackStatus !== "green" && car.pit.state === "none") {
    if (state.trackStatus === "sc") {
      const gap = gapToAhead;
      target = Math.min(target, gap > 80 ? 38 : gap > 40 ? 30 : gap > 15 ? 24 : 19);
      car.attacking = false;
      car.overtakeMode = false;
    } else {
      target = Math.min(target, sample.speed * 0.82);
    }
  }
  if (car.attacking) {
    car.attackLane = clamp(car.attackLane + 2.8 * dt, 0, 1);
  } else {
    car.attackLane = Math.max(0, car.attackLane - 2.4 * dt);
  }
  const lane = car.attackLane;
  if (car.pit.state !== "none") {
    target = Math.min(target, pitCap);
  } else if (aheadOnTrack && sameLap && gapToAhead > 0 && gapToAhead < 7 && !car.attacking) {
    target = Math.min(target, Math.max(16, ahead.speed * 0.995));
    car.lane = Math.min(car.lane + dt * 1.2, 0.3);
  } else {
    car.lane = Math.max(0, car.lane - dt * 1.5);
  }

  if (state.trackStatus === "sc") {
    car.energy = Math.min(100, car.energy + 0.35 * dt);
  }
  // energia: colheita passiva e em frenagem, deploy conforme modo
  car.energy = Math.min(100, car.energy + 0.22 * dt);
  const braking = target < car.speed - 2;
  if (braking) car.energy = Math.min(100, car.energy + (0.55 + (car.energyMode === "save" ? 0.25 : 0)) * dt);
  car.energy = clamp(car.energy - (car.energyMode === "push" ? 0.55 : car.energyMode === "save" ? 0.12 : 0.2) * dt, 0, 100);
  if (car.overtakeMode) car.energy = Math.max(0, car.energy - 2.2 * dt);

  // dinâmica longitudinal
  const accel = target > car.speed ? 8.8 : 22;
  const delta = target - car.speed;
  const maxChange = accel * dt;
  car.speed += clamp(delta, -maxChange, maxChange);
  car.speed = clamp(car.speed, 0.5, 100);
  const moved = car.speed * dt;
  car.distance += moved;

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

  // --- voltas e chegada ---
  while (car.lap < state.totalLaps && car.distance >= (car.lap + 1) * lapLength) {
    const lapTime = state.elapsed - car.lapStartTime;
    car.lap += 1;
    car.lapStartTime = state.elapsed;
    car.lastLap = lapTime;
    car.lapTimes.push(lapTime);
    if (car.lapTimes.length > 8) car.lapTimes.shift();
    if (car.bestLap == null || lapTime < car.bestLap) car.bestLap = lapTime;
    car.tyre.ageLaps += 1;
    if (!state.fastestLap || lapTime < state.fastestLap.time) {
      state.fastestLap = { driverId: car.driverId, lap: car.lap, time: lapTime };
      if (car.lap > 1) addEvent(state, "fastest", `Volta mais rápida: ${carName(state, car)} (${lapTime.toFixed(3)}s).`, car.driverId, "success");
    }
    onLapCompleted(state, car, rng);
    if (car.lap >= state.totalLaps) {
      car.status = "finished";
      const overshoot = Math.max(0, car.distance - state.totalLaps * lapLength);
      car.finishTime = Math.max(0, state.elapsed - overshoot / Math.max(5, car.speed));
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
    Math.abs(car.lane - ahead!.lane) < 1.1 &&
    car.speed > ahead!.speed &&
    state.trackStatus === "green" &&
    rng.chance(0.006)
  ) {
    car.damage = Math.min(1, car.damage + 0.18);
    ahead!.damage = Math.min(1, ahead!.damage + 0.1);
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
  // limites de pista
  if (rng.chance(0.008 + car.tyre.wear / 9000)) {
    car.penalties += 5;
    car.penaltyNotes.push(`Limites de pista na volta ${car.lap} (+5s)`);
    addEvent(state, "penalty", `${carName(state, car)} excedeu os limites de pista: +5s.`, car.driverId, "warn");
  }
  // troca obrigatória de compostos em corrida seca
  if (state.mandatoryStop && car.lap === state.totalLaps - 2 && car.pit.stops === 0 && dryCompoundsUsed(car.tyre) < 2) {
    addEvent(state, "warn" as RaceEvent["type"], `${carName(state, car)} ainda não fez a troca obrigatória de compostos.`, car.driverId, "warn");
  }
}

function rollIncidents(state: RaceState, car: RaceCar, rng: ReturnType<typeof createRng>, gapToAhead: number): void {
  const d = driverOf(state, car.driverId)!.atributos;
  const rain = state.weather.rain;
  const battle = Number.isFinite(gapToAhead) && gapToAhead < 12 ? 1.5 : 1;
  const base =
    0.000011 *
    (1 + (100 - d.consistencia) / 65) *
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
  const targetWear = 68 + skill * 10;
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

  if (wear > 76) {
    car.pace = "conserve";
    car.tyreMode = "manage";
    car.energyMode = "save";
  } else if (state.trackStatus !== "green" || (car.positionGapAhead > 0 && car.positionGapAhead < 1.0) || wear < 42) {
    car.pace = remaining < 7 ? "attack" : "normal";
    car.tyreMode = wear > 70 ? "manage" : "normal";
    car.energyMode = remaining < 9 ? "push" : "normal";
  } else {
    car.pace = "normal";
    car.tyreMode = wear > 58 ? "manage" : "normal";
    car.energyMode = "normal";
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
        gapLeader: car.positionGapLeader,
        gapAhead: car.positionGapAhead,
        penalty: car.penalties,
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
