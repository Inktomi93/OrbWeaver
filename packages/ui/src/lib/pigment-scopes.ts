// The D336 pigment scopes the primitive-wide sheet treatments read (`styles/primitives.css`). A host stamps one as
// `data-pigment`, so the generated recipe resolves on that host against the ThemeScope in effect there.
import type { PigmentScope } from "#tokens";

/** The CTA, active-tab and active-rail ring head (`orb-gradient-ring`). */
export const GRADIENT_RING_PIGMENT = "gradient-ring" satisfies PigmentScope;

/** The accent glows behind an empty-state glyph and under a media cell's pointer. */
export const ACCENT_AURA_PIGMENT = "accent-aura" satisfies PigmentScope;
