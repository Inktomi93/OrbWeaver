// The shared field-chrome box worn by input, textarea, and the select trigger — the `bg-input`
// bordered control at full width with the body-type token and horizontal padding. Each consumer
// layers its own height (`h-control-sm` / `min-h-control-lg`), the interaction state machine, and
// (input/textarea only) the placeholder + invalid treatment on top.
export const FIELD_CONTROL = "w-full min-w-0 rounded-control border border-border bg-input px-block text-body leading-body text-foreground";
