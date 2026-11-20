// The tone-role skins a control or badge paints with the roles its `data-tone` stamp resolves (D336).

/** A tint-only tone: the tint fill and the on-tint ink, with no edge, for a panel that sits inside a card and must not draw a second box. */
export const TONE_TINT = "bg-tone-tint text-tone-text-on-tint";

/** A soft tone: the tint fill, the edge and the on-tint ink. */
export const TONE_SOFT = `${TONE_TINT} border border-tone-edge`;

/** An outlined tone: no fill, the edge and the tone ink. */
export const TONE_OUTLINE = "bg-transparent border border-tone-edge text-tone-text";

/** The tint a fill-less tone control takes under the pointer. */
export const TONE_TINT_HOVER = "hover:bg-tone-tint-active hover:text-tone-text-on-tint";

/** The same tint while pressed, so a touch screen, which has no hover, still acknowledges the press where the control's own scale does not. */
export const TONE_TINT_PRESS = "active:bg-tone-tint-active active:text-tone-text-on-tint";
