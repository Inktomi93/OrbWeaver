// The shared field-chrome box worn by input, textarea, and the select trigger — the `bg-input`
// bordered control at full width with the body-type token and horizontal padding. Each consumer
// layers its own height (`h-control-sm` / `min-h-control-lg`), the interaction state machine, and
// (input/textarea only) the placeholder + invalid treatment on top.
//
// _BOX is the same chrome MINUS the control-scale bits (padding + type). It exists because the scale is
// what an `inline` layout arm must replace, and a custom-token padding cannot be overridden from outside:
// `twMerge("px-block","px-field")` keeps BOTH (measured, twMerge 3.6), so the winner would fall out of
// stylesheet order. Splitting the fragment lets the arm CHOOSE its scale instead of fighting one.
export const FIELD_CONTROL_BOX = "w-full min-w-0 rounded-control border border-border bg-input text-foreground";

export const FIELD_CONTROL = `${FIELD_CONTROL_BOX} px-block text-body leading-body`;
