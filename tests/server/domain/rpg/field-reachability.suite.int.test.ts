// tests/server/domain/rpg/field-reachability — THE READ-SURFACE REACHABILITY SUITE (owner-ordered 2026-08-01).
//
// WHY IT EXISTS: four separate live bugs in one night were all the same class — a field the host or the model
// could WRITE that reached the model NOWHERE (the cast guides, the sheet flavor, the tracker hint/emoji, a cast
// NPC's conditions). Each was found by accident. This suite makes that class fail BY CONSTRUCTION: the field
// INVENTORY is derived mechanically from the CONTRACTS (`zodLeafPaths` over the snapshot + sheet + tracker-def
// schemas), and every leaf must either be PROVEN to reach a model-facing read surface by a probe below, or carry
// a CITED exemption. Add a column to any of those schemas and this suite reds until someone renders it or cites
// it; delete a field and the stale cite reds too (self-cleaning both ways — the D50/UNCLAIMED_SETTINGS_KEYS
// discipline).
//
// THE THREE SURFACES (the only things the model actually reads about game state):
//   • the REMINDER (`substrate/reminder.ts`) — the absolute state block injected every turn;
//   • the DELTA (`substrate/delta.ts`) — the prev→current diff rendered inside it;
//   • the MACRO/CEL FEED (`chat-ops/macro-view.ts`) — `{{rpgSceneState}}`/`{{rpgCast}}`/`{{rpgQuests}}`/
//     `{{rpgDelta}}`, the per-plane fragments a PRESET author places in their own prompt shape.
//
// The macro column was added because the feed was the SAME drift class one surface over: it carried its own
// cast/actor/ambient/quest builders, and they had decayed into a strict subset of the reminder's (no volatile
// plane on any carrier, no guides, no attribute readings, no sheet flavor, no game-subject readings, no quest
// status/description, no time-of-day, no weather description). The fix was ONE-BUILDER, not a second set of
// assertions: `macro-view.ts` now COMPOSES the reminder's exported line builders, so these probes prove the
// composition is wired on every plane and a re-grown third builder reds here. A macro needle names WHICH macro
// key carries the datum (`{ key, text }`) — "somewhere in the feed" would be exactly the hiding place this
// suite exists to close.
//
// HOW THE STATE IS BUILT: through the REAL path, never a hand-shaped view literal (hand literals are exactly
// how these gaps hid — a test that builds the view by hand asserts the renderer, not the pipeline). Every probe
// drives an `RpgExtraction` (the model's own output shape) through the production applier + accumulator merge +
// write boundary (`fakes.extractions`, `_support.ts`), a host verb (`patchSheet`/`editSnapshot`/`updateConfig`),
// and then READS the reminder off the real `gatherTurnContext`. Int-tier because the projection that produced
// three of the four bugs (`buildTrackerView`) is a db read.
//
// THE MATRIX: carrier kind (roster user · roster character · scene-cast NPC) × field state (set/empty) × lock
// state (a `locked` def and a `fieldLocks` pin must still RENDER — D113 #4: the reminder is the model's
// KNOWLEDGE, the tools are its permissions) × pin state (the band is a panel concern; the reminder is
// pin-blind) × the config arms that gate rendering (`engaged`, `dateMode`, `recentBeatsKeepLast`,
// `trackersReadOnly`, per-carrier `max` overrides, carriage via grants/revokes).

import type { RpgActorRef, RpgDateMode, RpgExtraction, RpgTrackerDef } from "@orb/contracts/rpg";
import { actorRefKey, actorTrackerWriteKeys, RPG_PROFILE_D20, rpgSheetSchema, rpgSnapshotStateSchema, rpgTrackerDefSchema } from "@orb/contracts/rpg";
import type { CharacterId, ChatId, ChatTurnId, RpgGameId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { RpgGatherResult } from "../../../../packages/server/src/domain/rpg/contract/params";
import type { RpgRosterActor } from "../../../../packages/server/src/domain/rpg/index";
import { RPG_DELTA_HEADING } from "../../../../packages/server/src/domain/rpg/substrate/delta";
import { freshDb } from "../../../support/db";
import { zodLeafPaths } from "../../../support/zod-leaf-paths";
import type { RpgHarness } from "./_support";
import { expect, principal, rosterUser, seedCharacter, seedLiteGame, seedMessage, seedUser, test, turnConnection } from "./_support";

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
  "state.presentCharacters[].key": "the ADDRESSING key (the normalized name the cast/tracker/lock grammar joins on); `name` is the datum the line prints.",
  "state.presentCharacters[].characterId":
    "an optional linkage id to a roster character row — an id is never model-facing (projection-clean law, contracts/rpg/tools header).",
  "state.actorState[].actorRef.kind": "the actor-ref plane is ADDRESSING: the reminder prints the actor's NAME (roster projection / cast key), never its ref.",
  "state.actorState[].actorRef.characterId": "addressing (see actorRef.kind) — and an id is never model-facing.",
  "state.actorState[].actorRef.userId": "addressing (see actorRef.kind) — and an id is never model-facing.",
  "state.actorState[].actorRef.castKey": "addressing (see actorRef.kind); the cast row's `name` is what the Present line prints.",
  "state.actorState[].conditions[].stat":
    "a full-ENGINE condition slot born whole (contracts/rpg/actor header) — lite writes only `name` (`update_party.addCondition`), so the modifier triple has no lite value to state.",
  "state.actorState[].conditions[].modifier": "full-engine slot, unwritable in lite (see conditions[].stat).",
  "state.actorState[].conditions[].turnsLeft": "full-engine slot, unwritable in lite (see conditions[].stat).",
  "state.actorState[].inventory[].id": "the minted addressing id (the `inventory.<id>` lock path) — never model-facing.",
  "state.actorState[].inventory[].type":
    "the full-engine equip/filter taxonomy; the lite applier writes the EMPTY STRING unconditionally (`applyUpdateInventory`), so there is no value to render.",
  "state.actorState[].inventory[].icon":
    "a HOST display pick from the `@orb/ui/icons` seal (#37) — panel decoration, absent from every model write surface by design.",
  "state.quests[].id": "the minted quest id (the `quests.<id>` lock path + the hand-edit address) — never model-facing (the model addresses a quest by NAME).",
  "state.quests[].objectives[].id": "the per-objective addressing id; the model completes objectives BY TEXT (`completeObjectives`).",
  "state.fieldLocks.*":
    "manual-edit-wins BOOKKEEPING, deliberately invisible to the model: D113 #4 — the reminder is the model's KNOWLEDGE and the tools are its permissions, so a locked field renders in full and the lock bites only at the write schema (proven by the lock matrix below).",
  "sheet.maxHp":
    "the FULL-mode hp dial: in lite health is a TRACKER (D86 — `rpg-actor-trackers.tsx` carries no HP arm), and what the reminder renders is the VOLATILE plane's `hp.max`. Nothing in lite writes this field.",
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
  "state.presentCharacters[].key": "the CORRELATION key of the presentCast + relationship renderers — load-bearing, printed nowhere (the `name` is the datum).",
  "state.presentCharacters[].characterId": "an addressing linkage id to a roster character row — an id is never model-facing (projection-clean law).",
  "state.presentCharacters[].emoji":
    "cast DECORATION re-authored by the extraction every beat; a diff of it would fire constantly and say nothing the absolute line doesn't.",
  "state.presentCharacters[].mood":
    "re-observed every beat by the extraction round (the model just wrote it) — the absolute cast line carries it; diffing it is noise, not a beat.",
  "state.presentCharacters[].appearance":
    "a STANDING guide the extraction re-authors every beat (RV-11); the reminder's continuation line carries it absolutely.",
  "state.presentCharacters[].outfit": "a standing guide the extraction re-authors every beat; absolute-only (see presentCharacters[].appearance).",
  "state.presentCharacters[].thoughts": "a standing guide the extraction re-authors every beat; absolute-only (see presentCharacters[].appearance).",
  "state.recentEvents[]":
    "EXCLUDED BY CONSTRUCTION (`PLANE_DIFF_RENDERERS` header): a beat is an APPEND, not a mutation — the reminder's Recent-beats block is the whole record.",
  "state.actorState[].actorRef.kind":
    "addressing — the per-actor renderers LABEL a line through `rosterNames`/the cast key (`actorLabel`), never by printing the ref.",
  "state.actorState[].actorRef.characterId": "addressing, and an id is never model-facing (see state.actorState[].actorRef.kind).",
  "state.actorState[].actorRef.userId": "addressing, and an id is never model-facing (see state.actorState[].actorRef.kind).",
  "state.actorState[].actorRef.castKey": "addressing (see actorRef.kind) — it IS the cast line's label, which the reminder probe covers.",
  "state.actorState[].conditions[].stat": "full-engine slot, unwritable in lite (reminder cite); the conditions diff matches by NAME.",
  "state.actorState[].conditions[].modifier": "a full-engine condition slot lite never writes (see state.actorState[].conditions[].stat).",
  "state.actorState[].conditions[].turnsLeft": "a full-engine condition slot lite never writes (see state.actorState[].conditions[].stat).",
  "state.actorState[].inventory[].id": "the inventory diff matches by NAME (a re-added item mints a new id — an id diff would report a phantom swap).",
  "state.actorState[].inventory[].description":
    "WRITE-ONCE AT ADD: `applyUpdateInventory` only pushes and removes — there is no edit arm, so an item's annotation never TRANSITIONS. The `+rope` line is the beat; the absolute carrying line (which now renders the capped note, owner ruling 2026-08-01) carries the prose.",
  "state.actorState[].inventory[].location":
    "write-once at add, exactly like inventory[].description — no edit door exists, so a location change is not a transition the diff could name. A re-add is a NEW row the add/remove lines already report.",
  "state.actorState[].inventory[].type": "always the empty string in lite (the applier writes no taxonomy), so there is nothing to diff.",
  "state.actorState[].inventory[].icon": "a HOST display pick from the icon seal — unwritable by play, so no beat can ever move it.",
  "state.actorState[].status":
    "a free-prose state the beat OVERWRITES (`update_party.status`), re-authored whenever it moves — same class as cast `mood`: the reminder's absolute line is the honest home, and a transition line would fire on every re-phrasing.",
  "state.actorState[].trackerValues.*.max":
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
  "sheet.maxHp": "identity plane, and a full-mode dial besides (reminder cite).",
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
  "state.presentCharacters[].key":
    "the ADDRESSING key — and load-bearing HERE specifically: the feed joins `castTrackers`/`castVolatile` on it to build a member's line. Printed nowhere; `name` is the datum.",
  "state.presentCharacters[].characterId": "an optional linkage id to a roster character row — an id is never model-facing (projection-clean law).",
  "state.actorState[].actorRef.kind": "addressing — a line is LABELLED by the roster projection / cast key, never by printing the ref (see the reminder cite).",
  "state.actorState[].actorRef.characterId": "addressing, and an id is never model-facing (see state.actorState[].actorRef.kind).",
  "state.actorState[].actorRef.userId": "addressing, and an id is never model-facing (see state.actorState[].actorRef.kind).",
  "state.actorState[].actorRef.castKey": "addressing — it joins the volatile row to its cast member; the member's `name` is what the line prints.",
  "state.actorState[].conditions[].stat":
    "a full-ENGINE condition slot lite never writes (`update_party.addCondition` carries `name` only — the reminder cite).",
  "state.actorState[].conditions[].modifier": "full-engine slot, unwritable in lite (see state.actorState[].conditions[].stat).",
  "state.actorState[].conditions[].turnsLeft": "full-engine slot, unwritable in lite (see state.actorState[].conditions[].stat).",
  "state.actorState[].inventory[].id": "the minted addressing id (the `inventory.<id>` lock path) — never model-facing.",
  "state.actorState[].inventory[].type":
    "the lite applier writes the EMPTY STRING unconditionally, so there is no taxonomy value to stage (the reminder cite).",
  "state.actorState[].inventory[].icon":
    "a HOST display pick from the `@orb/ui/icons` seal — panel decoration, absent from every model write surface by design.",
  "state.quests[].id": "the minted quest id (the lock path + the hand-edit address) — the model addresses a quest by NAME.",
  "state.quests[].objectives[].id": "the per-objective addressing id; the model completes objectives BY TEXT.",
  "state.fieldLocks.*": "manual-edit-wins BOOKKEEPING, deliberately invisible to the model on every read surface (D113 #4 — see the reminder cite).",
  "sheet.maxHp":
    "the FULL-mode hp dial — in lite health is a TRACKER (D86) and the volatile plane's `hp.max` is what the composed line renders. Nothing in lite writes it.",
  "tracker.key": "the ADDRESSING key every stored value/lock/write-arm joins on; `label` is the model-facing name.",
  "tracker.write":
    "the WRITE axis — it picks the tool arm the model is handed, never a read datum (proven live by `actorTrackerWriteKeys` in the lock matrix).",
  "tracker.color": "band/bar decoration (aria-hidden geometry) — a panel concern with nothing to say to a narrator.",
  "tracker.icon": "panel decoration — a curated `@orb/ui/icons` seal name the tracker rows/orbs draw.",
  "tracker.pinned":
    "the BAND selection — a panel decision; every read surface renders whatever the host pinned, identically (proven byte-identical across pin state below).",
  "tracker.locked": "R6 prevent-at-schema — a locked tracker is ABSENT from the write schema and stages IDENTICALLY here (D113 #4).",
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE HARNESS — one game, real verbs, real turns, the real gather.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════

const HOST = principal("host");

/** The absolute state block's heading (`buildLiteReminder`) — the block boundary the probes read against. */
const STATE_HEADING = "# Game state";

/** The CARRIER axis — the three kinds of actor the per-actor planes can hang on. Declared ONCE as a tuple and
 *  derived (the string-union dispatch discipline): the `CARRIERS` record below is mapped over it, so a fourth
 *  kind (full's `npc` ref arm) fails `tsc` here until the matrix runs it too. */
const CARRIER_KINDS = ["user", "character", "cast"] as const;
type CarrierKind = (typeof CARRIER_KINDS)[number];

/** One CARRIER of the per-actor planes: a roster human (`user`), a roster character, or a scene-cast NPC.
 *  `targetRef` is what the model writes; `label` is what BOTH read surfaces must name the carrier. */
interface Carrier {
  readonly kind: CarrierKind;
  readonly label: string;
  readonly targetRef: string;
  readonly roster: readonly RpgRosterActor[];
  readonly actorRef: RpgActorRef;
  /** A cast NPC must be ON STAGE before a party/inventory write may name it (the R5 ghost guard). */
  readonly onStage: boolean;
}

/** A REAL minted character TypeID: the roster's readable `character_<key>` form is fabricated, and an
 *  `actorRef.characterId` is re-validated at the snapshot WRITE boundary — a fabricated id makes every
 *  character-carrier write silently drop (`onFlushDropped`), which would hide exactly what this suite hunts. */
const CHARACTER_ID: CharacterId = castId<CharacterId>(mintTypeId(ID_PREFIX.character));

const CARRIERS: Readonly<Record<CarrierKind, Carrier>> = {
  user: {
    kind: "user",
    label: "You",
    targetRef: "You",
    roster: [rosterUser("host", "You")],
    actorRef: { kind: "user", userId: castId<UserId>("user_host") },
    onStage: false,
  },
  character: {
    kind: "character",
    label: "Kael",
    targetRef: "Kael",
    roster: [{ actorRef: { kind: "character", characterId: CHARACTER_ID }, name: "Kael" }],
    actorRef: { kind: "character", characterId: CHARACTER_ID },
    onStage: false,
  },
  cast: {
    kind: "cast",
    label: "Mari",
    targetRef: "Mari",
    roster: [],
    actorRef: { kind: "cast", castKey: "Mari" },
    onStage: true,
  },
};

interface Fixture {
  readonly chatId: ChatId;
  readonly gameId: RpgGameId;
  readonly h: RpgHarness;
  readonly carrier: Carrier;
  /** Drive ONE beat: the model's extraction folded through the real applier onto a fresh assistant slot. */
  readonly beat: (extraction: Partial<RpgExtraction>) => Promise<void>;
  /** A HOST hand edit that stamps NO lock (`lockPaths: []`) — the seed door for fields no tool can write. */
  readonly handEdit: (patch: Record<string, unknown>) => Promise<void>;
  /** The reminder the gather would inject on the next turn (the model-facing text, verbatim). */
  readonly reminder: () => Promise<string>;
  /** The ABSOLUTE state block alone (`# Game state` … the next blank line) — what the model is told the world
   *  IS right now, with the delta's transition lines excluded (a field can be absent from the absolutes and
   *  still legitimately appear in a `-Bran leaves` line). */
  readonly stateBlock: () => Promise<string>;
  /** The delta block's line text (everything after the heading), or "" when the block was omitted. */
  readonly delta: () => Promise<string>;
  /** The preset-facing MACRO map the same gather stages (`rpgSceneState`/`rpgCast`/`rpgQuests`/`rpgDelta`). */
  readonly macros: () => Promise<Readonly<Record<string, string>>>;
}

/** One macro assertion — WHICH macro key must carry the text. Naming the key is the discipline: a needle that
 *  matched "anywhere in the feed" would pass on a datum staged only in the delta re-export. */
interface MacroNeedle {
  readonly key: RpgMacroKey;
  readonly text: string;
}

/** The macro keys the lite feed stages (the full-mode keys are ABSENT by design ⇒ they resolve ""). Declared as
 *  a tuple + derived so a needle can never name a key the feed does not stage. */
const RPG_MACRO_KEYS = ["rpgSceneState", "rpgCast", "rpgQuests", "rpgDelta"] as const;
type RpgMacroKey = (typeof RPG_MACRO_KEYS)[number];

/** An empty extraction — every plane present, so a probe spells only what it writes. */
function extraction(over: Partial<RpgExtraction>): RpgExtraction {
  return { party: [], inventory: [], trackers: [], quests: [], journal: [], ...over };
}

/** Open a real lite game in `cheap` delivery (the post-commit round vehicle the harness folds extractions
 *  through), with the carrier's roster and the probe's tracker defs configured through the real verbs. */
async function openGame(opts: { carrier: Carrier; trackers?: readonly RpgTrackerDef[]; d20?: boolean }): Promise<Fixture> {
  const db = await freshDb();
  // `rpg_sheets` FKs both actor identities, so a `patchSheet` on either roster carrier needs the real row.
  const ownerId = await seedUser(db, "host");
  await seedCharacter(db, ownerId, "kael", { id: CHARACTER_ID });
  const { chatId, gameId, h } = await seedLiteGame(db, { roster: [...opts.carrier.roster] });
  await h.service.updateConfig({
    principal: HOST,
    chatId,
    extractionMode: "cheap",
    patch: {
      ...(opts.trackers !== undefined ? { trackers: [...opts.trackers] } : {}),
      ...(opts.d20 === true ? { statProfile: RPG_PROFILE_D20 } : {}),
    },
  });
  let seq = 0;
  const gather = async (): Promise<RpgGatherResult | null> =>
    h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false });
  const reminder = async (): Promise<string> => (await gather())?.injections[0]?.content ?? "";
  return {
    chatId,
    gameId,
    h,
    carrier: opts.carrier,
    beat: async (over: Partial<RpgExtraction>): Promise<void> => {
      seq += 1;
      h.fakes.extractions.push(extraction(over));
      const { messageId, variantId } = await seedMessage(db, chatId, seq, { role: "assistant" });
      await h.chatOps.onTurnCompleted(chatId, messageId, variantId, castId<ChatTurnId>(`chat_turn_${seq}`), turnConnection());
    },
    handEdit: async (patch: Record<string, unknown>): Promise<void> => {
      await h.service.editSnapshot({ principal: HOST, chatId, patch, lockPaths: [] });
    },
    reminder,
    stateBlock: async (): Promise<string> => {
      const content = await reminder();
      return content.startsWith(STATE_HEADING) ? (content.split("\n\n")[0] ?? "") : "";
    },
    delta: async (): Promise<string> => {
      const content = await reminder();
      const at = content.indexOf(`${RPG_DELTA_HEADING}: `);
      return at === -1 ? "" : (content.slice(at + RPG_DELTA_HEADING.length + 2).split("\n\n")[0] ?? "");
    },
    macros: async (): Promise<Readonly<Record<string, string>>> => (await gather())?.macros ?? {},
  };
}

/** The per-actor volatile row a hand edit seeds (total by construction — the write boundary parses it). */
function volatileRow(carrier: Carrier, over: Record<string, unknown>): Record<string, unknown> {
  return { actorRef: carrier.actorRef, hp: null, trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "", ...over };
}

/** Put a cast carrier on stage (the ghost guard) — a no-op for a roster carrier. */
function stageCast(carrier: Carrier): Partial<RpgExtraction> {
  return carrier.onStage ? { scene: { presentUpsert: [{ name: carrier.targetRef }] } } : {};
}

/** The OPENING beat a hand-edit probe needs: it puts the carrier on stage AND writes one real plane, so the
 *  flush actually persists a snapshot. A hand edit on a TURNLESS game clones forward onto a fresh narrator
 *  slot instead (a state anchor at a LATER seq than the test's own beats), which would silently invert the
 *  lineage the delta reads — the edit must land IN PLACE on the live uncommitted head. */
function openingBeat(carrier: Carrier): Partial<RpgExtraction> {
  return { scene: withStage(carrier, { location: "The Ford" }) };
}

/** Merge a cast carrier's on-stage upsert into a scene patch (both arms ride ONE `scene` object). */
function withStage(carrier: Carrier, scene: NonNullable<RpgExtraction["scene"]>): NonNullable<RpgExtraction["scene"]> {
  return carrier.onStage ? { ...scene, presentUpsert: [{ name: carrier.targetRef }, ...(scene.presentUpsert ?? [])] } : scene;
}

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
   *  no dangling label, no phantom row). */
  readonly absent?: (f: Fixture) => readonly string[];
  readonly delta?: (f: Fixture) => readonly string[];
  /** What the named macro keys must carry (the third surface's positive half). */
  readonly macro?: (f: Fixture) => readonly MacroNeedle[];
  /** What the named macro keys must NOT carry — the filtered/emptied half (a completed objective, a completed
   *  quest): the feed is per-plane, so an absence there is its own claim. */
  readonly macroAbsent?: (f: Fixture) => readonly MacroNeedle[];
}

/** Every carrier kind — the per-actor probes run the WHOLE axis (the roster/cast split is exactly where the
 *  read surfaces drifted), derived from the one tuple so a new kind joins the matrix automatically. */
const ACTOR_CARRIERS: readonly CarrierKind[] = CARRIER_KINDS;

const MANA: RpgTrackerDef = rpgTrackerDefSchema.parse({
  key: "mana",
  label: "Mana",
  shape: "meter",
  write: "delta",
  subject: "actor",
  max: 10,
  hint: "fuels spellcasting",
});
const TRUST: RpgTrackerDef = rpgTrackerDefSchema.parse({
  key: "trust",
  label: "Trust",
  shape: "text",
  write: "set",
  subject: "actor",
  hint: "where you stand",
});
const PACK: RpgTrackerDef = rpgTrackerDefSchema.parse({ key: "pack", label: "Pack", shape: "list", write: "set", subject: "actor" });
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
    name: "hp — the volatile health track reads absolutely and diffs signed",
    reminderPaths: ["state.actorState[].hp.value", "state.actorState[].hp.max"],
    deltaPaths: ["state.actorState[].hp.value", "state.actorState[].hp.max"],
    macroPaths: ["state.actorState[].hp.value", "state.actorState[].hp.max"],
    carriers: ACTOR_CARRIERS,
    drive: async (f) => {
      // hp is born null (nullable-honesty) and no tool arm SETS it — the host seeds the track by hand, then
      // the beat moves it (`update_party.hpDelta`, which refuses a null-hp actor).
      await f.beat(openingBeat(f.carrier));
      await f.handEdit({ actorState: [volatileRow(f.carrier, { hp: { value: 12, max: 20 } })] });
      await f.beat({ party: [{ targetRef: f.carrier.targetRef, hpDelta: -4 }] });
    },
    reminder: (f) => [`${f.carrier.label}`, "HP 8/20"],
    delta: (f) => [`${f.carrier.label} HP 12→8 (-4)`],
    // `{{rpgCast}}` stages BOTH carrier blocks (Party + Present), so one needle covers all three carrier kinds.
    macro: () => [{ key: "rpgCast", text: "HP 8/20" }],
  },
  {
    name: "status — the free-prose per-actor state reads absolutely",
    reminderPaths: ["state.actorState[].status"],
    macroPaths: ["state.actorState[].status"],
    carriers: ACTOR_CARRIERS,
    drive: async (f) => {
      await f.beat({ ...stageCast(f.carrier), party: [{ targetRef: f.carrier.targetRef, status: "favouring one leg" }] });
    },
    reminder: () => ["favouring one leg"],
    macro: () => [{ key: "rpgCast", text: "favouring one leg" }],
  },
  {
    name: "conditions — an applied affliction reads on the line and diffs as +/−",
    reminderPaths: ["state.actorState[].conditions[].name"],
    deltaPaths: ["state.actorState[].conditions[].name"],
    macroPaths: ["state.actorState[].conditions[].name"],
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
    name: "inventory — carried items read by name × quantity + their capped annotation, and diff on add/remove/qty",
    reminderPaths: [
      "state.actorState[].inventory[].name",
      "state.actorState[].inventory[].quantity",
      "state.actorState[].inventory[].location",
      "state.actorState[].inventory[].description",
    ],
    deltaPaths: ["state.actorState[].inventory[].name", "state.actorState[].inventory[].quantity"],
    macroPaths: [
      "state.actorState[].inventory[].name",
      "state.actorState[].inventory[].quantity",
      "state.actorState[].inventory[].location",
      "state.actorState[].inventory[].description",
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
            remove: [{ name: "rope", quantity: 1 }],
          },
        ],
      });
    },
    reminder: () => ["carrying: rope (the pack: forty feet of hemp), torch (pitch-soaked rag wound on an ash haft, burns for about an…)"],
    absent: () => ["before it gutters"],
    delta: (f) => [`+torch (${f.carrier.label})`, `${f.carrier.label} rope ×2→×1`],
    macro: () => [
      { key: "rpgCast", text: "carrying: rope (the pack: forty feet of hemp), torch (pitch-soaked rag wound on an ash haft, burns for about an…)" },
    ],
  },
  {
    name: "wallet — a named amount reads on the line and diffs signed",
    reminderPaths: ["state.actorState[].wallet[].name", "state.actorState[].wallet[].amount"],
    deltaPaths: ["state.actorState[].wallet[].name", "state.actorState[].wallet[].amount"],
    macroPaths: ["state.actorState[].wallet[].name", "state.actorState[].wallet[].amount"],
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
      "state.actorState[].trackerValues.*.value",
      "tracker.label",
      "tracker.hint",
      "tracker.max",
      "tracker.shape",
      "tracker.subject",
      "tracker.appliesTo",
    ],
    deltaPaths: ["state.actorState[].trackerValues.*.value", "tracker.label", "tracker.hint", "tracker.max", "tracker.shape", "tracker.subject"],
    macroPaths: [
      "state.actorState[].trackerValues.*.value",
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
    reminderPaths: ["state.actorState[].trackerValues.*.value"],
    deltaPaths: ["state.actorState[].trackerValues.*.value"],
    macroPaths: ["state.actorState[].trackerValues.*.value"],
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
    reminderPaths: ["state.actorState[].trackerValues.*.items[]"],
    deltaPaths: ["state.actorState[].trackerValues.*.items[]"],
    macroPaths: ["state.actorState[].trackerValues.*.items[]"],
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
    reminderPaths: ["state.actorState[].trackerValues.*.max"],
    macroPaths: ["state.actorState[].trackerValues.*.max"],
    carriers: ACTOR_CARRIERS,
    trackers: [MANA],
    drive: async (f) => {
      await f.beat({ ...openingBeat(f.carrier), party: [{ targetRef: f.carrier.targetRef, trackerSets: [{ key: "mana", value: 4 }] }] });
      // The per-carrier ceiling is HOST-authored (no tool arm carries `max`) — the hand door writes it.
      await f.handEdit({ actorState: [volatileRow(f.carrier, { trackerValues: { mana: { value: 4, items: null, max: 6 } } })] });
    },
    reminder: () => ["Mana 4/6"],
    absent: () => ["Mana 4/10"],
    macro: () => [{ key: "rpgCast", text: "Mana 4/6" }],
    macroAbsent: () => [{ key: "rpgCast", text: "Mana 4/10" }],
  },
  // ── the SCENE-CAST identity plane ────────────────────────────────────────────────────────────────────────
  {
    name: "cast identity — name, emoji, mood and the three standing guides reach the model",
    reminderPaths: [
      "state.presentCharacters[].name",
      "state.presentCharacters[].emoji",
      "state.presentCharacters[].mood",
      "state.presentCharacters[].appearance",
      "state.presentCharacters[].outfit",
      "state.presentCharacters[].thoughts",
    ],
    deltaPaths: ["state.presentCharacters[].name"],
    macroPaths: [
      "state.presentCharacters[].name",
      "state.presentCharacters[].emoji",
      "state.presentCharacters[].mood",
      "state.presentCharacters[].appearance",
      "state.presentCharacters[].outfit",
      "state.presentCharacters[].thoughts",
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
    name: "cast exit — a member the scene drops leaves the read surface and diffs",
    reminderPaths: [],
    deltaPaths: ["state.presentCharacters[].name"],
    drive: async (f) => {
      await f.beat({ scene: { presentUpsert: [{ name: "Vesna" }, { name: "Bran" }] } });
      await f.beat({ scene: { presentRemove: ["Bran"] } });
    },
    reminder: () => ["- Vesna"],
    absent: () => ["Bran"],
    delta: () => ["-Bran leaves"],
    macro: () => [{ key: "rpgSceneState", text: "- Vesna" }],
    macroAbsent: () => [{ key: "rpgSceneState", text: "Bran" }],
  },
  {
    name: "relationship — the stance reads glossed by its host hint and diffs as a transition",
    reminderPaths: ["state.presentCharacters[].relationship.kind", "state.presentCharacters[].relationship.label"],
    deltaPaths: ["state.presentCharacters[].relationship.kind", "state.presentCharacters[].relationship.label"],
    macroPaths: ["state.presentCharacters[].relationship.kind", "state.presentCharacters[].relationship.label"],
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
    // A game-subject reading belongs to NO actor, so it fell through the feed's party/cast split entirely —
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

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE STATE / LOCK / PIN / CONFIG MATRIX — the axes that gate whether a field renders at all.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════

test("EMPTY state: a fresh game's read surfaces carry no phantom headers (absence, never a stub row)", async () => {
  const f = await openGame({ carrier: CARRIERS.character, trackers: [MANA] });
  // The feed stages EXACTLY the lite keys — a full-mode macro stays ABSENT so `{{rpgMap}}` resolves "" (the
  // honest empty), and an empty game's per-plane fragments are the empty STRING, never a stub header.
  const macros = await f.macros();
  expect(Object.keys(macros)).toEqual([...RPG_MACRO_KEYS]);
  expect(macros["rpgSceneState"]).toBe("");
  expect(macros["rpgQuests"]).toBe("");
  const reminder = await f.reminder();
  // The carried tracker's LABEL still reaches the model with no reading at all (carriage is the datum), but
  // nothing else invents a row.
  expect(reminder).toContain("Trackers: Mana (fuels spellcasting)");
  expect(reminder).not.toContain("Present:");
  expect(reminder).not.toContain("Active quests:");
  expect(reminder).not.toContain("Recent beats:");
  expect(reminder).not.toContain("Game trackers:");
  expect(reminder).not.toContain("Story:");
  expect(reminder).not.toContain(RPG_DELTA_HEADING);
});

test("CARRIAGE is the datum: a carried-but-unmoved tracker lists its bare label on every carrier kind", async () => {
  await Promise.all(
    ACTOR_CARRIERS.map(async (kind) => {
      const f = await openGame({ carrier: CARRIERS[kind], trackers: [MANA] });
      await f.beat(stageCast(f.carrier));
      const reminder = await f.reminder();
      expect(reminder, `${kind} must carry the unmoved tracker's label`).toContain(`${f.carrier.label} — Mana`);
    }),
  );
});

test("LOCK (D113 #4): a `locked` tracker still RENDERS in full and is ABSENT from the write schema", async () => {
  const locked: RpgTrackerDef = { ...MANA, locked: true };
  const f = await openGame({ carrier: CARRIERS.character, trackers: [locked] });
  // A locked tracker is unwritable by the model, so the host's hand seeds the reading.
  await f.beat(openingBeat(f.carrier));
  await f.handEdit({ actorState: [volatileRow(f.carrier, { trackerValues: { mana: { value: 7, items: null, max: null } } })] });
  const reminder = await f.reminder();
  expect(reminder).toContain("Trackers: Mana (fuels spellcasting)");
  expect(reminder).toContain("Mana 7/10");
  // The permission half: the write surface offers it nowhere.
  expect(actorTrackerWriteKeys([locked])).toEqual({ deltaKeys: [], setKeys: [] });
  expect(actorTrackerWriteKeys([MANA])).toEqual({ deltaKeys: ["mana"], setKeys: [] });
});

test("LOCK (fieldLocks): a hand-pinned value still renders AND survives the next tool write", async () => {
  const f = await openGame({ carrier: CARRIERS.character });
  await f.beat({ scene: { location: "The Bone Road" } });
  // The coarse auto-lock (the hand-edit default) pins `location`.
  await f.h.service.editSnapshot({ principal: HOST, chatId: f.chatId, patch: { location: "The Crypt" } });
  await f.beat({ scene: { location: "The Docks" } });
  const reminder = await f.reminder();
  expect(reminder).toContain("Scene: The Crypt");
  expect(reminder).not.toContain("The Docks");
});

test("PIN state: the band is a panel decision — the reminder is byte-identical pinned vs unpinned", async () => {
  const drive = async (pinned: boolean): Promise<{ reminder: string; orbs: number }> => {
    const f = await openGame({ carrier: CARRIERS.character, trackers: [{ ...MANA, pinned }] });
    await f.beat({ party: [{ targetRef: f.carrier.targetRef, trackerSets: [{ key: "mana", value: 7 }] }] });
    const view = await f.h.service.getTrackerView({ principal: HOST, chatId: f.chatId });
    return { reminder: await f.reminder(), orbs: view.trackerOrbs.length };
  };
  const off = await drive(false);
  const on = await drive(true);
  expect(on.reminder).toBe(off.reminder);
  expect(off.orbs).toBe(0);
  expect(on.orbs).toBe(1);
});

test("READ-ONLY delivery: a game whose connection can't write state still READS the whole state block", async () => {
  const db = await freshDb();
  const carrier = CARRIERS.character;
  const { chatId, h } = await seedLiteGame(db, { roster: [...carrier.roster], trackersReadOnly: true });
  await h.service.updateConfig({ principal: HOST, chatId, patch: { trackers: [MANA] } });
  await h.service.editSnapshot({
    principal: HOST,
    chatId,
    patch: { location: "The Crypt", actorState: [volatileRow(carrier, { trackerValues: { mana: { value: 5, items: null, max: null } } })] },
  });
  const out = await h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false });
  const reminder = out?.injections[0]?.content ?? "";
  // The honest degrade (§4.6): no write path, but the hand-steered values still steer.
  expect(reminder).toContain("Scene: The Crypt");
  expect(reminder).toContain("Mana 5/10");
});

test("CONFIG dateMode: `structured` carries the day counter, `narrated` drops it (both keep time-of-day)", async () => {
  const drive = async (dateMode: RpgDateMode): Promise<string> => {
    const f = await openGame({ carrier: CARRIERS.character });
    await f.h.service.updateConfig({ principal: HOST, chatId: f.chatId, patch: { dateMode } });
    await f.beat({ scene: { day: 7, timeOfDay: "night" } });
    return f.reminder();
  };
  expect(await drive("structured")).toContain("day 7 · night");
  const narrated = await drive("narrated");
  expect(narrated).toContain("night");
  expect(narrated).not.toContain("day 7");
});

test("CONFIG recentBeatsKeepLast: 0 drops the beat block entirely; N keeps the last N", async () => {
  const drive = async (keepLast: number): Promise<string> => {
    const f = await openGame({ carrier: CARRIERS.character });
    await f.h.service.updateConfig({ principal: HOST, chatId: f.chatId, patch: { recentBeatsKeepLast: keepLast } });
    await f.beat({ scene: { recentEvent: "The first beat." } });
    await f.beat({ scene: { recentEvent: "The second beat." } });
    return f.reminder();
  };
  const off = await drive(0);
  expect(off).not.toContain("Recent beats:");
  const one = await drive(1);
  expect(one).toContain("- The second beat.");
  expect(one).not.toContain("The first beat.");
});

test("CONFIG engaged=false: the whole read surface goes silent (byte-identical no-op, rows preserved)", async () => {
  const f = await openGame({ carrier: CARRIERS.character, trackers: [MANA] });
  await f.beat({ scene: { location: "The Bone Road" } });
  await f.h.service.updateConfig({ principal: HOST, chatId: f.chatId, patch: { engaged: false } });
  expect(await f.reminder()).toBe("");
  await f.h.service.updateConfig({ principal: HOST, chatId: f.chatId, patch: { engaged: true } });
  expect(await f.reminder()).toContain("The Bone Road");
});

test("CONFIG hiddenContentReveal is a HOST-plane knob: it never changes what the model reads", async () => {
  const drive = async (hiddenContentReveal: boolean): Promise<string> => {
    const f = await openGame({ carrier: CARRIERS.character });
    await f.h.service.updateConfig({ principal: HOST, chatId: f.chatId, patch: { hiddenContentReveal } });
    await f.beat({ scene: { location: "The Bone Road" } });
    return f.reminder();
  };
  expect(await drive(true)).toBe(await drive(false));
});

test("the roster/cast SPLIT is total: the same write reaches the model on a roster actor AND a scene NPC", async () => {
  // The parity claim in one place: whatever plane a beat writes, the carrier kind must not decide whether the
  // model gets to see it. (`4cd5d31d` fixed conditions on this axis; the volatile planes followed.)
  await Promise.all(
    ACTOR_CARRIERS.map(async (kind) => {
      const f = await openGame({ carrier: CARRIERS[kind] });
      await f.beat({
        ...stageCast(f.carrier),
        party: [{ targetRef: f.carrier.targetRef, status: "bleeding badly", addCondition: { name: "poisoned" } }],
        inventory: [{ targetRef: f.carrier.targetRef, add: [{ name: "rope" }], walletDeltas: [{ name: "gold", delta: 12 }] }],
      });
      const reminder = await f.reminder();
      for (const needle of ["bleeding badly", "conditions: poisoned", "carrying: rope", "12 gold"]) {
        expect(reminder, `${kind}: the model must read ${needle}`).toContain(needle);
      }
    }),
  );
});

test("actorRefKey is the ONE join: a tool write on a roster NAME lands under the ref the view reads", async () => {
  // The addressing cite's proof — the reason `actorRef.*` is exempt from the read surfaces is that the NAME is
  // the datum and the ref is the join; if that join broke, every probe above would still pass on `cast:` rows.
  const f = await openGame({ carrier: CARRIERS.user });
  await f.beat({ party: [{ targetRef: "player", status: "winded" }] }); // a self-alias, not the roster name
  const view = await f.h.service.getTrackerView({ principal: HOST, chatId: f.chatId });
  const you = view.actors.find((a) => actorRefKey(a.actorRef) === "user:user_host");
  expect(you?.volatile?.status).toBe("winded");
  expect(await f.reminder()).toContain("- You — winded");
});
