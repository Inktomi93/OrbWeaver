// @orb/contracts/rpg/extraction — populate-from-character: the born-state schema, salvage and teaching.

import {
  composePopulateTeaching,
  constrainPopulateSchema,
  rpgExtractionSchema,
  rpgGameConfigSchema,
  rpgPopulateSchema,
  salvagePopulate,
} from "@orb/contracts/rpg";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { BARE_REFS } from "./_extraction-support.ts";

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// POPULATE-FROM-CHARACTER (owner ruling 2026-08-01) — the host BORN-STATE schema.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// The two invariants that make this a DOORWAY and not a hole: it REACHES the hand-only sheet fields (which is
// its whole reason to exist), and it CANNOT reach a live-play plane (structurally — schema AND salvage), so
// nothing about the turn vehicles' write surface changed by adding it.

test("POPULATE reaches the hand-only sheet fields — and the TURN schema still does not (the doorway, not a hole)", () => {
  const populateJson = JSON.stringify(projectJsonSchema(rpgPopulateSchema));
  expect(populateJson).toContain('"level"');
  expect(populateJson).toContain('"title"');
  // The law that stands: no turn vehicle gained a level write (the §2.6 progression-inflation guard).
  expect(JSON.stringify(projectJsonSchema(rpgExtractionSchema))).not.toContain("level");
});

test("POPULATE offers NO live-play plane — scene/party/trackers/journal are absent from the schema entirely", () => {
  const populateJson = JSON.stringify(projectJsonSchema(rpgPopulateSchema));
  for (const plane of ['"scene"', '"party"', '"trackers"', '"journal"']) {
    expect(populateJson).not.toContain(plane);
  }
  expect(populateJson).toContain('"inventory"');
  expect(populateJson).toContain('"quests"');
});

test("POPULATE salvage DISCARDS a live-play plane even when a non-enforcing wire volunteers one", () => {
  const { extraction, sheet } = salvagePopulate({
    sheet: { title: "Warden of House Vane", level: 3 },
    inventory: [{ targetRef: "Mira", add: [{ name: "Bone key", quantity: 1 }], walletDeltas: [{ name: "gold", delta: 20 }] }],
    quests: [{ name: "Find the vault", action: "create" }],
    // The planes a card read must never write — emitted anyway (an unconstrained wire), and dropped on the floor.
    scene: { location: "the tower" },
    party: [{ targetRef: "Mira", hpDelta: -5 }],
    trackers: [{ key: "alarm", value: 30 }],
    journal: [{ type: "note", content: "a beat" }],
  });
  expect(sheet).toEqual({ title: "Warden of House Vane", level: 3 });
  expect(extraction.inventory).toHaveLength(1);
  expect(extraction.quests).toHaveLength(1);
  expect(extraction.scene).toBeUndefined();
  expect(extraction.party).toEqual([]);
  expect(extraction.trackers).toEqual([]);
  expect(extraction.journal).toEqual([]);
});

test("POPULATE salvage is PER-ENTRY (EXT-4a): a bad item drops alone, and a bad sheet costs only the sheet", () => {
  const { sheet, extraction, dropped } = salvagePopulate({
    sheet: { level: -3 }, // below the min ⇒ the sheet half is refused whole
    inventory: [{ targetRef: "Mira", add: [{ name: "Rope" }] }, { add: [{ name: "no target" }] }],
    quests: [{ name: "Find the vault", action: "create" }],
  });
  expect(sheet).toBeNull();
  expect(extraction.inventory).toHaveLength(1);
  expect(extraction.quests).toHaveLength(1); // the quests beside the bad entries survive
  expect(dropped.map((d) => d.plane).sort()).toEqual(["inventory", "root"]);
});

test("POPULATE: an empty round parses (a card that established nothing), and a non-object yields ONE root drop", () => {
  expect(rpgPopulateSchema.parse({})).toEqual({ inventory: [], quests: [] });
  const { sheet, extraction, dropped } = salvagePopulate("not an object");
  expect(sheet).toBeNull();
  expect(extraction).toEqual({ party: [], inventory: [], trackers: [], quests: [], journal: [] });
  expect(dropped.map((d) => d.plane)).toEqual(["root"]);
});

test("POPULATE constraint pins inventory.targetRef to the ONE character and REQUIRES the sheet fields (the xgrammar lever)", () => {
  // WireReady is an opaque branded Record; widen to the plain record (assignable, no cast) then read its shape.
  const populated: Record<string, unknown> = constrainPopulateSchema(projectJsonSchema(rpgPopulateSchema), "Mira");
  const constrained = populated as {
    required?: string[];
    properties: { sheet: { required?: string[] }; inventory: { items: { properties: { targetRef: { enum?: string[] } } } } };
  };
  expect(constrained.properties.inventory.items.properties.targetRef.enum).toEqual(["Mira"]);
  expect(constrained.required).toContain("sheet");
  expect((constrained.properties.sheet.required ?? []).toSorted()).toEqual(["level", "title"]);
  // …and the input projection is untouched (the cached schema also feeds other wires).
  const projected = projectJsonSchema(rpgPopulateSchema) as { required?: string[] };
  expect(projected.required ?? []).not.toContain("sheet");
});

test("POPULATE teaching: the two born planes + the invent-nothing doctrine, and NO live-play plane fragment", () => {
  const config = rpgGameConfigSchema.parse({});
  const teaching = composePopulateTeaching({ config, refs: { ...BARE_REFS, actorRefs: ["Mira"] } });
  expect(teaching).toContain("sheet.title");
  expect(teaching).toContain("INVENTORY");
  expect(teaching).toContain("QUESTS");
  expect(teaching).toContain("Do NOT invent");
  // The live-play fragments the turn teaching carries are absent here (a card read is not a beat).
  expect(teaching).not.toContain("SCENE —");
  expect(teaching).not.toContain("JOURNAL —");
});

test("POPULATE teaching carries the deception surface-only clause on a deception-active game", () => {
  const refs = { ...BARE_REFS, actorRefs: ["Mira"] };
  const plain = composePopulateTeaching({ config: rpgGameConfigSchema.parse({}), refs });
  const deceptive = composePopulateTeaching({ config: rpgGameConfigSchema.parse({ features: { deception: true } }), refs });
  expect(plain).not.toContain("hidden layers");
  expect(deceptive).toContain("hidden layers");
});
