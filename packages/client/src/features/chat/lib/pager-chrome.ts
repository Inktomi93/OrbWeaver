// THE PAGER'S GEOMETRY VOCABULARY — one home for the class strings the two message-column swipe strips
// (`swipe-strip.tsx`, `greeting-swipe-strip.tsx`) share. Both file headers already state the law this
// module makes structural: the two strips are different components with different sources and verbs, but
// ONE chrome — "to a reader they are one gesture" (message-row-parts.tsx `renderRowSwipe`). Geometry that
// lived as a literal in each file could drift; a shared constant cannot.
//
// ── WHAT THE PAGER IS SIZED AGAINST (#598 → #608) ────────────────────────────────────────────────────
// The chip sits under a bubble in the content column, and that column resolves to the max-content of its
// widest child (the bubble family's row outer is `items-start`, so the row body shrink-wraps — the #245
// note on message-row.tsx). Two rules follow, and they are the whole of this module:
//
//   1. THE CHIP MAY NOT SIZE THE COLUMN. `PAGER_TRACK` is an inline-size container: its width resolves
//      WITHOUT regard to its contents, so it contributes nothing upward and still stretches to whatever
//      the bubble set. #598's measured defect was the other way round — a 177.5px chip under a 132px
//      bubble made the COLUMN 177.5px, and the pager hung 45px past the box it pages.
//
//   2. THE CHIP MAY NOT BE CRUSHED. #608 (side-eye, measured in the room at a coarse pointer): with the
//      track containing the column, a `w-fit` chip took the BUBBLE's width as its available size and its
//      flex children absorbed the deficit — chevrons squeezed to 41.41×48 (under the app's own 48px coarse
//      box AND WCAG 2.5.5's 44px floor) and the counter wrapped to two lines. So the chip is `w-max`
//      (`PAGER_CHIP`): it takes its content's width, full stop, and the CONTAINED track absorbs any
//      overflow — the column is unaffected either way, which is exactly what rule 1 bought.
//
// Between those two, the chip stands down in two steps as its track narrows, so that "never overhangs"
// holds as far down as it can be held (the thresholds below). Below the last step the chip stops
// shrinking: two 44px-minimum targets plus a counter cannot fit an 89.67px bubble at any spelling, and
// when the two properties finally collide, WCAG 2.5.5 outranks flushness. See the module's threshold
// derivations for the measured floors.
//
// ── WHY LITERAL LENGTHS ─────────────────────────────────────────────────────────────────────────────
// A container query condition cannot read a custom property (`var()` is invalid in `@container`/`@media`
// conditions), so these thresholds cannot ride the spacing tokens the chip itself is built from. They are
// DERIVED from measured chip widths (below) and carry their derivation in this file. They are also not the
// `no-arbitrary-tw-values` shape: that gate judges a class's TERMINAL segment (`sr-only`, `hidden`,
// `gap-tight`), and these are variants.
//
// ── WHY THE STAND-DOWNS ARE WIDTH-KEYED, NOT POINTER-KEYED (deviation, stated) ──────────────────────
// The crush #608 filed is a COARSE symptom (the 48px box is `--spacing-control-md` at a coarse pointer,
// 34px at fine), so the obvious spelling is a pointer-conditional rule. Two things forbid it: a container
// query cannot test a pointer, and `no-pointer-variants-in-features` bans `pointer-coarse:` in a feature
// className outright (device capability is TOKEN/SHELL-tier, owner ruling 2026-08-07). Keying on the
// TRACK's width instead is not a workaround but the more honest rule: the chip compacts when its box is
// tight, whatever made it tight. The thresholds are then chosen so that BOTH pointers' chips fit their
// band — which is what makes one number serve two pointer geometries.

/** The pager TRACK: an inline-size container, full column width, no paint. Rule 1 above. Named `pager`
 *  so the stand-downs below resolve against THIS box and never the message row's own `@container`. */
export const PAGER_TRACK = "@container/pager";

/** The chip itself takes its CONTENT's width — never the track's. Rule 2 above: a chip narrower than its
 *  controls is how the 41.41px chevron happened, and the plate would then paint behind only part of the
 *  cluster it exists to back (#221's legibility chip over wallpaper).
 *
 *  `ms-auto`, NOT `self-end` — and the difference is only visible in the overflow case, which is why the
 *  first cut of #608 shipped `self-end` and the rendered receipt caught it. Both spellings put the chip on
 *  the trailing edge while it FITS (#312 is untouched: same right edge as the row's action cluster). When
 *  the chip is wider than its track, `align-self: flex-end` overflows towards the START — measured at
 *  x = −47px, i.e. the ‹ chevron rendered off the pane's left edge, unclickable: a control that is legally
 *  sized and unreachable is worse than the crushed one this issue set out to fix. An AUTO margin resolves
 *  to zero when free space is negative, so the same chip overflows towards the END instead — into the
 *  column's own empty room, where both chevrons stay on screen. */
export const PAGER_CHIP = "ms-auto w-max";

/** STEP 2 — below 12rem (192px) the "Variant" kicker leaves the FLOW but stays in the a11y tree
 *  (`sr-only` is absolutely positioned ⇒ zero width contribution, and an abspos child is not a flex item
 *  at all, so its gap goes with it). DERIVED: the widest chip that may carry the word is the coarse
 *  compact one — 2 × 48px chevron + 52.41px kicker + 23.5px compact counter + 3 × 4px gap = 183.91px — so
 *  192px is the next clean step that still contains it; at a fine pointer the same band holds with 28px
 *  to spare (155.91px). #490's ruling survives, its INPUT changed: the sighted reader is told what the
 *  control is wherever the surface can hold the word, and `sr-only` (not `hidden`, #608) is what keeps
 *  the screen-reader half of that ruling TRUE in the narrow arm — the a11y text stays "Variant 2 / 3". */
export const PAGER_LABEL_QUIET_WHEN_TIGHT = "@max-[12rem]/pager:sr-only";

/** STEP 1 — below 13rem (208px) the chip compacts: `gap-tight` (4px) instead of `gap-field` (6px), and
 *  the counter drops the spaces around its slash (see `PAGER_SEPARATOR_*`). DERIVED from the widest chip
 *  that may exist ABOVE this line — the coarse chip with its kicker and roomy counter, 2 × 48 + 52.41 +
 *  39.14 + 3 × 6 = 205.55px — which 208px contains; below it every chip is compact, which is what lets
 *  the 12rem kicker line above be a single number for both pointers. */
export const PAGER_CHIP_COMPACT = "@max-[13rem]/pager:gap-tight";

/** The counter, compacted on the SAME line as the gap. It keeps its text — `2 / 3`, the spelling
 *  `density-pass-spec.md` §2.3's datum voice was tuned with and the string every existing pin matches on —
 *  and surrenders only the two spaces AROUND the slash, which is 15.64px of the 39.14px counter and the
 *  difference between a chip that fits a 128.58px room bubble and one that does not.
 *
 *  `word-spacing: -1ch` is the exact spelling of that, not an approximation: `ch` is the advance of `0` in
 *  the element's own font and the datum voice is TABULAR MONO, where the space glyph carries that same
 *  advance — so each space collapses to precisely zero in whatever font a theme supplies. The rejected
 *  alternatives are worth naming: splitting the slash into its own node with token padding cannot match
 *  the 7.82px space it replaces (nearest token is 4px), and a two-node `display` swap changes
 *  `textContent` to `2 / /3`, which breaks every `getByText("2 / 3")` pin on the tree (measured — the
 *  probe timed out on exactly that). An arbitrary PROPERTY is not the `no-arbitrary-tw-values` shape
 *  either: that gate matches `<utility>-[<value>]`, and this token has no utility segment at all.
 *
 *  `whitespace-nowrap` states the one-line invariant LOCALLY. `PAGER_CHIP` already removes the shrink
 *  pressure that wrapped this counter in #608's receipt, but "the counter is one line" is the property the
 *  pins assert, and it should not be a downstream consequence of an ancestor's width keyword. */
export const PAGER_COUNTER = "whitespace-nowrap @max-[13rem]/pager:[word-spacing:-1ch]";
