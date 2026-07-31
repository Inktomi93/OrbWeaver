// domain/rpg/chat-ops/fork-game — `ChatRpgOps.forkGame` (fork-clones-the-game §3.2). Chat calls this AFTER its
// atomic fork batch commits; rpg clones its whole 6-table vertical from the source game onto the fork through the
// fork's id maps, in ONE `db.batch`, then writes the fork's `metadata.rpg` pointer LAST.
//
// ONE-DIRECTIONAL FLOW: chat OWNS the `forkGame` shape (its front door); rpg SATISFIES it and reaches NO chat
// table — it receives the fork's id maps + the forker's posture as DATA and re-keys its own rows. The pointer
// write is the injected `ctx.setPointer` chat op (rpg never touches `chats.metadata`).
//
// CRASH SAFETY — pointer-write-LAST: the pointer is a client sync SIGNAL (game-ness resolves server-side by the
// `rpg_games` row). Writing it LAST means it only goes live once the game rows exist, so a failure at ANY point
// before it can never leave a DANGLING pointer (a pointer at a game that doesn't exist — the class the `8306a2b9`
// stopgap fixed). A batch failure leaves the fork a valid PLAIN chat (no rows, no pointer); a pointer-write
// failure after the batch leaves rows-but-no-pointer (the client shows a plain chat, healable — never a dangle).
//
// THE SECURITY CORE — host secrets never launder across the member→host transition (§3.6 applied to game data).
// A NON-`readsHidden` forker was a plain member of the source room and never had host-plane access to its
// secrets; forking makes them HOST of the copy, so the clone STRIPS:
//   • `config.lite.steeringNote` → "" (a host-only GM directive `RpgConfigView` never serves to members);
//   • a FOREIGN `gmPresetId` → null (a preset the forker cannot read — else `resolvePresetOverride` would feed
//     the source host's private preset into the forker's own turns, the [[injected-op-caller-gate]] class);
//   • hidden-span prose in snapshot `recentEvents` + journal `content` (the defense-in-depth belt — §1.6
//     recommendation A keeps tracker prose surface-only at the SOURCE, so under A there is nothing to strip;
//     this belt keeps the fork member-safe even if a model ignored the surface-only clause — the SAME
//     `stripHiddenSpans` the fork body-copy already applies, `verbs/fork.ts::copyVariantStmt`).
// A `readsHidden` forker (the source host) copies verbatim — they already read every secret.

import type { RpgGameConfig } from "@orb/contracts/rpg";
import { rpgCheckpoints, rpgGames, rpgJournal, rpgSheets, rpgSnapshots } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import { stripHiddenSpans } from "@orb/kit/content";
import type { MessageId, MessageVariantId, PresetId, RpgGameId, RpgSnapshotId, UserId } from "@orb/kit/ids";
import type { ForkGameArgs, ForkGameResult } from "../../chat";
import type { RpgCheckpointRow, RpgContext, RpgGameRow, RpgJournalRow, RpgSheetRow, RpgSnapshotRow } from "../contract/service";
import { listCheckpoints } from "../persistence/checkpoints";
import { findGameByChat } from "../persistence/games";
import { listAllJournal } from "../persistence/journal";
import { listSheets } from "../persistence/sheets";
import { listSnapshots } from "../persistence/snapshots";

/** Strip the host-only `steeringNote` from a cloned config for a non-host forker (identity for a host forker).
 *  Everything else (statProfile, features, extraction knobs, userMacros) is play-style — member-visible by
 *  design, so it carries. Returns a fresh object (never mutates the parsed source row's config). */
function stripConfigForForker(config: RpgGameConfig, readsHidden: boolean): RpgGameConfig {
  if (readsHidden) {
    return config;
  }
  return { ...config, lite: { ...config.lite, steeringNote: "" } };
}

/** The defense-in-depth belt: strip hidden-class spans from tracker prose for a non-host forker (identity when
 *  nothing is hidden / the forker is the host). `recentEvents` is a `string[]` beat window; each entry is a
 *  stored body fragment the extractor may have quoted, so each runs the SAME `stripHiddenSpans` the body copy
 *  applies. */
function stripBeatsForForker(beats: readonly string[] | null, readsHidden: boolean): readonly string[] | null {
  if (readsHidden || beats === null) {
    return beats;
  }
  return beats.map((b) => stripHiddenSpans(b).content);
}

/** The shared re-key inputs every per-plane copy closes over: the fork's new game id, the id maps, the strip
 *  posture, and the injected clock/mints. Bundled so each helper stays a thin, single-purpose builder. */
interface CloneCtx {
  readonly ctx: RpgContext;
  readonly newGameId: RpgGameId;
  readonly slotIdMap: ReadonlyMap<MessageId, MessageId>;
  readonly variantIdMap: ReadonlyMap<MessageVariantId, MessageVariantId>;
  readonly readsHidden: boolean;
  readonly now: number;
}

/** rpg_sheets — copy ALL rows verbatim (owner ratified: a fork copies all sheets). New id + new gameId; actor
 *  identity (characterId XOR userId) carries — a dropped seat's sheet is invisible-but-preserved, and a
 *  re-invite finds it waiting. Sheet data is member-visible identity (no host secret), so no strip. */
function cloneSheets(cc: CloneCtx, sheets: readonly RpgSheetRow[]): BatchStmt[] {
  return sheets.map((s) =>
    batchStmt(cc.ctx.db.insert(rpgSheets).values({ ...s, id: cc.ctx.ids.sheet(), gameId: cc.newGameId, createdAt: cc.now, updatedAt: cc.now })),
  );
}

/** rpg_snapshots — copy rows whose variant AND message were copied (the fork horizon + D106 floor are respected
 *  BY CONSTRUCTION: the maps only contain copied rows, so a row past the horizon has no entry and is dropped).
 *  Re-key id/gameId/messageId/variantId; state columns verbatim (locks carry — pins are room truth; `committed`
 *  carries as-is — an uncommitted head stays uncommitted). The belt strips `recentEvents` for a non-host forker.
 *  Returns the inserts AND the source→fork snapshot-id map (the checkpoint re-key reads it). */
function cloneSnapshots(cc: CloneCtx, snapshots: readonly RpgSnapshotRow[]): { stmts: BatchStmt[]; snapshotIdMap: Map<RpgSnapshotId, RpgSnapshotId> } {
  const stmts: BatchStmt[] = [];
  const snapshotIdMap = new Map<RpgSnapshotId, RpgSnapshotId>();
  for (const snap of snapshots) {
    const newVariantId = cc.variantIdMap.get(snap.variantId);
    const newMessageId = cc.slotIdMap.get(snap.messageId);
    // A snapshot's variant OR its message not in the fork ⇒ past the horizon (or below the floor) → drop it.
    if (newVariantId === undefined || newMessageId === undefined) {
      continue;
    }
    const newSnapshotId = cc.ctx.ids.snapshot();
    snapshotIdMap.set(snap.id, newSnapshotId);
    stmts.push(
      batchStmt(
        cc.ctx.db.insert(rpgSnapshots).values({
          ...snap,
          id: newSnapshotId,
          gameId: cc.newGameId,
          messageId: newMessageId,
          variantId: newVariantId,
          recentEvents: stripBeatsForForker(snap.recentEvents, cc.readsHidden),
          createdAt: cc.now,
        }),
      ),
    );
  }
  return { stmts, snapshotIdMap };
}

/** rpg_journal — model entries (variantId ≠ null): copy iff the variant was copied (re-key variantId +
 *  sourceMessageId-or-null). Hand entries (variantId = null): copy all (room truth on every lineage),
 *  sourceMessageId re-keyed-or-null. The belt strips `content` for a non-host forker. */
function cloneJournal(cc: CloneCtx, journal: readonly RpgJournalRow[]): BatchStmt[] {
  const stmts: BatchStmt[] = [];
  for (const j of journal) {
    let newVariantId = j.variantId;
    if (j.variantId !== null) {
      const mapped = cc.variantIdMap.get(j.variantId);
      if (mapped === undefined) {
        continue; // a model entry whose swipe was not copied (past the horizon) — drop it.
      }
      newVariantId = mapped;
    }
    const newSourceMessageId = j.sourceMessageId !== null ? (cc.slotIdMap.get(j.sourceMessageId) ?? null) : null;
    stmts.push(
      batchStmt(
        cc.ctx.db.insert(rpgJournal).values({
          ...j,
          id: cc.ctx.ids.journal(),
          gameId: cc.newGameId,
          variantId: newVariantId,
          sourceMessageId: newSourceMessageId,
          content: cc.readsHidden ? j.content : stripHiddenSpans(j.content).content,
          createdAt: cc.now,
        }),
      ),
    );
  }
  return stmts;
}

/** rpg_checkpoints — copy iff its snapshot was copied (re-key snapshotId through the snapshot-id map). The
 *  RESTRICT FK is satisfied by insert order (snapshots are pushed before checkpoints in the batch). */
function cloneCheckpoints(cc: CloneCtx, checkpoints: readonly RpgCheckpointRow[], snapshotIdMap: ReadonlyMap<RpgSnapshotId, RpgSnapshotId>): BatchStmt[] {
  const stmts: BatchStmt[] = [];
  for (const c of checkpoints) {
    const newSnapshotId = snapshotIdMap.get(c.snapshotId);
    if (newSnapshotId === undefined) {
      continue; // its snapshot was past the horizon — the checkpoint has no target in the fork.
    }
    stmts.push(
      batchStmt(
        cc.ctx.db.insert(rpgCheckpoints).values({ ...c, id: cc.ctx.ids.checkpoint(), gameId: cc.newGameId, snapshotId: newSnapshotId, createdAt: cc.now }),
      ),
    );
  }
  return stmts;
}

/** Clone the source chat's game onto the fork (§3.2). No-op (`cloned:false`) for a non-game source: the fork
 *  stays a valid plain chat, no pointer (the stopgap already dropped the copied pointer). Otherwise: one atomic
 *  `db.batch` re-keys every rpg row through the fork's id maps, THEN the pointer write (LAST). */
export async function forkGame(ctx: RpgContext, args: ForkGameArgs): Promise<ForkGameResult> {
  const { sourceChatId, newChatId, slotIdMap, variantIdMap, forker } = args;
  const source = await findGameByChat(ctx.db, sourceChatId);
  if (source === undefined) {
    return { cloned: false }; // a non-game source — the fork stays plain (the correct steady state).
  }

  const newGameId = ctx.ids.game();
  const now = ctx.now();

  // The five source planes (all rows — the clone re-keys + drops by the maps, so it must see the whole set,
  // never a lineage projection).
  const [sheets, snapshots, journal, checkpoints] = await Promise.all([
    listSheets(ctx.db, source.id),
    listSnapshots(ctx.db, source.id),
    listAllJournal(ctx.db, source.id),
    listCheckpoints(ctx.db, source.id),
  ]);

  // gmPresetId carry gate: a FOREIGN preset (one the forker cannot read) never rides into the fork — else the
  // forker's own turns would resolve the source host's private preset (the cross-tenant read the strip closes).
  const gmPresetId = await resolveForkGmPreset(ctx, source.gmPresetId, forker.userId);
  const config = stripConfigForForker(source.config, forker.readsHidden);
  const gameRow: RpgGameRow = {
    ...source,
    id: newGameId,
    chatId: newChatId,
    // Lite is seatless (`gmUserId` always NULL); carry-if-forker-is-holder is a full-mode concern (deferred).
    gmUserId: null,
    gmPresetId,
    config,
    createdAt: now,
    updatedAt: now,
  };

  const cc: CloneCtx = { ctx, newGameId, slotIdMap, variantIdMap, readsHidden: forker.readsHidden, now };
  const snapshotsCopy = cloneSnapshots(cc, snapshots);
  // INSERT ORDER — the FK chain: the game row FIRST; snapshots BEFORE the checkpoints whose RESTRICT FK points
  // at them. Everything else keys the game row only.
  const stmts: BatchStmt[] = [
    batchStmt(ctx.db.insert(rpgGames).values(gameRow)),
    ...cloneSheets(cc, sheets),
    ...snapshotsCopy.stmts,
    ...cloneJournal(cc, journal),
    ...cloneCheckpoints(cc, checkpoints, snapshotsCopy.snapshotIdMap),
  ];

  // ONE atomic batch — every rpg row lands together or none does (a partial clone is never a valid game).
  await ctx.db.batch(batchMany(stmts));

  // POINTER LAST — the crash-safety hinge: the pointer only goes live now that the game rows exist, so no
  // path before here can leave a dangling pointer. `engaged` MIRRORS the cloned config (#40): a fork of a
  // DISENGAGED game is born disengaged (panel hidden, turn assembly clean) — the fork inherits the source's
  // front-door state, never silently re-engaging a game the source turned off.
  await ctx.setPointer(newChatId, { gameId: newGameId, engaged: config.engaged });
  return { cloned: true };
}

/** The gmPresetId carry gate (§3.2 security core). A null source preset carries null. A non-null preset carries
 *  ONLY if the FORKER can read it (owned OR the shared default — `resolvePresetOwned`); a foreign preset the
 *  forker cannot read is dropped to null (never laundered into their turns). A host forker still runs the gate:
 *  a host reads the source's secrets, but a preset the SOURCE host owns is still the source host's private
 *  config — the fork's gmPresetId must reference a preset its NEW host can legally resolve, so the ownership
 *  axis is the forker regardless of `readsHidden`. */
async function resolveForkGmPreset(ctx: RpgContext, sourcePresetId: PresetId | null, forkerUserId: UserId): Promise<PresetId | null> {
  if (sourcePresetId === null) {
    return null;
  }
  const owned = await ctx.resolvePresetOwned(sourcePresetId, forkerUserId);
  return owned ? sourcePresetId : null;
}
