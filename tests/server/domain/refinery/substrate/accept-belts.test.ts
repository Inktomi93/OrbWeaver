// domain/refinery/substrate/accept-belts — pins the two pure exports the classify/partition machinery
// feeds (resolveApplyBasis's db-backed load is exercised end-to-end by
// tests/server/domain/refinery/verbs/apply-fields.int.test.ts and apply-as-copy.int.test.ts): buildPatch's
// greetings ordering (replace before remove, append after both) and remapSelection's index shift across a
// removal (§15.2's worked example).

import type { CharacterCard } from "@orb/contracts/character";
import type { RefineryRewriteField, RefinerySelection } from "@orb/contracts/refinery";
import { describe } from "vitest";
import { buildPatch, remapSelection } from "../../../../../packages/server/src/domain/refinery/substrate/accept-belts.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const CARD: CharacterCard = {
  name: "Aria",
  description: "keeper",
  personality: "dry",
  scenario: null,
  greetings: [{ text: "Welcome." }, { text: "Back again?" }, { text: "Hello there." }],
  exampleMessages: null,
  systemPrompt: null,
  postHistoryInstructions: null,
  depthPrompt: { prompt: "Stay archival.", depth: 4, role: "system" },
  creatorNotes: null,
  creator: null,
  cardVersion: null,
  nickname: null,
  source: null,
  creationDate: null,
  modificationDate: null,
  extensions: null,
  residualData: null,
  avatarAssetId: null,
  refinery: null,
};

describe("buildPatch — non-greeting fields", () => {
  test("a REPLACE field writes its text; a CLEAR writes null, except description which writes empty string", () => {
    const chosen: RefineryRewriteField[] = [
      { field: "personality", text: "sharp" },
      { field: "scenario", cleared: true },
      { field: "description", cleared: true },
    ];
    const { patch } = buildPatch(CARD, chosen);
    expect(patch["personality"]).toBe("sharp");
    expect(patch["scenario"]).toBeNull();
    expect(patch["description"]).toBe("");
  });

  test("a depthPrompt REPLACE touches the note text only, keeping the directive; CLEAR drops both together", () => {
    const replaced = buildPatch(CARD, [{ field: "depthPrompt", text: "Stay dusty." }]);
    expect(replaced.patch["depthPrompt"]).toEqual({ prompt: "Stay dusty.", depth: 4, role: "system" });
    const cleared = buildPatch(CARD, [{ field: "depthPrompt", cleared: true }]);
    expect(cleared.patch["depthPrompt"]).toBeNull();
  });
});

describe("buildPatch — greetings: replace before remove, append LAST", () => {
  test("replacement lands at its pre-splice index; removal then filters; append lands after both, at the tail", () => {
    const chosen: RefineryRewriteField[] = [
      { field: "greetings", greetingIndex: 1, text: "The stacks missed you." }, // replace slot 1
      { field: "greetings", greetingIndex: 0, cleared: true }, // remove slot 0
      { field: "greetings", append: true, text: "A brand new hello." }, // append
    ];
    const { patch, removedGreetingIndexes } = buildPatch(CARD, chosen);
    const greetings = patch["greetings"] as { text: string }[];
    // Slot 0 removed; slot 1 (replaced) survives at the front; slot 2 unchanged; the new append at the tail.
    expect(greetings.map((g) => g.text)).toEqual(["The stacks missed you.", "Hello there.", "A brand new hello."]);
    expect(removedGreetingIndexes).toEqual([0]);
  });

  test("no greeting entries ⇒ patch carries no `greetings` key and reports zero removals", () => {
    const { patch, removedGreetingIndexes } = buildPatch(CARD, [{ field: "personality", text: "x" }]);
    expect("greetings" in patch).toBe(false);
    expect(removedGreetingIndexes).toEqual([]);
  });
});

describe("remapSelection — §15.2's worked example", () => {
  test("[0,2,3] minus a removal at 2 → [0,2] (survivors shift down by removals strictly below them)", () => {
    const selection: RefinerySelection = { fields: ["greetings"], greetingIndexes: [0, 2, 3] };
    expect(remapSelection(selection, [2])).toEqual({ fields: ["greetings"], greetingIndexes: [0, 2] });
  });

  test("a selection with NO greetingIndexes (means 'every greeting') needs no remap and passes through", () => {
    const selection: RefinerySelection = { fields: ["greetings"] };
    expect(remapSelection(selection, [0, 1])).toBe(selection);
  });

  test("selecting only removed slots legally ends up EMPTY, not restored to 'every greeting'", () => {
    const selection: RefinerySelection = { fields: ["greetings"], greetingIndexes: [1] };
    expect(remapSelection(selection, [1])).toEqual({ fields: ["greetings"], greetingIndexes: [] });
  });

  test("multiple removals compound the shift for a survivor above all of them", () => {
    const selection: RefinerySelection = { fields: ["greetings"], greetingIndexes: [5] };
    expect(remapSelection(selection, [1, 2, 3])).toEqual({ fields: ["greetings"], greetingIndexes: [2] });
  });
});
