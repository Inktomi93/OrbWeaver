// domain/hub/contract/params — every verb's *Params, declared ONCE (§7.4). The wire shapes live in
// `@orb/contracts/hub` (validated at the transport boundary); here they intersect the acting `Principal`
// the entry seam resolves. v1 is the gif slice only (D61 doc 02 §5); card-hub verbs land with H2+.

import type { GifImportParams, GifSearchParams } from "@orb/contracts/hub";
import type { Principal } from "@orb/contracts/identity";

/** Common to every hub verb: the acting principal (`principal.userId` scopes the credential + ownership). */
interface HubActorParams {
  readonly principal: Principal;
}

/** `searchGifs` input — the wire params + the acting principal (whose gif-search key is resolved). */
export type SearchGifsParams = GifSearchParams & HubActorParams;

/** `importGif` input — the wire params + the acting principal (owner of the stored asset + gallery row). */
export type ImportGifParams = GifImportParams & HubActorParams;
