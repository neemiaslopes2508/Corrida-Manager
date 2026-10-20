import { spawn } from "node:child_process";
import fs from "node:fs";

// Build estático para GitHub Pages: caminhos relativos e modo solo.
// O multiplayer continua disponível apenas com servidor Node/WebSocket.
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(npm, ["run", "build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    VITE_BASE: "./",
    VITE_STATIC_SOLO: "true",
  },
});

child.on("exit", (code) => {
  if (code === 0) {
    try {
      fs.writeFileSync("dist/.nojekyll", "");
    } catch {
      // o workflow também cria o arquivo; o build não deve falhar por isso
    }
  }
  process.exit(code ?? 1);
});
