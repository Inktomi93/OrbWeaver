// `@orb/contracts/hub` — the remote-catalog WIRE surface (D61, hub-browse-design). v1 carries ONLY the
// gif search/import slice (gallery-design §5 migrated here per doc 02 §5); the card-hub browse verbs
// (search/preview/import-card) land when H2+ build. Cross-boundary: the client picker renders these hits +
// posts the import, the `domain/hub` verbs validate against them, and the tRPC `hub` router mounts them.
//
// SECURITY posture baked into these shapes:
//   • `gifImportParamsSchema.url` is a provider-authored (Tenor-controlled), therefore attacker-influenceable
//     URL — the server RE-VALIDATES its host against the Tenor media-host allowlist before any fetch
//     (`infra/network/gif-search`), never trusting the client to have passed a safe URL. The wire only
//     proves it is a syntactic URL; the host allowlist is the real gate (SSRF).
//   • search `limit` is clamped 1..50 and import is one-URL-at-a-time — the DoS bound on gif count is at the
//     wire; the per-gif byte + dimension caps are enforced by `isAllowedImageBuffer` at import.
//   • the hit `id`/`cursor` are provider-OPAQUE strings, never parsed outside the adapter.

import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

/** A `character_…` TypeID — the gif-import `subjectCharacterId` association ref (the imported gif is curated
 *  into this character's gallery). Local to hub, mirroring how `@orb/contracts/assets` homes its own copy. */
export const characterIdSchema = typeIdSchema(ID_PREFIX.character);

// ── Bounds (extracted per noMagicNumbers) ─────────────────────────────────────────────────────────────
const GIF_QUERY_MIN = 1;
const GIF_QUERY_MAX = 200;
const GIF_LIMIT_MIN = 1;
/** Hard ceiling on results per page — the DoS bound on how many external previews one search can pull. */
const GIF_LIMIT_MAX = 50;
const GIF_LIMIT_DEFAULT = 20;

/** `searchGifs` wire params. `query` is the user's search text; `limit` is clamped 1..50 (the gif-count DoS
 *  bound); `cursor` is the provider's OPAQUE continuation token, passed through verbatim (no keyset — the
 *  provider owns the ordering). The acting principal is server-side, NEVER on the wire. */
export const gifSearchParamsSchema = z.object({
  query: z.string().min(GIF_QUERY_MIN).max(GIF_QUERY_MAX),
  limit: z.number().int().min(GIF_LIMIT_MIN).max(GIF_LIMIT_MAX).default(GIF_LIMIT_DEFAULT),
  cursor: z.string().optional(),
});
export type GifSearchParams = z.infer<typeof gifSearchParamsSchema>;

/** One normalized gif result. `previewUrl` is the small clip the picker renders inline (an explicit external
 *  load in an owner-only picker — outside D44's message/card `forbidExternalMedia` gate); `fullUrl` is the
 *  import target the server re-validates + fetches. `width`/`height` are the full gif's dimensions. */
export const gifSearchHitSchema = z.object({
  // biome-ignore lint/plugin/no-raw-id: an OPAQUE provider (Tenor) item id, not a TypeID/branded entity id — treated as a passthrough string by domain + client, never parsed (mirrors router.ts's requestId exemption).
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

/** `importGif` wire params. `url` MUST be a `gifSearchHit.fullUrl` from a prior search — the server rejects
 *  any host outside the Tenor media-host allowlist BEFORE fetching (the client cannot steer the fetch off
 *  Tenor). `subjectCharacterId` (optional) curates the imported gif into that character's gallery; ownership
 *  of the character is enforced server-side (a foreign/missing id rejects leak-free before any fetch). */
export const gifImportParamsSchema = z.object({
  url: z.url(),
  subjectCharacterId: characterIdSchema.optional(),
});
export type GifImportParams = z.infer<typeof gifImportParamsSchema>;

/** Re-export the import result shape from its canonical home — `importGif` stores + curates a gif and
 *  returns the created `gallery_items` view (assets owns that shape; hub reaches it via an injected op). */
export type { GalleryItemView } from "#assets";
