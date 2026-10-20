import type { RaceEvent } from "../engine/types";

export type RaceAlertCategory = "critical" | "important" | "info";

export interface RaceAlert {
  id: string;
  key: string;
  category: RaceAlertCategory;
  title: string;
  message: string;
  driverId?: string;
  lap: number;
  createdAt: number;
  duration: number;
}

const CATEGORY_WEIGHT: Record<RaceAlertCategory, number> = {
  critical: 2,
  important: 1,
  info: 0,
};

export const ALERT_DURATION: Record<RaceAlertCategory, number> = {
  critical: 12000,
  important: 8000,
  info: 5000,
};

export const ALERT_COOLDOWN: Record<RaceAlertCategory, number> = {
  critical: 6000,
  important: 9000,
  info: 12000,
};

export function eventAlertCategory(event: RaceEvent, relevant: boolean): RaceAlertCategory | null {
  switch (event.type) {
    case "sc":
    case "vsc":
    case "red":
      return "critical";
    case "yellow":
      return "important";
    case "blue":
      return relevant ? "important" : null;
    case "weather":
      return "important";
    case "retirement":
      return relevant ? "critical" : null;
    case "incident":
      if (!relevant) return null;
      return event.severity === "danger" ? "critical" : "important";
    case "penalty":
      return relevant ? "important" : null;
    case "info":
      if (!relevant || !event.driverId) return null;
      if (event.severity === "danger") return "critical";
      if (event.severity === "warn" || event.severity === "success") return "important";
      return null;
    default:
      return null;
  }
}

export function eventAlertKey(event: RaceEvent, recommendationKey?: string | null): string {
  if (event.type === "sc" || event.type === "vsc" || event.type === "weather") return event.type;
  if (event.type === "info" && event.driverId) {
    return `advice:${event.driverId}:${event.adviceKey ?? recommendationKey ?? event.severity}`;
  }
  return `${event.type}:${event.driverId ?? "global"}`;
}

export function eventAlertTitle(event: RaceEvent): string {
  switch (event.type) {
    case "sc":
      return "Safety Car";
    case "vsc":
      return "Virtual Safety Car";
    case "red":
      return "Bandeira vermelha";
    case "yellow":
      return "Amarela local";
    case "blue":
      return "Bandeira azul";
    case "weather":
      return "Mudança de clima";
    case "retirement":
      return "Abandono";
    case "incident":
      return event.severity === "danger" ? "Incidente grave" : "Incidente";
    case "penalty":
      return "Penalidade";
    case "info":
      return "Engenheiro";
    default:
      return "Corrida";
  }
}

export function makeRaceAlert(
  event: RaceEvent,
  category: RaceAlertCategory,
  recommendationKey: string | null | undefined,
  now: number,
): RaceAlert {
  const key = eventAlertKey(event, recommendationKey);
  return {
    id: `${key}:${event.id}`,
    key,
    category,
    title: eventAlertTitle(event),
    message: event.message,
    driverId: event.driverId,
    lap: event.lap,
    createdAt: now,
    duration: ALERT_DURATION[category],
  };
}

/** Mantém no máximo dois avisos, priorizando criticidade e recência. */
export function mergeRaceAlerts(current: RaceAlert[], incoming: RaceAlert): RaceAlert[] {
  const byKey = new Map(current.map((alert) => [alert.key, alert]));
  const previous = byKey.get(incoming.key);
  if (!previous || incoming.createdAt >= previous.createdAt) byKey.set(incoming.key, incoming);
  return [...byKey.values()]
    .sort((a, b) => CATEGORY_WEIGHT[b.category] - CATEGORY_WEIGHT[a.category] || b.createdAt - a.createdAt)
    .slice(0, 2);
}

export function isAlertExpired(alert: RaceAlert, now: number): boolean {
  return now - alert.createdAt >= alert.duration;
}

export function canEmitAlert(lastAt: number | undefined, now: number, category: RaceAlertCategory): boolean {
  return now - (lastAt ?? 0) >= ALERT_COOLDOWN[category];
}

export type AlertMode = "notify" | "slow" | "pause";

/** Somente o modo solo pode alterar a velocidade local automaticamente. */
export function autoControlAction(
  soloMode: boolean,
  mode: AlertMode,
  category: RaceAlertCategory,
): "slow" | "pause" | null {
  if (!soloMode || category !== "critical") return null;
  if (mode === "slow") return "slow";
  if (mode === "pause") return "pause";
  return null;
}
