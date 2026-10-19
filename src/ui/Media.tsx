import React, { useEffect, useState } from "react";
import { DRIVER_BY_ID, TEAM_BY_ID } from "../data/season2026";
import { circuitPhotoCredit, circuitPhotoPath, driverPortraitPath, teamLogoPath } from "../media/season2026";

export type MediaSize = "xs" | "sm" | "md" | "lg" | "xl" | "hero";

function useBrokenImage(src: string | null): [boolean, () => void] {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  return [broken, () => setBroken(true)];
}

export function DriverPortrait({
  driverId,
  size = "sm",
  className = "",
  decorative = false,
}: {
  driverId: string;
  size?: MediaSize;
  className?: string;
  decorative?: boolean;
}) {
  const driver = DRIVER_BY_ID[driverId];
  const src = driverPortraitPath(driverId);
  const [broken, markBroken] = useBrokenImage(src);
  const label = driver ? `Retrato de ${driver.nome}` : "Retrato indisponível";
  const initials = driver?.codigo ?? "?";

  return (
    <span className={`driver-portrait media-size-${size} ${className}`} title={driver?.nome}>
      {src && !broken ? (
        <img
          src={src}
          alt={decorative ? "" : label}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={markBroken}
        />
      ) : (
        <span className="portrait-fallback" role={decorative ? undefined : "img"} aria-label={decorative ? undefined : label}>
          {initials}
        </span>
      )}
    </span>
  );
}

export function TeamLogo({
  teamId,
  size = "sm",
  className = "",
  decorative = false,
}: {
  teamId: string;
  size?: MediaSize;
  className?: string;
  decorative?: boolean;
}) {
  const team = TEAM_BY_ID[teamId];
  const src = teamLogoPath(teamId);
  const [broken, markBroken] = useBrokenImage(src);
  const label = team ? `Logo ${team.nome}` : "Logo indisponível";

  return (
    <span className={`team-logo media-size-${size} ${className}`} title={team?.nome}>
      {src && !broken ? (
        <img
          src={src}
          alt={decorative ? "" : label}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={markBroken}
        />
      ) : (
        <span className="logo-fallback" role={decorative ? undefined : "img"} aria-label={decorative ? undefined : label}>
          {team?.sigla ?? "?"}
        </span>
      )}
    </span>
  );
}

export function CircuitPhoto({
  circuitId,
  className = "",
  showCredit = false,
}: {
  circuitId: string;
  className?: string;
  showCredit?: boolean;
}) {
  const src = circuitPhotoPath(circuitId);
  const credit = circuitPhotoCredit(circuitId);
  const [broken, markBroken] = useBrokenImage(src);
  return (
    <div className={`circuit-photo ${className}`}>
      {src && !broken ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={markBroken}
        />
      ) : (
        <span className="circuit-photo-fallback" aria-hidden="true">CIRCUIT</span>
      )}
      {showCredit && credit && (
        <span className="media-credit" title={`${credit.author} · ${credit.license}`}>
          Foto: {credit.author} · {credit.license}
        </span>
      )}
    </div>
  );
}
