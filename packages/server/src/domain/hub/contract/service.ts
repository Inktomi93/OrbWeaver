// domain/hub/contract/service — the typed API surface (read THIS to know everything the leaf does). Holds
// the explicit DI bundle (`HubContext`), the injected-op TYPES (hub declares the type; `entry/` binds the
// impl over infra/sibling front doors — the `credentials.fetchModels` precedent), and the verb interface.
//
// v1 = the gif slice ONLY (D61 gallery-design §5 migrated here per doc 02 §5). `domain/hub` owns NO tables
// (no `@orb/db` import — the no-tables claim is structural); a gif import writes the EXISTING `assets` CAS +
// `gallery_items` via injected ops. Every outbound fetch is a compose-bound infra op — the domain NEVER
// spells global `fetch`/undici (the sealed-executor line). The Tenor host allowlist + the image guard live
// INSIDE those ops (infra/network/gif-search); the domain sees only normalized shapes + a plaintext key.

import type { GalleryItemView, GifSearchResult } from "@orb/contracts/hub";
import type { Principal } from "@orb/contracts/identity";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import type { ImportGifParams, SearchGifsParams } from "./params";

/** The Tenor search adapter op (`infra/network/searchTenorGifs`). The resolved `apiKey` is threaded by the
 *  verb (from `resolveGifKey`); the op knows Tenor's URL grammar + response mapping, the domain does not. */
export type SearchGifsAdapterOp = (args: {
  readonly apiKey: string;
  readonly query: string;
  readonly limit: number;
  readonly cursor?: string | undefined;
}) => Promise<GifSearchResult>;

/** The Tenor image fetch+guard op (`infra/network/fetchTenorGifImage`). FAIL-CLOSED host allowlist + the
 *  magic/dimension guard live inside it; it throws on a bad host / non-2xx / rejected buffer. Returns the
 *  validated bytes + the sniffed mime the verb stamps on `storeAsset`. */
export type FetchGifImageOp = (
  url: string,
) => Promise<{ readonly bytes: Uint8Array; readonly mime: string }>;

/** Resolve the acting principal's `gif-search` (Tenor) key (`credentials.resolveGifSearchKey`) — `null`
 *  when the user has no live credential (the verb surfaces the no-credential floor). */
export type ResolveGifKeyOp = (principal: Principal) => Promise<string | null>;

/** Store validated gif bytes as a `"gallery"`-kind CAS asset (`assets.store` bound with `kind:"gallery"` +
 *  `enforceMagic:true` + the import byte cap). Owner = the acting principal. */
export type StoreGalleryAssetOp = (args: {
  readonly principal: Principal;
  readonly bytes: Uint8Array;
  readonly mime: string;
}) => Promise<{ readonly assetId: AssetId }>;

/** Curate a stored asset into the gallery (`assets.addToGallery` bound). Assets re-checks ownership; the
 *  subject character (when given) is also gated EARLY in the verb, before any fetch. */
export type AddToGalleryOp = (args: {
  readonly principal: Principal;
  readonly assetId: AssetId;
  readonly subjectCharacterId?: CharacterId | undefined;
}) => Promise<GalleryItemView>;

/** Owner-scoped character ownership check (`characters.ownerId = ownerId`) — the EARLY leak-free gate in
 *  `importGif` (a foreign/missing subject id rejects NOT_FOUND before spending a fetch; DoS + IDOR). */
export type AssertCharacterOwnedOp = (
  ownerId: UserId,
  characterId: CharacterId,
) => Promise<boolean>;

/**
 * The DI bundle every hub verb closes over (wired at the entry composition root; surfaced through
 * `context.ts`). Explicit interface (not `ReturnType<>`) per §7.4 + the `no-context-returntype` gate. Every
 * field is an injected op — hub sideways-imports no sibling runtime and never imports `infra/network`
 * internals (the ops arrive type-only here).
 */
export interface HubContext {
  readonly searchGifs: SearchGifsAdapterOp;
  readonly fetchGifImage: FetchGifImageOp;
  readonly resolveGifKey: ResolveGifKeyOp;
  readonly storeGalleryAsset: StoreGalleryAssetOp;
  readonly addToGallery: AddToGalleryOp;
  readonly assertCharacterOwned: AssertCharacterOwnedOp;
}

/** What `createHubService` receives — identical to {@link HubContext} (no deps→context transform). */
export type HubServiceDeps = HubContext;

/**
 * The hub surface. v1 = the two gif verbs (D61 doc 02 §5). Both are owner-scoped off `principal.userId`:
 * `searchGifs` resolves the caller's OWN gif-search key (no cross-user read); `importGif` stores the asset
 * as the caller + gates the subject character on the caller's ownership.
 */
export interface HubService {
  /** Search Tenor for gifs. Resolves the caller's gif-search key (missing ⇒ `DomainNoCredentialError`),
   *  then returns normalized hits (+ the provider's opaque cursor). The `limit` is clamped at the wire. */
  readonly searchGifs: (params: SearchGifsParams) => Promise<GifSearchResult>;
  /** Import one gif into the gallery: gate the subject character (early, leak-free) → fetch the bytes via
   *  the host-gated + magic-validated op → store as a `"gallery"` asset → curate. Returns the gallery view.
   *  A bad host / non-image / oversized buffer rejects (`hub_rejected_content`); nothing reaches the store. */
  readonly importGif: (params: ImportGifParams) => Promise<GalleryItemView>;
}
