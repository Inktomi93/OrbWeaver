import { tv } from "#lib";

// The textarea skin — the Input token skin, multi-line: a min-height on the control-lg scale and
// native `field-sizing: content` autosize (the 2026 CSS way — D54; no JS measuring).
export const textareaVariants = tv({
  base: [
    "field-sizing-content min-h-control-lg w-full min-w-0 rounded-control border border-border bg-input px-block py-field text-body leading-body text-foreground",
    "placeholder:text-muted-foreground",
    "transition-colors duration-(--motion-fast) ease-out-expo",
    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    // A plain <textarea> needs the explicit Field.Control wrap (above) to register with an
    // enclosing <Field> at all — unlike Input/Checkbox/Switch/RadioGroup/Slider/NumberField, whose
    // OWN Roots extend Base UI's FieldRootState and register directly. Once registered, every one
    // of those controls gets the same `data-invalid` (mirrors `aria-invalid`) — this skin's branch.
    "data-invalid:border-destructive data-invalid:focus-visible:ring-destructive",
  ],
});
