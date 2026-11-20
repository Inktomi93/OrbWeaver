// The disabled state of every control kind, one home per kind (D355, ui-surface-and-interaction-rules §3). Opacity alone
// is too weak a signal on a light palette, so each kind carries a second one:
// - a fill-less control (a ghost or outline button, a tab, a row, an item) dims by the palette's derived step and drops
//   to the muted ink;
// - a form control drawn by its D159 edge (a field, a select trigger) never dims: a carried palette solves that edge to
//   the nearest 3:1 lightness, so any dim breaks the floor. It swaps to the muted pair, the solid Button's own swap;
// - a selection control (a checkbox, a radio, a switch, a slider) swaps the same way, and a checked one drops its
//   accent or quiet fill for the muted pair.
// Base UI signals disabled two ways: `data-disabled` on its own parts and the native `:disabled` pseudo on a real
// <button>, <input> or <textarea>. A control that is both composes both spellings.

/** A fill-less control, on Base UI's `data-disabled`. */
export const DISABLED_STATE = "data-disabled:pointer-events-none data-disabled:opacity-disabled data-disabled:text-muted-foreground";

/** {@link DISABLED_STATE} on the native `:disabled` pseudo. */
export const DISABLED_STATE_NATIVE = "disabled:pointer-events-none disabled:opacity-disabled disabled:text-muted-foreground";

/** {@link DISABLED_STATE} with the pointer kept: a label or legend of a disabled control, a chip in a field, a menu item the highlight still follows. */
export const DISABLED_DIM = "data-disabled:opacity-disabled data-disabled:text-muted-foreground";

/** A form control drawn by its edge, on Base UI's `data-disabled`. */
export const DISABLED_FIELD = "data-disabled:pointer-events-none data-disabled:bg-muted data-disabled:text-muted-foreground";

/** {@link DISABLED_FIELD} on the native `:disabled` pseudo. */
export const DISABLED_FIELD_NATIVE = "disabled:pointer-events-none disabled:bg-muted disabled:text-muted-foreground";

/** {@link DISABLED_FIELD} on a group box whose disabled part is a descendant (a combobox or autocomplete input group). */
export const DISABLED_FIELD_WITHIN = "has-data-disabled:pointer-events-none has-data-disabled:bg-muted has-data-disabled:text-muted-foreground";

// The checked and indeterminate arms stack both attributes, so they outrank the tone's own checked fill whatever order
// the stylesheet emits the two in.
/** A selection control's box or track: the muted pair at every state, the check or thumb carrying the on and off meaning. */
export const DISABLED_SELECTION = `
  data-disabled:pointer-events-none data-disabled:bg-muted data-disabled:text-muted-foreground
  data-checked:data-disabled:border-input-border data-checked:data-disabled:bg-muted data-checked:data-disabled:text-muted-foreground
  data-indeterminate:data-disabled:border-input-border data-indeterminate:data-disabled:bg-muted data-indeterminate:data-disabled:text-muted-foreground
`;
