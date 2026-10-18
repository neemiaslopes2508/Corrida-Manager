#!/usr/bin/env node
/**
 * Valida a mídia local privada antes de gerar um build.
 *
 * Confere o manifest copiado do FM26, os 22 retratos e os 11 logos, além de
 * dimensões PNG/SVG e a correspondência com os IDs estáveis da temporada.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const mediaDir = path.join(root, "public", "local-media");
const manifestPath = path.join(mediaDir, "manifest.json");
const dataPath = path.join(root, "src", "data", "season2026.ts");
const errors = [];
const fail = (message) => errors.push(message);

if (!fs.existsSync(manifestPath)) {
  console.error(`Manifest não encontrado: ${manifestPath}`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (error) {
  console.error(`Manifest inválido: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const source = fs.readFileSync(dataPath, "utf8");
const expectedDrivers = [...new Set([...source.matchAll(/\bid: "(driver_[^"]+)"/g)].map((match) => match[1]))];
const expectedTeams = [...new Set([...source.matchAll(/\bid: "(team_[^"]+)"/g)].map((match) => match[1]))];

if (expectedDrivers.length !== 22) fail(`Temporada tem ${expectedDrivers.length} pilotos; esperado 22.`);
if (expectedTeams.length !== 11) fail(`Temporada tem ${expectedTeams.length} equipes; esperado 11.`);

const drivers = manifest.filter((item) => item.kind === "driver");
const teams = manifest.filter((item) => item.kind === "team");
if (drivers.length !== 22) fail(`Manifest tem ${drivers.length} retratos; esperado 22.`);
if (teams.length !== 11) fail(`Manifest tem ${teams.length} logos; esperado 11.`);

const manifestDriverIds = new Set(drivers.map((item) => item.id));
const manifestTeamIds = new Set(teams.map((item) => item.id));
for (const id of expectedDrivers) if (!manifestDriverIds.has(id)) fail(`Retrato ausente no manifest: ${id}`);
for (const id of expectedTeams) if (!manifestTeamIds.has(id)) fail(`Logo ausente no manifest: ${id}`);
for (const id of manifestDriverIds) if (!expectedDrivers.includes(id)) fail(`Retrato sem piloto na temporada: ${id}`);
for (const id of manifestTeamIds) if (!expectedTeams.includes(id)) fail(`Logo sem equipe na temporada: ${id}`);

const seenIds = new Set();
for (const item of manifest) {
  if (!["driver", "team"].includes(item.kind)) fail(`Tipo desconhecido no manifest: ${item.kind}`);
  if (!item.id || seenIds.has(item.id)) fail(`ID ausente ou duplicado no manifest: ${item.id ?? "(vazio)"}`);
  seenIds.add(item.id);

  const relative = typeof item.file === "string" ? item.file.replaceAll("\\", "/") : "";
  if (!relative.startsWith(item.kind === "driver" ? "drivers/" : "teams/")) {
    fail(`Caminho de mídia inválido para ${item.id}: ${relative || "(vazio)"}`);
    continue;
  }
  const filePath = path.resolve(mediaDir, relative);
  if (!filePath.startsWith(path.resolve(mediaDir) + path.sep)) {
    fail(`Caminho fora da pasta de mídia: ${relative}`);
    continue;
  }
  if (!fs.existsSync(filePath)) {
    fail(`Arquivo ausente: ${relative}`);
    continue;
  }
  const bytes = fs.statSync(filePath).size;
  if (item.bytes && bytes !== item.bytes) fail(`Tamanho divergente em ${relative}: ${bytes} != ${item.bytes}`);

  if (item.kind === "driver") {
    const header = fs.readFileSync(filePath).subarray(0, 24);
    const pngSignature = "89504e470d0a1a0a";
    if (header.subarray(0, 8).toString("hex") !== pngSignature) {
      fail(`Retrato não é PNG válido: ${relative}`);
      continue;
    }
    const width = header.readUInt32BE(16);
    const height = header.readUInt32BE(20);
    if (width !== height || width <= 0) fail(`Retrato não quadrado: ${relative} (${width}x${height})`);
  } else {
    const svg = fs.readFileSync(filePath, "utf8");
    if (!svg.includes("<svg") || !svg.includes("viewBox=")) fail(`Logo SVG inválido: ${relative}`);
    if (/href=["']https?:/i.test(svg)) fail(`Logo com referência externa: ${relative}`);
  }
}

if (errors.length) {
  console.error(`Falha na validação de mídia (${errors.length}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`Mídia local OK: ${drivers.length}/22 retratos, ${teams.length}/11 logos, IDs e dimensões válidos.`);
