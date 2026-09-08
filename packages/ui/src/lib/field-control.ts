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

// THE TYPE STEP IS `text-field`, A POINTER-CONDITIONAL TOKEN, AND THAT IS WHY THERE IS NO MEDIA QUERY
// AND NO VARIANT ANYWHERE NEAR THIS LINE (#1868, §4b axis 3).
//
// The defect: iOS Safari ZOOMS THE VIEWPORT IN when a control whose computed font-size is under 16px takes
// focus, and never zooms back out on blur. `--text-body` is 15px, so every Input, every Textarea and the
// chat composer sat one pixel under. Zoomed, the visual viewport is smaller than the layout viewport — the
// reader pans sideways and the bottom tab bar drops below the fold. Owner-reported as three symptoms
// ("pinch and zoom out a lot", "the bottom bar goes all the way down", "left-to-right scrolling"): one
// cause. There is no horizontal scroll container in the app at all (`overflow: clip` on html/body and on
// `.shell-grid`), so the sideways motion could only ever have been zoom panning.
//
// TWO WRONGER SHAPES WERE BUILT FIRST AND THE TREE REFUSED BOTH — keep them refused:
//   1. `any-pointer-coarse:text-base` right here, which is Base UI's own spelling (51 occurrences in
//      docs/vendor/base-ui). `no-raw-typography-in-features` reds `text-base`: it is TAILWIND's default
//      scale, not this system's vocabulary. A vendor's example className is not a licence to import their
//      type scale. It ALSO could not have worked — `styles/tiers.css` is unlayered, so
//      `[data-surface-tier] [data-slot="input-root"]` at (0,2,0) out-ranks any `@layer utilities` rule for
//      every field inside a `<Surface>`, i.e. most of them.
//   2. a raw `@media (any-pointer: coarse)` block in ui globals.css plus a second arm in tiers.css. Legal,
//      and it worked, but §4b axis 3 says a capability is baked into a TOKEN so the call site carries NO
//      variant — `spacing.touch-target` is the worked precedent, 44px coarse / 28px fine. Two CSS homes
//      re-deriving one platform fact is the thing the token layer exists to delete.
// `text.field` carries the arm instead (tokens.json `$extensions["orb.pointerFine"]`), so the value is
// 16px on a finger and 15px on a mouse and NOTHING here has to know which.
//
// IT IS A SEPARATE TOKEN FROM `text.body`, NOT AN ARM ON IT: `[data-slot="message-bubble"]` reads
// `--text-body` for transcript prose, so a coarse arm there would enlarge all reading prose on touch and
// collide with the reader's own `--reading-body-scale` dial. The scale genuinely lacked a form-control
// step; this mints one rather than overloading the body step.
export const FIELD_CONTROL = `${FIELD_CONTROL_BOX} px-block text-field leading-field`;
