import type { RowAttribution } from "./attribution.ts";
import type { BubbleDecoration, RowSkin } from "./message-row-variants.ts";

/** The row's identity treatment: the skin's, except that a row whose art slot is the speaker's fallback (echo's
 *  tile, whisper's band) drops the letter chip so the fallback is not shown twice. Ripple's portrait IS its
 *  treatment, so it shows the fallback itself when there is no image. */
export function avatarTreatmentFor(skin: RowSkin, kind: RowAttribution["kind"], decoration: BubbleDecoration | null): ReturnType<RowSkin["avatarTreatment"]> {
  const artIsFallback = decoration?.art?.fallback !== undefined || decoration?.headerBand?.fallback !== undefined;
  return artIsFallback ? "none" : skin.avatarTreatment(kind);
}
