import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";

const children = [];
function run(script, color) {
  const child = spawn(npm, ["run", script], {
    stdio: "inherit",
    shell: isWindows,
    env: script === "dev:server" ? { ...process.env, CM_ALLOW_ANY_ORIGIN: "1" } : process.env,
  });
  child.on("exit", (code) => {
    console.log(`[${script}] encerrado (código ${code}).`);
    shutdown();
  });
  children.push(child);
  return child;
}

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill();
      } catch {
        // ignore
      }
    }
  }
  setTimeout(() => process.exit(0), 300);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("Iniciando servidor autoritativo (8787) e cliente Vite (5173)...");
run("dev:server");
run("dev:web");
