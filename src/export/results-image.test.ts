import { describe, expect, test } from "vitest";
import { buildResultsExportModel, resultsFilename } from "./results-image";
import type { Match, Player, Session } from "../types";

const NAMES = [
  "Rubem",
  "Joao",
  "Caio",
  "Bia",
  "Ana",
  "Pedro",
  "Lucas",
  "Duda",
  "Marina",
  "Tiago",
  "Rafa",
  "Nina",
];

const PLAYERS: Player[] = NAMES.map((name, i) => ({
  id: `p${i + 1}`,
  name,
  skill: 3,
  baseElo: 1500 - i * 37,
  elo: 1500 - i * 37,
  active: true,
}));

const TEAMS: Session["teams"] = [
  ["p1", "p2", "p3", "p4"],
  ["p5", "p6", "p7", "p8"],
  ["p9", "p10", "p11", "p12"],
];

function match(
  id: string,
  sideA: string[],
  sideB: string[],
  scoreA: number,
  scoreB: number,
): Match {
  return { id, sideA, sideB, scoreA, scoreB, timestamp: id };
}

function session(matches: Match[], balancingRounds = 0): Session {
  return { id: "s1", date: "2026-08-10", teams: TEAMS, matches, finished: true, balancingRounds };
}

/** Team A wins twice, team B once, team C never. */
const MATCHES = [
  match("m1", TEAMS[0], TEAMS[1], 25, 19),
  match("m2", TEAMS[2], TEAMS[0], 20, 25),
  match("m3", TEAMS[1], TEAMS[2], 25, 24),
];

describe("buildResultsExportModel", () => {
  test("titles the image with the session date", () => {
    const model = buildResultsExportModel(session(MATCHES), PLAYERS);

    expect(model.title).toBe("Resultado · 10/08");
  });

  test("subtitles it with how many matches were counted", () => {
    const model = buildResultsExportModel(session(MATCHES), PLAYERS);

    expect(model.subtitle).toBe("3 jogos");
  });

  test("says one game in the singular", () => {
    const model = buildResultsExportModel(session([MATCHES[0]]), PLAYERS);

    expect(model.subtitle).toBe("1 jogo");
  });

  test("crowns the team with the most wins, with its players", () => {
    const model = buildResultsExportModel(session(MATCHES), PLAYERS);

    expect(model.championLabel).toBe("CAMPEÃO");
    expect(model.champions).toHaveLength(1);
    expect(model.champions[0].name).toBe("Time A");
    expect(model.champions[0].players).toEqual(["Rubem", "Joao", "Caio", "Bia"]);
    expect(model.champions[0].record).toBe("2V · 0D · saldo +11");
  });

  test("breaks a tie on wins with the point difference", () => {
    // A and B win one each; A wins by 6, B by 1.
    const model = buildResultsExportModel(
      session([match("m1", TEAMS[0], TEAMS[2], 25, 19), match("m2", TEAMS[1], TEAMS[2], 25, 24)]),
      PLAYERS,
    );

    expect(model.champions.map((c) => c.name)).toEqual(["Time A"]);
  });

  test("breaks a tie on wins and point difference with the points scored", () => {
    // Both win by 6, but B scored 25 to A's 24.
    const model = buildResultsExportModel(
      session([match("m1", TEAMS[0], TEAMS[2], 24, 18), match("m2", TEAMS[1], TEAMS[2], 25, 19)]),
      PLAYERS,
    );

    expect(model.champions.map((c) => c.name)).toEqual(["Time B"]);
  });

  test("declares every team that no criterion separates", () => {
    const model = buildResultsExportModel(
      session([match("m1", TEAMS[0], TEAMS[2], 25, 19), match("m2", TEAMS[1], TEAMS[2], 25, 19)]),
      PLAYERS,
    );

    expect(model.championLabel).toBe("CAMPEÕES");
    expect(model.champions.map((c) => c.name)).toEqual(["Time A", "Time B"]);
  });

  test("has no champion when nothing was decided", () => {
    const model = buildResultsExportModel(session([]), PLAYERS);

    expect(model.champions).toEqual([]);
  });

  test("ranks every team, best first, with its record", () => {
    const model = buildResultsExportModel(session(MATCHES), PLAYERS);

    expect(model.standings).toEqual([
      { position: 1, name: "Time A", color: "#34d399", wins: 2, losses: 0, pointDiff: 11, pointsFor: 50 },
      { position: 2, name: "Time B", color: "#22d3ee", wins: 1, losses: 1, pointDiff: 1, pointsFor: 44 },
      { position: 3, name: "Time C", color: "#fbbf24", wins: 0, losses: 2, pointDiff: 0, pointsFor: 44 },
    ]);
  });

  test("lists every match in order, with the score line", () => {
    const model = buildResultsExportModel(session(MATCHES), PLAYERS);

    expect(model.matches).toEqual([
      { label: "Time A 25–19 Time B", excluded: false },
      { label: "Time C 20–25 Time A", excluded: false },
      { label: "Time B 25–24 Time C", excluded: false },
    ]);
  });

  test("marks the balancing rounds and keeps them out of the standings", () => {
    const model = buildResultsExportModel(session(MATCHES, 2), PLAYERS);

    expect(model.matches.map((m) => m.excluded)).toEqual([true, true, false]);
    expect(model.standings[0].name).toBe("Time B");
    expect(model.note).toBe("As 2 primeiras rodadas foram de ajuste e não valem.");
  });

  test("uses the singular for a single balancing round", () => {
    const model = buildResultsExportModel(session(MATCHES, 1), PLAYERS);

    expect(model.note).toBe("A 1ª rodada foi de ajuste e não vale.");
  });

  test("has no note when every match counted", () => {
    expect(buildResultsExportModel(session(MATCHES), PLAYERS).note).toBeUndefined();
  });

  test("reports the session totals in Portuguese", () => {
    const model = buildResultsExportModel(session(MATCHES), PLAYERS);

    expect(model.stats).toEqual([
      { label: "Jogos", value: "3" },
      { label: "Pontos totais", value: "138" },
      { label: "Maior vitória", value: "Time A por 6" },
      { label: "Jogo mais apertado", value: "Time B 25–24 Time C" },
    ]);
  });

  test("drops the rows it has nothing to say about", () => {
    const model = buildResultsExportModel(session([MATCHES[0]]), PLAYERS);

    expect(model.stats.map((s) => s.label)).toEqual(["Jogos", "Pontos totais", "Maior vitória"]);
  });

  test("carries no Elo — the shared image cannot leak ratings", () => {
    const serialized = JSON.stringify(buildResultsExportModel(session(MATCHES), PLAYERS));

    for (const player of PLAYERS) {
      expect(serialized).not.toContain(String(player.elo));
    }
  });

  test("carries no English — the print goes straight to the group", () => {
    const model = buildResultsExportModel(session(MATCHES, 1), PLAYERS);
    const text = [
      model.title,
      model.subtitle,
      model.championLabel,
      model.note ?? "",
      ...model.stats.map((s) => s.label),
    ].join(" ");

    for (const english of ["Winner", "Tie", "match", "round", "Points", "Games", "Biggest"]) {
      expect(text).not.toContain(english);
    }
  });
});

describe("resultsFilename", () => {
  test("names the image after the session date", () => {
    expect(resultsFilename(session(MATCHES))).toBe("resultado-10-08.png");
  });

  test("falls back to the raw date when it is not an ISO day", () => {
    expect(resultsFilename({ ...session(MATCHES), date: "pelada" })).toBe("resultado-pelada.png");
  });
});
