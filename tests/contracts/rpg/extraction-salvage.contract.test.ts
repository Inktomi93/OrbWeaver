// @orb/contracts/rpg/extraction — the structured arm salvages per plane and per entry; the journal type heals.

import {
  constrainExtractionSchema,
  healedJournalTypes,
  malformedToolCallDetails,
  RPG_WEATHER_TYPES,
  rpgExtractionSchema,
  salvagedToolCallFields,
  salvageExtraction,
  toolCallsToExtraction,
  updateSceneArgsSchema,
} from "@orb/contracts/rpg";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { BARE_REFS, refEnum } from "./_extraction-support.ts";

// ── salvageExtraction (EXT-4a — the RELIABLE arm's per-plane / per-entry parse) ───────────────────────────
// The defect: one whole-object `safeParse` meant ONE malformed nested field discarded all six planes, while the
// tool vehicles (validating per call) lost only the bad call. These pin the drop GRANULARITY; the three-path
// equality itself is pinned composed-real in `tests/server/entry/compose/rpg-delivery-parity.int.test.ts`.

test("EXT-4a: a malformed journal ENTRY drops that entry ALONE — every other plane still applies", () => {
  const { extraction, dropped } = salvageExtraction({
    party: [{ targetRef: "player", status: "wounded" }],
    scene: { location: "the ford" },
    quests: [{ name: "Cross the river", action: "create" }],
    // Entry 0 is content-less (malformed — nothing to log); entry 1 is a perfectly good beat.
    journal: [
      { type: "note", title: "no body" },
      { type: "event", content: "They forded the river." },
    ],
  });
  expect(extraction.party).toHaveLength(1);
  expect(extraction.scene?.location).toBe("the ford");
  expect(extraction.quests).toHaveLength(1);
  expect(extraction.journal.map((j) => j.content)).toEqual(["They forded the river."]);
  // The loss is ITEMIZED by the same function that built the extraction — the log can't disagree with what applied.
  expect(dropped).toHaveLength(1);
  expect(dropped[0]?.plane).toBe("journal");
  expect(dropped[0]?.index).toBe(0);
  expect(dropped[0]?.issues.join(" ")).toContain("content");
});

test("EXT-4a: a non-array plane drops WHOLE (index null); a malformed scene drops alone", () => {
  const { extraction, dropped } = salvageExtraction({
    party: "not an array",
    scene: { presentUpsert: "should be an array" },
    inventory: [{ targetRef: "player", walletDeltas: [{ name: "gold", delta: 25 }] }],
  });
  expect(extraction.party).toEqual([]);
  expect(extraction.scene).toBeUndefined();
  expect(extraction.inventory).toHaveLength(1); // the good plane beside them is untouched
  expect(dropped.map((d) => [d.plane, d.index])).toEqual([
    ["party", null],
    ["scene", null],
  ]);
});

test("EXT-4a: a payload that is not an object at all yields the empty extraction + ONE root drop", () => {
  for (const bad of [null, "a string", 42, ["an", "array"]]) {
    const { extraction, dropped } = salvageExtraction(bad);
    expect(extraction).toEqual({ party: [], inventory: [], trackers: [], quests: [], journal: [] });
    expect(dropped.map((d) => d.plane)).toEqual(["root"]);
  }
});

test("EXT-4a: a clean payload reports NOTHING dropped, and an omitted plane is not a drop", () => {
  const { extraction, dropped } = salvageExtraction({ scene: { location: "the tower" } });
  expect(dropped).toEqual([]);
  expect(extraction.party).toEqual([]); // omitted ⇒ empty, exactly like the schema default
  expect(extraction.scene?.location).toBe("the tower");
  expect(salvageExtraction({}).dropped).toEqual([]);
});

test("EXT-4a: salvage and the tool-call fold agree on the SAME payload (the shared-plane proof, drop-side)", () => {
  // The identical planes delivered the two ways: what survives must be identical, entry for entry.
  const journal = [
    { type: "note", title: "no body" },
    { type: "event", content: "They forded the river." },
  ];
  const scene = { location: "the ford" };
  const viaSchema = salvageExtraction({ scene, journal }).extraction;
  const viaCalls = toolCallsToExtraction([
    { name: "update_scene", arguments: JSON.stringify(scene) },
    ...journal.map((entry) => ({ name: "add_journal_entry", arguments: JSON.stringify(entry) })),
  ]);
  expect(viaSchema).toEqual(viaCalls);
});

// ── EXT-4b: the journal `type` heal — optional at parse, REQUIRED in the enforced grammar ────────────────
test("EXT-4b: healedJournalTypes names exactly the entries whose `type` the model omitted", () => {
  const { extraction } = salvageExtraction({
    journal: [{ content: "a kindless beat" }, { type: "combat", content: "The troll fell." }, { content: "another" }],
  });
  expect(extraction.journal).toHaveLength(3); // all three PARSED — the heal is not a drop
  expect([...healedJournalTypes(extraction)]).toEqual([0, 2]);
  expect(healedJournalTypes(toolCallsToExtraction([]))).toEqual([]);
});

test("EXT-4b: the PROJECTION re-requires journal[].type (prevention where the backend enforces it)", () => {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), BARE_REFS);
  expect(refEnum(constrained, ["properties", "journal", "items", "required"])).toEqual(expect.arrayContaining(["type", "content"]));
  // `title` stays OPTIONAL — it derives from the content head for free, so forcing it would spend tokens.
  expect(refEnum(constrained, ["properties", "journal", "items", "required"])).not.toContain("title");
  // The zod stays the loose superset (the heal arm for the wires that ignore nested `required`).
  expect(rpgExtractionSchema.safeParse({ journal: [{ content: "kindless" }] }).success).toBe(true);
});

// ── SCENE-DROPPED salvage (property test) ─────────────────────────────────────────
// "Every closed enum reachable from a tool arg can express what the reminder can RENDER" — for weather, the
// reminder (`weatherLine`/`rpgWeatherText`) renders WHATEVER STRING the model wrote in the free `label` field
// (label wins over type when present), so the render side is effectively unconstrained while the WRITE side
// (`weather.type`) is a closed enum. The live incident was exactly this gap: the model needed to describe an
// indoor scene (a state the fiction can render fine — it's just prose) and had no legal `type` to write.
//
// Written against `RPG_WEATHER_TYPES` AS IMPORTED (never a hardcoded member list) per the coordination note —
// correct on both sides of the sibling DOG-ENGINE lane's concurrent `indoors` addition.

test("SCENE-DROPPED property: every RPG_WEATHER_TYPES member (as imported) parses through the write schema", () => {
  // The write ⊆ render direction always holds: whatever the closed enum can write, the reminder can render
  // (rpgWeatherText/weatherLine just echoes the type string when no label is set — never a lookup that could
  // miss a member). Pinned so an enum addition can never silently create an unrenderable type.
  for (const type of RPG_WEATHER_TYPES) {
    expect(updateSceneArgsSchema.safeParse({ weather: { type } }).success, `weather.type "${type}" must be writable`).toBe(true);
  }
});

// ↓ WAS a declared `test.todo` FAILING-PIN (lane DOG-VERIFY): the reminder can render an indoor scene
// trivially (it's prose, via `weather.label`/`scene.location`), but `RPG_WEATHER_TYPES` had no interior member,
// so the literal token the model sent live ("indoors") was REJECTED at the write side. **FLIPPED TO LIVE by
// lane DOG-ENGINE, 2026-08-07** — `indoors` is in the vocabulary and the render/write asymmetry is closed.
// Kept (not deleted) because it is the crispest statement of what the defect actually WAS, and it is the
// tripwire if the member is ever removed. Asserted against the enum AS IMPORTED, never a member list.
test("SCENE-DROPPED property: the render side can express an indoor scene, and so can the write enum", () => {
  expect(RPG_WEATHER_TYPES).toContain("indoors");
  // Both directions, at the schema the model is actually bound by.
  expect(updateSceneArgsSchema.safeParse({ weather: { type: "indoors" } }).success).toBe(true);
});

test("SCENE-DROPPED salvage: an invalid OPTIONAL field costs only that field, not the whole call", () => {
  // The live shape: location/timeOfDay/recentEvent are all good; only `weather.type` is unwritable. The
  // salvage retries with the offending top-level field (`weather`) removed, so everything else applies.
  //
  // ⚠️ The offending value was `"indoors"` when this was written — that is now a LEGAL member (DOG-ENGINE),
  // so the value moved to one that is genuinely unnameable. The MECHANISM under test is unchanged and is the
  // point: an invalid optional field must cost that field, never the call. Closing the vocabulary hole must
  // not be allowed to quietly retire the salvage that made the hole survivable.
  const calls = [
    {
      name: "update_scene",
      arguments: JSON.stringify({ location: "Throne Room", timeOfDay: "afternoon", recentEvent: "Alex arrived", weather: { type: "sideways" } }),
    },
  ];
  expect(malformedToolCallDetails(calls)).toEqual([]); // salvaged, not dropped — not a whole-call loss
  expect([...salvagedToolCallFields(calls)]).toEqual(["update_scene.weather"]);
  expect(toolCallsToExtraction(calls).scene).toEqual({ location: "Throne Room", timeOfDay: "afternoon", recentEvent: "Alex arrived" });
});
