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
