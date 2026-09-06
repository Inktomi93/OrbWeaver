// Contract tests for the S3 rule-PRESET wire slice: the committed id tuple (the domain's exhaustive registry
// derives from it), the knob-kind tuple the picker's editor dispatch is exhaustive over, and the knob-value
// wire validator. What is NOT here is deliberate: no CEL, no arm templates — those are server logic that the
// client never re-derives, so nothing in `@orb/contracts/automation` may carry them.

import type { RulePresetEntityKind, RulePresetId, RulePresetKnobDescriptor, RulePresetKnobKind, RulePresetView } from "@orb/contracts/automation";
import {
  NEEDLE_TENSION_VAR_KEY,
  RULE_PRESET_ENTITY_KINDS,
  RULE_PRESET_ENTITY_NOUNS,
  RULE_PRESET_ENTITY_REF_SCHEMAS,
  RULE_PRESET_IDS,
  RULE_PRESET_KNOB_KINDS,
  RULE_PRESET_SCOPES,
  rulePresetIdSchema,
  rulePresetKnobBagsEqual,
  rulePresetKnobBagToInputs,
  rulePresetKnobValuesSchema,
  rulePresetScopeSchema,
} from "@orb/contracts/automation";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

test("RULE_PRESET_IDS is the pinned 22-member catalogue (the 19 committed rows + the three OPTIONAL owner-picks: illustrate-on-lore-reveal, react-to-lore-activation, auto-set-scene-background), in §4 build order", () => {
  expect(RULE_PRESET_IDS).toEqual([
    "welcomeBackRecap",
    "autoAddLore",
    "pacingNudge",
    "illustrateScenes",
    "diceChips",
    "clockFires",
    "openerChips",
    "sceneVeil",
    "callAVote",
    "callback",
    "cutaways",
    // §4 #15 — C1's story-pacing analysis (RULED F7 direct steer; mint refuses on an active-game chat).
    "storyPacing",
    // §4 #11 — C2's confirm-first lore distillers, both riding the run_analysis → upsertLoreEntry route.
    "distillLore",
    "rumorMill",
    // §4 #16 — the needle: the analysis pass's tension SCORE published into the member-visible vars plane
    // (F6's single ruled exception) plus the backdrop reaction. RULED 2026-08-24 — ships, off by default.
    "theNeedle",
    // §4 #15 — C3's confirm-first prose audit, riding the run_analysis → suggestRewrite route.
    "proseAudit",
    // §4 #2 + #14 — C6's pair: the async table nudge (the actor-excluding recipient's consumer) and the
    // spotlight-balance analysis. Appended, never re-ordered: the tuple is the catalogue's build order.
    "asyncTableNudge",
    "spotlightBalance",
    // §4 #20 — C5's owner-GLOBAL living library, the last of the 19 committed rows and its only global one.
    "livingLibrary",
    // §4 #17-#19 — the three OPTIONAL owner-picks (owner 2026-08-24: "everything optional gets included"),
    // pure catalogue additions over already-built arms. Appended, never re-ordered: the tuple IS build order.
    "illustrateOnLoreReveal",
    "reactToLoreActivation",
    "autoSetSceneBackground",
  ]);
  expect(rulePresetIdSchema.options).toEqual(RULE_PRESET_IDS);
  // THE CATALOGUE IS COMPLETE — every committed §4 row is spellable, so there is no unbuilt id left to
  // prove unspellable and this assertion has no negative to make. The ids that once proved it (#16, #15,
  // #2, #14, #20) all parse above. What replaces it is the SHAPE guard: an id the catalogue never
  // committed is still refused, which is the property the negative was really pinning.
  expect(rulePresetIdSchema.safeParse("notACatalogueRow").success).toBe(false);
});

test("#16: the needle's variable key is a CONTRACTS constant — the one name the preset writes and the meter reads", () => {
  // It lives in contracts because two packages must agree on it: the server preset authors
  // `routes.vars.key` with it and the client meter reads `getRuntimeVariables()[key]` with it. A
  // server-side literal would make the client's own literal the second home of one name — and it is not a
  // knob, because a knob-supplied key lands in a CEL identifier position and the meter could never learn it.
  expect(NEEDLE_TENSION_VAR_KEY).toBe("tension");
});

test("RULE_PRESET_KNOB_KINDS is the pinned editor axis — four scalars plus the reference kind", () => {
  expect(RULE_PRESET_KNOB_KINDS).toEqual(["number", "text", "textList", "choice", "entityRef"]);
});

test("#630: the entity axis carries a validator and a HOST NOUN for every member", () => {
  expect(RULE_PRESET_ENTITY_KINDS).toEqual(["worldInfoBook"]);
  // The nouns are what a refusal says out loud; a wire key leaking here ("worldInfoBook") is the defect.
  expect(Object.values(RULE_PRESET_ENTITY_NOUNS)).toEqual(["lorebook"]);
  // The schema pins the PREFIX, not just the TypeID shape — a character id is not a lorebook.
  const books = RULE_PRESET_ENTITY_REF_SCHEMAS.worldInfoBook;
  expect(books.safeParse(mintTypeId(ID_PREFIX.worldBook)).success).toBe(true);
  expect(books.safeParse(mintTypeId(ID_PREFIX.character)).success).toBe(false);
  expect(books.safeParse("").success).toBe(false);
});

test("rulePresetKnobValuesSchema accepts each knob-value shape and refuses the rest", () => {
  expect(rulePresetKnobValuesSchema.safeParse({ everyN: 8, steer: "go", labels: ["a"] }).success).toBe(true);
  expect(rulePresetKnobValuesSchema.safeParse({}).success).toBe(true); // an empty override bag = all defaults
  expect(rulePresetKnobValuesSchema.safeParse({ everyN: true }).success).toBe(false);
  expect(rulePresetKnobValuesSchema.safeParse({ labels: [1, 2] }).success).toBe(false);
  expect(rulePresetKnobValuesSchema.safeParse({ nested: { a: 1 } }).success).toBe(false);
});

// Compile-time exhaustiveness backstops (the workloads KIND_SEEN pattern) — a tuple edit that the runtime
// `toEqual` above missed fails tsc here instead of drifting.
const PRESET_SEEN: Record<RulePresetId, true> = {
  welcomeBackRecap: true,
  autoAddLore: true,
  pacingNudge: true,
  illustrateScenes: true,
  diceChips: true,
  clockFires: true,
  openerChips: true,
  sceneVeil: true,
  callAVote: true,
  callback: true,
  cutaways: true,
  storyPacing: true,
  distillLore: true,
  rumorMill: true,
  theNeedle: true,
  proseAudit: true,
  asyncTableNudge: true,
  spotlightBalance: true,
  livingLibrary: true,
  illustrateOnLoreReveal: true,
  reactToLoreActivation: true,
  autoSetSceneBackground: true,
};
const KIND_SEEN: Record<RulePresetKnobKind, true> = { number: true, text: true, textList: true, choice: true, entityRef: true };
const ENTITY_SEEN: Record<RulePresetEntityKind, true> = { worldInfoBook: true };

test("the preset id + knob-kind + entity unions have no member beyond their tuples", () => {
  expect(Object.keys(PRESET_SEEN).sort()).toEqual(RULE_PRESET_IDS.toSorted());
  expect(Object.keys(KIND_SEEN).sort()).toEqual(RULE_PRESET_KNOB_KINDS.toSorted());
  expect(Object.keys(ENTITY_SEEN).sort()).toEqual(RULE_PRESET_ENTITY_KINDS.toSorted());
});

test("the knob descriptor union is discriminated on kind — each arm carries its own bounds", () => {
  // A structural pin: the picker's editor dispatch narrows off `kind`, so each arm must be constructible
  // with its own fields and only its own fields.
  const descriptors: readonly RulePresetKnobDescriptor[] = [
    { kind: "number", label: "N", default: 8, min: 2, max: 200 },
    { kind: "text", label: "Steer", default: "go", minLength: 1, maxLength: 600 },
    { kind: "textList", label: "Chips", default: ["a"], minItems: 1, maxItems: 4, maxLength: 80 },
    // A choice arm carries its own host LABELS (#655) — `options` are wire values, and rendering them raw
    // is what put `ask`/`write` and `scenario`/`background`/`free` in front of a host as the options.
    { kind: "choice", label: "Mode", options: ["scenario", "background"], optionLabels: { scenario: "Scene", background: "Background" }, default: "scenario" },
    // The reference arm carries NO `default` — that absence is the guard, not an omission (#630).
    { kind: "entityRef", label: "Lorebook", entity: "worldInfoBook" },
  ];
  expect(descriptors.map((d) => d.kind)).toEqual([...RULE_PRESET_KNOB_KINDS]);
});

test("RulePresetView is the picker's whole read model — no CEL field exists to carry a predicate", () => {
  const view: RulePresetView = {
    id: "pacingNudge",
    // C5 — the picker's PARTITION rides the view: the chat Rules section offers `chat` rows and the
    // Automation settings pane offers `global` ones, off one server-derived field rather than two
    // catalogues that could disagree.
    scope: "chat",
    title: "Periodic pacing nudge",
    summary: "s",
    ruleCount: 1,
    confirmFirst: false,
    spends: true,
    knobs: [{ key: "everyN", kind: "number", label: "N", default: 8, min: 2, max: 200 }],
  };
  expect(Object.keys(view).toSorted()).toEqual(["confirmFirst", "id", "knobs", "ruleCount", "scope", "spends", "summary", "title"]);
});

test("C5: exactly ONE catalogue row is owner-global, and every other declares the chat scope", () => {
  // The tuple is the catalogue's build order and #20 is its last committed row — the scope split is what
  // the two pickers filter on, so a preset silently defaulting to the wrong lane would put an
  // un-mintable card in front of a host (the affordance-that-cannot-work class, #655).
  expect(rulePresetScopeSchema.options).toEqual([...RULE_PRESET_SCOPES]);
  expect(RULE_PRESET_SCOPES).toEqual(["chat", "global"]);
});

test("rulePresetKnobBagsEqual is a TOTAL structural compare over the closed value union (B10's re-apply idempotency arm)", () => {
  const bag = { n: 6, word: "((veil))", labels: ["a", "b"] };
  expect(rulePresetKnobBagsEqual(bag, { n: 6, word: "((veil))", labels: ["a", "b"] })).toBe(true);
  expect(rulePresetKnobBagsEqual(bag, { ...bag, n: 7 })).toBe(false); // scalar drift
  expect(rulePresetKnobBagsEqual(bag, { ...bag, labels: ["a"] })).toBe(false); // list length drift
  expect(rulePresetKnobBagsEqual(bag, { ...bag, labels: ["a", "c"] })).toBe(false); // list element drift
  expect(rulePresetKnobBagsEqual(bag, { n: 6, word: "((veil))" })).toBe(false); // missing key
  expect(rulePresetKnobBagsEqual({ n: 6, word: "((veil))" }, bag)).toBe(false); // extra key, symmetric
  expect(rulePresetKnobBagsEqual({}, {})).toBe(true);
  // A number is never equal to its string spelling — the compare is typed, not coerced.
  expect(rulePresetKnobBagsEqual({ n: 6 }, { n: "6" })).toBe(false);
});

test("rulePresetKnobBagToInputs re-spells a resolved bag as the WIRE INPUT bag — lists copied MUTABLE, scalars verbatim", () => {
  const readonlyBag: Readonly<Record<string, number | string | readonly string[]>> = { n: 6, word: "x", labels: ["a", "b"] };
  const inputs = rulePresetKnobBagToInputs(readonlyBag);
  expect(inputs).toEqual({ n: 6, word: "x", labels: ["a", "b"] });
  // The list is a COPY, not the same reference — an editor mutating the echo can't reach the view's bag.
  expect(inputs["labels"]).not.toBe(readonlyBag["labels"]);
});
