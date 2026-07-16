// `@orb/contracts/hub` — the remote-catalog WIRE surface. v1 carries only the gif search/import slice.
// SECURITY: `gifImportParamsSchema.url` is attacker-influenceable — the server re-validates its host
// against the Tenor media-host allowlist before any fetch (SSRF); the wire only proves a syntactic URL.

import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

/** A `character_…` TypeID — the gif-import `subjectCharacterId` association ref. */
export const characterIdSchema = typeIdSchema(ID_PREFIX.character);

const GIF_QUERY_MIN = 1;
const GIF_QUERY_MAX = 200;
const GIF_LIMIT_MIN = 1;
/** Hard ceiling on results per page — the DoS bound on how many external previews one search can pull. */
const GIF_LIMIT_MAX = 50;
const GIF_LIMIT_DEFAULT = 20;

/** `searchGifs` wire params. `limit` is clamped 1..50 (DoS bound); `cursor` is the provider's opaque
 *  continuation token, passed through verbatim. */
export const gifSearchParamsSchema = z.object({
  query: z.string().min(GIF_QUERY_MIN).max(GIF_QUERY_MAX),
  limit: z.number().int().min(GIF_LIMIT_MIN).max(GIF_LIMIT_MAX).default(GIF_LIMIT_DEFAULT),
  cursor: z.string().optional(),
});
export type GifSearchParams = z.infer<typeof gifSearchParamsSchema>;

/** One normalized gif result. `previewUrl` is the small clip the picker renders inline; `fullUrl` is
 *  the import target the server re-validates + fetches. */
export const gifSearchHitSchema = z.object({
  // @orb-gate-ignore no-raw-id an OPAQUE provider (Tenor) item id, not a TypeID/branded entity id — treated as a passthrough string by domain + client, never parsed (mirrors router.ts's requestId exemption).
  id: z.string(),
  previewUrl: z.url(),
  fullUrl: z.url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type GifSearchHit = z.infer<typeof gifSearchHitSchema>;

/** A page of gif results. `nextCursor` (the provider's opaque token) drives "load more"; absent = end. */
export const gifSearchResultSchema = z.object({
  hits: z.array(gifSearchHitSchema),
  nextCursor: z.string().optional(),
});
export type GifSearchResult = z.infer<typeof gifSearchResultSchema>;

/** `importGif` wire params. `url` MUST be a `gifSearchHit.fullUrl` from a prior search — the server
 *  rejects any host outside the Tenor media-host allowlist before fetching. */
export const gifImportParamsSchema = z.object({
  url: z.url(),
  subjectCharacterId: characterIdSchema.optional(),
});
export type GifImportParams = z.infer<typeof gifImportParamsSchema>;

/** Re-export the import result shape from its canonical home — `importGif` returns the created
 *  `gallery_items` view. */
export type { GalleryItemView } from "#assets";
