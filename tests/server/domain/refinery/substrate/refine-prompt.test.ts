// Unit pins for the prompt substrate — the BELT-5 pin lives here (coordinator-hardened, both drift
// directions in ONE assertion pair): a card macro reaches the assembled prompt VERBATIM — unresolved
// (no name substitution) AND un-neutralized (no ZWSP). Plus: the anti-drift geometry (analyze anchors
// the ORIGINAL), the working-card overlay, and the populated-fields default selection.

import type { CharacterCard } from "@orb/contracts/character";
import {
  buildAnalyzePrompt,
  buildCardSections,
  buildScorePrompt,
  defaultSelectionOf,
  overlayRewrite,
} from "../../../../../packages/server/src/domain/refinery/substrate/refine-prompt.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const ZWSP = "\u200b";

const CARD: CharacterCard = {
  name: "Aria",
  description: "She calls {{user}} 'the visitor' and {{char}} keeps the ledger.",
  personality: "dry",
  scenario: null,
  greetings: [{ text: "Welcome, {{user}}." }, { text: "Back again?" }],
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

test("BELT 5 (both drift directions): card {{macros}} reach the prompt verbatim — unresolved AND un-neutralized", () => {
  const { system, user } = buildScorePrompt({
    card: CARD,
    selection: { fields: ["description", "greetings"] },
    mode: "full",
    guidance: "keep {{user}} nameless",
    overrides: {},
  });
  // Unresolved: the literal braces + macro names survive (no identity substitution ran).
  expect(user).toContain("She calls {{user}} 'the visitor' and {{char}} keeps the ledger.");
  expect(user).toContain("Welcome, {{user}}.");
  // Un-neutralized: no ZWSP anywhere (a neutralize step would split every brace pair).
  expect(user.includes(ZWSP)).toBe(false);
  expect(system.includes(ZWSP)).toBe(false);
  // Guidance is host-authored prompt input — also verbatim, also never macro-engine material.
  expect(user).toContain("keep {{user}} nameless");
});

test("anti-drift: the analyze prompt anchors the ORIGINAL and renders the overlaid rewrite beside it", () => {
  const rewrite = { fields: [{ field: "description" as const, text: "She files every visitor." }] };
  const { user } = buildAnalyzePrompt({ originalCard: CARD, selection: { fields: ["description"] }, mode: "full", guidance: null, overrides: {}, rewrite });
  const originalAt = user.indexOf("# ORIGINAL");
  const rewrittenAt = user.indexOf("# REWRITTEN");
  expect(originalAt).toBeGreaterThan(-1);
  expect(rewrittenAt).toBeGreaterThan(originalAt);
  // The original side carries the ORIGINAL text; the rewritten side the overlay.
  expect(user.slice(originalAt, rewrittenAt)).toContain("keeps the ledger");
  expect(user.slice(rewrittenAt)).toContain("She files every visitor.");
});

test("overlayRewrite replaces per-greeting by index and refuses to invent a depth-prompt directive", () => {
  const out = overlayRewrite(CARD, {
    fields: [
      { field: "greetings", greetingIndex: 1, text: "The stacks missed you." },
      { field: "depthPrompt", text: "Stay dusty." },
    ],
  });
  expect(out.greetings[0]?.text).toBe("Welcome, {{user}}.");
  expect(out.greetings[1]?.text).toBe("The stacks missed you.");
  expect(out.depthPrompt).toEqual({ prompt: "Stay dusty.", depth: 4, role: "system" });
  // A card with NO note keeps none (the directive is authored config, never model output).
  const noNote = overlayRewrite({ ...CARD, depthPrompt: null }, { fields: [{ field: "depthPrompt", text: "invented" }] });
  expect(noNote.depthPrompt).toBeNull();
});

test("defaultSelectionOf takes exactly the populated refinable fields; sections honor greetingIndexes", () => {
  expect(defaultSelectionOf(CARD)).toEqual({ fields: ["description", "personality", "greetings", "depthPrompt"] });
  const sections = buildCardSections(CARD, { fields: ["greetings"], greetingIndexes: [1] });
  expect(sections).toContain("## greetings[1]");
  expect(sections.includes("## greetings[0]")).toBe(false);
});
