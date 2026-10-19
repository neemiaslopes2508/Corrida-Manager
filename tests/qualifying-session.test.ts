import { describe, expect, it } from "vitest";
import { createCareer, currentRound, migrateCareer, startQualifyingSession } from "../src/engine/career";
import {
  advanceQualifyingSegment,
  advanceQualifyingSession,
  applyQualifyingCommand,
  buildQualifyingView,
  qualifyingCompoundsFor,
  qualifyingResultFromSession,
  simulateQualifyingToEnd,
} from "../src/engine/qualifyingSession";

function careerWithSession(seed = "quali-session-test") {
  const career = createCareer({ nome: "Q", modo: "solo", playerTeams: ["team_ferrari"], seed });
  return { career, session: startQualifyingSession(career, "quali") };
}

describe("classificação interativa", () => {
  it("usa o formato 22 → 16 → 10 e produz grid determinístico", () => {
    const a = careerWithSession("deterministic-quali");
    const b = careerWithSession("deterministic-quali");
    simulateQualifyingToEnd(a.session);
    simulateQualifyingToEnd(b.session);
    const ra = qualifyingResultFromSession(a.session);
    const rb = qualifyingResultFromSession(b.session);
    expect(ra.grid).toHaveLength(22);
    expect(new Set(ra.grid).size).toBe(22);
    expect(ra.segments.map((s) => s.entries.length)).toEqual([22, 16, 10]);
    expect(ra.grid.slice(0, 10)).toEqual(ra.segments[2].entries.map((entry) => entry.driverId));
    const q3Times = ra.segments[2].entries.map((entry) => entry.q3).filter((time): time is number => time != null);
    expect(q3Times).toEqual([...q3Times].sort((a, b) => a - b));
    expect(ra.grid).toEqual(rb.grid);
    expect(ra.segments[2].entries.map((e) => e.q3)).toEqual(rb.segments[2].entries.map((e) => e.q3));
    expect(a.session.cars.every((car) => car.bestLap != null)).toBe(true);
    expect(a.session.cars.some((car) => car.tyre.wear > 0)).toBe(true);
    expect(a.session.cars.some((car) => car.attempts.some((attempt) => attempt.trafficLoss > 0))).toBe(true);
  });

  it("não reaproveita tempos anteriores para a torre da Q2/Q3", () => {
    const { session } = careerWithSession("segment-times");
    for (let i = 0; i < 3000 && session.status !== "between"; i++) advanceQualifyingSession(session, 0.5);
    expect(session.status).toBe("between");
    expect(session.cars.some((car) => car.segmentBest[1] != null)).toBe(true);
    expect(advanceQualifyingSegment(session).ok).toBe(true);
    for (let i = 0; i < 2000 && session.status === "running" && session.clock === session.segmentDuration; i++) advanceQualifyingSession(session, 0.5);
    const view = buildQualifyingView(session);
    expect(view.segment).toBe(2);
    expect(view.cars.every((car) => car.bestLap == null)).toBe(true);
    for (let i = 0; i < 4000 && session.status !== "between"; i++) advanceQualifyingSession(session, 0.5);
    const eliminatedInQ2 = session.cars.filter((car) => car.eliminatedIn === 2).map((car) => car.position);
    const eliminatedInQ1 = session.cars.filter((car) => car.eliminatedIn === 1).map((car) => car.position);
    expect(Math.max(...eliminatedInQ2)).toBeLessThan(Math.min(...eliminatedInQ1));
  });

  it("respeita compostos e durações da Sprint Qualifying", () => {
    expect(qualifyingCompoundsFor("sprintQuali", 1, 0)).toEqual(["medium"]);
    expect(qualifyingCompoundsFor("sprintQuali", 2, 0)).toEqual(["medium"]);
    expect(qualifyingCompoundsFor("sprintQuali", 3, 0)).toEqual(["soft"]);
    expect(qualifyingCompoundsFor("sprintQuali", 3, 0.3)).toContain("inter");
    expect(qualifyingCompoundsFor("quali", 1, 0)).toContain("soft");
    const career = createCareer({ nome: "Sprint", modo: "solo", playerTeams: ["team_ferrari"], seed: "sprint-session" });
    career.roundIndex = 1;
    const session = startQualifyingSession(career, "sprintQuali");
    expect(session.clock).toBe(12 * 60);
    expect(career.phase).toBe("sprintQuali");
    expect(buildQualifyingView(session).allowedCompounds).toEqual(["medium"]);
    simulateQualifyingToEnd(session);
    expect(qualifyingResultFromSession(session).type).toBe("sprintQuali");
  });

  it("permite múltiplas tentativas e consome pneus", () => {
    const { career, session } = careerWithSession("player-attempts");
    const car = session.cars.find((entry) => entry.teamId === "team_ferrari")!;
    const before = car.setsRemaining.soft;
    expect(applyQualifyingCommand(session, { type: "plan", driverId: car.driverId, compound: "soft", fuelLoad: 0.25, tyrePrep: "push" }, "team_ferrari").ok).toBe(true);
    expect(applyQualifyingCommand(session, { type: "sendOut", driverId: car.driverId }, "team_ferrari").ok).toBe(true);
    for (let i = 0; i < 1600 && car.status !== "garage"; i++) advanceQualifyingSession(session, 0.25);
    expect(car.attempts.length).toBeGreaterThan(0);
    expect(car.bestLap).not.toBeNull();
    expect(car.setsRemaining.soft).toBe(before - 1);
    expect(car.tyre.wear).toBeGreaterThan(0);
    expect(applyQualifyingCommand(session, { type: "sendOut", driverId: car.driverId }, "team_ferrari").ok).toBe(true);
    for (let i = 0; i < 1600 && car.status !== "garage"; i++) advanceQualifyingSession(session, 0.25);
    expect(car.attempts.length).toBeGreaterThanOrEqual(2);
    expect(car.setsRemaining.soft).toBe(before - 2);
  });

  it("bloqueia pilotos de outra equipe e permite abortar uma tentativa", () => {
    const { career, session } = careerWithSession("abort-test");
    const car = session.cars.find((entry) => entry.teamId === "team_ferrari")!;
    const other = session.cars.find((entry) => entry.teamId === "team_mclaren")!;
    expect(applyQualifyingCommand(session, { type: "sendOut", driverId: other.driverId }, "team_ferrari").ok).toBe(false);
    applyQualifyingCommand(session, { type: "sendOut", driverId: car.driverId }, "team_ferrari");
    advanceQualifyingSession(session, 1);
    expect(applyQualifyingCommand(session, { type: "abort", driverId: car.driverId }, "team_ferrari").ok).toBe(true);
    expect(car.status).toBe("garage");
    expect(car.aborted).toBe(true);
    expect(buildQualifyingView(session).events.some((event) => event.message.includes("aborta"))).toBe(true);
  });

  it("faz a chuva evoluir durante a sessão", () => {
    const { session } = careerWithSession("rain-3");
    for (let i = 0; i < 1200 && session.clock > 690; i++) advanceQualifyingSession(session, 0.5);
    expect(session.rain).toBeGreaterThan(0.05);
    expect(buildQualifyingView(session).condition).not.toBe("Seco");
  });

  it("migra carreiras V1 sem perder a rodada atual", () => {
    const { career } = careerWithSession("migration-test");
    const legacy = JSON.parse(JSON.stringify(career)) as typeof career;
    legacy.version = 1;
    delete (legacy.rounds[0] as Partial<typeof legacy.rounds[number]>).qualifyingSession;
    const migrated = migrateCareer(legacy);
    expect(migrated.version).toBe(3);
    expect(migrated.rounds[0].qualifyingSession).toBeNull();
    expect(currentRound(migrated).round).toBe(1);
  });
});
