import { CIRCUIT_BY_ID, DRIVER_BY_ID, type CarAttributes, type CircuitData, type DriverAttributes } from "../data/season2026";
import { buildTrack, type TrackModel } from "./track";
import { createRng } from "./rng";
import { COMPOUNDS, initialTyre, tyreGrip, updateTyreTemperature, wearPerLap } from "./tyres";
import type {
  CarSetup,
  Compound,
  DriverRaceSpec,
  QualifyingAttempt,
  QualifyingCarState,
  QualifyingCommand,
  QualifyingEvent,
  QualifyingResult,
  QualifyingSessionState,
  QualifyingView,
  TeamRaceSpec,
  TyreMode,
} from "./types";

/** Formato esportivo usado pela classificação interativa. */
export const QUALIFYING_FORMAT = {
  quali: [
    { duration: 18 * 60, advance: 16 },
    { duration: 15 * 60, advance: 10 },
    { duration: 12 * 60, advance: 10 },
  ],
  sprintQuali: [
    { duration: 12 * 60, advance: 16 },
    { duration: 10 * 60, advance: 10 },
    { duration: 8 * 60, advance: 10 },
  ],
} as const;

export const QUALIFYING_SPEEDS = [1, 2, 5, 10, 20, 50];

/**
 * Regra simplificada da Sprint Qualifying seca de 2026:
 * SQ1/SQ2 com médios e SQ3 com macios. Em pista molhada a escolha é livre.
 */
export function qualifyingCompoundsFor(type: "quali" | "sprintQuali", segment: 1 | 2 | 3, rain: number): Compound[] {
  if (rain > 0.55) return ["wet"];
  if (rain > 0.12) return ["inter", "wet"];
  if (type === "sprintQuali") return segment < 3 ? ["medium"] : ["soft"];
  return ["soft", "medium", "hard"];
}

export interface QualifyingSessionInput {
  id?: string;
  seed: string;
  circuit: CircuitData;
  type: "quali" | "sprintQuali";
  round: number;
  drivers: DriverRaceSpec[];
  teams: TeamRaceSpec[];
  setups: Record<string, CarSetup>;
  playerTeams: string[];
  confidence: Record<string, number>;
  tyreInventory?: Record<string, Record<Compound, number>>;
  durationOverride?: [number, number, number];
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function trackWeights(circuit: CircuitData): { aero: number; curves: number; straights: number; energy: number } {
  const aero = 0.27 + circuit.downforceIdeal * 0.1;
  const curves = 0.26 + Math.min(0.08, circuit.curvas * 0.004);
  const straights = 0.29 - circuit.downforceIdeal * 0.08;
  const energy = 0.18;
  const total = aero + curves + straights + energy;
  return { aero: aero / total, curves: curves / total, straights: straights / total, energy: energy / total };
}

function carTrackScore(car: CarAttributes, circuit: CircuitData): number {
  const w = trackWeights(circuit);
  return car.aerodinamica * w.aero + car.curvas * w.curves + car.retas * w.straights + car.energia * w.energy;
}

function driverScore(d: DriverAttributes): number {
  return d.velocidade * 0.54 + d.consistencia * 0.17 + d.experiencia * 0.11 + d.chuva * 0.1 + d.gestaoPneus * 0.08;
}

function weatherLabel(rain: number): string {
  if (rain <= 0.03) return "Seco";
  if (rain <= 0.18) return "Garoa";
  if (rain <= 0.45) return "Chuva leve";
  if (rain <= 0.72) return "Chuva";
  return "Chuva forte";
}

function initialSets(type: "quali" | "sprintQuali"): Record<Compound, number> {
  if (type === "sprintQuali") return { soft: 3, medium: 4, hard: 1, inter: 2, wet: 2 };
  return { soft: 5, medium: 4, hard: 2, inter: 2, wet: 2 };
}

function defaultCompound(type: "quali" | "sprintQuali", segment: 1 | 2 | 3, rain: number): Compound {
  if (rain > 0.55) return "wet";
  if (rain > 0.12) return "inter";
  if (type === "sprintQuali") return segment < 3 ? "medium" : "soft";
  return "soft";
}

function segmentDuration(type: "quali" | "sprintQuali", segment: 1 | 2 | 3, override?: [number, number, number]): number {
  if (override) return override[segment - 1];
  return QUALIFYING_FORMAT[type][segment - 1].duration;
}

function formatConfig(type: "quali" | "sprintQuali", segment: 1 | 2 | 3) {
  return QUALIFYING_FORMAT[type][segment - 1];
}

function setOrderFor(car: QualifyingCarState, segment: 1 | 2 | 3): number | null {
  return car.segmentSetOrder[segment];
}

function segmentTimeFor(car: QualifyingCarState, segment: 1 | 2 | 3): number | null {
  return car.segmentBest[segment];
}

function compareSegment(a: QualifyingCarState, b: QualifyingCarState, segment: 1 | 2 | 3): number {
  const at = segmentTimeFor(a, segment);
  const bt = segmentTimeFor(b, segment);
  if (at == null && bt == null) return a.driverId.localeCompare(b.driverId);
  if (at == null) return 1;
  if (bt == null) return -1;
  if (Math.abs(at - bt) > 0.0005) return at - bt;
  const ao = setOrderFor(a, segment) ?? Number.MAX_SAFE_INTEGER;
  const bo = setOrderFor(b, segment) ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return a.driverId.localeCompare(b.driverId);
}

function isEligible(car: QualifyingCarState): boolean {
  return car.eliminatedIn === null && car.status !== "eliminated" && car.status !== "finished";
}

function participants(cars: QualifyingCarState[]): QualifyingCarState[] {
  return cars.filter(isEligible);
}

function rankedParticipants(state: QualifyingSessionState): QualifyingCarState[] {
  return [...participants(state.cars)].sort((a, b) => compareSegment(a, b, state.segment));
}

function leaderTime(state: QualifyingSessionState): number | null {
  const list = rankedParticipants(state);
  return list.find((car) => segmentTimeFor(car, state.segment) != null)?.segmentBest[state.segment] ?? null;
}

function nextEventId(state: QualifyingSessionState): number {
  return state.sequence++;
}

function addEvent(
  state: QualifyingSessionState,
  message: string,
  severity: QualifyingEvent["severity"] = "info",
  driverId?: string,
): void {
  state.events.push({
    id: nextEventId(state),
    clock: state.clock,
    segment: state.segment,
    driverId,
    message,
    severity,
  });
  if (state.events.length > 120) state.events.splice(0, state.events.length - 120);
}

function carName(car: QualifyingCarState): string {
  return DRIVER_BY_ID[car.driverId]?.nome ?? car.driverId.replace(/^driver_/, "").replace(/_/g, " ");
}

function segmentLabel(type: "quali" | "sprintQuali", segment: 1 | 2 | 3): string {
  return `${type === "sprintQuali" ? "SQ" : "Q"}${segment}`;
}

function setupPenalty(setup: CarSetup, circuit: CircuitData): number {
  const deviation = Math.abs(setup.downforce - circuit.downforceIdeal);
  let factor = 1 - (1 - deviation) * 0.0045;
  factor *= setup.focus === "qualifying" ? 0.9985 : setup.focus === "race" ? 1.0012 : 1;
  return factor;
}

function lapTimeFor(
  state: QualifyingSessionState,
  car: QualifyingCarState,
  lapType: "out" | "flying" | "in",
  lapIndex = 0,
): number {
  const circuit = circuitById(state);
  const rng = createRng(`${state.seed}:lap:${state.segment}:${car.driverId}:${lapType}:${car.attempts.length}:${lapIndex}`);
  const base = circuit.baseLapTime;
  const carScore = carTrackScore(car.car, circuit);
  const dScore = driverScore(car.attributes);
  const confidence = state.confidence[car.driverId] ?? (car.ai ? 82 : 55);
  let lap = base * (1 - (carScore - 80) * 0.00058 - (dScore - 80) * 0.00056);
  lap *= setupPenalty(car.setup, circuit);
  lap *= 1 - state.rubber * 0.0045;
  lap *= 1 + Math.max(0, car.fuelLoad - 0.18) * 0.035;
  lap *= 1 + (1 - confidence / 100) * 0.0018;
  lap /= Math.max(0.9, tyreGrip(car.tyre, state.rain));
  const consistencyNoise = (1 - car.attributes.consistencia / 100) * 0.0022;
  lap *= 1 + consistencyNoise * (rng.next() - 0.5) * 2;
  lap += (rng.next() - 0.5) * (lapType === "flying" ? 0.24 : 0.12);
  if (state.rain > 0.05) {
    lap *= 1 + state.rain * 0.115;
    lap *= 1 - (car.attributes.chuva - 80) * 0.0011 * state.rain;
    lap += (rng.next() - 0.5) * state.rain * 0.65;
  }
  if (lapType === "out") lap *= 1.16;
  if (lapType === "in") lap *= 1.12;
  return Math.max(base * 0.92, lap);
}

const circuitCache = new Map<string, CircuitData>();

function circuitById(state: QualifyingSessionState): CircuitData {
  const cached = circuitCache.get(state.circuitId);
  if (cached) return cached;
  const circuit = CIRCUIT_BY_ID[state.circuitId];
  if (!circuit) throw new Error(`Circuito não encontrado: ${state.circuitId}`);
  circuitCache.set(state.circuitId, circuit);
  return circuit;
}

function trackFor(state: QualifyingSessionState): TrackModel {
  return buildTrack(circuitById(state));
}

function requiredRunTime(state: QualifyingSessionState, car: QualifyingCarState, fuelLoad = car.nextFuelLoad): number {
  const temp = {
    ...car,
    tyre: initialTyre(car.nextCompound),
    fuelLoad,
  } as QualifyingCarState;
  const laps = fuelLoad >= 0.4 ? 2 : 1;
  return lapTimeFor(state, temp, "out") + lapTimeFor(state, temp, "in") + lapTimeFor(state, temp, "flying") * laps;
}

function allowedCompounds(state: QualifyingSessionState): Compound[] {
  return qualifyingCompoundsFor(state.type, state.segment, state.rain);
}

function canSend(state: QualifyingSessionState, car: QualifyingCarState): boolean {
  if (state.status !== "running" || car.status !== "garage" || !isEligible(car)) return false;
  if (!allowedCompounds(state).includes(car.nextCompound)) return false;
  if ((car.setsRemaining[car.nextCompound] ?? 0) <= 0) return false;
  return state.clock > requiredRunTime(state, car) + 1;
}

function resetForSegment(state: QualifyingSessionState, segment: 1 | 2 | 3): void {
  state.segment = segment;
  state.status = "running";
  state.clock = segmentDuration(state.type, segment);
  state.segmentDuration = state.clock;
  state.fastestLap = null;
  state.events.push({
    id: nextEventId(state),
    clock: state.clock,
    segment,
    message: `${segmentLabel(state.type, segment)} iniciada. ${segment === 1 ? "22 pilotos" : segment === 2 ? "16 pilotos" : "10 pilotos"} na pista.`,
    severity: "info",
  });
  for (const car of state.cars) {
    if (car.eliminatedIn !== null) {
      car.status = "eliminated";
      continue;
    }
    car.status = "garage";
    car.position = 0;
    car.distance = 0;
    car.speed = 0;
    car.currentLapTime = 0;
    car.currentSector = 0;
    car.currentLapType = null;
    car.targetLapTime = 0;
    car.lastLap = null;
    car.lastSectors = [null, null, null];
    car.currentAttempt = null;
    car.flyingRemaining = 0;
    car.runLaps = 0;
    car.trafficLoss = 0;
    car.aborted = false;
    car.nextCompound = defaultCompound(state.type, segment, state.rain);
    car.nextFuelLoad = 0.25;
    car.nextTyrePrep = "normal";
    car.compound = car.nextCompound;
    car.tyre = initialTyre(car.nextCompound);
    car.aiNextSendAt = null;
    car.aiAttempts = 0;
    car.aiMaxAttempts = carTrackScore(car.car, circuitById(state)) >= 92 ? 2 : 3;
  }
  rankCars(state);
  planAiForSegment(state);
}

function planAiForSegment(state: QualifyingSessionState): void {
  const duration = state.segmentDuration;
  for (const car of state.cars) {
    if (!car.ai || car.eliminatedIn !== null) continue;
    const rng = createRng(`${state.seed}:ai-plan:${state.segment}:${car.driverId}:${car.aiAttempts}`);
    const first = duration * (0.76 + rng.range(-0.04, 0.08));
    car.aiNextSendAt = first;
    car.aiAttempts = 0;
    car.aiMaxAttempts = carTrackScore(car.car, circuitById(state)) >= 92 ? 2 : 3;
  }
}

function rankCars(state: QualifyingSessionState): void {
  const active = participants(state.cars);
  const ranked = [...active].sort((a, b) => compareSegment(a, b, state.segment));
  ranked.forEach((car, index) => {
    car.position = index + 1;
  });
  const out = state.cars
    .filter((car) => !active.includes(car))
    .sort((a, b) => {
      const ae = a.eliminatedIn ?? 9;
      const be = b.eliminatedIn ?? 9;
      if (ae !== be) return be - ae;
      return compareSegment(a, b, ae as 1 | 2 | 3);
    });
  out.forEach((car, index) => {
    car.position = ranked.length + index + 1;
  });
}

function sendOut(state: QualifyingSessionState, car: QualifyingCarState): void {
  const compound = car.nextCompound;
  const sets = car.setsRemaining[compound] ?? 0;
  if (sets <= 0) return;
  car.setsRemaining[compound] = sets - 1;
  car.compound = compound;
  car.fuelLoad = car.nextFuelLoad;
  car.tyrePrep = car.nextTyrePrep;
  car.tyre = initialTyre(compound);
  car.status = "out";
  car.distance = 0;
  car.speed = 0;
  car.currentLapTime = 0;
  car.currentSector = 0;
  car.currentLapType = "out";
  car.targetLapTime = lapTimeFor(state, car, "out");
  car.flyingRemaining = car.fuelLoad >= 0.4 ? 2 : 1;
  car.runLaps = car.flyingRemaining;
  car.trafficLoss = 0;
  car.aborted = false;
  car.aiAttempts += 1;
  car.aiNextSendAt = null;
  addEvent(state, `${carName(car)} sai dos boxes com ${COMPOUNDS[compound].nome}.`, "info", car.driverId);
}

function startFlyingLap(state: QualifyingSessionState, car: QualifyingCarState): void {
  car.status = "flying";
  car.currentLapType = "flying";
  car.currentLapTime = 0;
  car.currentSector = 0;
  car.lastSectors = [null, null, null];
  car.targetLapTime = lapTimeFor(state, car, "flying", car.attempts.length);
  const attempt: QualifyingAttempt = {
    id: state.sequence++,
    segment: state.segment,
    compound: car.compound,
    fuelLoad: car.fuelLoad,
    tyrePrep: car.tyrePrep,
    startedAt: state.clock,
    completedAt: null,
    lapTime: null,
    sectors: [null, null, null],
    valid: true,
    invalidReason: null,
    aborted: false,
    trafficLoss: 0,
    setOrder: null,
  };
  car.attempts.push(attempt);
  car.currentAttempt = car.attempts.length - 1;
  addEvent(state, `${carName(car)} começa volta lançada.`, "info", car.driverId);
}

function finishFlyingLap(state: QualifyingSessionState, car: QualifyingCarState): void {
  const attempt = car.currentAttempt == null ? null : car.attempts[car.currentAttempt];
  if (!attempt) return;
  const sectors = [...car.lastSectors];
  sectors[2] = Math.max(0, car.currentLapTime - (sectors[0] ?? 0) - (sectors[1] ?? 0));
  const rng = createRng(`${state.seed}:limits:${state.segment}:${car.driverId}:${attempt.id}`);
  const limitsRisk = clamp(
    0.008 + (100 - car.attributes.consistencia) * 0.00022 + car.attributes.agressividade * 0.00004 - car.attributes.experiencia * 0.000025,
    0.004,
    0.035,
  );
  const invalid = rng.chance(limitsRisk);
  attempt.completedAt = state.clock;
  attempt.sectors = sectors;
  attempt.trafficLoss = car.trafficLoss;
  if (invalid) {
    attempt.valid = false;
    attempt.invalidReason = "Volta invalidada por limites de pista";
    car.lastLap = null;
    car.lastSectors = sectors;
    addEvent(state, `${carName(car)} tem a volta invalidada nos limites de pista.`, "danger", car.driverId);
  } else {
    const time = car.currentLapTime;
    attempt.valid = true;
    attempt.lapTime = time;
    attempt.setOrder = state.sequence++;
    car.lastLap = time;
    car.lastSectors = sectors;
    const previousSegmentBest = car.segmentBest[state.segment];
    car.segmentBest[state.segment] = previousSegmentBest == null ? time : Math.min(previousSegmentBest, time);
    if (car.segmentBest[state.segment] === time) {
      car.segmentSetOrder[state.segment] = attempt.setOrder;
      car.segmentBestSectors[state.segment] = sectors;
    }
    const oldBest = car.bestLap;
    if (oldBest == null || time < oldBest) {
      car.bestLap = time;
      car.bestLapSetOrder = attempt.setOrder;
      car.bestSectors = sectors;
    }
    if (!state.fastestLap || time < state.fastestLap.time) {
      state.fastestLap = { driverId: car.driverId, time, segment: state.segment };
      addEvent(state, `${carName(car)} marca a volta mais rápida: ${time.toFixed(3)}s.`, "success", car.driverId);
    } else {
      addEvent(state, `${carName(car)} marca ${time.toFixed(3)}s.`, "success", car.driverId);
    }
  }
  state.rubber = clamp(state.rubber + 0.006, 0, 1);
  const lapPace = car.tyrePrep === "push" ? "attack" : car.tyrePrep === "manage" ? "conserve" : "normal";
  const wear = wearPerLap(car.tyre, car.compound, lapPace, car.tyrePrep, car.attributes, circuitById(state).abrasividade, state.rain, state.trackTemp);
  car.tyre.wear = clamp(car.tyre.wear + wear, 0, 100);
  car.tyre.ageLaps += 1;
  car.flyingRemaining -= 1;
  if (car.flyingRemaining > 0) {
    startFlyingLap(state, car);
  } else {
    car.status = "in";
    car.currentLapType = "in";
    car.currentLapTime = 0;
    car.currentSector = 0;
    car.lastSectors = [null, null, null];
    car.targetLapTime = lapTimeFor(state, car, "in");
    addEvent(state, `${carName(car)} entra nos boxes.`, "info", car.driverId);
  }
  rankCars(state);
}

function completeRun(state: QualifyingSessionState, car: QualifyingCarState): void {
  car.status = "garage";
  car.currentLapType = null;
  car.currentLapTime = 0;
  car.currentSector = 0;
  car.flyingRemaining = 0;
  car.runLaps = 0;
  car.trafficLoss = 0;
  car.distance = 0;
  car.speed = 0;
  car.currentAttempt = null;
  if (car.ai && car.aiAttempts < car.aiMaxAttempts) {
    const rng = createRng(`${state.seed}:ai-next:${state.segment}:${car.driverId}:${car.aiAttempts}`);
    const wait = 25 + rng.range(0, 80);
    car.aiNextSendAt = Math.max(requiredRunTime(state, car) + 2, state.clock - wait);
  }
  rankCars(state);
}

function abortAttempt(state: QualifyingSessionState, car: QualifyingCarState): void {
  if (car.status === "garage" || car.status === "eliminated" || car.status === "finished") return;
  const attempt = car.currentAttempt == null ? null : car.attempts[car.currentAttempt];
  if (attempt && attempt.completedAt == null) {
    attempt.aborted = true;
    attempt.valid = false;
    attempt.completedAt = state.clock;
    attempt.invalidReason = "Tentativa abortada";
  }
  car.aborted = true;
  car.status = "garage";
  car.currentLapType = null;
  car.currentLapTime = 0;
  car.currentSector = 0;
  car.flyingRemaining = 0;
  car.distance = 0;
  car.speed = 0;
  car.currentAttempt = null;
  addEvent(state, `${carName(car)} aborta a tentativa e volta aos boxes.`, "warn", car.driverId);
  if (car.ai && car.aiAttempts < car.aiMaxAttempts) {
    car.aiNextSendAt = Math.max(requiredRunTime(state, car) + 2, state.clock - 40);
  }
  rankCars(state);
}

function automaticAiDecision(state: QualifyingSessionState, car: QualifyingCarState): void {
  if (!car.ai || car.status !== "garage" || !isEligible(car)) return;
  if (car.aiAttempts >= car.aiMaxAttempts) return;
  const cutoff = formatConfig(state.type, state.segment).advance;
  const ranked = rankedParticipants(state);
  const index = ranked.findIndex((entry) => entry.driverId === car.driverId);
  const inDanger = index < 0 || index >= cutoff;
  if (state.clock <= 0) return;
  const required = requiredRunTime(state, car);
  if (car.aiNextSendAt == null) {
    car.aiNextSendAt = state.clock - (60 + (index % 5) * 25);
  }
  const mustGo = inDanger && state.clock < required + 75;
  if (state.clock > (car.aiNextSendAt ?? 0) && !mustGo) return;
  const rng = createRng(`${state.seed}:ai-go:${state.segment}:${car.driverId}:${car.aiAttempts}`);
  const allowed = allowedCompounds(state);
  if (state.rain > 0.15) {
    car.nextCompound = state.rain > 0.62 ? "wet" : "inter";
  } else if (allowed.includes("soft") && (state.clock < state.segmentDuration * 0.55 || state.segment === 3)) {
    car.nextCompound = "soft";
  } else {
    car.nextCompound = allowed.includes("medium") ? "medium" : allowed[0];
  }
  car.nextFuelLoad = state.clock > required + 130 && car.aiAttempts === 0 ? 0.45 : 0.25;
  car.nextTyrePrep = rng.chance(0.45) ? "push" : "normal";
  if (!allowed.includes(car.nextCompound) || (car.setsRemaining[car.nextCompound] ?? 0) <= 0) {
    car.nextCompound = allowed.find((compound) => (car.setsRemaining[compound] ?? 0) > 0) ?? car.nextCompound;
  }
  if (!canSend(state, car)) return;
  const onTrack = state.cars.filter((c) => c.status === "out" || c.status === "flying" || c.status === "in").length;
  if (!mustGo && onTrack > 8 && rng.chance(0.55)) {
    car.aiNextSendAt = state.clock - 20;
    return;
  }
  sendOut(state, car);
}

function updateWeather(state: QualifyingSessionState, dt: number): void {
  if (state.nextWeatherAt != null && state.clock <= state.nextWeatherAt) {
    addEvent(state, `Começa a chover: ${weatherLabel(state.nextRain)}.`, "warn");
    state.nextWeatherAt = null;
  }
  const raining = state.nextRain > 0 && state.nextWeatherAt == null;
  const target = raining ? state.nextRain : 0;
  state.rain += (target - state.rain) * Math.min(1, dt / 45);
  if (state.rain > 0.03) state.rubber = Math.max(0, state.rubber - dt * 0.0008);
  state.trackTemp = Math.round(24 + 14 * (1 - state.rain) - state.rain * 4);
}

function advanceCar(state: QualifyingSessionState, car: QualifyingCarState, track: TrackModel, dt: number): void {
  if (car.status === "garage" || car.status === "eliminated" || car.status === "finished") {
    car.speed = 0;
    return;
  }
  const others = state.cars.filter(
    (other) => other !== car && (other.status === "out" || other.status === "flying" || other.status === "in"),
  );
  let traffic = 1;
  let closest = Number.POSITIVE_INFINITY;
  for (const other of others) {
    const gap = other.distance - car.distance;
    if (gap > 0 && gap < 90) {
      closest = Math.min(closest, gap);
    }
  }
  if (Number.isFinite(closest)) {
    const proximity = 1 - closest / 90;
    traffic = 1 - proximity * 0.042;
    if (car.status === "flying") car.trafficLoss = Math.min(3, car.trafficLoss + dt * (1 - traffic) * 1.8);
  }
  const target = Math.max(12, track.length / Math.max(30, car.targetLapTime || 90)) * traffic;
  car.speed = target;
  car.currentLapTime += dt;
  car.distance += target * dt;
  car.tyre.temp = updateTyreTemperature(
    car.tyre,
    "normal",
    car.tyrePrep,
    target,
    state.airTemp,
    state.trackTemp,
    state.rain,
    dt,
  );
  if (car.status === "flying") {
    if (car.currentSector === 0 && car.distance >= track.sectorDistance[0]) {
      car.lastSectors[0] = car.currentLapTime;
      car.currentSector = 1;
    }
    if (car.currentSector === 1 && car.distance >= track.sectorDistance[1]) {
      car.lastSectors[1] = car.currentLapTime - (car.lastSectors[0] ?? 0);
      car.currentSector = 2;
    }
  }
  if (car.distance >= track.length) {
    car.distance -= track.length;
    if (car.status === "out") {
      car.tyre.wear = clamp(car.tyre.wear + wearPerLap(car.tyre, car.compound, "normal", car.tyrePrep, car.attributes, circuitById(state).abrasividade, state.rain, state.trackTemp) * 0.35, 0, 100);
      car.tyre.ageLaps += 1;
      startFlyingLap(state, car);
    } else if (car.status === "flying") {
      finishFlyingLap(state, car);
    } else if (car.status === "in") {
      car.tyre.wear = clamp(car.tyre.wear + wearPerLap(car.tyre, car.compound, "normal", car.tyrePrep, car.attributes, circuitById(state).abrasividade, state.rain, state.trackTemp) * 0.25, 0, 100);
      completeRun(state, car);
    }
  }
}

function finalizeSegment(state: QualifyingSessionState): void {
  if (state.status !== "running") return;
  const active = participants(state.cars);
  const ranked = [...active].sort((a, b) => compareSegment(a, b, state.segment));
  ranked.forEach((car, index) => {
    car.position = index + 1;
    car.status = "garage";
    car.distance = 0;
    car.speed = 0;
    car.currentLapType = null;
  });
  const config = formatConfig(state.type, state.segment);
  if (state.segment < 3) {
    ranked.forEach((car, index) => {
      if (index >= config.advance) {
        car.eliminatedIn = state.segment;
        car.status = "eliminated";
      }
    });
    state.status = "between";
    state.clock = 0;
    const eliminated = ranked.slice(config.advance).map((car) => carName(car));
    addEvent(state, `${segmentLabel(state.type, state.segment)} encerrada. Eliminados: ${eliminated.join(", ")}.`, "warn");
  } else {
    ranked.forEach((car) => {
      car.status = "finished";
    });
    state.status = "finished";
    state.clock = 0;
    addEvent(state, "Q3 encerrada. Grid definido.", "success");
    return;
  }
  rankCars(state);
}

export function createQualifyingSession(input: QualifyingSessionInput): QualifyingSessionState {
  const id = input.id ?? `quali_${input.seed.replace(/[^a-z0-9]/gi, "").slice(-12)}_${Date.now().toString(36)}`;
  const teams = new Map(input.teams.map((team) => [team.teamId, team]));
  const weatherRng = createRng(`${input.seed}:weather`);
  const baseTemp = Math.round(24 + weatherRng.range(0, 7));
  const willRain = weatherRng.chance(input.circuit.chanceChuva * 0.55);
  const firstDuration = segmentDuration(input.type, 1, input.durationOverride);
  const nextRain = willRain ? weatherRng.range(0.25, 0.82) : 0;
  const nextWeatherAt = willRain ? firstDuration * weatherRng.range(0.28, 0.7) : null;
  const cars: QualifyingCarState[] = input.drivers.map((driver, index) => {
    const team = teams.get(driver.teamId);
    if (!team) throw new Error(`Equipe não encontrada: ${driver.teamId}`);
    const setup = input.setups[driver.driverId] ?? {
      downforce: input.circuit.downforceIdeal,
      focus: "qualifying",
      startingCompound: "soft",
      fuelLoad: 0.25,
    };
    const compound = defaultCompound(input.type, 1, 0);
    return {
      driverId: driver.driverId,
      teamId: driver.teamId,
      status: "garage",
      position: index + 1,
      distance: 0,
      speed: 0,
      lane: 0,
      currentLapTime: 0,
      currentSector: 0,
      currentLapType: null,
      targetLapTime: 0,
      lastLap: null,
      bestLap: null,
      bestLapSetOrder: null,
      lastSectors: [null, null, null],
      bestSectors: [null, null, null],
      segmentBestSectors: { 1: [null, null, null], 2: [null, null, null], 3: [null, null, null] },
      segmentBest: { 1: null, 2: null, 3: null },
      segmentSetOrder: { 1: null, 2: null, 3: null },
      eliminatedIn: null,
      tyre: initialTyre(compound),
      compound,
      fuelLoad: 0.25,
      tyrePrep: "normal",
      nextCompound: compound,
      nextFuelLoad: 0.25,
      nextTyrePrep: "normal",
      setsRemaining: { ...(input.tyreInventory?.[driver.driverId] ?? initialSets(input.type)) },
      attempts: [],
      currentAttempt: null,
      flyingRemaining: 0,
      runLaps: 0,
      aborted: false,
      trafficLoss: 0,
      ai: !input.playerTeams.includes(driver.teamId),
      aiNextSendAt: null,
      aiAttempts: 0,
      aiMaxAttempts: carTrackScore(team.car, input.circuit) >= 92 ? 2 : 3,
      car: team.car,
      attributes: driver.atributos,
      setup,
    };
  });
  const state: QualifyingSessionState = {
    id,
    seed: input.seed,
    type: input.type,
    circuitId: input.circuit.id,
    round: input.round,
    segment: 1,
    status: "running",
    clock: firstDuration,
    segmentDuration: firstDuration,
    trackEvolution: 0.1,
    rubber: 0.1,
    rain: 0,
    airTemp: baseTemp,
    trackTemp: baseTemp + 10,
    nextWeatherAt,
    nextRain,
    cars,
    events: [],
    fastestLap: null,
    sequence: 1,
    playerTeams: [...input.playerTeams],
    confidence: { ...input.confidence },
  };
  // Ordem inicial por potencial, apenas para a torre antes dos tempos.
  const seededOrder = [...state.cars].sort(
    (a, b) =>
      carTrackScore(b.car, input.circuit) + driverScore(b.attributes) - (carTrackScore(a.car, input.circuit) + driverScore(a.attributes)),
  );
  seededOrder.forEach((car, index) => {
    car.position = index + 1;
  });
  state.events.push({
    id: nextEventId(state),
    clock: state.clock,
    segment: 1,
    message: `${segmentLabel(input.type, 1)} iniciada. ${state.cars.length} carros no pit lane.`,
    severity: "info",
  });
  planAiForSegment(state);
  return state;
}

export function applyQualifyingCommand(
  state: QualifyingSessionState,
  command: QualifyingCommand,
  actorTeamId: string | null,
): { ok: boolean; error?: string } {
  const car = state.cars.find((entry) => entry.driverId === command.driverId);
  if (!car) return { ok: false, error: "Piloto não encontrado." };
  if (!actorTeamId || car.teamId !== actorTeamId) return { ok: false, error: "Você só pode comandar seus próprios pilotos." };
  if (state.status !== "running") return { ok: false, error: "A sessão não está em andamento." };
  if (command.type === "plan") {
    if (car.status !== "garage") return { ok: false, error: "O piloto não está nos boxes." };
    if (command.compound) {
      if (!allowedCompounds(state).includes(command.compound)) return { ok: false, error: "Composto não permitido nesta fase." };
      if ((car.setsRemaining[command.compound] ?? 0) <= 0) return { ok: false, error: "Não há jogos deste composto." };
      car.nextCompound = command.compound;
    }
    if (command.fuelLoad != null) car.nextFuelLoad = clamp(command.fuelLoad, 0.2, 0.7);
    if (command.tyrePrep) car.nextTyrePrep = command.tyrePrep;
    return { ok: true };
  }
  if (command.type === "sendOut") {
    if (!canSend(state, car)) return { ok: false, error: "Não há tempo ou pneus suficientes para uma nova tentativa." };
    sendOut(state, car);
    return { ok: true };
  }
  if (command.type === "abort") {
    if (car.status === "garage" || car.status === "eliminated" || car.status === "finished") {
      return { ok: false, error: "O piloto não está em uma tentativa." };
    }
    abortAttempt(state, car);
    return { ok: true };
  }
  return { ok: false, error: "Comando desconhecido." };
}

export function advanceQualifyingSegment(state: QualifyingSessionState): { ok: boolean; error?: string } {
  if (state.status !== "between") return { ok: false, error: "A sessão não está entre segmentos." };
  if (state.segment >= 3) return { ok: false, error: "A classificação já terminou." };
  resetForSegment(state, (state.segment + 1) as 2 | 3);
  return { ok: true };
}

export function advanceQualifyingSession(state: QualifyingSessionState, dt: number): void {
  if (state.status !== "running") return;
  if (state.clock <= 0) {
    finalizeSegment(state);
    return;
  }
  const step = Math.min(dt, 2);
  state.clock = Math.max(0, state.clock - step);
  updateWeather(state, step);
  state.trackEvolution = state.rubber;
  const track = trackFor(state);
  for (const car of state.cars) automaticAiDecision(state, car);
  for (const car of state.cars) advanceCar(state, car, track, step);
  if (state.clock <= 0) finalizeSegment(state);
}

export function simulateQualifyingToEnd(state: QualifyingSessionState, maxSteps = 20000): void {
  for (const car of state.cars) car.ai = true;
  let steps = 0;
  while (state.status !== "finished" && steps < maxSteps) {
    if (state.status === "between") {
      const res = advanceQualifyingSegment(state);
      if (!res.ok) break;
    } else {
      advanceQualifyingSession(state, 1);
    }
    steps++;
  }
}

export function setQualifyingTeamAI(state: QualifyingSessionState, teamId: string, ai: boolean): void {
  for (const car of state.cars) if (car.teamId === teamId) car.ai = ai;
}

export function qualifyingResultFromSession(state: QualifyingSessionState): QualifyingResult {
  const q3 = [...state.cars].filter((car) => car.eliminatedIn === null || car.status === "finished").sort((a, b) => compareSegment(a, b, 3));
  const q1Order = [...state.cars].sort((a, b) => compareSegment(a, b, 1));
  const q2Participants = state.cars.filter((car) => car.eliminatedIn === null || car.eliminatedIn === 2 || car.eliminatedIn === 3);
  const q2Order = [...q2Participants].sort((a, b) => compareSegment(a, b, 2));
  const grid: string[] = [];
  for (const car of q3) grid.push(car.driverId);
  for (const car of q2Order) if (!grid.includes(car.driverId)) grid.push(car.driverId);
  for (const car of q1Order) if (!grid.includes(car.driverId)) grid.push(car.driverId);
  for (const car of state.cars) if (!grid.includes(car.driverId)) grid.push(car.driverId);
  const makeEntries = (list: QualifyingCarState[], segment: 1 | 2 | 3) =>
    list.map((car) => ({
      driverId: car.driverId,
      teamId: car.teamId,
      time: car.segmentBest[segment] ?? 0,
      q1: car.segmentBest[1],
      q2: car.segmentBest[2],
      q3: car.segmentBest[3],
      position: car.position,
      eliminatedIn: car.eliminatedIn,
    }));
  return {
    type: state.type,
    segments: [
      { segment: 1, entries: makeEntries(q1Order, 1) },
      { segment: 2, entries: makeEntries(q2Order, 2) },
      { segment: 3, entries: makeEntries(q3, 3) },
    ],
    grid,
  };
}

export function buildQualifyingView(state: QualifyingSessionState): QualifyingView {
  const leader = leaderTime(state);
  const cutoff = state.segment < 3 ? formatConfig(state.type, state.segment).advance : null;
  const ranked = [...state.cars].sort((a, b) => a.position - b.position);
  return {
    id: state.id,
    type: state.type,
    circuitId: state.circuitId,
    round: state.round,
    segment: state.segment,
    status: state.status,
    clock: state.clock,
    segmentDuration: state.segmentDuration,
    trackEvolution: state.trackEvolution,
    rubber: state.rubber,
    rain: state.rain,
    airTemp: state.airTemp,
    trackTemp: state.trackTemp,
    condition: weatherLabel(state.rain),
    cutoff,
    allowedCompounds: allowedCompounds(state),
    cars: ranked.map((car) => {
      const required = requiredRunTime(state, car);
      const best = car.segmentBest[state.segment];
      const currentAttempts = car.attempts.filter((attempt) => attempt.segment === state.segment);
      return {
        driverId: car.driverId,
        teamId: car.teamId,
        status: car.status,
        position: car.position,
        distance: car.distance,
        speed: car.speed,
        lastLap: car.lastLap,
        bestLap: best,
        lastSectors: car.lastSectors,
        bestSectors: car.segmentBestSectors[state.segment],
        compound: car.compound,
        fuelLoad: car.fuelLoad,
        tyreWear: car.tyre.wear,
        tyreTemp: car.tyre.temp,
        attempts: car.attempts.filter((attempt) => attempt.segment === state.segment).length,
        currentAttempt: car.currentAttempt,
        flyingRemaining: car.flyingRemaining,
        recentLaps: car.attempts
          .slice(-3)
          .map((attempt) => ({
            id: attempt.id,
            valid: attempt.valid,
            time: attempt.lapTime,
            compound: attempt.compound,
            aborted: attempt.aborted,
            sectors: attempt.sectors,
          })),
        setsRemaining: car.setsRemaining,
        nextCompound: car.nextCompound,
        nextFuelLoad: car.nextFuelLoad,
        nextTyrePrep: car.nextTyrePrep,
        eliminatedIn: car.eliminatedIn,
        gapToLeader: leader == null || best == null ? null : Math.max(0, best - leader),
        trafficLoss: car.trafficLoss,
        improved: best != null && car.lastLap != null && Math.abs(best - car.lastLap) < 0.0005 && currentAttempts.length > 1,
        canSend: canSend(state, car),
        requiredTime: required,
        ai: car.ai,
      };
    }),
    events: state.events.slice(-40),
    fastestLap: state.fastestLap,
    playerTeams: state.playerTeams,
  };
}

export function qualifyingRoundLabel(type: "quali" | "sprintQuali", segment: 1 | 2 | 3): string {
  return `${type === "sprintQuali" ? "SQ" : "Q"}${segment}`;
}
