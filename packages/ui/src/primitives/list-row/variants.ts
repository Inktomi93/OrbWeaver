import { DISABLED_STATE, FOCUS_RING, tv } from "#lib";

// `body` is the ONE clickable/selected/disabled surface (a `group` parent so title/subtitle can flip
// color off `data-selected`); `actions` is a plain sibling slot that never inherits those states.
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
    title: "block min-w-0 flex-1 truncate text-left text-body font-medium leading-body text-foreground",
    // Rest-visible state markers on the title line, before the stamp (the mock's ⚔ / ★ / Archived cluster).
    // `shrink-0`: a glyph slot is already minimal — it must clip the TITLE, never itself.
    markers: "flex shrink-0 items-center gap-field",
    // Trailing title-line meta (e.g. relative-time): mono muted micro, never shrinks.
    meta: "shrink-0 whitespace-nowrap font-mono text-label leading-label text-muted-foreground",
    subtitle: "block truncate text-left text-label leading-label text-muted-foreground",
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
    //   · the backdrop paints only while revealed, so at rest nothing shows over the text; the wrapper is
    //     `pointer-events-none` (its revealed children re-enable themselves via ROW_REVEAL).
    float: {
      true: {
        actions: [
          "pointer-fine:pointer-events-none pointer-fine:absolute pointer-fine:inset-y-0 pointer-fine:end-0",
          "pointer-fine:rounded-control pointer-fine:ps-block pointer-fine:transition-colors",
          "pointer-fine:group-hover:bg-accent pointer-fine:group-focus-within:bg-accent",
        ],
      },
      false: {},
    },
    density: {
      default: { body: "min-h-control-md px-row py-field" },
      compact: { body: "min-h-control-sm px-field py-field" },
    },
    clickable: {
      true: {
        body: `cursor-pointer hover:bg-accent active:bg-accent/80 ${FOCUS_RING}`,
      },
      false: {},
    },
  },
  defaultVariants: { density: "default", clickable: false, float: false },
});
