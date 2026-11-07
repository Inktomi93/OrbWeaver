import { TONE_ARMS, tv } from "#lib";

// A chip that behaves like a word in a run of prose (a `{{macro}}` token in a preview). It paints the soft tone roles:
// the opaque tint and the on-tint ink.
//
// Four properties keep it a word, not a lozenge:
// - `inline` joins the line box. A flex box taller than its line shoves the neighbouring lines apart.
// - Side padding at the `tight` spacing token, and no border or block padding. A dice stamp prints no braces, so its text
//   would touch the tint edge; an inline box's block padding or border would change the line box.
// - No type axes. Font size and line height inherit from the run, so the line rhythm is unchanged.
// - It stays selectable. A token inside quoted wire text must survive a copy, so the pill's `select-none` does not apply.
//
// The radius steps to the sub-control mark, because a full pill on a text-height box reads as a lozenge. Preflight
// blockifies every `svg`, and a block child splits an inline box in two, so a leading glyph re-inlines itself, centres on
// the x-height and takes its gap as a margin (`gap` is a flex property).
export const inlineTokenVariants = tv({
  base: `
    inline rounded-inset bg-tone-tint px-tight font-medium whitespace-nowrap text-tone-text-on-tint select-text
    [&>svg]:me-field [&>svg]:inline-block [&>svg]:align-middle
  `,
  variants: {
    // A token that leads a run of words keeps a `field` step before them, which a word space alone does not give a chip.
    leads: { true: "me-field", false: "" },
    tone: TONE_ARMS,
  },
  defaultVariants: { tone: "neutral" },
});
