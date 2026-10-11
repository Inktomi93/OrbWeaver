import type { BubbleDecoration } from "./art-decorations.ts";
import type { RowAttribution } from "./attribution.ts";
import type { RowSkin } from "./message-row-variants.ts";

/** The row's identity treatment: the skin's, except that a row whose art slot is the speaker's fallback (echo's
 *  tile, whisper's band) drops the letter chip so the fallback is not shown twice, whether the speaker has no
 *  image or the image failed to load. Ripple's portrait IS its
 *  treatment, so it shows the fallback itself when there is no image. */
export function avatarTreatmentFor(
  skin: RowSkin,
  kind: RowAttribution["kind"],
  decoration: BubbleDecoration | null,
  artFailed: boolean,
): ReturnType<RowSkin["avatarTreatment"]> {
  const slot = decoration?.art ?? decoration?.headerBand;
  const artIsFallback = slot !== undefined && (slot.image === undefined || artFailed);
  return artIsFallback ? "none" : skin.avatarTreatment(kind);
}
