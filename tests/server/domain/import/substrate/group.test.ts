// substrate/group — the ST group-definition parser. Pins: a memberless group is null (no room to make), a
// malformed/non-object JSON never throws (degrades to null), members resolve by FILENAME (never display
// name — the load-bearing disambiguation the header states), and generation_mode 1 maps to narratorOutput.

import { describe } from "vitest";
import { parseStGroupFile } from "../../../../../packages/server/src/domain/import/substrate/group.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function bytesOf(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj));
}

describe("parseStGroupFile", () => {
  test("a memberless group is null — no room to make", () => {
    expect(parseStGroupFile(bytesOf({ name: "Empty", members: [] }), "empty")).toBeNull();
  });

  test("unparseable JSON never throws — degrades to null", () => {
    expect(() => parseStGroupFile(new TextEncoder().encode("{not json"), "broken")).not.toThrow();
    expect(parseStGroupFile(new TextEncoder().encode("{not json"), "broken")).toBeNull();
  });

  test("a non-object JSON value (e.g. an array) is null", () => {
    expect(parseStGroupFile(bytesOf([1, 2, 3]), "list")).toBeNull();
  });

  test("members resolve by FILENAME, carried through verbatim (never display name)", () => {
    const result = parseStGroupFile(bytesOf({ name: "Party", members: ["Briar.png", "Lisa.png"] }), "party");
    expect(result?.memberFiles).toEqual(["Briar.png", "Lisa.png"]);
  });

  test("generation_mode 1 maps to narratorOutput: true; anything else is false", () => {
    // biome-ignore lint/style/useNamingConvention: ST group-file wire field names (snake_case) appear verbatim in test fixtures.
    const append = parseStGroupFile(bytesOf({ name: "G", members: ["a.png"], generation_mode: 1 }), "g");
    // biome-ignore lint/style/useNamingConvention: ST group-file wire field names (snake_case) appear verbatim in test fixtures.
    const swap = parseStGroupFile(bytesOf({ name: "G", members: ["a.png"], generation_mode: 0 }), "g");
    expect(append?.narratorOutput).toBe(true);
    expect(swap?.narratorOutput).toBe(false);
  });

  test("a missing name falls back to the fileStem", () => {
    const result = parseStGroupFile(bytesOf({ members: ["a.png"] }), "fallback-stem");
    expect(result?.name).toBe("fallback-stem");
  });
});
