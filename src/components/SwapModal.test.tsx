// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SwapModal } from "./SwapModal";
import type { RankedSwap } from "../algorithm/suggest-swap";
import type { Player } from "../types";

function makePlayer(id: string, name: string, elo: number): Player {
  return { id, name, skill: 3, baseElo: elo, elo, active: true };
}

const TEAM_X = [
  makePlayer("x1", "Ana", 1500),
  makePlayer("x2", "Bia", 1200),
  makePlayer("x3", "Caio", 1200),
  makePlayer("x4", "Dora", 1100),
];
const TEAM_Y = [
  makePlayer("y1", "Enzo", 1100),
  makePlayer("y2", "Fabi", 1100),
  makePlayer("y3", "Gui", 1100),
  makePlayer("y4", "Hugo", 1100),
];

const SUGGESTIONS: RankedSwap[] = [
  { fromX: TEAM_X[0], fromY: TEAM_Y[0], gapAfter: 200, familiarityAfter: 0, improves: true },
  { fromX: TEAM_X[1], fromY: TEAM_Y[1], gapAfter: 400, familiarityAfter: 0, improves: true },
  { fromX: TEAM_X[2], fromY: TEAM_Y[2], gapAfter: 400, familiarityAfter: 0, improves: false },
];

/** What a pair of teams no 1-for-1 swap can even out looks like. */
const NO_GAIN: RankedSwap[] = SUGGESTIONS.map((swap) => ({ ...swap, improves: false }));

function setup(suggestions: RankedSwap[] = SUGGESTIONS) {
  const onApply = vi.fn();
  const onCancel = vi.fn();
  render(
    <SwapModal
      teamX={TEAM_X}
      teamY={TEAM_Y}
      teamXName="Time A"
      teamYName="Time B"
      suggestions={suggestions}
      onApply={onApply}
      onCancel={onCancel}
    />,
  );
  return { onApply, onCancel, user: userEvent.setup() };
}

const applyButton = () => screen.getByRole("button", { name: /apply swap/i });

describe("SwapModal suggestions", () => {
  test("offers one row per suggested swap", () => {
    setup();
    expect(screen.getAllByRole("button", { name: /^swap .* with .*/i })).toHaveLength(3);
  });

  test("applies the top suggestion by default", async () => {
    const { onApply, user } = setup();
    await user.click(applyButton());
    expect(onApply).toHaveBeenCalledWith("x1", "y1");
  });

  test("applies the alternative the user picks, not the top one", async () => {
    const { onApply, user } = setup();
    await user.click(screen.getByRole("button", { name: /swap Caio with Gui/i }));
    await user.click(applyButton());
    expect(onApply).toHaveBeenCalledWith("x3", "y3");
  });

  test("marks the swaps that would not actually help", () => {
    setup();
    const rows = screen.getAllByRole("button", { name: /^swap .* with .*/i });
    expect(rows[2]).toHaveTextContent(/no gain/i);
    expect(rows[0]).not.toHaveTextContent(/no gain/i);
  });

  test("still offers the least uneven swaps when none of them improve", () => {
    setup(NO_GAIN);
    expect(screen.getAllByRole("button", { name: /^swap .* with .*/i })).toHaveLength(3);
    expect(screen.getByText(/least uneven/i)).toBeInTheDocument();
    expect(applyButton()).toBeEnabled();
  });

  test("never claims the teams are balanced when a team is being run over", () => {
    setup(NO_GAIN);
    expect(screen.queryByText(/already balanced/i)).not.toBeInTheDocument();
  });

  test("cancels without applying", async () => {
    const { onApply, onCancel, user } = setup();
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe("SwapModal manual mode", () => {
  test("applies a pair the algorithm never suggested", async () => {
    const { onApply, user } = setup();
    await user.click(screen.getByRole("button", { name: /choose manually/i }));
    await user.click(screen.getByRole("button", { name: "Dora" }));
    await user.click(screen.getByRole("button", { name: "Hugo" }));
    await user.click(applyButton());
    expect(onApply).toHaveBeenCalledWith("x4", "y4");
  });

  test("cannot apply a half-made pick", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /choose manually/i }));
    expect(applyButton()).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Dora" }));
    expect(applyButton()).toBeDisabled();
  });

  test("previews the rating gap the pick would leave", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /choose manually/i }));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    await user.click(screen.getByRole("button", { name: "Ana" }));
    await user.click(screen.getByRole("button", { name: "Enzo" }));
    expect(screen.getByRole("status")).toHaveTextContent("200");
  });

  test("stays reachable when there is nothing to suggest", async () => {
    const { onApply, user } = setup([]);
    await user.click(screen.getByRole("button", { name: /choose manually/i }));
    await user.click(screen.getByRole("button", { name: "Bia" }));
    await user.click(screen.getByRole("button", { name: "Fabi" }));
    await user.click(applyButton());
    expect(onApply).toHaveBeenCalledWith("x2", "y2");
  });

  test("goes back to the suggestions", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /choose manually/i }));
    await user.click(screen.getByRole("button", { name: /back to suggestions/i }));
    expect(screen.getAllByRole("button", { name: /^swap .* with .*/i })).toHaveLength(3);
  });
});
