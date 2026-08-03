// backends/kit/anth-image-block — the outbound-image → Anthropic Messages content-block seam (MA-10),
// built for the agent-sdk summarize path. Lives in the shared strategy-isolation seam (`backends/kit/`,
// the one dep-cruiser-exempt shared home) rather than inside the sealed backend. Bytes ride the shared `NormalizeImageBytes` seam (GIF →
// first-frame PNG, else PNG-labeled) BEFORE base64-encoding — identical to the OpenRouter `toImageUrl` path,
// only projected onto the Anthropic block shape instead of a `data:` URL.

import type { Base64ImageSource, ImageBlockParam } from "@anthropic-ai/sdk/resources/messages";
import type { ImageInput } from "@orb/contracts/role-clients";
import type { NormalizeImageBytes } from "./image-normalize.ts";

const BASE64 = "base64";
// data:<mime>;base64,<payload> — the only data-URL form our image seam ever emits.
const DATA_URL_RE = /^data:(?<mime>[^;,]+);base64,(?<data>.*)$/s;

/** One outbound image → an Anthropic Messages `image` content block. `Uint8Array` bytes ride the injected
 *  {@link NormalizeImageBytes} seam (GIF → first-frame PNG, else the PNG label the image wires assume) then
 *  base64-encode into a `base64` source; a `data:` URL string splits into its declared mime + payload; any
 *  other string is sent as a `url` source (the provider fetches it). The normalizer's `mediaType` is a
 *  member of the Anthropic media-type union today (always `image/png`); the cast records that contract. */
export async function toAnthImageBlock(image: ImageInput, normalize: NormalizeImageBytes): Promise<ImageBlockParam> {
  if (typeof image === "string") {
    const match = DATA_URL_RE.exec(image);
    if (match?.groups !== undefined) {
      return {
        type: "image",
        source: { type: "base64", media_type: match.groups["mime"] as Base64ImageSource["media_type"], data: match.groups["data"] ?? "" },
      };
    }
    return { type: "image", source: { type: "url", url: image } };
  }
  const { bytes, mediaType } = await normalize(image);
  return {
    type: "image",
    source: { type: "base64", media_type: mediaType as Base64ImageSource["media_type"], data: Buffer.from(bytes).toString(BASE64) },
  };
}
