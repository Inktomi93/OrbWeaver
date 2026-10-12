// tests/server/domain/rpg/field-reachability — the INVENTORY: every contract leaf is PROVEN to reach the reminder, delta or macro feed by a probe, or carries a cited exemption.

import type { RpgTrackerDef } from "@orb/contracts/rpg";
import { rpgSheetSchema, rpgSnapshotStateSchema, rpgTrackerDefSchema } from "@orb/contracts/rpg";
import { zodLeafPaths } from "@orb/testkit/iso/zod-leaf-paths.ts";
import type { Carrier, Fixture, RPG_MACRO_KEYS } from "./_field-reachability-support.ts";
import { ACTOR_CARRIERS, CARRIERS, HOST, MANA, openGame, openingBeat, RPG_SCENE_OPENS_HEADING, stageCast } from "./_field-reachability-support.ts";
import { expect, test } from "./_support.ts";

type CarrierKind = Carrier["kind"];

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE INVENTORY — derived from the contracts, never hand-listed.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Every leaf field the model-facing state planes declare: the swipe-volatile SNAPSHOT (which contains the
 *  per-actor volatile plane), the per-actor identity SHEET, and the TRACKER DEF (a game's host-authored
 *  tracked-field vocabulary — the reminder teaches it once per turn). */
const INVENTORY: readonly string[] = [
  ...zodLeafPaths(rpgSnapshotStateSchema, "state"),
  ...zodLeafPaths(rpgSheetSchema, "sheet"),
  ...zodLeafPaths(rpgTrackerDefSchema, "tracker"),
];

/** REMINDER exemptions — a leaf the absolute state block deliberately does NOT render, with the reason. A new
 *  entry is a CLAIM someone has to defend; `QUESTION:` marks a call the owner still owes (never a guess). */
const REMINDER_UNRENDERED: Readonly<Record<string, string>> = {
  "state.clock.minute":
    "lite steers time by the TIME_OF_DAY vocabulary (`TIME_OF_DAY_HOURS` writes a representative hour); the minute has no write door and no reader — `timeOfDayAtHour` is the rendered datum.",
  "state.weather.temperatureC":
    "a full-ENGINE storage field born whole (contracts/rpg/ambient header); lite's `update_scene.weather` writes {type,label} only, so there is never a value to render.",
  "state.weather.wind": "a full-engine storage field, unwritable in lite (see state.weather.temperatureC).",
  "state.weather.visibility": "a full-engine storage field, unwritable in lite (see state.weather.temperatureC).",
  "state.actorState[].identity.characterId":
    "the promotion JOIN to a participant character row (the R4 doorway) — an id is never model-facing (projection-clean law, contracts/rpg/tools header).",
  "state.actorState[].actorRef.kind":
    "the actor-ref plane is ADDRESSING: the reminder prints the actor's NAME (participant projection / npc key), never its ref.",
  "state.actorState[].actorRef.characterId": "addressing (see actorRef.kind) — and an id is never model-facing.",
  "state.actorState[].actorRef.userId": "addressing (see actorRef.kind) — and an id is never model-facing.",
  "state.actorState[].actorRef.npcKey": "addressing (see actorRef.kind); the npc row's `name` is what the Present line prints.",
  "state.actorState[].volatile.conditions[].stat":
    "a full-ENGINE condition slot born whole (contracts/rpg/actor header) — lite writes only `name` (`update_party.addCondition`), so the modifier triple has no lite value to state.",
  "state.actorState[].volatile.conditions[].modifier": "full-engine slot, unwritable in lite (see conditions[].stat).",
  "state.actorState[].volatile.conditions[].turnsLeft": "full-engine slot, unwritable in lite (see conditions[].stat).",
  "state.actorState[].volatile.inventory[].id": "the minted addressing id (the `inventory.<id>` lock path) — never model-facing.",
  "state.actorState[].volatile.inventory[].type":
    "the full-engine equip/filter taxonomy; the lite applier writes the EMPTY STRING unconditionally (`applyUpdateInventory`), so there is no value to render.",
  "state.actorState[].volatile.inventory[].icon":
    "a HOST display pick from the `@orb/ui/icons` seal (#37) — panel decoration, absent from every model write surface by design.",
  "state.quests[].id": "the minted quest id (the `quests.<id>` lock path + the hand-edit address) — never model-facing (the model addresses a quest by NAME).",
  "state.quests[].objectives[].id": "the per-objective addressing id; the model completes objectives BY TEXT (`completeObjectives`).",
  "state.fieldLocks.*":
    "manual-edit-wins BOOKKEEPING, deliberately invisible to the model: D113 #4 — the reminder is the model's KNOWLEDGE and the tools are its permissions, so a locked field renders in full and the lock bites only at the write schema (proven by the lock matrix below).",

  "tracker.key":
    "the ADDRESSING key every stored value/lock/write-arm joins on (never a label — a rename must not orphan a value); `label` is the model-facing name.",
  "tracker.write":
    "the WRITE axis — it picks the tool arm the model is handed (`delta` vs `set`), never a read datum. Proven live by `actorTrackerWriteKeys` in the lock matrix below.",
  "tracker.color": "band/bar decoration (aria-hidden geometry, `RPG_TRACKER_COLOR_RE`) — a panel concern with nothing to say to a narrator.",
  "tracker.icon": "panel decoration — a curated `@orb/ui/icons` seal name the tracker rows/orbs draw (see tracker.color).",
  "tracker.pinned":
    "the BAND selection — a panel decision. The reminder is pin-blind by design: every carried tracker reads whatever the host pinned (proven byte-identical across pin state below).",
  "tracker.locked": "R6 prevent-at-schema — a locked tracker is ABSENT from the write schema and renders IDENTICALLY in the reminder (D113 #4, proven below).",
};

/** DELTA exemptions — a leaf whose transition deliberately produces no diff line. The delta's job is the beats
 *  the prose must LAND, not every byte that moved: the reminder already carries the absolutes. */
const DELTA_UNRENDERED: Readonly<Record<string, string>> = {
  "state.clock.minute":
    "no lite write door; the intra-day arm diffs the derived time-of-day LABEL, not the raw clock (`timeLines` — a within-band tick is not a beat).",
  "state.weather.temperatureC": "a full-engine storage field with no lite write door (see the reminder cite) — there is never a value to diff.",
  "state.weather.wind": "a full-engine storage field with no lite write door (see state.weather.temperatureC).",
  "state.weather.visibility": "a full-engine storage field with no lite write door (see state.weather.temperatureC).",
  "state.weather.description":
    "hand-edit-only (absent from `update_scene.weather`); the weather TRANSITION line diffs the DISPLAYED text (`rpgWeatherText` = label ?? type), which is the one home for that string.",
  "state.actorState[].identity.characterId": "the promotion JOIN id to a participant character row — an id is never model-facing (projection-clean law).",
  "state.actorState[].identity.emoji":
    "cast DECORATION re-authored by the extraction every beat; a diff of it would fire constantly and say nothing the absolute line doesn't.",
  "state.actorState[].identity.mood":
    "re-observed every beat by the extraction round (the model just wrote it) — the absolute cast line carries it; diffing it is noise, not a beat.",
  "state.actorState[].identity.appearance":
    "a STANDING guide the extraction re-authors every beat (RV-11); the reminder's continuation line carries it absolutely.",
  "state.actorState[].identity.outfit": "a standing guide the extraction re-authors every beat; absolute-only (see identity.appearance).",
  "state.actorState[].identity.thoughts": "a standing guide the extraction re-authors every beat; absolute-only (see identity.appearance).",
  "state.recentEvents[]":
    "EXCLUDED BY CONSTRUCTION (`PLANE_DIFF_RENDERERS` header): a beat is an APPEND, not a mutation — the reminder's Recent-beats block is the whole record.",
  "state.actorState[].actorRef.kind":
    "addressing — the per-actor renderers LABEL a line through `participantNames`/the npc key (`actorLabel`), never by printing the ref.",
  "state.actorState[].actorRef.characterId": "addressing, and an id is never model-facing (see state.actorState[].actorRef.kind).",
  "state.actorState[].actorRef.userId": "addressing, and an id is never model-facing (see state.actorState[].actorRef.kind).",
  "state.actorState[].actorRef.npcKey": "addressing (see actorRef.kind) — it IS the cast line's label, which the reminder probe covers.",
  "state.actorState[].volatile.conditions[].stat": "full-engine slot, unwritable in lite (reminder cite); the conditions diff matches by NAME.",
  "state.actorState[].volatile.conditions[].modifier": "a full-engine condition slot lite never writes (see state.actorState[].conditions[].stat).",
  "state.actorState[].volatile.conditions[].turnsLeft": "a full-engine condition slot lite never writes (see state.actorState[].conditions[].stat).",
  "state.actorState[].volatile.inventory[].id": "the inventory diff matches by NAME (a re-added item mints a new id — an id diff would report a phantom swap).",
  "state.actorState[].volatile.inventory[].type": "always the empty string in lite (the applier writes no taxonomy), so there is nothing to diff.",
  "state.actorState[].volatile.inventory[].icon": "a HOST display pick from the icon seal — unwritable by play, so no beat can ever move it.",
  "state.actorState[].volatile.status":
    "a free-prose state the beat OVERWRITES (`update_party.status`), re-authored whenever it moves — same class as cast `mood`: the reminder's absolute line is the honest home, and a transition line would fire on every re-phrasing.",
  "state.actorState[].volatile.trackerValues.*.max":
    "the per-carrier CEILING is HOST-authored (no tool arm carries `max`) — a ceiling edit is authoring, not a beat; the reading's transition line already prints the effective ceiling.",
  "state.trackerValues.*.max": "host-authored ceiling (see actorState[].trackerValues.*.max).",
  "state.quests[].id": "the quest diff matches by `id`; the line names the quest by NAME.",
  "state.quests[].description": "authoring polish, not a beat (the `plot.acts[].summary` precedent) — the reminder's quest line carries it absolutely.",
  "state.quests[].objectives[].id": "objective progress diffs as `n/m` over the completion COUNT; the id is addressing.",
  "state.quests[].objectives[].text":
    "the objective LIST is authoring (a model restating it re-types every line — `mergeObjectives` matches on the text precisely because it churns); progress diffs as `n/m`.",
  "state.plot.acts[].summary": "act title/summary edits WITHIN the same act are silent by design (`plotRenderer` — authoring polish, not a campaign beat).",
  "state.fieldLocks.*": "locks are HONORED, never narrated (see the reminder cite).",
  "sheet.className":
    "THE SHEET IS NOT A SNAPSHOT PLANE — the delta diffs two `RpgSnapshotState`s, and sheets live in `rpg_sheets` (identity, hand-written, not a beat). Structurally unreachable, not merely unrendered.",
  "sheet.attributes.*": "identity plane, not a snapshot plane (see sheet.className).",
  "sheet.flavor": "identity plane, not a snapshot plane (see sheet.className).",
  "sheet.level": "identity plane — and EXPLICITLY excluded by the delta registry header (hand-only progression the prose doesn't react to).",
  "sheet.trackerGrants[]": "identity plane; carriage is a READ concern (it decides which trackers a carrier's lines show).",
  "sheet.trackerRevokes[]": "identity plane, not a snapshot plane; carriage is a READ concern (see sheet.trackerGrants[]).",
  "tracker.key": "addressing — the actor/game tracker diffs correlate BY key (never by label: a rename is not a beat).",
  "tracker.appliesTo":
    "CARRIAGE is a read concern: the delta diffs the values a snapshot actually holds, so who carries a tracker shapes the reminder's lines, not the diff's.",
  "tracker.write": "the write axis picks the tool arm the model is handed (`delta` vs `set`), never a diff line.",
  "tracker.color": "band/bar decoration (aria-hidden geometry) — a panel concern with nothing to say to a narrator.",
  "tracker.icon": "panel decoration — a curated `@orb/ui/icons` seal name the tracker rows/orbs draw.",
  "tracker.sort": "render ORDER of the reminder's vocabulary + readings; the diff emits in the plane-registry order instead.",
  "tracker.pinned": "the BAND selection — a panel decision, invisible to both read surfaces by design.",
  "tracker.locked": "write-surface gate; a locked tracker a hand edit moves still DIFFS (the read surface is total).",
};

/** MACRO exemptions — a leaf the preset-facing feed deliberately does NOT stage. The feed composes the
 *  reminder's line builders, so this list is the reminder's cites plus the ONE posture difference the feed owns
 *  (no vocabulary lines — see the `macro-view.ts` header). */
const MACRO_UNRENDERED: Readonly<Record<string, string>> = {
  "state.clock.minute": "no lite write door and no reader anywhere — the composed ambient line renders `timeOfDayAtHour` (see the reminder cite).",
  "state.weather.temperatureC": "a full-ENGINE storage field lite never writes, so there is never a value to stage (see the reminder cite).",
  "state.weather.wind": "a full-engine storage field, unwritable in lite (see state.weather.temperatureC).",
  "state.weather.visibility": "a full-engine storage field, unwritable in lite (see state.weather.temperatureC).",
  "state.presentCharacters[]":
    "the PRESENCE plane is a list of ADDRESSING keys (`actorRefKey`) since R2 — it decides WHICH actors the feed's `Present:` block carries. Printed nowhere; each actor's `identity.name` is the datum.",
  "state.actorState[].identity.characterId": "the promotion JOIN id to a participant character row — an id is never model-facing (projection-clean law).",
  "state.actorState[].actorRef.kind":
    "addressing — a line is LABELLED by the participant projection / npc key, never by printing the ref (see the reminder cite).",
  "state.actorState[].actorRef.characterId": "addressing, and an id is never model-facing (see state.actorState[].actorRef.kind).",
  "state.actorState[].actorRef.userId": "addressing, and an id is never model-facing (see state.actorState[].actorRef.kind).",
  "state.actorState[].actorRef.npcKey": "addressing — it joins the volatile row to its npc; the member's `name` is what the line prints.",
  "state.actorState[].volatile.conditions[].stat":
    "a full-ENGINE condition slot lite never writes (`update_party.addCondition` carries `name` only — the reminder cite).",
  "state.actorState[].volatile.conditions[].modifier": "full-engine slot, unwritable in lite (see state.actorState[].conditions[].stat).",
  "state.actorState[].volatile.conditions[].turnsLeft": "full-engine slot, unwritable in lite (see state.actorState[].conditions[].stat).",
  "state.actorState[].volatile.inventory[].id": "the minted addressing id (the `inventory.<id>` lock path) — never model-facing.",
  "state.actorState[].volatile.inventory[].type":
    "the lite applier writes the EMPTY STRING unconditionally, so there is no taxonomy value to stage (the reminder cite).",
  "state.actorState[].volatile.inventory[].icon":
    "a HOST display pick from the `@orb/ui/icons` seal — panel decoration, absent from every model write surface by design.",
  "state.quests[].id": "the minted quest id (the lock path + the hand-edit address) — the model addresses a quest by NAME.",
  "state.quests[].objectives[].id": "the per-objective addressing id; the model completes objectives BY TEXT.",
  "state.fieldLocks.*": "manual-edit-wins BOOKKEEPING, deliberately invisible to the model on every read surface (D113 #4 — see the reminder cite).",

  "tracker.key": "the ADDRESSING key every stored value/lock/write-arm joins on; `label` is the model-facing name.",
  "tracker.write":
    "the WRITE axis — it picks the tool arm the model is handed, never a read datum (proven live by `actorTrackerWriteKeys` in the lock matrix).",
  "tracker.color": "band/bar decoration (aria-hidden geometry) — a panel concern with nothing to say to a narrator.",
  "tracker.icon": "panel decoration — a curated `@orb/ui/icons` seal name the tracker rows/orbs draw.",
  "tracker.pinned":
    "the BAND selection — a panel decision; every read surface renders whatever the host pinned, identically (proven byte-identical across pin state below).",
  "tracker.locked": "R6 prevent-at-schema — a locked tracker is ABSENT from the write schema and stages IDENTICALLY here (D113 #4).",
};

/** The strings a carrier's ADDRESSING key would print if a display-name join ever fell back to it. Derived
 *  from the carrier's own ref so a new carrier kind cannot be added without one. */
function refKeyNeedles(carrier: Carrier): readonly string[] {
  const ref = carrier.actorRef;
  if (ref.kind === "character") {
    return [`character:${ref.characterId}`, ref.characterId];
  }
  if (ref.kind === "user") {
    return [`user:${ref.userId}`, ref.userId];
  }
  // A NPC actor's slug key is not an id — it is a legitimate (if ugly) fallback label, and the display name
  // is what must win. Assert the key form only.
  return [`npc:${ref.npcKey}`];
}

/** One macro assertion — WHICH macro key must carry the text. Naming the key is the discipline: a needle that
 *  matched "anywhere in the feed" would pass on a datum staged only in the delta re-export. */
interface MacroNeedle {
  readonly key: RpgMacroKey;
  readonly text: string;
}

type RpgMacroKey = (typeof RPG_MACRO_KEYS)[number];

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE PROBES — each one PROVES a set of inventory leaves reaches a surface, through the real path.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════

interface FieldProbe {
  readonly name: string;
  /** Leaves this probe proves reach the REMINDER. */
  readonly reminderPaths: readonly string[];
  /** Leaves this probe proves reach the DELTA. */
  readonly deltaPaths?: readonly string[];
  /** Leaves this probe proves reach the preset-facing MACRO feed. */
  readonly macroPaths?: readonly string[];
  /** The carrier kinds to run it over (per-actor planes run all three; scene/game planes run once). */
  readonly carriers?: readonly CarrierKind[];
  readonly trackers?: readonly RpgTrackerDef[];
  readonly d20?: boolean;
  readonly drive: (f: Fixture) => Promise<void>;
  readonly reminder: (f: Fixture) => readonly string[];
  /** Strings that must NOT appear (the field-state half of the matrix: an empty/filtered field renders NOTHING —
   *  no dangling label, no phantom row). Asserted against the ABSOLUTE state block. */
  readonly absent?: (f: Fixture) => readonly string[];
  /** Strings that must NOT appear ANYWHERE in the assembled reminder — the state block, the delta/SCENE-OPENS
   *  block and the teaching blocks together. The block-scoped `absent` above could not see the SCENE OPENS
   *  arm at all, which is precisely where a raw ref key reached the model unnoticed. */
  readonly reminderAbsent?: (f: Fixture) => readonly string[];
  readonly delta?: (f: Fixture) => readonly string[];
  /** What the named macro keys must carry (the third surface's positive half). */
  readonly macro?: (f: Fixture) => readonly MacroNeedle[];
  /** What the named macro keys must NOT carry — the filtered/emptied half (a completed objective, a completed
   *  quest): the feed is per-plane, so an absence there is its own claim. */
  readonly macroAbsent?: (f: Fixture) => readonly MacroNeedle[];
}

const TRUST: RpgTrackerDef = rpgTrackerDefSchema.parse({
  key: "trust",
  label: "Trust",
  shape: "text",
  write: "set",
  subject: "actor",
  hint: "where you stand",
});
const PACK: RpgTrackerDef = rpgTrackerDefSchema.parse({ key: "pack", label: "Pack", shape: "list", write: "set", subject: "actor" });
/** The HP meter a mechanical profile SEEDS at game mint (R3 — `rpgSeedTrackers`). Health is an ordinary
 *  tracker, so the health probe drives it through the ordinary machinery; the def is spelled here rather than
 *  imported so the probe states the shape it is claiming reachability FOR. */
const SEEDED_HP: RpgTrackerDef = rpgTrackerDefSchema.parse({
  key: "hp",
  label: "HP",
  shape: "meter",
  write: "delta",
  subject: "actor",
  appliesTo: "everyone",
  max: 20,
  pinned: true,
});
const ALARM: RpgTrackerDef = rpgTrackerDefSchema.parse({
  key: "alarm",
  label: "Alarm",
  shape: "meter",
  write: "delta",
  subject: "game",
  max: 5,
  hint: "how close the watch is",
});

const PROBES: readonly FieldProbe[] = [
  // ── the per-actor VOLATILE plane, over every carrier kind ────────────────────────────────────────────────
  {
    // R3 — HEALTH IS A SEEDED TRACKER. It used to be a schema-privileged `hp` leaf with a bespoke tool arm, a
    // named reminder seg, its own delta renderer and a SECOND max home on the sheet. It is an ordinary meter
    // now, so this probe proves it through the SAME machinery every other meter uses — which is exactly the
    // claim the demotion makes.
    name: "health — the SEEDED hp meter reads absolutely and diffs signed like any other tracker",
    reminderPaths: [],
    carriers: ACTOR_CARRIERS,
    trackers: [SEEDED_HP],
    drive: async (f) => {
      await f.beat(openingBeat(f.carrier));
      await f.handActorOps([{ op: "setTracker", key: "hp", value: { value: 12 } }]);
      await f.beat({ party: [{ targetRef: f.carrier.targetRef, trackerDeltas: [{ key: "hp", delta: -4 }] }] });
    },
    reminder: (f) => [`${f.carrier.label}`, "HP 8/20"],
    delta: (f) => [`${f.carrier.label} HP 12→8 (-4)`],
    // `{{rpgCast}}` stages BOTH carrier blocks (Party + Present), so one needle covers all three carrier kinds.
    macro: () => [{ key: "rpgCast", text: "HP 8/20" }],
  },
  {
    name: "status — the free-prose per-actor state reads absolutely",
    reminderPaths: ["state.actorState[].volatile.status"],
    macroPaths: ["state.actorState[].volatile.status"],
    carriers: ACTOR_CARRIERS,
    drive: async (f) => {
      await f.beat({ ...stageCast(f.carrier), party: [{ targetRef: f.carrier.targetRef, status: "favouring one leg" }] });
    },
    reminder: () => ["favouring one leg"],
    macro: () => [{ key: "rpgCast", text: "favouring one leg" }],
  },
  {
    name: "conditions — an applied affliction reads on the line and diffs as +/−",
    reminderPaths: ["state.actorState[].volatile.conditions[].name"],
    deltaPaths: ["state.actorState[].volatile.conditions[].name"],
    macroPaths: ["state.actorState[].volatile.conditions[].name"],
    carriers: ACTOR_CARRIERS,
    drive: async (f) => {
      await f.beat({ ...stageCast(f.carrier), party: [{ targetRef: f.carrier.targetRef, addCondition: { name: "poisoned" } }] });
      await f.beat({ party: [{ targetRef: f.carrier.targetRef, addCondition: { name: "bleeding" }, removeCondition: "poisoned" }] });
    },
    reminder: () => ["conditions: bleeding"],
    absent: () => ["conditions: poisoned"],
    delta: (f) => [`+bleeding (${f.carrier.label})`, `-poisoned (${f.carrier.label})`],
    macro: () => [{ key: "rpgCast", text: "conditions: bleeding" }],
    macroAbsent: () => [{ key: "rpgCast", text: "conditions: poisoned" }],
  },
  {
    name: "inventory — carried items read by name × quantity + their capped annotation, and diff on add/remove/update",
    reminderPaths: [
      "state.actorState[].volatile.inventory[].name",
      "state.actorState[].volatile.inventory[].quantity",
      "state.actorState[].volatile.inventory[].location",
      "state.actorState[].volatile.inventory[].description",
    ],
    deltaPaths: [
      "state.actorState[].volatile.inventory[].name",
      "state.actorState[].volatile.inventory[].quantity",
      "state.actorState[].volatile.inventory[].location",
      "state.actorState[].volatile.inventory[].description",
    ],
    macroPaths: [
      "state.actorState[].volatile.inventory[].name",
      "state.actorState[].volatile.inventory[].quantity",
      "state.actorState[].volatile.inventory[].location",
      "state.actorState[].volatile.inventory[].description",
    ],
    carriers: ACTOR_CARRIERS,
    drive: async (f) => {
      await f.beat({
        ...stageCast(f.carrier),
        inventory: [{ targetRef: f.carrier.targetRef, add: [{ name: "rope", quantity: 2, description: "forty feet of hemp", location: "the pack" }] }],
      });
      await f.beat({
        inventory: [
          {
            targetRef: f.carrier.targetRef,
            // The CAP arm (owner ruling 2026-08-01): per-item prose rides the roll-call truncated at a word
            // boundary, so one verbose item cannot multiply the party's inventory prose into every turn.
            add: [{ name: "torch", description: "pitch-soaked rag wound on an ash haft, burns for about an hour before it gutters" }],
            update: [{ name: "rope", description: "forty feet of rain-darkened hemp", quantity: 1, location: "across the shoulder" }],
          },
        ],
      });
    },
    reminder: () => [
      "carrying: rope (across the shoulder: forty feet of rain-darkened hemp), torch (pitch-soaked rag wound on an ash haft, burns for about an…)",
    ],
    absent: () => ["before it gutters"],
    delta: (f) => [
      `+torch (${f.carrier.label})`,
      `${f.carrier.label} rope ×2→×1`,
      `${f.carrier.label} rope moved: the pack → across the shoulder`,
      `${f.carrier.label} rope description → forty feet of rain-darkened hemp`,
    ],
    macro: () => [
      {
        key: "rpgCast",
        text: "carrying: rope (across the shoulder: forty feet of rain-darkened hemp), torch (pitch-soaked rag wound on an ash haft, burns for about an…)",
      },
    ],
  },
  {
    name: "wallet — a named amount reads on the line and diffs signed",
    reminderPaths: ["state.actorState[].volatile.wallet[].name", "state.actorState[].volatile.wallet[].amount"],
    deltaPaths: ["state.actorState[].volatile.wallet[].name", "state.actorState[].volatile.wallet[].amount"],
    macroPaths: ["state.actorState[].volatile.wallet[].name", "state.actorState[].volatile.wallet[].amount"],
    carriers: ACTOR_CARRIERS,
    drive: async (f) => {
      await f.beat({ ...stageCast(f.carrier), inventory: [{ targetRef: f.carrier.targetRef, walletDeltas: [{ name: "gold", delta: 40 }] }] });
      await f.beat({ inventory: [{ targetRef: f.carrier.targetRef, walletDeltas: [{ name: "gold", delta: 15 }] }] });
    },
    reminder: () => ["55 gold"],
    delta: (f) => [`${f.carrier.label} gold 40→55 (+15)`],
    macro: () => [{ key: "rpgCast", text: "55 gold" }],
  },
  {
    name: "tracker meter — the value, the effective ceiling and the taught hint reach the model",
    reminderPaths: [
      "state.actorState[].volatile.trackerValues.*.value",
      "tracker.label",
      "tracker.hint",
      "tracker.max",
      "tracker.shape",
      "tracker.subject",
      "tracker.appliesTo",
    ],
    deltaPaths: ["state.actorState[].volatile.trackerValues.*.value", "tracker.label", "tracker.hint", "tracker.max", "tracker.shape", "tracker.subject"],
    macroPaths: [
      "state.actorState[].volatile.trackerValues.*.value",
      "tracker.label",
      "tracker.hint",
      "tracker.max",
      "tracker.shape",
      "tracker.subject",
      "tracker.appliesTo",
    ],
    carriers: ACTOR_CARRIERS,
    trackers: [MANA],
    drive: async (f) => {
      await f.beat({ ...stageCast(f.carrier), party: [{ targetRef: f.carrier.targetRef, trackerSets: [{ key: "mana", value: 7 }] }] });
      await f.beat({ party: [{ targetRef: f.carrier.targetRef, trackerDeltas: [{ key: "mana", delta: -3 }] }] });
    },
    reminder: () => ["Trackers: Mana (fuels spellcasting)", "Mana 4/10"],
    delta: (f) => [`${f.carrier.label} Mana 7→4 (-3) — fuels spellcasting`],
    // The feed stages NO vocabulary line (its one posture difference — see `macro-view.ts`), so the tracker's
    // MEANING reaches a preset author through `{{rpgDelta}}`'s glossed transition instead.
    macro: (f) => [
      { key: "rpgCast", text: "Mana 4/10" },
      { key: "rpgDelta", text: `${f.carrier.label} Mana 7→4 (-3) — fuels spellcasting` },
    ],
  },
  {
    name: "tracker text — a `set` reading reads as `label: value` and diffs as a transition",
    reminderPaths: ["state.actorState[].volatile.trackerValues.*.value"],
    deltaPaths: ["state.actorState[].volatile.trackerValues.*.value"],
    macroPaths: ["state.actorState[].volatile.trackerValues.*.value"],
    carriers: ACTOR_CARRIERS,
    trackers: [TRUST],
    drive: async (f) => {
      await f.beat({ ...stageCast(f.carrier), party: [{ targetRef: f.carrier.targetRef, trackerSets: [{ key: "trust", value: "guarded" }] }] });
      await f.beat({ party: [{ targetRef: f.carrier.targetRef, trackerSets: [{ key: "trust", value: "open" }] }] });
    },
    reminder: () => ["Trust: open"],
    delta: () => ["Trust: guarded → open"],
    macro: () => [{ key: "rpgCast", text: "Trust: open" }],
  },
  {
    name: "tracker list — the items read joined and diff as one transition",
    reminderPaths: ["state.actorState[].volatile.trackerValues.*.items[]"],
    deltaPaths: ["state.actorState[].volatile.trackerValues.*.items[]"],
    macroPaths: ["state.actorState[].volatile.trackerValues.*.items[]"],
    carriers: ACTOR_CARRIERS,
    trackers: [PACK],
    drive: async (f) => {
      await f.beat({ ...stageCast(f.carrier), party: [{ targetRef: f.carrier.targetRef, trackerSets: [{ key: "pack", items: ["rope"] }] }] });
      await f.beat({ party: [{ targetRef: f.carrier.targetRef, trackerSets: [{ key: "pack", items: ["rope", "flint"] }] }] });
    },
    reminder: () => ["Pack: rope, flint"],
    delta: () => ["Pack: rope → rope, flint"],
    macro: () => [{ key: "rpgCast", text: "Pack: rope, flint" }],
  },
  {
    name: "tracker max OVERRIDE — the carrier's own ceiling is what the model is taught",
    reminderPaths: ["state.actorState[].volatile.trackerValues.*.max"],
    macroPaths: ["state.actorState[].volatile.trackerValues.*.max"],
    carriers: ACTOR_CARRIERS,
    trackers: [MANA],
    drive: async (f) => {
      await f.beat({ ...openingBeat(f.carrier), party: [{ targetRef: f.carrier.targetRef, trackerSets: [{ key: "mana", value: 4 }] }] });
      // The per-carrier ceiling is HOST-authored (no tool arm carries `max`) — the hand door writes it.
      await f.handActorOps([{ op: "setTracker", key: "mana", value: { value: 4, max: 6 } }]);
    },
    reminder: () => ["Mana 4/6"],
    absent: () => ["Mana 4/10"],
    macro: () => [{ key: "rpgCast", text: "Mana 4/6" }],
    macroAbsent: () => [{ key: "rpgCast", text: "Mana 4/10" }],
  },
  // ── the FIRST-SNAPSHOT (SCENE OPENS) arm, over EVERY carrier kind ───────────────────────────────────────
  {
    // THE MATRIX HOLE THIS CLOSES: every scene-plane probe below stages a CAST carrier only, so the
    // first-snapshot block was never read with a PARTICIPANT on stage — and a participant actor carries no
    // identity by R2 design, so the presence-key→name join fell back to the raw `character:chr_…`/`user:usr_…`
    // ref and printed it into the model's prompt. That fires on turn 1 of effectively every new game (the
    // establish-when-unset arm FORCES a non-empty cast, and the model habitually lists the participant character),
    // and a branded id is never model-facing — the projection-clean law this suite's own cites invoke.
    //
    // ONE beat means `prev === null` on the lineage, which is exactly the arm under test.
    name: "SCENE OPENS — the first snapshot names an on-stage actor by her DISPLAY NAME, never her ref key",
    reminderPaths: [],
    carriers: ACTOR_CARRIERS,
    drive: async (f) => {
      await f.beat({ scene: { location: "The Ford", presentUpsert: [{ name: f.carrier.targetRef }] } });
    },
    reminder: (f) => [`${RPG_SCENE_OPENS_HEADING}: The Ford · with ${f.carrier.label}`],
    // The ref key in ANY of its spellings — the raw projection AND its bare id half (a `user:` prefix could be
    // stripped and the TypeID still leak).
    reminderAbsent: (f) => refKeyNeedles(f.carrier),
  },
  // ── the SCENE-CAST identity plane ────────────────────────────────────────────────────────────────────────
  {
    name: "npc identity — name, emoji, mood and the three standing guides reach the model",
    reminderPaths: [
      "state.actorState[].identity.name",
      "state.actorState[].identity.emoji",
      "state.actorState[].identity.mood",
      "state.actorState[].identity.appearance",
      "state.actorState[].identity.outfit",
      "state.actorState[].identity.thoughts",
    ],
    deltaPaths: ["state.actorState[].identity.name"],
    macroPaths: [
      "state.actorState[].identity.name",
      "state.actorState[].identity.emoji",
      "state.actorState[].identity.mood",
      "state.actorState[].identity.appearance",
      "state.actorState[].identity.outfit",
      "state.actorState[].identity.thoughts",
    ],
    drive: async (f) => {
      await f.beat({ scene: { presentUpsert: [{ name: "Vesna" }] } });
      await f.beat({
        scene: {
          presentUpsert: [
            {
              name: "Vesna",
              emoji: "🕯️",
              mood: "warming",
              appearance: "tall, silver-haired",
              outfit: "a patched grey habit",
              thoughts: "weighing whether to trust you",
            },
            { name: "Bran" },
          ],
        },
      });
    },
    reminder: () => ["- 🕯️ Vesna — warming", "appearance: tall, silver-haired", "outfit: a patched grey habit", "thoughts: weighing whether to trust you"],
    delta: () => ["+Bran enters"],
    // The guides travel WITH their teaching header on this surface too — `thoughts` must never reach a model
    // without the line that says it is never spoken aloud.
    macro: () => [
      { key: "rpgSceneState", text: "thoughts are UNSPOKEN inner state, never said aloud" },
      { key: "rpgSceneState", text: "- 🕯️ Vesna — warming" },
      { key: "rpgSceneState", text: "appearance: tall, silver-haired" },
      { key: "rpgSceneState", text: "outfit: a patched grey habit" },
      { key: "rpgSceneState", text: "thoughts: weighing whether to trust you" },
      { key: "rpgCast", text: "- 🕯️ Vesna — warming" },
    ],
  },
  {
    // R2 FLIPPED THIS PROBE'S CENTRAL CLAIM, deliberately. A departure used to DESTROY the member's row, so
    // "she leaves the read surface" was literally true — and it was the defect: her name, mood, stance and
    // standing guides were gone, while her tracked state survived on a plane no reader projected. Departure is
    // a PRESENCE drop now, so she leaves the `Present:` block and lands on the terse `Known, offstage` list,
    // which is what lets the model bring her back as a continuation instead of re-inventing her.
    name: "cast exit — a member the scene drops leaves the PRESENT block for the offstage list, and diffs",
    reminderPaths: ["state.presentCharacters[]"],
    deltaPaths: ["state.presentCharacters[]", "state.actorState[].identity.name"],
    drive: async (f) => {
      await f.beat({ scene: { presentUpsert: [{ name: "Vesna" }, { name: "Bran" }] } });
      await f.beat({ scene: { presentRemove: ["Bran"] } });
    },
    reminder: () => ["Present:\n- Vesna", "Known, offstage", "- Bran"],
    delta: () => ["-Bran leaves"],
    macro: () => [{ key: "rpgSceneState", text: "- Vesna" }],
    // The MACRO feed's Present block is the on-stage cast only — the offstage list is a REMINDER-side
    // steering line, not a preset-facing plane (the feed carries no vocabulary/teaching lines either).
    macroAbsent: () => [{ key: "rpgSceneState", text: "Bran" }],
  },
  {
    name: "relationship — the stance reads glossed by its host hint and diffs as a transition",
    reminderPaths: ["state.actorState[].identity.relationship.kind", "state.actorState[].identity.relationship.label"],
    deltaPaths: ["state.actorState[].identity.relationship.kind", "state.actorState[].identity.relationship.label"],
    macroPaths: ["state.actorState[].identity.relationship.kind", "state.actorState[].identity.relationship.label"],
    drive: async (f) => {
      await f.h.service.updateConfig({ principal: HOST, chatId: f.chatId, patch: { relationshipHints: { vassal: "sworn to serve but resentful" } } });
      await f.beat({ scene: { presentUpsert: [{ name: "Mari", relationship: { kind: "friend" } }] } });
      await f.beat({ scene: { presentUpsert: [{ name: "Mari", relationship: { kind: "custom", label: "vassal" } }] } });
    },
    reminder: () => ["vassal (sworn to serve but resentful)"],
    delta: () => ["Mari: friend → vassal (sworn to serve but resentful)"],
    // The feed's own builder printed the bare `vassal` — the host's hint (the whole steering point of a custom
    // kind) reached this surface nowhere until it composed the reminder's `relationshipSeg`.
    macro: () => [{ key: "rpgSceneState", text: "vassal (sworn to serve but resentful)" }],
  },
  // ── the AMBIENT plane ────────────────────────────────────────────────────────────────────────────────────
  {
    name: "ambient — location, the free calendar date and the day/time-of-day arms read and diff",
    reminderPaths: ["state.location", "state.calendarDate", "state.clock.day", "state.clock.hour"],
    deltaPaths: ["state.location", "state.calendarDate", "state.clock.day", "state.clock.hour"],
    macroPaths: ["state.location", "state.calendarDate", "state.clock.day", "state.clock.hour"],
    drive: async (f) => {
      await f.beat({ scene: { location: "The Bone Road", calendarDate: "3rd of Frostmoon", day: 1, timeOfDay: "morning" } });
      await f.beat({ scene: { location: "The Rusty Anchor", calendarDate: "4th of Frostmoon", day: 2, timeOfDay: "night" } });
    },
    // `dateMode` is BORN `narrated`, which drops the day counter from the ABSOLUTE line (#9) — the day arm
    // still diffs (the structured-mode absolute is its own matrix case below).
    reminder: () => ["Scene: The Rusty Anchor · 4th of Frostmoon · night"],
    delta: () => ["location → The Rusty Anchor", "date → 4th of Frostmoon", "day 1 → day 2", "time → night"],
    // Byte-identical to the reminder's line: the feed's own ambient builder printed `day N` unconditionally
    // (ignoring the host's `dateMode`) and carried no time-of-day at all.
    macro: () => [{ key: "rpgSceneState", text: "Scene: The Rusty Anchor · 4th of Frostmoon · night" }],
  },
  {
    name: "weather — the model's own phrasing is the datum, the closed type the fallback",
    reminderPaths: ["state.weather.type", "state.weather.label"],
    deltaPaths: ["state.weather.type", "state.weather.label"],
    macroPaths: ["state.weather.type", "state.weather.label"],
    drive: async (f) => {
      await f.beat({ scene: { weather: { type: "rain" } } });
      await f.beat({ scene: { weather: { type: "snow", label: "torrential sleet" } } });
    },
    reminder: () => ["torrential sleet"],
    absent: () => ["snow"],
    delta: () => ["weather → torrential sleet"],
    macro: () => [{ key: "rpgSceneState", text: "torrential sleet" }],
    macroAbsent: () => [{ key: "rpgSceneState", text: "snow" }],
  },
  {
    name: "weather description — the full-engine gloss the reminder does render (hand-written)",
    reminderPaths: ["state.weather.description"],
    macroPaths: ["state.weather.description"],
    drive: async (f) => {
      await f.beat({ scene: { weather: { type: "fog" } } });
      await f.handEdit({ weather: { type: "fog", label: "", description: "thick enough to hide the far bank" } });
    },
    reminder: () => ["fog (thick enough to hide the far bank)"],
    macro: () => [{ key: "rpgSceneState", text: "fog (thick enough to hide the far bank)" }],
  },
  {
    name: "recent beats — the appended scene log reaches the model",
    reminderPaths: ["state.recentEvents[]"],
    macroPaths: ["state.recentEvents[]"],
    drive: async (f) => {
      await f.beat({ scene: { recentEvent: "The door slammed shut." } });
    },
    reminder: () => ["Recent beats:", "- The door slammed shut."],
    macro: () => [{ key: "rpgSceneState", text: "Recent beats:\n- The door slammed shut." }],
  },
  // ── the QUEST plane ──────────────────────────────────────────────────────────────────────────────────────
  {
    name: "quests — name, status, description and OPEN objectives read; progress diffs",
    reminderPaths: [
      "state.quests[].name",
      "state.quests[].status",
      "state.quests[].description",
      "state.quests[].objectives[].text",
      "state.quests[].objectives[].completed",
    ],
    deltaPaths: ["state.quests[].name", "state.quests[].status", "state.quests[].objectives[].completed"],
    macroPaths: [
      "state.quests[].name",
      "state.quests[].status",
      "state.quests[].description",
      "state.quests[].objectives[].text",
      "state.quests[].objectives[].completed",
    ],
    drive: async (f) => {
      await f.beat({
        quests: [
          { name: "Find the ledger", action: "create", description: "the harbourmaster's second book", objectives: ["search the office", "bribe the clerk"] },
        ],
      });
      await f.beat({ quests: [{ name: "Find the ledger", action: "update", completeObjectives: ["bribe the clerk"] }] });
    },
    reminder: () => ["- Find the ledger [active] — the harbourmaster's second book", "○ search the office"],
    // A COMPLETED objective is rendered as ABSENCE — the open list is the steering datum.
    absent: () => ["○ bribe the clerk"],
    delta: () => ["Find the ledger: 0/2 → 1/2"],
    // `{{rpgQuests}}`'s own builder printed the bare NAME — the status and the host's description died there.
    macro: () => [
      { key: "rpgQuests", text: "- Find the ledger [active] — the harbourmaster's second book" },
      { key: "rpgQuests", text: "○ search the office" },
    ],
    macroAbsent: () => [{ key: "rpgQuests", text: "○ bribe the clerk" }],
  },
  {
    name: "quest status — a completed quest leaves the active block and diffs its flip",
    reminderPaths: ["state.quests[].status"],
    deltaPaths: ["state.quests[].status"],
    macroPaths: ["state.quests[].status"],
    drive: async (f) => {
      await f.beat({ quests: [{ name: "Find the ledger", action: "create" }] });
      await f.beat({ quests: [{ name: "Find the ledger", action: "complete" }] });
    },
    reminder: () => [],
    absent: () => ["Find the ledger ["],
    delta: () => ['quest "Find the ledger" completed'],
    // The whole macro goes EMPTY (a per-plane fragment with no active quest stages nothing at all).
    macroAbsent: () => [{ key: "rpgQuests", text: "Find the ledger" }],
  },
  // ── the PLOT plane ───────────────────────────────────────────────────────────────────────────────────────
  {
    name: "plot — the story title, the act cursor and the act's own title/summary read; an advance diffs",
    reminderPaths: ["state.plot.act", "state.plot.title", "state.plot.acts[].title", "state.plot.acts[].summary"],
    deltaPaths: ["state.plot.act", "state.plot.title", "state.plot.acts[].title"],
    macroPaths: ["state.plot.act", "state.plot.title", "state.plot.acts[].title", "state.plot.acts[].summary"],
    drive: async (f) => {
      await f.beat({ scene: { plot: { act: 1, title: "The Bone Key", actTitle: "Arrival" } } });
      await f.beat({ scene: { plot: { act: 2, actTitle: "Descent", actSummary: "Down the stair." } } });
    },
    reminder: () => ["Story: The Bone Key — act 2/2: Descent — Down the stair."],
    delta: () => ['act 1 "Arrival" → act 2 "Descent"'],
    macro: () => [{ key: "rpgSceneState", text: "Story: The Bone Key — act 2/2: Descent — Down the stair." }],
  },
  // ── the GAME-subject tracker plane ───────────────────────────────────────────────────────────────────────
  {
    name: "game tracker — the game-wide reading reads under its own block and diffs unprefixed",
    reminderPaths: ["state.trackerValues.*.value", "state.trackerValues.*.items[]"],
    deltaPaths: ["state.trackerValues.*.value", "state.trackerValues.*.items[]"],
    macroPaths: ["state.trackerValues.*.value", "state.trackerValues.*.items[]"],
    trackers: [ALARM, rpgTrackerDefSchema.parse({ key: "rumours", label: "Rumours", shape: "list", write: "set", subject: "game" })],
    drive: async (f) => {
      await f.beat({
        trackers: [
          { key: "alarm", value: 1 },
          { key: "rumours", items: ["a body in the weir"] },
        ],
      });
      await f.beat({
        trackers: [
          { key: "alarm", delta: 2 },
          { key: "rumours", items: ["a body in the weir", "the ferryman lies"] },
        ],
      });
    },
    reminder: () => ["Game trackers:", "- Alarm 3/5", "- Rumours: a body in the weir, the ferryman lies"],
    delta: () => ["Alarm 1→3 (+2) — how close the watch is", "Rumours: a body in the weir → a body in the weir, the ferryman lies"],
    // A game-subject reading belongs to NO actor, so it fell through the feed's party/npc split entirely —
    // `{{rpgSceneState}}` now carries the block (the scene's own state, not anybody's sheet).
    macro: () => [{ key: "rpgSceneState", text: "Game trackers:\n- Alarm 3/5\n- Rumours: a body in the weir, the ferryman lies" }],
  },
  {
    name: "game tracker max override — the game-wide ceiling reads from the value's own override",
    reminderPaths: ["state.trackerValues.*.max"],
    macroPaths: ["state.trackerValues.*.max"],
    trackers: [ALARM],
    drive: async (f) => {
      await f.beat({ trackers: [{ key: "alarm", value: 2 }] });
      await f.handEdit({ trackerValues: { alarm: { value: 2, items: null, max: 3 } } });
    },
    reminder: () => ["- Alarm 2/3"],
    absent: () => ["Alarm 2/5"],
    macro: () => [{ key: "rpgSceneState", text: "- Alarm 2/3" }],
    macroAbsent: () => [{ key: "rpgSceneState", text: "Alarm 2/5" }],
  },
  // ── the SHEET (identity) plane ───────────────────────────────────────────────────────────────────────────
  {
    name: "sheet — class, level, attribute readings and the host's flavor prose reach the model",
    reminderPaths: ["sheet.className", "sheet.level", "sheet.attributes.*", "sheet.flavor"],
    macroPaths: ["sheet.className", "sheet.level", "sheet.attributes.*", "sheet.flavor"],
    carriers: ["user", "character"],
    d20: true,
    drive: async (f) => {
      await f.beat(stageCast(f.carrier));
      await f.h.service.patchSheet({
        principal: HOST,
        chatId: f.chatId,
        actorRef: f.carrier.actorRef,
        patch: { className: "Warden", level: 3, attributes: { str: 14, wis: 9 }, flavor: "Sworn to a house that no longer exists." },
      });
    },
    reminder: (f) => [
      "Attributes: Strength (raw physical power — lifting, melee force)",
      `- ${f.carrier.label} — (Warden) — Lv 3 — Strength 14, Wisdom 9`,
      "flavor: Sworn to a house that no longer exists.",
    ],
    absent: () => ["str 14"],
    // The feed's own actor builder carried name/class/level/HP only — the attribute readings AND the host's
    // flavor prose (the RV-11 dead-write class) reached it nowhere. By LABEL here too (never raw `str 14`).
    macro: (f) => [
      { key: "rpgCast", text: `- ${f.carrier.label} — (Warden) — Lv 3 — Strength 14, Wisdom 9` },
      { key: "rpgCast", text: "flavor: Sworn to a house that no longer exists." },
    ],
    macroAbsent: () => [{ key: "rpgCast", text: "str 14" }],
  },
  {
    name: "sheet carriage — a GRANT reaches a tracker the class missed; a REVOKE takes one away",
    reminderPaths: ["sheet.trackerGrants[]", "sheet.trackerRevokes[]"],
    macroPaths: ["sheet.trackerGrants[]", "sheet.trackerRevokes[]"],
    carriers: ["user", "character"],
    trackers: [MANA, TRUST],
    drive: async (f) => {
      await f.beat(stageCast(f.carrier));
      // `Mana` is party-wide, `Trust` is npc-only: this actor REVOKES the one it would carry and is GRANTED
      // the one its class misses — the carriage exception the reminder must read off the carrier set.
      await f.h.service.updateConfig({
        principal: HOST,
        chatId: f.chatId,
        patch: { trackers: [MANA, { ...TRUST, appliesTo: "npcs" }] },
      });
      await f.h.service.patchSheet({
        principal: HOST,
        chatId: f.chatId,
        actorRef: f.carrier.actorRef,
        patch: { trackerGrants: ["trust"], trackerRevokes: ["mana"] },
      });
    },
    reminder: (f) => [`- ${f.carrier.label} — Trust`],
    absent: (f) => [`- ${f.carrier.label} — Mana`, `- ${f.carrier.label} — Trust — Mana`],
    macro: (f) => [{ key: "rpgCast", text: `- ${f.carrier.label} — Trust` }],
    macroAbsent: (f) => [{ key: "rpgCast", text: `- ${f.carrier.label} — Mana` }],
  },
  // ── tracker-def read axes that are not a value ───────────────────────────────────────────────────────────
  {
    name: "tracker sort — the vocabulary and the readings render in the host's order",
    reminderPaths: ["tracker.sort"],
    macroPaths: ["tracker.sort"],
    trackers: [
      rpgTrackerDefSchema.parse({ key: "zeal", label: "Zeal", shape: "meter", write: "set", subject: "game", sort: 2 }),
      rpgTrackerDefSchema.parse({ key: "alarm", label: "Alarm", shape: "meter", write: "set", subject: "game", sort: 1 }),
    ],
    drive: async (f) => {
      await f.beat({
        trackers: [
          { key: "zeal", value: 1 },
          { key: "alarm", value: 2 },
        ],
      });
    },
    reminder: () => ["Trackers: Alarm · Zeal"],
    // No vocabulary line on this surface — the host's order shows in the READINGS block instead.
    macro: () => [{ key: "rpgSceneState", text: "Game trackers:\n- Alarm 2\n- Zeal 1" }],
  },
];

for (const probe of PROBES) {
  for (const carrierKind of probe.carriers ?? ["character"]) {
    test(`reachability — ${probe.name} [${carrierKind}]`, async () => {
      const f = await openGame({
        carrier: CARRIERS[carrierKind],
        ...(probe.trackers !== undefined ? { trackers: probe.trackers } : {}),
        ...(probe.d20 === true ? { d20: true } : {}),
      });
      await probe.drive(f);
      const reminder = await f.reminder();
      for (const needle of probe.reminder(f)) {
        expect(reminder, `reminder must carry ${needle}`).toContain(needle);
      }
      for (const needle of probe.reminderAbsent?.(f) ?? []) {
        expect(reminder, `the reminder must NOT carry ${needle} ANYWHERE`).not.toContain(needle);
      }
      // Absence is asserted against the ABSOLUTE block: an emptied/filtered field must leave no dangling label
      // there, while the delta may still legitimately narrate the transition that emptied it.
      const state = await f.stateBlock();
      for (const needle of probe.absent?.(f) ?? []) {
        expect(state, `the state block must NOT carry ${needle}`).not.toContain(needle);
      }
      const delta = await f.delta();
      for (const needle of probe.delta?.(f) ?? []) {
        expect(delta, `the delta block must carry ${needle}`).toContain(needle);
      }
      // The THIRD surface — asserted per macro KEY, so a datum staged only in the `{{rpgDelta}}` re-export can
      // never satisfy a claim about `{{rpgCast}}`/`{{rpgSceneState}}`/`{{rpgQuests}}`.
      const macros = await f.macros();
      for (const needle of probe.macro?.(f) ?? []) {
        expect(macros[needle.key], `{{${needle.key}}} must carry ${needle.text}`).toContain(needle.text);
      }
      for (const needle of probe.macroAbsent?.(f) ?? []) {
        expect(macros[needle.key], `{{${needle.key}}} must NOT carry ${needle.text}`).not.toContain(needle.text);
      }
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE PARITY GATE — every contract leaf is PROVEN reachable or CITED. Both directions.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════

const REMINDER_COVERED = new Set(PROBES.flatMap((p) => p.reminderPaths));
const DELTA_COVERED = new Set(PROBES.flatMap((p) => p.deltaPaths ?? []));
const MACRO_COVERED = new Set(PROBES.flatMap((p) => p.macroPaths ?? []));

test("INVENTORY: every snapshot/sheet/tracker leaf is either PROVEN to reach the reminder or CITED as unrendered", () => {
  const unaccounted = INVENTORY.filter((path) => !REMINDER_COVERED.has(path) && REMINDER_UNRENDERED[path] === undefined);
  // A writable field reaching NO model-facing read surface is the bug class this suite exists to kill: add a
  // probe (render it) or a cited UNRENDERED entry.
  expect(unaccounted, "unrendered AND uncited — render it or cite it").toEqual([]);
});

test("INVENTORY: every leaf is either PROVEN to reach the delta or CITED as undiffed", () => {
  const unaccounted = INVENTORY.filter((path) => !DELTA_COVERED.has(path) && DELTA_UNRENDERED[path] === undefined);
  expect(unaccounted, "a field that can change with no diff line naming it — render it in the delta or cite why the absolute is enough").toEqual([]);
});

test("INVENTORY: every leaf is either PROVEN to reach the MACRO feed or CITED as unstaged", () => {
  const unaccounted = INVENTORY.filter((path) => !MACRO_COVERED.has(path) && MACRO_UNRENDERED[path] === undefined);
  expect(unaccounted, "the preset-facing feed drifted from the reminder again — compose the line builder or cite the posture").toEqual([]);
});

test("the exemption registries are SELF-CLEANING: no stale path, no double-claim", () => {
  const inventory = new Set(INVENTORY);
  // The three columns run the SAME two-direction check: a cite for a field the contracts dropped, and a field
  // claimed both ways. Derived from one tuple so a fourth read surface joins by being listed.
  const columns = [
    { name: "reminder", cites: REMINDER_UNRENDERED, covered: REMINDER_COVERED },
    { name: "delta", cites: DELTA_UNRENDERED, covered: DELTA_COVERED },
    { name: "macro", cites: MACRO_UNRENDERED, covered: MACRO_COVERED },
  ] as const;
  for (const column of columns) {
    expect(
      Object.keys(column.cites).filter((p) => !inventory.has(p)),
      `${column.name}: a cite for a field the contracts no longer declare`,
    ).toEqual([]);
    expect(
      Object.keys(column.cites).filter((p) => column.covered.has(p)),
      `${column.name}: a field claimed unrendered AND proven rendered`,
    ).toEqual([]);
    expect(
      [...column.covered].filter((p) => !inventory.has(p)),
      `${column.name}: a probe claiming a path the contracts do not declare`,
    ).toEqual([]);
  }
});

test("every cite carries a REASON (a bare exemption is a hiding place)", () => {
  for (const [path, reason] of [...Object.entries(REMINDER_UNRENDERED), ...Object.entries(DELTA_UNRENDERED), ...Object.entries(MACRO_UNRENDERED)]) {
    expect(reason.length, `${path} must cite WHY`).toBeGreaterThan(40);
  }
});
