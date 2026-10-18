/**
 * Resolve a mídia local da temporada 2026.
 *
 * Os retratos e logos oficiais ficam em `public/local-media`, fora do
 * versionamento Git. Os IDs abaixo são os identificadores estáveis usados pelo
 * motor e pelos dados da temporada; nomes exibidos nunca são usados como chave.
 *
 * O manifest original do FM26 é copiado junto dos arquivos para preservar a
 * origem, a licença e a autorização de uso privado de cada recurso.
 */

const MEDIA_BASE = `${import.meta.env.BASE_URL}local-media`;

export const DRIVER_MEDIA_IDS = [
  "driver_lando_norris",
  "driver_oscar_piastri",
  "driver_george_russell",
  "driver_kimi_antonelli",
  "driver_max_verstappen",
  "driver_isack_hadjar",
  "driver_charles_leclerc",
  "driver_lewis_hamilton",
  "driver_alexander_albon",
  "driver_carlos_sainz",
  "driver_liam_lawson",
  "driver_arvid_lindblad",
  "driver_fernando_alonso",
  "driver_lance_stroll",
  "driver_esteban_ocon",
  "driver_oliver_bearman",
  "driver_nico_hulkenberg",
  "driver_gabriel_bortoleto",
  "driver_pierre_gasly",
  "driver_franco_colapinto",
  "driver_valtteri_bottas",
  "driver_sergio_p_rez",
] as const;

export const TEAM_MEDIA_IDS = [
  "team_mclaren",
  "team_mercedes",
  "team_red_bull",
  "team_ferrari",
  "team_aston_martin",
  "team_audi",
  "team_williams",
  "team_alpine",
  "team_racing_bulls",
  "team_cadillac",
  "team_haas",
] as const;

const DRIVER_MEDIA_ID_SET: ReadonlySet<string> = new Set(DRIVER_MEDIA_IDS);
const TEAM_MEDIA_ID_SET: ReadonlySet<string> = new Set(TEAM_MEDIA_IDS);

/**
 * Dois IDs da biblioteca externa usam grafia diferente da chave estável do FM26.
 * O elenco atual já usa os IDs da mídia, mas os aliases mantêm a compatibilidade
 * caso esses pilotos sejam adicionados futuramente.
 */
const DRIVER_MEDIA_ALIASES: Record<string, string> = {
  driver_alex_albon: "driver_alexander_albon",
  driver_sergio_perez: "driver_sergio_p_rez",
};

export const mediaManifestPath = `${MEDIA_BASE}/manifest.json`;

export function driverMediaId(driverId: string): string | null {
  const stableId = DRIVER_MEDIA_ALIASES[driverId] ?? driverId;
  return DRIVER_MEDIA_ID_SET.has(stableId) ? stableId : null;
}

export function driverPortraitPath(driverId: string): string | null {
  const mediaId = driverMediaId(driverId);
  return mediaId ? `${MEDIA_BASE}/drivers/${mediaId}.png` : null;
}

export function teamLogoPath(teamId: string): string | null {
  return TEAM_MEDIA_ID_SET.has(teamId) ? `${MEDIA_BASE}/teams/${teamId}.svg` : null;
}
