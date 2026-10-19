import React from "react";
import type { Compound, TyreState } from "../engine/types";
import { COMPOUNDS } from "../engine/tyres";
import { DRIVER_BY_ID, TEAM_BY_ID } from "../data/season2026";
import { DriverPortrait, TeamLogo, type MediaSize } from "./Media";
import { CountryFlag } from "./Visuals";

export function Button({
  children,
  variant = "subtle",
  size,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "subtle" | "ghost" | "danger" | "success"; size?: "small" | "normal" }) {
  return (
    <button className={`btn btn-${variant} ${size === "small" ? "btn-small" : ""} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <header className="panel-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p className="panel-sub">{subtitle}</p>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Bar({ value, max = 100, color = "#6ea8fe", label }: { value: number; max?: number; color?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="bar-wrap" title={label ?? `${value.toFixed(0)}`}>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      {label && <span className="bar-label">{label}</span>}
    </div>
  );
}

export function TyreBadge({ compound, wear, age }: { compound: Compound; wear?: number; age?: number }) {
  const spec = COMPOUNDS[compound];
  return (
    <span className="tyre-badge" title={`${spec.nome}${wear != null ? ` · desgaste ${wear.toFixed(0)}%` : ""}`}>
      <span className="tyre-dot" style={{ borderColor: spec.cor, color: spec.cor }}>
        {spec.sigla}
      </span>
      {age != null && <span className="tyre-age">{age}V</span>}
      {wear != null && <span className="tyre-wear">{Math.round(wear)}%</span>}
    </span>
  );
}

export function TeamDot({ teamId, size = 8 }: { teamId: string; size?: number }) {
  const team = TEAM_BY_ID[teamId];
  return <span className="team-dot" style={{ background: team?.corPrimaria ?? "#888", width: size, height: size }} />;
}

export function TeamName({ teamId, logo = true, size = "xs" }: { teamId: string; logo?: boolean; size?: MediaSize }) {
  return (
    <span className="team-name">
      {logo ? <TeamLogo teamId={teamId} size={size} decorative /> : <TeamDot teamId={teamId} />}
      {TEAM_BY_ID[teamId]?.nome ?? teamId}
    </span>
  );
}

export function DriverLabel({
  driverId,
  team = true,
  portrait = true,
  portraitSize = "xs",
}: {
  driverId: string;
  team?: boolean;
  portrait?: boolean;
  portraitSize?: MediaSize;
}) {
  const d = DRIVER_BY_ID[driverId];
  if (!d) return <span>{driverId.replace(/_/g, " ")}</span>;
  return (
    <span className="driver-label">
      {portrait && <DriverPortrait driverId={driverId} size={portraitSize} decorative />}
      <CountryFlag country={d.nacionalidade} className="driver-flag" />
      {team && <TeamDot teamId={d.equipeId} />}
      <span className="driver-code">{d.codigo}</span>
      <span className="driver-full">{d.nome}</span>
    </span>
  );
}

export function money(value: number): string {
  if (Math.abs(value) < 0.005) return "0.00 mi";
  const sign = value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(2)} mi`;
}

export function delta(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value <= 0.0005) return "—";
  return `+${value.toFixed(3)}s`;
}

export function ordinal(n: number): string {
  return `${n}º`;
}

export function statusLabel(status: string): string {
  return { running: "Em pista", finished: "Classificado", retired: "Abandonou" }[status] ?? status;
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "info" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function StatRow({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="stat-row">
      <span>{label}</span>
      <strong style={accent ? { color: accent } : undefined}>{value}</strong>
    </div>
  );
}

export function TyrePill({ tyre }: { tyre: TyreState }) {
  return <TyreBadge compound={tyre.compound} wear={tyre.wear} age={tyre.ageLaps} />;
}

export function useInterval(callback: () => void, delay: number | null) {
  const ref = React.useRef(callback);
  ref.current = callback;
  React.useEffect(() => {
    if (delay == null) return;
    const id = setInterval(() => ref.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}
