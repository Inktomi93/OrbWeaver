import { DISABLED_STATE_NATIVE, FIELD_CONTROL, FOCUS_RING, FOCUS_RING_DESTRUCTIVE, FOCUS_RING_NONE, tv } from "#lib";

// The textarea skin — the shared FIELD_CONTROL box, multi-line: a min-height on the control-lg scale
// and native `field-sizing: content` autosize (the 2026 CSS way — D54), measured in script only where the browser lacks it.
export const textareaVariants = tv({
  base: [
    FIELD_CONTROL,
    "field-sizing-content border-(length:--border-width-control) py-field",
    "placeholder:text-muted-foreground",
    "outline-none",
    FOCUS_RING,
    DISABLED_STATE_NATIVE,
    // A plain <textarea> needs the explicit Field.Control wrap (above) to register with an
    // enclosing <Field> at all — unlike Input/Checkbox/Switch/RadioGroup/Slider/NumberField, whose
    // OWN Roots extend Base UI's FieldRootState and register directly. Once registered, every one
    // of those controls gets the same `data-invalid` (mirrors `aria-invalid`) — this skin's branch.
    "data-invalid:border-destructive",
    FOCUS_RING_DESTRUCTIVE,
  ],
  variants: {
    size: {
      default: "min-block-(--size-control-lg)",
      compact: "min-block-(--size-control-md)",
    },
    // A field that sits inside a box which already draws the field (the composer card): no edge, no fill and no ring
    // of its own, because the host carries the focus state.
    chrome: { field: "", bare: `border-0 bg-transparent ${FOCUS_RING_NONE}` },
    // Code typed into the field (a snippet, a script): the mono face.
    face: { text: "", code: "font-mono" },
  },
  defaultVariants: { size: "default", chrome: "field", face: "text" },
});
