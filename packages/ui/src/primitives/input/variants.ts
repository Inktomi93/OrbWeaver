import {
  CONTROL_BLOCK,
  DISABLED_STATE,
  DISABLED_STATE_NATIVE,
  FIELD_CONTROL,
  FIELD_CONTROL_BOX,
  FLOOR,
  FOCUS_RING,
  FOCUS_RING_DESTRUCTIVE,
  GROW,
  TEXT_ALIGN,
  tv,
  WIDTH,
} from "#lib";

// The text-input skin — the shared FIELD_CONTROL box at a control-scale height (the ≥44px law, §4b axis 3).
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
    // THE CONTROL SCALE (D336): the step's height, so a field sits level with the buttons and toggles of its row. The
    // type stays the field's own pointer-conditional step at every size, because iOS zooms on a smaller focused field.
    size: CONTROL_BLOCK,
    // THE INPUT'S LAYOUT — declared after `size`, so the inline arm's text height wins the merge. `field` is the form control (the default, unchanged).
    // `inline` is the CLICK-TO-EDIT twin of `InlineAction`: the input that replaces a datum in
    // place must occupy the SAME visual slot the display did (owner no-shift bar), so it is text-height with
    // the datum's own inset and type, keeping only the chrome that marks it editable (border + bg-input).
    //
    // It is a VARIANT and not a call-site className for a MEASURED reason: `twMerge("h-(--size-control-sm)","h-auto")`
    // and `twMerge("px-block","px-field")` each kept BOTH classes (custom-token utilities were unclassifiable,
    // twMerge 3.6 pre-#146), so the shipped call sites had to write `!h-auto !px-field` — an !important escape
    // that also slips past the ui-size-via-variant gate. #146 registered the spacing scale, so those pairs now
    // resolve last-wins: the escape is inert AND a plain call-site class would now silently win, which is the
    // stronger reason for the arm to exist at all. The scale can only be chosen HERE (Button `media`/`wrap`
    // precedent).
    layout: {
      field: FIELD_CONTROL,
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
      inline: [FIELD_CONTROL_BOX, "px-field py-0 text-field-dense leading-field-dense block-auto min-block-0"],
    },
    // THE INPUT'S INLINE SIZE. `full` is the control box's own `w-full`. `auto` is the content-sized arm (a
    // click-to-edit datum that hugs its text); the two steps are the numeric fields that share an avatar column.
    // A variant, not a call-site class: a width built from a custom token cannot be overridden reliably by a
    // className, which is why the shipped sites wrote `!w-*`.
    width: {
      full: "",
      auto: "field-sizing-content inline-auto max-inline-full min-inline-0",
      "avatar-md": "inline-(--size-avatar-md)",
      "avatar-lg": "inline-(--size-avatar-lg)",
      controlCol: WIDTH.controlCol,
    },
    grow: GROW,
    floor: FLOOR,
    textAlign: TEXT_ALIGN,
    // Tabular figures, for the edit twin of a numeric datum, so the typed digits keep the rest state's columns.
    numeric: {
      true: "tabular-nums",
      false: "",
    },
    // The edit twin of a big readout (a stat cell's value) types at the readout's own step, so the swap does not jump.
    typeStep: { field: "", title: "text-title leading-title" },
    // The edit twin of an italic line (a character's thought) keeps the slant.
    italic: { true: "italic", false: "" },
    // The field's text stops short of a glyph floating over its inline end, so a long value never runs under it.
    clearsGlyph: { true: "pe-(--size-control-clearance)", false: "" },
  },
  defaultVariants: { size: "sm", layout: "field", width: "full", numeric: false, typeStep: "field", italic: false },
});
