// verb: importAsset — the assets-portability IMPORT half (the `PortableEntity.importFile` for the `assets`
// kind; runs FIRST in `PORTABLE_IMPORT_ORDER`, so every blob is live before any entity re-links to it). It
// restores ONE blob into the owner's CAS + `assets` index row UNDER ITS ORIGINAL ID (Option-A re-link).
//
// SECURITY — three belts, all fail-closed to `{ok:false}` (never throws; the delivery core aggregates the
// outcome, one bad file cannot abort the bundle):
//   1. POISON DEFENSE (the load-bearing one): the filename carries the claimed content-hash; we RE-HASH the
//      bytes and reject unless `sha256(bytes) === <hash>`. CAS is content-addressed — this stops a malicious
//      bundle from landing content that does not match its address (poisoning a hash another entity trusts).
//      Parse also re-validates every filename field (hash/id/kind/mime) against boundary primitives.
//   2. CROSS-OWNER ID CLAIM: `assets.id` is a GLOBAL primary key. If the id already exists under a DIFFERENT
//      owner, reject — a bundle cannot claim (or overwrite) another user's asset row / id.
//   3. ID↔CONTENT COLLISION: if the id already exists for THIS owner but bound to DIFFERENT bytes, reject —
//      astronomically rare for random TypeIDs, but a crafted-bundle signal (and a would-be PK overwrite).
// Same id + same owner + same bytes ⇒ idempotent no-op (`created:false`): a re-imported bundle adds nothing.
//
// The restore goes through `storeBlob` (the ONE CAS+row coherence writer — the `assets-single-writer` gate),
// passing the ORIGINAL id as the `candidateId` so the row is keyed by it. `enforceMagic:false`: the mime
// travelled in the (hash-verified) name and blobs include non-sniffable documents (PDF) — the hash belt, not
// a magic re-sniff, is the integrity guarantee here (the trusted-import posture, as `import-character`).

import type {
  PortableEntity,
  PortableFile,
  PortableImportOutcome,
} from "@orb/contracts/portability";
import type { UserId } from "@orb/kit/ids";
import type { AssetsPortabilityContext } from "../contract/portability";
import { loadAssetCasRefById, storeBlob } from "../persistence/queries";
import { hashAssetBytes, parsePortableAssetFilename } from "../substrate/portable-asset-file";

export function createImportAsset(ctx: AssetsPortabilityContext): PortableEntity["importFile"] {
  return async (ownerId: UserId, file: PortableFile): Promise<PortableImportOutcome> => {
    const identity = parsePortableAssetFilename(file.filename);
    if (identity === undefined) {
      return { ok: false, error: `unrecognized assets filename: ${file.filename}` };
    }
    const { hash, id, kind, mime } = identity;

    // Belt 1 — poison defense: the bytes MUST hash to the address the name claims.
    if (hashAssetBytes(file.bytes) !== hash) {
      return { ok: false, error: "content hash does not match the claimed asset address" };
    }

    // Belts 2 + 3 — id-collision checks against any existing row for this global id (un-owner-scoped by
    // design: the id is a global PK, so a foreign owner's row is a real collision, not a miss).
    const existing = await loadAssetCasRefById(ctx.db, id);
    if (existing !== undefined) {
      if (existing.ownerId !== ownerId) {
        return { ok: false, error: "asset id already owned by another user" };
      }
      if (existing.hash !== hash) {
        return { ok: false, error: "asset id already bound to different content" };
      }
      return { ok: true, created: false }; // idempotent re-import: already restored under this id.
    }

    const stored = await storeBlob(ctx.db, ctx.cas, {
      ownerId,
      bytes: file.bytes,
      kind,
      mime,
      candidateId: id,
      now: ctx.now(),
      enforceMagic: false,
    });
    return { ok: true, created: stored.created };
  };
}
