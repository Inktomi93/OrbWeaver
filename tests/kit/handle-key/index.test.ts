import process from "node:process";
import { handleKey } from "@orb/kit/handle-key";
import { describe } from "vitest";
import { UNICODE_DATA_VERSION } from "../../../packages/kit/src/handle-key/unicode-data.ts";
import { expect, test } from "../../support/fixtures.ts";

const BMP_FIRST_PRINTABLE = 0x20;
const BMP_LAST = 0xff_ff;
const SURROGATES = [0xd8_00, 0xdf_ff] as const;

describe("handleKey", () => {
  test.each([
    ["an accented case variant", "Émile", "émile"],
    ["a Cyrillic capital look-alike", "Нost", "host"],
    ["a Cyrillic small look-alike", "нost", "host"],
    ["a full-width compatibility form", "ｈｏｓｔ", "host"],
    ["a digit look-alike", "h0st", "host"],
    ["a capital I standing for l", "paypaI", "paypal"],
    ["a lowercase-only look-alike", "ɑdmin", "admin"],
    ["a zero-width space inside", "ho​st", "host"],
    ["a whole-script Cyrillic spoof", "ѕсоре", "scope"],
  ])("%s shares the key: %s ≅ %s", (_, spoof, held) => {
    expect(handleKey(spoof)).toBe(handleKey(held));
  });

  test.each([
    ["host", "hosts"],
    ["rival", "rivalry"],
    ["Émile", "Emile"],
    ["alice", "bob"],
  ])("control: %s and %s stay distinct", (a, b) => {
    expect(handleKey(a)).not.toBe(handleKey(b));
  });

  test("every BMP code point keys the same as its upper- and lower-cased forms", () => {
    const mismatches: string[] = [];
    for (let cp = BMP_FIRST_PRINTABLE; cp <= BMP_LAST; cp++) {
      if (cp >= SURROGATES[0] && cp <= SURROGATES[1]) {
        continue;
      }
      const char = String.fromCodePoint(cp);
      const key = handleKey(char);
      if (handleKey(char.toUpperCase()) !== key || handleKey(char.toLowerCase()) !== key) {
        mismatches.push(cp.toString(16));
      }
    }
    expect(mismatches).toEqual([]);
  });

  // Stored keys mix the vendored tables with the engine's NFKC/NFD and case mapping, so an engine on another
  // Unicode version computes keys that no longer match the stored ones until the data is regenerated.
  test("the vendored tables are the engine's Unicode version", () => {
    expect(UNICODE_DATA_VERSION.startsWith(`${process.versions["unicode"] ?? "unknown"}.`)).toBe(true);
  });
});
