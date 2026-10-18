/** PRNG determinístico (mulberry32) com estado serializável. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface Rng {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  getState(): number;
}

export function createRng(seed: string | number, state?: number): Rng {
  let s = (state ?? (typeof seed === "number" ? seed >>> 0 : hashSeed(seed))) >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: <T,>(items: readonly T[]) => items[Math.floor(next() * items.length)],
    getState: () => s,
  };
}

export function seededPick<T>(seed: string, items: readonly T[]): T {
  return items[hashSeed(seed) % items.length];
}
