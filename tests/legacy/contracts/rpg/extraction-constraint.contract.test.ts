// @orb/contracts/rpg/extraction — the per-call ref constraint and the per-actor write surface.

import { buildTrackerWriteGroups, constrainExtractionSchema, gameTrackerWriteKeys, rpgExtractionSchema } from "@orb/contracts/rpg";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { BARE_REFS, carrier, MANA, refEnum, SEALED, TRUST, tracker } from "./_extraction-support.ts";

// ── constrainExtractionSchema (R1 — the per-call ref constraint that kills the mis-target class) ────────

test("constrain injects the actorRefs enum on party/inventory targetRef + scene.presentRemove", () => {
  const base = projectJsonSchema(rpgExtractionSchema);
  const constrained = constrainExtractionSchema(base, { ...BARE_REFS, actorRefs: ["You", "Bramwell"] });
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "targetRef", "enum"])).toEqual(["You", "Bramwell"]);
  expect(refEnum(constrained, ["properties", "inventory", "items", "properties", "targetRef", "enum"])).toEqual(["You", "Bramwell"]);
  expect(refEnum(constrained, ["properties", "scene", "properties", "presentRemove", "items", "enum"])).toEqual(["You", "Bramwell"]);
});

test("R6: the GAME-subject trackers plane binds its key enum and prunes the arm no live tracker needs", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), {
    ...BARE_REFS,
    gameTrackerKeys: { deltaKeys: [], setKeys: ["alarm", "torch_fuel"] },
  });
  const item = ["properties", "trackers", "items"] as const;
  expect(refEnum(constrained, [...item, "properties", "key", "enum"])).toEqual(["alarm", "torch_fuel"]);
  // Both game trackers are `write:"set"`, so the `delta` arm is REMOVED — not offered as a dead field.
  expect(refEnum(constrained, [...item, "properties", "delta"])).toBeUndefined();
  expect(refEnum(constrained, [...item, "properties", "value"])).toBeDefined();
});

test("R6: a game with NO game-subject trackers loses the whole plane (a disabled feature's tool is omitted)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), BARE_REFS);
  expect(refEnum(constrained, ["properties", "trackers"])).toBeUndefined();
  // ...and it leaves `required` with it, so the grammar never demands a plane that no longer exists.
  expect(refEnum(constrained, ["required"])).not.toContain("trackers");
});

test("an EMPTY ref list leaves the field unconstrained (never an impossible empty enum — the fresh-game arm)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), BARE_REFS);
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "targetRef", "enum"])).toBeUndefined();
});

test("constrain does NOT mutate the input schema (the cached projection also feeds other wires)", () => {
  const base = projectJsonSchema(rpgExtractionSchema);
  const snapshot = JSON.stringify(base);
  constrainExtractionSchema(base, { ...BARE_REFS, actorRefs: ["You"], gameTrackerKeys: { deltaKeys: [], setKeys: ["alarm"] } });
  expect(JSON.stringify(base)).toBe(snapshot);
});

test("a constrained schema still PROJECTS clean (enum is plain JSON Schema every backend enforces)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), { ...BARE_REFS, actorRefs: ["You"] });
  // The enum lives on a leaf string node — valid JSON Schema, no throw, portable to vLLM xgrammar + OR strict.
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "targetRef", "type"])).toBe("string");
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "targetRef", "enum"])).toEqual(["You"]);
});

// ── R6: the PER-ACTOR write surface (the tracked-field unification's strongest prevent-at-schema) ──────
// "The reminder is the model's knowledge; the tools are its permissions." A target actor is offered ONLY the
// trackers it actually carries, minus the locked ones — so the schema can never hand the model Mana on an
// actor with no Mana, and the apply-time strip is a backstop rather than the gate.

test("R6: ONE carrier set keeps the party schema FLAT (the common game pays nothing for the machinery)", () => {
  const groups = buildTrackerWriteGroups([MANA], [carrier("Kael", "party"), carrier("Sola", "party")]);
  expect(groups).toHaveLength(1);
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), {
    ...BARE_REFS,
    actorRefs: ["Kael", "Sola"],
    trackerWriteGroups: groups,
  });
  const item = ["properties", "party", "items"] as const;
  expect(refEnum(constrained, [...item, "oneOf"])).toBeUndefined();
  expect(refEnum(constrained, [...item, "properties", "targetRef", "enum"])).toEqual(["Kael", "Sola"]);
  expect(refEnum(constrained, [...item, "properties", "trackerDeltas", "items", "properties", "key", "enum"])).toEqual(["mana"]);
  // Nobody carries a `set` tracker here, so that arm is REMOVED (never an empty-enum husk).
  expect(refEnum(constrained, [...item, "properties", "trackerSets"])).toBeUndefined();
});

test("R6: an actor who does NOT carry a tracker is never offered it (the whole point — a oneOf branch each)", () => {
  // Kael carries Mana (party class); Mira is an NPC carrying Trust; Sola had Mana REVOKED on her sheet.
  const groups = buildTrackerWriteGroups([MANA, TRUST], [carrier("Kael", "party"), carrier("Sola", "party", { revokes: ["mana"] }), carrier("Mira", "npcs")]);
  expect(groups).toHaveLength(3);
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), {
    ...BARE_REFS,
    actorRefs: ["Kael", "Sola", "Mira"],
    trackerWriteGroups: groups,
  });
  const branches = refEnum(constrained, ["properties", "party", "items", "oneOf"]) as Record<string, unknown>[];
  expect(branches).toHaveLength(3);
  const byTarget = new Map(
    branches.map((b) => {
      const props = b["properties"] as Record<string, Record<string, unknown>>;
      const target = ((props["targetRef"]?.["enum"] ?? []) as string[])[0] ?? "";
      return [target, props] as const;
    }),
  );
  /** The key enum a branch's write arm offers ("what may this actor's writes name?"). */
  const armKeys = (target: string, arm: string): unknown => refEnum(byTarget.get(target) ?? {}, [arm, "items", "properties", "key", "enum"]);
  // Kael: Mana on the delta arm, no set arm at all.
  expect(armKeys("Kael", "trackerDeltas")).toEqual(["mana"]);
  expect(byTarget.get("Kael")?.["trackerSets"]).toBeUndefined();
  // Sola: Mana revoked ⇒ NO tracker arms whatsoever (she is still targetable for conditions/status).
  expect(byTarget.get("Sola")?.["trackerDeltas"]).toBeUndefined();
  expect(byTarget.get("Sola")?.["trackerSets"]).toBeUndefined();
  expect(byTarget.get("Sola")?.["addCondition"]).toBeDefined();
  // Mira: the NPC-class Trust on the SET arm, and no delta arm.
  expect(armKeys("Mira", "trackerSets")).toEqual(["trust"]);
  expect(byTarget.get("Mira")?.["trackerDeltas"]).toBeUndefined();
});

test("R6: a LOCKED tracker is ABSENT from the write schema (prevent-at-schema, not strip-at-apply)", () => {
  const groups = buildTrackerWriteGroups([MANA, SEALED], [carrier("Kael", "party")]);
  expect(groups[0]?.deltaKeys).toEqual(["mana"]);
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), {
    ...BARE_REFS,
    actorRefs: ["Kael"],
    trackerWriteGroups: groups,
  });
  const keys = refEnum(constrained, ["properties", "party", "items", "properties", "trackerDeltas", "items", "properties", "key", "enum"]);
  expect(keys).toEqual(["mana"]);
  expect(keys).not.toContain("sealed");
  // The whole projected schema string never names it — the model cannot spend attention on a write it can't make.
  expect(JSON.stringify(constrained)).not.toContain("sealed");
});

test("R6: a GRANT reaches an actor the class missed; a REVOKE beats everything", () => {
  const bound = tracker({ key: "bound_will", label: "Bound Will", shape: "meter", write: "delta", subject: "actor", appliesTo: "npcs" });
  const groups = buildTrackerWriteGroups(
    [MANA, bound],
    [carrier("Kael", "party", { grants: ["bound_will"] }), carrier("Sola", "party", { revokes: ["mana"] })],
  );
  // Ordered by the ONE tracker ordering (sort, then key) — stable across calls, so the per-call schema
  // never reshuffles for nothing (a prompt-cache + xgrammar-compile miss).
  expect(groups.find((g) => g.targetRefs.includes("Kael"))?.deltaKeys).toEqual(["bound_will", "mana"]);
  expect(groups.find((g) => g.targetRefs.includes("Sola"))?.deltaKeys).toEqual([]);
});

test("R6: the game-subject write keys split by the write axis and drop the locked ones", () => {
  const alarm = tracker({ key: "alarm", label: "Alarm", shape: "meter", write: "set", subject: "game" });
  const fuel = tracker({ key: "fuel", label: "Fuel", shape: "meter", write: "delta", subject: "game" });
  const hidden = tracker({ key: "hidden", label: "Hidden", shape: "meter", write: "set", subject: "game", locked: true });
  expect(gameTrackerWriteKeys([alarm, fuel, hidden, MANA])).toEqual({ deltaKeys: ["fuel"], setKeys: ["alarm"] });
});

// R5a — the LIST-IN-A-SCALAR fix. The ground-truth 8B run emitted `removeCondition: "Bleeding, Poisoned,
// Exhausted, Lamed"` (semantically right, structurally invalid — the hermes parser accepts it because it IS a
// valid string). Binding the field to the live active-condition enum makes that unrepresentable under xgrammar.
test("constrain injects the conditionNames enum on party[].removeCondition (R5a — a list-in-a-scalar is unrepresentable)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), {
    ...BARE_REFS,
    actorRefs: ["You"],
    conditionNames: ["Bleeding", "Poisoned"],
  });
  const enumValues = refEnum(constrained, ["properties", "party", "items", "properties", "removeCondition", "enum"]);
  expect(enumValues).toEqual(["Bleeding", "Poisoned"]);
  // The comma-joined list the 8B emitted is NOT a member — the grammar can no longer produce it.
  expect(enumValues).not.toContain("Bleeding, Poisoned");
  // Still a plain leaf string node (portable JSON Schema — vLLM xgrammar + OR strict both enforce it).
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "removeCondition", "type"])).toBe("string");
});

test("an EMPTY conditionNames leaves removeCondition unconstrained (nobody afflicted — never an empty enum)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), { ...BARE_REFS, actorRefs: ["You"] });
  expect(refEnum(constrained, ["properties", "party", "items", "properties", "removeCondition", "enum"])).toBeUndefined();
});

test("establish-when-unset: an UNSET scene forces location/timeOfDay + a non-empty presentUpsert (the fresh-game arm)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), {
    ...BARE_REFS,
    establishScene: { location: true, timeOfDay: true, presentCast: true },
  });
  // xgrammar/`strict` now FORCES the model to emit scene.location + scene.timeOfDay + at least one present character.
  expect(refEnum(constrained, ["required"])).toContain("scene");
  expect(refEnum(constrained, ["properties", "scene", "required"])).toEqual(expect.arrayContaining(["location", "timeOfDay", "presentUpsert"]));
  expect(refEnum(constrained, ["properties", "scene", "properties", "presentUpsert", "minItems"])).toBe(1);
});

test("establish-when-unset: an already-SET scene stays OPTIONAL (ongoing turn keeps omit=keep, no re-emit churn)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), BARE_REFS);
  // Once the scene is established, nothing is forced — the model patches only what the beat moves.
  expect(refEnum(constrained, ["required"])).not.toContain("scene");
  expect(refEnum(constrained, ["properties", "scene", "properties", "presentUpsert", "minItems"])).toBeUndefined();
});
