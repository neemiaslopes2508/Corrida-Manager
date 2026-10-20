/**
 * Configuração de hospedagem estática (GitHub Pages).
 *
 * O modo solo não depende de servidor. O multiplayer continua exigindo o
 * servidor Node/WebSocket; em um build estático ele só é habilitado quando
 * VITE_WS_URL aponta para um servidor externo.
 */
const configuredWs = (import.meta.env.VITE_WS_URL as string | undefined)?.trim() ?? "";
const configuredApi = (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? "";

export const STATIC_SOLO = import.meta.env.VITE_STATIC_SOLO === "true";
export const MULTIPLAYER_AVAILABLE = !STATIC_SOLO || Boolean(configuredWs);
export const API_BASE = configuredApi.replace(/\/+$/, "");

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}
