import { DISABLED_STATE_NATIVE, FIELD_CONTROL, FOCUS_RING, FOCUS_RING_DESTRUCTIVE, tv } from "#lib";

// The textarea skin — the shared FIELD_CONTROL box, multi-line: a min-height on the control-lg scale
// and native `field-sizing: content` autosize (the 2026 CSS way — D54; no JS measuring).
export const textareaVariants = tv({
  base: [
    FIELD_CONTROL,
    "field-sizing-content min-h-control-lg py-field",
    "placeholder:text-muted-foreground",
    "transition-colors duration-(--motion-fast) ease-out-expo",
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
});
