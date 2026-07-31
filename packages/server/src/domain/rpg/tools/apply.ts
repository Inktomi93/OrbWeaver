// domain/rpg/tools/apply — the PURE delta→plane appliers for the cheap-mode state tools (rpg-design/05 §4.5).
// Zero I/O: each takes the turn's CURRENT effective plane (read-through from the staging accumulator) + the
// tool's parsed DELTA args and returns the new ABSOLUTE plane the handler stages (the accumulator's `stage`
// merge honors locks + the [merge-clear] contract over that absolute value). Kept out of the handler so the
// arithmetic is unit-testable without a db + the accumulator (the `substrate/`-style pure-core discipline; but
// these read contract shapes, so they live in the tool subsystem, not zero-domain `substrate/`).
//
// ALIAS RESOLUTION: `targetRef` is a model-facing NAME (projection-clean tool args — no branded ids).
// `resolveActor` matches an existing `actorState` entry by a cast-key/actor-name projection; an unknown name
// MINTS a new `cast` actor (the model naming a fresh NPC — the wallet/inventory-on-every-actor ruling).
// TRACKERS address by `key` on both subjects (never a label — a rename must not orphan a value). The FOLD gates
// that mint behind the R5 ghost guard (`ghostTargetRefs`) — an NPC must be on stage (or put there by the same
// extraction) to be written; the per-tool handlers keep the open mint (a live tool call is the host's own turn).

import type {
  AddJournalEntryArgs,
  RpgActorRef,
  RpgActorVolatile,
  RpgExtraction,
  RpgInventoryItem,
  RpgPresentCharacter,
  RpgQuestObjective,
  RpgQuestStatus,
  RpgSnapshotState,
  RpgTrackerValue,
  SetTrackerArgs,
  UpdateInventoryArgs,
  UpdatePartyArgs,
  UpdateSceneArgs,
  UpsertQuestArgs,
} from "@orb/contracts/rpg";
import { actorRefKey, journalTitleFor, journalTypeFor, RPG_TRACKER_VALUE_EMPTY, TIME_OF_DAY_HOURS, trackerNumber } from "@orb/contracts/rpg";
import type { RpgQuestId } from "@orb/kit/ids";
import type { StagedJournalEntry } from "../contract/params";
import type { RpgStateDelta } from "../contract/service";

/** A name→actor-ref index over the roster (character/user members by their gather-surfaced display name,
 *  lowercased), so a model `targetRef` NAME resolves to the roster member's canonical ref key. Built once per
 *  apply from the resolved roster (`tools/index.ts`/the extraction fold thread `ctx.resolveRoster`). A tool
 *  write on a roster member then lands under `character:<id>`/`user:<id>` — the SAME key `buildTrackerView` +
 *  the steering reminder read (stickler F2), never an orphan `cast:<name>` the panel can't render. */
export type RosterRefIndex = ReadonlyMap<string, RpgActorRef>;

/** The universal self-aliases a model reaches for when it means the human player — resolved to the player
 *  (user-kind) roster actor so a "player"/"you"/"self" targetRef lands on the real ref, never a phantom
 *  `cast:player`. Belt-and-suspenders alongside the schema-level enum constraint (R2, the mis-target fix). */
const PLAYER_SELF_ALIASES = ["player", "you", "self", "me", "the player"] as const;

/** Build the name→ref index from resolved roster actors (name lowercased — the model's free-text ref). The
 *  player (user-kind) actor ALSO answers to the universal self-aliases (`player`/`you`/`self`/…), so a model
 *  that targets "player" when the roster name is "You" still resolves to the real ref (never a `cast:player`
 *  phantom the panel can't render). An explicit roster name always wins over an alias (aliases fill only
 *  gaps the roster didn't already claim). */
export function buildRosterRefIndex(roster: readonly { readonly actorRef: RpgActorRef; readonly name: string }[]): RosterRefIndex {
  const index = new Map<string, RpgActorRef>(roster.map((r) => [r.name.toLowerCase(), r.actorRef]));
  const player = roster.find((r) => r.actorRef.kind === "user");
  if (player !== undefined) {
    for (const alias of PLAYER_SELF_ALIASES) {
      if (!index.has(alias)) {
        index.set(alias, player.actorRef);
      }
    }
  }
  return index;
}

/** A minimal actor identity keyed by `ref` — either a roster ref (`character`/`user`, F2) or a fresh `cast`. */
function newActorFor(ref: RpgActorRef): RpgActorVolatile {
  return { actorRef: ref, hp: null, trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "" };
}

/** Resolve the actor a `targetRef` NAME addresses (the model never sees ids). Match order:
 *  1. an EXISTING `actorState` entry whose ref key already matches (roster ref OR cast key) — keep addressing it;
 *  2. else a ROSTER member by name → mint with its `character:<id>`/`user:<id>` ref (F2 — the tracker view +
 *     reminder read this key), so a party-member write is FIRST-CLASS and rendered;
 *  3. else a genuine non-roster scene NPC → mint a `cast:<name>` (the additive, hand-editable identity).
 *  Returns the matched/minted actor + its index (-1 = minted, appended). */
function resolveActor(actors: readonly RpgActorVolatile[], targetRef: string, roster: RosterRefIndex): { actor: RpgActorVolatile; index: number } {
  const rosterRef = roster.get(targetRef.toLowerCase());
  // (1) an existing entry under the target's resolved key — a roster member already written this turn, OR a
  //     cast NPC by name. Prefer the roster ref's key when the name resolves to a roster member.
  const wantedKey = rosterRef !== undefined ? actorRefKey(rosterRef) : `cast:${targetRef}`;
  const index = actors.findIndex((a) => actorRefKey(a.actorRef) === wantedKey);
  if (index !== -1) {
    const found = actors[index];
    if (found !== undefined) {
      return { actor: found, index };
    }
  }
  // (2)/(3) mint under the roster ref when the name is a roster member, else a fresh cast NPC.
  return { actor: newActorFor(rosterRef ?? { kind: "cast", castKey: targetRef }), index: -1 };
}

/** Write a resolved actor back into the plane (replace at `index`, or append a minted one). */
function withActor(actors: readonly RpgActorVolatile[], resolved: { actor: RpgActorVolatile; index: number }): RpgActorVolatile[] {
  if (resolved.index === -1) {
    return [...actors, resolved.actor];
  }
  return actors.map((a, i) => (i === resolved.index ? resolved.actor : a));
}

/** Apply named-amount deltas onto the `wallet` list: add the delta to a matching entry, or append a fresh one.
 *  A fresh WALLET amount is unconstrained (the contract allows a negative/no-max amount — a debt slot). */
function applyWalletDeltas(
  list: readonly RpgActorVolatile["wallet"][number][],
  deltas: readonly { name: string; delta: number }[],
): RpgActorVolatile["wallet"][number][] {
  const out = [...list];
  for (const d of deltas) {
    const i = out.findIndex((e) => e.name === d.name);
    const entry = out[i];
    if (entry === undefined) {
      out.push({ name: d.name, amount: d.delta });
    } else {
      out[i] = { ...entry, amount: entry.amount + d.delta };
    }
  }
  return out;
}

/** The tracked-value WRITE (the tracked-field unification): apply the two arms — `delta` (spend/restore a
 *  resource) and `set` (record a new reading) — over a `trackerValues` record, keyed by tracker `key`.
 *  TOTAL by construction: every write produces a whole `{value,max,items}` value, so the snapshot merge (which
 *  recurses into objects) can never strand a previous reading's `max` on a new one. A `delta` against a
 *  non-numeric/absent reading starts from 0 (the "spend from a resource you never had" arm — the old pool
 *  applier floored at 0 for exactly this case; a negative reading is legal here because a tracker's floor is
 *  the host's business, and the contract no longer forces `max >= 1`).
 *
 *  `max` (the per-carrier ceiling OVERRIDE, owner amendment 2026-07-31) is HOST-AUTHORED: neither arm carries
 *  a max, and the spread PRESERVES an existing override — the model moves the reading, never the ceiling.
 *
 *  The def catalogue is NOT consulted: an unknown key is written as-is. The write surface already made an
 *  unknown key unrepresentable at the schema (R6 per-actor enums), and the panel projects only DEFINED
 *  trackers — so a stray key is inert data, never a phantom row, and dropping it here would silently discard
 *  a legitimate write during the beat where a host adds the def. */
function applyTrackerWrites(
  base: Readonly<Record<string, RpgTrackerValue>>,
  deltas: readonly { key: string; delta: number }[] | undefined,
  sets: readonly { key: string; value?: number | string | undefined; items?: readonly string[] | undefined }[] | undefined,
): Record<string, RpgTrackerValue> {
  const out: Record<string, RpgTrackerValue> = { ...base };
  for (const d of deltas ?? []) {
    const current = out[d.key];
    out[d.key] = { ...(current ?? RPG_TRACKER_VALUE_EMPTY), value: (trackerNumber(current) ?? 0) + d.delta };
  }
  for (const s of sets ?? []) {
    if (s.value === undefined && s.items === undefined) {
      continue; // a set arm naming neither datum is a no-op, never a blanked tracker
    }
    const current = out[s.key] ?? RPG_TRACKER_VALUE_EMPTY;
    out[s.key] = {
      ...current,
      ...(s.value !== undefined ? { value: s.value } : {}),
      ...(s.items !== undefined ? { items: [...s.items] } : {}),
    };
  }
  return out;
}

/** `update_party` → the new `actorState` plane (per-actor tracker/condition/hp/status writes). Returns the
 *  patch, or `{ ok:false }` when `hpDelta` targets a null-hp actor (the errors-as-data legality lane, §4.5).
 *  `roster` resolves the target NAME to a roster member's ref (F2 — a party-member write lands FIRST-CLASS). */
export function applyUpdateParty(
  state: RpgSnapshotState,
  args: UpdatePartyArgs,
  roster: RosterRefIndex,
): { ok: true; patch: { actorState: RpgActorVolatile[] } } | { ok: false; error: string } {
  const resolved = resolveActor(state.actorState, args.targetRef, roster);
  const actor = resolved.actor;

  if (args.hpDelta !== undefined && actor.hp === null) {
    return { ok: false, error: `${args.targetRef} has no HP track — set a max HP by hand before applying an hpDelta.` };
  }

  const nextTrackers =
    args.trackerDeltas === undefined && args.trackerSets === undefined
      ? actor.trackerValues
      : applyTrackerWrites(actor.trackerValues, args.trackerDeltas, args.trackerSets);
  const conditions = args.removeCondition === undefined ? actor.conditions : actor.conditions.filter((c) => c.name !== args.removeCondition);
  const nextConditions =
    args.addCondition === undefined
      ? conditions
      : [
          ...conditions.filter((c) => c.name !== args.addCondition?.name),
          { name: args.addCondition.name, stat: null, modifier: args.addCondition.modifier ?? 0, turnsLeft: null },
        ];
  const nextHp = args.hpDelta === undefined || actor.hp === null ? actor.hp : { ...actor.hp, value: actor.hp.value + args.hpDelta };

  const next: RpgActorVolatile = {
    ...actor,
    trackerValues: nextTrackers,
    conditions: nextConditions,
    hp: nextHp,
    ...(args.status !== undefined ? { status: args.status } : {}),
  };
  return { ok: true, patch: { actorState: withActor(state.actorState, { actor: next, index: resolved.index }) } };
}

/** `update_inventory` → the new `actorState` plane (item add/remove + wallet deltas). `add` mints item ids via
 *  the injected `mintItemId` (determinism). `roster` resolves the target NAME to a roster member's ref (F2). */
export function applyUpdateInventory(
  state: RpgSnapshotState,
  args: UpdateInventoryArgs,
  mintItemId: () => string,
  roster: RosterRefIndex,
): { actorState: RpgActorVolatile[] } {
  const resolved = resolveActor(state.actorState, args.targetRef, roster);
  const actor = resolved.actor;

  let inventory: RpgInventoryItem[] = [...actor.inventory];
  for (const item of args.add ?? []) {
    inventory.push({
      id: mintItemId(),
      name: item.name,
      description: item.description ?? "",
      quantity: item.quantity ?? 1,
      location: item.location ?? "",
      type: "",
    });
  }
  for (const rem of args.remove ?? []) {
    inventory = inventory.flatMap((it) => {
      if (it.name !== rem.name) {
        return [it];
      }
      const nextQty = it.quantity - (rem.quantity ?? it.quantity);
      return nextQty > 0 ? [{ ...it, quantity: nextQty }] : [];
    });
  }
  const wallet = args.walletDeltas === undefined ? actor.wallet : applyWalletDeltas(actor.wallet, args.walletDeltas);

  const next: RpgActorVolatile = { ...actor, inventory, wallet };
  return { actorState: withActor(state.actorState, { actor: next, index: resolved.index }) };
}

/** The state patch `update_scene` produces — an ambient/cast/beat overlay under the [merge-clear] contract. */
export interface ScenePatch {
  clock?: RpgSnapshotState["clock"];
  location?: string;
  calendarDate?: string;
  weather?: RpgSnapshotState["weather"];
  presentCharacters?: RpgSnapshotState["presentCharacters"];
  recentEvents?: readonly string[];
  plot?: RpgSnapshotState["plot"];
}

/** Pick the field that WINS a cast merge: the tool's value if provided, else the existing value, else the
 *  default. Kills the nested-ternary spread in the cast merge below. */
function pick<T>(next: T | undefined, existing: T | undefined, fallback: T): T {
  if (next !== undefined) {
    return next;
  }
  return existing ?? fallback;
}

/** Optional carry: the tool's value if provided, else keep the existing (omit when both absent). */
function carry<T>(next: T | undefined, existing: T | undefined): T | undefined {
  return next ?? existing;
}

/** The default relationship a fresh cast member is born with (neutral, no label). */
const DEFAULT_RELATIONSHIP: RpgPresentCharacter["relationship"] = { kind: "neutral", label: "" };

/** Merge a `presentUpsert.relationship` patch onto the existing stance (§2.1). Omit = keep (MA-4). A `custom`
 *  kind carries its `label`; a non-custom kind clears the label (the built-ins carry their own meaning). */
function mergeRelationship(
  up: NonNullable<UpdateSceneArgs["presentUpsert"]>[number]["relationship"],
  existing: RpgPresentCharacter["relationship"] | undefined,
): RpgPresentCharacter["relationship"] {
  if (up === undefined) {
    return existing ?? DEFAULT_RELATIONSHIP;
  }
  return { kind: up.kind, label: up.kind === "custom" ? (up.label ?? "") : "" };
}

/** Merge one `presentUpsert` entry onto its existing cast row (or a fresh one) — a per-cast PATCH by `key`. */
function mergeCastMember(up: NonNullable<UpdateSceneArgs["presentUpsert"]>[number], existing: RpgPresentCharacter | undefined): RpgPresentCharacter {
  const appearance = carry(up.appearance, existing?.appearance);
  const outfit = carry(up.outfit, existing?.outfit);
  const thoughts = carry(up.thoughts, existing?.thoughts);
  return {
    key: up.name,
    name: up.name,
    emoji: pick(up.emoji, existing?.emoji, ""),
    mood: pick(up.mood, existing?.mood, ""),
    relationship: mergeRelationship(up.relationship, existing?.relationship),
    ...(appearance !== undefined ? { appearance } : {}),
    ...(outfit !== undefined ? { outfit } : {}),
    ...(thoughts !== undefined ? { thoughts } : {}),
    ...(existing?.characterId !== undefined ? { characterId: existing.characterId } : {}),
  };
}

/** Apply the `presentRemove` + `presentUpsert` cast patches over the current cast plane. */
function applyCastPatch(cast: readonly RpgPresentCharacter[], args: UpdateSceneArgs): RpgPresentCharacter[] {
  let next = cast.filter((c) => !(args.presentRemove ?? []).includes(c.key));
  for (const up of args.presentUpsert ?? []) {
    const i = next.findIndex((c) => c.key === up.name);
    const merged = mergeCastMember(up, i === -1 ? undefined : next[i]);
    next = i === -1 ? [...next, merged] : next.map((c, idx) => (idx === i ? merged : c));
  }
  return next;
}

/** The P5 plot-patch applier: the model's FLAT patch (`act`/`title`/`actTitle`/`actSummary`) onto the
 *  ABSOLUTE plot plane. The applier maintains the `acts` array — pads untitled acts up to the current act
 *  (a small model declares "act: 3" without managing a nested list) and writes the current act's
 *  title/summary in place. A first-ever patch births the plane from the defaults (act 1, empty acts). */
function applyPlotPatch(current: RpgSnapshotState["plot"], patch: NonNullable<UpdateSceneArgs["plot"]>): NonNullable<RpgSnapshotState["plot"]> {
  const base = current ?? { act: 1, title: "", acts: [] };
  const act = patch.act ?? base.act;
  const acts = base.acts.map((a) => ({ ...a }));
  while (acts.length < act) {
    acts.push({ title: "", summary: "" });
  }
  const idx = act - 1;
  const curAct = acts[idx];
  if (curAct !== undefined) {
    acts[idx] = {
      title: patch.actTitle ?? curAct.title,
      summary: patch.actSummary ?? curAct.summary,
    };
  }
  return { act, title: patch.title ?? base.title, acts };
}

/** The clock the scene args resolve to (§2.7 — `timeOfDay`/`day` onto the engine `{day,hour,minute}`). */
function sceneClock(state: RpgSnapshotState, args: UpdateSceneArgs): RpgSnapshotState["clock"] {
  const base = state.clock ?? { day: 1, hour: 0, minute: 0 };
  return {
    day: args.day ?? base.day,
    hour: args.timeOfDay === undefined ? base.hour : TIME_OF_DAY_HOURS[args.timeOfDay],
    minute: args.timeOfDay === undefined ? base.minute : 0,
  };
}

/** `update_scene` → the ambient/cast/beat patch (§2.7). `timeOfDay`/`day` map onto the engine `clock` via the
 *  ONE `TIME_OF_DAY_HOURS` home; `presentUpsert` is a per-cast PATCH (merge by `key` = normalized name);
 *  `recentEvent` appends one beat. `customFields` array-of-pairs collapses to the stored record. */
export function applyUpdateScene(state: RpgSnapshotState, args: UpdateSceneArgs): ScenePatch {
  const patch: ScenePatch = {};
  if (args.location !== undefined) {
    patch.location = args.location;
  }
  if (args.calendarDate !== undefined) {
    patch.calendarDate = args.calendarDate;
  }
  if (args.weather !== undefined) {
    // TOTAL by construction: the label is always written (`""` when the model wrote none). The plane merge
    // recurses into this object, so an omitted label would leave the PREVIOUS sky's flavor text stranded on
    // the new weather ("torrential sleet" over `clear`).
    patch.weather = { type: args.weather.type, label: args.weather.label ?? "" };
  }
  if (args.timeOfDay !== undefined || args.day !== undefined) {
    patch.clock = sceneClock(state, args);
  }
  if (args.presentUpsert !== undefined || args.presentRemove !== undefined) {
    patch.presentCharacters = applyCastPatch(state.presentCharacters, args);
  }
  if (args.recentEvent !== undefined) {
    patch.recentEvents = [...state.recentEvents, args.recentEvent];
  }
  if (args.plot !== undefined) {
    patch.plot = applyPlotPatch(state.plot, args.plot);
  }
  return patch;
}

/** `set_tracker` → the GAME-subject `trackerValues` patch (keyed by tracker `key`). Runs through the SAME
 *  {@link applyTrackerWrites} the per-actor arm uses — one write mechanic for both subjects, so a delta on a
 *  game tracker behaves exactly like a delta on an actor's. */
export function applySetTracker(state: RpgSnapshotState, args: SetTrackerArgs): { trackerValues: RpgSnapshotState["trackerValues"] } {
  const deltas = args.delta === undefined ? [] : [{ key: args.key, delta: args.delta }];
  const sets =
    args.value === undefined && args.items === undefined
      ? []
      : [{ key: args.key, ...(args.value !== undefined ? { value: args.value } : {}), ...(args.items !== undefined ? { items: args.items } : {}) }];
  return { trackerValues: applyTrackerWrites(state.trackerValues, deltas, sets) };
}

/** The MATCH key for an objective line (EXT-4c): trimmed + case-folded. A model restating its own objective
 *  list re-types it, and "Find the road north" vs "find the road north " is the same objective — matching on
 *  the raw string would re-mint it (losing its completion) for a difference no reader can see. */
function objectiveMatchKey(text: string): string {
  return text.trim().toLowerCase();
}

/** MERGE the authored objective list onto the quest's existing lines (EXT-4c — the defect: an `update` carrying
 *  `objectives` used to re-mint every line `completed:false`, so a model could not mark ONE objective done
 *  without wiping the others, and the host's hand-edits died with them). A line whose text matches an existing
 *  one KEEPS its id and its `completed` flag (taking the incoming wording — the list is the authoring arm); an
 *  unmatched line is a genuinely new objective and mints fresh. A line the list omits is dropped: the authored
 *  list IS the quest's objectives. */
function mergeObjectives(existing: readonly RpgQuestObjective[], texts: readonly string[], mintObjectiveId: () => string): RpgQuestObjective[] {
  const byText = new Map(existing.map((o) => [objectiveMatchKey(o.text), o]));
  return texts.map((text) => {
    const prior = byText.get(objectiveMatchKey(text));
    return prior === undefined ? { id: mintObjectiveId(), text, completed: false } : { ...prior, text };
  });
}

/** Mark objectives done BY TEXT (EXT-4c `completeObjectives`) — the gesture that lets a model report progress
 *  without restating the list at all. A name matching no live objective is DROPPED (errors-as-data: completing
 *  an objective that doesn't exist is a ghost, never a mint — the `ghostTargetRefs` posture). */
function withCompletedObjectives(list: readonly RpgQuestObjective[], names: readonly string[]): RpgQuestObjective[] {
  const wanted = new Set(names.map(objectiveMatchKey));
  return list.map((o) => (wanted.has(objectiveMatchKey(o.text)) ? { ...o, completed: true } : { ...o }));
}

/** `upsert_quest` → the new `quests` plane (§2.5). `create` mints a quest via the injected `mintQuestId`;
 *  `update`/`complete`/`fail` address the quest by NAME (the model never sees ids). `objectives` MERGES by text
 *  (ids + completion preserved, {@link mergeObjectives}) and `completeObjectives` marks lines done by text —
 *  the two gestures the model needs to advance a quest without destroying its own progress. */
export function applyUpsertQuest(
  state: RpgSnapshotState,
  args: UpsertQuestArgs,
  mintQuestId: () => RpgQuestId,
  mintObjectiveId: () => string,
): { quests: RpgSnapshotState["quests"] } {
  const i = state.quests.findIndex((q) => q.name === args.name);
  const existing = i === -1 ? [] : (state.quests[i]?.objectives ?? []);
  const merged = args.objectives === undefined ? undefined : mergeObjectives(existing, args.objectives, mintObjectiveId);
  const statusFor = (): RpgQuestStatus => {
    if (args.action === "complete") {
      return "completed";
    }
    if (args.action === "fail") {
      return "failed";
    }
    return "active";
  };
  /** The objective list after BOTH arms: the merge (or the untouched current list), then the completions. */
  const resolveObjectives = (current: readonly RpgQuestObjective[]): RpgQuestObjective[] => {
    const base = merged ?? current;
    return args.completeObjectives === undefined ? [...base] : withCompletedObjectives(base, args.completeObjectives);
  };

  if (i === -1) {
    const created = {
      id: mintQuestId(),
      name: args.name,
      status: statusFor(),
      description: args.description ?? "",
      objectives: resolveObjectives([]),
    };
    return { quests: [...state.quests, created] };
  }
  const quests = state.quests.map((q, idx) => {
    if (idx !== i) {
      return q;
    }
    const touchesObjectives = merged !== undefined || args.completeObjectives !== undefined;
    return {
      ...q,
      status: args.action === "update" ? q.status : statusFor(),
      ...(args.description !== undefined ? { description: args.description } : {}),
      ...(touchesObjectives ? { objectives: resolveObjectives(q.objectives) } : {}),
    };
  });
  return { quests };
}

/** `add_journal_entry` → a staged journal entry (flushed at commit stamped with the committed variant, §2.5).
 *  `title` is DERIVED from the content head when the model omitted it (`journalTitleFor` — the small-model-robust
 *  arm, ruling #10: an 8B dropping the nested-required `title` used to fail the whole extraction `safeParse`);
 *  `type` is HEALED to `note` the same way (EXT-4b — the identical nested-array blind spot, `journalTypeFor`).
 *  The heal is VISIBLE: `healedJournalTypes` names the entries this healed and the caller logs them. */
export function toStagedJournalEntry(args: AddJournalEntryArgs): StagedJournalEntry {
  const type = journalTypeFor(args);
  // R4c — the free `label` is meaningful ONLY on a `custom` type; a non-custom type clears it (the
  // relationship-kind precedent: the built-ins carry their own meaning, so a stray label would be noise).
  return { type, label: type === "custom" ? (args.label ?? "") : "", title: journalTitleFor(args), content: args.content };
}

/** The actors a write can legally land on GIVEN THE STATE ALONE (lowercased): the roster index (members + the
 *  player self-aliases) ∪ the tracked cast actors ∪ the scene cast. The ONE home for "who exists right now" —
 *  {@link ghostTargetRefs} adds the in-flight `presentUpsert` arm on top, and the R1 fold reports this SIZE as
 *  the diagnostic denominator on a write-nothing extraction (it is exactly the target menu the model had),
 *  which is what lets the fold log that fact without re-resolving the whole per-call ref bundle. */
export function reachableActorRefs(base: RpgSnapshotState, roster: RosterRefIndex): Set<string> {
  const known = new Set<string>(roster.keys()); // already lowercased by `buildRosterRefIndex`
  for (const actor of base.actorState) {
    if (actor.actorRef.kind === "cast") {
      known.add(actor.actorRef.castKey.toLowerCase());
    }
  }
  for (const c of base.presentCharacters) {
    known.add(c.key.toLowerCase());
  }
  return known;
}

/** The GHOST-ACTOR guard (R5). The per-call `targetRef` enum is a MENU the model can misread: a measured spike
 *  saw a hosted model target "Aldric Vane" — an actor from a STALE enum who was in no live cast — and the
 *  mint arm of {@link resolveActor} happily made him real, so a hallucinated name became a tracked actor the
 *  panel then rendered forever. This returns the party/inventory `targetRef`s that name NOBODY reachable this
 *  turn; {@link extractionToStateDelta} DROPS those args (errors-as-data — a ghost never fails the turn) and
 *  the caller logs them.
 *
 *  Legally reachable = the roster index (members + the player self-aliases) ∪ the tracked cast actors ∪ the
 *  scene cast ∪ the cast this SAME extraction puts on stage (`scene.presentUpsert`) — that last arm keeps the
 *  legitimate introduce-and-wound beat working (the model presents a new NPC and damages her in one round),
 *  so the guard only kills names with no referent anywhere. */
export function ghostTargetRefs(base: RpgSnapshotState, extraction: RpgExtraction, roster: RosterRefIndex): string[] {
  const known = reachableActorRefs(base, roster);
  for (const up of extraction.scene?.presentUpsert ?? []) {
    known.add(up.name.toLowerCase());
  }
  const named = [...extraction.party, ...extraction.inventory].map((e) => e.targetRef);
  return [...new Set(named.filter((n) => !known.has(n.toLowerCase())))];
}

/** The id mints the extraction fold needs (inventory item ids + quest/objective ids) — injected for
 *  determinism (the impl passes `newId`/`ctx.ids.quest`, a test passes stable counters). */
export interface ExtractionMints {
  readonly item: () => string;
  readonly quest: () => RpgQuestId;
  readonly objective: () => string;
}

/** The ACTOR-plane arms of the fold (`party` + `inventory`) applied over the running state — hoisted out of
 *  {@link extractionToStateDelta} so the R5 ghost drop stays under the cognitive-complexity ceiling. Each entry
 *  reads the previous entry's write (the staging-accumulator read-through); a GHOST-targeted arg is dropped
 *  whole (errors-as-data — never a throw, never a hallucinated mint). An `update_party` legality denial (an
 *  hpDelta on a null-hp actor) is skipped the same way. */
function applyActorArgs(base: RpgSnapshotState, extraction: RpgExtraction, mints: ExtractionMints, roster: RosterRefIndex): RpgSnapshotState {
  const ghosts = new Set(ghostTargetRefs(base, extraction, roster).map((r) => r.toLowerCase()));
  let state = base;
  for (const args of extraction.party) {
    if (ghosts.has(args.targetRef.toLowerCase())) {
      continue;
    }
    const applied = applyUpdateParty(state, args, roster);
    if (applied.ok) {
      state = { ...state, ...applied.patch };
    }
  }
  for (const args of extraction.inventory) {
    if (ghosts.has(args.targetRef.toLowerCase())) {
      continue;
    }
    state = { ...state, ...applyUpdateInventory(state, args, mints.item, roster) };
  }
  return state;
}

/** Fold a reliable-mode `RpgExtraction` (arrays of the SAME cheap-mode tool args) into ONE `RpgStateDelta` —
 *  the shared-plane proof made runtime: a reliable extraction is exactly "a batch of the tool calls the model
 *  would otherwise have made" (§4.6). Each entry applies over the RUNNING state (read-through, exactly like the
 *  staging accumulator during a cheap turn: entry N sees entry N-1's write), so the delta's `statePatch` is the
 *  final ABSOLUTE plane values (the accumulator overlays them under the [merge-clear] contract + locks).
 *  An `update_party` legality denial (an hpDelta on a null-hp actor) is SKIPPED — the errors-as-data lane
 *  (cheap mode narrates it; the extraction has no narrator, so a bad delta line is dropped, never a throw).
 *  A GHOST-targeted party/inventory arg is dropped the same way ({@link ghostTargetRefs}, R5). */
export function extractionToStateDelta(base: RpgSnapshotState, extraction: RpgExtraction, mints: ExtractionMints, roster: RosterRefIndex): RpgStateDelta {
  let state = base;
  const overlay = (patch: Partial<RpgSnapshotState>): void => {
    state = { ...state, ...patch };
  };

  state = applyActorArgs(state, extraction, mints, roster);
  if (extraction.scene !== undefined) {
    // `ScenePatch.recentEvents` is `readonly string[]`; the state plane is mutable — split it off and copy it so
    // the overlay type matches (the `update_scene` tool handler spreads the same way through the accumulator).
    const { recentEvents, ...scene } = applyUpdateScene(state, extraction.scene);
    overlay({ ...scene, ...(recentEvents !== undefined ? { recentEvents: [...recentEvents] } : {}) });
  }
  for (const args of extraction.trackers) {
    overlay(applySetTracker(state, args));
  }
  for (const args of extraction.quests) {
    overlay(applyUpsertQuest(state, args, mints.quest, mints.objective));
  }

  // The statePatch is the accumulated ABSOLUTE planes — but ONLY the planes any write touched, so an empty
  // extraction stays an empty patch (the byte-identical non-writing turn, `chat-ops/flush.ts`). A plane is
  // included iff its running value diverged from the base (reference-changed by an `overlay`).
  const statePatch: Record<string, unknown> = {};
  for (const key of [
    "actorState",
    "presentCharacters",
    "recentEvents",
    "clock",
    "location",
    "calendarDate",
    "weather",
    "trackerValues",
    "quests",
    "plot",
  ] as const) {
    if (state[key] !== base[key]) {
      statePatch[key] = state[key];
    }
  }
  // Drop a genuinely-empty beat (no content AND no title — nothing to log); a content-full but title-less
  // entry is KEPT (title derived from the content head — the small-model-robust arm, ruling #10).
  const journal = extraction.journal.filter((e) => e.content.trim().length > 0 || (e.title?.trim().length ?? 0) > 0).map(toStagedJournalEntry);
  // §2.4 — DERIVE a journal beat for each relationship-KIND change (a durable, swipe-consistent record of "when
  // did she turn"). Derived at the fold (both old + new state are in hand), NOT model-authored (a second write
  // is a second failure point). Appended AFTER the model's own beats. Only fires when the scene plane changed.
  const relationshipBeats = state.presentCharacters === base.presentCharacters ? [] : deriveRelationshipBeats(base.presentCharacters, state.presentCharacters);
  return { statePatch, journal: [...journal, ...relationshipBeats] };
}

/** Derive the relationship-change journal beats (§2.4) — one `event` entry per cast member whose relationship
 *  KIND flipped from its base snapshot value (`Mari: friend → enemy`). Matched by cast key; a first-seen member
 *  or a label-only change (same kind) is NOT a beat (the kind is the arc-turning datum). A custom→custom kind
 *  with a changed label IS a turn (both read as "custom" by kind, so we also fire when the label moved). */
function deriveRelationshipBeats(prev: readonly RpgPresentCharacter[], cur: readonly RpgPresentCharacter[]): StagedJournalEntry[] {
  const before = new Map(prev.map((c) => [c.key, c.relationship]));
  const beats: StagedJournalEntry[] = [];
  for (const c of cur) {
    const was = before.get(c.key);
    if (was === undefined) {
      continue; // a newly-present member has no prior stance to have "turned" from
    }
    const kindChanged = was.kind !== c.relationship.kind;
    const customLabelChanged = was.kind === "custom" && c.relationship.kind === "custom" && was.label !== c.relationship.label;
    if (kindChanged || customLabelChanged) {
      const from = was.kind === "custom" && was.label !== "" ? was.label : was.kind;
      const to = c.relationship.kind === "custom" && c.relationship.label !== "" ? c.relationship.label : c.relationship.kind;
      beats.push({ type: "event", label: "", title: `${c.name}: ${from} → ${to}`, content: `${c.name}'s relationship shifted from ${from} to ${to}.` });
    }
  }
  return beats;
}
