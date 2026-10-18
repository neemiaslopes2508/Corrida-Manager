import type { ClientMessage, ServerMessage } from "./protocol";

/**
 * Resolve a URL do WebSocket sempre a partir da origem em que a página foi aberta.
 * Assim, LAN (http/ws), localhost e Cloudflare Tunnel (https/wss) funcionam sem
 * configuração específica. VITE_WS_URL é apenas um escape hatch opcional.
 */
export function resolveWsUrl(): string {
  const configured = (import.meta.env.VITE_WS_URL as string | undefined)?.trim();
  if (configured) {
    if (location.protocol === "https:" && configured.startsWith("ws://")) return `wss://${configured.slice(5)}`;
    return configured;
  }
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/ws`;
}

export class MPClient {
  private ws: WebSocket | null = null;
  private closedByUser = false;
  private reconnectTimer: number | null = null;
  private connectTimer: number | null = null;
  private attempts = 0;
  private queue: ClientMessage[] = [];
  private visibilityHandler: (() => void) | null = null;

  constructor(
    private onMessage: (msg: ServerMessage) => void,
    private onStatus: (connected: boolean, error?: string) => void,
  ) {
    if (typeof document !== "undefined") {
      this.visibilityHandler = () => {
        if (document.visibilityState === "visible" && !this.closedByUser && !this.isOpen()) this.connect();
      };
      document.addEventListener("visibilitychange", this.visibilityHandler);
    }
  }

  private isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const url = resolveWsUrl();
    try {
      this.ws = new WebSocket(url);
    } catch (error) {
      this.scheduleReconnect(error instanceof Error ? error.message : "Falha ao abrir WebSocket");
      return;
    }

    // túneis podem demorar; se o handshake não completar, força nova tentativa
    this.connectTimer = window.setTimeout(() => {
      if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
        try {
          this.ws.close();
        } catch {
          // ignore
        }
      }
    }, 15_000);

    this.ws.onopen = () => {
      this.attempts = 0;
      if (this.connectTimer != null) window.clearTimeout(this.connectTimer);
      this.onStatus(true);
      // As mensagens enfileiradas saem somente depois do onStatus, que pode
      // enviar o token de reconexão antes dos comandos pendentes.
      for (const msg of this.queue.splice(0)) this.send(msg);
    };
    this.ws.onmessage = (event) => {
      try {
        this.onMessage(JSON.parse(event.data) as ServerMessage);
      } catch {
        // mensagem inválida é ignorada
      }
    };
    this.ws.onclose = () => {
      if (this.connectTimer != null) window.clearTimeout(this.connectTimer);
      this.ws = null;
      this.onStatus(false);
      if (!this.closedByUser) this.scheduleReconnect();
    };
    this.ws.onerror = () => {
      this.onStatus(false, "Não foi possível conectar ao servidor. O host/túnel está ativo?");
    };
  }

  private scheduleReconnect(reason?: string): void {
    if (this.closedByUser || this.reconnectTimer != null) return;
    this.attempts += 1;
    const base = Math.min(15_000, 1000 * 2 ** Math.min(this.attempts, 4));
    const delay = Math.round(base * (0.8 + Math.random() * 0.4));
    if (reason) this.onStatus(false, reason);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      // evita fila ilimitada em caso de host desligado
      if (this.queue.length < 50) this.queue.push(msg);
      this.connect();
    }
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer != null) window.clearTimeout(this.reconnectTimer);
    if (this.connectTimer != null) window.clearTimeout(this.connectTimer);
    this.reconnectTimer = null;
    this.connectTimer = null;
    this.queue = [];
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    this.ws = null;
    if (this.visibilityHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
    }
    this.visibilityHandler = null;
  }
}
