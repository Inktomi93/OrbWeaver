// Appearance-panel numeric field bounds — split out of the appearance pane's knob surface, which SET-SEAMS
// stage 1 decomposed into the `appearance-*-section.tsx` fragments that import these (mirrors the
// `lib/appearance-select-items.ts` split: pure data, not JSX, so it belongs beside the surface rather
// than inside it). A second, load-bearing reason for the split: a Playwright CT test that needs these
// constants (never hardcode a slider's min/max as a magic number in an assertion) must import them from
// a NON-JSX module — importing named exports from a `.tsx` file that a CT story ALSO mounts elsewhere in
// the same test collides in Playwright's component-test bundler (two inclusions of the same JSX-bearing
// module raise "Identifier already declared"). Most of these mirror the contracts schema bounds — the schema
// is the hard clamp; these are just the input affordances.
import { FONT_SCALE } from "@orb/kit/font-scale";

export const BACKGROUND_BLUR_MIN = 0;
export const BACKGROUND_BLUR_MAX = 24;
export const CHAT_WIDTH_MIN = 30;
export const CHAT_WIDTH_MAX = 100;
// Aliased, not re-spelled: the slider, the stored setting and the card-frame root-size clamp read one range.
export const FONT_SCALE_MIN = FONT_SCALE.min;
export const FONT_SCALE_MAX = FONT_SCALE.max;
export const FONT_SCALE_STEP = 0.05;
