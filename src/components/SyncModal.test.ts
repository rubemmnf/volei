import { describe, expect, test } from "vitest";
import { parseRoomInput } from "./SyncModal";

describe("parseRoomInput", () => {
  const id = "AbCdEfGhIjKlMnOpQrStUv";

  test("accepts a full share link", () => {
    expect(parseRoomInput(`https://user.github.io/Volei/#room=${id}`)).toBe(id);
  });

  test("accepts a bare room id, since people paste both", () => {
    expect(parseRoomInput(id)).toBe(id);
  });

  test("accepts a link pasted with surrounding whitespace", () => {
    expect(parseRoomInput(`  https://user.github.io/Volei/#room=${id}  `)).toBe(id);
  });

  test("rejects empty input", () => {
    expect(parseRoomInput("   ")).toBeNull();
  });

  test("rejects an id that is too short to be a real room", () => {
    expect(parseRoomInput("abc123")).toBeNull();
  });

  test("rejects a link with no room in it", () => {
    expect(parseRoomInput("https://user.github.io/Volei/")).toBeNull();
  });
});
