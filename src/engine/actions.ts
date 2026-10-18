import { STAFF_MARKET } from "../data/season2026";
import type { Career } from "./types";
import type { CareerAction } from "../net/protocol";
import {
  enterPractice,
  enterPrep,
  finishPracticeAndQualify,
  continueAfterResults,
  enterRace,
  hireStaff,
  renewDriver,
  replaceComponent,
  runPractice,
  setSetup,
  setStrategyPlan,
  signSponsor,
  startDevelopment,
} from "./career";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export function dispatchCareerAction(career: Career, action: CareerAction, actorTeams: string[]): ActionResult {
  switch (action.type) {
    case "enterPrep":
      if (career.phase !== "management") return { ok: false, error: "Fase inválida." };
      enterPrep(career);
      return { ok: true };
    case "enterPractice":
      if (career.phase !== "prep") return { ok: false, error: "Fase inválida." };
      enterPractice(career);
      return { ok: true };
    case "setSetup": {
      const driver = career.drivers.find((d) => d.driverId === action.driverId);
      if (!driver || !actorTeams.includes(driver.teamId)) return { ok: false, error: "Sem permissão sobre este piloto." };
      return setSetup(career, action.driverId, action.patch as never);
    }
    case "setStrategyPlan": {
      const driver = career.drivers.find((d) => d.driverId === action.driverId);
      if (!driver || !actorTeams.includes(driver.teamId)) return { ok: false, error: "Sem permissão sobre este piloto." };
      return setStrategyPlan(career, action.driverId, action.lap);
    }
    case "runPractice": {
      if (!actorTeams.includes(action.teamId)) return { ok: false, error: "Sem permissão sobre esta equipe." };
      return runPractice(career, action.program, action.teamId);
    }
    case "finishPractice":
      if (career.phase !== "practice") return { ok: false, error: "Fase inválida." };
      return finishPracticeAndQualify(career);
    case "enterRace":
      if (action.kind === "sprint" && career.phase !== "sprintQuali") return { ok: false, error: "Fase inválida." };
      if (action.kind === "race" && career.phase !== "qualifying") return { ok: false, error: "Fase inválida." };
      enterRace(career, action.kind);
      return { ok: true };
    case "continue":
      if (career.phase !== "results") return { ok: false, error: "Fase inválida." };
      continueAfterResults(career);
      return { ok: true };
    case "startDevelopment":
      if (!actorTeams.includes(action.teamId)) return { ok: false, error: "Sem permissão sobre esta equipe." };
      return startDevelopment(career, action.teamId, action.area, action.mode);
    case "hireStaff": {
      if (!actorTeams.includes(action.teamId)) return { ok: false, error: "Sem permissão sobre esta equipe." };
      const candidate = STAFF_MARKET.find((s) => s.id === action.candidateId);
      if (!candidate) return { ok: false, error: "Profissional não encontrado." };
      return hireStaff(career, action.teamId, candidate);
    }
    case "signSponsor":
      if (!actorTeams.includes(action.teamId)) return { ok: false, error: "Sem permissão sobre esta equipe." };
      return signSponsor(career, action.teamId, action.sponsorId);
    case "renewDriver": {
      const driver = career.drivers.find((d) => d.driverId === action.driverId);
      if (!driver || !actorTeams.includes(driver.teamId)) return { ok: false, error: "Sem permissão sobre este piloto." };
      return renewDriver(career, action.driverId);
    }
    case "replaceComponent":
      if (!actorTeams.includes(action.teamId)) return { ok: false, error: "Sem permissão sobre esta equipe." };
      return replaceComponent(career, action.teamId, action.part);
    case "save":
      return { ok: true };
    default:
      return { ok: false, error: "Ação desconhecida." };
  }
}
