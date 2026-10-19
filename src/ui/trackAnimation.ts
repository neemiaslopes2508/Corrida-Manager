export interface DistanceAnimation {
  from: number;
  to: number;
  startedAt: number;
  duration: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Interpola a distância ao longo do traçado, nunca as coordenadas X/Y. */
export function interpolateDistance(animation: DistanceAnimation, now: number): number {
  if (animation.duration <= 0) return animation.to;
  const t = clamp01((now - animation.startedAt) / animation.duration);
  return animation.from + (animation.to - animation.from) * t;
}

/**
 * Saltos grandes, correções para trás ou reinício de sessão devem posicionar
 * o marcador imediatamente. É melhor um salto correto do que uma reta
 * atravessando o miolo do circuito.
 */
export function shouldSnapDistance(from: number, to: number, lapLength: number): boolean {
  const delta = to - from;
  if (delta < 0) return true;
  return delta > lapLength * 0.12;
}

/** Mantém o marcador dentro da largura visual do traçado, inclusive no compacto. */
export function clampLaneShift(shift: number, compact: boolean): number {
  const limit = compact ? 2.2 : 3.35;
  return Math.max(-limit, Math.min(limit, shift));
}
