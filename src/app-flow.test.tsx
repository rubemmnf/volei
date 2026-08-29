// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { loadState, saveState } from "./storage";
import { renderTeamsImage } from "./export/teams-image";
import { renderResultsImage } from "./export/results-image";
import type { AppState, Match } from "./types";
import { DEFAULT_SETTINGS } from "./settings";

// jsdom has no canvas backend — keep the painter out of the component tests and
// assert on the model it is handed instead.
vi.mock("./export/teams-image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./export/teams-image")>()),
  renderTeamsImage: vi.fn(() => Promise.resolve(new Blob(["png"], { type: "image/png" }))),
}));

vi.mock("./export/results-image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./export/results-image")>()),
  renderResultsImage: vi.fn(() => Promise.resolve(new Blob(["png"], { type: "image/png" }))),
}));

// Sharing and downloading touch APIs jsdom does not implement.
vi.mock("./export/share", () => ({
  shareImage: vi.fn(() => Promise.resolve()),
  downloadImage: vi.fn(),
  canShareImage: vi.fn(() => true),
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:mock-teams-image");
  URL.revokeObjectURL = vi.fn();
});

function rosterState(count: number): AppState {
  return {
    version: 2,
    settings: DEFAULT_SETTINGS,
    players: Array.from({ length: count }, (_, i) => ({
      id: `p${i + 1}`,
      name: `P${i + 1}`,
      skill: 5,
      baseElo: 1156,
      active: true,
    })),
    sessions: [],
  };
}

function twelvePlayersState(): AppState {
  return rosterState(12);
}

const SESSION_TEAMS: [string[], string[], string[]] = [
  ["p1", "p2", "p3", "p4"],
  ["p5", "p6", "p7", "p8"],
  ["p9", "p10", "p11", "p12"],
];

function activeSessionState(): AppState {
  return {
    ...twelvePlayersState(),
    sessions: [
      {
        id: "s1",
        date: "2026-07-10",
        teams: SESSION_TEAMS,
        matches: [],
        finished: false,
        balancingRounds: 0,
        rebalanceMuted: false,
      },
    ],
  };
}

function playedMatch(
  id: string,
  sideA: string[],
  sideB: string[],
  scoreA: number,
  scoreB: number,
): Match {
  return { id, sideA, sideB, scoreA, scoreB, timestamp: id };
}

/** Time A wins twice (+6, +5), Time B once (+2), Time C never. */
function finishedSessionState(): AppState {
  const [teamA, teamB, teamC] = SESSION_TEAMS;
  return {
    ...twelvePlayersState(),
    sessions: [
      {
        id: "s1",
        date: "2026-07-10",
        teams: SESSION_TEAMS,
        matches: [
          playedMatch("m1", teamA, teamB, 25, 19),
          playedMatch("m2", teamC, teamA, 20, 25),
          playedMatch("m3", teamB, teamC, 25, 23),
        ],
        finished: true,
        balancingRounds: 0,
        rebalanceMuted: false,
      },
    ],
  };
}

describe("players flow", () => {
  test("adds a player from the players screen", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText("Name"), "John");
    await user.selectOptions(screen.getByLabelText("Skill"), "4");
    await user.click(screen.getByRole("button", { name: /add player/i }));
    expect(screen.getByText("John")).toBeInTheDocument();
    expect(screen.getByText(/1 in roster/)).toBeInTheDocument();
  });
});

describe("attendance flow", () => {
  test("generate unlocks only when exactly 12 players are selected", async () => {
    saveState(rosterState(14));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Teams" }));

    expect(screen.getByText(/14\/12 selected/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate teams/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "P13" }));
    await user.click(screen.getByRole("button", { name: "P14" }));

    expect(screen.getByText(/12\/12 selected/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate teams/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: "P13" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "P1", pressed: true })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /generate teams/i }));
    expect(screen.getByRole("button", { name: /start session/i })).toBeInTheDocument();
  });

  test("deselected players stay out of generated teams", async () => {
    saveState(rosterState(13));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Teams" }));
    await user.click(screen.getByRole("button", { name: "P5" }));
    await user.click(screen.getByRole("button", { name: /generate teams/i }));

    for (const teamName of ["Time A", "Time B", "Time C"]) {
      const card = screen.getByTestId(`preview-${teamName}`);
      expect(within(card).queryByText("P5")).not.toBeInTheDocument();
    }
  });
});

describe("state replacement resilience", () => {
  test("importing a backup invalidates a stale team preview", async () => {
    saveState(twelvePlayersState());
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Teams" }));
    await user.click(screen.getByRole("button", { name: /generate teams/i }));
    expect(screen.getByRole("button", { name: /start session/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    const replacement = {
      version: 2,
      players: rosterState(12).players.map((p) => ({
        ...p,
        id: `new-${p.id}`,
        name: `N${p.name}`,
      })),
      sessions: [],
    };
    fireEvent.change(screen.getByLabelText(/paste backup json/i), {
      target: { value: JSON.stringify(replacement) },
    });
    await user.click(screen.getByRole("button", { name: /import \(replaces everything\)/i }));

    expect(screen.queryByRole("button", { name: /start session/i })).not.toBeInTheDocument();
  });

  test("active session referencing missing players shows recovery instead of crashing", async () => {
    const ghostTeams: [string[], string[], string[]] = [
      ["g1", "g2", "g3", "g4"],
      ["g5", "g6", "g7", "g8"],
      ["g9", "g10", "g11", "g12"],
    ];
    saveState({
      ...twelvePlayersState(),
      sessions: [
        {
          id: "s1",
          date: "2026-07-10",
          teams: ghostTeams,
          matches: [],
          finished: false,
          balancingRounds: 0,
          rebalanceMuted: false,
        },
      ],
    });
    render(<App />);

    expect(await screen.findByText(/missing players/i)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /end session/i }));
    expect(screen.getByText(/no active session/i)).toBeInTheDocument();
  });
});

describe("generate flow", () => {
  test("generates three teams of four and starts a session", async () => {
    saveState(twelvePlayersState());
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Teams" }));
    await user.click(screen.getByRole("button", { name: /generate teams/i }));

    for (const teamName of ["Time A", "Time B", "Time C"]) {
      const card = screen.getByTestId(`preview-${teamName}`);
      expect(within(card).getAllByRole("listitem")).toHaveLength(4);
    }

    await user.click(screen.getByRole("button", { name: /start session/i }));
    expect(screen.getByRole("button", { name: /end session/i })).toBeInTheDocument();
  });
});

describe("session flow", () => {
  async function selectTeamsAB(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Session" }));
    await user.click(screen.getByRole("button", { name: /^Time A/ }));
    await user.click(screen.getByRole("button", { name: /^Time B/ }));
  }

  test("records a match and undo removes it", async () => {
    saveState(activeSessionState());
    const user = userEvent.setup();
    render(<App />);
    await selectTeamsAB(user);
    await user.type(screen.getByLabelText("Score Time A"), "25");
    await user.type(screen.getByLabelText("Score Time B"), "19");
    await user.click(screen.getByRole("button", { name: /save match/i }));

    expect(screen.getByText(/25\s*[–-]\s*19/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /undo last match/i }));
    expect(screen.queryByText(/25\s*[–-]\s*19/)).not.toBeInTheDocument();
  });

  // The standings are what the group argues over between matches, so they belong on
  // the cards rather than behind the end-of-session screen.
  test("each team card carries its record and point difference once a match counts", async () => {
    saveState(activeSessionState());
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Session" }));

    // Nothing counted yet — three 0-0 chips would be noise.
    expect(screen.queryByText("0-0")).not.toBeInTheDocument();

    await selectTeamsAB(user);
    await user.type(screen.getByLabelText("Score Time A"), "25");
    await user.type(screen.getByLabelText("Score Time B"), "19");
    await user.click(screen.getByRole("button", { name: /save match/i }));

    const cardA = screen.getByRole("button", { name: /^Time A/ });
    expect(within(cardA).getByText("1-0")).toBeInTheDocument();
    expect(within(cardA).getByText("+6")).toBeInTheDocument();

    const cardB = screen.getByRole("button", { name: /^Time B/ });
    expect(within(cardB).getByText("0-1")).toBeInTheDocument();
    expect(within(cardB).getByText("-6")).toBeInTheDocument();

    // Team C sat the match out, so it shows level rather than nothing.
    expect(within(screen.getByRole("button", { name: /^Time C/ })).getByText("0-0"))
      .toBeInTheDocument();
  });

  // Balancing rounds decide nothing about the night, so the cards must not count them.
  test("the cards ignore the balancing rounds", async () => {
    saveState(activeSessionState());
    const user = userEvent.setup();
    render(<App />);
    await selectTeamsAB(user);
    await user.type(screen.getByLabelText("Score Time A"), "25");
    await user.type(screen.getByLabelText("Score Time B"), "19");
    await user.click(screen.getByRole("button", { name: /save match/i }));
    await user.click(screen.getByRole("button", { name: /more balancing rounds/i }));

    expect(screen.queryByText("1-0")).not.toBeInTheDocument();
  });

  // The standings are what the group argues over between matches, so they belong on
  // the cards rather than behind the end-of-session screen.
  test("each team card carries its record and point difference once a match counts", async () => {
    saveState(activeSessionState());
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Session" }));

    // Nothing counted yet — three 0-0 chips would be noise.
    expect(screen.queryByText("0-0")).not.toBeInTheDocument();

    await selectTeamsAB(user);
    await user.type(screen.getByLabelText("Score Time A"), "25");
    await user.type(screen.getByLabelText("Score Time B"), "19");
    await user.click(screen.getByRole("button", { name: /save match/i }));

    const cardA = screen.getByRole("button", { name: /^Time A/ });
    expect(within(cardA).getByText("1-0")).toBeInTheDocument();
    expect(within(cardA).getByText("+6")).toBeInTheDocument();

    const cardB = screen.getByRole("button", { name: /^Time B/ });
    expect(within(cardB).getByText("0-1")).toBeInTheDocument();
    expect(within(cardB).getByText("-6")).toBeInTheDocument();

    // Team C sat the match out, so it shows level rather than nothing.
    expect(
      within(screen.getByRole("button", { name: /^Time C/ })).getByText("0-0"),
    ).toBeInTheDocument();
  });

  // Balancing rounds decide nothing about the night, so the cards must not count them.
  test("the cards ignore the balancing rounds", async () => {
    saveState(activeSessionState());
    const user = userEvent.setup();
    render(<App />);
    await selectTeamsAB(user);
    await user.type(screen.getByLabelText("Score Time A"), "25");
    await user.type(screen.getByLabelText("Score Time B"), "19");
    await user.click(screen.getByRole("button", { name: /save match/i }));
    await user.click(screen.getByRole("button", { name: /more balancing rounds/i }));

    expect(screen.queryByText("1-0")).not.toBeInTheDocument();
  });

  // Every seeded player has the same rating, so the algorithm has nothing to
  // suggest — the group still has to be able to make the trade it wants.
  test("a swap the algorithm never suggested can be made by hand", async () => {
    saveState(activeSessionState());
    const user = userEvent.setup();
    render(<App />);
    await selectTeamsAB(user);
    await user.click(screen.getByRole("button", { name: /swap players/i }));

    expect(screen.getByText(/least uneven/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /choose manually/i }));
    await user.click(screen.getByRole("button", { name: "P1" }));
    await user.click(screen.getByRole("button", { name: "P5" }));
    await user.click(screen.getByRole("button", { name: /apply swap/i }));

    expect(screen.getByRole("button", { name: /^Time A/ })).toHaveTextContent(/\bP5\b/);
    expect(screen.getByRole("button", { name: /^Time A/ })).not.toHaveTextContent(/\bP1\b/);
    expect(screen.getByRole("button", { name: /^Time B/ })).toHaveTextContent(/\bP1\b/);
  });

  // The night that prompted the feature: three balancing rounds leave Time A at 2-0
  // and Time B at 0-2, and the organizer wants to be told, not to have to ask.
  function lopsidedSessionState(): AppState {
    const [teamA, teamB, teamC] = SESSION_TEAMS;
    return {
      ...twelvePlayersState(),
      sessions: [
        {
          id: "s1",
          date: "2026-07-10",
          teams: SESSION_TEAMS,
          matches: [
            playedMatch("m1", teamA, teamB, 25, 23),
            playedMatch("m2", teamA, teamC, 25, 23),
            playedMatch("m3", teamC, teamB, 25, 23),
          ],
          finished: false,
          balancingRounds: 3,
          rebalanceMuted: false,
        },
      ],
    };
  }

  const rebalanceButton = () => screen.queryByRole("button", { name: /rebalance/i });

  test("flags the team running away with the night", async () => {
    saveState(lopsidedSessionState());
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Session" }));

    const banner = rebalanceButton();
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAccessibleName(/Time A/);
    expect(banner).toHaveAccessibleName(/Time B/);
  });

  test("stays quiet while the night is even", async () => {
    saveState(activeSessionState());
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Session" }));
    expect(rebalanceButton()).not.toBeInTheDocument();
  });

  test("the banner opens a swap on that pairing with something to offer", async () => {
    saveState(lopsidedSessionState());
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Session" }));
    await user.click(rebalanceButton()!);

    const rows = screen.getAllByRole("button", { name: /^swap .* with .*/i });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveTextContent(/Time A/);
    expect(rows[0]).toHaveTextContent(/Time B/);
  });

  async function applySuggestedSwapFromBanner(user: ReturnType<typeof userEvent.setup>) {
    await user.click(rebalanceButton()!);
    await user.click(screen.getAllByRole("button", { name: /^swap .* with .*/i })[0]);
    await user.click(screen.getByRole("button", { name: /apply swap/i }));
  }

  // The banner used to sit at the top of the screen while the organizer worked at the
  // bottom, so a whole night went by without anyone seeing it.
  test("the banner sits below the score entry, where the organizer already is", async () => {
    saveState(lopsidedSessionState());
    const user = userEvent.setup();
    render(<App />);
    await selectTeamsAB(user);

    const saveButton = screen.getByRole("button", { name: /save match/i });
    const banner = rebalanceButton()!;
    expect(saveButton.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  test("applying a swap silences the banner and says what was traded", async () => {
    saveState(lopsidedSessionState());
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Session" }));
    await applySuggestedSwapFromBanner(user);

    expect(rebalanceButton()).not.toBeInTheDocument();
    expect(screen.getByText(/^Swapped .+ ⇄ .+$/)).toBeInTheDocument();
  });

  // A swap rewrites the teams but not the win/loss record the banner is derived from,
  // so without the stored mute the very next match would raise it again.
  test("the banner stays down for the rest of the night once acted on", async () => {
    saveState(lopsidedSessionState());
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Session" }));
    await applySuggestedSwapFromBanner(user);

    await user.type(screen.getByLabelText("Score Time A"), "25");
    await user.type(screen.getByLabelText("Score Time B"), "15");
    await user.click(screen.getByRole("button", { name: /save match/i }));

    expect(rebalanceButton()).not.toBeInTheDocument();
  });

  test("dismissing the banner sticks across a reload", async () => {
    saveState(lopsidedSessionState());
    const user = userEvent.setup();
    const first = render(<App />);
    await user.click(screen.getByRole("button", { name: "Session" }));
    await user.click(screen.getByRole("button", { name: /dismiss suggestion/i }));
    expect(rebalanceButton()).not.toBeInTheDocument();

    first.unmount();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Session" }));
    expect(rebalanceButton()).not.toBeInTheDocument();
  });

  test("save stays disabled on a tied score", async () => {
    saveState(activeSessionState());
    const user = userEvent.setup();
    render(<App />);
    await selectTeamsAB(user);
    await user.type(screen.getByLabelText("Score Time A"), "20");
    await user.type(screen.getByLabelText("Score Time B"), "20");
    expect(screen.getByRole("button", { name: /save match/i })).toBeDisabled();
  });

  test("lists today's matches in the order they were recorded", async () => {
    saveState(activeSessionState());
    const user = userEvent.setup();
    render(<App />);
    await selectTeamsAB(user);

    await user.type(screen.getByLabelText("Score Time A"), "25");
    await user.type(screen.getByLabelText("Score Time B"), "19");
    await user.click(screen.getByRole("button", { name: /save match/i }));
    await user.type(screen.getByLabelText("Score Time A"), "21");
    await user.type(screen.getByLabelText("Score Time B"), "25");
    await user.click(screen.getByRole("button", { name: /save match/i }));

    const played = screen.getAllByRole("listitem");
    expect(played[0]).toHaveTextContent("25–19");
    expect(played[1]).toHaveTextContent("21–25");
  });

  test("tap order drives the badges, the score boxes and the recorded match", async () => {
    saveState(activeSessionState());
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Session" }));
    // Tap C first, then A — the badge must not disturb the /^Time …/ name anchor.
    await user.click(screen.getByRole("button", { name: /^Time C/ }));
    await user.click(screen.getByRole("button", { name: /^Time A/ }));

    expect(screen.getByRole("button", { name: /^Time C/, pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Time B/ })).toHaveAttribute("aria-pressed", "false");
    expect(
      within(screen.getByRole("button", { name: /^Time C/ })).getByText("1"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: /^Time A/ })).getByText("2"),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Score Time C"), "25");
    await user.type(screen.getByLabelText("Score Time A"), "19");
    expect(screen.getByRole("status")).toHaveTextContent(/Time C 25\s*[–-]\s*19\s*Time A/);
    // The live preview must not answer the saved-match-list query.
    expect(screen.queryAllByText(/25\s*[–-]\s*19/)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: /save match/i }));
    expect(screen.getByText(/Time C 25\s*[–-]\s*19\s*Time A/)).toBeInTheDocument();
  });

  test("changing one of the two selected teams clears typed scores", async () => {
    saveState(activeSessionState());
    const user = userEvent.setup();
    render(<App />);
    await selectTeamsAB(user);
    await user.type(screen.getByLabelText("Score Time A"), "25");

    // slice(-2) keeps B + C selected, so ScoreEntry stays mounted unless it is re-keyed.
    await user.click(screen.getByRole("button", { name: /^Time C/ }));

    expect(screen.getByLabelText("Score Time B")).toHaveValue(null);
    expect(screen.getByLabelText("Score Time C")).toHaveValue(null);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  test("marks the first N matches as balancing rounds", async () => {
    saveState(activeSessionState());
    const user = userEvent.setup();
    render(<App />);
    await selectTeamsAB(user);

    await user.type(screen.getByLabelText("Score Time A"), "25");
    await user.type(screen.getByLabelText("Score Time B"), "19");
    await user.click(screen.getByRole("button", { name: /save match/i }));
    await user.type(screen.getByLabelText("Score Time A"), "21");
    await user.type(screen.getByLabelText("Score Time B"), "25");
    await user.click(screen.getByRole("button", { name: /save match/i }));

    expect(screen.getByRole("button", { name: /fewer balancing rounds/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /more balancing rounds/i }));

    const played = screen.getAllByRole("listitem");
    expect(played[0]).toHaveTextContent(/balancing/i);
    expect(played[1]).not.toHaveTextContent(/balancing/i);
    expect(screen.getByRole("button", { name: /fewer balancing rounds/i })).toBeEnabled();
  });

  test("deselecting a team hides score entry and keeps the first badge", async () => {
    saveState(activeSessionState());
    const user = userEvent.setup();
    render(<App />);
    await selectTeamsAB(user);
    expect(screen.getByLabelText("Score Time A")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Time B/ }));

    expect(screen.queryByLabelText("Score Time A")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: /^Time A/ })).getByText("1"),
    ).toBeInTheDocument();
  });
});

describe("history flow", () => {
  async function openHistory() {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "History" }));
    return screen.getByTestId("session-s1");
  }

  test("lists the matches of a past session in the order they were recorded", async () => {
    saveState(finishedSessionState());
    const card = await openHistory();

    expect(within(card).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Time A 25–19 Time B",
      "Time C 20–25 Time A",
      "Time B 25–23 Time C",
    ]);
  });

  test("shows wins and accumulated point difference per team", async () => {
    saveState(finishedSessionState());
    const card = await openHistory();

    const rowA = within(card).getByTestId("session-stat-s1-0");
    expect(within(rowA).getByText("Time A")).toBeInTheDocument();
    expect(within(rowA).getByText("2W")).toBeInTheDocument();
    expect(within(rowA).getByText("+11")).toBeInTheDocument();

    const rowB = within(card).getByTestId("session-stat-s1-1");
    expect(within(rowB).getByText("1W")).toBeInTheDocument();
    expect(within(rowB).getByText("+2")).toBeInTheDocument();

    const rowC = within(card).getByTestId("session-stat-s1-2");
    expect(within(rowC).getByText("0W")).toBeInTheDocument();
    expect(within(rowC).getByText("+0")).toBeInTheDocument();
  });

  test("names the team that won the session", async () => {
    saveState(finishedSessionState());
    const card = await openHistory();

    expect(within(card).getByText("Winner: Time A")).toBeInTheDocument();
  });

  test("keeps the balancing rounds out of the night's standings and winner", async () => {
    const base = finishedSessionState();
    saveState({
      ...base,
      sessions: [{ ...base.sessions[0], balancingRounds: 2 }],
    });
    const card = await openHistory();

    // Only m3 counts: Time B beat Time C by 2.
    expect(within(card).getByTestId("session-stat-s1-0").textContent).toContain("0W");
    expect(within(card).getByTestId("session-stat-s1-1").textContent).toContain("1W");
    expect(within(card).getByText("Winner: Time B")).toBeInTheDocument();
    expect(within(card).getByText(/first 2 rounds excluded/i)).toBeInTheDocument();
  });

  test("shows a tie when two teams end level on wins and point difference", async () => {
    const [teamA, teamB, teamC] = SESSION_TEAMS;
    const base = finishedSessionState();
    saveState({
      ...base,
      sessions: [
        {
          ...base.sessions[0],
          matches: [
            playedMatch("m1", teamA, teamC, 25, 20),
            playedMatch("m2", teamB, teamC, 25, 20),
          ],
        },
      ],
    });
    const card = await openHistory();

    expect(within(card).getByText("Tie: Time A · Time B")).toBeInTheDocument();
  });
});

describe("correcting a mistyped score", () => {
  /** The rankings row for a player, as the user reads it. */
  const rankingRow = (name: string) => screen.getByText(name).parentElement!.textContent;

  async function editFirstMatch(scoreA: string, scoreB: string) {
    saveState(finishedSessionState());
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "History" }));

    const before = { p1: rankingRow("P1"), p9: rankingRow("P9") };

    await user.click(screen.getByRole("button", { name: "Edit Time A 25–19 Time B" }));
    await user.clear(screen.getByLabelText("Score Time A"));
    await user.type(screen.getByLabelText("Score Time A"), scoreA);
    await user.clear(screen.getByLabelText("Score Time B"));
    await user.type(screen.getByLabelText("Score Time B"), scoreB);
    return { user, before };
  }

  test("a finished session's score can be corrected from history", async () => {
    const { user } = await editFirstMatch("19", "25");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const card = screen.getByTestId("session-s1");
    expect(within(card).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Time A 19–25 Time B",
      "Time C 20–25 Time A",
      "Time B 25–23 Time C",
    ]);
  });

  test("the correction re-rates later matches, not just the edited one", async () => {
    const { user, before } = await editFirstMatch("19", "25");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(rankingRow("P1")).not.toBe(before.p1);
    // Time C never played the edited match, but its later match against Time A
    // was rated against the Elo that match produced.
    expect(rankingRow("P9")).not.toBe(before.p9);
  });

  test("session standings follow the correction", async () => {
    const { user } = await editFirstMatch("19", "25");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const card = screen.getByTestId("session-s1");
    expect(within(card).getByTestId("session-stat-s1-0").textContent).toContain("1W");
    expect(within(card).getByTestId("session-stat-s1-1").textContent).toContain("2W");
  });

  test("a tie cannot be saved", async () => {
    const { user } = await editFirstMatch("20", "20");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText("No ties in volleyball")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    const card = screen.getByTestId("session-s1");
    expect(within(card).getByText("Time A 25–19 Time B")).toBeInTheDocument();
  });

  test("cancelling leaves the score alone", async () => {
    const { user, before } = await editFirstMatch("19", "25");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    const card = screen.getByTestId("session-s1");
    expect(within(card).getByText("Time A 25–19 Time B")).toBeInTheDocument();
    expect(rankingRow("P1")).toBe(before.p1);
  });
});

const VARIED_ELOS = [1520, 1480, 1400, 1330, 1290, 1240, 1180, 1120, 1060, 1010, 960, 900];
const ELO_BY_NAME = new Map(VARIED_ELOS.map((elo, i) => [`V${i + 1}`, elo]));

function variedRosterState(): AppState {
  return {
    version: 2,
    settings: DEFAULT_SETTINGS,
    players: VARIED_ELOS.map((elo, i) => ({
      id: `v${i + 1}`,
      name: `V${i + 1}`,
      skill: 3,
      baseElo: elo,
      active: true,
    })),
    sessions: [],
  };
}

async function generatePreview() {
  saveState(variedRosterState());
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Teams" }));
  await user.click(screen.getByRole("button", { name: /generate teams/i }));
  return user;
}

describe("teams preview totals and swap suggestions", () => {
  test("shows each team's Elo total on its card", async () => {
    await generatePreview();

    for (const teamName of ["Time A", "Time B", "Time C"]) {
      const card = screen.getByTestId(`preview-${teamName}`);
      const total = within(card)
        .getAllByRole("button")
        .reduce((sum, button) => sum + ELO_BY_NAME.get(button.textContent!)!, 0);

      expect(within(card).getByText(String(total))).toBeInTheDocument();
    }
  });

  test("lists three swaps per team pair, least disruptive first", async () => {
    await generatePreview();

    for (const testId of ["swaps-0-1", "swaps-0-2", "swaps-1-2"]) {
      const rows = within(screen.getByTestId(testId)).getAllByRole("button");
      expect(rows).toHaveLength(3);

      const shifts = rows.map((row) => Number(row.textContent!.match(/±(\d+)/)![1]));
      expect(shifts).toEqual([...shifts].sort((a, b) => a - b));
    }
  });

  test("tapping a suggestion trades the two players between their teams", async () => {
    const user = await generatePreview();
    const row = within(screen.getByTestId("swaps-0-1")).getAllByRole("button")[0];
    const [, fromA, fromB] = row.getAttribute("aria-label")!.match(/^Swap (\S+) with (\S+)$/)!;

    await user.click(row);

    expect(within(screen.getByTestId("preview-Time A")).getByText(fromB)).toBeInTheDocument();
    expect(within(screen.getByTestId("preview-Time B")).getByText(fromA)).toBeInTheDocument();
  });
});

describe("teams export", () => {
  test("hands the painter a model with no Elo and no suggestions", async () => {
    const user = await generatePreview();
    await user.click(screen.getByRole("button", { name: /exportar imagem/i }));

    expect(renderTeamsImage).toHaveBeenCalledTimes(1);
    const model = vi.mocked(renderTeamsImage).mock.calls[0][0];

    expect(model.teams).toHaveLength(3);
    expect(model.teams.flatMap((team) => team.players)).toHaveLength(12);
    const serialized = JSON.stringify(model);
    for (const elo of VARIED_ELOS) {
      expect(serialized).not.toContain(String(elo));
    }
  });

  test("previews the generated image before anything is shared", async () => {
    const user = await generatePreview();
    await user.click(screen.getByRole("button", { name: /exportar imagem/i }));

    expect(await screen.findByAltText(/^Times ·/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /compartilhar/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /baixar/i })).not.toBeInTheDocument();
  });
});

describe("session results export", () => {
  async function openHistory() {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "History" }));
    return user;
  }

  test("offers the export on every finished session", async () => {
    saveState(finishedSessionState());
    await openHistory();

    expect(
      within(screen.getByTestId("session-s1")).getByRole("button", {
        name: /exportar resultado/i,
      }),
    ).toBeInTheDocument();
  });

  test("hands the painter the champion, the standings and every score", async () => {
    saveState(finishedSessionState());
    const user = await openHistory();
    await user.click(screen.getByRole("button", { name: /exportar resultado/i }));

    expect(renderResultsImage).toHaveBeenCalledTimes(1);
    const model = vi.mocked(renderResultsImage).mock.calls[0][0];

    expect(model.championLabel).toBe("CAMPEÃO");
    expect(model.champions.map((c) => c.name)).toEqual(["Time A"]);
    expect(model.standings.map((row) => row.name)).toEqual(["Time A", "Time B", "Time C"]);
    expect(model.matches.map((m) => m.label)).toEqual([
      "Time A 25–19 Time B",
      "Time C 20–25 Time A",
      "Time B 25–23 Time C",
    ]);
  });

  test("previews the image before anything is shared", async () => {
    saveState(finishedSessionState());
    const user = await openHistory();
    await user.click(screen.getByRole("button", { name: /exportar resultado/i }));

    expect(await screen.findByAltText("Resultado · 10/07")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /compartilhar/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /baixar/i })).not.toBeInTheDocument();
  });
});

describe("configurable tuning", () => {
  test("a new session starts at the configured number of balancing rounds", async () => {
    saveState({
      ...twelvePlayersState(),
      settings: { ...DEFAULT_SETTINGS, defaultBalancingRounds: 2 },
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Teams" }));
    await user.click(screen.getByRole("button", { name: /generate teams/i }));
    await user.click(screen.getByRole("button", { name: /start session/i }));

    expect(screen.getByText(/first 2 matches/i)).toBeInTheDocument();
  });

  test("editing a tuning field persists it without touching the roster", async () => {
    saveState(twelvePlayersState());
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.change(screen.getByLabelText("K-factor"), { target: { value: "48" } });

    const loaded = loadState();
    expect(loaded.status).toBe("ok");
    expect(loaded.status === "ok" && loaded.state.settings.kFactor).toBe(48);
    expect(loaded.status === "ok" && loaded.state.players).toHaveLength(12);
  });

  test("an out-of-range value is refused and the stored setting is left alone", async () => {
    saveState(twelvePlayersState());
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Settings" }));
    const field = screen.getByLabelText("Familiarity decay");
    fireEvent.change(field, { target: { value: "5" } });

    expect(field).toHaveAttribute("aria-invalid", "true");
    const loaded = loadState();
    expect(loaded.status === "ok" && loaded.state.settings.familiarityDecay).toBe(0.75);
  });

  test("reset restores the defaults and keeps the roster", async () => {
    saveState({
      ...twelvePlayersState(),
      settings: { ...DEFAULT_SETTINGS, kFactor: 99, gameDay: 4 },
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: /reset tuning to defaults/i }));

    const loaded = loadState();
    expect(loaded.status === "ok" && loaded.state.settings).toEqual(DEFAULT_SETTINGS);
    expect(loaded.status === "ok" && loaded.state.players).toHaveLength(12);
  });

  test("with no game day the session is dated today", async () => {
    saveState(twelvePlayersState());
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Teams" }));
    await user.click(screen.getByRole("button", { name: /generate teams/i }));

    expect(screen.getByText(new RegExp(`Dated ${localIso(new Date())}`))).toBeInTheDocument();
  });

  test("a configured game day dates the session back to the last one", async () => {
    // Yesterday's weekday, so the resolved date has to move off today. The
    // expectation is plain date arithmetic, not a second call to the resolver.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    saveState({
      ...twelvePlayersState(),
      settings: { ...DEFAULT_SETTINGS, gameDay: yesterday.getDay() },
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Teams" }));
    await user.click(screen.getByRole("button", { name: /generate teams/i }));
    expect(screen.getByText(new RegExp(`Dated ${localIso(yesterday)}`))).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /start session/i }));
    expect(screen.getByText(new RegExp(localIso(yesterday)))).toBeInTheDocument();
  });
});

/** The local YYYY-MM-DD of a date, matching how a session is stamped. */
function localIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
