// The outbound-image → Anthropic Messages content-block seam (MA-10), used by the agent-sdk summarize path.
// Bytes ride the shared `NormalizeImageBytes` seam (GIF → first-frame PNG, else PNG-labelled) BEFORE
// base64-encoding — identical to the OpenAI-shaped `data:` URL path, projected onto the Anthropic block
// shape. The block shape is spelled STRUCTURALLY here rather than imported from `@anthropic-ai/sdk`: the
// package does not depend on that SDK (the agent-sdk wire brings its own), and the shape is four fields.

import type { ImageInput } from "@orb/contracts/role-clients";
import { ProviderError } from "../../contract/errors.ts";
import type { AnthImageBlock, AnthImageMediaType } from "../../contract/runtime.ts";
import { ANTH_IMAGE_MEDIA_TYPES } from "../../contract/runtime.ts";
import type { NormalizeImageBytes } from "./image-normalize.ts";

const BASE64 = "base64";
// data:<mime>;base64,<payload> — the only data-URL form our image seam ever emits.
const DATA_URL_RE = /^data:(?<mime>[^;,]+);base64,(?<data>.*)$/s;

/** The four image media types the Anthropic Messages wire accepts — its OWN closed set, spelled here so the
 *  block is assignable to the SDK's `ImageBlockParam` without a cast; anything else is refused up front. */
function anthMediaType(mime: string): AnthImageMediaType {
  const found = ANTH_IMAGE_MEDIA_TYPES.find((candidate) => candidate === mime);
  if (found === undefined) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `the Anthropic wire takes ${ANTH_IMAGE_MEDIA_TYPES.join(", ")} images, not "${mime}"`,
    });
  }
  return found;
}

export async function toAnthImageBlock(image: ImageInput, normalize: NormalizeImageBytes): Promise<AnthImageBlock> {
  if (typeof image === "string") {
    const match = DATA_URL_RE.exec(image);
    if (match?.groups !== undefined) {
      return { type: "image", source: { type: "base64", media_type: anthMediaType(match.groups["mime"] ?? "image/png"), data: match.groups["data"] ?? "" } };
    }
    return { type: "image", source: { type: "url", url: image } };
  }
  const { bytes, mediaType } = await normalize(image);
  return { type: "image", source: { type: "base64", media_type: anthMediaType(mediaType), data: Buffer.from(bytes).toString(BASE64) } };
}
