// The anchored-popup side-offset pair (§13.0 litmus, C19 rollup) — two deliberately different
// gaps hand-copied under two locally-scoped names across 6 overlay seals: `POPUP_SIDE_OFFSET = 4`
// (select/combobox/autocomplete — the popup hugs the input it edits) and `DEFAULT_SIDE_OFFSET = 8`
// (popover/menu/tooltip — the popup breathes off a discrete trigger). Naming both ONCE here makes
// the pair's intent legible and the retune a single edit instead of six.
export const ANCHOR_GAP_INPUT = 4;
export const ANCHOR_GAP_TRIGGER = 8;
