// `@orb/contracts/embeddings` — the IMAGE-lens axis, promoted here so `@orb/db` can derive its
// `image_embeddings.lens` enum column (it cannot import a server-tier `domain/*/contract/`).
// Scope: only the image subset of the domain's broader `SourceLens` — text lenses (`card-text`/
// `segment`/`digest`) route to distinct tables, not this column, so they aren't re-spelled here.

import { z } from "zod";

/** The two complementary lenses through which an avatar image is embedded, both in the one 1024-dim
 *  space. `image-raw` = pure visual signal, no caption/text influence. `image-captioned` = image bytes
 *  + the generated caption string. Both coexist per asset (`unique(assetId, model, lens)`). */
export const IMAGE_LENSES = ["image-raw", "image-captioned"] as const;

export type ImageLens = (typeof IMAGE_LENSES)[number];

export const imageLensSchema = z.enum(IMAGE_LENSES);

// ── The `index` workload's terminal result (the workloads junk-drawer exit: a workload's result shape is
//    domain↔domain wire, authored by the OWNING domain — embeddings owns the ONE vector write path). ──

/** An embed pass's counts. `skipped` = rows already embedded in the active space (the resumable-by-skip
 *  arm a non-`force` run takes). */
export interface EmbedPassResult {
  readonly embedded: number;
  readonly skipped: number;
}
