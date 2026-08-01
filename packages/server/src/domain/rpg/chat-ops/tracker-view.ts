// domain/rpg/chat-ops/tracker-view — the SHARED tracker-view projection (rpg-design/05 §4.8). Resolves the
// CURRENT snapshot — or, for a REGEN turn, the state as of before the regenerated slot (VER-1b, the one
// `regenSlotMessageId` arm) — (or the synthesized default for a turnless game) and projects roster ∪ sheets (§4.3) against
// the injected roster into the `RpgTrackerView` the CP client renders AND the gather's steering reminder reads.
// PRINCIPAL-FREE: the member gate lives in the `getTrackerView` VERB (`resolveMember`); the GATHER is internal
// to a turn chat already gated, so it consumes this projection directly (the `getMembership`/gather-is-gated
// precedent). Every plane reads the SAME resolved-current snapshot, so a swipe re-resolves the whole panel
// consistently. Homed in the `chat-ops/` subsystem (NOT `verbs/read/` — the `domain-no-cross-verb` rule bans a
// verb importing another verb's value) so the `getTrackerView` verb and the gather share ONE projection.
//
// CARRIER RESOLUTION HAPPENS HERE, ONCE (the tracked-field unification). The view hands every consumer the
// trackers an actor/cast member ACTUALLY carries — resolved through the one pure `trackersForCarrier`
// predicate over `config.trackers` + each sheet's grants/revokes — so no client, reminder, or macro surface
// re-derives carriage and drifts from the write surface the model was handed.

import type {
  RpgActorRef,
  RpgActorView,
  RpgActorVolatile,
  RpgQuestView,
  RpgSheet,
  RpgSnapshotState,
  RpgTrackerCarrier,
  RpgTrackerDef,
  RpgTrackerEntry,
  RpgTrackerOrb,
  RpgTrackerView,
} from "@orb/contracts/rpg";
import { actorRefKey, gameTrackers, trackerCeiling, trackerNumber, trackersForCarrier } from "@orb/contracts/rpg";
import type { CharacterId, MessageId, UserId } from "@orb/kit/ids";
import type { RpgContext, RpgGameRow } from "../contract/service";
import { listSheets } from "../persistence/sheets";
import { currentSnapshotState, snapshotStateBeforeSlot } from "../snapshot-edit";

/** The orb-row envelope (§4.11 #5) — the band fits at most this many orbs at the 17rem floor. Caps the
 *  PINNED set so a host over-pinning can't crush the row (the pins are ordered by the tracker `sort`, so the
 *  cap drops the host's own lowest-priority pins, never an arbitrary set). */
const TRACKER_ORB_MAX = 6;

/** Slice the durable append-only `recentEvents` log to the last N for the reminder (P3 fold — `keepLast === 0`
 *  drops the block; the durable log is untouched, the journal keeps the full record). */
function keepLastBeats(beats: readonly string[], keepLast: number): readonly string[] {
  return keepLast <= 0 ? [] : beats.slice(-keepLast);
}

/** The default sheet a roster actor with no row renders (§4.3 — a missing row = the default sheet). */
function defaultSheet(): RpgSheet {
  return { className: "", attributes: {}, maxHp: null, flavor: "", level: null, trackerGrants: [], trackerRevokes: [] };
}

/** The `RpgActorRef` a sheet row addresses (character XOR user; the XOR is DB-enforced). */
function sheetRef(row: { characterId: CharacterId | null; userId: UserId | null }): RpgActorRef | null {
  if (row.characterId !== null) {
    return { kind: "character", characterId: row.characterId };
  }
  if (row.userId !== null) {
    return { kind: "user", userId: row.userId };
  }
  return null;
}

/** The carrier record for a ROSTER actor: `party` class, carrying its sheet's grants/revokes. */
function rosterCarrier(entry: { actorRef: RpgActorRef; name: string }, sheet: RpgSheet): RpgTrackerCarrier {
  return { actorKey: actorRefKey(entry.actorRef), name: entry.name, kind: "party", grants: sheet.trackerGrants, revokes: sheet.trackerRevokes };
}

/** The carrier record for a SCENE-CAST member: `npcs` class, no sheet (a cast NPC has no `rpg_sheets` row —
 *  its exceptions are reachable through an explicit `appliesTo` list on the def, which is the honest home for
 *  a one-off NPC field: the def, not a row the NPC doesn't have). */
function castCarrier(key: string, name: string): RpgTrackerCarrier {
  return { actorKey: `cast:${key}`, name, kind: "npcs", grants: [], revokes: [] };
}

/** Pair a carrier's trackers with their readings off a volatile row's `trackerValues`. */
function trackerEntries(defs: readonly RpgTrackerDef[], values: RpgActorVolatile["trackerValues"] | undefined): RpgTrackerEntry[] {
  return defs.map((def) => ({ def, value: values?.[def.key] ?? null }));
}

/** Project one roster actor onto the tracker view: its sheet (row or default), its volatile state (from the
 *  resolved snapshot's `actorState`, keyed by `actorRefKey`, or null), and the trackers it carries. */
function actorView(
  entry: { actorRef: RpgActorRef; name: string; avatar?: string },
  sheet: RpgSheet,
  volatile: RpgActorVolatile | null,
  trackers: readonly RpgTrackerDef[],
): RpgActorView {
  return {
    actorRef: entry.actorRef,
    name: entry.name,
    ...(entry.avatar !== undefined ? { avatar: entry.avatar } : {}),
    sheet: {
      className: sheet.className,
      attributes: sheet.attributes,
      maxHp: sheet.maxHp,
      flavor: sheet.flavor,
      level: sheet.level,
      trackerGrants: sheet.trackerGrants,
      trackerRevokes: sheet.trackerRevokes,
    },
    volatile,
    trackers,
  };
}

/** The band-orb derivation: the PINNED meter trackers of the first actor that has state, then the pinned game
 *  trackers, in tracker order, capped at the orb-row envelope. The retired rule was "the first 3 pools
 *  automatically, plus explicit pins" — a band whose contents depended on def ORDER, which is why the GM tab
 *  had to teach the rule in prose. The band now shows exactly what the host pinned. A pinned tracker with no
 *  numeric reading is skipped (an orb renders a bar; there is nothing honest to draw for an unset one). */
function trackerOrbs(actors: readonly RpgActorView[], gameEntries: readonly RpgTrackerEntry[]): RpgTrackerOrb[] {
  const first = actors.find((a) => a.volatile !== null);
  const actorEntries = first === undefined ? [] : trackerEntries(first.trackers, first.volatile?.trackerValues);
  const orbs: RpgTrackerOrb[] = [];
  for (const entry of [...actorEntries, ...gameEntries]) {
    if (!entry.def.pinned || entry.def.shape !== "meter") {
      continue;
    }
    const value = trackerNumber(entry.value ?? undefined);
    if (value === null) {
      continue;
    }
    // The EFFECTIVE ceiling (this carrier's override, else the def default) — the orb arc must describe the
    // ceiling that actually applies to the actor it draws, never the party default (the ONE resolver).
    orbs.push({ key: entry.def.key, label: entry.def.label, value, max: trackerCeiling(entry.def, entry.value ?? undefined), color: entry.def.color });
  }
  return orbs.slice(0, TRACKER_ORB_MAX);
}

/** The ambient sub-view, or null when every ambient field is empty (§2.7 — a null-ambient panel shrinks). */
function ambientView(state: RpgSnapshotState): RpgTrackerView["ambient"] {
  if (state.clock === null && state.weather === null && state.location === "" && state.calendarDate === null) {
    return null;
  }
  return { location: state.location, calendarDate: state.calendarDate, clock: state.clock, weather: state.weather };
}

/** Build the tracker view for a resolved game. `trackersReadOnly` is passed in (the verb resolves it via
 *  `ctx.resolveStateDelivery` for the CP pill; the gather passes its own already-resolved capability so it
 *  doesn't re-resolve — one connection read per turn).
 *
 *  `regenSlotMessageId` (VER-1b) — the assistant slot a REGEN (swipe/reroll) is about to write a NEW variant
 *  onto. The view then projects the state as of BEFORE that slot instead of the head, because the head IS the
 *  abandoned variant's snapshot: a reroll's reminder would otherwise teach the model the beats/state of the
 *  very prose it is being asked to write differently (live-observed: the model's own reasoning wrestled with a
 *  system note describing a moment that hadn't been written yet, and every reroll paraphrased the rejected
 *  one). Absent — the PANEL read and every FRESH turn — resolves the head exactly as before. */
export async function buildTrackerView(ctx: RpgContext, game: RpgGameRow, trackersReadOnly: boolean, regenSlotMessageId?: MessageId): Promise<RpgTrackerView> {
  const state = regenSlotMessageId === undefined ? await currentSnapshotState(ctx, game) : await snapshotStateBeforeSlot(ctx, game, regenSlotMessageId);
  const [roster, sheetRows] = await Promise.all([ctx.resolveRoster(game.chatId), listSheets(ctx.db, game.id)]);
  const defs = game.config.trackers;

  const sheetByKey = new Map<string, RpgSheet>();
  for (const row of sheetRows) {
    const ref = sheetRef(row);
    if (ref !== null) {
      sheetByKey.set(actorRefKey(ref), row.sheet);
    }
  }
  const volatileByKey = new Map<string, RpgActorVolatile>();
  for (const v of state.actorState) {
    volatileByKey.set(actorRefKey(v.actorRef), v);
  }

  const actors = roster.map((r) => {
    const key = actorRefKey(r.actorRef);
    const sheet = sheetByKey.get(key) ?? defaultSheet();
    return actorView(r, sheet, volatileByKey.get(key) ?? null, trackersForCarrier(defs, rosterCarrier(r, sheet)));
  });
  // The scene cast: each present member's carried trackers paired with the readings on its `cast:<key>`
  // volatile row (the SAME actorState plane roster members use — one value home, D108 ruling #2).
  // The CONDITIONS ride the same row (`update_party` writes them on a cast target exactly as it does on a
  // roster one) and have no home on `RpgPresentCharacter`, so they are projected beside the trackers rather
  // than left unreadable behind the volatile plane.
  const castTrackers: Record<string, readonly RpgTrackerEntry[]> = {};
  const castConditions: Record<string, RpgActorVolatile["conditions"]> = {};
  for (const c of state.presentCharacters) {
    const carried = trackersForCarrier(defs, castCarrier(c.key, c.name));
    const volatileRow = volatileByKey.get(`cast:${c.key}`);
    castTrackers[c.key] = trackerEntries(carried, volatileRow?.trackerValues);
    castConditions[c.key] = volatileRow?.conditions ?? [];
  }
  const gameEntries: RpgTrackerEntry[] = gameTrackers(defs).map((def) => ({ def, value: state.trackerValues[def.key] ?? null }));
  const quests: RpgQuestView[] = state.quests.map((q) => ({ id: q.id, name: q.name, status: q.status, description: q.description, objectives: q.objectives }));

  return {
    ambient: ambientView(state),
    actors,
    cast: state.presentCharacters,
    trackerDefs: defs,
    castTrackers,
    castConditions,
    gameTrackers: gameEntries,
    quests,
    // The P5 snapshot-resident plot plane (act rail) — swipe-consistent like every plane here; null until
    // the story authors one (the rail renders nothing — no client-invented acts).
    plot: state.plot,
    // P3 fold — `state.recentEvents` is an append-only durable log (the journal keeps the full record); the
    // reminder read SLICES it to the last N so the steering injection never bloats the prompt with the whole
    // scene history. `keepLast === 0` drops the block entirely. The tail is the most-recent beats (append order).
    recentBeats: keepLastBeats(state.recentEvents, game.config.features.recentBeatsKeepLast),
    trackersReadOnly,
    trackerOrbs: trackerOrbs(actors, gameEntries),
    // The manual-edit-wins lock paths (§12.3) — the presence-key record projected to its key list. The
    // panel renders a pin glyph + Release on a locked field.
    lockedPaths: state.fieldLocks === null ? [] : Object.keys(state.fieldLocks),
  };
}
