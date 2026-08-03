// D46 config plane — `resolveChoiceVariables` (the ChoiceBlock picks → concrete env map). Mirrors neo's
// resolution cases: default fallback, options[0] fallback, empty-string ≠ picked, multiSelect join passthrough,
// randomPick via a STUB prng (deterministic), orphan-preserve, and the merged-read mode (no randomPick).

import type { ChoiceBlockSpec } from "@orb/contracts/preset";
import { resolveChoiceVariables } from "../../../../../packages/server/src/domain/chat/substrate/variables.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** Build a ChoiceBlockSpec with the schema defaults applied (multiSelect false, separator ", ", randomPick false). */
function spec(over: Partial<ChoiceBlockSpec> & Pick<ChoiceBlockSpec, "name" | "options">): ChoiceBlockSpec {
  return {
    question: "q",
    multiSelect: false,
    separator: ", ",
    randomPick: false,
    ...over,
  };
}

// A stub prng — determinism gate: never `Math.random`. Returns a FIXED float so a pick is reproducible.
function stubPrng(v: number): () => number {
  return (): number => v;
}
const FULL = { withRandomPick: true } as const;
const MERGED = { withRandomPick: false } as const;

test("unpicked variable falls back to defaultValue", () => {
  const specs = [spec({ name: "pov", options: [{ label: "1st", value: "first" }], defaultValue: "second" })];
  expect(resolveChoiceVariables(specs, {}, stubPrng(0), FULL)).toEqual({ pov: "second" });
});

test("unpicked variable with no defaultValue falls back to options[0].value", () => {
  const specs = [
    spec({
      name: "tense",
      options: [
        { label: "Past", value: "past" },
        { label: "Now", value: "present" },
      ],
    }),
  ];
  expect(resolveChoiceVariables(specs, {}, stubPrng(0), FULL)).toEqual({ tense: "past" });
});

test("an empty-string pick counts as UNPICKED (falls back, not the empty string)", () => {
  const specs = [spec({ name: "pov", options: [{ label: "1st", value: "first" }], defaultValue: "def" })];
  expect(resolveChoiceVariables(specs, { pov: "" }, stubPrng(0), FULL)).toEqual({ pov: "def" });
});

test("a non-empty pick wins over the default", () => {
  const specs = [spec({ name: "pov", options: [{ label: "1st", value: "first" }], defaultValue: "def" })];
  expect(resolveChoiceVariables(specs, { pov: "chosen" }, stubPrng(0), FULL)).toEqual({
    pov: "chosen",
  });
});

test("multiSelect without randomPick passes the separator-joined string through", () => {
  const specs = [
    spec({
      name: "traits",
      options: [{ label: "A", value: "a" }],
      multiSelect: true,
      separator: ", ",
    }),
  ];
  const stored = { traits: "brave, kind, wry" };
  expect(resolveChoiceVariables(specs, stored, stubPrng(0), FULL)).toEqual({
    traits: "brave, kind, wry",
  });
});

test("randomPick (multiSelect) draws ONE option via the injected prng", () => {
  const specs = [
    spec({
      name: "style",
      options: [{ label: "x", value: "x" }],
      multiSelect: true,
      randomPick: true,
      separator: "|",
    }),
  ];
  const stored = { style: "noir|whimsy|epic" };
  // prng 0 → index floor(0*3)=0 → "noir"; prng ~0.7 → floor(0.7*3)=2 → "epic".
  expect(resolveChoiceVariables(specs, stored, stubPrng(0), FULL)).toEqual({ style: "noir" });
  expect(resolveChoiceVariables(specs, stored, stubPrng(0.7), FULL)).toEqual({ style: "epic" });
});

test("randomPick trims + drops empty segments before drawing", () => {
  const specs = [
    spec({
      name: "s",
      options: [{ label: "x", value: "x" }],
      multiSelect: true,
      randomPick: true,
      separator: ",",
    }),
  ];
  // " a , , b " → ["a","b"]; prng 0 → "a".
  expect(resolveChoiceVariables(specs, { s: " a , , b " }, stubPrng(0), FULL)).toEqual({ s: "a" });
});

test("MERGED mode (withRandomPick:false) SKIPS the random draw — stable passthrough", () => {
  const specs = [
    spec({
      name: "style",
      options: [{ label: "x", value: "x" }],
      multiSelect: true,
      randomPick: true,
      separator: "|",
    }),
  ];
  const stored = { style: "noir|whimsy|epic" };
  // No draw — the joined string is returned as-is (a stable read; the prng is never consulted).
  expect(resolveChoiceVariables(specs, stored, stubPrng(0.99), MERGED)).toEqual({
    style: "noir|whimsy|epic",
  });
});

test("orphan-preserve: a stored pick with no declared variable survives", () => {
  const specs = [spec({ name: "pov", options: [{ label: "1st", value: "first" }], defaultValue: "def" })];
  const stored = { pov: "chosen", legacy: "kept" };
  expect(resolveChoiceVariables(specs, stored, stubPrng(0), FULL)).toEqual({
    pov: "chosen",
    legacy: "kept",
  });
});

test("no declared variables ⇒ the merged read collapses to the raw stored picks", () => {
  const stored = { a: "1", b: "2" };
  expect(resolveChoiceVariables([], stored, stubPrng(0), MERGED)).toEqual(stored);
});
