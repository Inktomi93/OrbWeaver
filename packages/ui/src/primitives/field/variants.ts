import { tv } from "#lib";

export const fieldVariants = tv({
  slots: {
    root: "flex w-full flex-col gap-field",
    label: "text-label font-medium leading-label text-foreground data-disabled:opacity-50",
    // inline-flex so the hint trigger sits on the label's baseline instead of dropping to its own line.
    // FINE-POINTER-ONLY WIDENING (#1286): HintTrigger renders `size="inline"` here — a 12px icon box whose
    // layout-neutral touch-target pseudo (button/variants.ts's `inline` arm) is centered on the box and
    // reaches (--spacing-touch-target − 12px) / 2 past each edge. At a fine pointer that pseudo is 28px,
    // an 8px reach; the shared `gap-field` (6px, D3 — NOT touched by this fix) left 2px of the pseudo
    // painted over the label's own text, so `elementFromPoint` at the pseudo's edge resolved to the label
    // instead of the button (measured live, #1286). At a coarse pointer HintTrigger swaps to a REAL
    // `size-touch-target` box (hint-trigger/variants.ts) that occupies actual flex space, so 6px is
    // already correct there — this widening is pointer-fine only. `gap-row` (8px) is the exact next step
    // on the spacing scale and closes the reach to flush (8 − 8 = 0px overlap) without touching the
    // `field` intent token, which stays 6px everywhere else it is used (D3).
    labelRow: "inline-flex items-center gap-field pointer-fine:gap-row",
    hintTrigger: "text-muted-foreground hover:text-foreground",
    // THE MEASURE RIDES THE BASE SLOT (#1653), not one compound arm. It was spelled ONLY inside the
    // `align:"track" + orientation:"horizontal"` compound below, so every DEFAULT `<Field description=…>`
    // in the app rendered `max-width: none`: measured in the CT browser with real Geist, the tag editor's
    // folder-type description read 720.0px = 124.6 average glyph advances per line and the regex editor's
    // trim-strings gloss 121.5, against the design law's 65-75 band (`--reading-measure-prose` resolves
    // 423.0px in this slot's 13px font = 67.7 characters). The track arm's cap was correct and is not
    // reversed — it was simply the only arm that got it.
    //
    // THIS SLOT IS THE ONE HOME because `Field` exposes no per-site className for it (`field.tsx` renders
    // `<BaseField.Description className={slots.description()}>`): the alternative was a new API knob
    // re-spelled at every call site, which is the third un-derived width #1175 was filed about AND would
    // leave every unvisited Field uncapped. A `max-width` can only ever NARROW, and it narrows nothing that
    // is already short — the slot's non-prose occupants (a hex readout, a numeric floor, a match count) sit
    // far inside 423px and are unaffected.
    description: "max-w-(--reading-measure-prose) text-label leading-label text-muted-foreground",
    error: "text-label leading-label text-destructive",
    labelBlock: "flex min-w-0 flex-col gap-field",
    controlCol: "flex shrink-0 flex-col items-end gap-field",
  },
  variants: {
    // Label + description left, control docked right in a fixed control column so a select can't stretch to 100%.
    orientation: {
      vertical: {},
      horizontal: {
        // Stacks back to vertical below the md container breakpoint so a narrow pane doesn't starve the label block.
        root: "flex-row items-start justify-between gap-row @max-md:flex-col @max-md:items-stretch @max-md:justify-start",
        controlCol: "w-(--width-control-col) @max-md:w-full @max-md:items-stretch",
      },
    },
    // THE HORIZONTAL ROW'S CROSS-AXIS (side-eye 2026-08-06 P2). `items-start` is only right when one column
    // is genuinely MULTI-LINE: a description wraps under the label and the control must hold the FIRST line
    // rather than float to the middle of a two-line block. A row with neither a description nor an error is
    // two SINGLE-line boxes of unequal height (a `label` text step vs a `control-md` box), and `items-start`
    // pinned the label to the control's top edge — an ~8px baseline shear on every description-less settings
    // row (Appearance → "Avatar size" / "Avatar shape" / "Avatar ring" were the reported ones).
    //
    // `multiline` is the honest axis rather than "hasDescription": the ERROR node grows the control column
    // exactly the same way, so it takes the same arm. Below `@max-md` the row is stacked and `items-stretch`
    // (declared on the horizontal arm) still wins — this only ever governs the side-by-side layout.
    multiline: { true: {}, false: {} },
    // THE SECTION-SHARED TRACK (#932). `block` is the pre-existing behaviour, byte-for-byte — the arm
    // carries no classes at all, so every one of the 25 horizontal `FieldLayout` consumers renders exactly
    // what it rendered before. `track` only ever composes with `orientation: horizontal` (see the
    // compound below); on a vertical field it is inert, which is what a section that mixes the two wants.
    align: { block: {}, track: {} },
  },
  compoundVariants: [
    { orientation: "horizontal", multiline: false, class: { root: "items-center" } },
    {
      align: "track",
      orientation: "horizontal",
      class: {
        // THE SUBGRID CHAIN, and it is a chain of exactly three links: the section's `SettingRowGroup`
        // declares `[label] [control] [actions] [slack]`, the `SettingRow` spans all four and re-exposes
        // them, and this Field spans the first two. Subgrid (not a re-declared template) is the whole
        // point — the label track is sized over EVERY row in the section, so one long label sets the
        // control's start x for all of them and no row can drift its own. `grid` beats the horizontal
        // arm's `flex` through tailwind-merge's display group, which also retires that arm's
        // `justify-between` (the flex property that WAS the void) and its `@max-md:flex-col` — the narrow
        // stack is not a per-row flip any more, it is the GROUP dropping to one track, which every
        // subgrid in the chain then inherits.
        //
        // …AND THAT INHERITANCE HAS A HOLE, MEASURED (#1770). It holds only where `grid` is actually ON.
        // Between the horizontal arm's own stack step (`@max-md`, 448px) and the group's track step
        // (`@lg`, 512px) this arm contributes NO display, so the row falls back to the flex
        // `justify-between` + `w-(--width-control-col)` DOCK — i.e. the void, in a 64px-wide container
        // band. Measured on the preset Params deck at a 520px pane (496px container): 252px of gap on a
        // 496px row, 51% — a `row-void` by the detector's own thresholds, in the one state the group's
        // one-column arm was supposed to have already answered. The ruling above survives and its INPUT is
        // corrected: the stack is still the GROUP's step, not a per-row breakpoint, so it is spelled at
        // `@lg` — the same container step every placement below uses — rather than at a new one.
        // `@max-md:*` from the base horizontal arm stays and simply agrees inside the band it covers.
        // EVERY placement below is gated on the SAME container step the group's track set uses (`@lg`,
        // layout/variants.ts `settingTrack`), and that is not decoration: below the step the group is ONE
        // column, and an ungated `col-start-2` there does not stack — it MINTS AN IMPLICIT SECOND COLUMN
        // and the control sits beside the label again at phone width (measured: control top 1155 against
        // label bottom 1178, i.e. still side-by-side, in the narrow message-style story).
        root: "@max-lg:flex-col @max-lg:items-stretch @lg:col-span-2 @lg:grid @lg:grid-cols-subgrid",
        // `contents` DISSOLVES the label block so its two children become grid items of this subgrid: the
        // label lands in the label track and the DESCRIPTION gets its own full-width line beneath the
        // label/control pair. That placement is the E5 half of #932 — the registry gloss has to read as
        // prose, and inside an 11rem label column it would have wrapped to four lines and re-inflated the
        // very row the track set exists to tighten. The three explicit placements below are what a
        // `contents` block costs: auto-placement would otherwise push the control onto a third row once
        // the full-span description has taken the second.
        labelBlock: "@lg:contents",
        label: "@lg:col-start-1 @lg:row-start-1",
        labelRow: "@lg:col-start-1 @lg:row-start-1",
        // The MEASURE moved to the base slot (#1653) — it is not re-spelled here, because half a migration
        // is the rot. What stays is this arm's own job: the full-width row-2 PLACEMENT inside the subgrid.
        description: "@lg:col-span-full @lg:row-start-2",
        // The control column stops being a fixed 200px right-hand DOCK and becomes the shared track's
        // cell, filled from its START. Not `items-end`/`stretch`: the cold contract is explicit that
        // unlike controls must not be stretched merely to equalize their visible right edge — a switch is
        // 48px wide and saying so is honest, whereas a 200px switch is a lie about its hit target.
        controlCol: "@max-lg:w-full @max-lg:items-stretch @lg:col-start-2 @lg:row-start-1 @lg:w-auto @lg:items-start",
      },
    },
  ],
  defaultVariants: { align: "block", orientation: "vertical", multiline: false },
});
