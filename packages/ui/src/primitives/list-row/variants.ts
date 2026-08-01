import { DISABLED_STATE, FOCUS_RING_INSET, tv } from "#lib";

// `body` is the ONE clickable/selected/disabled surface (a `group` parent so title/subtitle can flip
// color off `data-selected`); `actions` is a plain sibling slot that never inherits those states.
//
// DENSITY — WHAT LIVES HERE AND WHAT DOES NOT: every class below is the TIER-LESS default (= the `form`
// step). The dense LIST-pane instrument steps — the row/atom gaps and the title/subtitle/meta type — are
// mapped in `styles/tiers.css` off `[data-surface-tier="instrument"]`, NOT spelled here. S5 shipped that
// retune in these variants and it was global by construction: the settings modal's nav rows went 15px →
// 13px without any surface ever declaring a tier (side-eye P1-3). A value that differs by tier belongs to
// the tier map; a value that is the same in both belongs here (the row box: `px-row py-field`,
// `rounded-control`, the min-heights, the truncation/reveal behaviour).
//
// The voices are spelled as classes rather than composed from <Text> because the row owns truncation,
// the hover reveal and the flex behaviour on the same nodes.
export const listRowVariants = tv({
  slots: {
    // `@container/list-row` lets a consumer's `actions` collapse responsively to the row's own width
    // (fold into a kebab via `@max-*/list-row` when tight).
    // `group/row` is the ROW-WIDE reveal group — NAMED because `body` below is itself an (unnamed) group, so
    // a marker living inside the content column can only key on the whole row's hover/focus-within through a
    // name (`group-hover/row:`). That is what lets a rest-visible marker yield to the revealed control that
    // carries the same datum (`ROW_REVEAL_SWAP`) instead of both painting at once.
    root: "@container/list-row group/row relative flex w-full min-w-0 items-center gap-row",
    // Keeps `min-w-0` so it can shrink and let `title`'s `truncate` engage — starvation is prevented by
    // `content`'s own `min-w-24` floor below (a floor RAISES a min-content contribution, so if it lived
    // here on `body` it would pin `body` to the title's full width and force a horizontal scrollbar in a
    // narrow panel; north-star N2). Selected reads as a 2px left ember bar + a 10% `--color-primary` tint
    // (rides the accent, so custom themes retint it), not a flat `--color-accent` fill (north-star §4 N2).
    body: [
      "group flex min-w-0 flex-1 items-center gap-row rounded-control border-l-2 border-l-transparent outline-none",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      `data-selected:border-l-primary data-selected:bg-primary/10 ${DISABLED_STATE}`,
    ],
    leading: "flex shrink-0 items-center justify-center text-muted-foreground",
    // `min-w-24` is the title-column floor: name/subtitle never collapse below a readable width, so
    // `actions` yields (shrinks + clips) instead.
    content: "flex min-w-24 flex-1 flex-col",
    // The title line: the truncating title, plus an optional trailing meta (relative-time) pinned to the
    // end so it never gets clipped by the title's truncate.
    titleRow: "flex min-w-0 items-baseline gap-field",
    // The tier-less title step (`body`); the tier map drops it to the `label` voice at 600 under an
    // instrument surface, which is where the mock's 12.5px/600 row name lives.
    title: "block min-w-0 flex-1 truncate text-left text-body font-medium leading-body text-foreground",
    // Rest-visible state markers on the title line, before the stamp (the mock's ⚔ / ★ / Archived cluster).
    // `shrink-0`: a glyph slot is already minimal — it must clip the TITLE, never itself.
    markers: "flex shrink-0 items-center gap-field",
    // Trailing title-line meta (e.g. relative-time): a quiet mono DATUM (tabular so a column of stamps
    // aligns), never shrinks. The tier map takes it to the `gloss` step under an instrument surface.
    meta: "shrink-0 whitespace-nowrap font-mono text-label leading-label tabular-nums text-muted-foreground",
    // Truncation is the `subtitleWrap` variant's default arm below (a one-line dense row), never baked in:
    // a GLOSS subtitle (a sentence of teaching copy) has to be allowed to wrap.
    subtitle: "block text-left text-label leading-label text-muted-foreground",
    // Hover/focus-within display-swap of the subtitle in the SAME line, so a wide metadata span never
    // contends with the trailing `actions` buttons for width.
    subtitleReveal: "hidden truncate text-left font-mono text-label leading-label text-muted-foreground group-focus-within:block group-hover:block",
    // `shrink-0`: controls keep their intrinsic width and are never squeezed below the tap-target floor.
    actions: "flex shrink-0 items-center justify-end gap-field",
  },
  variants: {
    // A cluster that is HIDDEN at rest must not spend the row's width on nothing: two ghost icon controls
    // reserve ~76px, which starves the title/subtitle in a 307px LIST pane (side-eye P1-2b). `float` lifts
    // the cluster OUT OF FLOW at the row's inline end so the text column keeps the full width at rest, and
    // the reveal costs no reflow — the meta stamp and the truncation point do not jump mid-read (the width-
    // transition alternative moves both by the cluster's width on every hover).
    //   · FINE pointers only: at coarse there is no hover, the cluster is permanently visible
    //     (`ROW_REVEAL`), so it stays IN FLOW and honestly spends its width instead of covering text.
    //   · the backdrop paints only while revealed, so at rest nothing shows over the text; the whole
    //     cluster is INERT at rest — the wrapper AND its controls (`*:pointer-events-none`; a child that
    //     re-declares `auto` stays hit-testable through a `pointer-events-none` parent, so the wrapper
    //     alone is not enough), both restored on the row's hover/:focus-within. This is where side-eye
    //     P3's "an invisible control must not be hit-testable" is enforced, because THIS is the arm where
    //     the hidden cluster sits over real text; an in-flow cluster overlays nothing and keeps a live hit
    //     target at rest (see `ROW_REVEAL`).
    float: {
      true: {
        actions: [
          "pointer-fine:pointer-events-none pointer-fine:*:pointer-events-none pointer-fine:absolute pointer-fine:inset-y-0 pointer-fine:end-0",
          "pointer-fine:group-hover:*:pointer-events-auto pointer-fine:group-focus-within:*:pointer-events-auto",
          "pointer-fine:rounded-control pointer-fine:ps-block pointer-fine:transition-colors",
          "pointer-fine:group-hover:bg-accent pointer-fine:group-focus-within:bg-accent",
        ],
      },
      false: {},
    },
    // A one-line dense row TRUNCATES (the default — a list pane scans by column). A row whose subtitle is
    // a SENTENCE (the home jump grid's per-section teaching gloss) clamps to two lines instead: a nowrap
    // ellipsis eats the second half of every sentence, which is the whole content of that row.
    subtitleWrap: {
      // The wrapping arm raises the leading: a two-line clamped sentence at the one-line step (1.25) has
      // its descenders nearly touching the next line's caps (side-eye P2-7). This is the one type property
      // the tier map deliberately leaves to the variants — an unlayered tier rule would outrank it.
      true: { subtitle: "line-clamp-2 leading-body" },
      false: { subtitle: "truncate" },
    },
    density: {
      default: { body: "min-h-control-md px-row py-field" },
      compact: { body: "min-h-control-sm px-field py-field" },
    },
    clickable: {
      true: {
        // FOCUS_RING_INSET, not FOCUS_RING: the offset form paints 4px OUTSIDE the row box (2px moat + 2px
        // ring), and a dense list stacks rows 4px apart (`gap-tight`) — the focused row's ring landed on
        // its neighbours (side-eye P3-9). The inset ring hugs the row's own edge, so the clearance is
        // structural instead of depending on the pane's row gap.
        body: `cursor-pointer hover:bg-accent active:bg-accent/80 ${FOCUS_RING_INSET}`,
      },
      false: {},
    },
  },
  defaultVariants: { density: "default", clickable: false, float: false, subtitleWrap: false },
});
