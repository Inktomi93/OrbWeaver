import { MIN_HEIGHT, tv } from "#lib";

// The macro-textarea skin. The textarea rides the shared textarea skin (composed via
// `#primitives/textarea`, not reimplemented) with a monospace override so `{{macro}}` markers
// align; the suggestion popover is a plain absolutely-positioned panel anchored to the wrapper (seated below
// or above it by `macro-textarea-placement.ts`, which sets `data-above`, or over a field taller than the visible band,
// where it sets `data-inside` and the list's top edge) —
// NOT a Base UI Portal/Positioner overlay, because this is a hand-rolled combobox on the SAME
// textarea (ui-package-design §12: Base UI Autocomplete is whole-input-only and cannot anchor a
// mid-text `{{…` trigger; cmdk was rejected for the focus-jump it'd force). `data-highlighted`
// mirrors the Base UI convention (select/menu/autocomplete) so keyboard nav and mouse hover share
// one styling hook.
export const macroTextareaVariants = tv({
  slots: {
    // The editor content column's cap, a length rather than `ch`: a `ch` resolves in the element's own face, so this
    // field and its siblings would end on different edges.
    root: "relative flex flex-col gap-field max-inline-(--width-content-col) min-inline-0",
    // resize-y: a native bottom-drag handle — the field auto-grows with content (the shared
    // textarea skin's `field-sizing: content`) but a caller can still pull it taller by hand
    // (persona-panel redesign — a long description wants more room on demand).
    textarea: "flex-1 resize-y font-mono text-code-field leading-code-field min-block-0",
    listbox: [
      `
        absolute inset-s-0 inset-e-0 inset-bs-full z-(--z-overlay) mbs-field overflow-y-auto overscroll-contain rounded-card border border-border bg-popover
        py-field font-sans shadow-overlay max-block-(--height-scroll-md) tone-host-popover
        data-above:inset-bs-auto data-above:inset-be-full data-above:mbs-0 data-above:mbe-field
        data-inside:mbs-0
      `,
    ],
    groupLabel: "px-block py-field text-label leading-label font-semibold tracking-caps text-muted-foreground uppercase",
    item: [
      `
        flex cursor-pointer items-start justify-between gap-block px-block py-field text-start text-body leading-body text-foreground outline-none select-none
        inline-full min-block-(--size-touch-target)
      `,
      "hover:bg-muted data-highlighted:bg-accent data-highlighted:text-accent-foreground",
    ],
    itemMain: "flex flex-col gap-field min-inline-0",
    itemName: "font-mono text-code leading-label-relaxed text-foreground",
    itemSource: "shrink-0 text-label leading-label text-muted-foreground",
    itemDescription: "truncate text-label leading-label text-muted-foreground",
    helper: "font-sans text-label leading-label text-muted-foreground",
    argHint: "font-sans text-label leading-label text-muted-foreground",
  },
});

export const macroTextareaBoxVariants = tv({
  variants: {
    minHeight: { scrollSm: MIN_HEIGHT.scrollSm },
  },
});
