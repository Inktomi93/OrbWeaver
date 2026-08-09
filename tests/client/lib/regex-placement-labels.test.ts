// The regex script LIST vocabulary — the one home both list surfaces (the library rows and the shared
// picker) read their subtitle from. Pure, so it tests in node: the relative formatter is INJECTED, which
// is exactly what keeps this deterministic (no wall clock reaches the assertion).
//
// The load-bearing property is X-16's: `Add script` mints every row named "New script" with an empty
// pattern, so the two authored discriminators (stage + pattern) are byte-identical across a freshly-filled
// library and the EDIT STAMP is the only thing that tells them apart.

import { regexPlacementStep, regexScriptScent, regexScriptTitle } from "@orb/client/lib";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

/** A fixed, obviously-fake relative formatter — the subtitle under test is the COMPOSITION, not the
 *  formatting, and a real one would drag the wall clock into every assertion. */
const relative = (epochMs: number): string => `T${String(epochMs)}`;

const BORN = 1_760_000_000_000;

function script(over: Partial<Parameters<typeof regexScriptScent>[0]> = {}): Parameters<typeof regexScriptScent>[0] {
  return { enabled: true, findRegex: "\\(ooc\\)", placement: ["AI_OUTPUT"], updatedAt: BORN, ...over };
}

describe("regexScriptScent", () => {
  test("reads stage · pattern · edit stamp, in that order", () => {
    expect(regexScriptScent(script(), relative)).toBe(`model output · \\(ooc\\) · edited T${String(BORN)}`);
  });

  test("a disabled row leads with `off` — its presence in the list is otherwise unexplained", () => {
    expect(regexScriptScent(script({ enabled: false }), relative)).toBe(`off · model output · \\(ooc\\) · edited T${String(BORN)}`);
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

describe("regexScriptTitle / regexPlacementStep", () => {
  test("a nameless script is named once, here", () => {
    expect(regexScriptTitle({ name: "" })).toBe("Unnamed script");
    expect(regexScriptTitle({ name: "strip ooc" })).toBe("strip ooc");
  });

  test("a pipeline step reads as a regex step wherever it appears", () => {
    expect(regexPlacementStep("DISPLAY")).toBe("Regex · rendered transcript");
  });
});
