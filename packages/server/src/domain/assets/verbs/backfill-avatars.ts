// verb: backfillAvatars — the workload-driven (re)link of staged card PNGs to the flat `characters` row
// (PD-26, D28 — no version table). For each staged card: store its bytes through `storeBlob` (the single
// coherence writer), then link `characters.avatarAssetId` to the stored asset — but ONLY when the stored
// blob's hash matches the card's recorded `importHash` (the whole-file sha-256 the import path stamped on the
// flat row; a mismatch is a wrong/corrupt staging file, counted `mismatched`, never linked). Stores run at
// BOUNDED CONCURRENCY (~8); the links land as ONE batched UPDATE via the `@orb/db/kit` batch helpers.
// `dryRun` reports the population without storing bytes or writing the pointer. UN-PRINCIPAL (D20) — the
// `ownerId` scopes every store + the batched UPDATE.
//
// The pointer WRITE is not assets' to make: `characters.avatarAssetId` belongs to `domain/character`, so the
// links land through the injected `ctx.linkCharacterAvatars` op (character's own persistence helper, wired at
// `entry/compose/assets-character.ts`) — the same shape `domain/import` uses for six domains' canon.

import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import type { AssetsContext } from "../context";
import type { BackfillCard } from "../contract/maintenance";
import type { AssetsService } from "../contract/service";
import { storeBlob } from "../persistence/queries";

/** Bounded store fan-out — 8 concurrent `storeBlob` calls per wave (the CAS write + the index upsert are the
 *  cost; a small pool keeps the DB/FS pressure sane without serializing). */
const CONCURRENCY = 8;
const CARD_MIME = "image/png";

interface LinkCandidate {
  readonly characterId: CharacterId;
  readonly assetId: AssetId;
}

async function storeCard(ctx: AssetsContext, ownerId: UserId, card: BackfillCard): Promise<LinkCandidate | undefined> {
  const stored = await storeBlob(ctx.db, ctx.cas, {
    ownerId,
    bytes: card.bytes,
    kind: "card",
    mime: CARD_MIME,
    candidateId: ctx.newAssetId(),
    now: ctx.now(),
    enforceMagic: false,
  });
  // Integrity guard: the stored bytes must be the SAME file the flat row recorded (`importHash`), else this
  // staging blob is the wrong/corrupt card — record the mismatch, do NOT link.
  if (stored.hash !== card.importHash) {
    return;
  }
  return { characterId: card.characterId, assetId: stored.assetId };
}

export function createBackfillAvatars(ctx: AssetsContext): AssetsService["backfillAvatars"] {
  return async ({ ownerId, cards, dryRun = false }) => {
    if (dryRun) {
      // Validate-only: nothing is stored (so no hash to compare) — report the scanned population.
      return { scanned: cards.length, linked: 0, mismatched: 0, dryRun: true };
    }

    const links: LinkCandidate[] = [];
    let mismatched = 0;
    for (let i = 0; i < cards.length; i += CONCURRENCY) {
      const wave = cards.slice(i, i + CONCURRENCY);
      // biome-ignore lint/performance/noAwaitInLoops: bounded-concurrency waves — each wave of ~8 stores runs in parallel, then the loop advances; that IS the concurrency bound.
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
      // owning-domain op, never an assets-side UPDATE (AGENTS §2; Tier-1-DB.md §"Cross-tier composition").
      await ctx.linkCharacterAvatars({ ownerId, links });
    }
    return { scanned: cards.length, linked: links.length, mismatched, dryRun: false };
  };
}
