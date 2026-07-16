// substrate/merge — pure deep-merge helpers. Asserts the load-bearing merge semantics: `undefined` skips,
// `null` CLEARS a top-level override (the null=CLEAR sentinel), nested plain objects recurse, and
// arrays/primitives REPLACE (no array-concat — else "set importSkipCharacters to [x]" is impossible).

import type { AppSettings } from "@orb/contracts/settings";
import { describe } from "vitest";
import { deepMergeAppSettings, deepMergePlain } from "../../../../../packages/server/src/domain/settings/substrate/merge.ts";
import { expect, test } from "../../../../support/fixtures";

describe("deepMergeAppSettings", () => {
  test("undefined skips, null clears a top-level override", () => {
    const base: AppSettings = { logLevel: "info", corpusAutoindex: true };
    const merged = deepMergeAppSettings(base, { logLevel: undefined, corpusAutoindex: null });
    expect(merged.logLevel).toBe("info");
    expect(merged.corpusAutoindex).toBeNull();
  });

  test("nested plain objects recurse (siblings survive)", () => {
    const base: AppSettings = { memoryDefaults: { blockSize: 8, maxTier: 3 } };
    const merged = deepMergeAppSettings(base, { memoryDefaults: { blockSize: 16 } });
    expect(merged.memoryDefaults).toEqual({ blockSize: 16, maxTier: 3 });
  });

  test("arrays REPLACE (no concat)", () => {
    const base: AppSettings = { importSkipCharacters: ["a", "b"] };
    const merged = deepMergeAppSettings(base, { importSkipCharacters: ["x"] });
    expect(merged.importSkipCharacters).toEqual(["x"]);
  });
});

describe("deepMergePlain", () => {
  test("deep-merges nested objects, undefined skips, arrays replace", () => {
    const merged = deepMergePlain({ a: { x: 1, y: 2 }, b: [1, 2], c: 9 }, { a: { y: 3 }, b: [9], c: undefined });
    expect(merged).toEqual({ a: { x: 1, y: 3 }, b: [9], c: 9 });
  });
});
