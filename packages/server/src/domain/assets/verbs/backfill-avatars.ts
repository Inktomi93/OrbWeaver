// verb: backfillAvatars — the workload-driven (re)link of staged card PNGs to the flat `characters` row
// (PD-26, D28 — no version table). For each staged card: store its bytes through `storeBlob` (the single
// coherence writer) — but ONLY when the card's own content hash matches its recorded `importHash` (the
// whole-file sha-256 the import path stamped on the flat row; a mismatch is a wrong/corrupt staging file,
// counted `mismatched`, never stored and never linked) — then link `characters.avatarAssetId` to it. Stores
// run at BOUNDED CONCURRENCY (~8); the links land as ONE batched UPDATE via the `@orb/db/kit` batch helpers.
// `dryRun` forecasts the same link/mismatch split (the hash verdict needs no store) without writing bytes or
// the pointer. UN-PRINCIPAL (D20) — the `ownerId` scopes every store + the batched UPDATE.
//
// The pointer WRITE is not assets' to make: `characters.avatarAssetId` belongs to `domain/character`, so the
// links land through the injected `ctx.linkCharacterAvatars` op (character's own persistence helper, wired at
// `entry/compose/assets-character.ts`) — the same shape `domain/import` uses for six domains' canon.

import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import { sha256Hex } from "#kit/content-hash";
import type { AssetsContext } from "../context.ts";
import type { BackfillCard } from "../contract/maintenance.ts";
import type { AssetsService } from "../contract/service.ts";
import { storeBlob } from "../persistence/queries.ts";

/** Bounded store fan-out — 8 concurrent `storeBlob` calls per wave (the CAS write + the index upsert are the
 *  cost; a small pool keeps the DB/FS pressure sane without serializing). */
const CONCURRENCY = 8;
const CARD_MIME = "image/png";

interface LinkCandidate {
  readonly characterId: CharacterId;
  readonly assetId: AssetId;
}

/** Does this staging file's content hash match the flat row's recorded `importHash`? The whole integrity
 *  verdict, computed from the BYTES — no store required, which is what lets both the real pass reject before
 *  writing and the dry run forecast honestly. Same digest the CAS keys on (`sha256Hex`, D21). */
function matchesImportHash(card: BackfillCard): boolean {
  return sha256Hex(card.bytes) === card.importHash;
}

async function storeCard(ctx: AssetsContext, ownerId: UserId, card: BackfillCard): Promise<LinkCandidate | undefined> {
  // Integrity guard FIRST: the bytes must be the SAME file the flat row recorded (`importHash`), else this
  // staging blob is the wrong/corrupt card — record the mismatch and never store it. Storing before judging
  // left a freshly indexed, unreferenced asset behind on every rejection, for GC to reclaim a grace window
  // later — a write the verb reported as a rejection.
  if (!matchesImportHash(card)) {
    return;
  }
  const stored = await storeBlob(ctx.db, ctx.cas, {
    ownerId,
    bytes: card.bytes,
    kind: "card",
    mime: CARD_MIME,
    candidateId: ctx.newAssetId(),
    now: ctx.now(),
    enforceMagic: false,
  });
  return { characterId: card.characterId, assetId: stored.assetId };
}

export function createBackfillAvatars(ctx: AssetsContext): AssetsService["backfillAvatars"] {
  return async ({ ownerId, cards, dryRun = false }) => {
    if (dryRun) {
      // Validate-only: nothing is stored, but the integrity verdict comes from the bytes, so the forecast is
      // the REAL split the run would produce ("report what WOULD link" — contract/maintenance.ts). A fixed
      // 0/0 forecast reported an all-clear for a population that was entirely mismatched.
      const mismatchedCards = cards.filter((card) => !matchesImportHash(card)).length;
      return { scanned: cards.length, linked: cards.length - mismatchedCards, mismatched: mismatchedCards, dryRun: true };
    }

    const links: LinkCandidate[] = [];
    let mismatched = 0;
    for (let i = 0; i < cards.length; i += CONCURRENCY) {
      const wave = cards.slice(i, i + CONCURRENCY);
      const results = await Promise.all(wave.map((card) => storeCard(ctx, ownerId, card)));
      for (const result of results) {
        if (result === undefined) {
          mismatched++;
        } else {
          links.push(result);
        }
      }
    }

    if (links.length > 0) {
      // The pointer write is CHARACTER's (`characters.avatarAssetId`) — delegated through the injected
      // owning-domain op, never an assets-side UPDATE (Constitution.md §2; Tier-1-DB.md §"Cross-tier composition").
      await ctx.linkCharacterAvatars({ ownerId, links });
    }
    return { scanned: cards.length, linked: links.length, mismatched, dryRun: false };
  };
}
