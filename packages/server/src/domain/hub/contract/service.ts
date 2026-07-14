// The typed API surface: HubContext (the DI bundle), the injected-op types, and the verb interface. v1 is
// the gif slice only; `domain/hub` owns no tables — a gif import writes the existing `assets` CAS +
// `gallery_items` via injected ops. Every outbound fetch is a compose-bound infra op; the Tenor host
// allowlist + image guard live inside those ops.

import type { GalleryItemView, GifSearchResult } from "@orb/contracts/hub";
import type { Principal } from "@orb/contracts/identity";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import type { ImportGifParams, SearchGifsParams } from "./params";

/** The Tenor search adapter op (`infra/network/searchTenorGifs`). The resolved `apiKey` is threaded by the
 *  verb (from `resolveGifKey`); the op knows Tenor's URL grammar + response mapping, the domain does not. */
type SearchGifsAdapterOp = (args: {
  readonly apiKey: string;
  readonly query: string;
  readonly limit: number;
  readonly cursor?: string | undefined;
}) => Promise<GifSearchResult>;

/** The Tenor image fetch+guard op (`infra/network/fetchTenorGifImage`). FAIL-CLOSED host allowlist + the
 *  magic/dimension guard live inside it; it throws on a bad host / non-2xx / rejected buffer. Returns the
 *  validated bytes + the sniffed mime the verb stamps on `storeAsset`. */
type FetchGifImageOp = (
  url: string,
) => Promise<{ readonly bytes: Uint8Array; readonly mime: string }>;

/** Resolve the acting principal's `gif-search` (Tenor) key (`credentials.resolveGifSearchKey`) — `null`
 *  when the user has no live credential (the verb surfaces the no-credential floor). */
type ResolveGifKeyOp = (principal: Principal) => Promise<string | null>;

/** Store validated gif bytes as a `"gallery"`-kind CAS asset (`assets.store` bound with `kind:"gallery"` +
 *  `enforceMagic:true` + the import byte cap). Owner = the acting principal. */
type StoreGalleryAssetOp = (args: {
  readonly principal: Principal;
  readonly bytes: Uint8Array;
  readonly mime: string;
}) => Promise<{ readonly assetId: AssetId }>;

/** Curate a stored asset into the gallery (`assets.addToGallery` bound). Assets re-checks ownership; the
 *  subject character (when given) is also gated EARLY in the verb, before any fetch. */
type AddToGalleryOp = (args: {
  readonly principal: Principal;
  readonly assetId: AssetId;
  readonly subjectCharacterId?: CharacterId | undefined;
}) => Promise<GalleryItemView>;

/** Owner-scoped character ownership check (`characters.ownerId = ownerId`) — the EARLY leak-free gate in
 *  `importGif` (a foreign/missing subject id rejects NOT_FOUND before spending a fetch; DoS + IDOR). */
type AssertCharacterOwnedOp = (ownerId: UserId, characterId: CharacterId) => Promise<boolean>;

/** The DI bundle every hub verb closes over. Every field is an injected op — hub sideways-imports no
 *  sibling runtime and never imports `infra/network` internals. */
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

/** The hub surface. v1 = the two gif verbs. Both are owner-scoped off `principal.userId`. */
export interface HubService {
  /** Search Tenor for gifs. Resolves the caller's gif-search key (missing ⇒ `DomainNoCredentialError`),
   *  then returns normalized hits (+ the provider's opaque cursor). The `limit` is clamped at the wire. */
  readonly searchGifs: (params: SearchGifsParams) => Promise<GifSearchResult>;
  /** Import one gif into the gallery: gate the subject character (early, leak-free) → fetch the bytes via
   *  the host-gated + magic-validated op → store as a `"gallery"` asset → curate. Returns the gallery view.
   *  A bad host / non-image / oversized buffer rejects (`hub_rejected_content`); nothing reaches the store. */
  readonly importGif: (params: ImportGifParams) => Promise<GalleryItemView>;
}
