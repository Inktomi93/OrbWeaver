// domain/rpg/chat-ops/fork-game — `ChatRpgOps.forkGame` (fork-clones-the-game §3.2). Chat calls this AFTER its
// atomic fork batch commits; rpg clones FIVE of its six tables from the source game onto the fork through the
// fork's id maps, in ONE `db.batch`, then writes the fork's `metadata.rpg` pointer LAST.
//
// THE SIXTH TABLE IS NOT COPIED: `rpg_turn_tool_calls` has no clone arm here. Not a leak — the
// rows are MEMBER-readable by design (`listTurnToolCalls` is `resolveMember`: "what the model DID on a turn you
// watched"), so copying them would be safe; the fork simply loses its tool record. A product call, boarded.
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
//
// THE CLASSIFICATION LAW (one line, so a future column/config field is decidable without re-deriving §3.6):
// A COLUMN READABLE ONLY THROUGH A HOST-GATED SURFACE DOES NOT SURVIVE THE MEMBER→HOST FORK. A non-host forker
// becomes HOST of the copy, so anything the source room withheld from them as a member must not be recoverable
// through the fork's own host reads. Everything a MEMBER could already read there copies verbatim — the fork
// grants them nothing new. rpg's gate matrix, read off the verbs (rpg has no `ownerId`; authority is chat-FK
// derived, D18/D20): the HOST-only reads are `getConfigView` + `revealHidden`, and NOTHING ELSE — `getGame`,
// `getTrackerView`, `listJournal`, `listCheckpoints`, `listTurnToolCalls` are all `resolveMember`.
//
// THE ENFORCEMENT IS THE SHAPE, NOT THE LIST — two ratchets, because the leak lives at two granularities:
//   • per-PLANE: the five `fork*Values` builders name EVERY column and return `Required<typeof X.$inferInsert>`,
//     so a column added to any rpg table is a MISSING PROPERTY and fails `tsc` until its author classifies it.
//     A spread-and-strip approach (`...row` minus a hand-maintained strip list) defaults a NEW column
//     to COPIED — backwards at a trust boundary (`verbs/fork.ts` guards against the same inversion).
//   • per-CONFIG-FIELD: `rpg_games.config` is ONE column holding a dozen independently-gated fields, so a
//     table-level allow-list is blind inside it. `stripConfigForForker` therefore builds an EXHAUSTIVE
//     `RpgGameConfig`/`RpgGameFeatures` literal (no spread) — a new config field fails `tsc` here too. That
//     blindness is what let three host-plane fields ride: the strip list was written for `steeringNote` and
//     never re-swept when the two hint maps and WAVE MU's `userMacros` landed.
//
// What a NON-`readsHidden` forker's clone strips (each with the surface that proves it host-only):
//   • `config.lite.steeringNote` → "" (a host-only GM directive `RpgConfigView` never serves to members);
//   • `config.userMacros` → [] (the member-gated `chat.getUserMacroPicks` projects game macros as
//     name+description+inputs ONLY — the BODY and `args` are prompt content it deliberately withholds, and a
//     macro declaring no inputs is not projected at all; `getConfigView` is their only caller-facing reader.
//     Dropped WHOLE, the `steeringNote` precedent: a body-less macro that silently expands to "" is worse
//     than an absent one);
//   • `config.features.relationshipHints` + `journalTypeHints` → {} (host-authored steering PROSE, rendered
//     only on the GM console off `getConfigView` and consumed only into the PROMPT — the `steeringNote` class);
//   • a FOREIGN `gmPresetId` → null (a preset the forker cannot read — else `resolvePresetOverride` would feed
//     the source host's private preset into the forker's own turns, the [[injected-op-caller-gate]] class);
//   • snapshot `recentEvents` → THE SOURCE'S MEMBER-VISIBLE WINDOW, `keepLastBeats(log, source keepLast)`
//     (the log is append-only across the whole game, but the only member-gated reader slices it by the
//     host-writable `recentBeatsKeepLast` — so every older beat is host-plane, and `keepLast: 0` means the
//     member read NONE. See {@link stripBeatsForForker} for the full argument and the retracted rationale);
//   • hidden-span prose in the surviving beats + journal `content` (the defense-in-depth belt — §1.6
//     recommendation A keeps tracker prose surface-only at the SOURCE, so under A there is nothing to strip;
//     this belt keeps the fork member-safe even if a model ignored the surface-only clause — the SAME
//     `stripHiddenSpans` the fork body-copy already applies, `verbs/fork.ts::copyVariantStmt`).
// The remaining host-only config fields are SCALARS and COPY (`extractionContext`/`extractionWindowTokens`/
// `reconcileEveryBeats`/`deception`/`omniscience`/`hiddenContentReveal`/`recentBeatsKeepLast`/
// `immersiveHtmlInteractive`/`cardKeepLastX`): no authored prose is representable in an enum or a bounded
// number, and blanking them would silently re-tune the fork's own game for zero secrecy gain (the
// `reasoningEffort`/`maxOutputTokens` carve-out `verbs/fork.ts` makes on the same law). NOTE the asymmetry
// `recentBeatsKeepLast` earns: the KNOB copies (it is a scalar), while the DATA it gated does not — a
// host-only scalar is still a gate over member-visible bytes, and carrying it is not carrying what it hid.
//
// WHY THE D16 FLOOR DOES NOT BITE FURTHER HERE: the window strip already fires for every clamped forker
// (`readsHidden === false` is the superset — a clamped forker is necessarily a non-host, `verbs/fork.ts` F2),
// and the window IS what the source's own member-gated read served that person, floor or no floor:
// `getTrackerView` resolves the current snapshot with NO `resolveHistoryFloorSeq` anywhere in its path.
// Flooring the fork harder would make it carry LESS than the panel showed the same human, and would leave
// the actual question — whether an unclamped tracker view may quote pre-floor turns at all — open in the
// SOURCE, where every member still reads it. That is a member-visibility question, not a fork strip.
// A `readsHidden` forker (the source host) copies verbatim — they already read every secret.

import type { RpgGameConfig, RpgGameFeatures } from "@orb/contracts/rpg";
import { rpgCheckpoints, rpgGames, rpgJournal, rpgSheets, rpgSnapshots } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import { stripHiddenSpans } from "@orb/kit/content";
import type { MessageId, MessageVariantId, PresetId, RpgGameId, RpgSnapshotId, UserId } from "@orb/kit/ids";
import type { ForkGameArgs, ForkGameResult } from "../../chat/index.ts";
import type { RpgCheckpointRow, RpgContext, RpgJournalRow, RpgSheetRow, RpgSnapshotRow } from "../contract/service.ts";
import { listCheckpoints } from "../persistence/checkpoints.ts";
import { findGameByChat } from "../persistence/games.ts";
import { listAllJournal } from "../persistence/journal.ts";
import { listSheets } from "../persistence/sheets.ts";
import { listSnapshots } from "../persistence/snapshots.ts";
import { keepLastBeats } from "./tracker-view.ts";

/** The `rpg_games.config` blob's per-FIELD classification for a non-host forker (identity for a host forker).
 *  EXHAUSTIVE LITERAL, deliberately not a spread: the table-level `Required<…$inferInsert>` ratchet sees one
 *  `config` column and cannot tell that a dozen independently-gated fields live inside it, so this literal is
 *  the ratchet for the blob — a new `RpgGameConfig` field is a missing property and fails `tsc` until its
 *  author decides whether a member could read it. Returns a fresh object (never mutates the parsed source row). */
function stripConfigForForker(config: RpgGameConfig, readsHidden: boolean): RpgGameConfig {
  if (readsHidden) {
    return config;
  }
  return {
    // ── COPIED — member-readable in the source room, so the fork grants nothing new ──────────────────────
    // `engaged` rides `ChatRpgPointer` onto every viewer's `ChatDetail`; `statProfile`/`dateMode` are
    // `getGame`'s `publicConfig`; `trackers` IS `getTrackerView`'s `trackerDefs` (whole, hints included);
    // `extractionMode` is on `getGame`. The three extraction-DEPTH knobs are host-only but scalar (an enum and
    // two bounded numbers — no authored prose is representable, and blanking them re-tunes the fork's own game).
    engaged: config.engaged,
    statProfile: config.statProfile,
    trackers: config.trackers,
    extractionMode: config.extractionMode,
    extractionContext: config.extractionContext,
    extractionWindowTokens: config.extractionWindowTokens,
    reconcileEveryBeats: config.reconcileEveryBeats,
    dateMode: config.dateMode,
    // ── HOST-PLANE — served ONLY behind `getConfigView`'s `resolveHost` ──────────────────────────────────
    // The GM directive. Blanked, never removed: `lite` is a required sub-object and the note has a "" default.
    lite: { steeringNote: "" },
    // NO `prose` KEY — the teach/heading overrides left this blob entirely (PRESET-homed).
    // Nothing to strip here, and the host-plane guarantee is UNCHANGED rather than merely moved: the overrides now
    // live in the GM preset, which rides `resolveForkGmPreset` — a preset the forker cannot READ is dropped to
    // null, so a non-host fork can no more resolve the host's re-authored copy than it could read the preset.
    // WAVE MU: the game's authored macros. The picks pane (`chat.getUserMacroPicks`, member-gated) projects
    // name+description+inputs and WITHHOLDS the body/args as prompt content — so the bodies have no
    // member-gated reader at all, and an input-less macro has no member-visible existence. Dropped WHOLE.
    userMacros: [],
    features: stripFeaturesForForker(config.features),
  };
}

/** The `features` sub-blob's per-field classification for a non-host forker — the same exhaustive-literal
 *  ratchet one level down (a new feature knob fails `tsc` here). Only the two HINT MAPS are host-plane: they
 *  are host-authored steering PROSE (label → gloss) whose only caller-facing reader is `getConfigView` and
 *  whose only consumer is the assembled PROMPT (the reminder's actor line, the delta block, the extraction
 *  ask) — the `steeringNote` class exactly. Every other knob is a boolean/number/enum: member-visible on
 *  `getGame`'s `publicConfig` (`immersiveHtml`/`cyoa`/`cyoaChoiceBehavior`/`plotProgression`) or host-only but
 *  prose-free, where a strip would change the fork's mechanics and disclose nothing. */
function stripFeaturesForForker(features: RpgGameFeatures): RpgGameFeatures {
  return {
    // ── HOST-PLANE ──────────────────────────────────────────────────────────────────────────────────────
    relationshipHints: {},
    journalTypeHints: {},
    // ── COPIED ──────────────────────────────────────────────────────────────────────────────────────────
    deception: features.deception,
    omniscience: features.omniscience,
    hiddenContentReveal: features.hiddenContentReveal,
    recentBeatsKeepLast: features.recentBeatsKeepLast,
    immersiveHtml: features.immersiveHtml,
    immersiveHtmlInteractive: features.immersiveHtmlInteractive,
    cardKeepLastX: features.cardKeepLastX,
    cyoa: features.cyoa,
    cyoaChoiceBehavior: features.cyoaChoiceBehavior,
    plotProgression: features.plotProgression,
  };
}

/** The `recentEvents` strip for a non-host forker — TWO belts, in this order (identity for a host forker):
 *
 *  1. THE WINDOW (the host-plane arm, and the load-bearing one). `rpg_snapshots.recentEvents` is an APPEND-ONLY
 *     durable log spanning the whole game, but the only member-gated reader of it is `getTrackerView`, which
 *     serves `keepLastBeats(log, recentBeatsKeepLast)` — and `recentBeatsKeepLast` is writable ONLY through the
 *     host-gated `updateConfig`. So every beat outside that window has NO member-gated reader in the source
 *     room, and the forker becomes HOST of the copy and may widen the knob at will. `keepLast: 0` is the sharp
 *     arm: the member read ZERO beats, so nothing may cross. The slice uses the SOURCE game's knob, because
 *     that is the value that governed what this forker could actually read. ("Beats are the same distillation
 *     class `listJournal` serves unbounded" is a CLASS argument, and the law is about BYTES behind a gate — the
 *     journal's rows are not these bytes.) It also bounds the D16 arm: the log spans turns below a clamped
 *     member's history floor, and the window is what they were actually shown.
 *  2. THE HIDDEN-SPAN BELT (defense in depth). Each surviving entry is a stored body fragment the extractor may
 *     have quoted, so each runs the SAME `stripHiddenSpans` the body copy applies (§1.6 recommendation A keeps
 *     tracker prose surface-only at the SOURCE, so under A there is nothing here to strip). */
function stripBeatsForForker(beats: readonly string[] | null, keepLast: number, readsHidden: boolean): readonly string[] | null {
  if (readsHidden || beats === null) {
    return beats;
  }
  return keepLastBeats(beats, keepLast).map((b) => stripHiddenSpans(b).content);
}

/** The shared re-key inputs every per-plane copy closes over: the fork's new game id, the id maps, the strip
 *  posture, and the injected clock/mints. Bundled so each helper stays a thin, single-purpose builder. */
interface CloneCtx {
  readonly ctx: RpgContext;
  readonly newGameId: RpgGameId;
  readonly slotIdMap: ReadonlyMap<MessageId, MessageId>;
  readonly variantIdMap: ReadonlyMap<MessageVariantId, MessageVariantId>;
  readonly readsHidden: boolean;
  /** The SOURCE game's `features.recentBeatsKeepLast` — the beat window the source room actually served this
   *  forker (see {@link stripBeatsForForker}). Read off the source config, never the stripped copy: it is the
   *  knob that governed their READ, and only a host could ever have changed it. */
  readonly recentBeatsKeepLast: number;
  readonly now: number;
}

/** rpg_sheets — copy ALL rows (owner ratified: a fork copies all sheets). EVERY column is COPIED: a sheet is
 *  per-actor IDENTITY data and `getTrackerView` (member-gated) projects each roster actor's whole sheet —
 *  className, attributes, flavor, level, grants, revokes. A sheet whose actor is NOT on the roster is projected
 *  nowhere, in the source AND in the fork, so it stays invisible-but-preserved either side of the copy (a
 *  re-invite finds it waiting). Only the keys move: fresh id, the fork's gameId; actor identity (characterId
 *  XOR userId) carries, and the timestamps stamp the copy. */
function forkSheetValues(cc: CloneCtx, s: RpgSheetRow): Required<typeof rpgSheets.$inferInsert> {
  return {
    id: cc.ctx.ids.sheet(),
    gameId: cc.newGameId,
    characterId: s.characterId,
    userId: s.userId,
    sheet: s.sheet,
    createdAt: cc.now,
    updatedAt: cc.now,
  };
}

function cloneSheets(cc: CloneCtx, sheets: readonly RpgSheetRow[]): BatchStmt[] {
  return sheets.map((s) => batchStmt(cc.ctx.db.insert(rpgSheets).values(forkSheetValues(cc, s))));
}

/** rpg_snapshots — the D124 two arms, each with its own horizon rule:
 *  • TURN rows (variant-keyed) copy iff their variant AND message were copied (the fork horizon + D106 floor
 *    are respected BY CONSTRUCTION: the maps only contain copied rows, so a row past the horizon is dropped).
 *  • HAND rows (message-less) ALWAYS copy — they are game state, not story, and the fork inherits the host's
 *    hand edits on every lineage (the `rpg_journal` NULL-variant hand-entry rule, one plane over). Their
 *    `asOfMessageId` re-keys through the SAME `slotIdMap`; an as-of slot that fell below a D106 FLOOR maps to
 *    nothing and degrades to NULL — the row then orders before all visible history, which is exactly right
 *    (state as of pre-baseline IS the baseline posture).
 *  Re-key id/gameId; state columns verbatim (locks carry — pins are room truth; `committed` carries as-is —
 *  an uncommitted head stays uncommitted). The belt strips `recentEvents` for a non-host forker. Returns the
 *  inserts AND the source→fork snapshot-id map (the checkpoint re-key reads it). */
function cloneSnapshots(cc: CloneCtx, snapshots: readonly RpgSnapshotRow[]): { stmts: BatchStmt[]; snapshotIdMap: Map<RpgSnapshotId, RpgSnapshotId> } {
  const stmts: BatchStmt[] = [];
  const snapshotIdMap = new Map<RpgSnapshotId, RpgSnapshotId>();
  for (const snap of snapshots) {
    const keys = forkSnapshotKeys(cc, snap);
    if (keys === null) {
      continue; // a TURN row past the horizon (or below the floor) — its slot/variant is not in the fork.
    }
    const newSnapshotId = cc.ctx.ids.snapshot();
    snapshotIdMap.set(snap.id, newSnapshotId);
    stmts.push(batchStmt(cc.ctx.db.insert(rpgSnapshots).values(forkSnapshotValues(cc, snap, keys, newSnapshotId))));
  }
  return { stmts, snapshotIdMap };
}

/** ONE cloned snapshot's columns. EVERY state column is COPIED: `getTrackerView` is MEMBER-gated and projects
 *  the resolved-current snapshot WHOLE — ambient (clock/calendarDate/location/weather), `presentCharacters` as
 *  `cast`, `actorState` (identity + volatile) as `actors`, `trackerValues`, `quests`, `plot`, and `fieldLocks`
 *  as `lockedPaths`. `committed` is an internal commit-lifecycle bit with no caller-facing reader at all (the
 *  `metadata` precedent one domain over: a server-internal field whose drop would only desync the copy).
 *  `recentEvents` is the one MEMBER-PROJECTED column — the hidden-span belt; its host-only tail beyond
 *  `recentBeatsKeepLast` still copies, because the same distillation class is served to every member unbounded
 *  and unfloored by the member-gated `listJournal`. The keys arrive pre-resolved from {@link forkSnapshotKeys}. */
function forkSnapshotValues(
  cc: CloneCtx,
  snap: RpgSnapshotRow,
  keys: Pick<RpgSnapshotRow, "messageId" | "variantId" | "asOfMessageId">,
  newSnapshotId: RpgSnapshotId,
): Required<typeof rpgSnapshots.$inferInsert> {
  return {
    // ── REMAPPED ────────────────────────────────────────────────────────────────────────────────────────
    id: newSnapshotId,
    gameId: cc.newGameId,
    messageId: keys.messageId,
    variantId: keys.variantId,
    asOfMessageId: keys.asOfMessageId,
    // ── MEMBER-PROJECTED ────────────────────────────────────────────────────────────────────────────────
    recentEvents: stripBeatsForForker(snap.recentEvents, cc.recentBeatsKeepLast, cc.readsHidden),
    // ── COPIED ──────────────────────────────────────────────────────────────────────────────────────────
    clock: snap.clock,
    calendarDate: snap.calendarDate,
    location: snap.location,
    weather: snap.weather,
    presentCharacters: snap.presentCharacters,
    actorState: snap.actorState,
    trackerValues: snap.trackerValues,
    quests: snap.quests,
    plot: snap.plot,
    fieldLocks: snap.fieldLocks,
    committed: snap.committed,
    createdAt: cc.now,
  };
}

/** The re-keyed ARM columns for one cloned snapshot, or `null` when the row does not survive the fork. The
 *  arm is read off the source row (`variantId === null` ⇒ hand), so the CHECK-pinned shape carries verbatim. */
function forkSnapshotKeys(cc: CloneCtx, snap: RpgSnapshotRow): Pick<RpgSnapshotRow, "messageId" | "variantId" | "asOfMessageId"> | null {
  if (snap.variantId === null || snap.messageId === null) {
    return { messageId: null, variantId: null, asOfMessageId: snap.asOfMessageId === null ? null : (cc.slotIdMap.get(snap.asOfMessageId) ?? null) };
  }
  const newVariantId = cc.variantIdMap.get(snap.variantId);
  const newMessageId = cc.slotIdMap.get(snap.messageId);
  if (newVariantId === undefined || newMessageId === undefined) {
    return null;
  }
  return { messageId: newMessageId, variantId: newVariantId, asOfMessageId: null };
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
    stmts.push(batchStmt(cc.ctx.db.insert(rpgJournal).values(forkJournalValues(cc, j, newVariantId, newSourceMessageId))));
  }
  return stmts;
}

/** ONE cloned journal entry's columns. `type`/`label`/`title`/`content` are all COPIED — `listJournal` is
 *  MEMBER-gated and serves exactly those four, so the archive is already member-readable in the source room.
 *  `content` additionally runs the hidden-span BELT (member-projected) for a non-host forker; `title` does not,
 *  because the source's own member read serves it unstripped and the fork must not be the only place a title
 *  differs. Entries on a NON-SELECTED lineage copy too: the fork's canon already carries those variants, and
 *  their unreachability in the source is a WRITE gate (`selectVariant` is author-or-host — an authority over
 *  what the room shows), not a read-secrecy boundary. */
function forkJournalValues(
  cc: CloneCtx,
  j: RpgJournalRow,
  newVariantId: MessageVariantId | null,
  newSourceMessageId: MessageId | null,
): Required<typeof rpgJournal.$inferInsert> {
  return {
    id: cc.ctx.ids.journal(),
    gameId: cc.newGameId,
    variantId: newVariantId,
    sourceMessageId: newSourceMessageId,
    content: cc.readsHidden ? j.content : stripHiddenSpans(j.content).content,
    type: j.type,
    label: j.label,
    title: j.title,
    createdAt: cc.now,
  };
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
    stmts.push(batchStmt(cc.ctx.db.insert(rpgCheckpoints).values(forkCheckpointValues(cc, c, newSnapshotId))));
  }
  return stmts;
}

/** ONE cloned checkpoint's columns. `label` + `trigger` are COPIED: `listCheckpoints` is MEMBER-gated and
 *  returns the ROW, so a host-authored bookmark label is already member-readable in the source (only the
 *  RESTORE is host-gated, and that is an authority over room state, not a read gate). */
function forkCheckpointValues(cc: CloneCtx, c: RpgCheckpointRow, newSnapshotId: RpgSnapshotId): Required<typeof rpgCheckpoints.$inferInsert> {
  return {
    id: cc.ctx.ids.checkpoint(),
    gameId: cc.newGameId,
    snapshotId: newSnapshotId,
    label: c.label,
    trigger: c.trigger,
    createdAt: cc.now,
  };
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
  const gameRow: Required<typeof rpgGames.$inferInsert> = {
    // ── REMAPPED ────────────────────────────────────────────────────────────────────────────────────────
    id: newGameId,
    chatId: newChatId,
    // ── HOST-PLANE / RE-RESOLVED — the two seat knobs ───────────────────────────────────────────────────
    // Lite is seatless (`gmUserId` always NULL); carry-if-forker-is-holder is a full-mode concern (deferred).
    gmUserId: null,
    gmPresetId,
    // The blob carries its OWN per-field classification (see {@link stripConfigForForker}).
    config,
    // ── COPIED ──────────────────────────────────────────────────────────────────────────────────────────
    // `mode` + `status` are both on `getGame` (member-gated). `sessionNumber` is born 1 and never written
    // again in lite; its only reader is the owner-gated `/api/_debug` inspector — a counter, no authored bytes.
    mode: source.mode,
    status: source.status,
    sessionNumber: source.sessionNumber,
    createdAt: now,
    updatedAt: now,
  };

  const cc: CloneCtx = {
    ctx,
    newGameId,
    slotIdMap,
    variantIdMap,
    readsHidden: forker.readsHidden,
    // The SOURCE's window, off the UNSTRIPPED source config (the strip copies the knob through unchanged, so
    // the two agree today — but the source is the one that means "what this forker was shown").
    recentBeatsKeepLast: source.config.features.recentBeatsKeepLast,
    now,
  };
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
