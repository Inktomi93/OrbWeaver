// lib/character-card-form-model — the §2 wire-discipline mappers ("THE correctness spine", F19): the
// `"" ⇒ null` clear semantics, normalizeGreetings, the depthPrompt re-nest, the §6.5 permanent/total token
// field sets, and the §2 CHANGED-KEYS diff (F3). DOM-free pure logic → a browser-free unit test
// (Spine-Testing.md §7). Deep-imports the pure lib module (NOT the feature barrel — a barrel drags browser
// TSX into the dom-less typecheck:graph program; the character-list-view.test precedent).

import {
  characterCardFormFromDetail,
  characterUpdateDiff,
  characterUpdateFromForm,
  DEFAULT_CHARACTER_CARD_FORM,
  permanentTokenCount,
  totalTokenCount,
} from "../../../../../packages/client/src/features/character/lib/character-card-form-model";
import { expect, test } from "../../../../support/fixtures";
import { makeCharacterDetail } from "../fixtures";

// Single downcast of the plain-literal fixture to the inferred (brand-carrying) `character.get` output the
// mappers accept — the honest bridge the fixture file itself documents (branded ids are compile-time only;
// `routeTrpc` fulfils raw JSON). A single `as` (never `as unknown as`) keeps the no-test-fabrication gate.
type CardDetail = Parameters<typeof characterCardFormFromDetail>[0];
const card = (over: Partial<ReturnType<typeof makeCharacterDetail>> = {}): CardDetail => makeCharacterDetail(over) as CardDetail;

const form = (over: Partial<typeof DEFAULT_CHARACTER_CARD_FORM> = {}): typeof DEFAULT_CHARACTER_CARD_FORM => ({ ...DEFAULT_CHARACTER_CARD_FORM, ...over });

// ── characterCardFormFromDetail (read → form) ──────────────────────────────────────────────────────

test("characterCardFormFromDetail maps null text columns to empty strings", () => {
  const values = characterCardFormFromDetail(card({ personality: null, scenario: null }));
  expect(values.personality).toBe("");
  expect(values.scenario).toBe("");
});

test("characterCardFormFromDetail seeds one empty greeting slot when the card has none", () => {
  expect(characterCardFormFromDetail(card({ greetings: [] })).greetings).toEqual([""]);
});

test("characterCardFormFromDetail flattens a present depthPrompt into its three siblings", () => {
  const values = characterCardFormFromDetail(card({ depthPrompt: { prompt: "stay in character", depth: 2, role: "assistant" } }));
  expect(values.depthPromptText).toBe("stay in character");
  expect(values.depthPromptDepth).toBe(2);
  expect(values.depthPromptRole).toBe("assistant");
});

// ── characterUpdateFromForm ("" ⇒ null; normalizeGreetings; depthPrompt re-nest) ─────────────────────

test("characterUpdateFromForm clears an emptied nullable field to null (orNull)", () => {
  // A sign-flip in orNull (return the value when empty) makes this null assertion fail.
  const patch = characterUpdateFromForm(form({ personality: "   " }));
  expect(patch.personality).toBeNull();
});

test("characterUpdateFromForm sends description as-is (non-nullable — never null)", () => {
  expect(characterUpdateFromForm(form({ description: "" })).description).toBe("");
});

test("characterUpdateFromForm keeps greeting[0] but drops trailing empty alternates", () => {
  // The text-only editor lifts each greeting into the wire `Greeting` shape (`{ text }`, no `groupOnly`).
  expect(characterUpdateFromForm(form({ greetings: ["hi", "", "  "] })).greetings).toEqual([{ text: "hi" }]);
  // An empty FIRST message is still a real slot.
  expect(characterUpdateFromForm(form({ greetings: [""] })).greetings).toEqual([{ text: "" }]);
});

test("characterUpdateFromForm re-nests depthPrompt, or null when the note text is empty", () => {
  expect(characterUpdateFromForm(form({ depthPromptText: "" })).depthPrompt).toBeNull();
  expect(characterUpdateFromForm(form({ depthPromptText: "note", depthPromptDepth: 3, depthPromptRole: "user" })).depthPrompt).toEqual({
    prompt: "note",
    depth: 3,
    role: "user",
  });
});

// ── §6.5 token field sets ────────────────────────────────────────────────────────────────────────

test("permanentTokenCount counts description but NOT creatorNotes / name / greetings", () => {
  const base = permanentTokenCount(form());
  expect(permanentTokenCount(form({ creatorNotes: "a long note about the author" }))).toBe(base);
  expect(permanentTokenCount(form({ name: "Some Long Name Here" }))).toBe(base);
  expect(permanentTokenCount(form({ greetings: ["a very long opening line indeed"] }))).toBe(base);
  expect(permanentTokenCount(form({ description: "a lengthy backstory paragraph" }))).toBeGreaterThan(base);
});

test("totalTokenCount adds name + the ACTIVE greeting on top of permanent", () => {
  const values = form({
    greetings: ["short", "a much longer alternate greeting line"],
    name: "Aria",
  });
  const permanent = permanentTokenCount(values);
  expect(totalTokenCount(values, 0)).toBeGreaterThan(permanent);
  // The active-index greeting is the one counted — index 1 is longer than index 0.
  expect(totalTokenCount(values, 1)).toBeGreaterThan(totalTokenCount(values, 0));
});

// ── §2 characterUpdateDiff (F3 — changed keys only) ─────────────────────────────────────────────────

test("characterUpdateDiff emits nothing when the form matches the server row", () => {
  const detail = card({ personality: "brave", scenario: "a tavern" });
  const values = characterCardFormFromDetail(detail);
  expect(Object.keys(characterUpdateDiff(values, detail))).toHaveLength(0);
});

test("characterUpdateDiff emits ONLY the changed key", () => {
  const detail = card({ personality: "brave", scenario: "a tavern" });
  const values = characterCardFormFromDetail(detail);
  const patch = characterUpdateDiff({ ...values, scenario: "a ship" }, detail);
  expect(Object.keys(patch)).toEqual(["scenario"]);
  expect(patch.scenario).toBe("a ship");
});

test("characterUpdateDiff sends a present null (not omission) when a field is cleared", () => {
  const detail = card({ personality: "brave" });
  const values = characterCardFormFromDetail(detail);
  const patch = characterUpdateDiff({ ...values, personality: "" }, detail);
  expect("personality" in patch).toBe(true);
  expect(patch.personality).toBeNull();
});

test("characterUpdateDiff does NOT re-send untouched fields (the two-tab revert bug §2 forbids)", () => {
  const detail = card({ personality: "brave", scenario: "a tavern", systemPrompt: "be terse" });
  const values = characterCardFormFromDetail(detail);
  // Edit only the name — nothing else must ride along.
  const patch = characterUpdateDiff({ ...values, name: "Aria the Bold" }, detail);
  expect(Object.keys(patch)).toEqual(["name"]);
});
