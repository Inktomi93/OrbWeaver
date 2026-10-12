// @orb/contracts/rpg/extraction — the tool-round fold: parallel calls, drops, per-call verdicts and stripped keys.

import {
  malformedToolCallDetails,
  malformedToolCalls,
  RPG_NO_CHANGES_TOOL,
  RPG_TOOL_ROUND_TOOL_NAMES,
  recordToolCalls,
  salvageExtraction,
  strippedToolCallKeys,
  toolCallsToExtraction,
} from "@orb/contracts/rpg";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

// ── toolCallsToExtraction (the cheap TOOL ROUND fold — parallel tool calls → an RpgExtraction) ──────────

test("RPG_TOOL_ROUND_TOOL_NAMES = the 6 state tools + no_changes (roll_dice excluded — zero state)", () => {
  expect([...RPG_TOOL_ROUND_TOOL_NAMES]).toEqual([
    "update_party",
    "update_inventory",
    "update_scene",
    "set_tracker",
    "upsert_quest",
    "add_journal_entry",
    RPG_NO_CHANGES_TOOL,
  ]);
  expect(RPG_TOOL_ROUND_TOOL_NAMES).not.toContain("roll_dice");
});

test("folds PARALLEL calls into one extraction (same-plane calls accumulate, scene is last-wins)", () => {
  const ex = toolCallsToExtraction([
    { name: "update_party", arguments: JSON.stringify({ targetRef: "player", status: "wounded" }) },
    { name: "update_party", arguments: JSON.stringify({ targetRef: "Kael", hpDelta: -3 }) },
    { name: "update_scene", arguments: JSON.stringify({ location: "the bridge" }) },
    { name: "add_journal_entry", arguments: JSON.stringify({ type: "event", label: "", title: "Fight", content: "A brawl." }) },
  ]);
  expect(ex.party).toHaveLength(2); // both update_party calls accumulate
  expect(ex.party.map((p) => p.targetRef)).toEqual(["player", "Kael"]);
  expect(ex.scene?.location).toBe("the bridge");
  expect(ex.journal).toHaveLength(1);
});

test("the mapped array-arm registry routes every tool through the identical structured-extraction plane", () => {
  const party = { targetRef: "You", status: "ready" };
  const inventory = { targetRef: "You", add: [{ name: "Bone Key" }] };
  const trackerWrite = { key: "momentum", delta: 1 };
  const quest = { name: "Open the Gate", action: "create" as const };
  const journal = { type: "event" as const, content: "The gate opened." };
  const viaCalls = toolCallsToExtraction([
    { name: "update_party", arguments: JSON.stringify(party) },
    { name: "update_inventory", arguments: JSON.stringify(inventory) },
    { name: "set_tracker", arguments: JSON.stringify(trackerWrite) },
    { name: "upsert_quest", arguments: JSON.stringify(quest) },
    { name: "add_journal_entry", arguments: JSON.stringify(journal) },
  ]);
  const viaStructured = salvageExtraction({ party: [party], inventory: [inventory], trackers: [trackerWrite], quests: [quest], journal: [journal] });

  expect(viaStructured.dropped).toEqual([]);
  expect(viaStructured.extraction).toEqual(viaCalls);
});

test("no_changes (and any unknown tool) contributes nothing — the quiet-turn no-op", () => {
  const ex = toolCallsToExtraction([{ name: RPG_NO_CHANGES_TOOL, arguments: "{}" }]);
  expect(ex.party).toEqual([]);
  expect(ex.inventory).toEqual([]);
  expect(ex.scene).toBeUndefined();
  expect(ex.trackers).toEqual([]);
  expect(ex.quests).toEqual([]);
  expect(ex.journal).toEqual([]);
});

test("a malformed args string is DROPPED (errors-as-data — never a throw into the flush)", () => {
  const ex = toolCallsToExtraction([
    { name: "update_party", arguments: "not json{" },
    { name: "update_party", arguments: JSON.stringify({ targetRef: "player" }) },
  ]);
  expect(ex.party).toHaveLength(1); // only the valid call survives
  expect(ex.party[0]?.targetRef).toBe("player");
});

test("a schema-INVALID call is dropped (a tool call missing its required arg never writes)", () => {
  const ex = toolCallsToExtraction([
    { name: "add_journal_entry", arguments: JSON.stringify({ title: "no type or content" }) }, // missing required fields
    { name: "update_scene", arguments: JSON.stringify({ location: "valid" }) },
  ]);
  expect(ex.journal).toEqual([]); // the invalid journal call dropped
  expect(ex.scene?.location).toBe("valid");
});

// ── malformedToolCalls (R1 — the DROP predicate the fold's observability reads) ─────────────────────────
// It must mirror `toolCallsToExtraction`'s silent drops EXACTLY: same input, and whatever the fold threw away
// is what this names. A drift between the two would make a folded turn's log lie about what it lost.

test("R1: names the calls the fold DROPS — non-JSON args and schema-invalid args alike", () => {
  const calls = [
    { name: "update_party", arguments: "{not json" },
    { name: "update_scene", arguments: JSON.stringify({ presentUpsert: "should be an array" }) },
    { name: "update_party", arguments: JSON.stringify({ targetRef: "player", hpDelta: -3 }) },
  ];
  expect([...malformedToolCalls(calls)]).toEqual(["update_party", "update_scene"]);
  // …and the fold kept exactly the one good call (the two predicates agree by construction).
  const ex = toolCallsToExtraction(calls);
  expect(ex.party).toHaveLength(1);
  expect(ex.scene).toBeUndefined();
});

test("R1: `no_changes` and unknown tool names are NOT malformed — they are legitimate no-ops", () => {
  expect(malformedToolCalls([{ name: RPG_NO_CHANGES_TOOL, arguments: "{}" }])).toEqual([]);
  expect(malformedToolCalls([{ name: "some_other_tool", arguments: "not json at all" }])).toEqual([]);
});

test("R1: an all-good round reports nothing dropped (a quiet log on the happy path)", () => {
  expect(
    malformedToolCalls([
      { name: "update_scene", arguments: JSON.stringify({ location: "the ford" }) },
      { name: "add_journal_entry", arguments: JSON.stringify({ type: "event", label: "", title: "t", content: "c" }) },
    ]),
  ).toEqual([]);
});

// ── malformedToolCallDetails (TOOLDROP-BLIND — the regression `malformedToolCalls` used to BE) ──────────
// `malformedToolCalls` returned names only for a while, so a dropped `update_scene` was invisible as to WHY —
// the exact live incident (12/12 `update_scene` drops) that cost hours before a hand probe found the field.

test("TOOLDROP-BLIND: droppedIssues names the field, the reason, and the value the model SENT", () => {
  // A required field missing entirely — salvage cannot rescue it (nothing survives dropping `targetRef`,
  // which is a DROP not a salvage by the file's own rule), so this is a genuine whole-call loss.
  const calls = [{ name: "update_party", arguments: JSON.stringify({ status: "wounded" }) }];
  const details = malformedToolCallDetails(calls);
  expect(details).toHaveLength(1);
  expect(details[0]?.name).toBe("update_party");
  expect(details[0]?.issues).toHaveLength(1);
  expect(details[0]?.issues[0]).toContain("targetRef");
  // …and `malformedToolCalls` is `.map`ped off exactly this — the two cannot drift.
  expect([...malformedToolCalls(calls)]).toEqual(["update_party"]);
});

test("TOOLDROP-BLIND: non-JSON arguments carry their own single issue, not a field path", () => {
  const details = malformedToolCallDetails([{ name: "update_party", arguments: "{not json" }]);
  expect(details).toEqual([{ name: "update_party", issues: ["arguments: not valid JSON"] }]);
});

// ── recordToolCalls — the verdict is PER CALL, not per tool NAME (#1370) ────────────────────────────────
// The record is what `rpg_turn_tool_calls` stores and the user-facing disclosure reads. It used to join the
// loss lenses by `call.name` through a `Map`, so a turn with two `update_party` calls — one malformed, one
// valid — reported BOTH as dropped, with the malformed one's issues attached to the valid one. The fold
// applied the valid call's changes, so the row claimed a loss that never happened.

test("two calls to the SAME tool get independent verdicts — one dropped, one applied", () => {
  const good = JSON.stringify({ targetRef: "Kael", status: "wounded" });
  const bad = JSON.stringify({ status: "wounded" }); // no targetRef — a whole-call drop
  const record = recordToolCalls([
    { name: "update_party", arguments: bad },
    { name: "update_party", arguments: good },
  ]);
  expect(record.map((r) => r.verdict)).toEqual(["dropped", "applied"]);
  expect(record[0]?.issues[0]).toContain("targetRef");
  expect(record[1]?.issues).toEqual([]);
  expect(record[1]?.args).toBe(good);
});

test("the same independence holds for SALVAGED — a salvaged call does not paint its twin", () => {
  const clean = JSON.stringify({ location: "Throne Room", weather: { type: "indoors", label: "dim" } });
  // `location` survives, so the unnameable weather costs the FIELD, not the call (the salvage class).
  const salvageable = JSON.stringify({ location: "Throne Room", weather: { type: "sideways" } });
  const record = recordToolCalls([
    { name: "update_scene", arguments: salvageable },
    { name: "update_scene", arguments: clean },
  ]);
  expect(record.map((r) => r.verdict)).toEqual(["salvaged", "applied"]);
  expect([...(record[0]?.issues ?? [])]).toEqual(["update_scene.weather"]);
  expect(record[1]?.issues).toEqual([]);
});

// ── strippedToolCallKeys (D112 (3) — the SILENT class the drop predicate can't see) ─────────────────────
// `z.object` is strip-mode: a call carrying an undeclared key parses CLEAN with that key deleted. So a
// successful ToolCallRecord could hide a write that never happened, invisible to every existing channel.

test("D112 (3): a call that PARSES but carried an undeclared key is named, with its path", () => {
  // `hpDelta` is the live case: R3 retired it in favour of a `trackerDeltas` entry with `key:"hp"`, so a model
  // reaching for the old vocabulary lands a successful update_party whose damage silently never applied.
  const calls = [{ name: "update_party", arguments: JSON.stringify({ targetRef: "player", hpDelta: -3 }) }];
  expect(malformedToolCalls(calls)).toEqual([]); // the drop channel is blind to it, by construction
  expect([...strippedToolCallKeys(calls)]).toEqual(["update_party.hpDelta"]);
  expect(toolCallsToExtraction(calls).party).toEqual([{ targetRef: "player" }]); // …and this is what applied
});

test("D112 (3): strips are reported at DEPTH — inside a nested object and an array item", () => {
  expect([
    ...strippedToolCallKeys([
      {
        name: "update_scene",
        arguments: JSON.stringify({ weather: { type: "rain", intensity: 3 }, presentUpsert: [{ name: "Kael" }, { name: "Mira", vibe: "grim" }] }),
      },
    ]),
  ]).toEqual(["update_scene.weather.intensity", "update_scene.presentUpsert.1.vibe"]);
});

test("D112 (3): a DROPPED call is not double-counted as stripped, and no-ops/clean calls report nothing", () => {
  // Non-JSON and schema-invalid calls are whole-call losses `malformedToolCalls` already names.
  expect(
    strippedToolCallKeys([
      { name: "update_party", arguments: "{not json" },
      { name: "update_scene", arguments: JSON.stringify({ presentUpsert: "should be an array" }) },
    ]),
  ).toEqual([]);
  // `no_changes` / an unknown name meant to apply nothing, so nothing was stripped from it.
  expect(strippedToolCallKeys([{ name: RPG_NO_CHANGES_TOOL, arguments: JSON.stringify({ anything: 1 }) }])).toEqual([]);
  expect(strippedToolCallKeys([{ name: "update_scene", arguments: JSON.stringify({ location: "the ford" }) }])).toEqual([]);
});

test("D112 (3): the STRUCTURED arm reports the same strips — per entry, and for an undeclared ROOT plane key", () => {
  const { extraction, dropped, stripped } = salvageExtraction({
    party: [{ targetRef: "player", hpDelta: -3 }],
    scene: { location: "the ford", vibe: "tense" },
    // A whole plane under a key that names nothing: the per-plane walk never looks at it, so without the root
    // check this payload's entire tracker write would read as a quiet beat.
    trackerDeltas: [{ key: "hp", delta: -2 }],
  });
  expect(dropped).toEqual([]); // every entry CONFORMED — a strip is not a drop
  expect([...stripped]).toEqual(["trackerDeltas", "party.0.hpDelta", "scene.vibe"]);
  expect(extraction.party).toEqual([{ targetRef: "player" }]);
});

test("D112 (3): a clean payload reports nothing stripped (quiet on the happy path)", () => {
  expect(salvageExtraction({ scene: { location: "the ford" }, party: [{ targetRef: "player", status: "wounded" }] }).stripped).toEqual([]);
  expect(salvageExtraction({}).stripped).toEqual([]);
  expect(salvageExtraction("not an object").stripped).toEqual([]); // an unusable root is a DROP, not a strip
});
