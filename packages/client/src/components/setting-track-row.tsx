// SettingTrackRow — the subgrid chain's MIDDLE LINK for a surface that is not the config workspace
// (#1770; promoted out of `features/preset` at #980 F13, where it was `ParamsRow`).
//
// WHY IT EXISTS. `SettingRowGroup` (#932) declares FOUR tracks — label · control · actions · slack — and a
// `track`-aligned `<Field>` spans exactly the first two. On the config surface the third item per row is
// `SettingRow`'s ACTIONS cell, so each row fills all four tracks and one row occupies one line. Anywhere
// else there is no per-leaf action cell (and `SettingRow` outside a `ConfigTeachScope` renders its children
// bare), so consecutive Fields AUTO-PLACE TWO PER LINE. Measured twice, on two different surfaces:
//   · the params deck at a 560px pane — "Compaction mode" took tracks 1-2 while "Managed threshold" took
//     3-4, its label 420px right of its siblings' and its number input squeezed to 2px;
//   · Backup & Restore's eleven "Include" checkboxes at 960px (#980 F13) — the group's controls landed in
//     TWO columns, x=210 and x=495, i.e. the shared track the group exists to give was never shared.
//
// So a surface outside the config workspace supplies the link itself: ONE grid item per row that spans
// every track and re-exposes them, which is what the group's own header describes as the chain's second
// link. `col-span-full` is ungated on purpose (unlike a `col-start`, which mints an implicit column in the
// narrow ONE-track arm — see `@orb/ui`'s field variants): spanning "all of them" is correct at both steps.
//
// IT LIVES HERE, NOT IN A FEATURE, because the second consumer proved it is not the preset deck's: a
// feature reaching sideways for another feature's layout link is the import the cake forbids, and copying
// nine lines of subgrid arithmetic is how two tracks drift. Its old name said which deck used it first;
// this one says what it is — a row inside a `SettingRowGroup`'s track.

import { Grid } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";

/** One label/control row inside a `SettingRowGroup` on a non-config surface. */
export function SettingTrackRow({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <Grid className="col-span-full min-w-0 grid-cols-subgrid gap-x-block" data-slot="setting-track-row">
      {children}
    </Grid>
  );
}
