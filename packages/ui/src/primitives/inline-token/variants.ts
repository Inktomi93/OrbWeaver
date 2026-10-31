import { TONE_ARMS, tv } from "#lib";

// A chip that behaves like a word in a run of prose (a `{{macro}}` token in a preview). It paints the soft tone roles:
// the opaque tint and the on-tint ink.
//
// Four properties keep it a word, not a lozenge:
// - `inline` joins the line box. A flex box taller than its line shoves the neighbouring lines apart.
// - No padding and no border on either axis. The braces the token prints are its own optical padding, and an inline box's
//   side padding or border is real advance that detaches the next punctuation (`{{user}} 's voice`).
// - No type axes. Font size and line height inherit from the run, so the line rhythm is unchanged.
// - It stays selectable. A token inside quoted wire text must survive a copy, so the pill's `select-none` does not apply.
//
// The radius steps to the sub-control mark, because a full pill on a text-height box reads as a lozenge. Preflight
// blockifies every `svg`, and a block child splits an inline box in two, so a leading glyph re-inlines itself, centres on
// the x-height and takes its gap as a margin (`gap` is a flex property).
export const inlineTokenVariants = tv({
  base: `
    inline rounded-inset bg-tone-tint font-medium whitespace-nowrap text-tone-text-on-tint select-text
    [&>svg]:me-field [&>svg]:inline-block [&>svg]:align-middle
  `,
  variants: { tone: TONE_ARMS },
  defaultVariants: { tone: "neutral" },
});
