// ParamsRow — the subgrid chain's MIDDLE LINK for a surface that is not the config workspace (#1770).
//
// WHY IT EXISTS. `SettingRowGroup` (#932) declares FOUR tracks — label · control · actions · slack — and a
// `track`-aligned `<Field>` spans exactly the first two. On the config surface the third item per row is
// `SettingRow`'s ACTIONS cell, so each row fills all four tracks and one row occupies one line. The params
// deck has no per-leaf action cell and `SettingRow` outside a `ConfigTeachScope` renders its children bare,
// so consecutive Fields AUTO-PLACE two-per-line: measured on this deck at a 560px pane, "Compaction mode"
// took tracks 1-2 while "Managed threshold" took 3-4 — its label 420px to the right of its siblings' and
// its number input squeezed to 2px (62px at a 720px pane, against the 200px every other control holds).
//
// So the deck supplies the link itself: ONE grid item per row that spans every track and re-exposes them,
// which is what the group's own header describes as the chain's second link. `col-span-full` is ungated on
// purpose (unlike a `col-start`, which mints an implicit column in the narrow ONE-track arm — see
// `@orb/ui`'s field variants): spanning "all of them" is correct at both steps.

import { Grid } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";

/** One label/control row inside a `SettingRowGroup` on a non-config surface. */
export function ParamsRow({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <Grid className="col-span-full min-w-0 grid-cols-subgrid gap-x-block" data-slot="params-row">
      {children}
    </Grid>
  );
}
