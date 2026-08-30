// domain/refinery/substrate/output-budget — pins the §8 arithmetic's two load-bearing invariants: the
// window clamp never drops the requested budget BELOW the shipped floor (the file's whole reason for
// existing — a caller that gets less than the floor silently truncates), and the RULED refusal
// (stageBudgetMisfitOf) fires ONLY when the caller explicitly capped below the predicted need.

import type { CharacterCard } from "@orb/contracts/character";
import { describe } from "vitest";
import type { StageEstimateSubject } from "../../../../../packages/server/src/domain/refinery/contract/prompts.ts";
import { outputEstimateOf, stageBudgetMisfitOf } from "../../../../../packages/server/src/domain/refinery/substrate/output-budget.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const CARD: CharacterCard = {
  name: "Aria",
  description: "A meticulous keeper of records with quite a lot to say about the archive and its many secrets.",
  personality: "dry, precise",
  scenario: null,
  greetings: [{ text: "Welcome, traveler." }],
  exampleMessages: null,
  systemPrompt: null,
  postHistoryInstructions: null,
  depthPrompt: null,
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

describe("outputEstimateOf", () => {
  test("score: scales with the number of addressed targets (fields + per-index greetings)", () => {
    const oneField: StageEstimateSubject = { stage: "score", card: CARD, selection: { fields: ["description"] } };
    const twoFields: StageEstimateSubject = { stage: "score", card: CARD, selection: { fields: ["description", "personality"] } };
    expect(outputEstimateOf(twoFields)).toBeGreaterThan(outputEstimateOf(oneField));
  });

  test("analyze is a near-fixed constant regardless of selection width", () => {
    const narrow: StageEstimateSubject = { stage: "analyze", card: CARD, selection: { fields: ["description"] } };
    const wide: StageEstimateSubject = { stage: "analyze", card: CARD, selection: { fields: ["description", "personality", "greetings"] } };
    expect(outputEstimateOf(narrow)).toBe(outputEstimateOf(wide));
  });

  test("rewrite scales by the mode factor over the selected content's own token mass", () => {
    const conservative: StageEstimateSubject = { stage: "rewrite", card: CARD, selection: { fields: ["description"] }, mode: "conservative" };
    const expansive: StageEstimateSubject = { stage: "rewrite", card: CARD, selection: { fields: ["description"] }, mode: "expansive" };
    expect(outputEstimateOf(expansive)).toBeGreaterThan(outputEstimateOf(conservative));
  });
});

describe("stageBudgetMisfitOf — the RULED refusal, narrow by construction", () => {
  const subject: StageEstimateSubject = { stage: "score", card: CARD, selection: { fields: ["description"] } };
  const needed = outputEstimateOf(subject);

  test("no explicit cap ⇒ never refuses — everyone without a preset override rides the payload-aware floor", () => {
    expect(stageBudgetMisfitOf({ subject, presetParams: {} })).toBeNull();
    expect(stageBudgetMisfitOf({ subject, presetParams: undefined })).toBeNull();
  });

  test("an explicit cap AT OR ABOVE the predicted need does not refuse", () => {
    expect(stageBudgetMisfitOf({ subject, presetParams: { maxOutputTokens: needed } })).toBeNull();
    expect(stageBudgetMisfitOf({ subject, presetParams: { maxOutputTokens: needed + 100 } })).toBeNull();
  });

  test("an explicit cap BELOW the predicted need refuses with the fit receipt", () => {
    const misfit = stageBudgetMisfitOf({ subject, presetParams: { maxOutputTokens: needed - 1 } });
    expect(misfit).toEqual({ needTokens: needed, capTokens: needed - 1 });
  });
});
