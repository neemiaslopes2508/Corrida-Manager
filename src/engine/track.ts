import type { CircuitData } from "../data/season2026";
import { TRACK_GEOMETRY } from "../data/tracks/geometry";

export interface TrackSample {
  x: number;
  y: number;
  dist: number;
  curvature: number;
  speed: number; // m/s de referência
  straight: number; // 0 curva lenta, 1 reta
}

export interface TrackModel {
  key: string;
  circuitId: string;
  width: number;
  height: number;
  length: number;
  samples: TrackSample[];
  viewPoints: { x: number; y: number }[];
  svgPath: string;
  pitPath: string;
  pitEntry: number;
  pitExit: number;
  pitSpan: number;
  sectorDistance: [number, number];
  center: { x: number; y: number };
}

const cache = new Map<string, TrackModel>();

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function buildSmooth(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    for (let s = 0; s < 14; s++) {
      const t = s / 14;
      out.push({ x: catmull(p0.x, p1.x, p2.x, p3.x, t), y: catmull(p0.y, p1.y, p2.y, p3.y, t) });
    }
  }
  out.push({ ...out[0] });
  return out;
}

export function buildTrack(circuit: CircuitData): TrackModel {
  const cached = cache.get(circuit.trackKey);
  if (cached) return cached;

  const geo = TRACK_GEOMETRY[circuit.trackKey];
  const raw = geo.points.map(([x, y]) => ({ x, y }));
  const smooth = buildSmooth(raw);
  const n = smooth.length;

  // comprimento no espaço normalizado
  const seg: number[] = [0];
  let normLength = 0;
  for (let i = 1; i < n; i++) {
    normLength += Math.hypot(smooth[i].x - smooth[i - 1].x, smooth[i].y - smooth[i - 1].y);
    seg.push(normLength);
  }

  const NUM = 1400;
  const step = normLength / NUM;
  const samples: TrackSample[] = [];
  let j = 0;
  for (let i = 0; i < NUM; i++) {
    const target = i * step;
    while (j < n - 2 && seg[j + 1] < target) j++;
    const t = (target - seg[j]) / Math.max(1e-9, seg[j + 1] - seg[j]);
    const x = smooth[j].x + (smooth[j + 1].x - smooth[j].x) * t;
    const y = smooth[j].y + (smooth[j + 1].y - smooth[j].y) * t;
    samples.push({ x, y, dist: (i / NUM) * circuit.comprimentoM, curvature: 0, speed: 0, straight: 1 });
  }

  // curvatura suavizada
  for (let i = 0; i < NUM; i++) {
    const a = samples[(i - 3 + NUM) % NUM];
    const b = samples[i];
    const c = samples[(i + 3) % NUM];
    const v1x = b.x - a.x;
    const v1y = b.y - a.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    const ang = Math.abs(Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y));
    const dsNorm = (3 / NUM) * normLength;
    const k = ang / Math.max(1e-6, dsNorm * (circuit.comprimentoM / normLength)); // 1/m reais
    samples[i].curvature = k;
  }
  const smoothK = samples.map((s, i) => {
    let acc = 0;
    let w = 0;
    for (let d = -4; d <= 4; d++) {
      acc += samples[(i + d + NUM) % NUM].curvature;
      w++;
    }
    return acc / w;
  });
  samples.forEach((s, i) => {
    s.curvature = smoothK[i];
  });

  // velocidade base: perfil viável com limites de frenagem e aceleração
  const latAccel = 22;
  const vmax = circuit.trackKey === "suzuka" ? 87 : circuit.trackKey === "shanghai" ? 90 : 88;
  for (const s of samples) {
    s.speed = Math.min(vmax, Math.sqrt(latAccel / Math.max(s.curvature, 0.00035)));
    s.speed = Math.max(15, s.speed);
    s.straight = Math.max(0, Math.min(1, 1 - s.curvature / 0.03));
  }
  const ds = circuit.comprimentoM / NUM;
  const N = samples.length;
  for (let pass = 0; pass < 3; pass++) {
    // frenagem: olhando para trás
    for (let step = 0; step < N * 2; step++) {
      const i = N - 1 - (step % N);
      const next = samples[(i + 1) % N];
      const limit = Math.sqrt(next.speed * next.speed + 2 * 24 * ds);
      if (samples[i].speed > limit) samples[i].speed = limit;
    }
    // aceleração: olhando para frente
    for (let i = 0; i < N * 2; i++) {
      const cur = samples[i % N];
      const nxt = samples[(i + 1) % N];
      const limit = Math.sqrt(cur.speed * cur.speed + 2 * 8.8 * ds);
      if (nxt.speed > limit) nxt.speed = limit;
    }
  }
  let lapEstimate = 0;
  for (const s of samples) lapEstimate += ds / s.speed;
  const correction = lapEstimate / circuit.baseLapTime;
  for (const s of samples) s.speed = Math.max(12, s.speed * correction);

  // caminho SVG (pontos suavizados reduzidos)
  const viewPoints = smooth.filter((_, i) => i % 4 === 0).map((p) => ({ x: p.x, y: p.y }));
  const svgPath =
    viewPoints
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ") + " Z";

  // pit lane: deslocamento interno entre 95% e 102,5% da volta
  const pitEntry = circuit.comprimentoM * 0.955;
  const pitExit = circuit.comprimentoM * 1.025;
  const center = viewPoints.reduce((a, p) => ({ x: a.x + p.x / viewPoints.length, y: a.y + p.y / viewPoints.length }), { x: 0, y: 0 });
  const pitStride = Math.max(1, Math.floor(NUM / 90));
  const pitPts: { x: number; y: number }[] = [];
  const startIdx = Math.floor((pitEntry / circuit.comprimentoM) * NUM);
  const endIdx = startIdx + Math.floor((0.07 * circuit.comprimentoM) / ds);
  for (let idx = startIdx; idx <= endIdx; idx += pitStride) {
    const s = samples[idx % NUM];
    const nx = s.y - center.y;
    const ny = -(s.x - center.x);
    const len = Math.hypot(nx, ny) || 1;
    pitPts.push({ x: s.x + (nx / len) * 9, y: s.y + (ny / len) * 9 });
  }
  const pitPath = pitPts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");

  const model: TrackModel = {
    key: circuit.trackKey,
    circuitId: circuit.id,
    width: geo.width,
    height: geo.height,
    length: circuit.comprimentoM,
    samples,
    viewPoints,
    svgPath,
    pitPath,
    pitEntry,
    pitExit,
    pitSpan: pitExit - pitEntry,
    sectorDistance: [circuit.comprimentoM / 3, (circuit.comprimentoM * 2) / 3],
    center,
  };
  cache.set(circuit.trackKey, model);
  return model;
}

export function wrapDistance(distance: number, length: number): number {
  return ((distance % length) + length) % length;
}

export function sampleAt(track: TrackModel, distance: number): TrackSample {
  const d = wrapDistance(distance, track.length);
  const idx = Math.floor((d / track.length) * track.samples.length) % track.samples.length;
  return track.samples[idx];
}

export function poseAt(track: TrackModel, distance: number, laneOffset = 0): { x: number; y: number; angle: number } {
  const d = wrapDistance(distance, track.length);
  const f = (d / track.length) * track.samples.length;
  const i = Math.floor(f) % track.samples.length;
  const j = (i + 1) % track.samples.length;
  const t = f - Math.floor(f);
  const a = track.samples[i];
  const b = track.samples[j];
  const x = a.x + (b.x - a.x) * t;
  const y = a.y + (b.y - a.y) * t;
  const angle = Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI);
  const nx = -(b.y - a.y);
  const ny = b.x - a.x;
  const len = Math.hypot(nx, ny) || 1;
  return { x: x + (nx / len) * laneOffset, y: y + (ny / len) * laneOffset, angle };
}

export function pitPoseAt(track: TrackModel, distance: number): { x: number; y: number } {
  const p = Math.max(0, Math.min(1, (distance - track.pitEntry) / track.pitSpan));
  const s = sampleAt(track, track.pitEntry + p * track.pitSpan);
  const nx = s.y - track.center.y;
  const ny = -(s.x - track.center.x);
  const len = Math.hypot(nx, ny) || 1;
  return { x: s.x + (nx / len) * 9, y: s.y + (ny / len) * 9 };
}

export function sectorOf(track: TrackModel, distance: number): 1 | 2 | 3 {
  const d = wrapDistance(distance, track.length);
  if (d < track.sectorDistance[0]) return 1;
  if (d < track.sectorDistance[1]) return 2;
  return 3;
}

export function formatLapTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}

export function formatGap(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  if (seconds <= 0.0005) return "—";
  return `+${seconds.toFixed(3)}`;
}

export function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
