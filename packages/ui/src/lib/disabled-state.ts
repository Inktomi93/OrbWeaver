// The one home of the disabled look (D355, ui-surface-and-interaction-rules §3). Every opacity, fill and ink a disabled
// control paints is spelled here, and `better-tailwindcss/no-restricted-classes` refuses the spelling anywhere else. A
// sheet's one disabled selector is the CTA ring in primitives.css, which `selector-disallowed-list` admits and no other.
// Opacity alone is too weak a signal on a light palette, so each control kind carries a second one:
// - a fill-less control (a ghost or outline button, a tab, a row, an item) dims by the palette's derived step and drops
//   to the muted ink;
// - a form control drawn by its D159 edge (a field, a select trigger) never dims its box: a carried palette solves that
//   edge to the nearest 3:1 lightness, so any dim breaks the floor. Its box swaps to the muted fill, and its content (the
//   value, the placeholder, a chevron or a stepper glyph) paints the muted ink at the derived step. On a dark palette the
//   muted fill sits within a few percent of the field fill, so the dimmed content is the signal there;
// - a selection control (a checkbox, a radio, a switch, a slider) and any solid fill (a solid Button, a pressed or
//   selected chip) swap the same way.
// A state that paints its own ink or fill (active, pressed, checked) stacks its attribute with the disabled one, so the
// disabled look outranks it whatever order the stylesheet emits the two in.
// Base UI signals disabled on its parts with `data-disabled` and on a real <button>, <input> or <textarea> with the
// native `:disabled` pseudo; a control that is both composes both spellings.

/** A fill-less control, on Base UI's `data-disabled`. */
export const DISABLED_STATE = "data-disabled:pointer-events-none data-disabled:opacity-disabled data-disabled:text-muted-foreground";

/** {@link DISABLED_STATE} on the native `:disabled` pseudo. */
export const DISABLED_STATE_NATIVE = "disabled:pointer-events-none disabled:opacity-disabled disabled:text-muted-foreground";

/** {@link DISABLED_STATE} on `aria-disabled`, for a list that marks a disabled row only there (cmdk). */
export const DISABLED_STATE_ARIA = "aria-disabled:pointer-events-none aria-disabled:opacity-disabled aria-disabled:text-muted-foreground";

/** {@link DISABLED_STATE} with the pointer kept: a label or legend of a disabled control, a chip in a field, a menu item the highlight still follows. */
export const DISABLED_DIM = "data-disabled:opacity-disabled data-disabled:text-muted-foreground";

/** The root of a control whose parts paint the disabled look themselves: it only refuses the pointer. */
export const DISABLED_POINTER = "data-disabled:pointer-events-none";

/** A fill-less control whose active state paints its own ink (a tab): the muted ink still wins while it is disabled. */
export const DISABLED_ACTIVE = "data-active:data-disabled:text-muted-foreground";

/** A disabled control whose state reads from the copy beside it: full strength, the muted ink kept. */
export const DISABLED_UNDIMMED = "disabled:opacity-100 data-disabled:opacity-100";

// A field's content is the muted ink at the derived step, as a colour alpha rather than element opacity, so the box and
// its edge stay at full strength. D355's solve judges that ink over the muted fill.
/** A form control drawn by its edge, on Base UI's `data-disabled`: the muted fill under its dimmed content. */
export const DISABLED_FIELD = `
  data-disabled:pointer-events-none data-disabled:bg-muted data-disabled:text-muted-foreground/(--opacity-disabled)
  data-disabled:placeholder:text-muted-foreground/(--opacity-disabled)
`;

/** {@link DISABLED_FIELD} on the native `:disabled` pseudo. */
export const DISABLED_FIELD_NATIVE = `
  disabled:pointer-events-none disabled:bg-muted disabled:text-muted-foreground/(--opacity-disabled)
  disabled:placeholder:text-muted-foreground/(--opacity-disabled)
`;

/** {@link DISABLED_FIELD}'s content alone, for a part that sets its own ink and placeholder inside a field box (a number field's input). */
export const DISABLED_FIELD_INK =
  "data-disabled:text-muted-foreground/(--opacity-disabled) data-disabled:placeholder:text-muted-foreground/(--opacity-disabled)";

/** {@link DISABLED_FIELD_INK} on the native `:disabled` pseudo (the input inside a combobox or autocomplete group). */
export const DISABLED_FIELD_INK_NATIVE = "disabled:text-muted-foreground/(--opacity-disabled) disabled:placeholder:text-muted-foreground/(--opacity-disabled)";

/** {@link DISABLED_FIELD_INK} for a glyph inside a {@link DISABLED_GROUP} field (a select's chevron). */
export const DISABLED_FIELD_INK_WITHIN = "group-data-disabled/disabled:text-muted-foreground/(--opacity-disabled)";

/** {@link DISABLED_FIELD}'s box on a group whose disabled input is a descendant (a combobox or autocomplete input group); the input paints {@link DISABLED_FIELD_INK_NATIVE}. */
export const DISABLED_FIELD_WITHIN = "has-data-disabled:pointer-events-none has-data-disabled:bg-muted";

/** A selection control's box or track: the muted pair at every state, its check, dot or thumb carrying the on and off meaning. */
export const DISABLED_SELECTION = `
  data-disabled:pointer-events-none data-disabled:bg-muted data-disabled:text-muted-foreground
  data-checked:data-disabled:border-input-border data-checked:data-disabled:bg-muted data-checked:data-disabled:text-muted-foreground
  data-indeterminate:data-disabled:border-input-border data-indeterminate:data-disabled:bg-muted data-indeterminate:data-disabled:text-muted-foreground
`;

/** A slider's range and knob on their own `data-disabled` parts: the muted ink as their fill, at full strength, over the muted rail. */
export const DISABLED_MARK = "data-disabled:bg-muted-foreground data-disabled:opacity-100";

// A switch keeps a fill polarity inside the neutral pair: on paints the muted ink as its track under a muted knob, off
// keeps the muted track under a knob dimmed by the derived step, so a disabled switch is never louder than an enabled
// off one. D355's solve judges that dimmed knob over the muted track.
/** A switch's track: muted when off, the muted ink when on. */
export const DISABLED_SWITCH = `
  data-disabled:pointer-events-none data-disabled:bg-muted
  data-checked:data-disabled:border-muted-foreground data-checked:data-disabled:bg-muted-foreground
`;

/** A switch's knob: the muted ink at the derived step when off, the muted fill at full strength when on. */
export const DISABLED_SWITCH_THUMB = `
  data-disabled:bg-muted-foreground data-disabled:opacity-disabled
  data-checked:data-disabled:bg-muted data-checked:data-disabled:opacity-100
`;

// A busy solid button is disabled too but is working, so it keeps its fill.
/** A solid fill (a solid Button, a selected chip): the muted pair at full opacity, on `data-disabled` and the native pseudo. */
export const DISABLED_SOLID = `
  disabled:not-aria-busy:bg-muted disabled:not-aria-busy:text-muted-foreground disabled:not-aria-busy:opacity-100 disabled:not-aria-busy:shadow-none
  data-disabled:not-aria-busy:bg-muted data-disabled:not-aria-busy:text-muted-foreground data-disabled:not-aria-busy:opacity-100
  data-disabled:not-aria-busy:shadow-none
`;

/** A pressed toggle's solid fill: the muted pair at full opacity while it is disabled. */
export const DISABLED_PRESSED = "data-pressed:data-disabled:bg-muted data-pressed:data-disabled:text-muted-foreground data-pressed:data-disabled:opacity-100";

/** Names the part that carries `data-disabled` for the `_WITHIN` spellings below. */
export const DISABLED_GROUP = "group/disabled";

/** A part that sets its own ink inside a {@link DISABLED_GROUP}: the muted ink while the group is disabled, selected or not (a list row's title). */
export const DISABLED_INK_WITHIN = "group-data-disabled/disabled:text-muted-foreground group-data-selected:group-data-disabled/disabled:text-muted-foreground";

/** {@link DISABLED_DIM} for a part inside a {@link DISABLED_GROUP} whose row stays at full strength (a select option's label). */
export const DISABLED_DIM_WITHIN = "group-data-disabled/disabled:opacity-disabled group-data-disabled/disabled:text-muted-foreground";

/** A selection mark inside a {@link DISABLED_GROUP} (a radio dot): the muted ink as its fill. */
export const DISABLED_MARK_WITHIN = "group-data-disabled/disabled:bg-muted-foreground";
