// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { saveState } from "./storage";
import type { AppState } from "./types";

beforeEach(() => {
  localStorage.clear();
});

function rosterState(count: number): AppState {
  return {
    version: 1,
    players: Array.from({ length: count }, (_, i) => ({
      id: `p${i + 1}`,
      name: `P${i + 1}`,
      skill: 5,
      elo: 1156,
      active: true,
    })),
    sessions: [],
  };
}

function twelvePlayersState(): AppState {
  return rosterState(12);
}

function activeSessionState(): AppState {
  return {
    ...twelvePlayersState(),
    sessions: [
      {
        id: "s1",
        date: "2026-07-10",
        teams: [
          ["p1", "p2", "p3", "p4"],
          ["p5", "p6", "p7", "p8"],
          ["p9", "p10", "p11", "p12"],
        ],
        matches: [],
        finished: false,
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

    for (const teamName of ["Team A", "Team B", "Team C"]) {
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
      version: 1,
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
        { id: "s1", date: "2026-07-10", teams: ghostTeams, matches: [], finished: false },
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

    for (const teamName of ["Team A", "Team B", "Team C"]) {
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
    await user.click(screen.getByRole("button", { name: /^Team A/ }));
    await user.click(screen.getByRole("button", { name: /^Team B/ }));
  }

  test("records a match and undo removes it", async () => {
    saveState(activeSessionState());
    const user = userEvent.setup();
    render(<App />);
    await selectTeamsAB(user);
    await user.type(screen.getByLabelText("Score Team A"), "25");
    await user.type(screen.getByLabelText("Score Team B"), "19");
    await user.click(screen.getByRole("button", { name: /save match/i }));

    expect(screen.getByText(/25\s*[–-]\s*19/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /undo last match/i }));
    expect(screen.queryByText(/25\s*[–-]\s*19/)).not.toBeInTheDocument();
  });

  test("save stays disabled on a tied score", async () => {
    saveState(activeSessionState());
    const user = userEvent.setup();
    render(<App />);
    await selectTeamsAB(user);
    await user.type(screen.getByLabelText("Score Team A"), "20");
    await user.type(screen.getByLabelText("Score Team B"), "20");
    expect(screen.getByRole("button", { name: /save match/i })).toBeDisabled();
  });
});
