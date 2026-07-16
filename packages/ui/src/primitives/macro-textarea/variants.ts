import { tv } from "#lib";

// The macro-textarea skin. The textarea rides the shared textarea skin (composed via
// `#primitives/textarea`, not reimplemented) with a monospace override so `{{macro}}` markers
// align; the suggestion popover is a plain absolutely-positioned panel anchored to the wrapper —
// NOT a Base UI Portal/Positioner overlay, because this is a hand-rolled combobox on the SAME
// textarea (ui-package-design §12: Base UI Autocomplete is whole-input-only and cannot anchor a
// mid-text `{{…` trigger; cmdk was rejected for the focus-jump it'd force). `data-highlighted`
// mirrors the Base UI convention (select/menu/autocomplete) so keyboard nav and mouse hover share
// one styling hook.
export const macroTextareaVariants = tv({
  slots: {
    root: "relative flex flex-col gap-field",
    // resize-y: a native bottom-drag handle — the field auto-grows with content (the shared
    // textarea skin's `field-sizing: content`) but a caller can still pull it taller by hand
    // (persona-panel redesign — a long description wants more room on demand).
    textarea: "min-h-0 flex-1 resize-y font-mono text-code",
    listbox: [
      "absolute top-full right-0 left-0 z-(--z-overlay) mt-field max-h-64 overflow-y-auto rounded-card border border-border bg-popover py-field shadow-overlay",
    ],
    groupLabel: "px-block py-field text-label leading-label font-semibold text-muted-foreground uppercase tracking-wide",
    item: [
      "flex w-full min-h-touch-target cursor-pointer select-none items-start justify-between gap-block px-block py-field text-left text-body leading-body text-foreground outline-none",
      "hover:bg-muted data-highlighted:bg-accent data-highlighted:text-accent-foreground",
    ],
    itemMain: "flex min-w-0 flex-col gap-field",
    itemName: "font-mono text-code text-foreground",
    itemDescription: "truncate text-label leading-label text-muted-foreground",
    helper: "text-label leading-label text-muted-foreground",
    argHint: "text-label leading-label text-muted-foreground",
  },
});
