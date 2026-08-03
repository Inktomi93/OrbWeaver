// domain/rpg/verbs/game/populate-from-character — populateFromCharacter (owner ruling 2026-08-01). The HOST
// "read this character's card and fill what they walked in with" doorway: ONE model call over the character
// CARD + the room's OPENING line that establishes the BORN state — the identity sheet (`title`/`level`), the
// starting inventory + purse, and the quests the background already implies.
//
// WHY IT EXISTS AT ALL: `level`/`className` are HAND-ONLY (the `RpgSheet` law — absent from the extraction
// schema and every tool arg, so no turn vehicle can touch them; `patchSheet` is their only other door). That
// law is about PLAY: a model bumping a level off a vibe is progression inflation. It is NOT about BIRTH — a
// host staring at an empty sheet the model may never fill has to type a card's own content back in by hand.
// The owner sanctioned exactly one doorway for those fields, and this verb IS it: host-invoked, button-only,
// per-character, one shot, over a corpus that is authored premise rather than play.
//
// HOST-ONLY, GATED AT THE WRITE/MODEL-CALL BOUNDARY (`resolveHost`) — the `resyncFromStory` gate verbatim: a
// non-member gets leak-free NOT_FOUND, a present non-host member FORBIDDEN, BEFORE any model call (a member
// can never trigger the host-principal call — the principal-laundering hole). The caller IS the host, so
// `params.principal.userId` funds the call; never a params-supplied id.
//
// APPLICABILITY: only a `character` actor has a card. A `user`/`cast` ref is REFUSED (`rpg_actor_has_no_card`),
// as is a character whose card no longer resolves under the room host — the client's disabled button mirrors
// this, and the verb is the authority.
//
// THE TAIL — TWO PLANES, TWO DOORS, ONE FILL-DON'T-OVERWRITE RULE:
//   • the SNAPSHOT half (inventory/wallet/quests) merges through `applyLockedPatch` onto the resolution-ladder
//     head and lands BORN COMMITTED as a HAND ROW (D124 — message-less) — byte-identically to the resync's
//     tail (locks HONORED: a pinned wallet survives).
//   • the SHEET half (`className`/`level`) rides `rpg_sheets` and therefore cannot ride a snapshot patch. It
//     FILLS ONLY WHAT IS UNSET (`className === ""` / `level === null`). The snapshot planes have `fieldLocks`
//     to express "the host owns this"; the sheet has no lock plane, so "already written" IS the pin. A host who
//     dislikes the result edits it — and a second click can never undo that edit.
// An empty round (no writer capability / a card that established nothing) writes NOTHING: no snapshot, no
// sheet row, no emit — the byte-identical non-acting verb.

import type { RpgSheet, RpgSnapshotState } from "@orb/contracts/rpg";
import { DomainOperationError } from "@orb/kit/errors";
import type { CharacterId, ChatId, RpgGameId } from "@orb/kit/ids";
import type { PopulateFromCharacterParams } from "../../contract/params";
import type { RpgContext, RpgPopulateDelta, RpgService } from "../../contract/service";
import { snapshotRowToState } from "../../contract/service";
import { resolveHost } from "../../guard";
import { findSheet, upsertSheet } from "../../persistence/sheets";
import { resolveSnapshotForTurn, writeResyncedSnapshot } from "../../persistence/snapshots";
import { defaultSnapshotState } from "../../substrate/default-state";
import { applyLockedPatch } from "../../substrate/merge";

/** The default sheet a first write merges onto (a missing row = the default sheet, §4.3). Mirrors
 *  `patchSheet`'s own default — verb-to-verb VALUE imports are banned, so each verb spells its own. */
function defaultSheet(): RpgSheet {
  return { className: "", attributes: {}, flavor: "", level: null, trackerGrants: [], trackerRevokes: [] };
}

/** Merge the populate round's sheet half FILL-ONLY: a field the host (or a prior populate) already set is
 *  KEPT. Returns `null` when nothing would change, so the caller writes no row and emits no event. */
function fillSheet(current: RpgSheet, filled: RpgPopulateDelta["sheet"]): RpgSheet | null {
  const className = current.className === "" && filled.className !== undefined ? filled.className : current.className;
  const level = current.level === null && filled.level !== undefined ? filled.level : current.level;
  if (className === current.className && level === current.level) {
    return null;
  }
  return { ...current, className, level };
}

/** The character this round fills. Only a `character` actor carries a card — a `user` (persona) or `cast`
 *  (scene NPC) ref has nothing to read, and running the round on nothing would be a silent no-op the host
 *  reads as a broken button. */
function characterIdOf(params: PopulateFromCharacterParams): CharacterId {
  if (params.actorRef.kind !== "character") {
    throw new DomainOperationError("rpg_actor_has_no_card", "only a character actor can be populated from a card");
  }
  return params.actorRef.characterId;
}

export function createPopulateFromCharacter(ctx: RpgContext): Pick<RpgService, "populateFromCharacter"> {
  async function populateFromCharacter(params: PopulateFromCharacterParams): Promise<void> {
    // HOST GATE at the model-call boundary — a member can never reach the host-principal model call.
    const { game } = await resolveHost(ctx, params.principal, params.chatId);
    const characterId = characterIdOf(params);
    // The caller IS the host (resolveHost enforced it), so the host principal funding the model call is the
    // caller's own userId — NEVER a params-supplied id (no foreign-principal injection).
    const hostUserId = params.principal.userId;

    // The corpus (the injected chat op — rpg reads no chat/character table). A gone card / hostless room is a
    // refusal, not a silent no-op: the host asked for a specific character's card.
    const corpus = await ctx.resolveCardCorpus(game.chatId, characterId);
    if (corpus === null) {
      throw new DomainOperationError("rpg_card_unreadable", "this character's card could not be read for the game's host");
    }

    // The resolution-ladder head the round's inventory/quest writes apply onto (the same base a state round reads).
    const baseRow = await resolveSnapshotForTurn(ctx.db, { id: game.id, chatId: game.chatId });
    const baseState = baseRow === undefined ? defaultSnapshotState() : snapshotRowToState(baseRow);

    // The host-principal model call: resolves the room connection AS THE HOST, one structured round over the
    // card + opening. A capability-absent connection returns an empty delta (a no-op populate).
    const delta = await ctx.runPopulateExtraction({ chatId: game.chatId, hostUserId, targetRef: corpus.name, baseState, corpus });

    await writeSheetHalf(ctx, { gameId: game.id, chatId: game.chatId, characterId, sheet: delta.sheet });
    await writeStateHalf(ctx, { gameId: game.id, chatId: game.chatId, baseState, statePatch: delta.statePatch });
  }
  return { populateFromCharacter };
}

/** The SHEET half: fill-only, row-on-first-write, and silent when the round established nothing new. */
async function writeSheetHalf(
  ctx: RpgContext,
  args: { readonly gameId: RpgGameId; readonly chatId: ChatId; readonly characterId: CharacterId; readonly sheet: RpgPopulateDelta["sheet"] },
): Promise<void> {
  if (args.sheet.className === undefined && args.sheet.level === undefined) {
    return; // the card established no identity — no row, no emit
  }
  const current = (await findSheet(ctx.db, args.gameId, { characterId: args.characterId }))?.sheet ?? defaultSheet();
  const next = fillSheet(current, args.sheet);
  if (next === null) {
    return; // both fields were already the host's — the fill rule kept them (never a clobber)
  }
  const row = await upsertSheet(ctx.db, {
    id: ctx.ids.sheet(),
    gameId: args.gameId,
    characterId: args.characterId,
    userId: null,
    sheet: next,
    now: ctx.now(),
  });
  // The Status roster + the takeover refetch (§4.9).
  ctx.emitBus({ type: "sheetChanged", chatId: args.chatId, sheetId: row.id });
}

/** The SNAPSHOT half: the resync's tail verbatim — locks honored, born committed as a HAND ROW (D124). */
async function writeStateHalf(
  ctx: RpgContext,
  args: { readonly gameId: RpgGameId; readonly chatId: ChatId; readonly baseState: RpgSnapshotState; readonly statePatch: Record<string, unknown> },
): Promise<void> {
  if (Object.keys(args.statePatch).length === 0) {
    return; // nothing established (readonly / model no-op) — no row, no write
  }
  // Merge onto the base — locks HONORED (a populate fills the model plane, never a hand-pin).
  const nextState = applyLockedPatch(
    args.baseState as unknown as Record<string, unknown>,
    args.statePatch,
    args.baseState.fieldLocks,
  ) as unknown as RpgSnapshotState;
  const snapshotId = ctx.ids.snapshot();
  const written = await writeResyncedSnapshot(ctx.db, nextState, { id: snapshotId, gameId: args.gameId, chatId: args.chatId, now: ctx.now() });
  if (!written.ok) {
    // The F1 backstop refused a contract-invalid state — drop the state half and SURFACE it (never a silent
    // vanish; the same observability contract the flush's and the resync's drop honor). A hand write has no
    // variant to name, so the drop reports `variantId: null`.
    ctx.onFlushDropped({ chatId: args.chatId, gameId: args.gameId, variantId: null, reason: written.reason });
    return;
  }
  // The populated snapshot is the new resolved-current head → the whole panel re-resolves (§4.9).
  ctx.emitBus({ type: "snapshotPatched", chatId: args.chatId, snapshotId });
}
