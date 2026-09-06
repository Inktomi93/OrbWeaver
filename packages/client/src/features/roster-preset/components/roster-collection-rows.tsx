// The roster collection's ROWS — the OWNER half of the config-rail seam (B10's library-management
// surface; the tag-collection anatomy). A row is a SCAN line: the name, then its SCENT on the subtitle
// beneath it (`rosterScent` — the census plus the member-name gloss; it rode the title line's trailing
// `markers` slot until #1838, which is where that count went to hide at CONTENT-pane width).
// Delete is the row's kebab (the house per-row destructive affordance — LibraryRow.actions →
// RowActionsMenu confirm, the #271 convergence home), and EDITING lives in the mounted member editor
// (`surfaces/roster-member-surface.tsx`). No windowed arm: a roster library is picked by name and bounded
// in practice (the 25-member cap bounds the rows' own height, not their count — but a saved-roster
// roster measured in hundreds is not a real library; revisit with the tag rows' virtual arm if it
// ever is).

import type { RosterPresetSummary } from "@orb/contracts/roster-preset";
import { Stack } from "@orb/ui/layout";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { LibraryRow } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { CollectionListView } from "#lib";
import { clearCollectionSelection } from "#state";
import { useRemoveRosterPreset } from "../hooks/use-roster-preset-mutations.ts";
import { rosterScent } from "../lib/roster-model.ts";

function RosterLibraryRow({
  roster,
  selected,
  onSelect,
  onDelete,
}: {
  readonly roster: RosterPresetSummary;
  readonly selected: boolean;
  readonly onSelect: () => void;
  /** MAY return a promise (#1563b, widened #1632): it flows through `LibraryRow.actions.onDelete` →
   *  `RowActionsMenu.destructive.onConfirm` → `ConfirmDialog.onConfirm`, which awaits it and becomes the
   *  retry surface. `() => void` accepted an async handler anyway, so the type contradicted the behaviour. */
  readonly onDelete: () => void | Promise<void>;
}): ReactElement {
  return (
    <LibraryRow
      actions={{
        name: roster.name,
        onDelete,
        deleteDescription: "This removes the saved roster only — chats you started from it are untouched.",
      }}
      onSelect={onSelect}
      selected={selected}
      // THE CENSUS IS THE SUBTITLE, NOT A TITLE-LINE MARKER (#1838 — the tag rows' #1824 twin). It rode
      // `markers`, the title line's TRAILING slot, so at CONTENT-pane width the count docked at the row's
      // right edge several hundred px from the name it counts. DESIGN.md §3.3 draws the roster subtitle as
      // "members · rules"; `rosterScent` is that string and its one home, and the member-name gloss that
      // used to be the whole subtitle survives as its tail. Both slots ride `aria-describedby`, so the
      // spoken row is one sentence now rather than two.
      subtitle={rosterScent(roster)}
      subtitleStep="label"
      title={roster.name}
    />
  );
}

export function RosterCollectionRows({ view }: { readonly view: CollectionListView }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: rosters } = useSuspenseQuery(trpc.rosterPreset.list.queryOptions());
  const remove = useRemoveRosterPreset({ trpc, invalidation });

  const filter = view.filter.trim().toLowerCase();
  const shown = filter === "" ? rosters : rosters.filter((roster) => roster.name.toLowerCase().includes(filter));

  return (
    <Stack gap="tight">
      {shown.map((roster) => (
        <RosterLibraryRow
          roster={roster}
          key={roster.id}
          onDelete={(): void => {
            remove.mutate({ presetId: roster.id });
            if (view.selectedId === roster.id) {
              clearCollectionSelection();
            }
          }}
          onSelect={(): void => view.onSelect(roster.id)}
          selected={view.selectedId === roster.id}
        />
      ))}
    </Stack>
  );
}
