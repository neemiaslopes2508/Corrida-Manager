import type { DriverAttributes } from "../data/season2026";
import type { Compound, PaceMode, TyreMode, TyreState } from "./types";

export interface CompoundSpec {
  id: Compound;
  nome: string;
  cor: string;
  sigla: string;
  grip: number;
  wearPerLap: number;
  optimalTemp: number;
  wet: boolean;
}

export const COMPOUNDS: Record<Compound, CompoundSpec> = {
  soft: { id: "soft", nome: "Macio", cor: "#ef4444", sigla: "S", grip: 1.012, wearPerLap: 5.4, optimalTemp: 98, wet: false },
  medium: { id: "medium", nome: "Médio", cor: "#eab308", sigla: "M", grip: 1.0, wearPerLap: 3.55, optimalTemp: 95, wet: false },
  hard: { id: "hard", nome: "Duro", cor: "#e5e7eb", sigla: "H", grip: 0.992, wearPerLap: 2.7, optimalTemp: 92, wet: false },
  inter: { id: "inter", nome: "Intermediário", cor: "#22c55e", sigla: "I", grip: 0.975, wearPerLap: 4.4, optimalTemp: 72, wet: true },
  wet: { id: "wet", nome: "Chuva", cor: "#3b82f6", sigla: "W", grip: 0.955, wearPerLap: 3.9, optimalTemp: 60, wet: true },
};

export function initialTyre(compound: Compound): TyreState {
  return {
    compound,
    wear: 0,
    temp: COMPOUNDS[compound].optimalTemp - 10,
    ageLaps: 0,
    stints: 0,
    usedCompounds: compound === "inter" || compound === "wet" ? [] : [compound],
    punctured: false,
  };
}

export function isWetCompound(compound: Compound): boolean {
  return compound === "inter" || compound === "wet";
}

export function tyreGrip(tyre: TyreState, rain: number): number {
  if (tyre.punctured) return 0.55;
  const spec = COMPOUNDS[tyre.compound];
  let grip = spec.grip;

  const wear = Math.min(100, tyre.wear);
  grip -= Math.pow(wear / 100, 1.45) * 0.072;
  if (wear > 84) grip -= ((wear - 84) / 16) * 0.045;

  const tempDev = tyre.temp - spec.optimalTemp;
  if (tempDev < -18) grip -= Math.min(0.035, (-tempDev - 18) * 0.0012);
  if (tempDev > 18) grip -= Math.min(0.05, (tempDev - 18) * 0.0015);

  if (rain < 0.12) {
    if (spec.wet) grip -= 0.09;
  } else if (tyre.compound === "inter") {
    grip -= Math.abs(rain - 0.42) * 0.16;
  } else if (tyre.compound === "wet") {
    grip -= Math.abs(rain - 0.82) * 0.11;
  } else {
    grip -= rain * 0.42;
  }
  return Math.max(0.62, grip);
}

export function wearPerLap(
  tyre: TyreState,
  compound: Compound,
  pace: PaceMode,
  tyreMode: TyreMode,
  driver: DriverAttributes,
  abrasiveness: number,
  rain: number,
  trackTemp: number,
): number {
  const spec = COMPOUNDS[compound];
  const paceMod = pace === "attack" ? 1.22 : pace === "conserve" ? 0.82 : 1;
  const modeMod = tyreMode === "manage" ? 0.78 : tyreMode === "push" ? 1.2 : 1;
  const skill = 1.13 - (driver.gestaoPneus / 100) * 0.26;
  const tempMod = 1 + Math.max(0, tyre.temp - spec.optimalTemp - 8) * 0.006;
  const wear = Math.max(0, tyre.wear);
  const cliff = wear > 82 ? 1.35 : wear > 65 ? 1.12 : 1;
  const wetMod = 1 - Math.min(0.25, rain * 0.3);
  return spec.wearPerLap * paceMod * modeMod * skill * (0.85 + abrasiveness * 0.4) * tempMod * cliff * wetMod * (0.94 + (trackTemp - 25) * 0.004);
}

export function updateTyreTemperature(
  tyre: TyreState,
  pace: PaceMode,
  tyreMode: TyreMode,
  speed: number,
  airTemp: number,
  trackTemp: number,
  rain: number,
  dt: number,
): number {
  const spec = COMPOUNDS[tyre.compound];
  const load = Math.min(1, speed / 80);
  let target = 48 + load * 58 + (trackTemp - 24) * 0.45;
  if (pace === "attack") target += 7;
  if (tyreMode === "push") target += 5;
  if (tyreMode === "manage") target -= 5;
  if (rain > 0.15) target -= rain * 32;
  if (isWetCompound(tyre.compound)) target -= 8;
  target = Math.max(spec.optimalTemp - 35, target);
  const cooling = tyre.temp > target ? 0.22 : 0.11;
  return tyre.temp + (target - tyre.temp) * Math.min(1, cooling * dt);
}

export function compoundForConditions(rain: number): Compound {
  if (rain > 0.62) return "wet";
  if (rain > 0.18) return "inter";
  return "medium";
}

export function dryCompoundsUsed(tyre: TyreState): number {
  return new Set(tyre.usedCompounds.filter((c) => c === "soft" || c === "medium" || c === "hard")).size;
}
