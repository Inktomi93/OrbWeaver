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

// ── A SELECTED-BUT-EMPTY field is a scoreable OPPORTUNITY, not an absence (schema-renderer §7c) ──────────
// Before this, an empty selected field was silently omitted from the prompt, so the model could not tell
// "scenario is blank" from "scenario was never in scope" — and a fill-empty rewrite could only happen if
// the model VOLUNTEERED an entry for a field it was never shown.

test("a selected-but-EMPTY field renders its own labeled section (the model can see the hole)", () => {
  const sections = buildCardSections(CARD, { fields: ["description", "scenario", "systemPrompt"] });
  expect(sections).toContain("## description");
  // `scenario`/`systemPrompt` are null on this card, yet the user selected them.
  expect(sections).toContain("## scenario");
  expect(sections).toContain("## systemPrompt");
  expect(sections).toContain("(this field is empty)");
});

test("a selected-but-EMPTY greeting slot renders too — an empty slot is addressable, an unselected one is not", () => {
  const card: CharacterCard = { ...CARD, greetings: [{ text: "Welcome." }, { text: "" }] };
  const sections = buildCardSections(card, { fields: ["greetings"], greetingIndexes: [1] });
  expect(sections).toContain("## greetings[1]");
  expect(sections).toContain("(this field is empty)");
  // The fence is SELECTION, never emptiness: an unselected slot still never reaches the prompt.
  expect(sections.includes("## greetings[0]")).toBe(false);
});

test("overlayRewrite honors a CLEARED entry: text fields empty, a greeting slot is REMOVED", () => {
  const out = overlayRewrite(CARD, {
    fields: [
      { field: "personality", cleared: true },
      { field: "greetings", greetingIndex: 0, cleared: true },
      { field: "depthPrompt", cleared: true },
    ],
  });
  expect(out.personality).toBeNull();
  expect(out.depthPrompt).toBeNull();
  // The removal shifts the survivor down — the same write the apply verb performs on the live card.
  expect(out.greetings).toHaveLength(1);
  expect(out.greetings[0]?.text).toBe("Back again?");
  // …and the analyze REWRITTEN side therefore shows the consolidation as an emptied section, not as a
  // silently missing one (which would read to the model as "never in scope").
  const { user } = buildAnalyzePrompt({
    originalCard: CARD,
    selection: { fields: ["personality"] },
    mode: "full",
    guidance: null,
    overrides: {},
    rewrite: { fields: [{ field: "personality", cleared: true }] },
  });
  expect(user.slice(user.indexOf("# REWRITTEN"))).toContain("(this field is empty)");
});

// ── The {{shape}} splice (schema-renderer §9.3) ──────────────────────────────────────────────────────────
// The per-stage JSON restatement is ENGINE-SPLICED, not baked into owner-editable prose: a host override
// keeps an honest shape across schema switches, and the custom-schema arm has one seam to fill.

test("the stage SYSTEM prompt restates its payload shape by splice — a host override keeps it", () => {
  const shipped = buildScorePrompt({ card: CARD, selection: { fields: ["description"] }, mode: "full", guidance: null, overrides: {} });
  // The shipped default still teaches the shape (the splice fills the token, byte-for-byte usable).
  expect(shipped.system).toContain('"fieldScores"');
  expect(shipped.system).toContain('"overallScore"');
  expect(shipped.system.includes("{{shape}}")).toBe(false);
  // A host override carrying the token gets the ACTIVE shape spliced in — the token is the contract.
  const overridden = buildScorePrompt({
    card: CARD,
    selection: { fields: ["description"] },
    mode: "full",
    guidance: null,
    overrides: { "refinery.score.system": { text: "Answer as: {{shape}}", baseVersion: 1 } },
  });
  expect(overridden.system.startsWith("Answer as: {")).toBe(true);
  expect(overridden.system).toContain('"fieldScores"');
  expect(overridden.system.includes("{{shape}}")).toBe(false);
});
