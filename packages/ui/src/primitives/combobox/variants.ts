import { tv } from "#lib";

// The multi-select combobox skin — chips render as pills flowing inline with the draft input
// inside ONE wrapping box (`chips` rides `contents` so its children become direct flex items of
// `inputGroup`, letting them wrap line-by-line together). Popup/list/item/empty/status mirror the
// autocomplete seal's tokens (bg-popover + z-(--z-overlay) stacking contract, bg-accent highlight)
// so the two seals read as one family. The chip remove glyph is sized to the pill (not the 44px
// control floor — a chip's dismiss is a secondary affordance nested in a compact tag, the same call
// the cited neo reference makes for its keyword-chip `X`).
export const comboboxVariants = tv({
  slots: {
    inputGroup: [
      "relative flex min-h-control-sm w-full min-w-0 flex-wrap items-center gap-field rounded-control border border-border bg-input px-field py-field",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
      "has-data-disabled:pointer-events-none has-data-disabled:opacity-50",
    ],
    chips: "contents",
    chip: [
      "inline-flex items-center gap-field rounded-full bg-secondary py-field pr-field pl-block text-label leading-label text-secondary-foreground outline-none",
      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "data-disabled:opacity-50",
    ],
    chipRemove: [
      "flex shrink-0 items-center justify-center rounded-full text-secondary-foreground/70 outline-none",
      "hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
      "disabled:pointer-events-none disabled:opacity-50",
    ],
    input: [
      "min-w-24 flex-1 bg-transparent px-field py-field text-body leading-body text-foreground outline-none",
      "placeholder:text-muted-foreground",
    ],
    positioner: "z-(--z-overlay) outline-none",
    popup: [
      "z-(--z-overlay) max-h-(--available-height) w-(--anchor-width) overflow-y-auto rounded-card border border-border bg-popover p-field text-popover-foreground",
      // Enter/exit fade+scale from the anchor — matches popover/menu/tooltip/select (the shared
      // overlay animation contract). `--transform-origin` is Base UI Positioner-provided.
      "origin-(--transform-origin) transition-all duration-(--motion-fast) ease-out-expo data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
    ],
    // Base UI positions the arrow against the anchor and sets data-side; skinned as a `bg-popover`
    // diamond that continues the popup edge (mirrors PopoverArrow/MenuArrow/SelectArrow).
    arrow: "size-row rotate-45 border border-border bg-popover",
    list: "flex flex-col gap-field",
    item: [
      "flex min-h-touch-target cursor-pointer select-none items-center rounded-control px-block py-field text-body leading-body text-foreground outline-none",
      "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
    ],
    empty: "px-block py-field text-body leading-body text-muted-foreground",
    // The SR live region is visually collapsed — announces the result count politely; must stay
    // mounted (Base UI: never `hidden`/`display:none` the Status element).
    status: "sr-only",
  },
});
