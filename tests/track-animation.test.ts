import { describe, expect, it } from "vitest";
import { clampLaneShift, interpolateDistance, shouldSnapDistance } from "../src/ui/trackAnimation";

describe("animação do mapa V1.3.4", () => {
  it("interpola a distância sem extrapolar", () => {
    const animation = { from: 100, to: 200, startedAt: 1000, duration: 120 };
    expect(interpolateDistance(animation, 1000)).toBe(100);
    expect(interpolateDistance(animation, 1060)).toBeCloseTo(150, 5);
    expect(interpolateDistance(animation, 1200)).toBe(200);
    expect(interpolateDistance(animation, 900)).toBe(100);
  });

  it("faz snap em correção para trás ou salto maior que 12% da volta", () => {
    expect(shouldSnapDistance(100, 90, 5000)).toBe(true);
    expect(shouldSnapDistance(100, 800, 5000)).toBe(true);
    expect(shouldSnapDistance(100, 300, 5000)).toBe(false);
  });

  it("limita o deslocamento lateral à largura visual", () => {
    expect(clampLaneShift(10, false)).toBe(3.35);
    expect(clampLaneShift(-10, false)).toBe(-3.35);
    expect(clampLaneShift(10, true)).toBe(2.2);
    expect(clampLaneShift(1.5, true)).toBe(1.5);
  });
});
