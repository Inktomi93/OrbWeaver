// domain/embeddings/substrate/image-space-degrade — one root's announce latch for the joint-space fallback (§10-3),
// mirroring `avatar-analysis-availability`'s announce gate and for the same reason.
//
// WHAT IT MAKES AUDIBLE. Until §10-3 an owner with no image-capable embedder had every picture DROPPED by
// the indexer behind a debug line — their images were simply never searchable and nothing said so
// at any level anyone reads. The fallback fixes the behaviour (the caption is embedded as text, so the
// picture is findable); this makes the DEGRADE itself a WARN, because "your pictures are indexed by their
// caption only" is a real reduction in retrieval quality and a user can fix it by binding an image embedder.
//
// LATCHED PER (owner, space, cause), never per asset: the verdict is a fact about the owner's BINDING, not
// about the image, so a 350-image sweep must not emit 350 identical lines. Re-binding changes the space tag
// and therefore the key, so the new state announces itself once — the same "a re-point gets its own first
// say" rule the availability latch is built on. One latch per composition root; a restart re-announces.

import { getLog } from "#foundation/observability";
import type { ReportImageSpaceDegrade } from "../contract/service.ts";

/** A root's degrade reporter: says ONCE, per owner + space + cause, that this owner's images are being indexed by
 *  their caption alone. The message names the cause AND the fix, because the user can act on both. The on-write
 *  handler and the bulk sweep both call it, so the two paths cannot describe the same state differently. */
export function createImageSpaceDegradeReport(): ReportImageSpaceDegrade {
  // `${ownerId}|${space}|${cause}` keys this root has already announced.
  const announced = new Set<string>();
  return (ownerId, space, cause, logger): void => {
    const key = `${ownerId}|${space}|${cause}`;
    if (announced.has(key)) {
      return;
    }
    announced.add(key);
    getLog(logger).warn(
      { ownerId, space, cause },
      "embeddings indexer: no image-capable embedder for this owner - images are indexed by their CAPTION only, in the text embed space (the image-raw lens is unavailable and visual similarity will be weaker). Bind an imageEmbed connection whose model accepts image input to restore the joint lens.",
    );
  };
}
