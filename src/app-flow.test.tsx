// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { saveState } from "./storage";
import type { AppState } from "./types";

beforeEach(() => {
  localStorage.clear();
});

function twelvePlayersState(): AppState {
  return {
    version: 1,
    players: Array.from({ length: 12 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `P${i + 1}`,
      skill: 5,
      elo: 1156,
      active: true,
    })),
    sessions: [],
  };
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
    await user.selectOptions(screen.getByLabelText("Skill"), "7");
    await user.click(screen.getByRole("button", { name: /add player/i }));
    expect(screen.getByText("John")).toBeInTheDocument();
    expect(screen.getByText(/1\/12/)).toBeInTheDocument();
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
