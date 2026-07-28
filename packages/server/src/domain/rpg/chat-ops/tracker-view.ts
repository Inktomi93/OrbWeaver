// domain/rpg/chat-ops/tracker-view — the SHARED tracker-view projection (rpg-design/05 §4.8). Resolves the
// CURRENT snapshot (or the synthesized default for a turnless game) and projects roster ∪ sheets (§4.3) against
// the injected roster into the `RpgTrackerView` the CP client renders AND the gather's steering reminder reads.
// PRINCIPAL-FREE: the member gate lives in the `getTrackerView` VERB (`resolveMember`); the GATHER is internal
// to a turn chat already gated, so it consumes this projection directly (the `getMembership`/gather-is-gated
// precedent). Every plane reads the SAME resolved-current snapshot, so a swipe re-resolves the whole panel
// consistently. Homed in the `chat-ops/` subsystem (NOT `verbs/read/` — the `domain-no-cross-verb` rule bans a
// verb importing another verb's value) so the `getTrackerView` verb and the gather share ONE projection.

import type {
  RpgActorRef,
  RpgActorView,
  RpgActorVolatile,
  RpgPoolOrb,
  RpgQuestView,
  RpgSheet,
  RpgSnapshotState,
  RpgTrackerView,
  RpgWidgetView,
} from "@orb/contracts/rpg";
import { actorRefKey } from "@orb/contracts/rpg";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { RpgContext, RpgGameRow } from "../contract/service";
import { listSheets } from "../persistence/sheets";
import { listWidgets } from "../persistence/widgets";
import { currentSnapshotState } from "../snapshot-edit";

const POOL_ORB_COUNT = 3;

/** The default sheet a roster actor with no row renders (§4.3 — a missing row = the default sheet). */
function defaultSheet(): RpgSheet {
  return { className: "", attributes: {}, poolDefs: [], maxHp: null, flavor: "", level: null };
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

/** Project one roster actor onto the tracker view: its sheet (row or default) paired with its volatile state
 *  (from the resolved snapshot's `actorState`, keyed by `actorRefKey`, or null). */
function actorView(entry: { actorRef: RpgActorRef; name: string; avatar?: string }, sheet: RpgSheet, volatile: RpgActorVolatile | null): RpgActorView {
  return {
    actorRef: entry.actorRef,
    name: entry.name,
    ...(entry.avatar !== undefined ? { avatar: entry.avatar } : {}),
    sheet: { className: sheet.className, attributes: sheet.attributes, poolDefs: sheet.poolDefs, maxHp: sheet.maxHp, level: sheet.level },
    volatile,
  };
}

/** The first-3-pools orb derivation (§4.8) — the banner reads the first roster actor's first three pools. */
function poolOrbs(actors: readonly RpgActorView[]): RpgPoolOrb[] {
  const first = actors.find((a) => a.volatile !== null)?.volatile;
  if (!first) {
    return [];
  }
  return first.pools.slice(0, POOL_ORB_COUNT).map((p) => ({ label: p.name, value: p.value, max: p.max }));
}

/** The ambient sub-view, or null when every ambient field is empty (§2.7 — a null-ambient panel shrinks). */
function ambientView(state: RpgSnapshotState): RpgTrackerView["ambient"] {
  if (state.clock === null && state.weather === null && state.location === "" && state.calendarDate === null) {
    return null;
  }
  return { location: state.location, calendarDate: state.calendarDate, clock: state.clock, weather: state.weather };
}

/** Build the tracker view for a resolved game. `trackersReadOnly` is passed in (the verb resolves it via
 *  `ctx.resolveTrackersReadOnly` for the CP pill; the gather passes its own already-resolved capability so it
 *  doesn't re-resolve — one connection read per turn). */
export async function buildTrackerView(ctx: RpgContext, game: RpgGameRow, trackersReadOnly: boolean): Promise<RpgTrackerView> {
  const state = await currentSnapshotState(ctx, game);
  const [roster, sheetRows, widgetRows] = await Promise.all([ctx.resolveRoster(game.chatId), listSheets(ctx.db, game.id), listWidgets(ctx.db, game.id)]);

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

  const actors = roster.map((r) => actorView(r, sheetByKey.get(actorRefKey(r.actorRef)) ?? defaultSheet(), volatileByKey.get(actorRefKey(r.actorRef)) ?? null));
  const widgets: RpgWidgetView[] = widgetRows.map((w) => {
    const raw = state.widgetValues[w.label];
    const value: RpgWidgetView["value"] =
      raw === undefined
        ? null
        : {
            ...(raw.value !== undefined ? { value: raw.value } : {}),
            ...(raw.max !== undefined ? { max: raw.max } : {}),
            ...(raw.items !== undefined ? { items: raw.items } : {}),
          };
    return { def: { type: w.type, label: w.label, icon: w.icon, position: w.position, accent: w.accent, sort: w.sort, binding: w.binding }, value };
  });
  const quests: RpgQuestView[] = state.quests.map((q) => ({ id: q.id, name: q.name, status: q.status, description: q.description, objectives: q.objectives }));

  return {
    ambient: ambientView(state),
    actors,
    cast: state.presentCharacters,
    // The host-defined tracked cast-field schemas (§2.8) — the Scene tab + reminder join them against each cast
    // member's `customFields` record to render meters/text kind-aware. One home (game config); no per-row copy.
    castFields: game.config.features.castFields,
    widgets,
    quests,
    recentBeats: state.recentEvents,
    trackersReadOnly,
    poolOrbs: poolOrbs(actors),
  };
}
