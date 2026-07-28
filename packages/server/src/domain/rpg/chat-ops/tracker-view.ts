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
/** The orb-row envelope (§4.11 #5) — the band fits at most this many orbs at the 17rem floor (auto-3 +
 *  the coin disc + up to a few pins). Caps `auto ∪ pinned` so a host over-pinning can't crush the row. */
const POOL_ORB_MAX = 6;

/** Slice the durable append-only `recentEvents` log to the last N for the reminder (P3 fold — `keepLast === 0`
 *  drops the block; the durable log is untouched, the journal keeps the full record). */
function keepLastBeats(beats: readonly string[], keepLast: number): readonly string[] {
  return keepLast <= 0 ? [] : beats.slice(-keepLast);
}

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

/** The pool MAX has ONE authoritative home: `sheet.poolDefs[].max` (the mechanical dial the host/player
 *  edits by hand — §4.3, sheet.ts "the lite-live mechanical dials the volatile plane's VALUES track
 *  against"). The volatile `pools[].max` is a mint-time cache the model NEVER writes (`update_party` sends
 *  only `poolDeltas` = name + signed VALUE delta), so it drifts the moment the def max is hand-edited on
 *  the Sheet tab. This projection makes the def the single source: every displayed pool's `max` is resolved
 *  from its matching poolDef (by name), and the value is clamped to that max — so the Status meter and the
 *  Sheet read the SAME number no matter which tab last touched it. A pool with no matching def (an orphan
 *  from a since-deleted def, or a model-minted pool the host never defined) keeps its own volatile max —
 *  honest, never a phantom clamp to a max that doesn't exist. */
function resolveVolatile(volatile: RpgActorVolatile | null, poolDefs: readonly RpgSheet["poolDefs"][number][]): RpgActorVolatile | null {
  if (volatile === null || volatile.pools.length === 0) {
    return volatile;
  }
  const maxByName = new Map(poolDefs.map((d) => [d.name, d.max]));
  return {
    ...volatile,
    pools: volatile.pools.map((pool) => {
      const defMax = maxByName.get(pool.name);
      if (defMax === undefined) {
        return pool;
      }
      // Def wins the max; the value clamps down when a hand-lowered def max fell below it (the §12.3
      // lower-max-drags-value tell, applied read-side so BOTH edit paths land the same displayed value).
      return { ...pool, max: defMax, value: Math.min(pool.value, defMax) };
    }),
  };
}

/** Project one roster actor onto the tracker view: its sheet (row or default) paired with its volatile state
 *  (from the resolved snapshot's `actorState`, keyed by `actorRefKey`, or null) — the volatile pools' MAX
 *  resolved from the sheet's poolDefs (the single source of truth, `resolveVolatile`). */
function actorView(entry: { actorRef: RpgActorRef; name: string; avatar?: string }, sheet: RpgSheet, volatile: RpgActorVolatile | null): RpgActorView {
  return {
    actorRef: entry.actorRef,
    name: entry.name,
    ...(entry.avatar !== undefined ? { avatar: entry.avatar } : {}),
    sheet: { className: sheet.className, attributes: sheet.attributes, poolDefs: sheet.poolDefs, maxHp: sheet.maxHp, level: sheet.level },
    volatile: resolveVolatile(volatile, sheet.poolDefs),
  };
}

/** The band-orb derivation (§4.8 + orb-pinning): the first roster actor's first-3 pools UNION the host's
 *  `pinnedOrbs` (by pool name), deduped in `auto-then-pinned` order and capped at the orb-row envelope
 *  (§4.11 #5). A pinned name that isn't one of this actor's pools is silently dropped (it may belong to
 *  another actor / a since-renamed pool — the band shows what exists, never a phantom orb). */
function poolOrbs(actors: readonly RpgActorView[], pinnedOrbs: readonly string[]): RpgPoolOrb[] {
  const first = actors.find((a) => a.volatile !== null)?.volatile;
  if (!first) {
    return [];
  }
  const auto = first.pools.slice(0, POOL_ORB_COUNT).map((p) => p.name);
  const pinnedExtra = pinnedOrbs.filter((name) => !auto.includes(name) && first.pools.some((p) => p.name === name));
  const orderedNames = [...auto, ...pinnedExtra].slice(0, POOL_ORB_MAX);
  const byName = new Map(first.pools.map((p) => [p.name, p]));
  return orderedNames.flatMap((name) => {
    const pool = byName.get(name);
    return pool === undefined ? [] : [{ label: pool.name, value: pool.value, max: pool.max }];
  });
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
    // The P5 snapshot-resident plot plane (act rail) — swipe-consistent like every plane here; null until
    // the story authors one (the rail renders nothing — no client-invented acts).
    plot: state.plot,
    // P3 fold — `state.recentEvents` is an append-only durable log (the journal keeps the full record); the
    // reminder read SLICES it to the last N so the steering injection never bloats the prompt with the whole
    // scene history. `keepLast === 0` drops the block entirely. The tail is the most-recent beats (append order).
    recentBeats: keepLastBeats(state.recentEvents, game.config.features.recentBeatsKeepLast),
    trackersReadOnly,
    poolOrbs: poolOrbs(actors, game.config.features.pinnedOrbs),
    // The manual-edit-wins lock paths (§12.3) — the presence-key record projected to its key list. The
    // panel renders a pin glyph + Release on a locked field.
    lockedPaths: state.fieldLocks === null ? [] : Object.keys(state.fieldLocks),
  };
}
