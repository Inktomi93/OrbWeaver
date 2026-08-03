// domain/character/persistence/handoff-copy-write — the character-owned card copy the host-handoff property
// offer executes (stickler 2026-08-03 §5.1). A named exception to "persistence is queries only", the
// `createLinkCharacterAvatars` / `createBulkImportPersonas` shape: chat must mint cards into the NOMINEE's
// library and never touches the `characters` table itself. The WHY (and why not `duplicate`) is in
// `../contract/handoff-copy.ts`; this file is the mechanism.
//
// THE ORDER INSIDE ONE COPY IS THE DESIGN:
//   1. FIND by provenance (`handoff:<chatId>:<sourceId>` under the NOMINEE) — a re-accept after a crash
//      converges on the copy that already exists rather than minting a second library;
//   2. LOAD the source under `fromOwnerId` — the ownership axis is in the WHERE, so a card that is not the
//      old host's is not a candidate and cannot be gifted by naming its id;
//   3. RE-OWN the avatar (the injected `copyAvatar` op — assets are per-owner with a `(owner_id, hash)`
//      dedup, so carrying the source's `avatarAssetId` verbatim would hand the nominee a pointer into a
//      library they cannot read AND GC-root the old host's blob through their card);
//   4. INSERT under a handle free in the nominee's own namespace.
//
// The copies are ORDINARY LIBRARY ROWS from the instant they land — the nominee's own cards, editable,
// deletable, exportable, indistinguishable from a duplicate except for the provenance stamp. That matters
// for the crash arm: mints that land without their room swap are not corruption and need no cleanup sweep.

import type { CharacterHandle, CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { cardContentHash } from "#kit/serde/card";
import type { CharacterHandoffCopyContext, CopyHandoffCards, HandoffCardCopy } from "../contract/handoff-copy.ts";
import { handoffProvenance } from "../contract/handoff-copy.ts";
import { cardTokenSize } from "../substrate/card-tokens.ts";
import { insertCharacter } from "./card.ts";
import { cardOf, findByOwnerImportedFrom, listOwnedCharacterRows, listOwnerHandles } from "./queries.ts";

/** How many handle candidates a copy probes before giving up on the card. The handle is a machine label in
 *  the RECIPIENT's own namespace (nothing addresses a character by it — the `promoteToRoster` mint states the
 *  same rule), so uniquifying it silently loses nothing; the bound exists so a pathological library cannot
 *  turn one accept into an unbounded scan. */
const HANDLE_ATTEMPTS = 50;

/** The first `<handle>[-n]` free in the recipient's library, or `null` when every candidate is taken. */
function freeHandle(sourceHandle: CharacterHandle, taken: ReadonlySet<string>): CharacterHandle | null {
  if (!taken.has(sourceHandle)) {
    return sourceHandle;
  }
  for (let n = 2; n <= HANDLE_ATTEMPTS; n += 1) {
    const candidate = castId<CharacterHandle>(`${sourceHandle}-${n}`);
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function createCopyHandoffCards(ctx: CharacterHandoffCopyContext): CopyHandoffCards {
  return async ({ fromOwnerId, toOwnerId, chatId, characterIds }): Promise<readonly HandoffCardCopy[]> => {
    if (characterIds.length === 0) {
      return [];
    }
    const { db } = ctx;
    // FIND BEFORE MINT: one batched provenance read, so a re-accept costs one query and mints nothing.
    // @orb-gate-ignore persistence-no-in-memory-state: query-local provenance→source lookup for ONE call.
    const provenanceOf = new Map(characterIds.map((id) => [handoffProvenance(chatId, id), id]));
    const existing = await findByOwnerImportedFrom(db, toOwnerId, [...provenanceOf.keys()]);
    // @orb-gate-ignore persistence-no-in-memory-state: query-local source→existing-copy result map.
    const already = new Map<CharacterId, CharacterId>();
    for (const match of existing) {
      const sourceId = provenanceOf.get(match.importedFrom);
      if (sourceId !== undefined) {
        already.set(sourceId, match.characterId);
      }
    }
    // The sources that still need minting, loaded UNDER THE OLD HOST — a foreign or deleted id simply does
    // not come back, and its seat falls to the caller's D64 drop.
    const pending = characterIds.filter((id) => !already.has(id));
    const sources = await listOwnedCharacterRows(db, fromOwnerId, pending);
    // @orb-gate-ignore persistence-no-in-memory-state: call-local handle reservation — the copies in THIS
    // accept must not collide with each other, which a per-card re-read of the recipient's library cannot see.
    const taken = new Set(await listOwnerHandles(db, toOwnerId));
    const at = ctx.now();

    // PLAN FIRST, WRITE SECOND. Handle + id assignment is SYNCHRONOUS and ordered so `taken` reserves as it
    // goes — two copies in one accept can never race onto the same per-owner unique handle. Only once every
    // name is claimed does the I/O run, and then it runs in PARALLEL: the writes are independent by
    // construction (distinct fresh ids, distinct reserved handles), so there is nothing left to serialize.
    const plan = sources.flatMap((source) => {
      const handle = freeHandle(source.handle, taken);
      if (handle === null) {
        return [];
      }
      taken.add(handle);
      return [{ source, handle, newId: ctx.newCharacterId() }];
    });

    const minted = await Promise.all(
      plan.map(async ({ source, handle, newId }): Promise<HandoffCardCopy> => {
        const card = cardOf(source);
        const avatarAssetId = source.avatarAssetId === null ? null : await ctx.copyAvatar({ fromOwnerId, toOwnerId, assetId: source.avatarAssetId });
        await insertCharacter(db, {
          ...card,
          avatarAssetId,
          id: newId,
          handle,
          ownerId: toOwnerId,
          contentHash: cardContentHash(card),
          tokenSize: cardTokenSize(card),
          // The render/theme policies are properties of the CARD, not of its owner — a card the old host
          // marked `forbidExternalMedia` must not silently relax because it changed hands (`duplicate`
          // carries them for the same reason).
          forbidExternalMedia: source.forbidExternalMedia,
          trustHtml: source.trustHtml,
          themeOverride: source.themeOverride,
          backgroundOverride: source.backgroundOverride,
          // The provenance stamp IS the idempotency key (`duplicate` deliberately clears provenance; a
          // handoff copy deliberately carries it). `importHash` stays null — there were no import bytes.
          importedFrom: handoffProvenance(chatId, source.id),
          createdAt: at,
        });
        return { sourceCharacterId: source.id, characterId: newId, minted: true };
      }),
    );

    return [...[...already].map(([sourceCharacterId, characterId]) => ({ sourceCharacterId, characterId, minted: false })), ...minted];
  };
}
