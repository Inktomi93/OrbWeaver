// The shared field-chrome box worn by input, textarea, and the select trigger — the `bg-input`
// bordered control at full width with the body-type token and horizontal padding. Each consumer
// layers its own height (`h-control-sm` / `min-h-control-lg`), the interaction state machine, and
// (input/textarea only) the placeholder + invalid treatment on top.
//
// _BOX is the same chrome MINUS the control-scale bits (padding + type). It exists because the scale is
// what an `inline` layout arm must replace. It was written when a custom-token padding could not be
// overridden from outside at all — `twMerge("px-block","px-field")` kept BOTH (measured, twMerge 3.6) and
// the winner fell out of stylesheet order. #146 registered the spacing scale, so that pair now resolves
// last-wins; the split stays, because an arm CHOOSING its scale is still better than an arm appending a
// class that fights one, and the fragment is composed INSIDE variants where there is no "last" to rely on.
// THE EDGE IS `border-input-border`, NOT `border-border` (D159): a form control's boundary is what
// IDENTIFIES it as operable, so WCAG 1.4.11's 3:1 governs it, while the shared `--color-border`
// hairline is a decorative divider at 1.19-1.28:1 and stays that way for its other 70-odd consumers.
export const FIELD_CONTROL_BOX = "w-full min-w-0 rounded-control border border-input-border bg-input text-foreground";

export const FIELD_CONTROL = `${FIELD_CONTROL_BOX} px-block text-body leading-body`;
