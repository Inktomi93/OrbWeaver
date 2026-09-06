// layout/ is the gate-allowlisted home that DEFINES the spacing-intent mapping; features consume the variants.
import { DISABLED_STATE_NATIVE, FOCUS_RING, tv } from "#lib";

const GAP = {
  // The small-end step (UI-Density-Law.md §2.2/D2): ATOM gaps inside an island — label↔bar,
  // glyph↔text, value↔caption. Below `field`; not a surface/block rhythm, so it has no PADDING twin.
  tight: "gap-tight",
  field: "gap-field",
  row: "gap-row",
  block: "gap-block",
  section: "gap-section",
  gutter: "gap-gutter",
} as const;

const PADDING = {
  field: "p-field",
  row: "p-row",
  block: "p-block",
  section: "p-section",
  gutter: "p-gutter",
} as const;

const ALIGN = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
  baseline: "items-baseline",
} as const;

const JUSTIFY = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
} as const;

export const stackVariants = tv({
  base: "flex flex-col",
  variants: {
    gap: GAP,
    align: ALIGN,
    justify: JUSTIFY,
    padding: PADDING,
    // THE ROW-PITCH FLOOR (#884 C3 — #850's class: rows of floorless inline-edit affordances stacked at a
    // sub-floor pitch, so a Button's hit pseudo overflows onto the NEIGHBOUR ROW'S TEXT and loses
    // hit-testing to it; 28 P1 tap-targets on one rpg tab). `control` floors every DIRECT child at the
    // pointer-conditional `--spacing-control-sm` (44px coarse / 32px fine — clears design-audit's 24px fine
    // floor), so each row seats its own controls' hit areas instead of lending them to the row below. One
    // token at the container, because no control primitive can own PITCH and a per-row `min-h-*` is the
    // N-site spelling of the same fact (gate `no-floorless-control-in-wrap`, the vertical-pitch arm).
    rows: { control: "*:min-h-control-sm" },
  },
});

export const rowVariants = tv({
  base: "flex flex-row items-center",
  variants: { gap: GAP, align: ALIGN, justify: JUSTIFY, padding: PADDING },
});

// One-cell overlay stack (see layer.tsx). A single explicit `1fr`-free track that every child is placed
// into by name, so the column sizes to the WIDEST child and each child stretches to it. No `gap` axis: one
// cell has nothing to space, and no `align`/`justify` — each overlaid child brings its own (they are Rows
// and Stacks). `col-start-1`/`row-start-1` are real utilities on purpose: the equivalent `[grid-area:1/1]`
// would be an arbitrary property in a file features read from.
export const layerVariants = tv({
  base: "grid grid-cols-1 grid-rows-1 *:col-start-1 *:row-start-1",
});

// No external `py` — a Section pads its own content but leaves between-section spacing to the
// container's `gap` (padding-as-margin double-counts against gap). Space sections via Stack/Grid gap.
export const sectionVariants = tv({
  slots: {
    root: "flex flex-col gap-block",
    heading: "font-medium text-foreground text-title leading-title",
    // inline-flex so the hint trigger sits on the heading's baseline instead of dropping to its own line
    // (mirrors the Field label/hint row, field/variants.ts).
    headingRow: "inline-flex items-center gap-field",
    // The KICKER band (UI-Density-Law.md §2.3/§4.3): a caps micro label + a hairline rule running to the
    // edge. This is the CD1 replacement for a box — a read-only grouping gets a name and a rule, never a
    // border+radius+bg. The type itself is the `kicker` VOICE on a real <Heading> (one spelling, in
    // text/variants.ts); only the band's layout lives here.
    kickerRow: "flex items-center gap-field",
    hintTrigger: "text-muted-foreground hover:text-foreground",
  },
  variants: {
    // A hairline under the section heading — reads as a header edge over its rows, not a floating label.
    divider: {
      true: { heading: "border-border border-b pb-field" },
    },
    // THE TWO SPELLINGS OF ONE CD1 GROUPING (added 2026-08-17, program #102 variant B). `stacked` is the
    // literal reading: the kicker stands on its own line with a rule running to the edge. `inline` moves
    // the rule ABOVE the group as the section's own `border-top` and lets the kicker LEAD the control
    // line — same two marks, same mechanism, ~17px per group cheaper, which on a 291px LIST pane is a
    // whole chip row. MEASURED on the characters pane, whose two groups this shipped for: naming both of
    // them cost **+2px** of chrome above the first row (260.25 → 262.25 at the docked width, pinned in
    // tests/client/features/character/surfaces/character-library-surface.ct.tsx) against the +22px the
    // stacked spelling costs — on a pane already spending 38.6% of its height on chrome.
    //
    // The root itself becomes the wrapping control line, so the kicker is a flex ITEM of the group rather
    // than a block above it; `gap-tight` is the atom gap those controls sit at (a rail of chips is atoms,
    // not blocks) and the `pt-row` is the breathing room under the rule.
    kickerLayout: {
      stacked: {},
      inline: {
        root: "flex-row flex-wrap items-center gap-tight border-border border-t pt-row",
        kickerRow: "mr-field shrink-0",
      },
    },
  },
  defaultVariants: { kickerLayout: "stacked" },
});

/** Responsive auto-fit columns: children tile as many columns as fit at the min width, then reflow down to one. */
export const gridVariants = tv({
  base: "grid",
  variants: {
    gap: GAP,
    cols: {
      auto: "grid-cols-[repeat(auto-fit,minmax(min(16rem,100%),1fr))]",
      wide: "grid-cols-[repeat(auto-fit,minmax(min(22rem,100%),1fr))]",
      // Dense compact tiles (the OSRS stat-cell / attribute grid, Context-Panel-Program §3.2): a narrow
      // min so the CONTEXT panel tiles stat cells 2-up at the 17rem floor, 3-up when it has room.
      tile: "grid-cols-[repeat(auto-fit,minmax(min(5rem,100%),1fr))]",
      // Item-cell density (the pack grid). The 3.5rem SQUARE this used to be tiled 5-up
      // but carried only a 20px glyph inside a 59px card: mostly empty box, with the item's location
      // truncated to "belt p…" and the ×N a lost corner digit (owner dogfood, 2026-07-31). An 8.5rem min
      // tiles 2-up at the 320px mobile column and 3-up in the 480px docked CONTEXT panel, at a card SHORTER
      // than the old square — the wasted space goes and the datum (name · ×N · where it's kept) fits.
      cell: "grid-cols-[repeat(auto-fit,minmax(min(8.5rem,100%),1fr))]",
      // A DELIBERATE TWO-COLUMN ROW whose second column is NOT optional (the preset drill-ins' DELIVERY and
      // PLACEMENT rows — role beside depth, zone beside order). Every other arm here is auto-FIT, which
      // COLLAPSES a track holding no item: a conditionally-rendered second field (O-9's depth/order, absent
      // on the Relative arm) therefore doubles the surviving control's width the instant it disappears, and
      // the row re-flows under a field the user never touched. Two explicit halves hold the same geometry in
      // BOTH arms. The container query — not a viewport breakpoint — stacks them back to one column in a
      // narrow pane, so the row answers to the pane it lives in; an ancestor `<Container>` is required
      // (an element cannot query itself).
      pair: "grid-cols-1 @md:grid-cols-2",
      // THE SETTINGS-ROW TRACK SET (#932) — four tracks a whole SECTION of rows shares by subgrid:
      // [label+gloss | control | reserved action cell | slack]. It is not a tiling and not a ratio, so no
      // arm above can express it, and the SIZING IS THE FIX: a settings row's control starts at a column
      // the TOKEN decides, so the distance from a name to its control stops being a function of the PANE.
      // That distance was the defect — `row-void` fired 8x on Config at 63-77% of the row in every pane
      // state EXCEPT the one that narrowed the content column to ~520px (#1099 G6), i.e. it was
      // `justify-between` against a window width. MEASURED after: 0 row-void findings in ALL FOUR pane
      // states, and the label-to-control gap on the Appearance pane went 557px -> 34px.
      //
      // FIXED tracks at `width.control-col`, not intrinsic ones — and the three arms were all measured,
      // so do not "improve" this back:
      //   · a bare `max-content` label track has a max-content BASE size, so every item spanning it dumps
      //     its full intrinsic contribution there. With a real section attached the tracks resolved to
      //     `855px 0px 16px 0px` inside a 545px group: the label track swallowed a textarea row's
      //     max-content, the control track collapsed to ZERO, its number input measured 0px wide, and the
      //     row overflowed its own group by 362px.
      //   · `fit-content(width.label-col)` (9.5rem, the knob deck's column) clamps the blow-out but is too
      //     narrow for a settings row's NAME: it wrapped five of fifteen Chat-behavior labels to two lines
      //     ("Send continues the reply", "Empty Enter generates a reply", "Auto-swipe short replies",
      //     "Custom stopping strings", "Offer choices in new chats"). A track set that tightens a row must
      //     not do it by breaking the row's name.
      //   · `fit-content(width.control-col)` fixes the wrapping but sizes each SECTION to its own longest
      //     label, so the Appearance pane still showed three control edges (799 x10 / 788 x5 / 747 x1) and
      //     its canvas section's action cells sat 278px left of every knob row's.
      //   · FIXED — this arm — gives the Appearance pane ONE control edge (799 x16) and ONE action edge
      //     (827 x20), and Chat behavior 799 x15 / 827 x15, against the re-drive's five and four. A fixed
      //     track also contributes nothing to intrinsic sizing, so the blow-out above is unrepresentable.
      // The cost is stated rather than hidden: the LONGEST LABEL no longer sets the column, the token
      // does. That is sound only while the token is wider than every converted label — verified on both
      // converted panes — and a label that outgrows it wraps rather than pushing its neighbours.
      //
      // The FOURTH track is the `minmax(0,1fr)` SLACK: it absorbs the block's leftover width so the three
      // real tracks stay LEFT-PACKED, and it gives a full-span row — a canvas, a picker, a composite's
      // dependents — a real width to lay out in.
      //
      // Below the container step the whole thing drops to ONE column and every subgrid in the chain (row,
      // then Field) inherits that — the narrow arm is a container query on the group, never a per-row flip
      // and never a viewport media query. Requires an ancestor `<Container>`; `SettingRowGroup` renders one
      // (an element cannot query itself).
      settingTrack: "grid-cols-1 @lg:grid-cols-[var(--width-control-col)_var(--width-control-col)_auto_minmax(0,1fr)]",
      // `pair`'s THREE-column sibling, same contract and same reason (added 2026-08-19, the refinery
      // teaching flow). Three cells that are ONE sequence — Score → Rewrite → Analyze — must be equal
      // bases: as a wrapping flex row of content-sized cards they measured 279/384/482px, i.e. the three
      // steps of one pipeline drawn as a staircase, with the longest sentence claiming the most emphasis.
      // Auto-fit cannot express it (a track holding a short cell collapses, which is the staircase again);
      // an explicit 3 makes each step exactly a third of the row. Container-queried, `pair`'s precedent:
      // below the step the cells stack to one column rather than crushing three sentences into thirds of a
      // phone. Requires an ancestor `<Container>` — an element cannot query itself.
      triple: "grid-cols-1 @md:grid-cols-3",
      // A DOMINANT LEAD column beside a companion RAIL (added 2026-08-16, program #102 — the landing/
      // reading shape). Every arm above is auto-FIT: equal tracks, count chosen by width. This one is
      // deliberately UNEQUAL and its two tracks are both required — a lead column you read and a rail you
      // reach into. `fr` on both, no max-width cap, so the pair FILLS its pane instead of centring inside
      // it; the lead's own prose caps itself at `--reading-measure-prose` (#1145 — the teaching/body
      // measure; the transcript keeps the wider `--reading-measure`), which is where a measure belongs (on
      // the paragraph, not on the page).
      //
      // CONTAINER-query driven, `pair`'s precedent: one column until the pane can genuinely hold two, and
      // at a very wide pane the RAIL widens rather than the lead's line stretching past its measure — a
      // bigger monitor should put more of the surface in reach, not print a longer line. The @min-[100rem]
      // step is a raw container width because the container scale stops at @7xl (80rem) and this shape's
      // second breath is measurably later than that.
      lead: "grid-cols-1 @4xl:grid-cols-[1.55fr_1fr] @min-[100rem]:grid-cols-[1.5fr_1.05fr]",
      // `lead`'s SECOND BREATH, taken all the way to EVEN (added 2026-08-18, #226). Same landing/reading
      // shape and the same two required tracks — it differs only in what the >=100rem step resolves to,
      // and it exists because `lead`'s 1.5fr/1.05fr leaves a rail whose own content is WIDTH-DRIVEN
      // stranded a whole block short of the lead column. Measured on home's shipped registry (the
      // width x appearance matrix in tests/client/features/home/surfaces/home-column-balance.ct.tsx):
      // the rail's fixed-cell shelf drops from 3-per-row to 6-per-row and its footnote pair goes 2-up, so
      // the two columns' feet come from 180px/192px/228px apart to 11px/3px/11px at a 1920/2560 pane —
      // i.e. the rail stops being the thing that decides the page's height. `grid-cols-2` (a real
      // `minmax(0,1fr)` pair) rather than `1fr 1fr`, so neither track is floored at its content's
      // min-content width — the same trap `lead` needs `min-w-0` children to survive.
      //
      // It is a SEPARATE ARM, not a retune of `lead`, because `lead` has two other consumers
      // (discovery's corpus home, and — until #1210 retired it — config's welcome hearth) whose content is not
      // width-driven the way a face shelf is; changing the value under them would be a shared-value change with
      // no measurement behind it. Reach for `leadEven` when the RAIL carries reflowing cell grids, `lead`
      // when it carries prose.
      leadEven: "grid-cols-1 @4xl:grid-cols-[1.55fr_1fr] @min-[100rem]:grid-cols-2",
      // `lead`'s EARLIER FIRST BREATH (added 2026-08-18, #244 P1-2). Identical tracks at both steps; it
      // differs only in WHEN the split engages — `@3xl` (48rem/768px) instead of `@4xl` (56rem/896px).
      //
      // It exists because 896px is a width the pane never has. Measured on the shipped default view
      // (`snap / --goto corpus`, 1280 viewport, LIST pane docked + CONTEXT pane collapsed, re-measured after
      // the #242 both-docked squeeze): the corpus overview's `@container` resolves to 868.81px, so the
      // designed composition — the focal island beside its readiness rail — missed by 27px and rendered as a
      // stack of full-width bands in the one view the owner actually looks at. It misses in every appearance
      // arm (defaults 868.8 · maximal 868.8 · compact 884.8 · reading 810 · diagnostics 868.8), so it was
      // never a per-arm accident. `@3xl` clears the narrowest of those by 42px and still leaves the
      // three-pane state (484px) and the phone column stacked, which is where one column is right.
      //
      // A SEPARATE ARM, not a retune of `lead`, for `leadEven`'s reason: `lead`'s other consumer WAS the
      // config welcome hearth (retired by #1210), whose own CT declared the `@4xl` width as the one its split had
      // to engage at (`6b00c37fd^:tests/client/features/config/_ct-stories.tsx:215` — #1210 deleted that story with
      // the surface, so the claim is anchored to the SHA that carried it, never to today's file). Moving the
      // shared value would change a surface nobody measured. Reach for `leadEarly` when the pane holding the
      // split is a docked CONTENT region rather than a whole page.
      leadEarly: "grid-cols-1 @3xl:grid-cols-[1.55fr_1fr] @min-[100rem]:grid-cols-[1.5fr_1.05fr]",
      // FIXED cells, variable COUNT (added 2026-08-16, program #102). `cell` is auto-FIT + `1fr`, so extra
      // width makes each cell BIGGER; a portrait shelf measured 250px faces at a 2000px viewport and read
      // as a gallery instead of a shelf you reach into. `auto-fill` at a fixed track spends surplus width
      // on MORE cells and leaves the cell alone — the right answer wherever the cell is a picture of a
      // thing rather than a container for text. The private track alias is 8.5rem under comfortable/default
      // and 7.5rem under compact density; `cellShelf` deliberately keeps its separate 8.5rem contract.
      cellFixed: "grid-cols-[repeat(auto-fill,var(--orb-grid-cell-fixed))]",
      // `cellFixed`'s PHONE ARM (added 2026-08-30, #864 — the Characters landing shelves). Identical at
      // every pane width the desktop shape reaches; it differs only BELOW `@md`, where the fixed 8.5rem
      // track stops being the right answer. Measured against the approved 430px artboard: a 430px CONTENT
      // pane spends 2×`p-block` on its gutters and leaves ~398px, which `auto-fill` at a 136px track fills
      // with exactly TWO cells and ~120px of dead trailing air — the shelf reads as two big pictures rather
      // than a rank you scan. Three equal `1fr` columns spend that air on a third face at ~123px, which is
      // still a legible portrait and is the composition the mock draws.
      //
      // A SEPARATE ARM, not a retune of `cellFixed` (the `leadEven`/`leadEarly` precedent): `cellFixed`'s
      // other consumer is the chats HOME quick-picks shelf, which lives inside a home TILE — a box that is
      // already narrower than its pane, so a container-level `@max-md` would fire there at widths where the
      // fixed track is still correct. Reach for `cellShelf` when the shelf IS the pane's full width.
      //
      // Container-queried, `pair`'s precedent — it answers to the pane, not the viewport — so it REQUIRES an
      // ancestor `<Container>` (an element cannot query itself).
      cellShelf: "grid-cols-3 @md:grid-cols-[repeat(auto-fill,8.5rem)]",
      // `pair`'s LATE-BREATH twin (added 2026-08-16, side-eye #102 F3), for a pair that only makes sense
      // once the pane is genuinely wide: the two FOOTNOTE blocks at the foot of a `lead` rail, which the
      // approved shape puts side by side at the same >=100rem step where the rail itself widens. `pair`'s
      // @md step is far too early here — these blocks live INSIDE the rail track, so a pane-level @md is
      // reached while the rail is still ~380px and would halve it. Same raw container width as `lead`'s
      // second step, for the same reason the scale cannot express it (it stops at @7xl / 80rem).
      pairWide: "grid-cols-1 @min-[100rem]:grid-cols-2",
      // A LABEL COLUMN beside its values (added 2026-08-19, side-eye N-2 on the databank detail): a readout
      // whose left track is exactly as wide as its widest LABEL and whose right track takes the rest. Every
      // arm above sizes its tracks by the PANE; this one sizes the first by its own CONTENT, which is the
      // only thing that ties a label to its value at every width.
      //
      // It replaces the knob-row token (`w-(--width-label-col)`, 152px) doing a readout's job: that token is
      // a CONTROL column — it exists so sliders and number fields start at one x down a settings pane — and
      // spent on ~62px labels it left ~90px of nothing inside every row, i.e. the same gap the fixed column
      // was introduced to close, one size smaller. `max-content` is the range property: no slack to grow,
      // whatever the labels or the pane become. The values still share ONE x, because it is one grid rather
      // than a per-row measurement.
      readout: "grid-cols-[max-content_1fr]",
      // A CENTRED MEASURE WITH A LEADING ANNOTATION GUTTER (added 2026-09-05, #1728 arm B). Three tracks:
      // the MIDDLE one is the reading column and it is centred by construction (the two `1fr` rails are
      // equal at every width, whatever the middle track resolves to), and track 1 hangs a chip at its
      // TRAILING edge — `justify-self: end` on the occupant — so the chip sits immediately beside the
      // column without ever entering the box that is being centred. Track 3 is the mirror, for a
      // trailing-annotated row.
      //
      // WHY IT EXISTS AT ALL: every other arm here sizes its tracks by the pane or by its own content, and
      // both of those make an annotated row centre the ANNOTATION+CONTENT pair rather than the content. A
      // row that centres the pair moves its prose sideways by half the chip the moment the chip appears,
      // which is a reader-visible slide on a toggle rather than a layout choice.
      //
      // ONE CONSUMER TODAY: the chat message row's CENTRED skins (`flat`/`hush` via `flatOuter`, and
      // `document`) — features/chat/lib/message-row-variants.ts. `bubble` and its family are NOT consumers:
      // their rows are deliberately leading/trailing-anchored, so their identity gutter is part of the
      // shape rather than an annotation beside a centred measure.
      //
      // §13.7 R2, VERBATIM AND CITED: "a second consumer graduates it into a named composite; until then it
      // stays a variant member". Until a second surface asks for this shape, it stays exactly this row —
      // one `cols` member, no primitive — under the ruling that minted it (#1728 arm B, owner 2026-09-05).
      //
      // THE CROSSOVER IS IN THE MEMBER, because it is a property of the SHAPE and not of one caller: a chip
      // can only hang in a margin where a margin exists. Below `@min-[52rem]` the template is the TWO-track
      // in-flow gutter (chip, then column) — byte-identical in effect to the flex row it replaces, and the
      // arm every narrow surface gets, because there the reading column IS the track and there is nothing to
      // hang into. At and above it the three tracks engage and the middle one centres.
      //
      // THE STEP IS DERIVED, THEN ROUNDED UP TO A NAMED ONE. The widest identity chip is
      // `spacing.avatar-lg` 40px and the centred skins' column is capped at `--reading-measure` (75ch =
      // 750px in the prose font, measured), and a chip fits the margin when `(track - column) / 2 >= 40`,
      // i.e. `track >= 830px`. The step used is `@4xl` (56rem / 896px) — the nearest NAMED container
      // step at or above that minimum, so the consuming feature can spell its matching placement classes
      // without an arbitrary variant. The 830-896px band therefore keeps the in-flow gutter: conservative by
      // one step, never clipping. Container steps are `rem`-denominated, so the whole thing moves with
      // `--font-scale` exactly like the measure it is derived from.
      //
      // THE ROLE MIRROR IS PART OF THE TEMPLATE, not a caller's job: `data-role="user"` rows carry the chip
      // TRAILING, so the two-track arm flips to `[column, chip]` — auto-placement then seats both roles
      // correctly with no explicit column-start below the step, which is what keeps the narrow arm free of
      // placement classes entirely.
      gutterCentred:
        "grid-cols-[auto_minmax(0,1fr)] in-data-[role=user]:grid-cols-[minmax(0,1fr)_auto] " +
        "@4xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] @4xl:in-data-[role=user]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
      // AN INSTRUMENT ROW'S THREE CELLS — name · flexing rail · the value cluster (added 2026-08-19,
      // side-eye P1-1 on the preset params deck). `readout`'s sibling, and the same ruling one axis wider:
      // the first track is CONTENT-sized so a name can never be clipped by a box, and the middle track
      // takes the rest so the rail is the only thing that flexes.
      //
      // WHY THE FIRST TRACK IS `minmax(--width-label-col, max-content)` AND NOT BARE `max-content`: the
      // token is what makes a column of knob names read down ONE edge ACROSS clusters — Sampling's short
      // names and Output's long ones are separate grids (a kicker sits between them), so a bare
      // `max-content` would give each cluster its own x. As a MINIMUM it keeps that one edge wherever the
      // names fit, and grows past it exactly where they do not (the fixed box clipped "Max output tokens"
      // at EVERY pane width, 1864 included — the label cell also has to seat the hint trigger).
      //
      // AND IT FOLDS BEFORE THE RAIL DIES. At a narrow pane the fixed name box + the number twin + the reset
      // left the rail 0-28px — a thumb on no track at all. Below `@lg` the rail takes the whole width;
      // `@lg` and not `@md` because the fold has to happen while there is still a rail worth keeping
      // (measured: the three-track arm needs ~468px of pane before the middle track clears an aimable
      // floor). The step is in `rem`, so it moves with `--font-scale` — the reading arm folds later, which
      // is exactly right for bigger type.
      //
      // THE FOLDED ARM IS TWO TRACKS, NOT ONE (side-eye 2026-08-30 P2-C). A single column stacked all four
      // cells in turn, which cost two things at once. GEOMETRY: the value cluster took a row of its own with
      // nothing to align to — measured at 430px, label x=12, rail 12→418 and the number cell 284→364, three
      // elements on three different x's down ten consecutive rows, so "which knobs have I set?" (the single
      // most common read on this tab) became ten separate hunts instead of one glance down a column. COST:
      // 148px per row against 38px on desktop, ≈2,800px of scroll for one preset. Pairing the NAME with its
      // VALUE on one line and giving the rail the row beneath restores a right-hand value column — the cell
      // now ends exactly where the rail does — and gives the row back ~46px. The consumer places its own
      // cells into these tracks (`features/preset/components/knob-row.tsx`); this recipe owns only the
      // tracks, exactly as the wide arm does.
      //
      // `grid-flow-row-dense` IS THE MECHANISM, and it is not an optimisation. Every knob in a cluster is a
      // cell of ONE grid (the rows are fragments — that is what makes the name column shared), so a row
      // cannot be addressed by index: an explicit `row-start-1` would put TEN value cells on the first line.
      // Dense packing gives the right answer from DOM order alone — the name takes the next free cell, the
      // rail's `col-span-2` forces the line below it, and the value cell BACKFILLS the hole beside the name
      // that the rail skipped. It is the one placement that survives a gloss row appearing on some knobs and
      // not others, because it is derived per item rather than counted. It is scoped to the FOLDED arm and
      // must stay there: measured, an unscoped `grid-flow-row-dense` backfills the wide arm's next NAME cell
      // into the hole the gloss's `col-start-2` leaves at column one, which put a cluster's explainers on
      // two different x's (398,398,398,966,966) — the very column P3 exists to hold.
      knob: "grid-cols-[1fr_max-content] @max-lg:grid-flow-row-dense @lg:grid-cols-[minmax(var(--width-label-col),max-content)_1fr_max-content]",
      // Four ordered action homes. A wide container keeps the explicit four-track row (`1fr` at the third
      // home is the spacer that pushes the last two right).
      //
      // BELOW `@md` THE ARM IS FLEX-WRAP, NOT A SECOND GRID (#531, measured 2026-08-23). The old narrow arm
      // was a fixed `[1fr_auto]` 2×2 (plus a `@max-xs` third row the consumer placed by hand), so it spent a
      // whole extra 48px row + its gap at EVERY container below 768px — including containers where all four
      // homes provably fit on one line (measured: the chat composer needs 372px of homes and has 392px at a
      // 430px phone, yet rendered two rows). A breakpoint cannot know whether the homes fit; wrapping does.
      // So the narrow arm packs by FIT: one row while the homes fit, a second only when they do not, and no
      // third row at all. The consumer keeps ordering the wrapped lines with its own auto margins — the
      // placement law (which home sits where) belongs to the bar, not to this recipe.
      actionBar: "grid-cols-[auto_auto_1fr_auto] items-center @max-md:flex @max-md:flex-wrap",
    },
  },
  defaultVariants: { cols: "auto" },
});

/** `size` must stay on the `--container-cq-*` token scale, never raw widths. */
export const containerVariants = tv({
  base: "@container",
  variants: {
    size: { sm: "max-w-cq-sm", md: "max-w-cq-md", lg: "max-w-cq-lg" },
  },
});

export const toolbarVariants = tv({
  base: "flex h-control-md flex-row items-center gap-row px-block",
});

// Meets the touch floor via h-control-sm, pointer-conditional (44px coarse/unknown, 32px fine).
export const toolbarButtonVariants = tv({
  base: `inline-flex h-control-sm min-w-control-sm select-none items-center justify-center gap-field rounded-control text-foreground text-label leading-label hover:bg-accent focus-visible:outline-none ${DISABLED_STATE_NATIVE} ${FOCUS_RING}`,
});

export const toolbarSeparatorVariants = tv({
  base: "w-px self-stretch bg-border",
});

// A Group is a LAYOUT + SEMANTICS box inside the strip (Base UI gives it the group role wiring and a
// `disabled` that cascades to its items): tighter than the strip's own `gap-row` so a related cluster
// reads as one unit against its neighbours.
export const toolbarGroupVariants = tv({
  base: "flex flex-row items-center gap-field data-disabled:opacity-50",
});

// The trailing metadata link ("Edited 51m ago"). Label type, muted until hover — it is a toolbar ITEM
// (roving tabindex), so it carries the same focus ring as ToolbarButton, not a bare underline.
export const toolbarLinkVariants = tv({
  base: `inline-flex h-control-sm items-center rounded-control px-field text-label leading-label text-muted-foreground no-underline hover:text-foreground focus-visible:outline-none ${FOCUS_RING}`,
});

// Wears the shared field-control box so an input inside a toolbar matches every other text control.
// Use ONE per horizontal toolbar and place it LAST — left/right arrows drive both the text caret and
// the roving tabindex (Base UI's own usage guideline, components/toolbar.md §"Usage guidelines").
export const toolbarInputVariants = tv({
  base: `h-control-sm min-w-0 rounded-control border border-input-border bg-input px-field text-body leading-body text-foreground placeholder:text-muted-foreground focus-visible:outline-none ${DISABLED_STATE_NATIVE} ${FOCUS_RING}`,
});

/** THE `gutterCentred` TRACKS AS A CLASS, for a caller that must not swap its ELEMENT (#1728 arm B).
 *  `react-hooks/static-components` bans binding a component to a render-scoped variable — the identity
 *  changes when the arm changes and React remounts the subtree, which for a chat row would drop edit state
 *  and re-run enter motion on a width change. A caller that needs the three rails CONDITIONALLY therefore
 *  composes this onto whatever element it already renders (`Row`'s `flex` loses to the `grid` here under
 *  tailwind-merge, both being `display` utilities) instead of choosing between `Row` and `Grid`.
 *  The tracks themselves stay single-homed in `variants.ts` — this is a spelling of that member, never a
 *  second copy of it. */
export function gutterCentredTracks(): string {
  return gridVariants({ cols: "gutterCentred" });
}
