import { describe, expect, test } from "vitest";
import { buildExportModel } from "./teams-image";
import type { Player } from "../types";

function makePlayer(name: string, elo: number): Player {
  return { id: name.toLowerCase(), name, skill: 3, baseElo: elo, elo, active: true };
}

const PREVIEW: Player[][] = [
  [
    makePlayer("Rubem", 1543),
    makePlayer("Joao", 1211),
    makePlayer("Caio", 1102),
    makePlayer("Bia", 944),
  ],
  [
    makePlayer("Ana", 1487),
    makePlayer("Pedro", 1266),
    makePlayer("Lucas", 1088),
    makePlayer("Duda", 959),
  ],
  [
    makePlayer("Marina", 1502),
    makePlayer("Tiago", 1233),
    makePlayer("Rafa", 1077),
    makePlayer("Nina", 931),
  ],
];

const DATE = new Date("2026-08-10T12:00:00");

describe("buildExportModel", () => {
  test("titles the image with the session date", () => {
    expect(buildExportModel(PREVIEW, DATE).title).toBe("Times · 10/08");
  });

  test("keeps the team names and their members in order", () => {
    const model = buildExportModel(PREVIEW, DATE);

    expect(model.teams.map((t) => t.name)).toEqual(["Time A", "Time B", "Time C"]);
    expect(model.teams[0].players).toEqual(["Rubem", "Joao", "Caio", "Bia"]);
    expect(model.teams[2].players).toEqual(["Marina", "Tiago", "Rafa", "Nina"]);
  });

  test("carries no Elo — the shared image cannot leak ratings", () => {
    const serialized = JSON.stringify(buildExportModel(PREVIEW, DATE));

    for (const player of PREVIEW.flat()) {
      expect(serialized).not.toContain(String(player.elo));
    }
  });

  test("exposes only name, colour and players per team", () => {
    const model = buildExportModel(PREVIEW, DATE);

    expect(Object.keys(model).sort()).toEqual(["teams", "title"]);
    for (const team of model.teams) {
      expect(Object.keys(team).sort()).toEqual(["color", "name", "players"]);
    }
  });
});
