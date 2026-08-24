// S3 — the preset knob RESOLVER + the picker projection. `resolveRulePresetKnobs` is what makes the registry's
// type-erasure sound: every builder reads its bag as its own `TKnobs`, so a bag that is not that schema must
// never reach one. These pin the refusals (out of bounds, wrong kind, unknown key, empty entry) as TYPED
// errors rather than silent clamps — a host who typed 500 for a 2..200 cadence made a mistake worth telling
// them about, and a clamp would enable a rule that does something they did not ask for.

import { RULE_PRESET_IDS } from "@orb/contracts/automation";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { RuleValidationError } from "@orb/server/domain/automation";
import { RULE_PRESETS } from "../../../../../packages/server/src/domain/automation/contract/presets.ts";
import { resolveRulePresetKnobs, toRulePresetView } from "../../../../../packages/server/src/domain/automation/substrate/presets.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const PACING = RULE_PRESETS.pacingNudge;
const CHIPS = RULE_PRESETS.diceChips;
const CLOCK = RULE_PRESETS.clockFires;
/** The one `entityRef`-carrying preset (#630) — the auto-add-lore card's lorebook reference. */
const LORE = RULE_PRESETS.autoAddLore;

/** The entityRef refusal, verbatim: the host's noun, not "expected text" or a TypeID complaint. */
const NO_BOOK_CHOSEN = /knob 'bookId': choose a lorebook/u;

test("an empty override bag resolves to every descriptor's declared default", () => {
  expect(resolveRulePresetKnobs(PACING.knobs, {})).toEqual({
    everyN: 8,
    steer: "Take stock of the pacing: raise a complication, or let the scene breathe. One beat, no recap.",
  });
});

test("an override replaces exactly its own knob and leaves the rest at default", () => {
  expect(resolveRulePresetKnobs(PACING.knobs, { everyN: 3 })).toMatchObject({ everyN: 3 });
  // Read off the NARROWED descriptor: `default` is no longer on every arm of the union (the `entityRef`
  // kind has none, by construction — #630), so the read has to say which arm it means.
  const steer = PACING.knobs["steer"];
  expect(steer?.kind).toBe("text");
  expect(resolveRulePresetKnobs(PACING.knobs, { everyN: 3 })["steer"]).toBe(steer?.kind === "text" ? steer.default : undefined);
});

test("a number knob refuses out-of-range and non-integer values (refused, never clamped)", () => {
  expect(() => resolveRulePresetKnobs(PACING.knobs, { everyN: 500 })).toThrow(RuleValidationError);
  expect(() => resolveRulePresetKnobs(PACING.knobs, { everyN: 1 })).toThrow(RuleValidationError);
  expect(() => resolveRulePresetKnobs(PACING.knobs, { everyN: 4.5 })).toThrow(RuleValidationError);
  expect(() => resolveRulePresetKnobs(PACING.knobs, { everyN: "8" })).toThrow(RuleValidationError);
});

test("a text knob refuses empty and over-cap text", () => {
  expect(() => resolveRulePresetKnobs(PACING.knobs, { steer: "" })).toThrow(RuleValidationError);
  expect(() => resolveRulePresetKnobs(PACING.knobs, { steer: "x".repeat(601) })).toThrow(RuleValidationError);
  expect(resolveRulePresetKnobs(PACING.knobs, { steer: "x".repeat(600) })["steer"]).toHaveLength(600);
});

test("a textList knob refuses an emptied list, an over-long deck, and an empty entry", () => {
  // An emptied list would build a degenerate predicate / a zero-choice chip arm — mint-time refusal, not rot.
  expect(() => resolveRulePresetKnobs(CHIPS.knobs, { labels: [] })).toThrow(RuleValidationError);
  expect(() => resolveRulePresetKnobs(CHIPS.knobs, { labels: ["a", "b", "c", "d", "e"] })).toThrow(RuleValidationError);
  expect(() => resolveRulePresetKnobs(CHIPS.knobs, { labels: ["I wait.", ""] })).toThrow(RuleValidationError);
  expect(() => resolveRulePresetKnobs(CHIPS.knobs, { labels: "I wait." })).toThrow(RuleValidationError);
  expect(resolveRulePresetKnobs(CHIPS.knobs, { labels: ["I wait."] })).toEqual({ everyN: 3, labels: ["I wait."] });
});

test("a choice knob refuses an off-list option", () => {
  expect(() => resolveRulePresetKnobs(CLOCK.knobs, { firedArm: "shout" })).toThrow(RuleValidationError);
  expect(resolveRulePresetKnobs(CLOCK.knobs, { firedArm: "notify" })["firedArm"]).toBe("notify");
});

test("#630: an entityRef knob refuses an ABSENT choice — the kind with no default has nothing to bypass", () => {
  // The A3-verify hazard, closed structurally: `resolveKnob` hands a descriptor default back UNVALIDATED,
  // so a `default: ""` on a reference would have ridden into a mint. The kind carries no default at all,
  // and the refusal is the host's own noun rather than a TypeID complaint from deep inside the arm schema.
  expect(() => resolveRulePresetKnobs(LORE.knobs, {})).toThrow(NO_BOOK_CHOSEN);
  expect(() => resolveRulePresetKnobs(LORE.knobs, { bookId: "" })).toThrow(NO_BOOK_CHOSEN);
});

test("#630: an entityRef knob PARSES the id through its axis schema — a non-TypeID never reaches a builder", () => {
  expect(() => resolveRulePresetKnobs(LORE.knobs, { bookId: "Ashfall Canon" })).toThrow(RuleValidationError);
  // A well-formed id of the WRONG entity is refused too — the schema pins the prefix, not just the shape.
  expect(() => resolveRulePresetKnobs(LORE.knobs, { bookId: mintTypeId(ID_PREFIX.character) })).toThrow(RuleValidationError);
  const bookId = mintTypeId(ID_PREFIX.worldBook);
  expect(resolveRulePresetKnobs(LORE.knobs, { bookId })["bookId"]).toBe(bookId);
});

test("an override naming a knob the preset does not declare is REFUSED, never silently dropped", () => {
  // A typo'd key would otherwise mint a preset quietly running its defaults — the host's edit doing nothing.
  expect(() => resolveRulePresetKnobs(PACING.knobs, { everyn: 3 })).toThrow(RuleValidationError);
});

test("the picker projection flattens the knob schema and carries no CEL", () => {
  const view = toRulePresetView(CLOCK);
  expect(view).toMatchObject({ id: "clockFires", title: CLOCK.title, ruleCount: 2, confirmFirst: false });
  expect(view.knobs.map((knob) => knob.key)).toEqual(Object.keys(CLOCK.knobs));
  expect(view.knobs.map((knob) => knob.kind)).toEqual(["number", "choice", "text"]);
  expect(JSON.stringify(view)).not.toContain("vars.");
});

test("every committed preset projects a complete, well-formed picker view", () => {
  const views = RULE_PRESET_IDS.map((id) => toRulePresetView(RULE_PRESETS[id]));
  expect(views.map((v) => v.id)).toEqual([...RULE_PRESET_IDS]);
  expect(views.filter((v) => v.title.length === 0 || v.summary.length === 0 || v.ruleCount < 1)).toEqual([]);
  // A knob with no label is an unrenderable editor; every descriptor carries one.
  expect(views.flatMap((v) => v.knobs).filter((knob) => knob.label.length === 0 || knob.key.length === 0)).toEqual([]);
});
