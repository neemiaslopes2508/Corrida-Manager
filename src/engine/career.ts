import {
  CIRCUITS_2026,
  CIRCUIT_BY_ID,
  DRIVERS_2026,
  DRIVER_BY_ID,
  SPONSOR_OFFERS,
  STAFF_MARKET,
  TEAMS_2026,
  TEAM_BY_ID,
  type CarAttributes,
  type CircuitData,
  type SponsorOffer,
  type StaffCandidate,
  type StaffRole,
} from "../data/season2026";
import { createRng, hashSeed } from "./rng";
import { createRaceState, createWeather, defaultSetup, describeWeather, raceToSessionResult } from "./race";
import type { RaceConfig } from "./types";
import { simulateQualifying, type QualifyingInput } from "./qualifying";
import { createQualifyingSession, qualifyingResultFromSession, type QualifyingSessionInput } from "./qualifyingSession";
import { initialTyre, wearPerLap } from "./tyres";
import {
  allocateTyreInventory,
  buildPlanWithStops,
  cloneInventory,
  estimateLapTime,
  estimatePitLoss,
  fuelPerLap,
  makeDefaultRacePlan,
  normalizeRacePlan,
  validateRacePlan,
} from "./raceStrategy";
import type {
  Career,
  CareerPhase,
  CareerRoundState,
  CarSetup,
  CareerDriver,
  Compound,
  DriverRaceSpec,
  LedgerEntry,
  PracticeDriverState,
  PracticeProgramResult,
  PracticeState,
  PracticeTeamState,
  QualifyingResult,
  QualifyingSessionState,
  RaceStrategyPlan,
  SessionResult,
  Standing,
  TeamRaceSpec,
  TeamState,
} from "./types";

export const CAREER_VERSION = 3;
const PRIZE_BY_POSITION = [9.0, 7.5, 6.0, 5.0, 4.0, 3.3, 2.7, 2.2, 1.8, 1.5, 1.2];
const RACE_TRAVEL_COST = 0.7;
const CONTRACT_RENEW_COST_FACTOR = 2.4;

const STAFF_FIRST = ["Marco", "Elena", "Yuki", "Sofia", "Idris", "Helena", "Rafael", "Aiko", "Jonas", "Marta", "Luis", "Nadia", "Peter", "Chiara", "Omar", "Lena", "Diego", "Mei", "Henrik", "Zara"];
const STAFF_LAST = ["Rossi", "Vasquez", "Tanaka", "Meyer", "Bello", "Duarte", "Kodama", "Silva", "Weber", "Novak", "Ferreira", "Haddad", "Lang", "Bianchi", "Nasser", "Schmidt", "Alvarez", "Chen", "Jensen", "Okafor"];

export interface CreateCareerOptions {
  nome: string;
  modo: "solo" | "multi";
  playerTeams: string[];
  seed?: string;
  id?: string;
}

export function makeStaff(teamId: string, role: StaffRole, ratingBase: number, index: number): StaffCandidate {
  const h = hashSeed(`${teamId}:${role}`);
  const nome = `${STAFF_FIRST[(h + index * 7) % STAFF_FIRST.length]} ${STAFF_LAST[(h >>> 3) % STAFF_LAST.length]}`;
  return {
    id: `staff_${teamId}_${role}`,
    nome,
    funcao: role,
    rating: Math.round(Math.max(58, Math.min(96, ratingBase + ((h >>> 5) % 10) - 5))),
    salario: Math.round((ratingBase / 100) * 0.7 * 100) / 100,
    contratacao: 1.0,
  };
}

function initialStanding(): Standing {
  return { points: 0, wins: 0, podiums: 0, races: 0, bestFinish: 99, sprintWins: 0 };
}

function derivedPitCrew(team: TeamState | { reputation: number; car: { confiabilidade: number } }): number {
  return Math.round(Math.max(50, Math.min(95, 55 + team.reputation * 0.28 + (team.car.confiabilidade - 70) * 0.15)));
}

function createTeamStates(playerTeams: string[]): TeamState[] {
  return TEAMS_2026.map((team, idx) => {
    const base = team.reputacao;
    const staff: Record<StaffRole, StaffCandidate> = {
      engenheiro_chefe: makeStaff(team.id, "engenheiro_chefe", base * 0.55 + 40, 0),
      aerodinamicista: makeStaff(team.id, "aerodinamicista", base * 0.52 + 43, 1),
      estrategista: makeStaff(team.id, "estrategista", base * 0.5 + 45, 2),
    };
    const sponsor = [...SPONSOR_OFFERS]
      .filter((s) => s.reputacaoMinima <= team.reputacao)
      .sort((a, b) => b.porEtapa - a.porEtapa)[0];
    const target = Number(team.objetivo.match(/entre os (\d+)/)?.[1] ?? team.objetivo.match(/top (\d+)/)?.[1] ?? 8);
    return {
      teamId: team.id,
      car: { ...team.carro },
      budget: team.orcamentoInicial,
      sponsorId: sponsor?.id ?? null,
      sponsorBonusPaid: 0,
      staff,
      pitCrew: Math.round(Math.max(50, Math.min(95, 55 + team.reputacao * 0.28 + (team.carro.confiabilidade - 70) * 0.15))),
      project: null,
      components: { pu: 12 + (idx % 4) * 4, cambio: 8 + (idx % 3) * 3, freios: 10, bateria: 9 },
      objectives: {
        descricao: team.objetivo,
        targetPosition: Math.max(1, Math.min(11, target)),
        bonus: 5 + Math.round(team.reputacao / 20),
        completed: false,
      },
      ledger: [],
      ai: !playerTeams.includes(team.id),
      reputation: team.reputacao,
    };
  });
}

function createDrivers(): CareerDriver[] {
  return DRIVERS_2026.map((d) => ({
    driverId: d.id,
    teamId: d.equipeId,
    attributes: { ...d.atributos },
    salario: d.salario,
    contratoEtapas: 2,
    moral: 62 + (d.atributos.velocidade % 9),
  }));
}

function driverSetup(circuit: CircuitData, ai: boolean, index: number, sprint: boolean): CarSetup {
  const rng = createRng(`${circuit.id}:setup:${index}`);
  // Nenhum carro começa com o acerto perfeito: o treino livre é o que
  // estreita a faixa provável e permite decidir o ajuste final.
  const spread = ai ? 0.06 : 0.10;
  return {
    downforce: Math.max(0.15, Math.min(0.95, circuit.downforceIdeal + rng.range(-spread, spread))),
    focus: "balanced",
    startingCompound: sprint ? "soft" : "medium",
    fuelLoad: 1,
  };
}

function createRoundState(careerSeed: string, roundIndex: number, playerTeams: string[], teams: TeamState[], drivers: CareerDriver[]): CareerRoundState {
  const circuit = CIRCUITS_2026[roundIndex];
  const setups: Record<string, CarSetup> = {};
  const raceStrategyPlans: Record<string, RaceStrategyPlan> = {};
  const tyreInventory: Record<string, Record<Compound, number>> = {};
  const startRain = createWeather(circuit, `${careerSeed}:r${roundIndex + 1}`)[0]?.rain ?? 0;
  for (const d of drivers) {
    const team = teams.find((t) => t.teamId === d.teamId);
    const setup = driverSetup(circuit, !!team?.ai, hashSeed(d.driverId) % 10, circuit.sprint);
    setups[d.driverId] = setup;
    tyreInventory[d.driverId] = allocateTyreInventory(circuit.sprint);
    raceStrategyPlans[d.driverId] = makeDefaultRacePlan({
      driverId: d.driverId,
      totalLaps: circuit.voltas,
      circuit,
      startRain,
      mandatoryStop: true,
      startingCompound: setup.startingCompound,
      source: playerTeams.includes(d.teamId) ? "player" : "ai",
      strategyRating: team?.staff.estrategista.rating ?? 75,
    });
  }
  return {
    round: roundIndex + 1,
    practice: null,
    setups,
    strategyPlans: {},
    raceStrategyPlans,
    tyreInventory,
    sprintQualifying: null,
    qualifying: null,
    qualifyingSession: null,
    sprintResult: null,
    raceResult: null,
  };
}

export function createCareer(options: CreateCareerOptions): Career {
  const playerTeams = [...new Set(options.playerTeams)];
  if (playerTeams.length === 0) throw new Error("Selecione ao menos uma equipe.");
  if (playerTeams.length > 3) throw new Error("Máximo de 3 equipes humanas.");
  for (const id of playerTeams) if (!TEAM_BY_ID[id]) throw new Error(`Equipe inválida: ${id}`);
  const seed = options.seed ?? `career-${Date.now().toString(36)}`;
  const teams = createTeamStates(playerTeams);
  const drivers = createDrivers();
  const standingsDrivers: Record<string, Standing> = {};
  const standingsConstructors: Record<string, Standing> = {};
  for (const d of drivers) standingsDrivers[d.driverId] = initialStanding();
  for (const t of teams) standingsConstructors[t.teamId] = initialStanding();
  const rounds = CIRCUITS_2026.map((_, i) => createRoundState(seed, i, playerTeams, teams, drivers));

  // projetos de pré-temporada das equipes de IA
  for (const team of teams) {
    if (!team.ai) continue;
    const areas: (keyof CarAttributes)[] = ["aerodinamica", "curvas", "retas", "energia"];
    const weakest = areas.sort((a, b) => team.car[a] - team.car[b])[0];
    team.project = {
      id: `dev_${team.teamId}_0`,
      area: weakest,
      nome: `Pacote de ${labelArea(weakest)}`,
      nivel: 1,
      custo: 0,
      etapasTotal: 1,
      etapasRestantes: 1,
      ganho: 1.5,
    };
  }

  const career: Career = {
    id: options.id ?? `career_${seed}`,
    nome: options.nome,
    seed,
    modo: options.modo,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    playerTeams,
    roundIndex: 0,
    phase: "management",
    seasonComplete: false,
    teams,
    drivers,
    rounds,
    standingsDrivers,
    standingsConstructors,
    results: [],
    news: ["Pré-temporada concluída. Ajuste o carro e prepare a equipe para o GP da Austrália."],
    champions: null,
    raceInProgress: null,
    version: CAREER_VERSION,
  };
  return career;
}

export function labelArea(area: keyof CarAttributes): string {
  const labels: Record<keyof CarAttributes, string> = {
    aerodinamica: "aerodinâmica",
    curvas: "curvas",
    retas: "retas",
    energia: "energia",
    confiabilidade: "confiabilidade",
    gestaoPneus: "gestão de pneus",
  };
  return labels[area];
}

export function circuitOfRound(career: Career): CircuitData {
  return CIRCUITS_2026[career.roundIndex];
}

export function currentRound(career: Career): CareerRoundState {
  return career.rounds[career.roundIndex];
}

export function playerTeamIds(career: Career): string[] {
  return career.playerTeams;
}

export function teamState(career: Career, teamId: string): TeamState | undefined {
  return career.teams.find((t) => t.teamId === teamId);
}

export function getDriversOfTeam(career: Career, teamId: string): CareerDriver[] {
  return career.drivers.filter((d) => d.teamId === teamId);
}

function practiceForecast(career: Career): string {
  const circuit = circuitOfRound(career);
  const weather = createWeather(circuit, `${career.seed}:r${career.roundIndex + 1}`);
  return weather.map((w) => `Volta ${w.fromLap}: ${describeWeather(w.rain)}`).join(" · ");
}

function initialPracticeMargin(confidence: number): number {
  return Math.max(0.035, Math.min(0.24, 0.24 - confidence * 0.0019));
}

function createPracticeDriverState(
  career: Career,
  team: TeamState,
  driver: CareerDriver,
  seedIndex: number,
): PracticeDriverState {
  const circuit = circuitOfRound(career);
  const rng = createRng(`${career.seed}:practice:${career.roundIndex}:${team.teamId}:${driver.driverId}:init`);
  const confidence = 35;
  return {
    driverId: driver.driverId,
    teamId: team.teamId,
    runs: 0,
    confidence,
    programs: [],
    downforceEstimate: Math.max(0.08, Math.min(0.95, circuit.downforceIdeal + rng.range(-0.09, 0.09) + seedIndex * 0.002)),
    downforceMargin: initialPracticeMargin(confidence),
    bestQualifyingLap: null,
    degradationPerLap: null,
    degradationFactor: 1,
    fuelPerLap: null,
    pitLoss: null,
    compoundTimes: null,
    tyreInfo: "Sem dados de pneus. Rode o programa de compostos.",
  };
}

function normalizePracticeTeams(career: Career, state: PracticeState): void {
  const circuit = circuitOfRound(career);
  const legacy = {
    runs: Math.max(0, Math.min(3, state.runs ?? 0)),
    confidence: Math.max(35, Math.min(100, state.confidence ?? 35)),
    programs: Array.isArray(state.programs) ? state.programs : [],
    idealDownforce: state.idealDownforce ?? circuit.downforceIdeal,
  };
  state.weatherForecast = state.weatherForecast || practiceForecast(career);
  state.idealDownforce = legacy.idealDownforce;
  state.teams = state.teams ?? {};
  for (const teamId of career.playerTeams) {
    const team = career.teams.find((entry) => entry.teamId === teamId);
    if (!team) continue;
    const teamState = state.teams[teamId] ?? { teamId, drivers: {} };
    teamState.drivers = teamState.drivers ?? {};
    const teamDrivers = getDriversOfTeam(career, teamId);
    teamDrivers.forEach((driver, index) => {
      const existing = teamState.drivers[driver.driverId];
      if (!existing) {
        const created = createPracticeDriverState(career, team, driver, index);
        // Saves antigos tinham confiança/programas globais. A migração mantém
        // os dados no primeiro piloto e dá aos demais a confiança-base.
        if (index === 0 && legacy.runs > 0) {
          created.runs = legacy.runs;
          created.confidence = legacy.confidence;
          created.programs = [...legacy.programs];
          created.downforceEstimate = legacy.idealDownforce;
          created.downforceMargin = initialPracticeMargin(created.confidence);
          const lastTyres = [...legacy.programs].reverse().find((program) => program.type === "tyres");
          created.tyreInfo = lastTyres?.summary ?? created.tyreInfo;
        }
        teamState.drivers[driver.driverId] = created;
      } else {
        existing.runs = Math.max(0, Math.min(3, existing.runs ?? 0));
        existing.confidence = Math.max(35, Math.min(100, existing.confidence ?? 35));
        existing.programs = Array.isArray(existing.programs) ? existing.programs : [];
        existing.downforceEstimate = Math.max(0.05, Math.min(0.98, existing.downforceEstimate ?? circuit.downforceIdeal));
        existing.downforceMargin = Math.max(0.035, Math.min(0.32, existing.downforceMargin ?? initialPracticeMargin(existing.confidence)));
        existing.degradationFactor = Math.max(0.75, Math.min(1.25, existing.degradationFactor ?? 1));
        existing.tyreInfo = existing.tyreInfo || "Sem dados de pneus. Rode o programa de compostos.";
      }
    });
    state.teams[teamId] = teamState;
  }
  const primary = career.playerTeams.map((teamId) => state.teams?.[teamId]).find((team) => team);
  const primaryDriver = primary ? Object.values(primary.drivers)[0] : undefined;
  if (primaryDriver) {
    state.runs = primaryDriver.runs;
    state.confidence = primaryDriver.confidence;
    state.programs = primaryDriver.programs;
    state.tyreInfo = primaryDriver.tyreInfo;
  }
}

export function practiceFor(career: Career): PracticeState {
  const round = currentRound(career);
  if (!round.practice) {
    const circuit = circuitOfRound(career);
    const weather = createWeather(circuit, `${career.seed}:r${career.roundIndex + 1}`);
    round.practice = {
      runs: 0,
      confidence: 35,
      programs: [],
      idealDownforce: circuit.downforceIdeal,
      tyreInfo: "Sem dados de pneus. Rode o programa de compostos.",
      weatherForecast: weather.map((w) => `Volta ${w.fromLap}: ${describeWeather(w.rain)}`).join(" · "),
      teams: {},
    };
  }
  normalizePracticeTeams(career, round.practice);
  return round.practice;
}

export function practiceDriverFor(career: Career, teamId: string, driverId?: string): PracticeDriverState | null {
  const state = practiceFor(career);
  const team = state.teams?.[teamId];
  if (!team) return null;
  const resolvedDriverId = driverId ?? getDriversOfTeam(career, teamId)[0]?.driverId;
  return resolvedDriverId ? team.drivers[resolvedDriverId] ?? null : null;
}

export function enterPrep(career: Career): void {
  if (career.phase !== "management") return;
  career.phase = "prep";
  career.updatedAt = new Date().toISOString();
}

export function enterPractice(career: Career): void {
  if (career.phase !== "prep") return;
  career.phase = "practice";
  practiceFor(career);
  career.updatedAt = new Date().toISOString();
}

export function setSetup(career: Career, driverId: string, patch: Partial<CarSetup>): { ok: boolean; error?: string } {
  const driver = career.drivers.find((d) => d.driverId === driverId);
  if (!driver) return { ok: false, error: "Piloto não encontrado." };
  if (!career.playerTeams.includes(driver.teamId)) return { ok: false, error: "Piloto não pertence à sua equipe." };
  if (career.phase !== "prep" && career.phase !== "practice") {
    return { ok: false, error: "O acerto só pode ser alterado na preparação ou no treino livre." };
  }
  const round = currentRound(career);
  const current = round.setups[driverId] ?? defaultSetup();
  round.setups[driverId] = {
    ...current,
    ...patch,
    downforce: Math.max(0, Math.min(1, patch.downforce ?? current.downforce)),
    fuelLoad: Math.max(0.92, Math.min(1, patch.fuelLoad ?? current.fuelLoad)),
  };
  const plan = round.raceStrategyPlans?.[driverId];
  if (plan && patch.startingCompound) {
    plan.stints[0] = { ...plan.stints[0], compound: patch.startingCompound };
  }
  career.updatedAt = new Date().toISOString();
  return { ok: true };
}

export function setStrategyPlan(career: Career, driverId: string, lap: number | null): { ok: boolean; error?: string } {
  const driver = career.drivers.find((d) => d.driverId === driverId);
  if (!driver) return { ok: false, error: "Piloto não encontrado." };
  if (!career.playerTeams.includes(driver.teamId)) return { ok: false, error: "Piloto não pertence à sua equipe." };
  const circuit = circuitOfRound(career);
  if (lap != null && (lap < 1 || lap > circuit.voltas)) return { ok: false, error: `A volta deve estar entre 1 e ${circuit.voltas}.` };
  currentRound(career).strategyPlans[driverId] = lap;
  career.updatedAt = new Date().toISOString();
  return { ok: true };
}

export function setRaceStrategy(career: Career, driverId: string, plan: RaceStrategyPlan): { ok: boolean; error?: string } {
  const driver = career.drivers.find((d) => d.driverId === driverId);
  if (!driver) return { ok: false, error: "Piloto não encontrado." };
  if (!career.playerTeams.includes(driver.teamId)) return { ok: false, error: "Piloto não pertence à sua equipe." };
  if (career.phase === "race" || career.phase === "results" || career.phase === "seasonEnd") return { ok: false, error: "O plano não pode ser alterado nesta fase." };
  const circuit = circuitOfRound(career);
  const round = currentRound(career);
  const startRain = createWeather(circuit, `${career.seed}:r${career.roundIndex + 1}`)[0]?.rain ?? 0;
  const dry = startRain < 0.15;
  const normalized = normalizeRacePlan({ ...plan, driverId, source: "player", version: Math.max(1, Math.round(plan.version || 1)) }, circuit.voltas);
  const inventory = round.tyreInventory?.[driverId];
  const validation = validateRacePlan(normalized, circuit.voltas, true, dry, inventory);
  if (!validation.ok) return validation;
  round.raceStrategyPlans = round.raceStrategyPlans ?? {};
  round.raceStrategyPlans[driverId] = normalized;
  round.strategyPlans[driverId] = null;
  career.updatedAt = new Date().toISOString();
  return { ok: true };
}

export function runPractice(
  career: Career,
  type: PracticeProgramResult["type"],
  teamId?: string,
  driverId?: string,
): { ok: boolean; error?: string; result?: PracticeProgramResult } {
  if (career.phase !== "practice") return { ok: false, error: "Não está no treino livre." };
  const state = practiceFor(career);
  const circuit = circuitOfRound(career);
  const effectiveTeamId = teamId ?? career.playerTeams[0];
  if (!career.playerTeams.includes(effectiveTeamId)) return { ok: false, error: "Sem permissão sobre esta equipe." };
  const team = career.teams.find((t) => t.teamId === effectiveTeamId);
  if (!team) return { ok: false, error: "Equipe inválida." };
  const drivers = getDriversOfTeam(career, team.teamId);
  const driver = driverId ? drivers.find((entry) => entry.driverId === driverId) : drivers[0];
  if (!driver) return { ok: false, error: "Piloto inválido para esta equipe." };
  const driverState = practiceDriverFor(career, team.teamId, driver.driverId);
  if (!driverState) return { ok: false, error: "Estado de treino indisponível." };
  if (driverState.runs >= 3) return { ok: false, error: `Os três programas de ${driver.driverId.replace(/^driver_/, "").replace(/_/g, " ")} já foram concluídos.` };

  const rng = createRng(`${career.seed}:practice:${career.roundIndex}:${team.teamId}:${driver.driverId}:${type}:${driverState.runs}`);
  const weather = createWeather(circuit, `${career.seed}:r${career.roundIndex + 1}`);
  const startRain = weather[0]?.rain ?? 0;
  const trackTemp = weather[0]?.trackTemp ?? 35;
  const setup = currentRound(career).setups[driver.driverId] ?? defaultSetup();
  const confidenceGain = type === "qualifying" ? 20 : type === "race" ? 18 : 16;
  const staffBonus = Math.round((team.staff.engenheiro_chefe.rating - 70) / 10);
  let result: PracticeProgramResult;

  if (type === "qualifying") {
    const estimate = estimateLapTime({
      circuit,
      car: team.car,
      driver: driver.attributes,
      setup,
      tyre: initialTyre("soft"),
      rain: startRain,
      fuelKg: 5,
      fuelStartKg: 5,
      pace: "attack",
      tyreMode: "push",
    });
    const bestLap = estimate + rng.range(-0.12, 0.12);
    driverState.bestQualifyingLap = driverState.bestQualifyingLap == null
      ? bestLap
      : Math.min(driverState.bestQualifyingLap, bestLap);
    const nextMargin = Math.max(0.035, driverState.downforceMargin * 0.52);
    const nextEstimate = circuit.downforceIdeal + rng.range(-nextMargin * 0.28, nextMargin * 0.28);
    driverState.downforceEstimate = driverState.runs === 0
      ? nextEstimate
      : driverState.downforceEstimate * 0.35 + nextEstimate * 0.65;
    driverState.downforceMargin = nextMargin;
    const low = Math.max(0, driverState.downforceEstimate - driverState.downforceMargin);
    const high = Math.min(1, driverState.downforceEstimate + driverState.downforceMargin);
    const inside = setup.downforce >= low && setup.downforce <= high;
    result = {
      type,
      label: "Simulação de classificação",
      summary: `Melhor volta simulada com macios: ${bestLap.toFixed(3)}s. Faixa provável de downforce: ${Math.round(low * 100)}%–${Math.round(high * 100)}%.`,
      confidenceGain,
      data: [
        `Faixa provável de downforce: ${Math.round(low * 100)}%–${Math.round(high * 100)}%`,
        `Precisão da faixa: ±${Math.round(driverState.downforceMargin * 100)} pontos percentuais`,
        inside ? "O acerto atual está dentro da faixa medida." : "O acerto atual está fora da faixa medida; ajuste antes da classificação.",
        `Medição feita com downforce ${Math.round(setup.downforce * 100)}% e foco ${setup.focus}.`,
      ],
      driverId: driver.driverId,
      setup: { ...setup },
    };
  } else if (type === "race") {
    const tyre = initialTyre("medium");
    const baseWear = wearPerLap(tyre, "medium", "normal", "normal", driver.attributes, circuit.abrasividade, startRain, trackTemp) *
      (1.08 - team.car.gestaoPneus * 0.0016);
    const setupWear = 1 +
      Math.abs(setup.downforce - circuit.downforceIdeal) * 0.12 +
      (setup.focus === "qualifying" ? 0.02 : setup.focus === "race" ? -0.01 : 0);
    const measuredWear = Math.max(0.2, baseWear * setupWear * rng.range(0.96, 1.04));
    const factor = Math.max(0.75, Math.min(1.25, measuredWear / Math.max(0.2, baseWear)));
    const consumption = fuelPerLap(circuit) * rng.range(0.98, 1.02);
    const pitLoss = estimatePitLoss(circuit, team.pitCrew ?? 70) + rng.range(-0.3, 0.3);
    driverState.degradationPerLap = measuredWear;
    driverState.degradationFactor = factor;
    driverState.fuelPerLap = consumption;
    driverState.pitLoss = pitLoss;
    const nextMargin = Math.max(0.035, driverState.downforceMargin * 0.78);
    const nextEstimate = circuit.downforceIdeal + rng.range(-nextMargin * 0.28, nextMargin * 0.28);
    driverState.downforceEstimate = driverState.downforceEstimate * 0.45 + nextEstimate * 0.55;
    driverState.downforceMargin = nextMargin;
    result = {
      type,
      label: "Simulação de corrida",
      summary: `Degradação estimada em ${measuredWear.toFixed(2)}% por volta no composto médio. Consumo de ${consumption.toFixed(2)} kg/volta.`,
      confidenceGain,
      data: [
        `Degradação medida: ${measuredWear.toFixed(2)}% por volta (médio)`,
        `Consumo medido: ${consumption.toFixed(2)} kg/volta`,
        `Perda no pit lane: ~${pitLoss.toFixed(1)}s`,
        `Temperatura de pista: ${trackTemp}°C · clima: ${describeWeather(startRain)}`,
        `Fator de desgaste para o planejador: ${factor.toFixed(2)}×`,
      ],
      driverId: driver.driverId,
      setup: { ...setup },
    };
  } else {
    const compounds = ["soft", "medium", "hard"] as const;
    const times = {} as Record<"soft" | "medium" | "hard", number>;
    const data: string[] = [];
    for (const compound of compounds) {
      const tyre = initialTyre(compound);
      const lap = estimateLapTime({
        circuit,
        car: team.car,
        driver: driver.attributes,
        setup,
        tyre,
        rain: startRain,
        fuelKg: 30,
        fuelStartKg: 30,
        pace: "normal",
        tyreMode: "normal",
      });
      const measured = lap + rng.range(-0.08, 0.08);
      times[compound] = measured;
      const wear = wearPerLap(tyre, compound, "normal", "normal", driver.attributes, circuit.abrasividade, startRain, trackTemp) *
        (1.08 - team.car.gestaoPneus * 0.0016);
      data.push(`${compound === "soft" ? "Macio" : compound === "medium" ? "Médio" : "Duro"}: ${measured.toFixed(2)}s · desgaste ~${wear.toFixed(2)}%/volta`);
    }
    driverState.compoundTimes = times;
    const fastest = compounds.reduce((best, compound) => times[compound] < times[best] ? compound : best, "soft" as typeof compounds[number]);
    driverState.tyreInfo = `Composto mais rápido em volta: ${fastest === "soft" ? "macio" : fastest === "medium" ? "médio" : "duro"}.`;
    const nextMargin = Math.max(0.035, driverState.downforceMargin * 0.78);
    const nextEstimate = circuit.downforceIdeal + rng.range(-nextMargin * 0.28, nextMargin * 0.28);
    driverState.downforceEstimate = driverState.downforceEstimate * 0.45 + nextEstimate * 0.55;
    driverState.downforceMargin = nextMargin;
    result = {
      type,
      label: "Comparativo de compostos",
      summary: driverState.tyreInfo,
      confidenceGain,
      data,
      driverId: driver.driverId,
      setup: { ...setup },
    };
  }

  driverState.runs += 1;
  driverState.confidence = Math.min(100, driverState.confidence + result.confidenceGain + staffBonus);
  driverState.programs.push(result);
  state.runs = Math.max(state.runs, driverState.runs);
  state.confidence = driverState.confidence;
  state.programs = driverState.programs;
  state.tyreInfo = driverState.tyreInfo;
  career.updatedAt = new Date().toISOString();
  return { ok: true, result };
}

export function buildQualifyingInput(career: Career, type: "quali" | "sprintQuali"): QualifyingInput {
  const circuit = circuitOfRound(career);
  const weather = createWeather(circuit, `${career.seed}:r${career.roundIndex + 1}`);
  const round = currentRound(career);
  return {
    seed: `${career.seed}:quali`,
    circuit,
    rain: weather[0]?.rain ?? 0,
    type,
    round: career.roundIndex + 1,
    drivers: career.drivers.map(toDriverSpec),
    teams: career.teams.map(toTeamSpec),
    setups: round.setups,
  };
}

export function buildQualifyingSessionInput(career: Career, type: "quali" | "sprintQuali"): QualifyingSessionInput {
  const circuit = circuitOfRound(career);
  const round = currentRound(career);
  practiceFor(career);
  const confidence: Record<string, number> = {};
  for (const driver of career.drivers) {
    const learned = career.playerTeams.includes(driver.teamId)
      ? round.practice?.teams?.[driver.teamId]?.drivers[driver.driverId]?.confidence ?? 35
      : 82;
    confidence[driver.driverId] = learned;
  }
  return {
    id: `${career.id}:${career.roundIndex + 1}:${type}:live`,
    seed: `${career.seed}:live-quali:${career.roundIndex + 1}:${type}`,
    circuit,
    type,
    round: career.roundIndex + 1,
    drivers: career.drivers.map(toDriverSpec),
    teams: career.teams.map(toTeamSpec),
    setups: round.setups,
    playerTeams: [...career.playerTeams],
    confidence,
    tyreInventory: round.tyreInventory,
  };
}

export function startQualifyingSession(career: Career, type: "quali" | "sprintQuali"): QualifyingSessionState {
  const round = currentRound(career);
  if (round.qualifyingSession) return round.qualifyingSession;
  const session = createQualifyingSession(buildQualifyingSessionInput(career, type));
  round.qualifyingSession = session;
  round.qualifying = type === "quali" ? null : round.qualifying;
  round.sprintQualifying = type === "sprintQuali" ? null : round.sprintQualifying;
  career.phase = type === "sprintQuali" ? "sprintQuali" : "qualifying";
  career.updatedAt = new Date().toISOString();
  return session;
}

function toDriverSpec(d: CareerDriver): DriverRaceSpec {
  const data = DRIVER_BY_ID[d.driverId];
  return {
    driverId: d.driverId,
    teamId: d.teamId,
    nome: data?.nome ?? d.driverId,
    codigo: data?.codigo ?? "---",
    numero: data?.numero ?? 0,
    atributos: d.attributes,
    moral: d.moral,
  };
}

function toTeamSpec(t: TeamState): TeamRaceSpec {
  const penalty =
    Math.max(0, t.components.pu - 65) * 0.12 +
    Math.max(0, t.components.cambio - 65) * 0.08 +
    Math.max(0, t.components.freios - 65) * 0.05 +
    Math.max(0, t.components.bateria - 65) * 0.05;
  return {
    teamId: t.teamId,
    car: { ...t.car, confiabilidade: Math.max(35, t.car.confiabilidade - penalty) },
    pitCrew: t.pitCrew ?? derivedPitCrew(t),
    strategist: t.staff.estrategista.rating,
  };
}

export function finishPracticeAndQualify(career: Career): { ok: boolean; error?: string; result?: QualifyingResult } {
  if (career.phase !== "practice") return { ok: false, error: "Sessão inválida." };
  const circuit = circuitOfRound(career);
  startQualifyingSession(career, circuit.sprint ? "sprintQuali" : "quali");
  return { ok: true };
}

export function enterRace(career: Career, kind: "race" | "sprint"): { ok: boolean; error?: string } {
  if (kind === "sprint" && career.phase !== "sprintQuali") return { ok: false, error: "Fase inválida." };
  if (kind === "race" && career.phase !== "qualifying") return { ok: false, error: "Fase inválida." };
  const round = currentRound(career);
  const result = kind === "sprint" ? round.sprintQualifying : round.qualifying;
  if (!result || round.qualifyingSession) return { ok: false, error: "Conclua a classificação antes de iniciar a sessão." };
  career.phase = kind === "sprint" ? "sprint" : "race";
  career.updatedAt = new Date().toISOString();
  return { ok: true };
}

export function buildRaceConfig(career: Career, kind: "race" | "sprint"): RaceConfig {
  const circuit = circuitOfRound(career);
  const round = currentRound(career);
  const grid = kind === "sprint" ? round.sprintQualifying?.grid ?? round.qualifying?.grid : round.qualifying?.grid;
  const fallback = [...career.drivers]
    .sort((a, b) => standingsPosition(career, a.driverId) - standingsPosition(career, b.driverId))
    .map((d) => d.driverId);
  const finalGrid = (grid && grid.length === career.drivers.length ? grid : fallback).filter((id) => career.drivers.some((d) => d.driverId === id));
  for (const d of career.drivers) if (!finalGrid.includes(d.driverId)) finalGrid.push(d.driverId);
  const weather = createWeather(circuit, `${career.seed}:r${career.roundIndex + 1}`);
  const totalLaps = kind === "sprint" ? circuit.voltasSprint : circuit.voltas;
  const startRain = weather[0]?.rain ?? 0;
  const plans: Record<string, RaceStrategyPlan> = {};
  for (const driver of career.drivers) {
    const team = career.teams.find((entry) => entry.teamId === driver.teamId);
    const setup = round.setups[driver.driverId] ?? defaultSetup();
    const stored = kind === "race" ? round.raceStrategyPlans?.[driver.driverId] : null;
    const base = stored && stored.stints.reduce((sum, stint) => sum + stint.laps, 0) === totalLaps
      ? stored
      : makeDefaultRacePlan({
          driverId: driver.driverId,
          totalLaps,
          circuit,
          startRain,
          mandatoryStop: kind === "race",
          startingCompound: setup.startingCompound,
          source: career.playerTeams.includes(driver.teamId) ? "player" : "ai",
          strategyRating: team?.staff.estrategista.rating ?? 75,
        });
    plans[driver.driverId] = normalizeRacePlan(base, totalLaps);
  }
  const inventory = round.tyreInventory ?? {};
  return {
    seed: `${career.seed}:r${career.roundIndex + 1}:${kind}`,
    circuit,
    totalLaps,
    isSprint: kind === "sprint",
    grid: finalGrid,
    teams: career.teams.map(toTeamSpec),
    drivers: career.drivers.map(toDriverSpec),
    setups: round.setups,
    weather,
    mandatoryStop: kind === "race",
    playerTeams: career.playerTeams,
    strategyPlans: kind === "race" ? round.strategyPlans : {},
    strategyPlansV2: plans,
    tyreInventory: inventory,
    initialTrackStatus: startRain > 0.55 ? "sc" : "green",
  };
}

function standingsPosition(career: Career, driverId: string): number {
  const entries = Object.entries(career.standingsDrivers).sort((a, b) => compareStanding(a[1], b[1]));
  return entries.findIndex(([id]) => id === driverId);
}

function compareStanding(a: Standing, b: Standing): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.podiums !== a.podiums) return b.podiums - a.podiums;
  return a.bestFinish - b.bestFinish;
}

export function classifyGrid(career: Career, type: "quali" | "sprintQuali"): QualifyingResult | null {
  const round = currentRound(career);
  return type === "quali" ? round.qualifying : round.sprintQualifying;
}

export function completeQualifyingSession(career: Career, session: QualifyingSessionState): QualifyingResult {
  const result = qualifyingResultFromSession(session);
  const round = currentRound(career);
  if (session.type === "sprintQuali") round.sprintQualifying = result;
  else round.qualifying = result;
  round.tyreInventory = round.tyreInventory ?? {};
  for (const car of session.cars) round.tyreInventory[car.driverId] = cloneInventory(car.setsRemaining);
  round.qualifyingSession = null;
  career.phase = session.type === "sprintQuali" ? "sprintQuali" : "qualifying";
  career.updatedAt = new Date().toISOString();
  career.news.unshift(`${session.type === "sprintQuali" ? "Classificação Sprint" : "Classificação"} concluída. Grid definido.`);
  return result;
}

export function migrateCareer(career: Career): Career {
  if (!career.version || career.version < CAREER_VERSION) career.version = CAREER_VERSION;
  for (const team of career.teams ?? []) {
    if (team.pitCrew == null) team.pitCrew = derivedPitCrew(team);
  }
  for (const round of career.rounds ?? []) {
    if (round.qualifyingSession === undefined) round.qualifyingSession = null;
    if (round.practice && round.round === career.roundIndex + 1) normalizePracticeTeams(career, round.practice);
    const circuit = CIRCUITS_2026[(round.round ?? 1) - 1] ?? CIRCUITS_2026[0];
    const startRain = createWeather(circuit, `${career.seed}:r${round.round}`)[0]?.rain ?? 0;
    round.tyreInventory = round.tyreInventory ?? {};
    round.raceStrategyPlans = round.raceStrategyPlans ?? {};
    for (const driver of career.drivers ?? []) {
      if (!round.tyreInventory[driver.driverId]) round.tyreInventory[driver.driverId] = allocateTyreInventory(circuit.sprint);
      if (!round.raceStrategyPlans[driver.driverId]) {
        const team = career.teams.find((entry) => entry.teamId === driver.teamId);
        const setup = round.setups?.[driver.driverId] ?? defaultSetup();
        round.raceStrategyPlans[driver.driverId] = makeDefaultRacePlan({
          driverId: driver.driverId,
          totalLaps: circuit.voltas,
          circuit,
          startRain,
          mandatoryStop: true,
          startingCompound: setup.startingCompound,
          source: career.playerTeams.includes(driver.teamId) ? "player" : "ai",
          strategyRating: team?.staff.estrategista.rating ?? 75,
        });
      }
    }
  }
  return career;
}

function recalcPoints(result: SessionResult, kind: "race" | "sprint"): void {
  const table = kind === "sprint" ? [8, 7, 6, 5, 4, 3, 2, 1] : [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  result.entries.forEach((entry, i) => {
    entry.points = entry.status === "retired" ? 0 : table[i] ?? 0;
  });
}

export function applySessionResult(career: Career, result: SessionResult, kind: "race" | "sprint"): void {
  if (career.results.some((r) => r.round === result.round && r.kind === kind)) return;
  recalcPoints(result, kind);
  career.results.push(result);
  const round = currentRound(career);
  if (kind === "race") round.raceResult = result;
  else round.sprintResult = result;
  if (kind === "race") processRaceFinance(career, result);
  recomputeStandings(career);

  if (kind === "sprint") {
    round.qualifying = null;
    round.qualifyingSession = null;
    startQualifyingSession(career, "quali");
    career.news.unshift(`Sprint concluído. Classificação interativa para o GP liberada.`);
  } else {
    round.qualifyingSession = null;
    career.phase = "results";
  }
  career.updatedAt = new Date().toISOString();
}

export function recomputeStandings(career: Career): void {
  for (const d of career.drivers) career.standingsDrivers[d.driverId] = initialStanding();
  for (const t of career.teams) career.standingsConstructors[t.teamId] = initialStanding();
  const teamRaceCount = new Map<string, number>();
  for (const result of career.results) {
    const isSprint = result.kind === "sprint";
    const teamsThisRace = new Set<string>();
    for (const entry of result.entries) {
      const ds = career.standingsDrivers[entry.driverId];
      const ts = career.standingsConstructors[entry.teamId];
      if (!ds || !ts) continue;
      ds.points += entry.points;
      ts.points += entry.points;
      ds.races += 1;
      if (!isSprint) {
        teamsThisRace.add(entry.teamId);
        if (entry.position === 1) {
          ds.wins += 1;
          ts.wins += 1;
        }
        if (entry.position <= 3) ds.podiums += 1;
        ds.bestFinish = Math.min(ds.bestFinish, entry.position);
        ts.bestFinish = Math.min(ts.bestFinish, entry.position);
      } else if (entry.position === 1) {
        ds.sprintWins += 1;
      }
    }
    for (const teamId of teamsThisRace) teamRaceCount.set(teamId, (teamRaceCount.get(teamId) ?? 0) + 1);
  }
  for (const [teamId, count] of teamRaceCount) {
    const ts = career.standingsConstructors[teamId];
    if (ts) ts.races = count;
  }
}

export function driverStandings(career: Career): { driverId: string; standing: Standing; position: number }[] {
  return Object.entries(career.standingsDrivers)
    .sort((a, b) => compareStanding(a[1], b[1]))
    .map(([driverId, standing], i) => ({ driverId, standing, position: i + 1 }));
}

export function constructorStandings(career: Career): { teamId: string; standing: Standing; position: number }[] {
  return Object.entries(career.standingsConstructors)
    .sort((a, b) => compareStanding(a[1], b[1]))
    .map(([teamId, standing], i) => ({ teamId, standing, position: i + 1 }));
}

function processRaceFinance(career: Career, result: SessionResult): void {
  const roundNumber = career.roundIndex + 1;
  const bestByTeam = new Map<string, number>();
  for (const entry of result.entries) {
    const best = bestByTeam.get(entry.teamId) ?? 99;
    bestByTeam.set(entry.teamId, Math.min(best, entry.position));
  }

  for (const team of career.teams) {
    const ledger: LedgerEntry[] = [];
    const pos = bestByTeam.get(team.teamId) ?? 11;
    const prize = PRIZE_BY_POSITION[Math.max(0, Math.min(PRIZE_BY_POSITION.length - 1, pos - 1))] ?? 1;
    team.budget += prize;
    ledger.push({ round: roundNumber, descricao: `Premiação (P${pos})`, valor: prize, categoria: "premio" });

    const sponsor = SPONSOR_OFFERS.find((s) => s.id === team.sponsorId);
    if (sponsor) {
      team.budget += sponsor.porEtapa;
      ledger.push({ round: roundNumber, descricao: `Patrocinador ${sponsor.nome}`, valor: sponsor.porEtapa, categoria: "patrocinio" });
      if (pos <= sponsor.metaPosicao) {
        team.budget += sponsor.bonusObjetivo;
        team.sponsorBonusPaid += sponsor.bonusObjetivo;
        ledger.push({ round: roundNumber, descricao: `Bônus ${sponsor.nome} (P${pos})`, valor: sponsor.bonusObjetivo, categoria: "patrocinio" });
      }
    }

    const drivers = getDriversOfTeam(career, team.teamId);
    const driverSalaries = drivers.reduce((sum, d) => sum + d.salario, 0);
    const staffSalaries = Object.values(team.staff).reduce((sum, s) => sum + s.salario, 0);
    team.budget -= RACE_TRAVEL_COST + driverSalaries + staffSalaries;
    ledger.push({ round: roundNumber, descricao: "Pilotos e equipe técnica", valor: -(driverSalaries + staffSalaries), categoria: "salario" });
    ledger.push({ round: roundNumber, descricao: "Logística da etapa", valor: -RACE_TRAVEL_COST, categoria: "outro" });

    // contratos
    for (const d of drivers) {
      d.contratoEtapas -= 1;
      if (team.ai && d.contratoEtapas <= 0) {
        d.contratoEtapas = 3;
        d.moral = Math.min(100, d.moral + 4);
      } else if (!team.ai && d.contratoEtapas <= 0) {
        const old = d.salario;
        d.salario = Math.round(d.salario * 1.45 * 10) / 10;
        d.contratoEtapas = 3;
        d.moral = Math.max(30, d.moral - 10);
        team.ledger.push({ round: roundNumber, descricao: `Renovação automática (salário ${old.toFixed(2)} → ${d.salario.toFixed(2)} mi)`, valor: 0, categoria: "contrato" });
        career.news.unshift(`Contrato de ${DRIVER_BY_ID[d.driverId]?.nome ?? "piloto"} venceu. Renovação automática elevou o salário para ${d.salario.toFixed(2)} mi/etapa.`);
      }
    }

    // componentes
    team.components.pu = Math.min(100, team.components.pu + 13);
    team.components.cambio = Math.min(100, team.components.cambio + 9);
    team.components.freios = Math.min(100, team.components.freios + 11);
    team.components.bateria = Math.min(100, team.components.bateria + 8);

    // projetos de desenvolvimento
    if (team.project) {
      team.project.etapasRestantes -= 1;
      if (team.project.etapasRestantes <= 0) {
        const gain = team.project.ganho;
        team.car[team.project.area] = Math.min(99, team.car[team.project.area] + gain);
        if (career.playerTeams.includes(team.teamId)) {
          career.news.unshift(`Desenvolvimento concluído: +${gain.toFixed(1)} em ${labelArea(team.project.area)}.`);
        }
        team.project = null;
      }
    }
    team.budget = Math.round(team.budget * 100) / 100;
    team.ledger.push(...ledger);
  }

  // IA administra o próximo ciclo
  for (const team of career.teams) {
    if (!team.ai) continue;
    if (team.budget < 12 && team.sponsorId) {
      team.budget += 1.0;
    }
    if (!team.project && career.roundIndex < CIRCUITS_2026.length - 1 && team.budget > 20) {
      const areas: (keyof CarAttributes)[] = ["aerodinamica", "curvas", "retas", "energia", "gestaoPneus", "confiabilidade"];
      areas.sort((a, b) => team.car[a] - team.car[b]);
      const area = areas[0];
      const cost = 5.0;
      team.budget -= cost;
      team.project = {
        id: `dev_ai_${team.teamId}_${roundNumber}`,
        area,
        nome: `Pacote de ${labelArea(area)}`,
        nivel: 1,
        custo: cost,
        etapasTotal: 1,
        etapasRestantes: 1,
        ganho: 1.4,
      };
    }
    // substitui componentes desgastados
    if (team.components.pu > 82 && team.budget > 12) {
      team.budget -= 4.0;
      team.components.pu = 0;
    }
  }

  for (const team of career.teams) {
    if (!team.ai) continue;
    for (const d of getDriversOfTeam(career, team.teamId)) {
      if (d.contratoEtapas <= 1) d.contratoEtapas = 3;
    }
  }
}

export function renewDriver(career: Career, driverId: string): { ok: boolean; error?: string } {
  const driver = career.drivers.find((d) => d.driverId === driverId);
  if (!driver) return { ok: false, error: "Piloto não encontrado." };
  const team = teamState(career, driver.teamId);
  if (!team) return { ok: false, error: "Equipe não encontrada." };
  if (!career.playerTeams.includes(team.teamId)) return { ok: false, error: "Sem permissão sobre esta equipe." };
  const cost = Math.round(driver.salario * CONTRACT_RENEW_COST_FACTOR * 10) / 10;
  if (team.budget < cost) return { ok: false, error: `Orçamento insuficiente (${cost.toFixed(1)} mi).` };
  team.budget -= cost;
  driver.contratoEtapas += 3;
  driver.moral = Math.min(100, driver.moral + 12);
  team.ledger.push({ round: career.roundIndex + 1, descricao: `Renovação de contrato`, valor: -cost, categoria: "contrato" });
  career.news.unshift(`Contrato renovado com ${DRIVER_BY_ID[driver.driverId]?.nome ?? "piloto"} por ${cost.toFixed(1)} mi.`);
  career.updatedAt = new Date().toISOString();
  return { ok: true };
}

export function hireStaff(career: Career, teamId: string, candidate: StaffCandidate): { ok: boolean; error?: string } {
  const team = teamState(career, teamId);
  if (!team) return { ok: false, error: "Equipe não encontrada." };
  if (!career.playerTeams.includes(teamId)) return { ok: false, error: "Sem permissão sobre esta equipe." };
  if (team.budget < candidate.contratacao) return { ok: false, error: "Orçamento insuficiente para a contratação." };
  team.budget -= candidate.contratacao;
  team.staff[candidate.funcao] = { ...candidate };
  team.ledger.push({ round: career.roundIndex + 1, descricao: `Contratação: ${candidate.nome}`, valor: -candidate.contratacao, categoria: "funcionarios" });
  career.news.unshift(`${candidate.nome} contratado como ${candidate.funcao.replace("_", " ")} por ${candidate.contratacao.toFixed(1)} mi.`);
  career.updatedAt = new Date().toISOString();
  return { ok: true };
}

export function signSponsor(career: Career, teamId: string, sponsorId: string): { ok: boolean; error?: string } {
  const team = teamState(career, teamId);
  if (!team) return { ok: false, error: "Equipe não encontrada." };
  if (!career.playerTeams.includes(teamId)) return { ok: false, error: "Sem permissão sobre esta equipe." };
  const offer = SPONSOR_OFFERS.find((s) => s.id === sponsorId);
  if (!offer) return { ok: false, error: "Patrocinador inválido." };
  if (team.reputation < offer.reputacaoMinima) return { ok: false, error: "Reputação insuficiente para este patrocinador." };
  if (team.budget < offer.assinatura) return { ok: false, error: "Orçamento insuficiente para a assinatura." };
  team.budget -= offer.assinatura;
  team.sponsorId = sponsorId;
  team.ledger.push({ round: career.roundIndex + 1, descricao: `Assinatura ${offer.nome}`, valor: -offer.assinatura, categoria: "patrocinio" });
  career.news.unshift(`Novo patrocinador: ${offer.nome} (${offer.porEtapa.toFixed(1)} mi por corrida).`);
  career.updatedAt = new Date().toISOString();
  return { ok: true };
}

export function startDevelopment(
  career: Career,
  teamId: string,
  area: keyof CarAttributes,
  mode: "standard" | "fast",
): { ok: boolean; error?: string } {
  const team = teamState(career, teamId);
  if (!team) return { ok: false, error: "Equipe não encontrada." };
  if (!career.playerTeams.includes(teamId)) return { ok: false, error: "Sem permissão sobre esta equipe." };
  if (team.project) return { ok: false, error: "Já existe um projeto de desenvolvimento em andamento." };
  const cost = mode === "fast" ? 9.2 : 5.2;
  if (team.budget < cost) return { ok: false, error: "Orçamento insuficiente para o desenvolvimento." };
  if (career.seasonComplete) return { ok: false, error: "Temporada encerrada." };
  team.budget -= cost;
  const staffBonus =
    1 +
    (team.staff.engenheiro_chefe.rating - 70) * 0.008 +
    (area === "aerodinamica" ? (team.staff.aerodinamicista.rating - 70) * 0.006 : 0);
  const gain = Math.max(0.6, Math.round((mode === "fast" ? 1.15 : 1.85) * staffBonus * 10) / 10);
  team.ledger.push({ round: career.roundIndex + 1, descricao: `Desenvolvimento: ${labelArea(area)}`, valor: -cost, categoria: "desenvolvimento" });
  if (mode === "fast") {
    team.car[area] = Math.min(99, team.car[area] + gain);
    career.news.unshift(`Atualização imediata instalada: +${gain.toFixed(1)} em ${labelArea(area)} (${cost.toFixed(1)} mi).`);
  } else {
    team.project = {
      id: `dev_${teamId}_${Date.now()}`,
      area,
      nome: `Pacote de ${labelArea(area)}`,
      nivel: 1,
      custo: cost,
      etapasTotal: 1,
      etapasRestantes: 1,
      ganho: gain,
    };
    career.news.unshift(`Projeto iniciado: +${gain.toFixed(1)} em ${labelArea(area)} (conclusão após a próxima etapa).`);
  }
  career.updatedAt = new Date().toISOString();
  return { ok: true };
}

export function replaceComponent(career: Career, teamId: string, part: keyof TeamState["components"]): { ok: boolean; error?: string } {
  const team = teamState(career, teamId);
  if (!team) return { ok: false, error: "Equipe não encontrada." };
  if (!career.playerTeams.includes(teamId)) return { ok: false, error: "Sem permissão sobre esta equipe." };
  const costs = { pu: 4.5, cambio: 2.8, freios: 1.6, bateria: 3.2 };
  const cost = costs[part];
  if (team.budget < cost) return { ok: false, error: "Orçamento insuficiente para a troca." };
  team.budget -= cost;
  team.components[part] = 0;
  team.ledger.push({ round: career.roundIndex + 1, descricao: `Troca de ${part.toUpperCase()}`, valor: -cost, categoria: "componentes" });
  career.news.unshift(`Componente substituído: ${part.toUpperCase()} (${cost.toFixed(1)} mi).`);
  career.updatedAt = new Date().toISOString();
  return { ok: true };
}

export function continueAfterResults(career: Career): void {
  if (career.phase !== "results") return;
  if (career.roundIndex >= CIRCUITS_2026.length - 1) {
    completeSeason(career);
    return;
  }
  career.roundIndex += 1;
  career.phase = "management";
  const circuit = CIRCUITS_2026[career.roundIndex];
  currentRound(career).strategyPlans = {};
  // prepara os ajustes da nova etapa
  for (const [driverId, setup] of Object.entries(currentRound(career).setups)) {
    const driver = career.drivers.find((d) => d.driverId === driverId);
    const team = driver ? teamState(career, driver.teamId) : undefined;
    const base = driverSetup(circuit, !!team?.ai, hashSeed(driverId) % 10, circuit.sprint);
    currentRound(career).setups[driverId] = { ...base, startingCompound: setup.startingCompound };
  }
  const expiry = career.drivers.filter(
    (d) => career.playerTeams.includes(d.teamId) && d.contratoEtapas <= 1,
  );
  if (expiry.length > 0) career.news.unshift("Atenção: um ou mais contratos da sua equipe vencem após a próxima etapa.");
  career.news.unshift(`Próxima etapa: ${circuit.gp} — ${circuit.nome}.`);
  career.updatedAt = new Date().toISOString();
}

export function completeSeason(career: Career): void {
  const drivers = driverStandings(career);
  const constructors = constructorStandings(career);
  career.champions = {
    drivers: drivers[0]?.driverId ?? "",
    constructors: constructors[0]?.teamId ?? "",
  };
  for (const t of career.teams) {
    const pos = constructors.find((c) => c.teamId === t.teamId)?.position ?? 11;
    t.objectives.completed = pos <= t.objectives.targetPosition;
    if (t.objectives.completed) {
      t.budget += t.objectives.bonus;
      t.ledger.push({ round: CIRCUITS_2026.length, descricao: `Bônus de objetivo (${pos}º)`, valor: t.objectives.bonus, categoria: "objetivo" });
      career.news.unshift(`${TEAM_BY_ID[t.teamId]?.nome ?? t.teamId}: objetivo cumprido (${pos}º). Bônus de ${t.objectives.bonus} mi.`);
    } else if (career.playerTeams.includes(t.teamId)) {
      career.news.unshift(`${TEAM_BY_ID[t.teamId]?.nome ?? t.teamId}: objetivo não cumprido (${pos}º, meta ${t.objectives.targetPosition}º).`);
    }
  }
  career.seasonComplete = true;
  career.phase = "seasonEnd";
  career.updatedAt = new Date().toISOString();
}

export function summary(career: Career) {
  return {
    id: career.id,
    nome: career.nome,
    modo: career.modo,
    playerTeams: career.playerTeams,
    roundIndex: career.roundIndex,
    phase: career.phase,
    updatedAt: career.updatedAt,
    seasonComplete: career.seasonComplete,
  };
}

export function isPlayerTeam(career: Career, teamId: string): boolean {
  return career.playerTeams.includes(teamId);
}

export function sponsorsFor(team: TeamState): SponsorOffer[] {
  return SPONSOR_OFFERS.filter((s) => s.reputacaoMinima <= team.reputation);
}

export function staffMarket(): StaffCandidate[] {
  return STAFF_MARKET;
}

export function phaseLabel(phase: CareerPhase): string {
  const labels: Record<CareerPhase, string> = {
    management: "Gestão",
    prep: "Preparação",
    practice: "Treino livre",
    sprintQuali: "Classificação Sprint",
    sprint: "Sprint",
    qualifying: "Classificação",
    race: "Corrida",
    results: "Resultados",
    seasonEnd: "Fim de temporada",
  };
  return labels[phase];
}

export function compoundLabel(c: Compound): string {
  return { soft: "Macio", medium: "Médio", hard: "Duro", inter: "Intermediário", wet: "Chuva" }[c];
}

export function driverName(driverId: string): string {
  return DRIVER_BY_ID[driverId]?.nome ?? driverId.replace(/_/g, " ");
}

export function teamName(teamId: string): string {
  return TEAM_BY_ID[teamId]?.nome ?? teamId;
}

export function driverTeamColor(driverId: string): string {
  const d = DRIVER_BY_ID[driverId];
  return TEAM_BY_ID[d?.equipeId ?? ""]?.corPrimaria ?? "#888";
}

export function makeRaceForCurrentRound(career: Career, kind: "race" | "sprint") {
  const config = buildRaceConfig(career, kind);
  return createRaceState(config);
}

export function sessionResultFromRace(career: Career, state: ReturnType<typeof createRaceState>, kind: "race" | "sprint"): SessionResult {
  const table = kind === "sprint" ? [8, 7, 6, 5, 4, 3, 2, 1] : [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  return raceToSessionResult(state, kind, table, career.roundIndex + 1);
}

export function circuits(): CircuitData[] {
  return CIRCUITS_2026;
}

export function circuitInfo(circuitId: string): CircuitData | undefined {
  return CIRCUIT_BY_ID[circuitId];
}

export function driverData(driverId: string) {
  return DRIVER_BY_ID[driverId];
}
