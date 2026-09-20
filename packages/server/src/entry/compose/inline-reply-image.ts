// `storeInlineReplyImage` op impl (§6.7), the `materialize-background.ts` sibling — extracted from the
// composition root for the same reason: the belt sequencing and the failure mapping are the interesting part
// and they are unit-testable only in isolation.
//
// A chat model whose `output.modalities ∋ image` answers a turn with pictures. The provider hands them back
// EITHER inline (base64/data-URI) OR as a URL on its own CDN, and that URL is a PROVIDER-RESPONSE-CONTROLLED
// address: it is attacker-influenceable in exactly the way `materializeBackground`'s user-pasted URL is, so it
// takes the identical treatment — the SSRF-safe egress belt with the FULL public-internet firewall (ANY_HOST,
// no `ownerConfiguredEndpoint` exemption), then the magic-sniff belt on the BYTES (never the claimed
// content-type — the avatar-proxy precedent, and the sniffer only yields the five non-executable raster mimes
// so SVG/HTML/text can never pass), then the per-image byte cap. The inline arm skips only the fetch: the same
// sniff and the same cap still run, because "the model sent it" is not provenance.
//
// A refusal is `null`, not a throw. The bytes are already paid for and the turn's PROSE is the product; losing
// one picture must never lose the reply. The engine renders the miss (§6.7's "couldn't save this picture"),
// and the span is simply never emitted — canon then names no asset that does not exist.

import type { GeneratedImage } from "@orb/inference";
import type { AssetId, UserId } from "@orb/kit/ids";
import type { ChatContext } from "#domain/chat";
import type { SafeFetchOptions, SafeFetchResult } from "#infra/network";
import { ANY_HOST, isAllowedImageBuffer, safeFetch } from "#infra/network";

const OK_STATUS_MIN = 200;
const OK_STATUS_MAX = 300;
const BASE64 = "base64";

export interface InlineReplyImageDeps {
  /** `assets.store` bound with `kind:"generated"` + `enforceMagic` + the per-image cap, under the room HOST
   *  (the keystone resolves the id to a real `Principal` — the domain never mints one). */
  readonly storeGenerated: (ownerId: UserId, bytes: Uint8Array, mime: string) => Promise<{ readonly assetId: AssetId }>;
  readonly maxBytes: () => number;
  /** Test seam; defaults to the real `safeFetch`. */
  readonly fetchImpl?: (url: string, options: SafeFetchOptions) => Promise<SafeFetchResult>;
}

/** The provider's payload → raw bytes. Inline base64 decodes; a URL is DOWNLOADED THROUGH THE BELT. `null`
 *  on any refusal — including a payload that carries neither, which is a provider shape we do not model
 *  rather than an empty picture. */
async function materialize(
  image: GeneratedImage,
  maxBytes: number,
  fetchImpl: (url: string, options: SafeFetchOptions) => Promise<SafeFetchResult>,
): Promise<Uint8Array | null> {
  if (image.base64 !== undefined && image.base64.length > 0) {
    return new Uint8Array(Buffer.from(image.base64, BASE64));
  }
  if (image.url === undefined || image.url.length === 0) {
    return null;
  }
  try {
    const res = await fetchImpl(image.url, { allowedHosts: ANY_HOST, method: "GET", maxBytes });
    if (res.status < OK_STATUS_MIN || res.status >= OK_STATUS_MAX) {
      res.dispose?.();
      return null;
    }
    return await res.bytes();
  } catch {
    // Every expected refusal the egress belt raises (scheme / IP-literal / private-range / deadline /
    // non-2xx / byte cap) collapses to "no picture". The belt's own `securityEvent` log already carries the
    // detail; re-raising it here would only put a resolved private address on a chat turn's error path.
    return null;
  }
}

export function createStoreInlineReplyImage(deps: InlineReplyImageDeps): ChatContext["storeInlineReplyImage"] {
  const fetchImpl = deps.fetchImpl ?? safeFetch;
  return async (ownerId: UserId, image: GeneratedImage): Promise<{ readonly assetId: AssetId } | null> => {
    const maxBytes = deps.maxBytes();
    const bytes = await materialize(image, maxBytes, fetchImpl);
    if (bytes === null) {
      return null;
    }
    let mime: string;
    try {
      // The BYTES decide the mime, never `image.mediaType` — a provider claiming `image/png` over an SVG
      // would otherwise put a scriptable document in the owner's CAS behind an `img-src`-trusted origin.
      mime = isAllowedImageBuffer(bytes, { maxBytes }).mime;
    } catch {
      return null;
    }
    const stored = await deps.storeGenerated(ownerId, bytes, mime);
    return { assetId: stored.assetId };
  };
}
