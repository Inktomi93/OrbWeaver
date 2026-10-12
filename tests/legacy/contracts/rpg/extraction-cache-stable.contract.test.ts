// @orb/contracts/rpg/extraction — the cache-stable projection keeps the folded tool payload byte-identical.

import type { ExtractionRefs } from "@orb/contracts/rpg";
import { actorTrackerWriteKeys, buildTrackerWriteGroups, cacheStableExtractionRefs, constrainExtractionSchema, rpgExtractionSchema } from "@orb/contracts/rpg";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { BARE_REFS, carrier, MANA, refEnum, SEALED, TRUST, tracker } from "./_extraction-support.ts";

// ── cacheStableExtractionRefs (F4 — the folded turn's tool payload is prompt-cache-key bytes) ───────────
// the probe's sibling ./RESULTS.md F4 measured that ANY byte change in the `tools` payload drops `cached_tokens` to zero and re-bills
// the WHOLE prefix. The folded vehicle mounts these tools on the character turn, so the schema they carry must
// not move when the SCENE moves — while every config-derived constraint must survive intact.

const STABLE_DEFS = [MANA, TRUST, SEALED];

/** The projected+constrained schema for one live ref bundle, through the cache-stable projection. */
function stableSchema(refs: ExtractionRefs): Record<string, unknown> {
  return constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), cacheStableExtractionRefs(refs, STABLE_DEFS));
}

test("PROMPT-CACHE (probe F4): gaining an actor AND a condition leaves the folded tool payload BYTE-IDENTICAL (the cache-key property)", () => {
  const before: ExtractionRefs = {
    ...BARE_REFS,
    actorRefs: ["Kael"],
    trackerWriteGroups: buildTrackerWriteGroups(STABLE_DEFS, [carrier("Kael", "party")]),
  };
  // One beat later: an NPC walked on stage (a second carrier ⇒ a SECOND write group under the live bundle) and
  // somebody picked up a condition — the exact churn that was re-billing the whole story prefix.
  const after: ExtractionRefs = {
    ...before,
    actorRefs: ["Kael", "Mira"],
    trackerWriteGroups: buildTrackerWriteGroups(STABLE_DEFS, [carrier("Kael", "party"), carrier("Mira", "npcs")]),
    conditionNames: ["Bleeding"],
  };
  // The LIVE bundles genuinely differ (this test would be vacuous if the two schemas were equal anyway).
  expect(JSON.stringify(constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), before))).not.toEqual(
    JSON.stringify(constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), after)),
  );
  expect(JSON.stringify(stableSchema(after))).toEqual(JSON.stringify(stableSchema(before)));
});

test("PROMPT-CACHE (probe F4): the stable projection KEEPS the config-derived enforcement (tracker keys, locked prevention, establish)", () => {
  const constrained = stableSchema({
    ...BARE_REFS,
    actorRefs: ["Kael"],
    trackerWriteGroups: buildTrackerWriteGroups(STABLE_DEFS, [carrier("Kael", "party")]),
    gameTrackerKeys: { deltaKeys: [], setKeys: ["alarm"] },
    establishScene: { location: true, timeOfDay: true, presentCast: true },
  });
  const item = ["properties", "party", "items"] as const;
  // Both write arms survive (an empty group list would have PRUNED them — losing the write surface itself), and
  // each key enum is the GAME's own unlocked actor trackers, not the live carrier split.
  expect(refEnum(constrained, [...item, "properties", "trackerDeltas", "items", "properties", "key", "enum"])).toEqual(["mana"]);
  expect(refEnum(constrained, [...item, "properties", "trackerSets", "items", "properties", "key", "enum"])).toEqual(["trust"]);
  // The LOCKED tracker stays unrepresentable — prevent-at-schema is not what got traded away.
  expect(JSON.stringify(constrained)).not.toContain("sealed");
  // Game-subject keys + establish-when-unset ride on untouched.
  expect(refEnum(constrained, ["properties", "trackers", "items", "properties", "key", "enum"])).toEqual(["alarm"]);
  expect(refEnum(constrained, ["properties", "scene", "required"])).toEqual(expect.arrayContaining(["location", "timeOfDay", "presentUpsert"]));
});

test("PROMPT-CACHE (probe F4): only the SCENE-derived enums are dropped (targetRef/presentRemove/removeCondition go unconstrained)", () => {
  const constrained = stableSchema({ ...BARE_REFS, actorRefs: ["Kael", "Mira"], conditionNames: ["Bleeding"] });
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "targetRef", "enum"])).toBeUndefined();
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "removeCondition", "enum"])).toBeUndefined();
  expect(refEnum(constrained, ["properties", "inventory", "items", "properties", "targetRef", "enum"])).toBeUndefined();
  expect(refEnum(constrained, ["properties", "scene", "properties", "presentRemove", "items", "enum"])).toBeUndefined();
  // …and the fields themselves are still WRITABLE (dropped constraint, never a dropped plane).
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "targetRef", "type"])).toBe("string");
});

test("PROMPT-CACHE (probe F4): a game with NO actor trackers keeps a targetable party plane (both arms pruned, condition/status intact)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), cacheStableExtractionRefs({ ...BARE_REFS, actorRefs: ["Kael"] }, []));
  // @orb-waive no-test-fabrication(Record<string, unknown>): baselined when the gate widened to value casts; burn-down item 906.
  const props = refEnum(constrained, ["properties", "party", "items", "properties"]) as Record<string, unknown>;
  expect(props["trackerDeltas"]).toBeUndefined();
  expect(props["trackerSets"]).toBeUndefined();
  // The non-tracker planes survive the prune — a tracker-free game can still afflict and describe an actor.
  // (`hpDelta` is NOT among them since R3: health is a tracker, so a game with no trackers has no health.)
  expect(props["hpDelta"]).toBeUndefined();
  expect(props["addCondition"]).toBeDefined();
  expect(props["status"]).toBeDefined();
});

test("PROMPT-CACHE (probe F4): actorTrackerWriteKeys is the config-only superset — unlocked actor trackers, split by write axis", () => {
  expect(actorTrackerWriteKeys(STABLE_DEFS)).toEqual({ deltaKeys: ["mana"], setKeys: ["trust"] });
  // Game-subject trackers belong to the OTHER surface and never leak in.
  expect(actorTrackerWriteKeys([tracker({ key: "alarm", label: "Alarm", shape: "meter", write: "set", subject: "game" })])).toEqual({
    deltaKeys: [],
    setKeys: [],
  });
});
