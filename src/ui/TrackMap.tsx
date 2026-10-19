import React, { useMemo } from "react";
import type { CircuitData } from "../data/season2026";
import { TEAM_BY_ID } from "../data/season2026";
import { buildTrack, pitPoseAt, poseAt } from "../engine/track";

export interface TrackMapCar {
  driverId: string;
  teamId: string;
  position: number;
  distance: number;
  lane?: number;
  status: string;
  pit?: { state: string };
}

interface Props {
  circuit: CircuitData;
  cars?: TrackMapCar[];
  selectedDriverId?: string | null;
  onSelect?: (driverId: string) => void;
  compact?: boolean;
  showPit?: boolean;
  highlightTeams?: string[];
}

export function TrackMap({ circuit, cars = [], selectedDriverId, onSelect, compact = false, showPit = true, highlightTeams = [] }: Props) {
  const track = useMemo(() => buildTrack(circuit), [circuit.id]);
  const bounds = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of track.viewPoints) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
    const pad = 22;
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }, [track]);
  const start = poseAt(track, 0);
  const sector1 = poseAt(track, track.sectorDistance[0]);
  const sector2 = poseAt(track, track.sectorDistance[1]);

  const lineAt = (pose: { x: number; y: number; angle: number }, length: number) => {
    const rad = (pose.angle * Math.PI) / 180;
    const nx = -Math.sin(rad);
    const ny = Math.cos(rad);
    return { x1: pose.x - (nx * length) / 2, y1: pose.y - (ny * length) / 2, x2: pose.x + (nx * length) / 2, y2: pose.y + (ny * length) / 2 };
  };
  const startLine = lineAt(start, 16);
  const s1 = lineAt(sector1, 10);
  const s2 = lineAt(sector2, 10);

  return (
    <div className={`track-map ${compact ? "compact" : ""}`}>
      <svg viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`} role="img" aria-label={`Traçado de ${circuit.nome}`}>
        <defs>
          <filter id="marker-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#000" floodOpacity="0.7" />
          </filter>
        </defs>
        <path d={track.svgPath} fill="none" stroke="#242c3b" strokeWidth={compact ? 16 : 19} strokeLinejoin="round" strokeLinecap="round" />
        <path d={track.svgPath} fill="none" stroke="#3b465a" strokeWidth={compact ? 10 : 12} strokeLinejoin="round" strokeLinecap="round" />
        <path d={track.svgPath} fill="none" stroke="#0d1119" strokeWidth={compact ? 7 : 8.5} strokeLinejoin="round" strokeLinecap="round" />
        {showPit && <path d={track.pitPath} fill="none" stroke="#b98a3e" strokeWidth={compact ? 3 : 4} strokeDasharray="5 4" strokeLinecap="round" opacity="0.95" />}
        <line x1={startLine.x1} y1={startLine.y1} x2={startLine.x2} y2={startLine.y2} stroke="#e8edf7" strokeWidth={compact ? 2 : 3} />
        <line x1={s1.x1} y1={s1.y1} x2={s1.x2} y2={s1.y2} stroke="#7f8da8" strokeWidth="1.5" opacity="0.8" />
        <line x1={s2.x1} y1={s2.y1} x2={s2.x2} y2={s2.y2} stroke="#7f8da8" strokeWidth="1.5" opacity="0.8" />
        {!compact && (
          <>
            <text x={start.x + 8} y={start.y - 6} fontSize="7" fill="#cfd6e4">
              LARGADA
            </text>
            <text x={sector1.x + 5} y={sector1.y + 9} fontSize="6" fill="#7f8da8">
              S1
            </text>
            <text x={sector2.x + 5} y={sector2.y + 9} fontSize="6" fill="#7f8da8">
              S2
            </text>
          </>
        )}
        {cars.map((car) => {
          const team = TEAM_BY_ID[car.teamId];
          const inPit = car.pit?.state != null && car.pit.state !== "none";
          const laneShift = hashLane(car.driverId) + (car.lane ?? 0) * 2.2;
          const pose = inPit ? pitPoseAt(track, car.distance) : poseAt(track, car.distance, laneShift);
          const x = pose.x;
          const y = pose.y;
          const selected = car.driverId === selectedDriverId;
          const mine = highlightTeams.includes(car.teamId);
          return (
            <g
              key={car.driverId}
              transform={`translate(${x} ${y})`}
              className="car-marker"
              onClick={() => onSelect?.(car.driverId)}
              style={{ cursor: onSelect ? "pointer" : "default" }}
            >
              <title>{`${car.position}º · ${car.driverId}`}</title>
              {selected && <circle r={compact ? 8 : 9.5} fill="none" stroke="#ffe08a" strokeWidth="2" />}
              {car.status === "retired" ? (
                <circle r={compact ? 2.6 : 3.2} fill="#444b5b" stroke="#0b0e14" strokeWidth="1" opacity="0.8" />
              ) : (
                <circle
                  r={compact ? 3.6 : 5.2}
                  fill={team?.corPrimaria ?? "#aaa"}
                  stroke={mine ? "#ffffff" : selected ? "#ffe08a" : "#0a0d13"}
                  strokeWidth={mine ? 1.8 : 1.1}
                  filter="url(#marker-shadow)"
                  opacity={car.status === "finished" ? 0.75 : 1}
                />
              )}
              {!compact && car.status !== "retired" && (
                <text y="1.8" textAnchor="middle" fontSize="4.4" fontWeight="700" fill={isLight(team?.corPrimaria) ? "#101318" : "#ffffff"} pointerEvents="none">
                  {car.position}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {!compact && (
        <div className="track-legend">
          <span><i className="legend-line" /> Traçado</span>
          <span><i className="legend-line pit" /> Pit lane</span>
          {highlightTeams.length > 0 && <span><i className="legend-ring" /> Sua equipe</span>}
        </div>
      )}
    </div>
  );
}

function hashLane(driverId: string): number {
  let h = 0;
  for (let i = 0; i < driverId.length; i++) h = (h * 31 + driverId.charCodeAt(i)) >>> 0;
  return ((h % 7) - 3) * 1.15;
}

function isLight(hex: string | undefined): boolean {  if (!hex) return false;
  const v = hex.replace("#", "");
  if (v.length !== 6) return false;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}
