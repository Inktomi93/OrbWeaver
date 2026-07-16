// The overlay arrow diamond — a `rotate-45` bordered square skinned to read as the popup edge
// continuing to a point. Base UI positions it against the anchor and sets `data-side`; the skin is
// byte-identical across every anchored seal (select/autocomplete/combobox/menu/popover/tooltip), so
// naming it once makes a per-seal re-spelling (and a drift in the border/bg token pair) impossible.
export const OVERLAY_ARROW = "size-row rotate-45 border border-border bg-popover";
