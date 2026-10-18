import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.CM_DATA_DIR
  ? path.resolve(process.env.CM_DATA_DIR)
  : path.resolve(process.cwd(), "data", "rooms");

export function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function fileFor(code: string): string {
  const safe = code.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return path.join(DATA_DIR, `${safe}.json`);
}

export function saveRoomFile(room: unknown, code: string): void {
  ensureDataDir();
  const file = fileFor(code);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(room), "utf8");
  fs.renameSync(tmp, file);
}

export function loadRoomFiles(): any[] {
  ensureDataDir();
  const out: any[] = [];
  for (const file of fs.readdirSync(DATA_DIR)) {
    if (!file.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")));
    } catch {
      // arquivo corrompido é ignorado; a sala pode ser recriada
    }
  }
  return out;
}

export function deleteRoomFile(code: string): void {
  try {
    fs.unlinkSync(fileFor(code));
  } catch {
    // ignore
  }
}
