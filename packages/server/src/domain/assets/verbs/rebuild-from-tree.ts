// verb: rebuildFromTree — DISASTER RECOVERY (PD-84): re-derive index rows for orphan blobs by walking +
// hashing the per-user CAS tree. For every blob with no `assets` row: read the bytes, `sniffMime` a
// best-effort mime, and write a fresh row through the coherence writer (`storeBlob` — the single
// `db.insert(assets)`/`cas.putBytes` site, so this respects `assets-single-writer`; the re-put dedup-hits the
// existing blob and only bumps mtime). The caller-supplied `kind` is stamped on every rebuilt row (a rebuild
// targets one kind at a time). Does NOT emit `asset.created` (FLAG[PD-84]: a rebuilt row was never
// `asset.created`-emitted; the embeddings `content_hash` catch-up sweep — PD-53 — re-covers the vectors).
// UN-PRINCIPAL (D20) — an ops/DR surface.

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { sniffMime } from "@orb/kit/image-sniff";
import type { AssetsContext, AssetsService } from "../contract/service";
import { loadOwnerAssetRows } from "../persistence/maintenance";
import { storeBlob } from "../persistence/queries";

export function createRebuildFromTree(ctx: AssetsContext): AssetsService["rebuildFromTree"] {
  return async ({ kind, signal }) => {
    let created = 0;
    let existing = 0;

    for await (const owner of ctx.cas.listOwners()) {
      const ownerId = castId<UserId>(owner);
      const rowHashes = new Set((await loadOwnerAssetRows(ctx.db, ownerId)).map((r) => r.hash));
      for await (const hash of ctx.cas.listHashes(ownerId)) {
        signal?.throwIfAborted();
        if (rowHashes.has(hash)) {
          existing++;
          continue;
        }
        const bytes = await ctx.cas.read(ownerId, hash);
        await storeBlob(ctx.db, ctx.cas, {
          ownerId,
          bytes,
          kind,
          mime: sniffMime(bytes),
          candidateId: ctx.newAssetId(),
          now: ctx.now(),
          enforceMagic: false,
        });
        created++;
      }
    }

    return { created, existing };
  };
}
