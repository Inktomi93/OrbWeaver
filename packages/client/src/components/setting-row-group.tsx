// SettingRowGroup — the MEASURE-CAPPED, TRACK-SHARING container a section wraps its `SettingRow`s in
// (#932). It is the top link of the subgrid chain: GROUP declares the three tracks → `SettingRow` spans
// all three and re-exposes them → the `<Field>` inside spans the first two.
//
// WHY IT EXISTS AT ALL (the measured defect, re-drive #1099 G6): `design-audit`'s `row-void` fired 8× on
// the Appearance pane at 63-77% of the row — min 543px, median 647px, max 703px of an 829px row between a
// label and the control it names — in the default pane state, in `context-only`, in `focus`, in all four
// appearance presets and in both themes, and ZERO times in `both-docked`, the one state that narrows the
// content column to ~520px. A defect that switches off when the column narrows is a WIDTH problem, not a
// spacing one: the old row was a flex `justify-between` against the PANE, so the distance from a name to
// its control was whatever the window happened to be. Tracks answer it exactly — the section's longest
// label sets one control-track start for every row in it, and nothing is `1fr`, so the block is
// content-sized instead of pane-sized.
//
// OPT-IN, AND THE DEFAULT IS UNTOUCHED. `FieldLayout orientation="horizontal"` has 25 consumers across the
// client, most of them not settings rows; this group passes `align="track"` and NOTHING else changes for
// anybody who does not mount it. A section converts by swapping its `<FieldLayout orientation="horizontal">`
// for this — one line, and its rows keep their existing bodies.
//
// THE `<Container>` IS LOAD-BEARING, not decoration: the narrow arm is a CONTAINER query on the grid
// (`grid-cols-1 @md:…`, layout/variants.ts `settingTrack`) so the row answers to the PANE it lives in
// rather than to the viewport — and an element cannot query itself, so the query needs this ancestor.
// Below the step the group drops to one track and every subgrid beneath it inherits that, which is the
// whole narrow stack: no per-row flip, no media query in a feature.

import { FieldLayout } from "@orb/ui/field";
import { Container, Grid } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";

/** A section's settings rows, sharing one label track, one control-track start and one action cell. */
export function SettingRowGroup({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <Container>
      <FieldLayout align="track" orientation="horizontal">
        {/* `max-w-(--reading-measure)` caps the BLOCK (the E1 ask). The tracks are intrinsic, so the cap
            almost never binds on a knob row — what it genuinely bounds is the one-line gloss under each
            label, which is prose and belongs at a reading measure. `gap-x-block` is the label→control
            gutter; `gap-y-block` keeps the between-row rhythm the Section's own `gap-block` used to give
            these rows when they were its direct children. */}
        <Grid className="max-w-(--reading-measure) gap-x-block gap-y-block" cols="settingTrack" data-slot="setting-row-group">
          {children}
        </Grid>
      </FieldLayout>
    </Container>
  );
}
