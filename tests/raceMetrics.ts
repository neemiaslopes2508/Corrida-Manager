import { advanceRace } from "../src/engine/race";
import type { RaceState } from "../src/engine/types";

/**
 * Métricas de instrumentação V1.3.6A — uso exclusivo em testes. Não fazem
 * parte do runtime do jogo e servem para medir cronometragem, largada,
 * primeira volta, ultrapassagens e penalidades com seeds reproduzíveis.
 */
export interface LaunchSample {
  driverId: string;
  teamId: string;
  reaction: number;
  traction: number;
  quality: number;
}

export interface PenaltySample {
  driverId: string;
  lap: number;
  kind: "limites_pista" | "contato" | "manobra_perigosa" | "outro";
  penalty: number;
}

export interface V136Metrics {
  totalLaps: number;
  lapSamples: number;
  lapTimeFractionalSteps: number[];
  sectorSumMaxError: number;
  inconsistentLapTimes: number;
  launches: LaunchSample[];
  launchReactionMin: number;
  launchReactionMax: number;
  launchReactionDistinct: number;
  firstLapSamples: number;
  firstLapChanged: number;
  firstLapChangedPct: number;
  firstLapGained: number;
  firstLapLost: number;
  firstLapPasses: number;
  firstLapAttackPasses: number;
  officialPasses: number;
  attackPasses: number;
  pacePasses: number;
  tyrePasses: number;
  mistakePasses: number;
  counterPasses: number;
  passKinds: Record<string, number>;
  attackAttempts: number;
  committedAttacks: number;
  sideBySideTicks: number;
  defendedAttempts: number;
  passPositionJumps: number;
  lapPaceHistory: Array<{ driverId: string; lap: number; pace: number }>;
  lapTimeByDriver: Record<string, number[]>;
  warnings: number;
  penalties: PenaltySample[];
  penaltyByKind: Record<string, number>;
  scPasses: number;
}

function classifyPenalty(message: string): PenaltySample["kind"] {
  const text = message.toLowerCase();
  if (text.includes("limites")) return "limites_pista";
  if (text.includes("contato")) return "contato";
  if (text.includes("manobra")) return "manobra_perigosa";
  return "outro";
}

/**
 * Simula a corrida até o fim coletando métricas. A mesma seed produz sempre
 * as mesmas métricas.
 */
export function simulateWithMetrics(state: RaceState, maxTicks = 120_000): V136Metrics {
  const launches: LaunchSample[] = state.cars.map((car) => ({
    driverId: car.driverId,
    teamId: car.teamId,
    reaction: car.launchReaction,
    traction: car.launchTraction,
    quality: car.launchQuality,
  }));
  const fractional = new Set<number>();
  const penalties: PenaltySample[] = [];
  let lapSamples = 0;
  let inconsistent = 0;
  let warnings = 0;
  let officialPasses = 0;
  let attackPasses = 0;
  let pacePasses = 0;
  let tyrePasses = 0;
  let mistakePasses = 0;
  let counterPasses = 0;
  const passKinds: Record<string, number> = {};
  const lapPaceHistory: Array<{ driverId: string; lap: number; pace: number }> = [];
  const lapPaceSeen = new Set<string>();
  const lapTimeByDriver: Record<string, number[]> = {};
  const previousLap = new Map(state.cars.map((car) => [car.driverId, car.lap]));
  let scPasses = 0;
  let firstLapSamples = 0;
  let firstLapChanged = 0;
  let firstLapGained = 0;
  let firstLapLost = 0;
  let firstLapPasses = 0;
  let firstLapAttackPasses = 0;
  let passPositionJumps = 0;
  let firstLapRecorded = false;
  const seenLap = new Set<string>();
  let guard = 0;

  while (state.status === "running" && guard++ < maxTicks) {
    const beforePositions = new Map(state.cars.map((car) => [car.driverId, car.position]));
    advanceRace(state);
    for (const car of state.cars) {
      if (car.lapPaceLap === car.lap) {
        const key = `${car.driverId}:${car.lap}`;
        if (!lapPaceSeen.has(key)) {
          lapPaceSeen.add(key);
          lapPaceHistory.push({ driverId: car.driverId, lap: car.lap, pace: car.lapPace });
        }
      }
      const previous = previousLap.get(car.driverId) ?? 0;
      if (car.lap > previous) {
        if (car.lastLap != null) (lapTimeByDriver[car.driverId] ??= []).push(car.lastLap);
        previousLap.set(car.driverId, car.lap);
      }
    }
    for (const event of state.events) {
      // eventos antigos não contam; a checagem por id evita reprocessar
      if (seenLap.has(`e:${event.id}`)) continue;
      seenLap.add(`e:${event.id}`);
      if (event.type === "overtake") {
        officialPasses += 1;
        if (!firstLapRecorded) {
          firstLapPasses += 1;
          if (event.attackSuccess) firstLapAttackPasses += 1;
        }
        if (event.attackSuccess) attackPasses += 1;
        const beforePosition = beforePositions.get(event.driverId ?? "");
        const afterCar = state.cars.find((car) => car.driverId === event.driverId);
        if (beforePosition != null && afterCar && beforePosition - afterCar.position > 1) {
          passPositionJumps += 1;
        }
        const kind = event.passKind ?? "attack";
        passKinds[kind] = (passKinds[kind] ?? 0) + 1;
        if (kind === "pace") pacePasses += 1;
        if (kind === "tyre") tyrePasses += 1;
        if (kind === "mistake") mistakePasses += 1;
        if (event.counterAttack) counterPasses += 1;
        if (state.trackStatus !== "green") scPasses += 1;
      }
      if (event.type === "penalty") {
        penalties.push({ driverId: event.driverId ?? "", lap: event.lap, kind: classifyPenalty(event.message), penalty: 5 });
      }
      if (event.type === "info" && event.message.includes("Advertência")) warnings += 1;
    }
    if (!firstLapRecorded && state.leaderLap >= 1) {
      firstLapRecorded = true;
      for (const car of state.cars) {
        if (car.status === "retired") continue;
        firstLapSamples += 1;
        const change = car.gridPosition - car.position;
        if (change !== 0) firstLapChanged += 1;
        if (change > 0) firstLapGained += 1;
        if (change < 0) firstLapLost += 1;
      }
    }
  }

  let sectorSumMaxError = 0;
  for (const car of state.cars) {
    for (const time of car.lapTimes) {
      lapSamples += 1;
      if (!Number.isFinite(time) || time <= 0) inconsistent += 1;
      else fractional.add(Math.round((((time % 0.25) + 0.25) % 0.25) * 1000));
    }
    if (car.lastLap != null && car.sectors.every((value) => value != null)) {
      const sum = car.sectors.reduce((total, value) => total + (value ?? 0), 0);
      sectorSumMaxError = Math.max(sectorSumMaxError, Math.abs(car.lastLap - sum));
    }
  }

  const penaltyByKind: Record<string, number> = {};
  for (const penalty of penalties) penaltyByKind[penalty.kind] = (penaltyByKind[penalty.kind] ?? 0) + 1;

  const reactions = launches.map((launch) => launch.reaction);
  const sideBySideTicks = state.cars.reduce((total, car) => total + car.sideBySideTicks, 0);
  const defendedAttempts = state.cars.reduce((total, car) => total + car.defendedAttempts, 0);
  return {
    totalLaps: state.totalLaps,
    lapSamples,
    lapTimeFractionalSteps: [...fractional].sort((a, b) => a - b),
    sectorSumMaxError,
    inconsistentLapTimes: inconsistent,
    launches,
    launchReactionMin: Math.min(...reactions),
    launchReactionMax: Math.max(...reactions),
    launchReactionDistinct: new Set(reactions.map((value) => value.toFixed(4))).size,
    firstLapSamples,
    firstLapChanged,
    firstLapChangedPct: firstLapSamples ? (100 * firstLapChanged) / firstLapSamples : 0,
    firstLapGained,
    firstLapLost,
    firstLapPasses,
    firstLapAttackPasses,
    officialPasses,
    attackPasses,
    pacePasses,
    tyrePasses,
    mistakePasses,
    counterPasses,
    passKinds,
    attackAttempts: state.cars.reduce((total, car) => total + car.overtakeAttempts, 0),
    committedAttacks: state.cars.reduce((total, car) => total + car.attackAttempts, 0),
    sideBySideTicks,
    defendedAttempts,
    passPositionJumps,
    lapPaceHistory,
    lapTimeByDriver,
    warnings,
    penalties,
    penaltyByKind,
    scPasses,
  };
}
