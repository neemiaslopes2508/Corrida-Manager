#!/usr/bin/env node
/**
 * Inicia o servidor autoritativo e um Cloudflare Quick Tunnel.
 * Uso: npm run online
 *
 * Requer o build do cliente (o script npm já executa npm run build).
 * O binário cloudflared é baixado automaticamente para tools/ se não existir.
 */
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { chmod, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { WebSocket } from "ws";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.env.PORT ?? 8787);
const LOCAL_URL = `http://127.0.0.1:${PORT}`;
const TOOLS = path.join(ROOT, "tools");
const DATA = path.join(ROOT, "data");
const DIST = path.join(ROOT, "dist", "index.html");

const isWindows = process.platform === "win32";
const binName = isWindows ? "cloudflared.exe" : "cloudflared";
const localBin = path.join(TOOLS, binName);

let serverProcess = null;
let tunnelProcess = null;
let shuttingDown = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function log(message) {
  console.log(message);
}

/** Abre o link público no navegador padrão quando o iniciador solicita. */
function openBrowser(url) {
  try {
    const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", () => undefined);
    child.unref();
  } catch {
    // abrir o navegador é opcional; nunca deve impedir o servidor de subir
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    unlinkSync(path.join(DATA, "public-url.txt"));
  } catch {
    // ignore
  }
  for (const child of [tunnelProcess, serverProcess]) {
    if (!child || child.killed) continue;
    try {
      child.kill();
    } catch {
      // ignore
    }
  }
  setTimeout(() => process.exit(code), 400);
}

process.on("SIGINT", () => {
  log("\nEncerrando servidor e túnel...");
  shutdown(0);
});
process.on("SIGTERM", () => shutdown(0));

async function isServerAlreadyRunning() {
  try {
    const res = await fetch(`${LOCAL_URL}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForLocalServer(timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerAlreadyRunning()) return;
    await sleep(250);
  }
  throw new Error("O servidor local não respondeu em /api/health.");
}

function cloudflaredDownloadUrl() {
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  if (process.platform === "win32") return `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-${arch}.exe`;
  if (process.platform === "darwin") return `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-${arch}`;
  return `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}`;
}

async function commandExists(command, args = ["--version"]) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore", shell: false });
    const timer = setTimeout(() => {
      child.kill();
      resolve(false);
    }, 3000);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

async function ensureCloudflared() {
  if (process.env.CLOUDFLARED_PATH) {
    if (!existsSync(process.env.CLOUDFLARED_PATH)) throw new Error(`CLOUDFLARED_PATH não encontrado: ${process.env.CLOUDFLARED_PATH}`);
    return process.env.CLOUDFLARED_PATH;
  }
  if (await commandExists("cloudflared")) return "cloudflared";
  if (existsSync(localBin)) return localBin;

  mkdirSync(TOOLS, { recursive: true });
  const tmp = `${localBin}.download`;
  const url = cloudflaredDownloadUrl();
  log(`Baixando cloudflared (uma vez, ~55 MB): ${url}`);
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(180_000) });
  if (!res.ok || !res.body) throw new Error(`Falha ao baixar cloudflared (${res.status}). Instale manualmente e defina CLOUDFLARED_PATH.`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  await rm(localBin, { force: true });
  await rename(tmp, localBin);
  if (!isWindows) await chmod(localBin, 0o755);
  log(`cloudflared salvo em ${localBin}`);
  return localBin;
}

function startServer() {
  const tsx = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  if (!existsSync(tsx)) throw new Error("tsx não encontrado. Rode npm install.");
  const env = { ...process.env, PORT: String(PORT), HOST: process.env.HOST ?? "0.0.0.0" };
  serverProcess = spawn(process.execPath, [tsx, path.join(ROOT, "server", "index.ts")], {
    cwd: ROOT,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  serverProcess.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`Servidor encerrou inesperadamente (código ${code}).`);
      shutdown(code ?? 1);
    }
  });
}

async function startTunnel() {
  const binary = await ensureCloudflared();
  const args = ["tunnel", "--url", LOCAL_URL, "--no-autoupdate"];
  const protocol = process.env.CLOUDFLARED_PROTOCOL;
  if (protocol) args.push("--protocol", protocol);
  log(`Abrindo Cloudflare Quick Tunnel para ${LOCAL_URL}... (pode levar até 30s)`);

  tunnelProcess = spawn(binary, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const seen = new Set();
  let resolved = false;
  let resolveUrl;
  let rejectUrl;
  const urlPromise = new Promise((resolve, reject) => {
    resolveUrl = resolve;
    rejectUrl = reject;
  });

  const onData = (chunk) => {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/trycloudflare\.com/i.test(trimmed) || /error|failed|registered tunnel|connection/i.test(trimmed)) {
        if (!seen.has(trimmed)) {
          seen.add(trimmed);
          console.log(`[túnel] ${trimmed}`);
        }
      }
      const match = trimmed.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match && !resolved) {
        resolved = true;
        resolveUrl(match[0]);
      }
    }
  };
  tunnelProcess.stdout?.on("data", onData);
  tunnelProcess.stderr?.on("data", onData);
  tunnelProcess.on("error", (err) => rejectUrl(err));
  tunnelProcess.on("exit", (code) => {
    if (!resolved) rejectUrl(new Error(`cloudflared encerrou antes de criar o túnel (código ${code}).`));
    else if (!shuttingDown) {
      console.error(`\nO túnel público foi encerrado (código ${code}). O link deixa de funcionar.`);
      shutdown(code ?? 1);
    }
  });

  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Tempo esgotado aguardando a URL do Cloudflare Quick Tunnel.")), 60_000));
  return Promise.race([urlPromise, timeout]);
}

async function waitForPublicHttp(publicUrl, timeoutMs = 90_000) {
  const start = Date.now();
  let lastError = "";
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${publicUrl}/api/health`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await sleep(1500);
  }
  throw new Error(`Túnel criado, mas o health público não respondeu: ${lastError}`);
}

async function checkPublicWebSocket(publicUrl) {
  const wsUrl = `${publicUrl.replace(/^http/, "ws")}/ws`;
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { headers: { Origin: publicUrl } });
    const timer = setTimeout(() => {
      try {
        ws.terminate();
      } catch {
        // ignore
      }
      reject(new Error("WSS público não respondeu ao ping em 12s."));
    }, 12_000);
    ws.on("open", () => ws.send(JSON.stringify({ type: "ping" })));
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === "pong") {
          clearTimeout(timer);
          ws.close();
          resolve();
        }
      } catch {
        // ignore
      }
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function main() {
  if (!existsSync(DIST)) {
    console.error("Build do cliente não encontrado. Rode: npm run build");
    process.exit(1);
  }
  if (await isServerAlreadyRunning()) {
    console.error(`A porta ${PORT} já responde em ${LOCAL_URL}. Pare o processo existente ou use PORT=outra.`);
    process.exit(1);
  }

  try {
    unlinkSync(path.join(DATA, "public-url.txt"));
  } catch {
    // sem link antigo para limpar
  }

  startServer();
  await waitForLocalServer();
  const publicUrl = await startTunnel();
  log("\n" + "=".repeat(64));
  log("  CORRIDA MANAGER — MULTIPLAYER ONLINE");
  log("=".repeat(64));
  log(`  Link público: ${publicUrl}`);
  log("  Este é o link que você compartilha com os jogadores.");
  log("  A página usa HTTPS e o WebSocket usa WSS automaticamente.");
  log("=".repeat(64) + "\n");

  mkdirSync(DATA, { recursive: true });
  writeFileSync(path.join(DATA, "public-url.txt"), `${publicUrl}\n`, "utf8");

  try {
    await waitForPublicHttp(publicUrl);
    log("HTTP público validado.");
    await checkPublicWebSocket(publicUrl);
    log("WSS público validado (handshake + ping/pong).");
  } catch (err) {
    console.error(`Aviso: validação pública incompleta: ${err instanceof Error ? err.message : err}`);
  }

  if (process.env.CM_OPEN_BROWSER === "public") {
    log(`Abrindo o jogo no navegador: ${publicUrl}`);
    openBrowser(publicUrl);
  }

  log("\nInstruções:");
  log("  1. Abra o link público e crie a sala.");
  log("  2. Envie o link e o código de 5 caracteres aos jogadores.");
  log("  3. Cada jogador escolhe uma equipe, marca Pronto; o host inicia.");
  log("  Mantenha este terminal aberto. Ctrl+C encerra servidor e túnel.");
  log("  Quick Tunnel é temporário: o link muda ao reiniciar.");
  log("  Se o link não abrir de imediato, aguarde 1–2 min (propagação DNS do Quick Tunnel).\n");
}

main().catch((err) => {
  console.error(`\nFalha ao iniciar online: ${err instanceof Error ? err.message : err}`);
  shutdown(1);
});
