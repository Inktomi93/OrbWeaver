// The focus-ring class fragments (§13.0 "repeated 3+ AND changing together" litmus, C5 rollup) —
// extracted from ~29 `variants.ts` files that hand-copied the same `focus-visible:ring-2
// focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background` cluster.
// One copy DRIFTED: `layout/variants.ts`'s `toolbarButtonVariants` carried `ring-offset-2` WITHOUT
// `ring-offset-background`, so Tailwind's default `--tw-ring-offset-color` (`#fff`) painted a white
// halo on dark themes. Composing from here makes that drift class structurally impossible — a retune
// is one edit instead of 29.
//
// `FOCUS_RING` covers the STANDARD ring-with-offset cluster on `:focus-visible`; `FOCUS_RING_WITHIN`
// is the same cluster on `:focus-within` (input-group wrappers whose focusable child is nested, e.g.
// autocomplete/combobox); `FOCUS_RING_HAS` is the same cluster on Tailwind's `has-[:focus-visible]`
// (file-dropzone's invisible full-box `<input>` — the ring has to wrap the decorative root, since the
// input itself renders no visible box); `FOCUS_RING_INSET` drops the offset for a ring that must stay
// inside its own box (log-viewer's scrollable region, number-field's segment buttons);
// `FOCUS_RING_DESTRUCTIVE` is the standalone `data-invalid` ring-color override composed ALONGSIDE
// (never instead of) `FOCUS_RING`.
export const FOCUS_RING =
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export const FOCUS_RING_WITHIN =
  "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background";

export const FOCUS_RING_HAS =
  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background";

export const FOCUS_RING_INSET =
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

export const FOCUS_RING_DESTRUCTIVE = "data-invalid:focus-visible:ring-destructive";
