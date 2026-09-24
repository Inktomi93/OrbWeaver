// §4f/§4g — the LOCAL 8B on the CURRENT extraction surface: folded vs cheap vs structured.
//
// HISTORICAL NOTE (2026-08-01): the third arm used to be the app's `reliable` DELIVERY MODE. That mode was
// DELETED whole (owner ruling — it measured worst on the exact field its schema guardrail existed to secure).
// The arm survives here as `structured` because the schema VEHICLE still ships (the agent-sdk degrade + the
// host resync) and this harness measures backend enforcement classes, not product knobs. Result files under
// this directory are historical records and keep the old arm name.
//
// WHY A NEW HARNESS AND NOT `run-coverage.mjs`: that one froze the pre-unification wire (`poolDeltas`,
// `set_widget_value`, `presentUpsert.customFields`) into a captured `real-cheap-toolround.json`, so it can no
// longer measure the surface we ship. THIS harness drives the REAL exported builders — the tool parameters
// come from `constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), refs)` (R5a condition enum + R6
// grouped per-actor tracker keys + establish-when-unset), the descriptions from `buildRpgToolDescriptions`
// (R2 templates rendered against THIS game), the teaching from `composePlaneTeaching`, the reminder from the
// production `buildLiteReminder`, and the apply from the production `extractionToStateDelta`. What is
// re-spelled here (and ONLY this) are the three private compose-layer wrappers a probe cannot import:
// `buildToolRoundWireTools`, `toolRoundSystem`, `extractionSystem`/`refEnumerationLines`. They are mirrored
// line-for-line from `packages/server/src/entry/compose/rpg.ts`; if that file moves, this drifts.
//
// THE THREE ARMS ARE THREE ENFORCEMENT CLASSES ON THIS BACKEND (§4f), not one mechanism three ways:
//   folded   — tools + tool_choice:"auto"     → vLLM 0.22.1 compiles NO grammar (utils.py:252-253)
//   cheap    — tools + tool_choice:"required" → grammar over the tool union (utils.py:250-251)
//   structured — response_format json_schema  → grammar over the whole extraction (protocol.py:588)
// So `enumViolations` is a first-class column: non-zero is EXPECTED on folded and would be a finding on the
// other two.
//
// Run:  node_modules/.bin/tsx scripts/probes/rpg-extraction/local-8b-vehicles.ts
// Env:  SPIKE_ARMS=folded,cheap,structured · SPIKE_RUNS=3 · SPIKE_OUT=v2 · SPIKE_ENDPOINT · SPIKE_MODEL
// Cost: $0 (local gen engine). Writes per-run JSON + a the probe's sibling ./SUMMARY.md under SPIKE_OUT.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ExtractionRefs,
  RpgActorEntry,
  RpgActorView,
  RpgExtraction,
  RpgGameConfig,
  RpgQuestView,
  RpgSnapshotState,
  RpgTrackerCarrier,
  RpgTrackerEntry,
  RpgTrackerView,
} from "@orb/contracts/rpg";
import {
  buildRpgToolDescriptions,
  buildTrackerWriteGroups,
  composePlaneTeaching,
  constrainExtractionSchema,
  gameTrackers,
  gameTrackerWriteKeys,
  malformedToolCalls,
  RPG_JOURNAL_TYPES,
  RPG_NO_CHANGES_TOOL,
  RPG_PROFILE_FREEFORM,
  rpgActorEntrySchema,
  rpgExtractionSchema,
  rpgGameConfigSchema,
  rpgTrackerDefSchema,
  salvageExtraction,
  toolCallsToExtraction,
  trackersForCarrier,
} from "@orb/contracts/rpg";
import type { UserId } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { buildActorRefIndex, extractionToStateDelta } from "../../../packages/server/src/domain/rpg/tools/apply.ts";
import { buildLiteReminder, frameLiteReminder } from "../../../packages/server/src/domain/rpg/substrate/reminder.ts";
import { scrubWireSchema } from "@orb/contracts/inference";

/** The vLLM guided-decoding subset — the probe drives a local 8b on the `openai-compatible` transport. */
function cleanJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return scrubWireSchema(schema, "guided-decoding").schema;
}

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, process.env["SPIKE_OUT"] ?? "v2");
const ENDPOINT = process.env["SPIKE_ENDPOINT"] ?? "http://127.0.0.1:8703/v1/chat/completions";
const MODEL = process.env["SPIKE_MODEL"] ?? "Qwen/Qwen3-VL-8B-Instruct";
const RUNS = Number.parseInt(process.env["SPIKE_RUNS"] ?? "3", 10);
const ARMS = (process.env["SPIKE_ARMS"] ?? "folded,cheap,structured").split(",").map((s) => s.trim());

const PLAYER_REF = "player";
const PLAYER_NAME = "Rook";
const PLAYER_USER = "user-rook" as UserId;
const EXTRACTION_SCHEMA_NAME = "rpg_state_extraction";

// ── the game: "The Ford Road" (§4c) — five scripted retirements, four explicit damage beats ────────────
// Ported verbatim from run-coverage.mjs's AFFLICTIONS_ACTIONS so the numbers stay comparable to §4c's
// Sonnet baseline. `ensure` forces a condition present at TURN START so a missed ADD cannot silently delete
// a REMOVE opportunity — retirement is isolated from addition.
interface Beat {
  readonly text: string;
  readonly ensure?: readonly string[];
  readonly expectRemove?: readonly string[];
  readonly expectHp?: boolean;
}
const BEATS: readonly Beat[] = [
  { text: "The ambush comes at the ford. A blade opens a long gash across my forearm and the blood runs freely down to my fingers before I drive the man off.", expectHp: true },
  { text: "I keep moving along the riverbank, pressing the arm to my side, watching the treeline for the second one." },
  { text: "I stop, tear a strip of clean linen from my pack and bind the gash tight. The bleeding stops.", ensure: ["Bleeding"], expectRemove: ["Bleeding"] },
  { text: "The marsh road stinks of rot. I breathe it too long and something turns in my gut — a sick, creeping heat under the skin." },
  { text: "I stumble on a sunken root and go down hard on the stones, knocking the wind clean out of me.", ensure: ["Poisoned"], expectHp: true },
  { text: "I dig out the antidote vial and swallow it whole. Within minutes the heat drains out of me and my head clears — the poison is gone.", ensure: ["Poisoned"], expectRemove: ["Poisoned"] },
  { text: "At the wayshrine an old priest lays his hands on my blade and speaks the warding rite. The steel takes on a faint, steady light." },
  { text: "The warden of the bridge will not let me pass. We fight; his cudgel catches my shoulder before I put him down.", ensure: ["Blessed"], expectHp: true },
  { text: "The light gutters and dies out of the blade as the last of the rite burns away. The blessing is spent.", ensure: ["Blessed"], expectRemove: ["Blessed"] },
  { text: "I push on through the whole night without rest, and by grey dawn I am swaying on my feet, barely tracking the road." },
  { text: "On the scree slope my ankle turns under me with a sick wrench and I come down on the rocks.", ensure: ["Exhausted"], expectHp: true },
  { text: "I take a full night at the waystation — a real bed, a hot meal, the ankle bound and rested. I wake clear-headed and strong, and the limp is gone.", ensure: ["Exhausted", "Lamed"], expectRemove: ["Exhausted", "Lamed"] },
];

const PERSONA =
  "You are the game master of an immersive tabletop role-play. Narrate the world in vivid second person for " +
  "the player character, Rook, a courier on the road north. Voice any present cast in dialogue. Keep replies " +
  "to 2-3 short paragraphs.";

// ── the game CONFIG: real trackers, so the R6 write surface and `set_tracker` are actually exercised ────
// Two actor-subject trackers (one `delta` resource, one `set` state) and one game-subject tracker. All
// `everyone`, so `buildTrackerWriteGroups` collapses to ONE group — the common flat-schema shape.
function gameConfig(): RpgGameConfig {
  return rpgGameConfigSchema.parse({
    extractionMode: "folded",
    trackers: [
      rpgTrackerDefSchema.parse({ key: "stamina", label: "Stamina", shape: "meter", write: "delta", subject: "actor", max: 14, hint: "wind you spend pushing on" }),
      rpgTrackerDefSchema.parse({ key: "resolve", label: "Resolve", shape: "text", write: "set", subject: "actor", hint: "how steady they are right now" }),
      rpgTrackerDefSchema.parse({ key: "pursuit", label: "Pursuit", shape: "meter", write: "set", subject: "game", max: 100, hint: "how close the hunters are" }),
    ],
  });
}

function seedState(): RpgSnapshotState {
  const volatile: RpgActorEntry = rpgActorEntrySchema.parse({
    actorRef: { kind: "user", userId: PLAYER_USER },
    volatile: {
      trackerValues: { stamina: { value: 14, items: null, max: null } },
    conditions: [],
    inventory: [
      { id: "i1", name: "Worn Shortsword", description: "", quantity: 1, location: "sheathed", type: "" },
      { id: "i2", name: "Traveler's Cloak", description: "", quantity: 1, location: "worn", type: "" },
      { id: "i3", name: "Linen Strips", description: "clean bandaging", quantity: 3, location: "pack", type: "" },
    ],
      wallet: [{ name: "gold", amount: 40 }],
      status: "alert",
    },
  });
  return {
    clock: null,
    calendarDate: null,
    location: "the ford",
    weather: null,
    presentCharacters: [],
    recentEvents: [],
    actorState: [volatile],
    trackerValues: {},
    quests: [],
    plot: { act: 1, title: "The Ford Road", acts: [] },
    fieldLocks: null,
  };
}

const PARTICIPANTS = [{ actorRef: { kind: "user", userId: PLAYER_USER } as const, name: PLAYER_NAME }];

// ── refs: MIRRORS `resolveExtractionRefs` (compose/rpg.ts:355) minus the db reads ───────────────────────
function refsFor(state: RpgSnapshotState, config: RpgGameConfig): ExtractionRefs {
  const carriers: RpgTrackerCarrier[] = [
    { actorKey: `user:${PLAYER_USER}`, name: PLAYER_REF, kind: "party", grants: [], revokes: [] },
    { actorKey: `user:${PLAYER_USER}`, name: PLAYER_NAME, kind: "party", grants: [], revokes: [] },
  ];
  const seen = new Set(carriers.map((c) => c.name.toLowerCase()));
  // ONE walk over the tracked cast since R2 (the scene cast and the tracked cast are the same rows), and the
  // enum offers each actor's DISPLAY name — never her slug key.
  for (const actor of state.actorState) {
    const name = actor.actorRef.kind === "npc" ? (actor.identity?.name ?? actor.actorRef.npcKey) : "";
    if (name !== "" && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      carriers.push({ actorKey: `npc:${actor.actorRef.kind === "npc" ? actor.actorRef.npcKey : ""}`, name, kind: "npcs", grants: [], revokes: [] });
    }
  }
  return {
    actorRefs: carriers.map((c) => c.name),
    trackerWriteGroups: buildTrackerWriteGroups(config.trackers, carriers),
    gameTrackerKeys: gameTrackerWriteKeys(config.trackers),
    conditionNames: [...new Set(state.actorState.flatMap((a) => a.volatile.conditions.map((c) => c.name)))],
    establishScene: { location: state.location === "", timeOfDay: state.clock === null, presentCast: state.presentCharacters.length === 0 },
  };
}

// ── the three private compose wrappers, MIRRORED (see the file header) ──────────────────────────────────

interface WireTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

/** MIRROR of `buildToolRoundWireTools` (compose/rpg.ts:674). */
function wireTools(refs: ExtractionRefs, config: RpgGameConfig): WireTool[] {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), refs) as {
    properties?: Record<string, { items?: Record<string, unknown> }>;
  };
  const itemSchemaOf = (field: string): Record<string, unknown> | undefined => {
    const node = constrained.properties?.[field];
    return node === undefined ? undefined : (node.items ?? { type: "object" });
  };
  const sceneSchema = (constrained.properties?.["scene"] as Record<string, unknown> | undefined) ?? { type: "object" };
  const descriptions = buildRpgToolDescriptions({ config, refs });
  const describe = (name: string): string => descriptions.get(name) ?? "";
  const tools: WireTool[] = [
    { name: "update_party", description: describe("update_party"), parameters: itemSchemaOf("party") ?? { type: "object" } },
    { name: "update_inventory", description: describe("update_inventory"), parameters: itemSchemaOf("inventory") ?? { type: "object" } },
    { name: "update_scene", description: describe("update_scene"), parameters: sceneSchema },
  ];
  const trackerParams = itemSchemaOf("trackers");
  if (trackerParams !== undefined) {
    tools.push({ name: "set_tracker", description: describe("set_tracker"), parameters: trackerParams });
  }
  tools.push(
    { name: "upsert_quest", description: describe("upsert_quest"), parameters: itemSchemaOf("quests") ?? { type: "object" } },
    { name: "add_journal_entry", description: describe("add_journal_entry"), parameters: itemSchemaOf("journal") ?? { type: "object" } },
    {
      name: RPG_NO_CHANGES_TOOL,
      description: "Call ONLY when the latest beat changed NOTHING trackable. Do NOT use this to avoid filling fields — if anything in the fiction moved, record it.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  );
  return tools;
}

/** MIRROR of `refEnumerationLines` (compose/rpg.ts:442). */
function refEnumerationLines(refs: ExtractionRefs): string {
  const lines: string[] = [];
  if (refs.actorRefs.length > 0) {
    lines.push(`Valid targetRef values (use EXACTLY one of these for any party/inventory/scene target): ${refs.actorRefs.join(", ")}.`);
  }
  lines.push(`"${PLAYER_REF}" = the human's own character (currently shown as "${PLAYER_NAME}"); prefer "${PLAYER_REF}" for the human.`);
  for (const group of refs.trackerWriteGroups) {
    if (group.deltaKeys.length === 0 && group.setKeys.length === 0) {
      continue;
    }
    const arms: string[] = [];
    if (group.deltaKeys.length > 0) {
      arms.push(`trackerDeltas keys: ${group.deltaKeys.join(", ")}`);
    }
    if (group.setKeys.length > 0) {
      arms.push(`trackerSets keys: ${group.setKeys.join(", ")}`);
    }
    lines.push(`For ${group.targetRefs.join(", ")} — ${arms.join("; ")}.`);
  }
  const gameKeys = [...refs.gameTrackerKeys.deltaKeys, ...refs.gameTrackerKeys.setKeys];
  if (gameKeys.length > 0) {
    lines.push(`Valid set_tracker keys (game-wide trackers — never invent one): ${gameKeys.join(", ")}.`);
  }
  if (refs.conditionNames.length > 0) {
    lines.push(`Currently-active conditions (removeCondition must name EXACTLY one of these): ${refs.conditionNames.join(", ")}.`);
  }
  lines.push("Location goes in scene.location — NEVER in a tracker. Never target a name not in the lists above.");
  return lines.join("\n");
}

const EXTRACTION_SYSTEM_HEADER =
  "You keep a role-play game's tracked state in sync with the story. You are given the RECENT STORY (the turns " +
  "leading up to now), the CURRENT TRACKED STATE (the panel as it stands), and the LATEST BEAT (the newest turn " +
  "— your delta covers exactly this). Output ONE JSON object that updates the tracked state to match the story. " +
  "The RECENT STORY is your evidence: use the whole arc to understand the latest beat — a relationship that has " +
  "warmed over several turns, an item a character picked up earlier and still carries, a quest implied across " +
  "turns. The player sees this as a live character panel, so keep every plane current and rich.";

const TOOL_ROUND_BASE =
  "You maintain the tracked game state. Read the RECENT STORY + current state + the latest story beat, then " +
  "call a SEPARATE tool for EACH plane the beat changed. Check every plane independently:\n" +
  "• Did anyone's HP, pools, conditions, or status change? → update_party (one call PER affected actor)\n" +
  "• Did items or currency move? → update_inventory\n" +
  "• Did the location, time, weather, or present cast change? → update_scene\n" +
  "• Did a game-wide tracker change? → set_tracker\n" +
  "• Did a quest start, advance, complete, or fail? → upsert_quest\n" +
  "• Is there a notable beat worth logging? → add_journal_entry\n" +
  'Most beats change MORE THAN ONE plane — e.g. "she\'s wounded and bleeding as you flee into the cave" ' +
  "needs update_party (a Bleeding condition on her) AND update_scene (location → cave), so call BOTH in this " +
  "one turn. Emit every applicable call together. If — and only if — the beat changed NOTHING trackable, call " +
  "no_changes and nothing else. Do not narrate.";

/** MIRROR of `toolRoundSystem` / `extractionSystem` (compose/rpg.ts:641 / :213). */
function roundSystem(kind: "cheap" | "structured", config: RpgGameConfig, refs: ExtractionRefs): string {
  const head = kind === "cheap" ? TOOL_ROUND_BASE : EXTRACTION_SYSTEM_HEADER;
  return [head, composePlaneTeaching({ config, refs }), refEnumerationLines(refs)].join("\n\n");
}

// ── the reminder: the PRODUCTION `buildLiteReminder` over a hand-projected tracker view ─────────────────
// The view projection mirrors `chat-ops/tracker-view.ts:buildTrackerView` minus its db reads (one roster
// actor, no sheet rows ⇒ the default sheet, no grants/revokes).
function trackerView(state: RpgSnapshotState, config: RpgGameConfig): RpgTrackerView {
  const defs = config.trackers;
  const byKey = new Map(state.actorState.map((v) => [v.actorRef.kind === "user" ? `user:${v.actorRef.userId}` : `npc:${v.actorRef.kind === "npc" ? v.actorRef.npcKey : ""}`, v]));
  const present = new Set(state.presentCharacters);
  const participantActors: RpgActorView[] = PARTICIPANTS.map((r) => ({
    actorRef: r.actorRef,
    name: r.name,
    presence: present.has(`user:${PLAYER_USER}`),
    identity: null,
    // `flavor: ""` deliberately (RV-11 added the field + its reminder line): an empty flavor renders NOTHING,
    // so this probe's measured prompt stays byte-identical to the runs it is compared against.
    sheet: { className: "courier", attributes: {}, flavor: "", level: 3, trackerGrants: [], trackerRevokes: [] },
    volatile: byKey.get(`user:${PLAYER_USER}`)?.volatile ?? null,
    trackers: trackersForCarrier(defs, { actorKey: `user:${PLAYER_USER}`, name: r.name, kind: "party", grants: [], revokes: [] }),
  }));
  // ONE actor shape for every person (R2): the tracked cast rows join the roster in the same list.
  const castActors: RpgActorView[] = state.actorState
    .filter((entry) => entry.actorRef.kind === "npc")
    .map((entry) => {
      const npcKey = entry.actorRef.kind === "npc" ? entry.actorRef.npcKey : "";
      const name = entry.identity?.name ?? npcKey;
      return {
        actorRef: entry.actorRef,
        name,
        presence: present.has(`npc:${npcKey}`),
        identity: entry.identity ?? null,
        sheet: { className: "", attributes: {}, flavor: "", level: null, trackerGrants: [], trackerRevokes: [] },
        volatile: entry.volatile,
        trackers: trackersForCarrier(defs, { actorKey: `npc:${npcKey}`, name, kind: "npcs", grants: [], revokes: [] }),
      };
    });
  const actors: RpgActorView[] = [...participantActors, ...castActors];
  const gameEntries: RpgTrackerEntry[] = gameTrackers(defs).map((def) => ({ def, value: state.trackerValues[def.key] ?? null }));
  const quests: RpgQuestView[] = state.quests.map((q) => ({ id: q.id, name: q.name, status: q.status, description: q.description, objectives: q.objectives }));
  const ambient =
    state.clock === null && state.weather === null && state.location === "" && state.calendarDate === null
      ? null
      : { location: state.location, calendarDate: state.calendarDate, clock: state.clock, weather: state.weather };
  return {
    ambient,
    actors,
    cast: state.presentCharacters,
    trackerDefs: defs,
    gameTrackers: gameEntries,
    quests,
    plot: state.plot,
    recentBeats: state.recentEvents.slice(-config.features.recentBeatsKeepLast),
    trackersReadOnly: false,
    trackerOrbs: [],
    lockedPaths: [],
  };
}

function reminderFor(cur: RpgSnapshotState, prev: RpgSnapshotState | null, config: RpgGameConfig): string {
  const reminder = buildLiteReminder({
    view: trackerView(cur, config),
    steeringNote: config.lite.steeringNote,
    curSnapshot: cur,
    prevSnapshot: prev,
    statProfile: RPG_PROFILE_FREEFORM,
    features: config.features,
    participantNames: { [`user:${PLAYER_USER}`]: PLAYER_NAME },
    deception: false,
    omniscience: false,
    dateMode: config.dateMode,
  });
  // No reconcile note and no preset prose here, so this is gather.ts's frame call with shipped defaults.
  return frameLiteReminder(reminder, {});
}

// ── the extraction user prompt (MIRROR of compose/rpg.ts:242 `window` arm; ~4 chars/token budget) ────────
function extractionUserPrompt(story: readonly { role: string; text: string }[], state: RpgSnapshotState, beat: string, budget: number): string {
  const kept: string[] = [];
  let used = 0;
  for (let i = story.length - 1; i >= 0; i--) {
    const row = story[i];
    if (row === undefined) {
      continue;
    }
    const tokens = Math.ceil(row.text.length / 4);
    if (used + tokens > budget && kept.length > 0) {
      break;
    }
    kept.push(`${row.role === "user" ? PLAYER_NAME : "GM"}: ${row.text}`);
    used += tokens;
  }
  kept.reverse();
  const { fieldLocks: _locks, quests, ...rest } = state;
  const stripped = quests.map(({ id: _id, objectives, ...q }) => ({ ...q, objectives: objectives.map(({ id: _oid, ...o }) => o) }));
  const stateJson = JSON.stringify({ ...rest, quests: stripped });
  if (kept.length === 0) {
    return `CURRENT STATE:\n${stateJson}\n\nLATEST BEAT:\n${beat}`;
  }
  return `RECENT STORY (oldest first):\n${kept.join("\n")}\n\nCURRENT TRACKED STATE:\n${stateJson}\n\nLATEST BEAT (the newest story turn above — your delta covers exactly this):\n${beat}`;
}

// ── the wire ────────────────────────────────────────────────────────────────────────────────────────────
interface WireMessage {
  readonly role: string;
  readonly content: string;
}
interface WireCall {
  readonly name: string;
  readonly arguments: string;
}
interface CallResult {
  readonly content: string;
  readonly calls: WireCall[];
  readonly finish: string;
  readonly latencyMs: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
}

async function post(body: Record<string, unknown>, label: string): Promise<CallResult> {
  const started = Date.now();
  const res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${label} HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = JSON.parse(text) as {
    choices?: { message: { content: string | null; tool_calls?: { function: { name: string; arguments: string } }[] }; finish_reason: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: unknown;
  };
  const choice = json.choices?.[0];
  if (choice === undefined) {
    throw new Error(`${label}: no choice — ${JSON.stringify(json.error ?? json).slice(0, 300)}`);
  }
  return {
    content: choice.message.content ?? "",
    calls: (choice.message.tool_calls ?? []).map((tc) => ({ name: tc.function.name, arguments: tc.function.arguments })),
    finish: choice.finish_reason,
    latencyMs: Date.now() - started,
    promptTokens: json.usage?.prompt_tokens ?? 0,
    completionTokens: json.usage?.completion_tokens ?? 0,
  };
}

// ── coverage: the CURRENT leaf set (48 leaves — the /43 denominator died with pools/widgets) ────────────
const nStr = (v: unknown): boolean => typeof v === "string" && v.trim() !== "";
const nNum = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v);
const nArr = (v: unknown): boolean => Array.isArray(v) && v.length > 0;
type Args = Record<string, unknown>;
const pu = (list: Args[], fn: (p: Args) => boolean): boolean => list.some((a) => ((a["presentUpsert"] as Args[] | undefined) ?? []).some(fn));
const inv = (list: Args[], key: string, pred: (v: unknown) => boolean): boolean =>
  list.some((a) => ((a["add"] as Args[] | undefined) ?? []).some((it) => pred(it[key])));

const FIELD_SPECS: readonly (readonly [string, string, (list: Args[]) => boolean])[] = [
  ["update_party.targetRef", "update_party", (l) => l.some((a) => nStr(a["targetRef"]))],
  ["update_party.trackerDeltas", "update_party", (l) => l.some((a) => nArr(a["trackerDeltas"]))],
  ["update_party.trackerSets", "update_party", (l) => l.some((a) => nArr(a["trackerSets"]))],
  ["update_party.addCondition.name", "update_party", (l) => l.some((a) => nStr((a["addCondition"] as Args | undefined)?.["name"]))],
  ["update_party.addCondition.modifier", "update_party", (l) => l.some((a) => nNum((a["addCondition"] as Args | undefined)?.["modifier"]))],
  ["update_party.removeCondition", "update_party", (l) => l.some((a) => nStr(a["removeCondition"]))],
  ["update_party.status", "update_party", (l) => l.some((a) => nStr(a["status"]))],
  ["update_inventory.targetRef", "update_inventory", (l) => l.some((a) => nStr(a["targetRef"]))],
  ["update_inventory.add.name", "update_inventory", (l) => inv(l, "name", nStr)],
  ["update_inventory.add.description", "update_inventory", (l) => inv(l, "description", nStr)],
  ["update_inventory.add.quantity", "update_inventory", (l) => inv(l, "quantity", nNum)],
  ["update_inventory.add.location", "update_inventory", (l) => inv(l, "location", nStr)],
  ["update_inventory.remove", "update_inventory", (l) => l.some((a) => nArr(a["remove"]))],
  ["update_inventory.walletDeltas", "update_inventory", (l) => l.some((a) => nArr(a["walletDeltas"]))],
  ["update_scene.location", "update_scene", (l) => l.some((a) => nStr(a["location"]))],
  ["update_scene.calendarDate", "update_scene", (l) => l.some((a) => nStr(a["calendarDate"]))],
  ["update_scene.day", "update_scene", (l) => l.some((a) => nNum(a["day"]))],
  ["update_scene.timeOfDay", "update_scene", (l) => l.some((a) => nStr(a["timeOfDay"]))],
  ["update_scene.weather.type", "update_scene", (l) => l.some((a) => nStr((a["weather"] as Args | undefined)?.["type"]))],
  ["update_scene.weather.label", "update_scene", (l) => l.some((a) => nStr((a["weather"] as Args | undefined)?.["label"]))],
  ["update_scene.presentUpsert.name", "update_scene", (l) => pu(l, (p) => nStr(p["name"]))],
  ["update_scene.presentUpsert.emoji", "update_scene", (l) => pu(l, (p) => nStr(p["emoji"]))],
  ["update_scene.presentUpsert.mood", "update_scene", (l) => pu(l, (p) => nStr(p["mood"]))],
  ["update_scene.presentUpsert.appearance", "update_scene", (l) => pu(l, (p) => nStr(p["appearance"]))],
  ["update_scene.presentUpsert.outfit", "update_scene", (l) => pu(l, (p) => nStr(p["outfit"]))],
  ["update_scene.presentUpsert.thoughts", "update_scene", (l) => pu(l, (p) => nStr(p["thoughts"]))],
  ["update_scene.presentUpsert.relationship.kind", "update_scene", (l) => pu(l, (p) => nStr((p["relationship"] as Args | undefined)?.["kind"]))],
  ["update_scene.presentUpsert.relationship.label", "update_scene", (l) => pu(l, (p) => nStr((p["relationship"] as Args | undefined)?.["label"]))],
  ["update_scene.presentRemove", "update_scene", (l) => l.some((a) => nArr(a["presentRemove"]))],
  ["update_scene.recentEvent", "update_scene", (l) => l.some((a) => nStr(a["recentEvent"]))],
  ["update_scene.plot.act", "update_scene", (l) => l.some((a) => nNum((a["plot"] as Args | undefined)?.["act"]))],
  ["update_scene.plot.title", "update_scene", (l) => l.some((a) => nStr((a["plot"] as Args | undefined)?.["title"]))],
  ["update_scene.plot.actTitle", "update_scene", (l) => l.some((a) => nStr((a["plot"] as Args | undefined)?.["actTitle"]))],
  ["update_scene.plot.actSummary", "update_scene", (l) => l.some((a) => nStr((a["plot"] as Args | undefined)?.["actSummary"]))],
  ["set_tracker.key", "set_tracker", (l) => l.some((a) => nStr(a["key"]))],
  ["set_tracker.delta", "set_tracker", (l) => l.some((a) => nNum(a["delta"]))],
  ["set_tracker.value", "set_tracker", (l) => l.some((a) => a["value"] !== undefined)],
  ["set_tracker.items", "set_tracker", (l) => l.some((a) => nArr(a["items"]))],
  ["upsert_quest.name", "upsert_quest", (l) => l.some((a) => nStr(a["name"]))],
  ["upsert_quest.action", "upsert_quest", (l) => l.some((a) => nStr(a["action"]))],
  ["upsert_quest.description", "upsert_quest", (l) => l.some((a) => nStr(a["description"]))],
  ["upsert_quest.objectives", "upsert_quest", (l) => l.some((a) => nArr(a["objectives"]))],
  ["upsert_quest.completeObjectives", "upsert_quest", (l) => l.some((a) => nArr(a["completeObjectives"]))],
  ["add_journal_entry.type", "add_journal_entry", (l) => l.some((a) => nStr(a["type"]))],
  ["add_journal_entry.label", "add_journal_entry", (l) => l.some((a) => nStr(a["label"]))],
  ["add_journal_entry.title", "add_journal_entry", (l) => l.some((a) => nStr(a["title"]))],
  ["add_journal_entry.content", "add_journal_entry", (l) => l.some((a) => nStr(a["content"]))],
];

/** The extraction, re-shaped as `tool → [args]` so ONE coverage/violation scorer serves all three arms. */
function byTool(extraction: RpgExtraction): Record<string, Args[]> {
  const out: Record<string, Args[]> = {
    update_party: extraction.party as unknown as Args[],
    update_inventory: extraction.inventory as unknown as Args[],
    update_scene: extraction.scene === undefined ? [] : [extraction.scene as unknown as Args],
    set_tracker: extraction.trackers as unknown as Args[],
    upsert_quest: extraction.quests as unknown as Args[],
    add_journal_entry: extraction.journal as unknown as Args[],
  };
  return out;
}

/** ENUM VIOLATIONS — a value the CONSTRAINED schema forbade but the wire accepted anyway. On a grammar-bound
 *  arm this must be 0; on the folded arm (no grammar, §4f) it is the receipt that the enum is advisory. Read
 *  off the RAW args, before `toolCallsToExtraction`'s drop, so a violation the fold silently threw away is
 *  still counted. */
function enumViolations(raw: Record<string, Args[]>, refs: ExtractionRefs): string[] {
  const bad: string[] = [];
  const refSet = new Set(refs.actorRefs.map((r) => r.toLowerCase()));
  const conds = new Set(refs.conditionNames.map((c) => c.toLowerCase()));
  const group = refs.trackerWriteGroups[0];
  const deltaKeys = new Set(group?.deltaKeys ?? []);
  const setKeys = new Set(group?.setKeys ?? []);
  const gameKeys = new Set([...refs.gameTrackerKeys.deltaKeys, ...refs.gameTrackerKeys.setKeys]);
  for (const a of raw["update_party"] ?? []) {
    const target = a["targetRef"];
    if (typeof target === "string" && !refSet.has(target.toLowerCase())) {
      bad.push(`party.targetRef="${target}"`);
    }
    const rc = a["removeCondition"];
    if (typeof rc === "string" && conds.size > 0 && !conds.has(rc.toLowerCase())) {
      bad.push(`removeCondition="${rc}"`);
    }
    for (const d of (a["trackerDeltas"] as Args[] | undefined) ?? []) {
      if (typeof d["key"] === "string" && !deltaKeys.has(d["key"])) {
        bad.push(`trackerDeltas.key="${String(d["key"])}"`);
      }
    }
    for (const s of (a["trackerSets"] as Args[] | undefined) ?? []) {
      if (typeof s["key"] === "string" && !setKeys.has(s["key"])) {
        bad.push(`trackerSets.key="${String(s["key"])}"`);
      }
    }
  }
  for (const a of raw["update_inventory"] ?? []) {
    const target = a["targetRef"];
    if (typeof target === "string" && !refSet.has(target.toLowerCase())) {
      bad.push(`inventory.targetRef="${target}"`);
    }
  }
  for (const a of raw["update_scene"] ?? []) {
    for (const r of (a["presentRemove"] as unknown[] | undefined) ?? []) {
      if (typeof r === "string" && !refSet.has(r.toLowerCase())) {
        bad.push(`presentRemove="${r}"`);
      }
    }
  }
  for (const a of raw["set_tracker"] ?? []) {
    if (typeof a["key"] === "string" && gameKeys.size > 0 && !gameKeys.has(a["key"])) {
      bad.push(`set_tracker.key="${String(a["key"])}"`);
    }
  }
  for (const a of raw["add_journal_entry"] ?? []) {
    const t = a["type"];
    if (typeof t === "string" && !(RPG_JOURNAL_TYPES as readonly string[]).includes(t)) {
      bad.push(`journal.type="${t}"`);
    }
  }
  return bad;
}

/** The RAW args off a tool arm's calls (pre-validation) — what the model actually put on the wire. */
function rawFromCalls(calls: readonly WireCall[]): Record<string, Args[]> {
  const out: Record<string, Args[]> = {};
  for (const call of calls) {
    let args: unknown;
    try {
      args = JSON.parse(call.arguments);
    } catch {
      continue;
    }
    if (args === null || typeof args !== "object") {
      continue;
    }
    (out[call.name] ??= []).push(args as Args);
  }
  return out;
}

/** The RAW args off a structured payload (pre-salvage). */
function rawFromPayload(value: unknown): Record<string, Args[]> {
  const out: Record<string, Args[]> = {};
  if (value === null || typeof value !== "object") {
    return out;
  }
  const rec = value as Record<string, unknown>;
  const pairs: readonly (readonly [string, string])[] = [
    ["party", "update_party"],
    ["inventory", "update_inventory"],
    ["trackers", "set_tracker"],
    ["quests", "upsert_quest"],
    ["journal", "add_journal_entry"],
  ];
  for (const [plane, tool] of pairs) {
    const arr = rec[plane];
    if (Array.isArray(arr)) {
      out[tool] = arr.filter((e): e is Args => e !== null && typeof e === "object");
    }
  }
  const scene = rec["scene"];
  if (scene !== null && typeof scene === "object") {
    out["update_scene"] = [scene as Args];
  }
  return out;
}

// Number-recitation into prose (the license forbids it): an explicit reading like "26/26" or "HP 20".
const RECITE_RE = /\b\d+\s*\/\s*\d+\b|\b(?:hp|stamina|resolve|pursuit)\b\s*(?:is|:|=|at)?\s*\d+/i;

interface TurnRow {
  readonly turn: number;
  readonly narrative: string;
  readonly narrativeChars: number;
  readonly calls: readonly string[];
  /** The RAW args the model put on the wire, tool-keyed — persisted because the scored columns can't answer
   *  "it emitted the field but with a FILLER value" (the enforced-schema `hpDelta: 0` class). */
  readonly rawArgs: Record<string, Args[]>;
  readonly coverage: Record<string, boolean>;
  readonly conditionsAtStart: readonly string[];
  readonly enumViolations: readonly string[];
  readonly droppedTools: readonly string[];
  readonly droppedEntries: readonly string[];
  readonly appliedEntries: number;
  readonly wholeTurnSavedByExt4: boolean;
  readonly recited: boolean;
  readonly latencyMs: number;
  readonly truth: {
    readonly expectRemove: readonly string[];
    readonly removeHits: readonly string[];
    readonly removeMisses: readonly string[];
    readonly removeSpurious: readonly string[];
    readonly expectHp: boolean;
    readonly hpHit: boolean;
  };
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, "");

/** Run ONE game on ONE arm. Returns the per-turn rows + the arm totals. */
async function runGame(arm: string, runIndex: number): Promise<{ turns: TurnRow[]; totals: Record<string, number> }> {
  const config = gameConfig();
  let state = seedState();
  const history: { role: string; text: string }[] = [];
  const turns: TurnRow[] = [];
  const participantIndex = buildActorRefIndex(PARTICIPANTS);
  let mint = 0;
  const mints = { item: () => `it${++mint}`, quest: () => `q${++mint}`, objective: () => `o${++mint}` } as unknown as Parameters<typeof extractionToStateDelta>[2];

  for (const [index, beat] of BEATS.entries()) {
    // Ground-truth setup — force the condition present at turn start (isolates retirement from addition).
    for (const name of beat.ensure ?? []) {
      const actor = state.actorState[0];
      if (actor !== undefined && !actor.volatile.conditions.some((c) => norm(c.name).startsWith(norm(name)) || norm(name).startsWith(norm(c.name)))) {
        const conditions = [...actor.volatile.conditions, { name, stat: null, modifier: 0, turnsLeft: null }];
        state = { ...state, actorState: [{ ...actor, volatile: { ...actor.volatile, conditions } }, ...state.actorState.slice(1)] };
      }
    }
    const prev = state;
    const refs = refsFor(state, config);
    const tools = wireTools(refs, config);
    const reminder = reminderFor(state, prev, config);
    const conditionsAtStart = refs.conditionNames;

    // DELIVERY, exactly as production ships it to a local model: the reminder is an `in_chat` injection at
    // DEPTH 0 — which is *after* the new user turn (`assembly/injections.ts:87`) — with `role:"system"`.
    // At the time this spike ran, a local vLLM model carried `TURNS_FLOOR` (`midConversationSystem:false`),
    // so the splice DEMOTED it to a user row with the visible `[Note from system: …]` framing (`:44`), and
    // the adjacent-same-role squash merged it into the player's own turn with a blank line
    // (`role-squash.ts:45`). One user message — and that is the shape reproduced below, deliberately frozen
    // so this probe's measured numbers stay comparable. The reminder inside it carries production's
    // `rpg.reminder.frame`, so a result file written before the frame measured an unframed reminder.
    // SUPERSEDED IN PRODUCTION (2026-08-18, #201/D143): the vllm arm now declares `VLLM_TURNS`
    // (`midConversationSystem:true`), so the live delivery of this same reminder is a REAL trailing system
    // row. Re-run this probe against that shape before quoting its numbers as current.
    // (An earlier revision of this probe delivered it as its own system row BEFORE the user turn — the 8B
    // then emitted a bare tool call and ZERO prose on every folded turn. Wrong shape, wrong answer.)
    const base: WireMessage[] = [{ role: "system", content: PERSONA }];
    for (const h of history) {
      base.push({ role: h.role, content: h.text });
    }
    base.push({ role: "user", content: `${beat.text}\n\n[Note from system: ${reminder}]` });

    let narrative = "";
    let latency = 0;
    let calls: WireCall[] = [];
    let raw: Record<string, Args[]> = {};
    let extraction: RpgExtraction = { party: [], inventory: [], trackers: [], quests: [], journal: [] };
    let droppedTools: readonly string[] = [];
    let droppedEntries: string[] = [];
    let wholeTurnSaved = false;

    if (arm === "folded") {
      const r = await post({ model: MODEL, messages: base, tools: tools.map((t) => ({ type: "function", function: t })), tool_choice: "auto", max_tokens: 2048, stream: false }, `${arm}/r${runIndex}/t${index + 1}`);
      narrative = r.content;
      latency = r.latencyMs;
      calls = r.calls;
      raw = rawFromCalls(calls);
      droppedTools = malformedToolCalls(calls);
      extraction = toolCallsToExtraction(calls);
    } else {
      const n = await post({ model: MODEL, messages: base, max_tokens: 1024, stream: false }, `${arm}/r${runIndex}/t${index + 1}/narr`);
      narrative = n.content;
      latency = n.latencyMs;
      const userPrompt = extractionUserPrompt(history, state, narrative, config.extractionWindowTokens);
      const roundMessages: WireMessage[] = [
        { role: "system", content: roundSystem(arm === "cheap" ? "cheap" : "structured", config, refs) },
        { role: "user", content: userPrompt },
      ];
      if (arm === "cheap") {
        const r = await post({ model: MODEL, messages: roundMessages, tools: tools.map((t) => ({ type: "function", function: t })), tool_choice: "required", max_tokens: 2048, stream: false }, `${arm}/r${runIndex}/t${index + 1}/round`);
        latency += r.latencyMs;
        calls = r.calls;
        raw = rawFromCalls(calls);
        droppedTools = malformedToolCalls(calls);
        extraction = toolCallsToExtraction(calls);
      } else {
        const schema = cleanJsonSchema(constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), refs));
        const r = await post(
          { model: MODEL, messages: roundMessages, response_format: { type: "json_schema", json_schema: { name: EXTRACTION_SCHEMA_NAME, schema } }, max_tokens: 3072, stream: false },
          `${arm}/r${runIndex}/t${index + 1}/extract`,
        );
        latency += r.latencyMs;
        let payload: unknown = null;
        try {
          payload = JSON.parse(r.content);
        } catch {
          payload = null;
        }
        raw = rawFromPayload(payload);
        const salvage = salvageExtraction(payload);
        extraction = salvage.extraction;
        droppedEntries = salvage.dropped.map((d) => `${d.plane}[${d.index ?? "*"}]: ${d.issues.join("; ")}`);
        // Pre-EXT-4a the WHOLE payload went through one safeParse — any drop cost the entire turn.
        wholeTurnSaved = salvage.dropped.length > 0 && appliedCount(extraction) > 0;
        calls = [];
      }
    }

    const violations = enumViolations(raw, refs);
    const tally = byTool(extraction);
    const coverage: Record<string, boolean> = {};
    for (const [key, tool, test] of FIELD_SPECS) {
      coverage[key] = test(tally[tool] ?? []);
    }

    // Ground truth — prefix-matched both ways (the model writes "Bleeding wound" for our "Bleeding").
    const emittedRemoves = (tally["update_party"] ?? []).map((a) => a["removeCondition"]).filter((v): v is string => typeof v === "string");
    const expectRemove = beat.expectRemove ?? [];
    const hit = (want: string): boolean => emittedRemoves.some((got) => norm(got).startsWith(norm(want)) || norm(want).startsWith(norm(got)));
    const emittedHp = (tally["update_party"] ?? []).some((a) => ((a["trackerDeltas"] as Args[] | undefined) ?? []).some((d) => d["key"] === "hp" && nNum(d["delta"]) && d["delta"] !== 0));

    const delta = extractionToStateDelta(state, extraction, mints, participantIndex);
    state = { ...state, ...(delta.statePatch as Partial<RpgSnapshotState>) };

    turns.push({
      turn: index + 1,
      narrative,
      narrativeChars: narrative.length,
      calls: calls.map((c) => c.name),
      rawArgs: raw,
      coverage,
      conditionsAtStart,
      enumViolations: violations,
      droppedTools,
      droppedEntries,
      appliedEntries: appliedCount(extraction),
      wholeTurnSavedByExt4: wholeTurnSaved,
      recited: RECITE_RE.test(narrative),
      latencyMs: latency,
      truth: {
        expectRemove,
        removeHits: expectRemove.filter(hit),
        removeMisses: expectRemove.filter((w) => !hit(w)),
        removeSpurious: emittedRemoves.filter((got) => !expectRemove.some((w) => norm(got).startsWith(norm(w)) || norm(w).startsWith(norm(got)))),
        expectHp: beat.expectHp === true,
        hpHit: beat.expectHp === true && emittedHp,
      },
    });

    history.push({ role: "user", text: beat.text });
    history.push({ role: "assistant", text: narrative });
    process.stdout.write(
      `  ${arm} r${runIndex} t${index + 1}: ${narrative.length}ch · ${calls.length || appliedCount(extraction)} writes · rm ${turns.at(-1)?.truth.removeHits.length ?? 0}/${expectRemove.length} · viol ${violations.length} · ${latency}ms\n`,
    );
  }

  const totals = {
    removeExpected: turns.reduce((a, t) => a + t.truth.expectRemove.length, 0),
    removeHit: turns.reduce((a, t) => a + t.truth.removeHits.length, 0),
    removeSpurious: turns.reduce((a, t) => a + t.truth.removeSpurious.length, 0),
    hpExpected: turns.filter((t) => t.truth.expectHp).length,
    hpHit: turns.filter((t) => t.truth.hpHit).length,
    fieldsTouched: FIELD_SPECS.filter(([key]) => turns.some((t) => t.coverage[key])).length,
    enumViolations: turns.reduce((a, t) => a + t.enumViolations.length, 0),
    droppedTools: turns.reduce((a, t) => a + t.droppedTools.length, 0),
    droppedEntries: turns.reduce((a, t) => a + t.droppedEntries.length, 0),
    appliedEntries: turns.reduce((a, t) => a + t.appliedEntries, 0),
    ext4SavedTurns: turns.filter((t) => t.wholeTurnSavedByExt4).length,
    recitedTurns: turns.filter((t) => t.recited).length,
    quietTurns: turns.filter((t) => t.appliedEntries === 0).length,
    meanNarrativeChars: Math.round(turns.reduce((a, t) => a + t.narrativeChars, 0) / Math.max(1, turns.length)),
    meanLatencyMs: Math.round(turns.reduce((a, t) => a + t.latencyMs, 0) / Math.max(1, turns.length)),
  };
  return { turns, totals };
}

function appliedCount(e: RpgExtraction): number {
  return e.party.length + e.inventory.length + e.trackers.length + e.quests.length + e.journal.length + (e.scene === undefined ? 0 : 1);
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  // The write surface, once, as a receipt: what the CURRENT builders actually hand the model.
  const seed = seedState();
  const cfg = gameConfig();
  fs.writeFileSync(
    path.join(OUT, "wire-surface.json"),
    JSON.stringify({ refs: refsFor(seed, cfg), tools: wireTools(refsFor(seed, cfg), cfg), structuredSchema: cleanJsonSchema(constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), refsFor(seed, cfg))) }, null, 2),
  );
  const summary: Record<string, { totals: Record<string, number> }[]> = {};
  for (const arm of ARMS) {
    summary[arm] = [];
    for (let run = 1; run <= RUNS; run++) {
      console.log(`\n=== ${arm} · run ${run}/${RUNS} ===`);
      const result = await runGame(arm, run);
      fs.writeFileSync(path.join(OUT, `${arm}-${run}.json`), JSON.stringify(result, null, 2));
      summary[arm]?.push({ totals: result.totals });
      console.log(`[done] ${arm} r${run}: rm ${result.totals["removeHit"]}/${result.totals["removeExpected"]} · hp ${result.totals["hpHit"]}/${result.totals["hpExpected"]} · fields ${result.totals["fieldsTouched"]}/${FIELD_SPECS.length} · viol ${result.totals["enumViolations"]}`);
    }
  }
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ model: MODEL, leafCount: FIELD_SPECS.length, summary }, null, 2));
  console.log(`\nwrote ${OUT}`);
}

await main();
