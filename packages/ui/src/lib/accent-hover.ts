// The shared accent-hover recipe — a control's rest→hover flip to the accent surface + its readable
// foreground. Spelled across button (secondary/ghost), toggle, toast (close/action), autocomplete
// (clear), combobox (chip-remove), and sortable (handle); naming it once keeps the bg/text token pair
// from drifting apart on any one seal.
export const ACCENT_HOVER = "hover:bg-accent hover:text-accent-foreground";
