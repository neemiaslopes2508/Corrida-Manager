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
  pitCrew: number; // 0-100, competência da equipe de pit stop
  strategist?: number; // 0-100, competência do estrategista/IA
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
  strategyPlansV2?: Record<string, RaceStrategyPlan>;
  tyreInventory?: Record<string, Record<Compound, number>>;
  initialTrackStatus?: "green" | "sc";
}

export interface StrategyStint {
  compound: Compound;
  laps: number;
}

export interface StrategyPitWindow {
  before: number;
  after: number;
}

export interface RaceStrategyPlan {
  driverId: string;
  stints: StrategyStint[];
  pitWindows: StrategyPitWindow[];
  source: "player" | "ai";
  version: number;
}

export interface TyreProjection {
  compound: Compound;
  startLap: number;
  endLap: number;
  laps: number;
  endWear: number;
  remainingLaps: number;
  averageLapTime: number;
  warmupLaps: number;
  risk: number;
}

export interface RaceStrategyProjection {
  stints: TyreProjection[];
  pitLaps: number[];
  pitLoss: number;
  totalTime: number;
  risk: number;
}

export interface StrategyRecommendation {
  key: string;
  lap: number;
  severity: "info" | "warn" | "danger" | "success";
  action: "pit" | "extend" | "save" | "push" | "info";
  message: string;
}

export interface RaceStrategyState {
  plan: RaceStrategyPlan;
  stintIndex: number;
  plannedPitLap: number | null;
  windowStart: number | null;
  windowEnd: number | null;
  version: number;
  lastAdviceKey: string | null;
  lastAdviceLap: number;
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

export type DisputePhase = "none" | "approach" | "prepare" | "attempt" | "sideBySide" | "defend" | "counter";
export type PassKind = "attack" | "pace" | "tyre" | "mistake";

export interface RaceCar {
  driverId: string;
  teamId: string;
  gridPosition: number;
  position: number;
  distance: number; // metros percorridos desde o grid (pode começar negativo)
  startOffset: number;
  speed: number; // m/s
  form: number;
  // largada: reação individual às luzes, tração e qualidade estimada
  launchReaction: number; // segundos após as luzes até começar a acelerar
  launchTraction: number; // multiplicador de aceleração inicial
  launchQuality: number; // 0-1, qualidade estimada da largada
  // ritmo por volta: variação determinística separada do RNG principal
  lapPace: number;
  lapPaceLap: number;
  attacking: boolean;
  targetDriverId: string | null; // carro efetivamente atacado
  attackStartedAt: number | null;
  overtakeAttempts: number;
  attackAttempts: number;
  // máquina de disputa e personalidade
  disputePhase: DisputePhase;
  disputeStartedAt: number | null;
  passKind: PassKind | null;
  paceAdvantageTicks: number;
  defending: boolean;
  defendTargetId: string | null;
  defendStartedAt: number | null;
  counterUntil: number;
  sideBySideTicks: number;
  defendedAttempts: number;
  lap: number; // voltas completadas
  status: CarStatus;
  finishTime: number | null;
  retiredReason: string | null;
  lapStartTime: number;
  lastLap: number | null;
  bestLap: number | null;
  lapTimes: number[];
  // setores: tempos do último conjunto completo e melhores parciais
  sectors: (number | null)[];
  bestSectors: (number | null)[];
  sectorBuffer: (number | null)[];
  sectorStartTime: number;
  sectorIndex: number;
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
  trackLimitWarnings: number;
  contactWarnings: number;
  dangerousWarnings: number;
  damage: number; // 0-1
  overtakeMode: boolean;
  overtakeCooldown: number;
  defendingUntil: number;
  attackLane: number; // -1..1 deslocamento lateral visual/lógico
  lane: number;
  positionGapAhead: number;
  positionGapLeader: number;
  incidents: number;
  strategy: RaceStrategyState;
  tyreInventory: Record<Compound, number>;
  advice: StrategyRecommendation | null;
  lastAdviceLap: number;
  lastAdviceKey: string | null;
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
  adviceKey?: string;
  passedDriverId?: string;
  attackSuccess?: boolean;
  passKind?: PassKind;
  counterAttack?: boolean;
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
  trackStatusUntilLap: number | null;
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

export interface RaceCarStrategyView {
  stintIndex: number;
  plannedPitLap: number | null;
  windowStart: number | null;
  windowEnd: number | null;
  stopsPlanned: number;
  version: number;
  planVisible: boolean;
  plan: RaceStrategyPlan | null;
  projection: TyreProjection | null;
  inventory: Record<Compound, number> | null;
  recommendation: StrategyRecommendation | null;
  pitLoss: number;
  undercutProjection: number;
  overcutProjection: number;
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
  sectors: (number | null)[];
  bestSectors: (number | null)[];
  gapLeader: number;
  gapAhead: number;
  penalty: number;
  penaltyNotes: string[];
  trackLimitWarnings: number;
  damage: number;
  stops: number;
  overtakeMode: boolean;
  lane: number;
  retiredReason: string | null;
  finishTime: number | null;
  strategy: RaceCarStrategyView;
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
  trackStatusUntilLap: number | null;
  weather: RaceWeather;
  cars: RaceCarView[];
  events: RaceEvent[];
  fastestLap: FastestLap | null;
  playerTeams: string[];
  leaderLap: number;
  pitLossEstimate: number;
}

export type RaceCommand =
  | { type: "pace"; driverId: string; value: PaceMode }
  | { type: "energy"; driverId: string; value: EnergyMode }
  | { type: "tyreMode"; driverId: string; value: TyreMode }
  | { type: "nextCompound"; driverId: string; value: Compound }
  | { type: "pitNow"; driverId: string; revision?: number }
  | { type: "schedulePit"; driverId: string; lap: number; revision?: number }
  | { type: "cancelPit"; driverId: string; revision?: number }
  | { type: "applyStrategyPlan"; driverId: string; plan: RaceStrategyPlan; revision: number };

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

export type QualifyingCarStatus = "garage" | "out" | "flying" | "in" | "eliminated" | "finished";
export type QualifyingSessionStatus = "running" | "between" | "finished";

export interface QualifyingAttempt {
  id: number;
  segment: 1 | 2 | 3;
  compound: Compound;
  fuelLoad: number;
  tyrePrep: TyreMode;
  startedAt: number;
  completedAt: number | null;
  lapTime: number | null;
  sectors: (number | null)[];
  valid: boolean;
  invalidReason: string | null;
  aborted: boolean;
  trafficLoss: number;
  setOrder: number | null;
}

export interface QualifyingCarState {
  driverId: string;
  teamId: string;
  status: QualifyingCarStatus;
  position: number;
  distance: number;
  speed: number;
  lane: number;
  currentLapTime: number;
  currentSector: number;
  currentLapType: "out" | "flying" | "in" | null;
  targetLapTime: number;
  lastLap: number | null;
  bestLap: number | null;
  bestLapSetOrder: number | null;
  lastSectors: (number | null)[];
  bestSectors: (number | null)[];
  segmentBestSectors: Record<1 | 2 | 3, (number | null)[]>;
  segmentBest: Record<1 | 2 | 3, number | null>;
  segmentSetOrder: Record<1 | 2 | 3, number | null>;
  eliminatedIn: 1 | 2 | 3 | null;
  tyre: TyreState;
  compound: Compound;
  fuelLoad: number;
  tyrePrep: TyreMode;
  nextCompound: Compound;
  nextFuelLoad: number;
  nextTyrePrep: TyreMode;
  setsRemaining: Record<Compound, number>;
  attempts: QualifyingAttempt[];
  currentAttempt: number | null;
  flyingRemaining: number;
  runLaps: number;
  aborted: boolean;
  trafficLoss: number;
  ai: boolean;
  aiNextSendAt: number | null;
  aiAttempts: number;
  aiMaxAttempts: number;
  car: CarAttributes;
  attributes: DriverAttributes;
  setup: CarSetup;
}

export interface QualifyingEvent {
  id: number;
  clock: number;
  segment: 1 | 2 | 3;
  driverId?: string;
  message: string;
  severity: "info" | "success" | "warn" | "danger";
}

export interface QualifyingSessionState {
  id: string;
  seed: string;
  type: "quali" | "sprintQuali";
  circuitId: string;
  round: number;
  segment: 1 | 2 | 3;
  status: QualifyingSessionStatus;
  clock: number;
  segmentDuration: number;
  trackEvolution: number;
  rubber: number;
  rain: number;
  airTemp: number;
  trackTemp: number;
  nextWeatherAt: number | null;
  nextRain: number;
  cars: QualifyingCarState[];
  events: QualifyingEvent[];
  fastestLap: { driverId: string; time: number; segment: 1 | 2 | 3 } | null;
  sequence: number;
  playerTeams: string[];
  confidence: Record<string, number>;
}

export interface QualifyingCarView {
  driverId: string;
  teamId: string;
  status: QualifyingCarStatus;
  position: number;
  distance: number;
  speed: number;
  lastLap: number | null;
  bestLap: number | null;
  lastSectors: (number | null)[];
  bestSectors: (number | null)[];
  compound: Compound;
  fuelLoad: number;
  tyreWear: number;
  tyreTemp: number;
  attempts: number;
  currentAttempt: number | null;
  flyingRemaining: number;
  recentLaps: { id: number; valid: boolean; time: number | null; compound: Compound; aborted: boolean; sectors: (number | null)[] }[];
  setsRemaining: Record<Compound, number>;
  nextCompound: Compound;
  nextFuelLoad: number;
  nextTyrePrep: TyreMode;
  eliminatedIn: 1 | 2 | 3 | null;
  gapToLeader: number | null;
  trafficLoss: number;
  improved: boolean;
  canSend: boolean;
  requiredTime: number;
  ai: boolean;
}

export interface QualifyingView {
  id: string;
  type: "quali" | "sprintQuali";
  circuitId: string;
  round: number;
  segment: 1 | 2 | 3;
  status: QualifyingSessionStatus;
  clock: number;
  segmentDuration: number;
  trackEvolution: number;
  rubber: number;
  rain: number;
  airTemp: number;
  trackTemp: number;
  condition: string;
  cutoff: number | null;
  allowedCompounds: Compound[];
  cars: QualifyingCarView[];
  events: QualifyingEvent[];
  fastestLap: { driverId: string; time: number; segment: 1 | 2 | 3 } | null;
  playerTeams: string[];
}

export type QualifyingCommand =
  | { type: "plan"; driverId: string; compound?: Compound; fuelLoad?: number; tyrePrep?: TyreMode }
  | { type: "sendOut"; driverId: string }
  | { type: "abort"; driverId: string };

export interface PracticeProgramResult {
  type: "qualifying" | "race" | "tyres";
  label: string;
  summary: string;
  confidenceGain: number;
  data: string[];
  driverId?: string;
  setup?: CarSetup;
}

export interface PracticeDriverState {
  driverId: string;
  teamId: string;
  runs: number;
  confidence: number;
  programs: PracticeProgramResult[];
  downforceEstimate: number;
  downforceMargin: number;
  bestQualifyingLap: number | null;
  degradationPerLap: number | null;
  degradationFactor: number;
  fuelPerLap: number | null;
  pitLoss: number | null;
  compoundTimes: Record<"soft" | "medium" | "hard", number> | null;
  tyreInfo: string;
}

export interface PracticeTeamState {
  teamId: string;
  drivers: Record<string, PracticeDriverState>;
}

export interface PracticeState {
  /** Campos legados mantidos para saves antigos e telas que ainda os consultam. */
  runs: number;
  confidence: number;
  programs: PracticeProgramResult[];
  idealDownforce: number;
  tyreInfo: string;
  weatherForecast: string;
  teams?: Record<string, PracticeTeamState>;
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
  pitCrew?: number; // 0-100; ausente em saves antigos, derivado na migração
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
  raceStrategyPlans?: Record<string, RaceStrategyPlan>;
  tyreInventory?: Record<string, Record<Compound, number>>;
  sprintQualifying: QualifyingResult | null;
  qualifying: QualifyingResult | null;
  qualifyingSession?: QualifyingSessionState | null;
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
