// Appearance-panel numeric field bounds — split out of the appearance pane's knob surface, which SET-SEAMS
// stage 1 decomposed into the `appearance-*-section.tsx` fragments that import these (mirrors the
// `lib/appearance-select-items.ts` split: pure data, not JSX, so it belongs beside the surface rather
// than inside it). A second, load-bearing reason for the split: a Playwright CT test that needs these
// constants (never hardcode a slider's min/max as a magic number in an assertion) must import them from
// a NON-JSX module — importing named exports from a `.tsx` file that a CT story ALSO mounts elsewhere in
// the same test collides in Playwright's component-test bundler (two inclusions of the same JSX-bearing
// module raise "Identifier already declared"). These mirror the contracts schema bounds — the schema is
// the hard clamp; these are just the input affordances.
import { BACKGROUND_DIM_MIN as SCHEMA_BACKGROUND_DIM_MIN } from "@orb/contracts/settings/appearance";

// THE ONE BOUND THAT IS NOT A MIRROR (#487). Every other constant here re-spells an input affordance; the
// wallpaper dim floor is a DERIVED legibility guarantee (the derivation, and the plate-alpha arm D144(d)
// refuses, live on the contract), so it is ALIASED off the schema's own constant rather than re-spelled —
// a slider offering a dim the schema clamps away is exactly the drift this binding makes impossible.
// (An `export … from` re-export would be a barrel; biome's `noBarrelFile` owns that call.)
export const BACKGROUND_DIM_MIN = SCHEMA_BACKGROUND_DIM_MIN;
export const BACKGROUND_DIM_MAX = 1;
export const BACKGROUND_DIM_STEP = 0.05;
export const BACKGROUND_BLUR_MIN = 0;
export const BACKGROUND_BLUR_MAX = 24;
export const CHAT_WIDTH_MIN = 30;
export const CHAT_WIDTH_MAX = 100;
export const FONT_SCALE_MIN = 0.8;
export const FONT_SCALE_MAX = 1.5;
export const FONT_SCALE_STEP = 0.05;
export const BLUR_STRENGTH_MIN = 4;
export const BLUR_STRENGTH_MAX = 28;
