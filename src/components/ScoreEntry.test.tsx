// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScoreEntry } from "./ScoreEntry";
import { TEAM_META } from "./team-meta";

// Deliberately A vs C: nothing in ScoreEntry may assume the pair is A vs B.
function setup() {
  const onSave = vi.fn();
  render(<ScoreEntry teamA={TEAM_META[0]} teamB={TEAM_META[2]} onSave={onSave} />);
  return { onSave, user: userEvent.setup() };
}

describe("ScoreEntry", () => {
  test("save is disabled until both scores are entered", () => {
    setup();
    expect(screen.getByRole("button", { name: /save match/i })).toBeDisabled();
  });

  test("saves valid scores and clears inputs", async () => {
    const { onSave, user } = setup();
    await user.type(screen.getByLabelText("Score Time A"), "25");
    await user.type(screen.getByLabelText("Score Time C"), "19");
    await user.click(screen.getByRole("button", { name: /save match/i }));
    expect(onSave).toHaveBeenCalledWith(25, 19);
    expect(screen.getByLabelText("Score Time A")).toHaveValue(null);
  });

  test("rejects a tie", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Score Time A"), "20");
    await user.type(screen.getByLabelText("Score Time C"), "20");
    expect(screen.getByRole("button", { name: /save match/i })).toBeDisabled();
  });

  test("rejects negative scores", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Score Time A"), "-5");
    await user.type(screen.getByLabelText("Score Time C"), "19");
    expect(screen.getByRole("button", { name: /save match/i })).toBeDisabled();
  });

  test("each score box carries a visible team name and the Score aria-label", () => {
    setup();
    expect(screen.getByLabelText("Score Time A")).toBe(screen.getByLabelText("Time A"));
    expect(screen.getByLabelText("Score Time C")).toBe(screen.getByLabelText("Time C"));
  });

  test("the preview stays empty until both scores are entered", async () => {
    const { user } = setup();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    await user.type(screen.getByLabelText("Score Time A"), "25");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  test("the preview names the winner as the user types", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Score Time A"), "25");
    await user.type(screen.getByLabelText("Score Time C"), "19");
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/Time A 25\s*[–-]\s*19\s*Time C/);
    expect(status).toHaveTextContent(/Time A wins/);
  });

  test("the preview follows the higher score, not the left box", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Score Time A"), "19");
    await user.type(screen.getByLabelText("Score Time C"), "25");
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/Time C wins/);
    expect(status).not.toHaveTextContent(/Time A wins/);
  });

  test("a tie replaces the preview with the tie warning", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Score Time A"), "20");
    await user.type(screen.getByLabelText("Score Time C"), "20");
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("No ties in volleyball");
    expect(status).not.toHaveTextContent(/wins/);
  });

  test("saving clears the preview with the inputs", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Score Time A"), "25");
    await user.type(screen.getByLabelText("Score Time C"), "19");
    await user.click(screen.getByRole("button", { name: /save match/i }));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
