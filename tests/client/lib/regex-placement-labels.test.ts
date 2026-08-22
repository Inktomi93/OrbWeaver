// The regex script LIST vocabulary — the one home both list surfaces (the library rows and the shared
// picker) read their subtitle from, in the TWO projections that home now serves: the picker's full phrase
// and the roster row's glyph-led one. Pure, so it tests in node: the relative formatter is INJECTED, which
// is exactly what keeps this deterministic (no wall clock reaches the assertion).
//
// The load-bearing property is X-16's: `Add script` mints every row named "New script" with an empty
// pattern, so the two authored discriminators (stage + pattern) are byte-identical across a freshly-filled
// library and the EDIT STAMP is the only thing that tells them apart.

import {
  REGEX_PLACEMENT_GLYPHS,
  REGEX_PLACEMENT_LABELS,
  regexPlacementStages,
  regexPlacementStep,
  regexRowScent,
  regexScriptScent,
  regexScriptTitle,
} from "@orb/client/lib";
import { REGEX_PLACEMENTS } from "@orb/kit/regex";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

/** A fixed, obviously-fake relative formatter — the subtitle under test is the COMPOSITION, not the
 *  formatting, and a real one would drag the wall clock into every assertion. */
const relative = (epochMs: number): string => `T${String(epochMs)}`;

const BORN = 1_760_000_000_000;

// Typed off the ROSTER projection, which is the wider of the two shapes: `regexScriptScent` dropped
// `enabled` from its input when the picker moved that state onto a named badge (side-eye 2026-08-22 P2-2),
// and one factory still has to feed both.
function script(over: Partial<Parameters<typeof regexRowScent>[0]> = {}): Parameters<typeof regexRowScent>[0] {
  return { enabled: true, findRegex: "\\(ooc\\)", placement: ["AI_OUTPUT"], updatedAt: BORN, ...over };
}

describe("regexScriptScent", () => {
  test("reads stage · pattern · edit stamp, in that order", () => {
    expect(regexScriptScent(script(), relative)).toBe(`model output · \\(ooc\\) · edited T${String(BORN)}`);
  });

  // THE PICKER'S SCENT NO LONGER SPEAKS THE ENABLE STATE (side-eye 2026-08-22 P2-2). It rode in front as a
  // bare `off ·` ~500px from a switch named `Attach <name>`, so one row read "off" at one end and showed an
  // ON switch at the other, about two different facts. The state is a NAMED badge on the row now
  // (`Disabled in your library` — pinned in regex-tab.ct.tsx), so the same script must produce the SAME
  // descriptive line either way: any `off` leaking back in is the collision returning.
  test("the enable state is NOT in the picker's line — it is the row's named badge", () => {
    const disabled = regexScriptScent(script({ enabled: false }), relative);
    expect(disabled).toBe(`model output · \\(ooc\\) · edited T${String(BORN)}`);
    expect(disabled).toBe(regexScriptScent(script(), relative));
  });

  test("X-16: two just-added rows differ ONLY by their stamp — which is why the stamp is on the line", () => {
    const blank = { findRegex: "", placement: [] } as const;
    const first = regexScriptScent(script({ ...blank, updatedAt: BORN }), relative);
    const second = regexScriptScent(script({ ...blank, updatedAt: BORN + 1 }), relative);
    // Every authored datum is identical (this IS the reported defect) and the subtitles are still distinct.
    expect(first.replace(`T${String(BORN)}`, "")).toBe(second.replace(`T${String(BORN + 1)}`, ""));
    expect(first).not.toBe(second);
  });

  test("an empty placement set says so — a saveable script that runs nowhere must be legible", () => {
    expect(regexScriptScent(script({ placement: [] }), relative)).toBe(`runs nowhere · \\(ooc\\) · edited T${String(BORN)}`);
  });

  test("an empty pattern says so rather than printing nothing", () => {
    expect(regexScriptScent(script({ findRegex: "" }), relative)).toBe(`model output · no pattern yet · edited T${String(BORN)}`);
  });

  test("an over-long pattern is elided, so a 128px title column stays scannable", () => {
    const scent = regexScriptScent(script({ findRegex: "x".repeat(200) }), relative);
    expect(scent).toContain("…");
    expect(scent).toContain(`edited T${String(BORN)}`); // the stamp survives the elision — it is not part of it
  });

  test("the stages read in PIPELINE order, not in the order the author picked them", () => {
    expect(regexScriptScent(script({ placement: ["AI_OUTPUT", "USER_INPUT"] }), relative)).toContain("your message · model output");
  });
});

// THE ROSTER ROW'S OWN PROJECTION (side-eye 2026-08-19 P1, ruled fork 2). Same vocabulary, same order, same
// elision, same stamp — the stage NAMES lift out to the glyph strip because the roster row renders in a
// 271-307px pane and the picker above renders in a dialog. What must NOT drift is the pair: whatever the
// glyph strip drops from the words, the words must not also drop.
describe("regexRowScent", () => {
  test("the PATTERN leads — the two data that tell two rows apart are first, not past the ellipsis", () => {
    expect(regexRowScent(script(), relative)).toBe(`\\(ooc\\) · edited T${String(BORN)}`);
  });

  test("a disabled row still leads with `off`", () => {
    expect(regexRowScent(script({ enabled: false }), relative)).toBe(`off · \\(ooc\\) · edited T${String(BORN)}`);
  });

  test("an empty placement set is said in WORDS — a strip of zero glyphs cannot say it", () => {
    expect(regexRowScent(script({ placement: [] }), relative)).toBe(`runs nowhere · \\(ooc\\) · edited T${String(BORN)}`);
  });

  test("no stage name reaches the line — that is the whole width fix", () => {
    const scent = regexRowScent(script({ placement: ["AI_OUTPUT", "PROMPT_HISTORY", "DISPLAY"] }), relative);
    for (const label of Object.values(REGEX_PLACEMENT_LABELS)) {
      expect(scent).not.toContain(label.toLowerCase());
    }
  });

  test("the pattern is NOT pre-cut — the row's own box does the one honest truncation", () => {
    // TWO TRUNCATIONS COMPOSE (side-eye 2026-08-19 P2-1). The row's title/subtitle spans are `truncate`, so
    // the BOX already elides at the pane's real width; clipping the pattern to a fixed 32 characters first
    // spends a second ellipsis mid-string on a cut nobody asked for, and it cuts by CHARACTER COUNT — blind
    // to the width it is supposedly protecting. The picker's wide-dialog projection keeps its own elision
    // (asserted above); this one hands the whole string to the box and lets CSS say where it stopped.
    const long = "x".repeat(200);
    const scent = regexRowScent(script({ findRegex: long }), relative);
    expect(scent).toContain(long);
    expect(scent).not.toContain("…");
  });

  test("X-16 survives the split: two just-added rows still differ ONLY by their stamp", () => {
    const blank = { findRegex: "", placement: [] } as const;
    const first = regexRowScent(script({ ...blank, updatedAt: BORN }), relative);
    const second = regexRowScent(script({ ...blank, updatedAt: BORN + 1 }), relative);
    expect(first.replace(`T${String(BORN)}`, "")).toBe(second.replace(`T${String(BORN + 1)}`, ""));
    expect(first).not.toBe(second);
  });
});

describe("regexPlacementStages / REGEX_PLACEMENT_GLYPHS", () => {
  test("the strip draws the whole SET, in pipeline order — never one member, never a count", () => {
    expect(regexPlacementStages(["DISPLAY", "USER_INPUT", "AI_OUTPUT"])).toEqual(["USER_INPUT", "AI_OUTPUT", "DISPLAY"]);
  });

  test("every placement has a glyph AND a label — the glyph strip drops nothing the words carried", () => {
    for (const placement of REGEX_PLACEMENTS) {
      expect(REGEX_PLACEMENT_GLYPHS[placement], placement).toBeTruthy();
      expect(REGEX_PLACEMENT_LABELS[placement], placement).toBeTruthy();
    }
  });

  test("the glyphs are DISTINCT — a strip where two stages draw the same mark says less than it looks", () => {
    expect(new Set(Object.values(REGEX_PLACEMENT_GLYPHS)).size).toBe(REGEX_PLACEMENTS.length);
  });
});

describe("regexScriptTitle / regexPlacementStep", () => {
  test("a nameless script is named once, here", () => {
    expect(regexScriptTitle({ name: "" })).toBe("Unnamed script");
    expect(regexScriptTitle({ name: "strip ooc" })).toBe("strip ooc");
  });

  test("a pipeline step reads as a regex step wherever it appears", () => {
    expect(regexPlacementStep("DISPLAY")).toBe("Regex · rendered transcript");
  });
});
