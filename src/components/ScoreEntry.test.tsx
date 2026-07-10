// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScoreEntry } from "./ScoreEntry";

function setup() {
  const onSave = vi.fn();
  render(<ScoreEntry teamAName="Team A" teamBName="Team B" onSave={onSave} />);
  return { onSave, user: userEvent.setup() };
}

describe("ScoreEntry", () => {
  test("save is disabled until both scores are entered", () => {
    setup();
    expect(screen.getByRole("button", { name: /save match/i })).toBeDisabled();
  });

  test("saves valid scores and clears inputs", async () => {
    const { onSave, user } = setup();
    await user.type(screen.getByLabelText("Score Team A"), "25");
    await user.type(screen.getByLabelText("Score Team B"), "19");
    await user.click(screen.getByRole("button", { name: /save match/i }));
    expect(onSave).toHaveBeenCalledWith(25, 19);
    expect(screen.getByLabelText("Score Team A")).toHaveValue(null);
  });

  test("rejects a tie", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Score Team A"), "20");
    await user.type(screen.getByLabelText("Score Team B"), "20");
    expect(screen.getByRole("button", { name: /save match/i })).toBeDisabled();
  });

  test("rejects negative scores", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Score Team A"), "-5");
    await user.type(screen.getByLabelText("Score Team B"), "19");
    expect(screen.getByRole("button", { name: /save match/i })).toBeDisabled();
  });
});
