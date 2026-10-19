import type { CircuitData } from "../data/season2026";
import type { CarSetup, DriverRaceSpec, QualifyingEntry, QualifyingResult, TeamRaceSpec } from "./types";
import { createRng } from "./rng";

export interface QualifyingInput {
  seed: string;
  circuit: CircuitData;
  rain: number;
  type: "quali" | "sprintQuali";
  round: number;
  drivers: DriverRaceSpec[];
  teams: TeamRaceSpec[];
  setups: Record<string, CarSetup>;
}

function carScore(c: TeamRaceSpec["car"]): number {
  return c.aerodinamica * 0.3 + c.curvas * 0.28 + c.retas * 0.24 + c.energia * 0.18;
}

function driverScore(d: DriverRaceSpec["atributos"]): number {
  return d.velocidade * 0.62 + d.consistencia * 0.16 + d.experiencia * 0.12 + d.chuva * 0.1;
}

export function estimateQualifyingLap(
  input: QualifyingInput,
  driver: DriverRaceSpec,
  team: TeamRaceSpec,
  setup: CarSetup,
  segment: 1 | 2 | 3,
): number {
  const rng = createRng(`${input.seed}:q:${input.round}:${input.type}:${segment}:${driver.driverId}`);
  const car = team.car;
  const d = driver.atributos;
  const base = input.circuit.baseLapTime;
  let lap = base * (1 - (carScore(car) - 80) * 0.00058 - (driverScore(d) - 80) * 0.00056);
  lap *= 1 - (1 - Math.abs(setup.downforce - input.circuit.downforceIdeal)) * 0.0045;
  if (setup.focus === "qualifying") lap *= 0.9985;
  if (setup.focus === "race") lap *= 1.0012;
  lap *= 1 + (1 - d.consistencia / 100) * 0.0018 * (rng.next() - 0.5) * 2;
  lap += (rng.next() - 0.5) * 0.28;
  if (input.rain > 0.05) {
    lap *= 1 + input.rain * 0.115;
    lap *= 1 - (d.chuva - 80) * 0.0011 * input.rain;
    lap += (rng.next() - 0.5) * input.rain * 0.7;
  }
  // Q1/Q2/Q3: evolução leve da pista
  lap -= segment * 0.06;
  return Math.max(base * 0.92, lap);
}

export function simulateQualifying(input: QualifyingInput): QualifyingResult {
  const teamById = new Map(input.teams.map((t) => [t.teamId, t]));
  const entries = new Map<string, QualifyingEntry>();
  for (const d of input.drivers) {
    entries.set(d.driverId, {
      driverId: d.driverId,
      teamId: d.teamId,
      time: 0,
      q1: null,
      q2: null,
      q3: null,
      position: 0,
      eliminatedIn: null,
    });
  }

  const runSegment = (segment: 1 | 2 | 3, participants: DriverRaceSpec[]): DriverRaceSpec[] => {
    const times: { driver: DriverRaceSpec; time: number }[] = [];
    for (const d of participants) {
      const team = teamById.get(d.teamId)!;
      const setup = input.setups[d.driverId] ?? { downforce: input.circuit.downforceIdeal, focus: "qualifying", startingCompound: "soft", fuelLoad: 0.25 };
      const time = estimateQualifyingLap(input, d, team, setup, segment);
      const entry = entries.get(d.driverId)!;
      if (segment === 1) entry.q1 = time;
      if (segment === 2) entry.q2 = time;
      if (segment === 3) entry.q3 = time;
      times.push({ driver: d, time });
    }
    times.sort((a, b) => a.time - b.time);
    times.forEach((t, i) => {
      const entry = entries.get(t.driver.driverId)!;
      entry.position = i + 1;
      if (segment < 3) {
        const cutoff = segment === 1 ? 16 : 10;
        if (i >= cutoff) entry.eliminatedIn = segment as 1 | 2;
      } else {
        entry.eliminatedIn = 3;
      }
    });
    return times.map((t) => t.driver);
  };

  const all = input.drivers;
  const afterQ1 = runSegment(1, all);
  const q1Order = [...all].sort((a, b) => entries.get(a.driverId)!.q1! - entries.get(b.driverId)!.q1!);
  const afterQ1Top = q1Order.slice(0, 16);
  void afterQ1;
  runSegment(2, afterQ1Top);
  const q2Order = [...afterQ1Top].sort((a, b) => entries.get(a.driverId)!.q2! - entries.get(b.driverId)!.q2!);
  const afterQ2Top = q2Order.slice(0, 10);
  runSegment(3, afterQ2Top);
  const q3Order = [...afterQ2Top].sort((a, b) => entries.get(a.driverId)!.q3! - entries.get(b.driverId)!.q3!);

  const grid: string[] = [];
  for (const d of q3Order) grid.push(d.driverId);
  for (const d of q2Order.slice(10)) grid.push(d.driverId);
  for (const d of q1Order.slice(16)) grid.push(d.driverId);

  for (const entry of entries.values()) {
    entry.time = entry.q3 ?? entry.q2 ?? entry.q1 ?? 0;
  }
  const segments = [1, 2, 3].map((segment) => {
    const list = [...entries.values()]
      .filter((e) => (segment === 1 ? e.q1 != null : segment === 2 ? e.q2 != null : e.q3 != null))
      .sort((a, b) => {
        const av = segment === 1 ? a.q1! : segment === 2 ? a.q2! : a.q3!;
        const bv = segment === 1 ? b.q1! : segment === 2 ? b.q2! : b.q3!;
        return av - bv;
      });
    return { segment: segment as 1 | 2 | 3, entries: list };
  });

  return { type: input.type, segments, grid };
}

export function gridPenaltyNotes(input: QualifyingInput): string[] {
  return input.drivers.map((d) => d.nome);
}
