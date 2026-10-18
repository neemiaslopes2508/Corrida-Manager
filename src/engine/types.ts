import type { CarAttributes, CircuitData, DriverAttributes, StaffCandidate, StaffRole } from "../data/season2026";

export type Compound = "soft" | "medium" | "hard" | "inter" | "wet";
export type PaceMode = "conserve" | "normal" | "attack";
export type EnergyMode = "save" | "normal" | "push";
export type TyreMode = "manage" | "normal" | "push";
export type TrackStatus = "green" | "sc" | "vsc" | "chequered";
export type CarStatus = "running" | "finished" | "retired";
export type PitState = "none" | "entering" | "service" | "exiting";

export interface CarSetup {
  downforce: number; // 0 = baixa, 1 = alta
  focus: "qualifying" | "balanced" | "race";
  startingCompound: Compound;
  fuelLoad: number; // 0 = leve, 1 = tanque cheio
}

export const DEFAULT_SETUP: CarSetup = {
  downforce: 0.6,
  focus: "balanced",
  startingCompound: "medium",
  fuelLoad: 1,
};

export interface TeamRaceSpec {
  teamId: string;
  car: CarAttributes;
  pitCrew: number; // 0-100
}

export interface DriverRaceSpec {
  driverId: string;
  teamId: string;
  nome: string;
  codigo: string;
  numero: number;
  atributos: DriverAttributes;
  moral?: number;
}

export interface WeatherPhase {
  fromLap: number;
  rain: number; // 0-1
  airTemp: number;
  trackTemp: number;
}

export interface RaceConfig {
  seed: string;
  circuit: CircuitData;
  totalLaps: number;
  isSprint: boolean;
  grid: string[]; // driverIds na ordem do grid
  teams: TeamRaceSpec[];
  drivers: DriverRaceSpec[];
  setups: Record<string, CarSetup>;
  weather: WeatherPhase[];
  mandatoryStop: boolean;
  playerTeams: string[];
  strategyPlans?: Record<string, number | null>;
  initialTrackStatus?: "green" | "sc";
}

export interface TyreState {
  compound: Compound;
  wear: number; // 0-100
  temp: number; // °C
  ageLaps: number;
  stints: number;
  usedCompounds: Compound[];
  punctured: boolean;
}

export interface PitStateData {
  plannedLap: number | null;
  requested: boolean;
  state: PitState;
  timer: number;
  stops: number;
  serviceTime: number;
  lastStopLap: number | null;
  lapDelta: number;
}

export interface RaceCar {
  driverId: string;
  teamId: string;
  gridPosition: number;
  position: number;
  distance: number; // metros percorridos desde o grid (pode começar negativo)
  startOffset: number;
  speed: number; // m/s
  form: number;
  attacking: boolean;
  lap: number; // voltas completadas
  status: CarStatus;
  finishTime: number | null;
  retiredReason: string | null;
  lapStartTime: number;
  lastLap: number | null;
  bestLap: number | null;
  lapTimes: number[];
  tyre: TyreState;
  fuelKg: number;
  fuelStartKg: number;
  energy: number; // 0-100
  pace: PaceMode;
  energyMode: EnergyMode;
  tyreMode: TyreMode;
  nextCompound: Compound;
  pit: PitStateData;
  penalties: number;
  penaltyNotes: string[];
  damage: number; // 0-1
  overtakeMode: boolean;
  overtakeCooldown: number;
  defendingUntil: number;
  attackLane: number; // -1..1 deslocamento lateral visual/lógico
  lane: number;
  positionGapAhead: number;
  positionGapLeader: number;
  bestSector: number;
  incidents: number;
  teamOrder: number;
}

export interface RaceEvent {
  id: number;
  time: number;
  tick: number;
  lap: number;
  type:
    | "start"
    | "overtake"
    | "pit"
    | "tyre"
    | "incident"
    | "retirement"
    | "sc"
    | "vsc"
    | "green"
    | "weather"
    | "penalty"
    | "finish"
    | "info"
    | "fastest";
  message: string;
  driverId?: string;
  severity: "info" | "warn" | "danger" | "success";
}

export interface RaceWeather {
  rain: number;
  condition: string;
  airTemp: number;
  trackTemp: number;
  forecast: WeatherPhase[];
  nextChangeLap: number;
  wetDeclared: boolean;
}

export interface FastestLap {
  driverId: string;
  lap: number;
  time: number;
}

export interface RaceState {
  seed: string;
  rngState: number;
  tick: number;
  stepMs: number;
  elapsed: number; // segundos simulados
  circuitId: string;
  trackKey: string;
  totalLaps: number;
  isSprint: boolean;
  status: "running" | "finished";
  trackStatus: TrackStatus;
  trackStatusUntil: number;
  weather: RaceWeather;
  cars: RaceCar[];
  teams: TeamRaceSpec[];
  drivers: DriverRaceSpec[];
  setups: Record<string, CarSetup>;
  events: RaceEvent[];
  nextEventId: number;
  leaderLap: number;
  finishOrder: string[];
  fastestLap: FastestLap | null;
  mandatoryStop: boolean;
  playerTeams: string[];
  startedAt: number;
  endedAt: number | null;
  scLaps: number;
  lastScLap: number;
  safetyCarDeployed: number;
}

export interface RaceCarView {
  driverId: string;
  teamId: string;
  gridPosition: number;
  position: number;
  distance: number;
  speed: number;
  lap: number;
  status: CarStatus;
  tyre: TyreState;
  fuelKg: number;
  energy: number;
  pace: PaceMode;
  energyMode: EnergyMode;
  tyreMode: TyreMode;
  nextCompound: Compound;
  pit: PitStateData;
  lastLap: number | null;
  bestLap: number | null;
  gapLeader: number;
  gapAhead: number;
  penalty: number;
  damage: number;
  stops: number;
  overtakeMode: boolean;
  lane: number;
  retiredReason: string | null;
  finishTime: number | null;
}

export interface RaceView {
  tick: number;
  elapsed: number;
  circuitId: string;
  totalLaps: number;
  lap: number;
  isSprint: boolean;
  status: "running" | "finished";
  trackStatus: TrackStatus;
  weather: RaceWeather;
  cars: RaceCarView[];
  events: RaceEvent[];
  fastestLap: FastestLap | null;
  playerTeams: string[];
  leaderLap: number;
}

export type RaceCommand =
  | { type: "pace"; driverId: string; value: PaceMode }
  | { type: "energy"; driverId: string; value: EnergyMode }
  | { type: "tyreMode"; driverId: string; value: TyreMode }
  | { type: "nextCompound"; driverId: string; value: Compound }
  | { type: "pitNow"; driverId: string }
  | { type: "schedulePit"; driverId: string; lap: number }
  | { type: "cancelPit"; driverId: string };

export interface QualifyingEntry {
  driverId: string;
  teamId: string;
  time: number;
  q1: number | null;
  q2: number | null;
  q3: number | null;
  position: number;
  eliminatedIn: 1 | 2 | 3 | null;
}

export interface QualifyingResult {
  type: "quali" | "sprintQuali";
  segments: { segment: 1 | 2 | 3; entries: QualifyingEntry[] }[];
  grid: string[];
}

export interface PracticeProgramResult {
  type: "qualifying" | "race" | "tyres";
  label: string;
  summary: string;
  confidenceGain: number;
  data: string[];
}

export interface PracticeState {
  runs: number;
  confidence: number;
  programs: PracticeProgramResult[];
  idealDownforce: number;
  tyreInfo: string;
  weatherForecast: string;
}

export interface SessionEntry {
  driverId: string;
  teamId: string;
  position: number;
  grid: number;
  status: "finished" | "retired" | "classified";
  time: number | null;
  gap: number | null;
  laps: number;
  points: number;
  stops: number;
  penalty: number;
  fastestLap: number | null;
  reason?: string;
}

export interface SessionResult {
  round: number;
  circuitId: string;
  kind: "race" | "sprint";
  entries: SessionEntry[];
  fastestLapDriverId: string | null;
  weatherSummary: string;
  safetyCars: number;
  seed: string;
  completedAt: string;
}

export interface Standing {
  points: number;
  wins: number;
  podiums: number;
  races: number;
  bestFinish: number;
  sprintWins: number;
}

export interface LedgerEntry {
  round: number;
  descricao: string;
  valor: number; // positivo receita, negativo despesa
  categoria: "patrocinio" | "premio" | "salario" | "desenvolvimento" | "funcionarios" | "componentes" | "contrato" | "objetivo" | "outro";
}

export interface DevelopmentProject {
  id: string;
  area: keyof CarAttributes;
  nome: string;
  nivel: number;
  custo: number;
  etapasTotal: number;
  etapasRestantes: number;
  ganho: number;
}

export interface TeamState {
  teamId: string;
  car: CarAttributes;
  budget: number;
  sponsorId: string | null;
  sponsorBonusPaid: number;
  staff: Record<StaffRole, StaffCandidate>;
  project: DevelopmentProject | null;
  components: { pu: number; cambio: number; freios: number; bateria: number };
  objectives: { descricao: string; targetPosition: number; bonus: number; completed: boolean };
  ledger: LedgerEntry[];
  ai: boolean;
  reputation: number;
}

export interface CareerDriver {
  driverId: string;
  teamId: string;
  attributes: DriverAttributes;
  salario: number;
  contratoEtapas: number;
  moral: number;
}

export type CareerPhase =
  | "management"
  | "prep"
  | "practice"
  | "sprintQuali"
  | "sprint"
  | "qualifying"
  | "race"
  | "results"
  | "seasonEnd";

export interface CareerRoundState {
  round: number;
  practice: PracticeState | null;
  setups: Record<string, CarSetup>;
  strategyPlans: Record<string, number | null>;
  sprintQualifying: QualifyingResult | null;
  qualifying: QualifyingResult | null;
  sprintResult: SessionResult | null;
  raceResult: SessionResult | null;
}

export interface Career {
  id: string;
  nome: string;
  seed: string;
  modo: "solo" | "multi";
  createdAt: string;
  updatedAt: string;
  playerTeams: string[];
  roundIndex: number;
  phase: CareerPhase;
  seasonComplete: boolean;
  teams: TeamState[];
  drivers: CareerDriver[];
  rounds: CareerRoundState[];
  standingsDrivers: Record<string, Standing>;
  standingsConstructors: Record<string, Standing>;
  results: SessionResult[];
  news: string[];
  champions: { drivers: string; constructors: string } | null;
  raceInProgress: RaceState | null;
  version: number;
}

export interface CareerSummary {
  id: string;
  nome: string;
  modo: "solo" | "multi";
  playerTeams: string[];
  roundIndex: number;
  phase: CareerPhase;
  updatedAt: string;
  seasonComplete: boolean;
}
