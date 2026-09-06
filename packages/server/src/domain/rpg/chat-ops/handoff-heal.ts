// domain/rpg/chat-ops/handoff-heal — `ChatRpgOps.handoffHealStatements` + `handoffRekeyActors`, the rpg side
// of `chat.acceptHostHandoff`.
//
// ── THE HEAL (F1), unchanged when no offer rides ────────────────────────────────────
// The HOST-HANDOFF twin of the fork's `resolveForkGmPreset` gate: the accept moves room authority to the
// nominee, and from that moment the game's `gmPresetId` is resolved under the NEW host — owner-scoped, via
// `resolvePresetOverride` → `preset.get`. A preset the new host cannot read therefore degrades SILENTLY (the
// lenient-id rule catches the throw and falls back to their default GM voice) while `getConfigView` keeps
// serving them an id they can never inspect: the room's voice changes with zero surfacing and the knob lies.
//
// So the accept NULLS it — conditionally, on the same ownership axis the fork uses: a preset the nominee CAN
// read (owned, or the shared system default) is a legitimate knob and is left alone. No cross-tenant read
// ever occurs on either side of the heal; `resolvePresetOwned` is the injected ownership question, and rpg
// never touches a preset row.
//
// ── THE OFFER ARMS (the copy) ───────────────────────────────────────────────────────────────
// `copyGmPreset` turns the heal from a clear into a GIFT: the departing host's preset is copied into the
// nominee's library (the injected `copyPresetToUser` — preset owns its table) and the knob is re-pointed at
// the copy, so the room keeps the voice it had instead of losing it. The copy is only attempted for a knob
// the nominee CANNOT already read; if it fails to resolve, the clear arm stands. `false` ⇒ byte-identical to
// the pre-offer heal, statement for statement.
//
// `cardCopies` re-keys `rpg_sheets` from the old host's card ids onto the nominee's copies. A sheet is the
// character's durable identity data ("invisible-but-preserved; a re-invite finds it waiting"), so leaving it
// on a card the departed host can delete would hand the transferred room a cast with no sheets the first time
// they cleaned their library.
//
// ── WHY TWO OPS AND NOT ONE ─────────────────────────────────────────────────────────────────────────────
// Everything above is an UPDATE and rides chat's atomic swap batch. The SNAPSHOT-state actor re-key cannot:
// it is a read-modify-write through the hand door (`writeHandState`), which resolves the true head and may
// CLONE FORWARD as a fresh HAND ROW (D124) — a write, not a statement. So it runs AFTER the swap commits,
// the `forkGameOntoFork` posture: degraded-not-broken. A crash between them leaves the room correctly
// transferred with its tracker rows still keyed to the old ids, and a re-run converges (a re-key whose `from`
// is already gone refuses per-actor and changes nothing).

import type { BatchStmt } from "@orb/db/kit";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import type { HandStateHead, HandStateWrite, RpgContext } from "../contract/service.ts";
import { clearGmPresetStatement, findGameByChat, setGmPresetStatement } from "../persistence/games.ts";
import { rekeySheetCharacterStatement } from "../persistence/sheets.ts";
import { writeHandState } from "../snapshot-edit.ts";
import { rekeyActor } from "../substrate/actor-rekey.ts";

/** One source→copy card pairing the handoff minted (the structural shape of chat's `HandoffCardCopy`). */
interface HandoffCardPair {
  readonly sourceCharacterId: CharacterId;
  readonly characterId: CharacterId;
}

/** The GM-preset statement for this transfer: a re-point at the nominee's copy when the offer carries the
 *  preset and the copy resolves, else the built conditional clear. */
async function gmPresetStatements(ctx: RpgContext, game: NonNullable<Awaited<ReturnType<typeof findGameByChat>>>, args: HandoffHealArgs): Promise<BatchStmt[]> {
  if (game.gmPresetId === null) {
    return [];
  }
  if (await ctx.resolvePresetOwned(game.gmPresetId, args.newHostUserId)) {
    return [];
  }
  if (args.copyGmPreset && args.oldHostUserId !== null) {
    const copy = await ctx.copyPresetToUser({ fromOwnerId: args.oldHostUserId, toUserId: args.newHostUserId, presetId: game.gmPresetId });
    if (copy !== null) {
      return [setGmPresetStatement(ctx.db, game.id, copy, ctx.now())];
    }
  }
  return [clearGmPresetStatement(ctx.db, game.id, ctx.now())];
}

/** The call args — chat's `HandoffHealArgs` shape, satisfied structurally (rpg declares its own copy rather
 *  than importing a sibling's type: the foreign-op-shape precedent). */
interface HandoffHealArgs {
  readonly chatId: ChatId;
  readonly newHostUserId: UserId;
  readonly oldHostUserId: UserId | null;
  readonly copyGmPreset: boolean;
  readonly cardCopies: readonly HandoffCardPair[];
}

/** The statements the host-handoff swap must carry for the game rooted at `chatId` — empty for a non-game
 *  chat with no card copies (the overwhelmingly common case). */
export async function handoffHealStatements(ctx: RpgContext, args: HandoffHealArgs): Promise<BatchStmt[]> {
  const game = await findGameByChat(ctx.db, args.chatId);
  if (game === undefined) {
    return [];
  }
  const preset = await gmPresetStatements(ctx, game, args);
  const sheets = args.cardCopies.map((pair) => rekeySheetCharacterStatement(ctx.db, game.id, pair.sourceCharacterId, pair.characterId));
  return [...preset, ...sheets];
}

/** THE NOMINATE-SIDE DISCLOSURE (#1762): would an accepted `copyGmPreset` offer put a preset row in
 *  `nomineeUserId`'s library? It asks {@link gmPresetStatements}' own two questions — is there a knob, and
 *  can the nominee already read it — and answers without writing, because at nominate nobody has consented
 *  to anything yet.
 *
 *  A CEILING, NOT A PROMISE, and deliberately: the copy runs at ACCEPT, so a knob cleared in between, or a
 *  `copyPresetToUser` that cannot resolve the source, degrades to the built CLEAR arm and nothing lands.
 *  Over-promising in that direction is the honest failure — the nominee was told what they were consenting
 *  to and received less; under-promising would be a copy they never saw coming. */
export async function handoffWouldCopyGmPreset(ctx: RpgContext, chatId: ChatId, nomineeUserId: UserId): Promise<boolean> {
  const game = await findGameByChat(ctx.db, chatId);
  if (game === undefined || game.gmPresetId === null) {
    return false;
  }
  return !(await ctx.resolvePresetOwned(game.gmPresetId, nomineeUserId));
}

/** POST-SWAP: move each copied character's tracker row, scene presence and hand PINS from `character:<old>`
 *  onto `character:<new>` (the `promoteActor` mechanism, aimed at a transfer instead of a promotion).
 *
 *  Per-actor refusals are SWALLOWED on purpose: `rekeyActor` refuses when the head carries no row for `from`
 *  (a cast member the game never tracked, or an already-completed re-key on a retried accept) and when the
 *  destination key is already occupied. Neither is an error here — the room has already changed hands, and
 *  raising would turn a completed transfer into a failed call. A no-game chat / an empty pair list writes
 *  nothing at all. */
export async function handoffRekeyActors(ctx: RpgContext, chatId: ChatId, pairs: readonly HandoffCardPair[]): Promise<void> {
  if (pairs.length === 0) {
    return;
  }
  const game = await findGameByChat(ctx.db, chatId);
  if (game === undefined) {
    return;
  }
  // ONE hand-door write that FOLDS every pair, not one write per actor. Two reasons, and both matter: each
  // re-key is a read-modify-write against the true head, so a per-actor loop would have to serialize anyway;
  // and a committed head CLONES FORWARD as a fresh hand row, so N writes would mint N snapshot rows for what
  // is one event. The fold threads each result into the next actor's head, exactly as the sequential
  // loop did, and accumulates the lock delta across the whole set.
  await writeHandState(ctx, game, (head) => foldRekeys(head, pairs));
}

/** Apply every pair's re-key in order against a threaded head, accumulating the lock delta. A pair the head
 *  does not carry (never tracked, or already moved by a prior accept attempt) is SKIPPED, not refused — see
 *  {@link handoffRekeyActors}. */
function foldRekeys(head: HandStateHead, pairs: readonly HandoffCardPair[]): HandStateWrite {
  let current = head;
  const lock: string[] = [];
  const clear: string[] = [];
  for (const { sourceCharacterId, characterId } of pairs) {
    const moved = rekeyActor(current, { kind: "character", characterId: sourceCharacterId }, { kind: "character", characterId });
    if (!moved.ok) {
      continue;
    }
    lock.push(...(moved.locks.lock ?? []));
    clear.push(...(moved.locks.clear ?? []));
    // `head.locks`, NOT `current.locks` — the two are the same value (the fold only ever advances `state`;
    // the lock CHANGES are accumulated into lock/clear above, never folded into the threaded head), and the
    // self-read spelling is a biome landmine: `current = {…, locks: current.locks}` makes biome's type
    // inference recurse on the loop-carried variable until `biome check` on THIS FILE ALONE aborts with a
    // stack overflow (biome 2.5.1; whole-tree runs happen to survive on a bigger worker stack). Do not
    // "restore" the self-read.
    current = { state: moved.state, locks: head.locks };
  }
  return { ok: true, state: current.state, locks: { lock, clear } };
}
