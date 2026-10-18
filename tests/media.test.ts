import { describe, expect, it } from "vitest";
import { DRIVERS_2026, TEAMS_2026 } from "../src/data/season2026";
import {
  DRIVER_MEDIA_IDS,
  TEAM_MEDIA_IDS,
  driverMediaId,
  driverPortraitPath,
  teamLogoPath,
} from "../src/media/season2026";

describe("mídia local da temporada", () => {
  it("mapeia os 22 pilotos e 11 equipes por IDs estáveis", () => {
    expect(DRIVERS_2026).toHaveLength(22);
    expect(TEAMS_2026).toHaveLength(11);
    expect(new Set(DRIVER_MEDIA_IDS).size).toBe(22);
    expect(new Set(TEAM_MEDIA_IDS).size).toBe(11);

    for (const driver of DRIVERS_2026) {
      expect(driverPortraitPath(driver.id)).toBe(`/local-media/drivers/${driver.id}.png`);
    }
    for (const team of TEAMS_2026) {
      expect(teamLogoPath(team.id)).toBe(`/local-media/teams/${team.id}.svg`);
    }
  });

  it("mantém aliases da biblioteca externa sem depender do nome exibido", () => {
    expect(driverMediaId("driver_alex_albon")).toBe("driver_alexander_albon");
    expect(driverPortraitPath("driver_alex_albon")).toBe("/local-media/drivers/driver_alexander_albon.png");
    expect(driverMediaId("Lando Norris")).toBeNull();
  });

  it("retorna fallback para piloto ou equipe sem mídia", () => {
    expect(driverPortraitPath("driver_inexistente")).toBeNull();
    expect(teamLogoPath("team_inexistente")).toBeNull();
  });
});
