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
    // THE LINE-LENGTH CAP (#2465). Uncapped, the prose editor painted 100.25 characters per line at its
    // real 828px mount (measured, macro-textarea.ct.tsx) — a third again past the design law's 65-75 band.
    //
    // WHY `--reading-measure` AND NOT `--reading-measure-prose`, WHICH THE ROW NAMED. This field is
    // MONOSPACE, so one CSS `ch` IS one typographic character here. The prose measure's 47ch carries the
    // PROPORTIONAL conversion its own token description derives (1 CSS ch = 1.43-1.56 law-characters in
    // Geist, so 47ch reads 67-73); applied to a mono field that conversion does not exist and 47ch reads
    // 47 — well BELOW the band the row asked for. 75ch reads 75 here, minus the field's own padding, which
    // lands inside the band at both ends. The row's SYMPTOM (65-75 per line) is satisfied; its TOKEN
    // prescription was derived for a different font class. Flagged to the orchestrator, not decided here.
    textarea: "min-h-0 max-w-(--reading-measure) flex-1 resize-y font-mono text-code-field leading-code-field",
    listbox: [
      "absolute top-full right-0 left-0 z-(--z-overlay) mt-field max-h-64 overflow-y-auto overscroll-contain rounded-card border border-border bg-popover py-field shadow-overlay",
    ],
    groupLabel: "px-block py-field text-label leading-label font-semibold text-muted-foreground uppercase tracking-wide",
    item: [
      "flex w-full min-h-touch-target cursor-pointer select-none items-start justify-between gap-block px-block py-field text-left text-body leading-body text-foreground outline-none",
      "hover:bg-muted data-highlighted:bg-accent data-highlighted:text-accent-foreground",
    ],
    itemMain: "flex min-w-0 flex-col gap-field",
    itemName: "font-mono text-code leading-label-relaxed text-foreground",
    itemDescription: "truncate text-label leading-label text-muted-foreground",
    helper: "text-label leading-label text-muted-foreground",
    argHint: "text-label leading-label text-muted-foreground",
  },
});
