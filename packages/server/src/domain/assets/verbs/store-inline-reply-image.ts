// Provider image refusals drop only the picture; the paid-for reply prose remains deliverable.
import type { GeneratedImage } from "@orb/inference";
import type { UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import { ANY_HOST, isAllowedImageBuffer } from "#infra/network";
import type { AssetEgressFetch, InlineReplyImageDeps, StoreInlineReplyImage } from "../contract/materialize.ts";

const OK_STATUS_MIN = 200;
const OK_STATUS_MAX = 300;
const BASE64 = "base64";

/** The provider's payload → raw bytes. Inline base64 decodes; a URL is DOWNLOADED THROUGH THE BELT. `null`
 *  on any refusal — including a payload that carries neither, which is a provider shape we do not model
 *  rather than an empty picture. */
async function materialize(image: GeneratedImage, maxBytes: number, fetchImpl: AssetEgressFetch): Promise<Uint8Array | null> {
  if (image.base64 !== undefined && image.base64.length > 0) {
    return new Uint8Array(Buffer.from(image.base64, BASE64));
  }
  if (image.url === undefined || image.url.length === 0) {
    return null;
  }
  // Every expected refusal the egress belt raises (scheme / IP-literal / private-range / deadline / byte cap)
  // collapses to "no picture". Re-raising it here would only put a resolved private address on a chat turn's
  // error path — the disclosure this whole module exists to prevent.
  try {
    const res = await fetchImpl(image.url, { allowedHosts: ANY_HOST, method: "GET", maxBytes });
    if (res.status < OK_STATUS_MIN || res.status >= OK_STATUS_MAX) {
      res.dispose?.();
      return null;
    }
    return await res.bytes();
  } catch (err) {
    getLog().warn({ err }, "chat: inline reply image download refused; the picture is dropped and the prose commits");
    return null;
  }
}

export function createStoreInlineReplyImage(deps: InlineReplyImageDeps): StoreInlineReplyImage {
  const { fetchImpl } = deps;
  return async (ownerId: UserId, image: GeneratedImage): ReturnType<StoreInlineReplyImage> => {
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
    } catch (err) {
      // UNLIKE the egress arm above, this refusal has no belt behind it: `isAllowedImageBuffer` throws right
      // here, so without this line the only trace of it is the author's generic "the picture didn't save"
      // notice — and a provider systematically answering with SVG/HTML or decompression-bomb dimensions is
      // an OPERATOR signal, not a chat-turn one. The claimed `mediaType` rides along because the interesting
      // fact is the DISAGREEMENT between what the provider claimed and what the bytes are; the bytes
      // themselves never do (they are the refused content). The author is still told by
      // `absorbInlineReplyImages`'s `reply_image_failed` — this is the second owner, not the first.
      getLog(deps.logger).warn(
        { err, claimedMediaType: image.mediaType, bytes: bytes.length },
        "chat: inline reply image refused by the mime/size guard; the picture is dropped and the prose commits",
      );
      return null;
    }
    const stored = await deps.storeGenerated(ownerId, bytes, mime);
    return { assetId: stored.assetId };
  };
}
