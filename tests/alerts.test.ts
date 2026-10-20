import { describe, expect, it } from "vitest";
import type { RaceEvent } from "../src/engine/types";
import {
  autoControlAction,
  canEmitAlert,
  eventAlertCategory,
  eventAlertKey,
  makeRaceAlert,
  mergeRaceAlerts,
  type RaceAlert,
} from "../src/ui/raceAlerts";

function event(partial: Partial<RaceEvent> & Pick<RaceEvent, "id" | "type" | "message">): RaceEvent {
  return {
    time: 10,
    tick: 40,
    lap: 5,
    severity: "info",
    ...partial,
  };
}

describe("alertas contextuais V1.3.4", () => {
  it("classifica Safety Car, incidente grave, chuva e penalidade", () => {
    expect(eventAlertCategory(event({ id: 1, type: "sc", message: "SC" }), false)).toBe("critical");
    expect(eventAlertCategory(event({ id: 2, type: "incident", message: "Pneu furado", severity: "danger" }), true)).toBe("critical");
    expect(eventAlertCategory(event({ id: 3, type: "incident", message: "Pneu furado", severity: "danger" }), false)).toBeNull();
    expect(eventAlertCategory(event({ id: 7, type: "red", message: "Bandeira vermelha", severity: "danger" }), false)).toBe("critical");
    expect(eventAlertCategory(event({ id: 8, type: "yellow", message: "Amarela setor 2", severity: "warn" }), false)).toBe("important");
    expect(eventAlertCategory(event({ id: 9, type: "blue", message: "Bandeira azul", severity: "warn" }), true)).toBe("important");
    expect(eventAlertCategory(event({ id: 10, type: "blue", message: "Bandeira azul", severity: "warn" }), false)).toBeNull();
    expect(eventAlertCategory(event({ id: 4, type: "weather", message: "Chuva", severity: "warn" }), false)).toBe("important");
    expect(eventAlertCategory(event({ id: 5, type: "penalty", message: "+5s", severity: "warn" }), true)).toBe("important");
    expect(eventAlertCategory(event({ id: 6, type: "fastest", message: "VL", severity: "success" }), true)).toBeNull();
  });

  it("aplica prioridade, limite de duas notificações e deduplicação", () => {
    const now = Date.now();
    const critical = makeRaceAlert(event({ id: 10, type: "sc", message: "Safety Car", severity: "danger" }), "critical", null, now);
    const important = makeRaceAlert(event({ id: 11, type: "weather", message: "Chuva", severity: "warn" }), "important", null, now + 1);
    const info = makeRaceAlert(event({ id: 12, type: "fastest", message: "VL", severity: "success" }), "info", null, now + 2);
    let alerts: RaceAlert[] = [];
    alerts = mergeRaceAlerts(alerts, info);
    alerts = mergeRaceAlerts(alerts, important);
    alerts = mergeRaceAlerts(alerts, critical);
    expect(alerts).toHaveLength(2);
    expect(alerts[0].category).toBe("critical");
    expect(alerts[1].category).toBe("important");

    const replacement = { ...critical, id: "sc:99", message: "Safety Car atualizado", createdAt: now + 3 };
    alerts = mergeRaceAlerts(alerts, replacement);
    expect(alerts).toHaveLength(2);
    expect(alerts[0].message).toContain("atualizado");
  });

  it("deduplica conselhos pela chave da condição, não pela mensagem", () => {
    const energy = event({ id: 20, type: "info", message: "Bateria baixa", driverId: "driver_x", severity: "warn", adviceKey: "energy" });
    const rain = event({ id: 21, type: "info", message: "Chuva", driverId: "driver_x", severity: "warn", adviceKey: "rain" });
    expect(eventAlertKey(energy)).toBe("advice:driver_x:energy");
    expect(eventAlertKey(rain)).toBe("advice:driver_x:rain");
    expect(eventAlertKey(energy)).not.toBe(eventAlertKey(rain));
  });

  it("respeita cooldown por chave e categoria", () => {
    const now = 100_000;
    expect(canEmitAlert(undefined, now, "critical")).toBe(true);
    expect(canEmitAlert(now - 1_000, now, "critical")).toBe(false);
    expect(canEmitAlert(now - 7_000, now, "critical")).toBe(true);
    expect(canEmitAlert(now - 7_000, now, "important")).toBe(false);
  });

  it("só permite ação automática no modo solo e em evento crítico", () => {
    expect(autoControlAction(true, "slow", "critical")).toBe("slow");
    expect(autoControlAction(true, "pause", "critical")).toBe("pause");
    expect(autoControlAction(true, "slow", "important")).toBeNull();
    expect(autoControlAction(false, "slow", "critical")).toBeNull();
    expect(autoControlAction(true, "notify", "critical")).toBeNull();
  });
});
