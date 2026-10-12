// @orb/contracts/rpg/extraction — the per-plane prompt registry and the teaching composed from it.

import type { RpgGameConfig } from "@orb/contracts/rpg";
import {
  buildRpgToolDescriptions,
  composePlaneTeaching,
  EXTRACTION_PLANE_PROMPTS,
  malformedToolCalls,
  RPG_BASELINE_TOOL_DESCRIPTIONS,
  rpgExtractionSchema,
  rpgGameConfigSchema,
  salvagedToolCallFields,
  toolCallsToExtraction,
  updateSceneArgsSchema,
} from "@orb/contracts/rpg";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { BARE_REFS, refEnum } from "./_extraction-support.ts";

// ── EXTRACTION_PLANE_PROMPTS — the §1.6 per-plane prompt-fragment registry + its RATCHET ─────────────────
const baseConfig = (): RpgGameConfig => rpgGameConfigSchema.parse({});

test("RATCHET (§1.6): every top-level rpgExtractionSchema key has a registry row (a new writable plane needs a fragment)", () => {
  // The D50 bus-coverage ratchet discipline applied to prompt teaching: a plane that is schema-writable but has
  // no registry row would be prompt-SILENT (the exact plane-under-service class the redesign killed). This RED
  // is the enforcer — add the plane's fragment when this fails, never suppress.
  const schemaKeys = Object.keys(rpgExtractionSchema.shape).sort();
  const registryPlanes = EXTRACTION_PLANE_PROMPTS.map((r) => r.plane).sort();
  expect(registryPlanes).toEqual(schemaKeys);
});

test("§1.6: the composed teaching prompts the newly-covered planes (plot gate ON, emoji, reconcile, inventory-infer)", () => {
  const teaching = composePlaneTeaching({ config: baseConfig(), refs: BARE_REFS });
  expect(teaching).toContain("scene.plot"); // plotProgression defaults ON → the plot clause composes
  expect(teaching).toContain("emoji"); // the portrait-fallback emoji clause
  expect(teaching).toContain("RECONCILE"); // the anti-drift doctrine
  expect(teaching).toContain("INFER"); // the owner's inventory-inference ask
});

test("RV-9: the scene fragment teaches WHEN to move time + weather (the panel's Waystone is a live clock, not decoration)", () => {
  // The owner finding: the Waystone "does not read as a clock" partly because the model never ADVANCES
  // timeOfDay/weather. Same class as the R4b gloss lesson — a field with no when-to-write clause goes
  // unwritten, so the teaching must name the triggers (time spent, sky turning), not just the field.
  const teaching = composePlaneTeaching({ config: baseConfig(), refs: BARE_REFS });
  expect(teaching).toContain("KEEP TIME MOVING");
  expect(teaching).toContain("advance scene.timeOfDay");
  expect(teaching).toContain("never leave it parked");
  expect(teaching).toContain("whenever the story tells you what the sky is doing");
  // The enum + label split has to reach the PROSE too: a model that knows only "set weather" writes the
  // flavor into the type field, which the grammar then refuses.
  expect(teaching).toContain("scene.weather.type is one of clear/cloudy/rain/storm/snow/fog/wind/ash/indoors");
  expect(teaching).toContain("scene.weather.label");
  // WEATHER IS THE WORLD'S WEATHER. The eight SKY members can only describe a sky the scene can see, so an
  // enclosed scene had no legal value — and the old copy ("restate the current weather while it holds", "pick
  // the CLOSEST one") pushed the model to write one anyway. Live result: `weather.type: "indoors"`, which
  // failed the enum and (before salvage) discarded the WHOLE `update_scene` call — location, cast and
  // recentEvent with it, so a castle-interior game never established a scene at all.
  // …and the trigger is WHAT THE STORY SAYS ABOUT THE SKY, not where the characters are standing: a blizzard
  // closing in past a cabin window is the weather turning even though nobody went outside. An "outdoors only"
  // rule would suppress that legitimate change, so the copy is pinned on the story-tells-you framing.
  //
  // `indoors` is now a real member (owner ladder 2026-08-07), so the copy owes the model the THIRD case as
  // well: enclosed-with-no-sky is WRITABLE, not omitted. The omit rule survives for the genuinely unnameable
  // sky — the two are different states and the prompt must not collapse them, or the vocabulary and the
  // instruction disagree and the member is one the model is told never to use.
  expect(teaching).toContain("WORLD'S weather");
  expect(teaching).toContain("indoors or out");
  expect(teaching).toContain("story says nothing about the sky");
  expect(teaching).toContain('use "indoors" when the scene is enclosed and no sky is visible from it at all');
  expect(teaching).toContain("OMIT weather rather than forcing the nearest");
});

test("weather.type reaches the WIRE schema as an enum (the grammar binds it); weather.label stays free", () => {
  // The `timeOfDay` mechanism, applied to weather: the constraint is the zod enum itself, so every backend's
  // response_format mapping enforces it with zero per-provider code. Read off the PROJECTED schema — the thing
  // the model is actually handed.
  const projected = projectJsonSchema(rpgExtractionSchema) as Record<string, unknown>;
  // @orb-waive no-test-fabrication(Record<string, Record<string, unknown>>): baselined when the gate widened to value casts; burn-down item 906.
  const scene = (projected["properties"] as Record<string, Record<string, unknown>>)["scene"];
  // @orb-waive no-test-fabrication(Record<string, Record<string, unknown>>): baselined when the gate widened to value casts; burn-down item 906.
  const weather = (scene?.["properties"] as Record<string, Record<string, unknown>>)?.["weather"];
  // @orb-waive no-test-fabrication(Record<string, Record<string, unknown>>): baselined when the gate widened to value casts; burn-down item 906.
  const weatherProps = weather?.["properties"] as Record<string, Record<string, unknown>>;
  expect(weatherProps["type"]?.["enum"]).toEqual(["clear", "cloudy", "rain", "storm", "snow", "fog", "wind", "ash", "indoors"]);
  // The xgrammar-visible arm of the widening: `indoors` has to reach the PROJECTED schema, or the model is
  // constrained away from the exact value the prompt now tells it to send ([[xgrammar-enforced-schema…]]).
  expect(updateSceneArgsSchema.safeParse({ weather: { type: "indoors" } }).success).toBe(true);
  expect(weatherProps["label"]).toEqual({ type: "string", maxLength: 40 });
  // And the vocabulary binds at PARSE too (a folded tool round re-validates against the same schema).
  expect(updateSceneArgsSchema.safeParse({ weather: { type: "overcast" } }).success).toBe(false);
  expect(updateSceneArgsSchema.safeParse({ weather: { type: "cloudy", label: "low grey overcast" } }).success).toBe(true);
});

test("SCENE-DROPPED, THE SYMPTOM DYING: the exact live indoor payload now applies WHOLE, with nothing salvaged", () => {
  // This is the payload that was failing in production, verbatim from the wire capture on the castle-interior
  // chat: the model sent `weather.type: "indoors"`, the closed enum refused it, and the WHOLE `update_scene`
  // call was discarded — location, cast and recentEvent with it, so the game never established a scene at all.
  // EXT-4a's per-field salvage stopped that from being fatal but left a standing
  // `salvagedFields: ["update_scene.weather"]` on every indoor beat: the loss was reduced, not closed.
  //
  // With `indoors` in the vocabulary the whole call lands and the salvage list is EMPTY. That empty list is the
  // receipt — it is the difference between "the enum has a hole and we route around it" and "the model can say
  // what it means". Asserted through the REAL fold (`toolCallsToExtraction`) and the REAL loss reporter, not
  // through the schema alone, because the schema is not where the symptom was visible.
  const calls = [
    {
      name: "update_scene",
      arguments: JSON.stringify({
        location: "Throne Room",
        timeOfDay: "afternoon",
        recentEvent: "Alex arrived",
        weather: { type: "indoors", label: "dim infernal ambiance" },
      }),
    },
  ];

  expect(salvagedToolCallFields(calls)).toEqual([]);
  expect(malformedToolCalls(calls)).toEqual([]);
  const ex = toolCallsToExtraction(calls);
  expect(ex.scene?.location).toBe("Throne Room");
  expect(ex.scene?.recentEvent).toBe("Alex arrived");
  // The weather the model MEANT, both halves: the canonical type it can now express, and the vivid phrasing
  // that used to be the only place an indoor scene could put anything at all.
  expect(ex.scene?.weather).toEqual({ type: "indoors", label: "dim infernal ambiance" });

  // …and the salvage still WORKS — a genuinely unnameable value is still dropped field-wise, not call-wise.
  // Widening the vocabulary must not be mistaken for loosening the grammar.
  const bogus = [{ name: "update_scene", arguments: JSON.stringify({ location: "Throne Room", weather: { type: "sideways" } }) }];
  expect(salvagedToolCallFields(bogus)).toEqual(["update_scene.weather"]);
  expect(toolCallsToExtraction(bogus).scene?.location).toBe("Throne Room");
});

test("RV-9: the structured dateMode teaches WHEN the day counter ticks over (a night passed), not just that it exists", () => {
  const structured = rpgGameConfigSchema.parse({ dateMode: "structured" });
  const teaching = composePlaneTeaching({ config: structured, refs: BARE_REFS });
  expect(teaching).toContain("advance it by one");
  expect(teaching).toContain("sleeps through the");
});

test("§1.6: the plot clause is GATED — plotProgression OFF drops it (applicability, no dead prompt)", () => {
  const off = rpgGameConfigSchema.parse({ features: { plotProgression: false } });
  expect(composePlaneTeaching({ config: off, refs: BARE_REFS })).not.toContain("scene.plot");
});

test("§1.6: the game-tracker fragment is null when the game defines none, and names them when it does", () => {
  expect(composePlaneTeaching({ config: baseConfig(), refs: BARE_REFS })).not.toContain("GAME TRACKERS");
  const config = rpgGameConfigSchema.parse({
    trackers: [{ key: "alarm", label: "Town alarm", shape: "meter", write: "set", subject: "game", max: 100, hint: "how hard the watch is looking" }],
  });
  const teaching = composePlaneTeaching({ config, refs: BARE_REFS });
  expect(teaching).toContain("GAME TRACKERS");
  expect(teaching).toContain("Town alarm");
  expect(teaching).toContain("how hard the watch is looking");
});

test("R2/R6: the party teaching names THIS game's trackers by label + hint, split by the write axis", () => {
  // The R4b lesson generalized: a tracked value the model is told about only as a bare key does not steer.
  // The teaching is a TEMPLATE over the game's own defs — never a static vocabulary this game may not have.
  const config = rpgGameConfigSchema.parse({
    trackers: [
      { key: "grit", label: "Grit", shape: "meter", write: "delta", subject: "actor", max: 10, hint: "resolve you spend to push through danger" },
      { key: "corruption", label: "Corruption", shape: "meter", write: "set", subject: "actor", max: 100, hint: "rises with dark choices" },
      { key: "sealed", label: "Sealed", shape: "meter", write: "delta", subject: "actor", locked: true, hint: "the host owns this" },
    ],
  });
  const teaching = composePlaneTeaching({ config, refs: BARE_REFS });
  expect(teaching).toContain("TRACKED RESOURCES");
  expect(teaching).toContain("Grit");
  expect(teaching).toContain("0-10");
  expect(teaching).toContain("resolve you spend to push through danger");
  expect(teaching).toContain("TRACKED STATES");
  expect(teaching).toContain("Corruption");
  expect(teaching).toContain("rises with dark choices");
  // A LOCKED tracker is not in the write schema, so teaching it would ask for what the grammar forbids.
  expect(teaching).not.toContain("Sealed");
});

test("R2: the per-game tool DESCRIPTIONS interpolate the game's own trackers (templates, never ship strings)", () => {
  const config = rpgGameConfigSchema.parse({
    trackers: [
      { key: "grit", label: "Grit", shape: "meter", write: "delta", subject: "actor", max: 10, hint: "resolve you spend to push through danger" },
      { key: "alarm", label: "Town alarm", shape: "meter", write: "set", subject: "game", max: 100, hint: "how hard the watch is looking" },
    ],
  });
  const described = buildRpgToolDescriptions({ config, refs: BARE_REFS });
  const party = described.get("update_party") ?? "";
  expect(party).toContain("Grit");
  expect(party).toContain("resolve you spend to push through danger");
  expect(party).toContain("trackerDeltas:[{key:'grit'"); // the worked EXAMPLE speaks this game's vocabulary
  expect(described.get("set_tracker") ?? "").toContain("Town alarm");
  // The baseline (no game in scope — the tool-use registry's defs) names no game's trackers, but is the
  // SAME template: one home, so registry and wire can never say different things about the same tool.
  expect(RPG_BASELINE_TOOL_DESCRIPTIONS.get("update_party") ?? "").toContain("trackerDeltas");
  expect(RPG_BASELINE_TOOL_DESCRIPTIONS.get("update_party") ?? "").not.toContain("Grit");
});

test("EXT-4c: BOTH objective gestures are TAUGHT — the teaching and the tool description agree", () => {
  // A schema arm the model is never told about is a dead arm (the §1.6 plane-under-service class). The steer is
  // PROSE in both the plane teaching and the tool description — the model must learn that ticking one objective
  // off is `completeObjectives`, not a re-listing (which is what wiped the other flags before EXT-4c).
  const teaching = composePlaneTeaching({ config: baseConfig(), refs: BARE_REFS });
  expect(teaching).toContain("completeObjectives");
  expect(teaching).toContain("do NOT restate the objective list");
  const quest = buildRpgToolDescriptions({ config: baseConfig(), refs: BARE_REFS }).get("upsert_quest") ?? "";
  expect(quest).toContain("completeObjectives");
  expect(quest).toContain("never re-send objectives[] to report progress");
  // The registry baseline is the same render — registry and wire can never say different things.
  expect(RPG_BASELINE_TOOL_DESCRIPTIONS.get("upsert_quest") ?? "").toContain("completeObjectives");
});

test("MOOD IS A SHORT READ: the cast-mood steer rides both the teaching and update_scene's description", () => {
  // Owner report: models write whole sentences into `mood`, which janks the npc row. Taught in PROSE ONLY —
  // a schema maxLength would make the whole call unemittable on a non-enforcing wire and cost the beat.
  const teaching = composePlaneTeaching({ config: baseConfig(), refs: BARE_REFS });
  expect(teaching).toContain("MOOD IS A SHORT READ");
  expect(teaching).toContain("1-3 words");
  expect(teaching).toContain("never a sentence");
  expect(RPG_BASELINE_TOOL_DESCRIPTIONS.get("update_scene") ?? "").toContain("NEVER a sentence");
  // …and the mood field itself stays UNCONSTRAINED in the projected schema (no maxLength/pattern belt).
  const moodNode = refEnum(projectJsonSchema(rpgExtractionSchema), ["properties", "scene", "properties", "presentUpsert", "items", "properties", "mood"]);
  expect(moodNode).toEqual({ type: "string" });
});

test("§1.6: the structured dateMode prompts the day counter; narrated does NOT (mode-aware fragment)", () => {
  const structured = rpgGameConfigSchema.parse({ dateMode: "structured" });
  expect(composePlaneTeaching({ config: structured, refs: BARE_REFS })).toContain("scene.day");
  // The default (narrated) mode teaches calendarDate, never the integer day counter.
  expect(composePlaneTeaching({ config: baseConfig(), refs: BARE_REFS })).not.toContain("scene.day");
});

test("§1.6 #7 (recommendation A): a deception-active game prefixes the surface-only clause; a plain game does NOT", () => {
  const deceptive = rpgGameConfigSchema.parse({ features: { deception: true } });
  const clause = composePlaneTeaching({ config: deceptive, refs: BARE_REFS });
  expect(clause).toContain("Record only the players' SURFACE reality");
  expect(clause).toContain("Do NOT write a character's secret truth");
  // A non-deception game is byte-free of the clause (the clause is deception-gated).
  expect(composePlaneTeaching({ config: baseConfig(), refs: BARE_REFS })).not.toContain("SURFACE reality");
});
