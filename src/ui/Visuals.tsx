import React, { useState } from "react";
import { countryFlagPath } from "../media/season2026";

const COUNTRY_FLAGS: Record<string, string> = {
  "Austrália": "🇦🇺",
  "China": "🇨🇳",
  "Japão": "🇯🇵",
  "Reino Unido": "🇬🇧",
  "Alemanha": "🇩🇪",
  "Países Baixos": "🇳🇱",
  "Tailândia": "🇹🇭",
  "Mônaco": "🇲🇨",
  "Espanha": "🇪🇸",
  "Canadá": "🇨🇦",
  "França": "🇫🇷",
  "México": "🇲🇽",
  "Finlândia": "🇫🇮",
  "Itália": "🇮🇹",
  "Nova Zelândia": "🇳🇿",
  "Brasil": "🇧🇷",
  "Estados Unidos": "🇺🇸",
  "Argentina": "🇦🇷",
};

export function flagForCountry(country: string): string {
  return COUNTRY_FLAGS[country] ?? "🏁";
}

export function CountryFlag({ country, className = "" }: { country: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  const src = countryFlagPath(country);
  return (
    <span className={`country-flag ${className}`} title={country} aria-label={country}>
      {src && !broken ? (
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
      ) : (
        <span aria-hidden="true">{flagForCountry(country)}</span>
      )}
    </span>
  );
}

export function WeatherIcon({ rain, className = "" }: { rain: number; className?: string }) {
  const kind = rain > 0.62 ? "storm" : rain > 0.2 ? "rain" : rain > 0.05 ? "drizzle" : "sun";
  const label = kind === "sun" ? "Seco" : kind === "drizzle" ? "Garoa" : kind === "rain" ? "Chuva" : "Chuva forte";
  return (
    <span className={`weather-icon weather-icon-${kind} ${className}`} title={label} role="img" aria-label={label}>
      {kind === "sun" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.2v2.1M12 19.7v2.1M2.2 12h2.1M19.7 12h2.1M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M19.1 4.9l-1.5 1.5M6.4 17.6l-1.5 1.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path className="cloud" d="M6.4 15.7h10.8a3.5 3.5 0 0 0 .2-7 5.2 5.2 0 0 0-9.9-1.5 3.7 3.7 0 0 0-1.1 8.5Z" />
          {kind === "drizzle" && <path className="rain" d="M8 18.2l-1 2M12 18.2l-1 2M16 18.2l-1 2" />}
          {kind === "rain" && <path className="rain" d="M7 18l-1.2 3M11 18l-1.2 3M15 18l-1.2 3M19 18l-1.2 3" />}
          {kind === "storm" && <path className="rain storm" d="M12 17.5l-3 5h3l-1.2 3.1 4.2-5.4h-3l1-2.7" />}
        </svg>
      )}
    </span>
  );
}

export function SprintIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={`sprint-icon ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13.7 2 5 13.1h5.5L9.3 22 19 9.8h-5.8L13.7 2Z" />
    </svg>
  );
}
