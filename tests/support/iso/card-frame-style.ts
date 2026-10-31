import type { CardFrameStyleTokenName } from "@orb/kit/card-frame";
import { CARD_FRAME_STYLE_TOKEN } from "@orb/kit/card-frame";

/** A style slice every token grammar accepts, one value per member of the closed slice. */
export const IN_RANGE_CARD_FRAME_STYLE: Readonly<Record<CardFrameStyleTokenName, string>> = {
  [CARD_FRAME_STYLE_TOKEN.radius]: "0.5rem",
  [CARD_FRAME_STYLE_TOKEN.monoFamily]: "'Geist Mono', ui-monospace, monospace",
  [CARD_FRAME_STYLE_TOKEN.rootSize]: "125%",
};
