// S3 — the preset knob RESOLVER + the picker projection. `resolveRulePresetKnobs` is what makes the registry's
// type-erasure sound: every builder reads its bag as its own `TKnobs`, so a bag that is not that schema must
// never reach one. These pin the refusals (out of bounds, wrong kind, unknown key, empty entry) as TYPED
// errors rather than silent clamps — a host who typed 500 for a 2..200 cadence made a mistake worth telling
// them about, and a clamp would enable a rule that does something they did not ask for.

import { RULE_PRESET_IDS } from "@orb/contracts/automation";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { RuleValidationError } from "@orb/server/domain/automation";
import type { ErasedRulePresetDef } from "../../../../../packages/server/src/domain/automation/contract/presets.ts";
import { RULE_PRESETS } from "../../../../../packages/server/src/domain/automation/contract/presets.ts";
import {
  resolveChatRulePresetKnobs,
  resolveRulePresetKnobs,
  rulePresetSpendsAtDefaults,
  toRulePresetView,
} from "../../../../../packages/server/src/domain/automation/substrate/presets.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const PACING = RULE_PRESETS.pacingNudge;
const CHIPS = RULE_PRESETS.diceChips;
const CLOCK = RULE_PRESETS.clockFires;
/** The one `entityRef`-carrying preset (#630) — the auto-add-lore card's lorebook reference. */
const LORE = RULE_PRESETS.autoAddLore;
/** The one text knob whose own semantics declare `minLength: 0` — "Standing direction", "" = none (#1387). */
const STORY_PACING = RULE_PRESETS.storyPacing;

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

test("#1387: a text knob's OWN minLength decides the floor — a blanked required knob refuses AT THE KNOB, a minLength:0 knob resolves blank", () => {
  // `storyPacing`'s "Standing direction" is documented optional ("" = none) and its arm field
  // (`run_analysis.steer`) is `.optional()` with no `.min()` — a caller who blanks it after touching the
  // field must not be refused by a floor that does not know the difference between "optional" and
  // "required" text knobs.
  expect(resolveRulePresetKnobs(STORY_PACING.knobs, { steer: "" })).toMatchObject({ steer: "" });
  // A required text knob (minLength: 1, unchanged) still refuses blank — AT THE KNOB, before `createRule`
  // ever sees the arm — and the message names the field, not a bare zod complaint from deep inside
  // `automationActionSchema`.
  expect(() => resolveRulePresetKnobs(PACING.knobs, { steer: "" })).toThrow(/knob 'steer': must not be empty/u);
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

// ── #655: the SPEND signal ────────────────────────────────────────────────────────────────────────────
// The picker had none, and most of the presets commit the host to a RECURRING model charge (sixteen of the
// twenty-two once the three optional owner-picks land). These pin that the answer is DERIVED from the arms the builder actually
// emits — the whole reason a hand-kept `spends: boolean` on the def was refused: a flag an author forgets to
// flip is a lie on a money surface.

/** The presets whose default configuration mints a `SPEND_ARM_TYPES` arm — read off the catalogue, and the
 *  membership is the claim: `autoAddLore` writes a lore entry (free), `diceChips`/`openerChips`/`callAVote`
 *  surface chips (free), and everything else asks for a turn or an image. */
const SPENDING_PRESET_IDS = [
  "welcomeBackRecap",
  "pacingNudge",
  "illustrateScenes",
  "clockFires",
  "sceneVeil",
  "callback",
  "cutaways",
  "storyPacing",
  // C2's lore distillers each fire a `run_analysis` model pass on a cadence — SPEND-classed.
  "distillLore",
  "rumorMill",
  // #16 the needle: its READ half is a `run_analysis` pass every N beats. (Its other rule's
  // `set_chat_background` is deliberately NOT spend-classed — the quiet pick is cheap — so the row is true
  // because of the analysis, not the backdrop.)
  "theNeedle",
  // C3's prose audit fires a `run_analysis` pass too. At its DEFAULT knob it fires only on demand, and it is
  // still SPEND-classed — the derivation reads the ARM, not the cadence, and that is right: the money is spent
  // the moment the host presses Run now, so the picker must say so at the decision point either way.
  "proseAudit",
  // C6's #14 is a `run_analysis` pass too; its sibling #2 posts a notification, which costs nothing.
  "spotlightBalance",
  // C5's #20 fires a `generate_image` — an image per changed card, on the AUTHOR's own connection. It is
  // the one owner-GLOBAL row, and it is the row where the signal matters most: a library-wide rule bills on
  // events the host is not watching (an import run, a bulk edit), so the picker must say so before the add.
  "livingLibrary",
  // §4 #17 fires a `generate_image` and §4 #18 a `trigger_turn` — both SPEND_ARM_TYPES. §4 #19's
  // `set_chat_background` is a QUIET pick, deliberately NOT spend-classed (#16's ruling), so it is FREE and
  // lands in the negative half below, not here.
  "illustrateOnLoreReveal",
  "reactToLoreActivation",
];

test("#655: the spend signal names exactly the presets whose arms cost a model call", () => {
  const spending = RULE_PRESET_IDS.filter((id) => toRulePresetView(RULE_PRESETS[id]).spends);
  expect([...spending].toSorted()).toEqual([...SPENDING_PRESET_IDS].toSorted());
  // The negative half, stated: the free five are free, and a surface that marked everything would be as
  // useless as one that marked nothing. `asyncTableNudge` belongs here and the placement is the claim — its
  // only arm writes an inbox row, so an async table can be nudged forever without billing the host.
  expect(RULE_PRESET_IDS.filter((id) => !toRulePresetView(RULE_PRESETS[id]).spends).toSorted()).toEqual(
    // `autoSetSceneBackground` joins the free five: its only arm is the quiet `set_chat_background` pick,
    // which is NOT spend-classed (#16's ruling — the pick is cheap), so an auto-backdrop bills nothing.
    ["autoAddLore", "diceChips", "openerChips", "callAVote", "asyncTableNudge", "autoSetSceneBackground"].toSorted(),
  );
});

test("#655: the answer FOLLOWS the arm a knob chooses — the clock spends narrating and not notifying", () => {
  // This is the case that decided the design. `clockFires` emits `trigger_turn` under `firedArm: "narrate"`
  // (its default, so the catalogue row says it costs) and a FREE `post_notification` under `"notify"` — no
  // static fact about the def answers the question, only running the builder does. A def defaulting to
  // notify must therefore derive FALSE off the identical machinery.
  expect(rulePresetSpendsAtDefaults(CLOCK)).toBe(true);
  const firedArm = CLOCK.knobs["firedArm"];
  expect(firedArm?.kind).toBe("choice");
  const notifyingClock: ErasedRulePresetDef = {
    ...CLOCK,
    knobs: { ...CLOCK.knobs, ...(firedArm?.kind === "choice" ? { firedArm: { ...firedArm, default: "notify" } } : {}) },
  };
  expect(rulePresetSpendsAtDefaults(notifyingClock)).toBe(false);
});

test("#655: the derivation survives the one knob kind with NO default — the entityRef probe", () => {
  // `autoAddLore`'s `bookId` carries no descriptor default by construction (#630), so a naive "resolve the
  // defaults and build" would refuse before it could read an arm. The probe hands the builder a placeholder
  // it never mints; the arm TYPE it emits (`insert_world_info_entry`) is all that is read.
  expect(() => rulePresetSpendsAtDefaults(LORE)).not.toThrow();
  expect(rulePresetSpendsAtDefaults(LORE)).toBe(false);
});

test("every committed preset projects a complete, well-formed picker view", () => {
  const views = RULE_PRESET_IDS.map((id) => toRulePresetView(RULE_PRESETS[id]));
  expect(views.map((v) => v.id)).toEqual([...RULE_PRESET_IDS]);
  expect(views.filter((v) => v.title.length === 0 || v.summary.length === 0 || v.ruleCount < 1)).toEqual([]);
  // A knob with no label is an unrenderable editor; every descriptor carries one.
  expect(views.flatMap((v) => v.knobs).filter((knob) => knob.label.length === 0 || knob.key.length === 0)).toEqual([]);
});

test("resolveChatRulePresetKnobs (B10's capture belt): resolves a chat preset's bag COMPLETE, refuses a GLOBAL preset by name, refusals stay the knob law's own", () => {
  // A partial override completes from the descriptor defaults — the bag a cast stores.
  expect(resolveChatRulePresetKnobs("pacingNudge", { everyN: 4 })).toMatchObject({ everyN: 4 });
  expect(Object.keys(resolveChatRulePresetKnobs("pacingNudge", {})).toSorted()).toEqual(["everyN", "steer"]);
  // A cast is a ROOM artifact — the one global catalogue row refuses by name.
  expect(() => resolveChatRulePresetKnobs("livingLibrary", {})).toThrow(/cannot ride a saved cast/);
  expect(() => resolveChatRulePresetKnobs("livingLibrary", {})).toThrow(RuleValidationError);
  // The knob law rides through unchanged (bounds refused, never clamped).
  expect(() => resolveChatRulePresetKnobs("pacingNudge", { everyN: 5000 })).toThrow(RuleValidationError);
});
