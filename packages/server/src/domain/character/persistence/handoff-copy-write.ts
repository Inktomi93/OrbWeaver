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
//   3. RE-OWN EVERY CARRIED PICTURE (the injected `copyAsset` op — assets are per-owner with a
//      `(owner_id, hash)` dedup, so carrying a source asset id verbatim would hand the nominee a pointer
//      into a library they cannot read AND GC-root the old host's blob through their card). That is BOTH
//      the avatar and the card's carried BACKGROUND when it is `kind:"asset"` (#1426): the background was
//      the one that used to travel by id, and the ordinary edit verb would have refused the resulting card
//      (`ensureBackgroundOverrideOwned`);
//   4. INSERT under a handle free in the nominee's own namespace, CLAIMING the provenance key in the write
//      itself (#1432) — step 1's read is a fast path, not a lock, so two accepts of one offer racing here
//      would otherwise both see "no copy" and mint two libraries. The loser converges on the winner's row.
//
// The copies are ORDINARY LIBRARY ROWS from the instant they land — the nominee's own cards, editable,
// deletable, exportable, indistinguishable from a duplicate except for the provenance stamp. That matters
// for the crash arm: mints that land without their room swap are not corruption and need no cleanup sweep.

import type { ThemeBackground } from "@orb/contracts/theme";
import { canonicalBackgroundSource } from "@orb/contracts/theme";
import type { AssetId, CharacterHandle, CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { cardContentHash } from "#kit/serde/card";
import type { CharacterHandoffCopyContext, CopyHandoffCards, HandoffCardCopy } from "../contract/handoff-copy.ts";
import { handoffProvenance } from "../contract/handoff-copy.ts";
import { cardTokenSize } from "../substrate/card-tokens.ts";
import { insertCharacterClaimingProvenance } from "./card.ts";
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

/** The carried BACKGROUND, re-owned into the recipient's library (#1426). Only `kind:"asset"` names an
 *  owned row — a `seeded` slug is a static catalog entry every user can read, `none` is nothing, and a
 *  persisted `external` cannot paint at all (BG-C's input-only invariant) — so those three travel verbatim,
 *  exactly as `themeOverride` does. An asset source is re-stored under the recipient (content-addressed, so
 *  identical bytes cost one dedup hit) and only its `assetId` moves; `assetHash`/`mime`/`provenanceUrl`
 *  describe the BYTES, which did not change. A source the op cannot re-own (gone, or never the old host's)
 *  degrades to "no carried background" through the canonical shape rather than leaving a foreign pointer:
 *  the same honest degrade the avatar takes when it lands faceless. */
async function reownBackground(
  ctx: CharacterHandoffCopyContext,
  owners: { readonly fromOwnerId: UserId; readonly toOwnerId: UserId },
  source: ThemeBackground | null,
): Promise<ThemeBackground | null> {
  if (source === null || source.kind !== "asset" || source.assetId.length === 0) {
    return source;
  }
  const assetId = await ctx.copyAsset({ ...owners, assetId: castId<AssetId>(source.assetId), kind: "background" });
  return assetId === null ? canonicalBackgroundSource({ ...source, kind: "none" }) : { ...source, assetId };
}

export function createCopyHandoffCards(ctx: CharacterHandoffCopyContext): CopyHandoffCards {
  return async ({ fromOwnerId, toOwnerId, chatId, characterIds }): Promise<readonly HandoffCardCopy[]> => {
    if (characterIds.length === 0) {
      return [];
    }
    const { db } = ctx;
    // FIND BEFORE MINT: one batched provenance read, so a re-accept costs one query and mints nothing.
    // @orb-waive persistence-no-in-memory-state(Map): query-local provenance→source lookup for ONE call. Ends if it outlives the call.
    const provenanceOf = new Map(characterIds.map((id) => [handoffProvenance(chatId, id), id]));
    const existing = await findByOwnerImportedFrom(db, toOwnerId, [...provenanceOf.keys()]);
    // @orb-waive persistence-no-in-memory-state(Map): query-local source→existing-copy result map. Ends if it outlives the call.
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
    // @orb-waive persistence-no-in-memory-state(Set): call-local handle reservation — the copies in THIS accept must not collide with each other, which a per-card re-read of the recipient's library cannot see. Ends if the reservation outlives the call.
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
      plan.map(async ({ source, handle, newId }): Promise<readonly HandoffCardCopy[]> => {
        const card = cardOf(source);
        const provenance = handoffProvenance(chatId, source.id);
        const [avatarAssetId, backgroundOverride] = await Promise.all([
          source.avatarAssetId === null ? null : ctx.copyAsset({ fromOwnerId, toOwnerId, assetId: source.avatarAssetId, kind: "avatar" }),
          reownBackground(ctx, { fromOwnerId, toOwnerId }, source.backgroundOverride),
        ]);
        const claimed = await insertCharacterClaimingProvenance(
          db,
          {
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
            // …but `interactiveHtml` is DROPPED, and this reverses the leg-1 comment that used to sit here.
            // RULING, #111 leg-3 security pass (2026-08-16), which that comment explicitly deferred to: the
            // top rung is NOT the weaker consent. `trustHtml` widens what markup renders and the renderer
            // still SANITIZES it (no script/iframe/style/`on*` — `@orb/ui/markdown` policy.ts); `interactive`
            // is the ladder's only rung that EXECUTES model-authored code, and it carries a WebRTC beacon no
            // CSP directive can close (`@orb/kit/card-frame` residual R1). A consent that big does not cross
            // an OWNER BOUNDARY silently: the nominee gets a trusted-but-static copy and re-opts-in on a card
            // they now own and can read. Same precedent as the refinery signals below — some things simply do
            // not travel with a handoff. Nothing in the room breaks: those seats keep rendering, one rung
            // lower, until the new host decides. NOT the same call as `duplicate`, which is same-owner.
            interactiveHtml: null,
            themeOverride: source.themeOverride,
            // …but the BACKGROUND is re-owned, not carried by id (step 3 / #1426).
            backgroundOverride,
            // The provenance stamp IS the idempotency key (`duplicate` deliberately clears provenance; a
            // handoff copy deliberately carries it), and the insert CLAIMS it atomically.
            // `importHash` stays null — there were no import bytes.
            importedFrom: provenance,
            // RULING (security pass §3.D, refinery R1): the refinery signals do NOT cross the owner
            // boundary — they are the OLD host's private quality judgement (the analysis may echo their
            // session `guidance`), derived data the new owner regenerates in one run. Every other
            // cross-boundary path already clears them (serde nulls `refinery` on the card wire; only
            // same-owner `duplicate` carries them), so the spread above must not be the one exception.
            refinery: null,
            createdAt: at,
          },
          ctx.bumpStatsCanonVersion,
        );
        if (claimed) {
          return [{ sourceCharacterId: source.id, characterId: newId, minted: true }];
        }
        // A concurrent accept of the same offer won this key. Converge on THEIR copy — the identical answer
        // the sequential re-accept path gives, and the reason `minted` exists (audit trail, not control
        // flow). A key claimed by a row we can no longer read is not reachable: the claim is per-OWNER and
        // this owner is the recipient, so the winner's row is theirs; a deletion in that instant drops the
        // seat to the caller's D64 fallback, exactly like a source card deleted between nominate and accept.
        const [winner] = await findByOwnerImportedFrom(db, toOwnerId, [provenance]);
        return winner === undefined ? [] : [{ sourceCharacterId: source.id, characterId: winner.characterId, minted: false }];
      }),
    );

    return [...[...already].map(([sourceCharacterId, characterId]) => ({ sourceCharacterId, characterId, minted: false })), ...minted.flat()];
  };
}
