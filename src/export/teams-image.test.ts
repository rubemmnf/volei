import { describe, expect, test } from "vitest";
import { buildExportModel, buildSwapsExportModel, exportFilename } from "./teams-image";
import { suggestBalancedSwaps } from "../algorithm/suggest-balanced-swaps";
import { teamElo } from "../algorithm/elo";
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

  test("carries no team total — the print for the whole group hides the balance", () => {
    for (const team of buildExportModel(PREVIEW, DATE).teams) {
      expect(team.total).toBeUndefined();
    }
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

describe("buildSwapsExportModel", () => {
  test("keeps everything the teams-only image has", () => {
    const model = buildSwapsExportModel(PREVIEW, DATE);
    const teamsOnly = buildExportModel(PREVIEW, DATE);

    expect(model.title).toBe(teamsOnly.title);
    expect(model.teams.map(({ total, ...team }) => team)).toEqual(teamsOnly.teams);
    expect(model.swaps).toBeDefined();
  });

  test("shows each team total, so the group can discuss the trades", () => {
    const { teams } = buildSwapsExportModel(PREVIEW, DATE);

    expect(teams.map((team) => team.total)).toEqual(PREVIEW.map(teamElo));
  });

  test("carries every pair of teams, in reading order", () => {
    const { swaps } = buildSwapsExportModel(PREVIEW, DATE);

    expect(swaps!.map((pair) => [pair.x.name, pair.y.name])).toEqual([
      ["Time A", "Time B"],
      ["Time A", "Time C"],
      ["Time B", "Time C"],
    ]);
  });

  test("lists the same low-impact swaps the organizer sees on screen", () => {
    const { swaps } = buildSwapsExportModel(PREVIEW, DATE);

    expect(swaps![0].swaps).toEqual(
      suggestBalancedSwaps(PREVIEW[0], PREVIEW[1]).map((swap) => ({
        from: swap.fromX.name,
        to: swap.fromY.name,
        shift: swap.shift,
      })),
    );
  });

  test("carries no per-player Elo — only the team totals and the swap shifts", () => {
    const serialized = JSON.stringify(buildSwapsExportModel(PREVIEW, DATE));

    for (const player of PREVIEW.flat()) {
      expect(serialized).not.toContain(String(player.elo));
    }
  });

  test("leaves the teams-only model untouched", () => {
    const teamsOnly = buildExportModel(PREVIEW, DATE);

    expect(teamsOnly).not.toHaveProperty("swaps");
    for (const team of teamsOnly.teams) {
      expect(team).not.toHaveProperty("total");
    }
  });
});

describe("exportFilename", () => {
  test("names the teams-only image after the date", () => {
    expect(exportFilename(DATE)).toBe("times-10-08.png");
  });

  test("marks the variant that includes the swaps", () => {
    expect(exportFilename(DATE, true)).toBe("times-trocas-10-08.png");
  });
});
