import { snappedLengthPx, TOKENS } from "@orb/ui/tokens";

const ROOT_FONT_PX = 16;

/** The empty recents body floor (`min-block-(--height-home-recents-empty)`) and its first-boot reservation share one
 *  box: the token, decoded to CSS px at the 16px root for the tile's declared `skeletonBlock`. */
export const RECENTS_EMPTY_BLOCK_PX = snappedLengthPx(TOKENS["height.home-recents-empty"].value, ROOT_FONT_PX) ?? 0;
