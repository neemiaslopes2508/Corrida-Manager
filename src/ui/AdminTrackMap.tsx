import React, { useMemo } from "react";
import type { CircuitData } from "../data/season2026";
import { buildTrack, poseAt } from "../engine/track";

/**
 * Mapa editorial usado apenas nas telas administrativas.
 * Compartilha a geometria com o motor, mas tem renderização própria e decorativa.
 */
export function AdminTrackMap({ circuit, className = "" }: { circuit: CircuitData; className?: string }) {
  const track = useMemo(() => buildTrack(circuit), [circuit]);
  const bounds = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const point of track.viewPoints) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    const pad = 28;
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }, [track]);

  const start = poseAt(track, 0);
  const sector1 = poseAt(track, track.sectorDistance[0]);
  const sector2 = poseAt(track, track.sectorDistance[1]);
  const gradientId = `admin-track-line-${circuit.trackKey}`;
  const glowId = `admin-track-glow-${circuit.trackKey}`;
  const checkId = `admin-track-check-${circuit.trackKey}`;
  const gridId = `admin-track-grid-${circuit.trackKey}`;
  const washId = `admin-track-wash-${circuit.trackKey}`;
  const arcRadius = Math.max(bounds.w, bounds.h) * 0.43;

  return (
    <div className={`admin-track-map ${className}`} role="img" aria-label={`Traçado administrativo de ${circuit.nome}`}>
      <svg viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#d9ecff" />
            <stop offset="0.48" stopColor="#89c2ff" />
            <stop offset="1" stopColor="#b8a4ff" />
          </linearGradient>
          <radialGradient id={washId} cx="50%" cy="46%" r="58%">
            <stop offset="0" stopColor="#6ea8fe" stopOpacity="0.18" />
            <stop offset="0.72" stopColor="#6ea8fe" stopOpacity="0.03" />
            <stop offset="1" stopColor="#6ea8fe" stopOpacity="0" />
          </radialGradient>
          <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
          <pattern id={checkId} width="4" height="4" patternUnits="userSpaceOnUse">
            <rect width="2" height="2" fill="#f8fafc" />
            <rect x="2" y="2" width="2" height="2" fill="#f8fafc" />
            <rect x="2" width="2" height="2" fill="#1a2230" />
            <rect y="2" width="2" height="2" fill="#1a2230" />
          </pattern>
          <pattern id={gridId} width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.7" fill="#95b8e8" opacity="0.23" />
          </pattern>
        </defs>

        <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="transparent" />
        <circle cx={track.center.x} cy={track.center.y} r={arcRadius} fill="url(#washId)" />
        <circle cx={track.center.x} cy={track.center.y} r={arcRadius * 0.72} fill="none" stroke="#85a9d8" strokeWidth="0.7" strokeDasharray="2 8" opacity="0.18" />
        <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill={`url(#${gridId})`} opacity="0.62" />

        <path d={track.svgPath} fill="none" stroke="#0a0f17" strokeWidth="18" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
        <path d={track.svgPath} fill="none" stroke={`url(#${gradientId})`} strokeWidth="12" strokeLinejoin="round" strokeLinecap="round" opacity="0.22" filter={`url(#${glowId})`} />
        <path d={track.svgPath} fill="none" stroke="#3c5578" strokeWidth="8.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
        <path d={track.svgPath} fill="none" stroke={`url(#${gradientId})`} strokeWidth="4.4" strokeLinejoin="round" strokeLinecap="round" />
        <path d={track.svgPath} fill="none" stroke="#ffffff" strokeWidth="1.15" strokeLinejoin="round" strokeLinecap="round" opacity="0.64" />

        <path d={track.pitPath} fill="none" stroke="#0a0f17" strokeWidth="7" strokeLinecap="round" opacity="0.72" />
        <path d={track.pitPath} fill="none" stroke="#e0ad55" strokeWidth="2.7" strokeLinecap="round" strokeDasharray="4 5" opacity="0.78" />

        <g transform={`translate(${sector1.x} ${sector1.y})`}>
          <circle r="4.2" fill="#111a25" stroke="#7fa4d4" strokeWidth="1.2" />
          <text y="1.4" textAnchor="middle" fontSize="4.1" fill="#bcd4f2" fontWeight="700">1</text>
        </g>
        <g transform={`translate(${sector2.x} ${sector2.y})`}>
          <circle r="4.2" fill="#111a25" stroke="#7fa4d4" strokeWidth="1.2" />
          <text y="1.4" textAnchor="middle" fontSize="4.1" fill="#bcd4f2" fontWeight="700">2</text>
        </g>

        <g transform={`translate(${start.x} ${start.y}) rotate(${start.angle})`}>
          <rect x="-3" y="-11.5" width="6" height="23" rx="0.8" fill={`url(#${checkId})`} stroke="#ffffff" strokeWidth="1.1" />
        </g>
      </svg>
      <div className="admin-track-caption" aria-hidden="true">
        <span><i className="admin-track-key line" /> Traçado</span>
        <span><i className="admin-track-key sector" /> Setores</span>
        <span><i className="admin-track-key start" /> Largada</span>
        <span><i className="admin-track-key pit" /> Pit lane</span>
      </div>
    </div>
  );
}
