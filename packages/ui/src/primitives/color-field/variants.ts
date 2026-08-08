import { DISABLED_STATE, FOCUS_RING, FOCUS_RING_ON_POPOVER, tv } from "#lib";

// The color-field skin: `swatch` is the plain chip (shared by the display-only ColorSwatch and the
// editable ColorField's trigger), `swatchTrigger` adds the button affordance (focus ring, disabled,
// cursor). `nativeColorInput` skins the browser's own `<input type="color">` swatch button; hex
// entry rides the existing `Field`/`Input` primitives (no bespoke text-input skin needed here).
export const colorFieldVariants = tv({
  slots: {
    root: "inline-flex items-center gap-field",
    swatch: "size-control-sm shrink-0 rounded-control border border-border bg-input",
    hexText: "text-label leading-label text-muted-foreground",
    swatchTrigger: [
      "inline-flex size-control-sm shrink-0 items-center justify-center rounded-control border border-border p-0",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      "outline-none",
      FOCUS_RING,
      `cursor-pointer ${DISABLED_STATE}`,
      // The 8-state contract's loading/success arms (ui-package-design §5) — disabled/error/hover/
      // focus-visible/active ride pseudo-classes or Base UI's own data-invalid elsewhere; these two
      // need explicit skin since nothing native drives them.
      "data-loading:cursor-wait data-loading:pointer-events-none",
      "data-success:ring-2 data-success:ring-success data-success:ring-offset-2 data-success:ring-offset-background",
    ],
    popupBody: "flex flex-col gap-field",
    // The native swatch is the FIRST tab stop inside the popup and it had no house focus state at all
    // (side-eye 2026-08-08 P1, WCAG 2.4.7): a keyboard user entering the popover got the UA's own outline,
    // which on a near-black popup surface is a ~#101010 hairline against #0b0b0b — invisible. `outline-none`
    // retires that UA paint and the ring replaces it. _ON_POPOVER, not the plain FOCUS_RING: this input only
    // ever renders inside `PopoverPopup`, so the ring's offset moat must be the POPOVER tone — the default
    // `ring-offset-background` would paint a page-toned band around the swatch on a popover-toned surface.
    // The ring (a box-shadow) is safe here rather than FOCUS_RING_OUTLINE: this slot paints no shadow of its
    // own, so nothing else owns the composite. MEASURED under a real Tab in the color-field CT.
    nativeColorInput: `h-control-md w-full cursor-pointer rounded-control border border-border p-0 outline-none disabled:cursor-not-allowed ${FOCUS_RING_ON_POPOVER}`,
    hexField: "w-full",
    // The per-field clear affordance (FINAL-Character §8.1). Left-aligned under the hex field so it
    // reads as a secondary action, not a full-width primary — it emits the empty "" clear sentinel.
    resetButton: "self-start",
  },
});
