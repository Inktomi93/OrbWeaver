import { tv } from "#lib";

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
      "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "cursor-pointer data-disabled:pointer-events-none data-disabled:opacity-50",
      // The 8-state contract's loading/success arms (ui-package-design §5) — disabled/error/hover/
      // focus-visible/active ride pseudo-classes or Base UI's own data-invalid elsewhere; these two
      // need explicit skin since nothing native drives them.
      "data-loading:cursor-wait data-loading:pointer-events-none",
      "data-success:ring-2 data-success:ring-success data-success:ring-offset-2 data-success:ring-offset-background",
    ],
    popupBody: "flex flex-col gap-field",
    nativeColorInput:
      "h-control-md w-full cursor-pointer rounded-control border border-border p-0 disabled:cursor-not-allowed",
    hexField: "w-full",
  },
});
