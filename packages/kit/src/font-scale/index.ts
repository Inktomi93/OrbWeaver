// The appearance font-scale range. It lives in kit because the contracts settings schema, the client slider and
// the card-frame clamp that `@orb/ui` and the server both run all read it, and kit is the one package all reach.

const PERCENT = 100;

/** The legal `UserSettings.appearance.fontScale` range, as a multiplier of the browser's root font size. */
export const FONT_SCALE = { min: 0.8, max: 1.5 } as const;

/** {@link FONT_SCALE} as root font-size percentages: the form an isolated frame document's root size takes. */
export const FONT_SCALE_PERCENT = { min: FONT_SCALE.min * PERCENT, max: FONT_SCALE.max * PERCENT } as const;
