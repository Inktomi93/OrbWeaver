// domain/rpg/chat-ops/gather — the game turn's GATHER (rpg-design/05 §4.7 + the delivery-model amendment §4.6).
// Produces the generic gather contribution chat merges STRUCTURALLY: `{ macros, injections, tools }` (chat
// names no rpg type). A non-game chat returns `null` → byte-identical no-op (the existing contract-test
// pattern). PRINCIPAL-FREE: chat already gated the turn's caller; the gather resolves game-ness by the row.
//
// THE CHARACTER TURN IS ALWAYS TOOL-LESS PROSE (owner ruling 2026-07-27). The gather NEVER returns tools:
// state is captured by a DEDICATED STATE ROUND that runs post-commit (`flushTurn`), symmetric across modes —
//   • cheap    — a dedicated TOOL round (`runToolRound`: the 7 state tools, `tool_choice:required`, a
//                `no_changes` escape, enum-constrained args), emitting PARALLEL tool calls in one request.
//   • reliable — a dedicated STRUCTURED-OUTPUT round (`runExtraction`: one json_schema object).
//   • readonly/manual-steering — NO state round; the host hand-edits every plane, and those hand values STILL
//     steer via THIS reminder (the honest degrade is DESIGNED, §4.6 — never a silent mode-downgrade).
// Prose+state in ONE generation is MODE THREE (deferred; a doorway, not built). The reminder always injects
// the tracked state as FLAVOR so the character reacts off it — that part rides every mode.
//
// The reminder reads the SAME `buildTrackerView` projection the CP panel renders, so the injection and the
// panel never drift. `resolveTrackersReadOnly` is the ONE per-turn capability read (already resolved for THIS
// game's `extractionMode` by the integration op) — the gather reuses its verdict, never re-resolving.

import type { ChatInjection } from "@orb/contracts/chat";
import type { RpgSnapshotState } from "@orb/contracts/rpg";
import { actorRefKey } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import type { RpgGatherResult } from "../contract/params";
import type { RpgContext, RpgGameRow } from "../contract/service";
import { snapshotRowToState } from "../contract/service";
import { findGameByChat } from "../persistence/games";
import { resolveTurnSnapshotPair } from "../persistence/snapshots";
import { defaultSnapshotState } from "../substrate/default-state";
import { buildLiteReminder } from "../substrate/reminder";
import { buildRpgMacroFeed } from "./macro-view";
import { buildTrackerView } from "./tracker-view";

export async function gatherTurnContext(ctx: RpgContext, chatId: ChatId): Promise<RpgGatherResult | null> {
  const game: RpgGameRow | undefined = await findGameByChat(ctx.db, chatId);
  if (game === undefined) {
    return null; // non-game chat — byte-identical no-op
  }

  // FLUSH BARRIER (the race fix): block until THIS chat's prior post-turn flush has landed before we read the
  // state the reminder assembles from. The dedicated state round made the flush a real 0.8-2.9s call, so a fast
  // re-send could otherwise read STALE state here (the exec's live-confirmed race). Bounded — a hung flush
  // releases the barrier and the turn proceeds on last-known state (never a deadlocked turn). No in-flight flush
  // (the common case) resolves immediately. This realizes the ratified "one-beat-behind but GUARANTEED" contract.
  await ctx.flushBarrier.awaitInFlight(chatId);

  const trackersReadOnly = await ctx.resolveTrackersReadOnly(chatId);
  const view = await buildTrackerView(ctx, game, trackersReadOnly);
  // The DELTA BLOCK's second ladder read (§2.7): the prev→current snapshot PAIR on the selected lineage. `cur`
  // is the SAME resolution-ladder head the tracker view projects from (a swipe re-selects both ends together —
  // swipe-consistent by construction); `prev` is the snapshot one committed beat back (null on the first
  // snapshot → the delta's first-state arm). A turnless game (no rows) has no `cur` row — the view synthesized
  // the born default, so the reminder's `curSnapshot` mirrors it (`defaultSnapshotState`) with a null prev.
  const { cur, prev } = await resolveTurnSnapshotPair(ctx.db, { id: game.id, chatId });
  const curSnapshot: RpgSnapshotState = cur !== undefined ? snapshotRowToState(cur) : defaultSnapshotState();
  const prevSnapshot: RpgSnapshotState | null = prev !== undefined ? snapshotRowToState(prev) : null;
  // The delta's roster-name map (fold-in #5): `actorRefKey → display name` so per-actor delta lines name roster
  // actors ("Kael HP 12→16", not "character HP 12→16"). Resolved HERE (the gather has `ctx.resolveRoster` reach —
  // the same source `buildTrackerView` reads) and handed to the PURE delta as data (no I/O in the registry).
  const roster = await ctx.resolveRoster(chatId);
  const rosterNames: Record<string, string> = {};
  for (const entry of roster) {
    rosterNames[actorRefKey(entry.actorRef)] = entry.name;
  }
  // The character turn is tool-less prose in every mode — the reminder injects state as FLAVOR only (no
  // tool-update guidance; the char turn is NEVER asked to call a tool, the dedicated post-commit state round
  // does the writing — its checklist prompt is `toolRoundSystem`, entry/compose/rpg.ts).
  const reminder = buildLiteReminder({
    view,
    steeringNote: game.config.lite.steeringNote,
    curSnapshot,
    prevSnapshot,
    relationshipHints: game.config.features.relationshipHints,
    rosterNames,
    // P3 hidden-channel teaching gates (§3.3) — composed into the reminder only when the knob is on.
    deception: game.config.features.deception,
    omniscience: game.config.features.omniscience,
  });

  const injection: ChatInjection = { position: "in_chat", depth: 0, role: "system", content: reminder };

  // The macro + CEL feed (parity-plus §12) — populates `rpgSceneState`/`rpgCast`/`rpgQuests`/`rpgDelta` from the
  // SAME tracker view the reminder + panel read (one projection, three consumers), plus the data-only `rpg` CEL
  // tree so `{{expr::rpg.…}}` reads state on a game turn. A READ mirror, never a write. The delta context mirrors
  // the reminder's (same rosterNames/castFields/relationshipHints) so the `{{rpgDelta}}` macro == the reminder's
  // delta block. Full-mode macros (`rpgMap`/`rpgMorale`/…) are ABSENT from the map ⇒ they resolve "" (honest empty).
  const feed = buildRpgMacroFeed({
    view,
    prevSnapshot,
    curSnapshot,
    deltaContext: { rosterNames, castFields: game.config.features.castFields, relationshipHints: game.config.features.relationshipHints },
  });
  return { macros: feed.macros, injections: [injection], tools: [], celBindings: { rpg: feed.rpg } };
}
