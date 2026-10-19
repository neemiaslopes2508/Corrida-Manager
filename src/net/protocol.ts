import type { Career, CareerPhase, QualifyingCommand, QualifyingView, RaceCommand, RaceStrategyPlan, RaceView, SessionResult } from "../engine/types";
import type { CarAttributes } from "../data/season2026";

export type CareerAction =
  | { type: "enterPrep" }
  | { type: "enterPractice" }
  | { type: "setSetup"; driverId: string; patch: { downforce?: number; focus?: "qualifying" | "balanced" | "race"; startingCompound?: string; fuelLoad?: number } }
  | { type: "setStrategyPlan"; driverId: string; lap: number | null }
  | { type: "setRaceStrategy"; driverId: string; plan: RaceStrategyPlan }
  | { type: "runPractice"; program: "qualifying" | "race" | "tyres"; teamId: string; driverId?: string }
  | { type: "finishPractice" }
  | { type: "enterRace"; kind: "race" | "sprint" }
  | { type: "continue" }
  | { type: "startDevelopment"; teamId: string; area: keyof CarAttributes; mode: "standard" | "fast" }
  | { type: "hireStaff"; teamId: string; candidateId: string }
  | { type: "signSponsor"; teamId: string; sponsorId: string }
  | { type: "renewDriver"; driverId: string }
  | { type: "replaceComponent"; teamId: string; part: "pu" | "cambio" | "freios" | "bateria" }
  | { type: "save" };

export interface PlayerView {
  id: string;
  name: string;
  teamId: string | null;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
}

export interface RoomView {
  code: string;
  phase: "lobby" | "career";
  players: PlayerView[];
  createdAt: string;
  updatedAt: string;
  paused: boolean;
  speed: number;
  raceKind: "race" | "sprint" | null;
  totalLaps: number | null;
  careerPhase: CareerPhase | null;
  raceId: string | null;
}

export type ClientMessage =
  | { type: "create_room"; name: string }
  | { type: "join_room"; code: string; name: string }
  | { type: "reconnect"; code: string; token: string }
  | { type: "pick_team"; teamId: string }
  | { type: "set_ready"; ready: boolean }
  | { type: "start_career" }
  | { type: "career_action"; action: CareerAction }
  | { type: "qualifying_command"; command: QualifyingCommand }
  | { type: "qualifying_control"; action: "pause" | "resume" | "speed" | "next" | "skip"; value?: number }
  | { type: "race_command"; command: RaceCommand }
  | { type: "race_control"; action: "pause" | "resume" | "speed"; value?: number }
  | { type: "leave" }
  | { type: "ping" };

export type ServerMessage =
  | { type: "room_state"; room: RoomView; you: PlayerView; token?: string }
  | { type: "career_state"; career: Career }
  | { type: "qualifying_view"; view: QualifyingView; paused: boolean; speed: number }
  | { type: "qualifying_finished"; sessionType: "quali" | "sprintQuali"; grid: string[] }
  | { type: "race_view"; view: RaceView; kind: "race" | "sprint"; paused: boolean; speed: number; totalLaps: number }
  | { type: "race_started"; kind: "race" | "sprint"; totalLaps: number }
  | { type: "race_finished"; result: SessionResult; kind: "race" | "sprint" }
  | { type: "error"; message: string }
  | { type: "saved" }
  | { type: "pong" };

export interface RoomSummary {
  code: string;
  players: number;
  phase: "lobby" | "career";
  updatedAt: string;
  teams: string[];
}
