import { TOKENS } from "@orb/ui/tokens";

/** A carried background whose polarity pivot leaves a fixed-colour edge the least room. */
export const CUSTOM_MID_GREY = "oklch(0.6 0 0)";

/** A light-polarity page whose nearest clearing edge would otherwise sit on top of the near-white text field fill. */
export const CUSTOM_LIGHT_MID_TONE = "oklch(0.6599 0.14 30)";

/** An accent that clears the card as authored, so the focus ring is not pulled down to the 3:1 floor the edge also holds. */
export const STRONG_ACCENT = "oklch(0.2 0.1 260)";

/** The shipped app accent a scope with no pick of its own inherits; the clamp corrects it to 3:1 on a mid-grey card. */
export const INHERITED_ACCENT = TOKENS["color.primary"].value;
