// The hand-edit target derivation (#2243's extraction from `refinery-content-surface.tsx`). What is worth
// pinning here is the SLOT ADDRESSING, not the field switch: a greeting index the card no longer has is the
// one input that turns a dialog row into an unlandable write, and the "no indexes named" arm means
// "every greeting", not "none".

import { describe } from "vitest";
import { manualTargetsOf, manualTextOf } from "../../../../../packages/client/src/features/refinery/lib/manual-targets.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const CARD = {
  description: "a description",
  personality: null,
  scenario: "a scenario",
  exampleMessages: null,
  systemPrompt: null,
  postHistoryInstructions: null,
  creatorNotes: null,
  depthPrompt: { prompt: "at depth" },
  greetings: [{ text: "first" }, { text: "second" }],
} as const;

describe("manualTargetsOf", () => {
  test("drops a greeting index the card no longer has, rather than offering a slot that cannot land", () => {
    const targets = manualTargetsOf({ fields: ["greetings"], greetingIndexes: [0, 5] }, CARD);
    expect(targets).toStrictEqual([{ field: "greetings", greetingIndex: 0, text: "first" }]);
  });

  test("names EVERY greeting when the selection names no indexes", () => {
    const targets = manualTargetsOf({ fields: ["greetings"] }, CARD);
    expect(targets).toStrictEqual([
      { field: "greetings", greetingIndex: 0, text: "first" },
      { field: "greetings", greetingIndex: 1, text: "second" },
    ]);
  });

  test("carries the live text for a non-greeting field, and an empty string for a null one", () => {
    expect(manualTargetsOf({ fields: ["description", "personality"] }, CARD)).toStrictEqual([
      { field: "description", text: "a description" },
      { field: "personality", text: "" },
    ]);
  });
});

describe("manualTextOf", () => {
  test("reads the depth prompt through its wrapper, which is the one field that is not a bare string", () => {
    expect(manualTextOf(CARD, "depthPrompt")).toBe("at depth");
    expect(manualTextOf({ ...CARD, depthPrompt: null }, "depthPrompt")).toBe("");
  });
});
