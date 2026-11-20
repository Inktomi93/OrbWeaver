import type { AvatarProps } from "@orb/ui/avatar";

/** The avatar sizes a token sets. */
export const TOKEN_SIZES = ["sm", "md", "lg", "hero"] as const satisfies readonly NonNullable<AvatarProps["size"]>[];

/** A character card's width, the host a `fillPortrait` avatar fills. */
export const CARD_PORTRAIT_WIDTH_PX = 240;

/** Distinct seeds, so the five fallback fills each stand in the grid. */
export const HUE_SEEDS = ["Ada", "Bo", "Cy", "Di", "Eli", "Fay", "Gus", "Hal"] as const;
