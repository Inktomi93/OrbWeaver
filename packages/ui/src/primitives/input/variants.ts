import { DISABLED_STATE, DISABLED_STATE_NATIVE, FIELD_CONTROL, FIELD_CONTROL_BOX, FOCUS_RING, FOCUS_RING_DESTRUCTIVE, tv } from "#lib";

// The text-input skin — the shared FIELD_CONTROL box + h-control-sm floor (the ≥44px law, §4b axis 3).
export const inputVariants = tv({
  base: [
    "placeholder:text-muted-foreground",
    "outline-none",
    FOCUS_RING,
    DISABLED_STATE_NATIVE,
    DISABLED_STATE,
    "data-invalid:border-destructive",
    FOCUS_RING_DESTRUCTIVE,
  ],
  variants: {
    // THE INPUT'S SCALE — and with it the height rule. `field` is the form control (the default, unchanged).
    // `inline` is the CLICK-TO-EDIT twin of Button's `size="inline"`: the input that replaces a datum in
    // place must occupy the SAME visual slot the display did (owner no-shift bar), so it is text-height with
    // the datum's own inset and type, keeping only the chrome that marks it editable (border + bg-input).
    //
    // It is a VARIANT and not a call-site className for a MEASURED reason: `twMerge("h-control-sm","h-auto")`
    // and `twMerge("px-block","px-field")` each kept BOTH classes (custom-token utilities were unclassifiable,
    // twMerge 3.6 pre-#146), so the shipped call sites had to write `!h-auto !px-field` — an !important escape
    // that also slips past the ui-size-via-variant gate. #146 registered the spacing scale, so those pairs now
    // resolve last-wins: the escape is inert AND a plain call-site class would now silently win, which is the
    // stronger reason for the arm to exist at all. The scale can only be chosen HERE (Button `media`/`wrap`,
    // TabsTab `stacked` precedent). Pinned by COMPUTED box in tests/ui/primitives/input/input.ct.tsx.
    layout: {
      field: [FIELD_CONTROL, "h-control-sm"],
      // `text-field-dense` IS THE DENSE STEP WITH THE PLATFORM FLOOR BAKED IN (#1868, §4b axis 3). This arm
      // was `text-label` (13px), two steps under iOS Safari's 16px focus-zoom threshold, so every
      // click-to-edit on a phone zoomed the whole viewport. The token carries the pointer arm
      // (`orb.pointerFine`), so this call site states a type step and no capability query — see
      // lib/field-control.ts for why the token layer owns this and not a variant here.
      //
      // IT COSTS THE NO-SHIFT BAR ONE STEP ON TOUCH, ruled rather than overlooked: `inline` exists to
      // occupy the SAME visual slot the datum it replaces did, and at coarse it is now one step taller than
      // that datum. A zoomed page is a far larger shift than one type step, so the floor wins and the
      // no-shift promise is a FINE-POINTER promise. If the coarse growth ever measures as a real jump at a
      // call site, the answer is that site reserving the taller box, never dropping the floor.
      inline: [FIELD_CONTROL_BOX, "h-auto min-h-0 px-field py-0 text-field-dense leading-field-dense"],
    },
  },
  defaultVariants: { layout: "field" },
});
