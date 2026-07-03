// `@orb/contracts/embeddings` — the IMAGE-lens axis, promoted to contracts so `@orb/db` can derive its
// `image_embeddings.lens` enum column from the ONE canonical tuple (D34).
//
// Why this lives here and not in `domain/embeddings/contract/` (its §7.5 "domain-internal" home): a db
// enum column must constrain the image-lens axis, but `@orb/db` deps are `@orb/kit` + `@orb/contracts` +
// drizzle only — it CANNOT import a server-tier `domain/*/contract/`. Rather than weaken the column to a
// bare `text()` (losing the CHECK + the integrity guarantee), D34 promotes the tuple up the cake into
// contracts: the db column derives + CHECK-enforces it, a `.int` test-mirror pins db === contracts, and
// any tRPC wire `z.enum(IMAGE_LENSES)` derives from the same tuple — one home, no re-spelling
// (`no-inline-union-redecl`).
//
// SCOPE — this namespace owns ONLY the image SUBSET of the domain's broader `SourceLens`. The domain's
// full lens axis is `'card-text' | 'image-raw' | 'image-captioned' | 'segment' | 'digest'`; the text
// lenses (`card-text` / `segment` / `digest`) are NOT a db enum column (they are routed by the `store`
// verb to distinct tables, a pure domain concern) and so are deliberately NOT re-spelled here. Only the
// two IMAGE lenses coexist in ONE column (`image_embeddings.lens`, keyed `unique(assetId, model, lens)`),
// so only they are promoted. `IMAGE_LENSES` is the non-duplicated image subset of `SourceLens`; the
// broader union stays in `domain/embeddings/contract/params.ts` and references these members.

import { z } from "zod";

/** The two complementary lenses through which an avatar IMAGE is embedded, both in the one 1024-dim space
 *  (Qwen3-VL, text↔image cosine-comparable):
 *  - `image-raw` — pure visual signal, NO caption/text influence (image↔image visual similarity / dedupe).
 *  - `image-captioned` — image bytes + the generated caption string (joint vision+text).
 *  Both lenses coexist per asset (the db `unique(assetId, model, lens)` index), so the `lens` column
 *  derives this tuple. Members are the image SUBSET of the domain `SourceLens` (the text lenses
 *  `card-text`/`segment`/`digest` are routed to other tables, not a column — see header). */
export const IMAGE_LENSES = ["image-raw", "image-captioned"] as const;

export type ImageLens = (typeof IMAGE_LENSES)[number];

export const imageLensSchema = z.enum(IMAGE_LENSES);
