import { DISABLED_STATE, FOCUS_RING_INSET, SELECTION_RAIL, tv } from "#lib";

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
    // BOTH group spellings are load-bearing: `group/row` drives the named marker swaps below, while the
    // client-shared ROW_REVEAL posture and this variant's floated-action hit-test arm use the unnamed
    // `group-hover` / `group-focus-within` selectors. Dropping the unnamed group leaves the action painted
    // but pointer-inert over the clickable body (the body intercepts every attempted press).
    root: "@container/list-row group group/row relative flex w-full min-w-0 items-center gap-row",
    // Keeps `min-w-0` so it can shrink and let `title`'s `truncate` engage — starvation is prevented by
    // `content`'s own `min-w-24` floor below (a floor RAISES a min-content contribution, so if it lived
    // here on `body` it would pin `body` to the title's full width and force a horizontal scrollbar in a
    // narrow panel; north-star N2). Selected reads as a 2px left ember bar + a 10% `--color-primary` tint
    // (rides the accent, so custom themes retint it), not a flat `--color-accent` fill (north-star §4 N2).
    //
    // THE LEFT EMBER BAR IS OWNER-RATIFIED (2026-08-22, issue #485) AND ITS SPELLING LEFT THIS FILE (#1823).
    // `border-l-2` + `data-selected:border-l-primary` on a `rounded-control` row is the textbook shape of
    // design-audit's two §6 absolute bans (`side-tab` + `border-accent-on-rounded`), and it fired on every
    // list in the app — because it IS the app-wide selection idiom, not a decorative card tell. The owner
    // ruled it stands as shipped; design-audit carries the matching SCOPED exemption, keyed on slot identity
    // AND `data-selected` together (tooling/src/ui-audit/lib/checks-decor.ts + ops/walker/core.ts's
    // `SELECTION_RAIL_SEL`). Consequence for anyone editing here: the accent's CARRIER is part of the
    // exemption — moving it off the exempted slots, or painting it at rest instead of under `data-selected`,
    // re-reds the whole tree in the design audit.
    //
    // The two declarations now come from `SELECTION_RAIL` (lib/selection-rail.ts) because the idiom gained a
    // carrier that is NOT a ListRow — the config band, a `Button`, which cannot inherit it by composition
    // (#1823). Three hand-copies of a ratified pair is how a ratified pair drifts.
    body: ["group flex min-w-0 flex-1 items-center gap-row rounded-control outline-none", `${SELECTION_RAIL} ${DISABLED_STATE}`],
    leading: "flex shrink-0 items-center justify-center text-muted-foreground",
    // `min-w-24` is the title-column floor: name/subtitle never collapse below a readable width, so
    // `actions` yields (shrinks + clips) instead.
    content: "flex min-w-24 flex-1 flex-col",
    // The title line: the truncating title, plus an optional trailing meta (relative-time) pinned to the
    // end so it never gets clipped by the title's truncate.
    titleRow: "flex min-w-0 items-baseline gap-field",
    // The tier-less title step (`body`); the tier map drops it to the `label` voice at 600 under an
    // instrument surface, which is where the mock's 12.5px/600 row name lives.
    //
    // `flex-1` is the BLOCK-subtitle arm's growth (the title owns the whole line); the INLINE arm below
    // replaces it with a min-width floor, because a `flex-1 min-w-0` title beside a `shrink-0` sibling
    // collapses to ZERO width — the P0 that hid three Actions row names outright (side-eye F-01).
    title: "block min-w-0 flex-1 truncate text-left text-body font-medium leading-body text-foreground",
    // THE TITLE'S DISAMBIGUATOR (`titleQualifier`) — rendered right after the name, in the quiet mono datum
    // treatment the same handle already wears in the row's hover reveal. `shrink-0`: the qualifier is the
    // half that TELLS TWO ROWS APART, so a squeeze must eat the name (which is identical across them
    // anyway), never the thing that separates them.
    titleQualifier: "shrink-0 whitespace-nowrap font-mono text-label leading-label text-muted-foreground",
    // Rest-visible state markers on the title line, before the stamp (the mock's ⚔ / ★ / Archived cluster).
    // `shrink-0`: a glyph slot is already minimal — it must clip the TITLE, never itself.
    markers: "flex shrink-0 items-center gap-field",
    // Trailing title-line meta (e.g. relative-time): a quiet mono DATUM (tabular so a column of stamps
    // aligns), never shrinks. The tier map takes it to the `gloss` step under an instrument surface.
    meta: "shrink-0 whitespace-nowrap font-mono text-label leading-label tabular-nums text-muted-foreground",
    // Truncation is the `subtitleWrap` variant's default arm below (a one-line dense row), never baked in:
    // a GLOSS subtitle (a sentence of teaching copy) has to be allowed to wrap.
    subtitle: "block text-left text-label leading-label text-muted-foreground",
    // The subtitle ⇄ reveal SWAP STACK: ONE grid cell holding both spans (`col-start-1 row-start-1`), so the
    // line's box is `max(subtitle, reveal)` and is IDENTICAL at rest and on hover. The swap itself is
    // VISIBILITY, never display — a hover-keyed `display` swap removes a box from layout under a stationary
    // pointer and re-hit-tests the row at frame rate (the preset-list P0; packages/client/src/components/
    // row-reveal.ts, gate `no-hover-display-swap`). Rendered only when a reveal is present, so a plain row's
    // DOM is untouched.
    subtitleStack: "grid min-w-0",
    // Hover/focus-within swap of the subtitle in the SAME line, so a wide metadata span never contends with
    // the trailing `actions` buttons for width.
    subtitleReveal:
      "col-start-1 row-start-1 invisible truncate text-left font-mono text-label leading-label text-muted-foreground group-focus-within:visible group-hover:visible",
    // `shrink-0`: controls keep their intrinsic width and are never squeezed below the tap-target floor.
    actions: "flex shrink-0 items-center justify-end gap-field",
  },
  variants: {
    // THE STACKING ARM (#2486). A row whose controls are REST-VISIBLE cannot buy the identity any width by
    // hiding them, and below roughly twice the cluster's own width the two stop fitting on one line at all:
    // at the 486px settings body the connections row rendered a 52-character name as
    // "local-light · encoder · jinaai…" while the switch beside it spelled its own label in full. Truncating
    // the row's IDENTITY to keep its controls inline is the wrong trade at every width — the name is the only
    // thing that says which row this is.
    //
    // SO THE CLUSTER TAKES A LINE OF ITS OWN, which is what `connections/list.html` Board D draws ("the 486
    // arm is a STACK, not a squeeze"): identity full width, switch and kebab below it, the switch keeping its
    // shipped silhouette instead of shrinking. `basis-full` on a wrapping flex row IS the whole mechanism —
    // the same one `save-bar` uses for its census slot — so nothing is hidden, abbreviated or put behind a
    // tap, and the ROW'S DOM IS UNCHANGED: `actions` stays a SIBLING of the body, never folded into it, which
    // is the #512 accessible-name contract this primitive's header records (`list-row.tsx:1-10`).
    //
    // THE THRESHOLD IS THE **ROW'S** WIDTH, NEVER THE VIEWPORT'S — `@lg/list-row` against the `@container/
    // list-row` the root already declares. The same pane is 830px wide with one panel open and 440px with two,
    // at ONE viewport; a media query cannot tell those apart, and pinning that difference is why the CT mounts
    // two rows of different widths at the same viewport size. Written MOBILE-FIRST (stacked is the arm's base,
    // `@lg` restores the inline row) because a `@max-` cancel has to win a specificity contest against the
    // rule it cancels, and this way there is no contest at all. 32rem is where the identity stops being able
    // to hold its own: the cluster is ~220px (switch + gloss + kebab), so an inline row narrower than twice
    // that gives the name less width than its controls.
    //
    // OPT-IN, NOT AUTOMATIC: a row whose cluster is reveal-gated (`float`) already keeps the full width at
    // rest and must not wrap — the two arms answer the same squeeze in mutually exclusive ways.
    stackActions: {
      true: {
        root: "flex-wrap",
        actions: "basis-full justify-between @lg/list-row:basis-auto @lg/list-row:justify-end",
      },
      false: {},
    },
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
          "pointer-fine:rounded-control pointer-fine:ps-block",
          "pointer-fine:group-hover:bg-accent pointer-fine:group-focus-within:bg-accent",
        ],
      },
      false: {},
    },
    // WHERE the subtitle sits. `block` (the default) is the two-line entity row every landed list speaks.
    // `inline` puts the subtitle on the TITLE LINE, right after the name — the instrument-row grammar the
    // preset mocks draw for the rack (`prompt-rack.html`: name + scent on one line) and the Actions list
    // (`actions-and-sections.html`: a fixed name column, then the fires gloss at `1fr`, truncating).
    //
    // The inline arm is where the F-01 P0 is fixed structurally: the SUBTITLE takes the flexing column and
    // truncates, and the TITLE keeps a `min-w-24` floor — the identifier can shorten but can never reach
    // 0px, whatever the gloss is. Both slots are consumed by `titleRow`'s flex, so this is a layout swap,
    // never a second markup path (`ListRowContent` renders the same span in a different parent).
    //
    // `column` IS THE MOCK'S ACTUAL SPEC, and the `inline` arm only approximated it (side-eye R-7 / F-7
    // half-fixed). `inline` sizes the title to its CONTENT (`flex-none … shrink`), so down a deck of rows
    // the subtitle starts wherever each name happens to end — measured on the Actions list: five different
    // left edges across 33px (487…520) in one column, with the description (the only cell that
    // discriminates the rows) clipped on the five longest. `column` pins the name cell to the shared
    // `--width-label-col` so every row's gloss starts at ONE x and gets ONE width, which is what
    // "a fixed name column, then the gloss at 1fr" meant. The name still truncates inside its cell; it can
    // simply no longer steal the gloss's width. Pinned by computed geometry in
    // tests/client/features/preset/components/actions-view.ct.tsx.
    subtitlePlacement: {
      block: {},
      inline: {
        title: "flex-none min-w-24 shrink",
        // NO `truncate` here (2026-08-08): the base slot's own comment already says truncation belongs to
        // the `subtitleWrap` axis "never baked in", and a `truncate` baked into the PLACEMENT arm silently
        // beat the wrapping arm's `line-clamp-2` (`truncate` carries `whitespace-nowrap`, which collapses a
        // clamp to one line — the two utilities are not in the same tailwind-merge conflict group, so
        // neither dropped the other). Placement decides the COLUMN; `subtitleWrap` decides one line or two.
        subtitle: "min-w-0 flex-1",
      },
      // `w-…` is the BASIS and `shrink` is kept deliberately: under a phone-width squeeze every row's name
      // cell shrinks by the same factor from the same basis, so the shared left edge survives the squeeze
      // instead of only existing at desk widths — and `min-w-24` keeps the F-01 floor (a name may shorten,
      // never vanish) that `flex-none` alone would have traded away for a horizontal scrollbar.
      column: {
        title: "w-(--width-label-col) flex-none min-w-24 shrink",
        subtitle: "min-w-0 flex-1",
      },
    },
    // A one-line dense row TRUNCATES (the default — a list pane scans by column). A row whose subtitle is
    // a SENTENCE (the home jump grid's per-section teaching gloss) clamps to two lines instead: a nowrap
    // ellipsis eats the second half of every sentence, which is the whole content of that row.
    subtitleWrap: {
      // The wrapping arm raises the leading: a two-line clamped sentence at the one-line step (1.25) has
      // its descenders nearly touching the next line's caps (side-eye P2-7). This is the one type property
      // the tier map deliberately leaves to the variants — an unlayered tier rule would outrank it.
      true: { subtitle: "line-clamp-2 leading-label-relaxed" },
      false: { subtitle: "truncate" },
    },
    // THE ROW-TITLE STEP (added 2026-08-16, side-eye #102 F8). `default` is the tier's own step — `body`
    // at form, `label` at instrument — and stays the answer for every dense list. `promoted` is the
    // opt-in for a list whose rows ARE the surface's content rather than a directory of it: home's
    // also-open rooms, which the approved ramp assigns `title` (16px). Without it the six-step ramp had
    // NO title step in use anywhere on that page, so the rooms and the shelf glosses sat one 2px hair
    // apart and the block read flat.
    //
    // THE CLASS ALONE CANNOT WIN: `tiers.css` sets `font-size` on `[data-surface-tier]
    // [data-slot="list-row-title"]` UNLAYERED, and an unlayered rule beats every Tailwind utility
    // regardless of specificity — so inside any `<Surface>` a `text-title` here would silently resolve to
    // the tier's step. The step therefore ships as a `data-title-step` attribute the tier map reads
    // (tiers.css), and the class below is only the TIER-LESS arm, for a row rendered outside every
    // Surface. Pinned by computed value, never by reading either file.
    titleStep: {
      default: {},
      promoted: { title: "text-title leading-title font-semibold" },
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
    // WHICH box wears the row's hover/selected tint. `body` (the default) is right whenever the trailing
    // cluster is floated INTO the body's box or absent — the tint spans everything the eye reads as the row.
    // `row` moves it to the ROOT, for a row that RESERVES an in-flow trailing strip: the strip is a sibling
    // OUTSIDE the body, so a body-painted tint stops short of it and the highlight reads as a truncated
    // band with the controls stranded on the pane background. Painting the root is what lets the glyphs ride
    // the row's own tint instead of the cluster minting a second, darker panel of its own — the box-in-box
    // double highlight (preset crunch-list item 18). The body's own tint is neutralized in this arm (both
    // are `hover:bg-*` utilities, so tailwind-merge resolves them; two painted boxes would double the alpha).
    rowTint: {
      body: {},
      row: {
        root: ["rounded-control pe-row", SELECTION_RAIL],
        body: "rounded-none border-l-0 hover:bg-transparent active:bg-transparent data-selected:bg-transparent data-selected:border-l-transparent",
      },
    },
  },
  compoundVariants: [
    {
      clickable: true,
      rowTint: "row",
      class: { root: "cursor-pointer hover:bg-accent active:bg-accent/80" },
    },
  ],
  defaultVariants: {
    density: "default",
    clickable: false,
    float: false,
    stackActions: false,
    subtitleWrap: false,
    subtitlePlacement: "block",
    rowTint: "body",
    titleStep: "default",
  },
});
