import React, { useMemo } from "react";
import type { Career, Compound, RaceStrategyPlan } from "../engine/types";
import type { CareerAction as Action } from "../net/protocol";
import { currentRound, getDriversOfTeam, teamState } from "../engine/career";
import { CIRCUITS_2026 } from "../data/season2026";
import { COMPOUNDS } from "../engine/tyres";
import { buildPlanWithStops, estimatePitLoss, makeDefaultRacePlan, normalizeRacePlan, projectRaceStrategy, validateRacePlan } from "../engine/raceStrategy";
import { createWeather } from "../engine/race";
import { formatClock } from "../engine/track";
import { Badge, Button, Panel, TyreBadge } from "./Common";

const COMPOUNDS_DRY: Compound[] = ["soft", "medium", "hard"];

export function RaceStrategyPlanner({
  career,
  onAction,
}: {
  career: Career;
  onAction: (action: Action) => void;
}) {
  const circuit = CIRCUITS_2026[career.roundIndex];
  const round = currentRound(career);
  const weather = useMemo(() => createWeather(circuit, `${career.seed}:r${career.roundIndex + 1}`), [career.seed, career.roundIndex, circuit]);
  const startRain = weather[0]?.rain ?? 0;
  const drivers = career.playerTeams.flatMap((teamId) => getDriversOfTeam(career, teamId));
  return (
    <Panel title="Plano de corrida" subtitle="Stints, compostos, janelas de parada e projeção de desgaste">
      <div className="weekend-note">
        <Badge tone="info">Sem reabastecimento</Badge>
        <p>
          O plano é uma estimativa. Tráfego, temperatura, chuva e incidentes alteram a execução. Em pista seca, a corrida exige dois compostos secos.
        </p>
      </div>
      <div className="strategy-planner-grid">
        {drivers.map((driver) => {
          const team = teamState(career, driver.teamId);
          if (!team) return null;
          const setup = round.setups[driver.driverId];
          const inventory = round.tyreInventory?.[driver.driverId];
          const stored = round.raceStrategyPlans?.[driver.driverId];
          const plan = normalizeRacePlan(
            stored ?? makeDefaultRacePlan({
              driverId: driver.driverId,
              totalLaps: circuit.voltas,
              circuit: circuit,
              startRain,
              mandatoryStop: true,
              startingCompound: setup?.startingCompound ?? "medium",
              source: "player",
              strategyRating: team.staff.estrategista.rating,
            }),
            circuit.voltas,
          );
          const projection = projectRaceStrategy({
            plan,
            circuit: circuit,
            car: team.car,
            driver: driver.attributes,
            setup: setup ?? { downforce: circuit.downforceIdeal, focus: "balanced" },
            rain: startRain,
            trackTemp: weather[0]?.trackTemp ?? 35,
            airTemp: weather[0]?.airTemp ?? 25,
            pitCrew: team.pitCrew ?? 70,
            inventory,
          });
          const validation = validateRacePlan(plan, circuit.voltas, true, startRain < 0.15, inventory);
          const pitLoss = estimatePitLoss(circuit, team.pitCrew ?? 70);
          const update = (next: RaceStrategyPlan) => onAction({
            type: "setRaceStrategy",
            driverId: driver.driverId,
            plan: { ...next, driverId: driver.driverId, source: "player" },
          });
          const setStops = (stops: number) => {
            const first = setup?.startingCompound && COMPOUNDS_DRY.includes(setup.startingCompound) ? setup.startingCompound : "medium";
            const compounds: Compound[] = [];
            for (let index = 0; index <= stops; index++) {
              compounds.push(index === 0 ? first : first === "medium" ? "hard" : "medium");
            }
            update(buildPlanWithStops(driver.driverId, circuit.voltas, stops, compounds, "player"));
          };
          const setCompound = (index: number, compound: Compound) => {
            const stints = plan.stints.map((stint, i) => i === index ? { ...stint, compound } : stint);
            update({ ...plan, stints });
          };
          const setPitLap = (stopIndex: number, value: number) => {
            const previous = plan.stints.slice(0, stopIndex).reduce((sum, stint) => sum + stint.laps, 0);
            const nextLaps = Math.max(1, Math.round(value) - previous);
            const currentStint = plan.stints[stopIndex];
            if (!currentStint) return;
            const stints = plan.stints.map((stint, i) => i === stopIndex ? { ...stint, laps: nextLaps } : stint);
            update(normalizeRacePlan({ ...plan, stints }, circuit.voltas));
          };
          const setWindow = (value: number) => update({
            ...plan,
            pitWindows: plan.pitWindows.map(() => ({ before: value, after: value })),
          });
          return (
            <div className="race-plan-card" key={driver.driverId}>
              <div className="race-plan-head">
                <div>
                  <strong>{driver.driverId.replace("driver_", "").replace(/_/g, " ")}</strong>
                  <span className="muted small">{COMPOUNDS[plan.stints[0]?.compound ?? "medium"].nome} · {plan.stints.length - 1} parada(s) · {formatClock(projection.totalTime)}</span>
                </div>
                <Badge tone={validation.ok ? "good" : "bad"}>{validation.ok ? "Válido" : "Revisar"}</Badge>
              </div>
              <div className="race-plan-actions">
                <Button size="small" variant="subtle" disabled={startRain < 0.15} onClick={() => setStops(0)}>0 paradas</Button>
                <Button size="small" variant="subtle" onClick={() => setStops(1)}>1 parada</Button>
                <Button size="small" variant="subtle" onClick={() => setStops(2)}>2 paradas</Button>
                <Button size="small" variant="subtle" onClick={() => setStops(3)}>3 paradas</Button>
                <span className="muted small">Janela ±</span>
                {[1, 2, 3].map((value) => (
                  <button key={value} className={`mini-chip ${plan.pitWindows.every((window) => window.before === value && window.after === value) ? "active" : ""}`} onClick={() => setWindow(value)}>{value}</button>
                ))}
              </div>
              <div className="plan-timeline">
                {plan.stints.map((stint, index) => (
                  <div
                    key={`${stint.compound}-${index}`}
                    className="plan-stint"
                    style={{ flex: Math.max(1, stint.laps), background: COMPOUNDS[stint.compound].cor }}
                    title={`${COMPOUNDS[stint.compound].nome}: ${stint.laps} voltas`}
                  >
                    <span>{COMPOUNDS[stint.compound].sigla} · {stint.laps}v</span>
                  </div>
                ))}
              </div>
              <details className="plan-advanced">
                <summary>Editar stints e paradas</summary>
                <div className="plan-stints">
                {plan.stints.map((stint, index) => (
                  <div className="plan-stint-row" key={`${index}-${stint.laps}`}>
                    <TyreBadge compound={stint.compound} />
                    <select value={stint.compound} onChange={(event) => setCompound(index, event.target.value as Compound)}>
                      {(["soft", "medium", "hard", "inter", "wet"] as Compound[]).map((compound) => (
                        <option key={compound} value={compound}>{COMPOUNDS[compound].nome}</option>
                      ))}
                    </select>
                    <span className="muted small">{stint.laps} voltas</span>
                    {index < plan.stints.length - 1 && (
                      <label className="inline-field">
                        <span>parar após</span>
                        <input
                          type="number"
                          min={1}
                          max={circuit.voltas - 1}
                          value={plan.stints.slice(0, index + 1).reduce((sum, item) => sum + item.laps, 0)}
                          onChange={(event) => setPitLap(index, Number(event.target.value))}
                        />
                      </label>
                    )}
                  </div>
                ))}
                </div>
              </details>
              <div className="plan-summary-grid">
                <div><span>Pit loss</span><strong>{pitLoss.toFixed(1)}s</strong></div>
                <div><span>Desgaste máx.</span><strong className={projection.risk > 0.6 ? "text-bad" : "text-good"}>{Math.round(Math.max(...projection.stints.map((stint) => stint.endWear)))}%</strong></div>
                <div><span>Risco</span><strong className={projection.risk > 0.6 ? "text-bad" : "text-good"}>{projection.risk > 0.6 ? "Alto" : projection.risk > 0.35 ? "Médio" : "Baixo"}</strong></div>
                <div><span>Jogos</span><strong>{inventory ? `${inventory.soft}S ${inventory.medium}M ${inventory.hard}H` : "�"}</strong></div>
              </div>
              {!validation.ok && <p className="plan-warning">{validation.error}</p>}
              <div className="plan-fuel-row">
                <span>Margem de combustível</span>
                <input
                  type="range"
                  min={92}
                  max={100}
                  value={Math.round((setup?.fuelLoad ?? 1) * 100)}
                  onChange={(event) => onAction({ type: "setSetup", driverId: driver.driverId, patch: { fuelLoad: Number(event.target.value) / 100 } })}
                />
                <strong>{Math.round((setup?.fuelLoad ?? 1) * 100)}%</strong>
              </div>
              <p className="muted small">
                Chuva: inter/chuva são recomendados automaticamente. A troca só acontece quando o piloto ou a IA entram nos boxes.
              </p>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

