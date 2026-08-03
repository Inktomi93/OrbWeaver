// The DISPLAY/PROMPT tier derivation (side-eye X-1 + X-2, owner-ratified 2026-08-03).
//
// `markdownOnly` and `promptOnly` shipped as two independent switches that could BOTH be on, telling the
// user the script both does and does not touch the prompt — while "Display only" was simultaneously the
// label of a `Runs on` chip in the same dialog. Reading the executor settled the shape: both flags are pure
// MASKS over `placement` (`@orb/kit/regex` skips a `markdownOnly` script on every non-DISPLAY leg and a
// `promptOnly` one on DISPLAY), so any independent control keeps the dead state authorable. Deriving makes
// it unrepresentable.
//
// These pin the three arms AND the property that motivated them: the pair can never both be true.

import type { CreateRegexScriptInput } from "@orb/contracts/regex";
import { REGEX_PLACEMENTS, SubstituteFindRegex } from "@orb/kit/regex";
import { describe } from "vitest";
import { deriveRegexTierFlags, withDerivedTierFlags } from "../../../../../packages/client/src/features/regex/lib/derive-tier-flags";
import { expect, test } from "../../../../support/fixtures";

/** Exactly what an ST card carrying BOTH tier flags lifts into: stored as imported (deliberately — see the
 *  derive site's header), inert at execution because the two masks cancel, and healed on the next save. */
const IMPORTED_CONTRADICTION: CreateRegexScriptInput = {
  name: "strip ooc",
  findRegex: "\\(ooc\\)",
  replaceString: "",
  placement: ["AI_OUTPUT", "DISPLAY"],
  enabled: true,
  markdownOnly: true,
  promptOnly: true,
  runOnEdit: false,
  trimStrings: [],
  substituteRegex: SubstituteFindRegex.none,
};

describe("deriveRegexTierFlags — the three arms", () => {
  test("DISPLAY alone ⇒ markdownOnly (render-tier only)", () => {
    expect(deriveRegexTierFlags(["DISPLAY"])).toEqual({ markdownOnly: true, promptOnly: false });
  });

  test("no DISPLAY ⇒ promptOnly (never touches what is rendered)", () => {
    expect(deriveRegexTierFlags(["USER_INPUT", "AI_OUTPUT"])).toEqual({ markdownOnly: false, promptOnly: true });
  });

  test("DISPLAY plus a prompt-side stream ⇒ neither flag — it runs on both sides, as the chips say", () => {
    expect(deriveRegexTierFlags(["AI_OUTPUT", "DISPLAY"])).toEqual({ markdownOnly: false, promptOnly: false });
  });
});

/** Every subset of a tuple, including the empty one — grown one member at a time (no bit masks: the house
 *  bans bitwise operators, and a power-set built by doubling reads better anyway). */
function subsetsOf<T>(members: readonly T[]): readonly (readonly T[])[] {
  const out: T[][] = [[]];
  for (const member of members) {
    for (const subset of [...out]) {
      out.push([...subset, member]);
    }
  }
  return out;
}

test("the contradiction is UNREPRESENTABLE — no placement set yields both flags", () => {
  const subsets = subsetsOf(REGEX_PLACEMENTS);
  expect(subsets).toHaveLength(2 ** REGEX_PLACEMENTS.length);
  for (const placement of subsets) {
    const flags = deriveRegexTierFlags(placement);
    expect(flags.markdownOnly && flags.promptOnly, `both flags true for [${placement.join(",")}]`).toBe(false);
  }
});

test("the empty set lands on the promptOnly arm and stays inert (the executor skips it either way)", () => {
  expect(deriveRegexTierFlags([])).toEqual({ markdownOnly: false, promptOnly: true });
});

// ── The SECOND derivation: the ephemeral leg's depth scope ───────────────────────────────────────────────
// `historyDepth` is not a mask — it is a field that has no meaning without `PROMPT_HISTORY`, and the
// contract refuses either half alone. So the save boundary owns the pairing exactly as it owns the flags:
// the scope appears with the chip and leaves with it, and the editor renders its controls on the same
// condition, so the screen and the row cannot disagree.

test("adding the history leg mints the whole-history scope; the authored bounds survive a later save", () => {
  const scoped = withDerivedTierFlags({ ...IMPORTED_CONTRADICTION, placement: ["PROMPT_HISTORY"] });
  expect(scoped.historyDepth).toEqual({ min: 0, max: null });
  const narrowed = withDerivedTierFlags({ ...scoped, historyDepth: { min: 2, max: 6 } });
  expect(narrowed.historyDepth).toEqual({ min: 2, max: 6 });
});

test("dropping the history chip DROPS the scope — a depth that governs nothing is never persisted", () => {
  const scoped = withDerivedTierFlags({ ...IMPORTED_CONTRADICTION, placement: ["PROMPT_HISTORY"], historyDepth: { min: 3, max: null } });
  const unscoped = withDerivedTierFlags({ ...scoped, placement: ["AI_OUTPUT"] });
  expect(unscoped).not.toHaveProperty("historyDepth");
});

test("the pairing holds for EVERY placement subset — scope iff leg", () => {
  for (const placement of subsetsOf(REGEX_PLACEMENTS)) {
    const saved = withDerivedTierFlags({ ...IMPORTED_CONTRADICTION, placement: [...placement], historyDepth: { min: 1, max: null } });
    expect(saved.historyDepth !== undefined, `scope/leg disagree for [${placement.join(",")}]`).toBe(placement.includes("PROMPT_HISTORY"));
  }
});

test("the save boundary HEALS a row whose stored flags contradict its placement (an ST import can)", () => {
  const saved = withDerivedTierFlags(IMPORTED_CONTRADICTION);
  // `AI_OUTPUT` + `DISPLAY` is the both-sides arm, so neither mask survives — the script goes from
  // "skipped everywhere" to doing what its chips say.
  expect(saved.markdownOnly).toBe(false);
  expect(saved.promptOnly).toBe(false);
  // …and nothing else about the row is touched by the heal.
  expect(saved.placement).toEqual(IMPORTED_CONTRADICTION.placement);
  expect(saved.findRegex).toBe(IMPORTED_CONTRADICTION.findRegex);
  expect(saved.name).toBe(IMPORTED_CONTRADICTION.name);
});
