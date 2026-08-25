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
  rulePresetIdSchema,
  rulePresetKnobValuesSchema,
} from "@orb/contracts/automation";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

test("RULE_PRESET_IDS is the pinned 16-member catalogue (A3's seven + A4's four + C1's pacing analysis + C2's two lore-distillers + #16 the needle + C3's prose audit), in §4 build order", () => {
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
  ]);
  expect(rulePresetIdSchema.options).toEqual(RULE_PRESET_IDS);
  // The rows riding LATER phases stay unspellable: #2 (C6's actor-excluding notification recipient),
  // #14 spotlight balance, and #20 the owner-global living library (C5's lane). #16 the needle and
  // #15's prose audit are now BUILT — the ids they once proved UNSPELLABLE parse above.
  expect(rulePresetIdSchema.safeParse("asyncTableNudge").success).toBe(false);
  expect(rulePresetIdSchema.safeParse("spotlightBalance").success).toBe(false);
  expect(rulePresetIdSchema.safeParse("livingLibrary").success).toBe(false);
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
    { kind: "text", label: "Steer", default: "go", maxLength: 600 },
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
    title: "Periodic pacing nudge",
    summary: "s",
    ruleCount: 1,
    confirmFirst: false,
    spends: true,
    knobs: [{ key: "everyN", kind: "number", label: "N", default: 8, min: 2, max: 200 }],
  };
  expect(Object.keys(view).toSorted()).toEqual(["confirmFirst", "id", "knobs", "ruleCount", "spends", "summary", "title"]);
});
