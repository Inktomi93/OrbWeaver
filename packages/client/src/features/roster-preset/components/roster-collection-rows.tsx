// The roster collection's ROWS — the OWNER half of the config-rail seam (B10's library-management
// surface; the tag-collection anatomy). A row is a SCAN line: name · member count · the member-name
// gloss; Delete is the row's kebab (the house per-row destructive affordance — LibraryRow.actions →
// RowActionsMenu confirm, the #271 convergence home), and EDITING lives in the mounted member editor
// (`surfaces/roster-member-surface.tsx`). No windowed arm: a roster library is picked by name and bounded
// in practice (the 25-member cap bounds the rows' own height, not their count — but a saved-roster
// roster measured in hundreds is not a real library; revisit with the tag rows' virtual arm if it
// ever is).

import type { RosterPresetSummary } from "@orb/contracts/roster-preset";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { LibraryRow } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { CollectionListView } from "#lib";
import { clearCollectionSelection } from "#state";
import { useRemoveRosterPreset } from "../hooks/use-roster-preset-mutations.ts";

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
      markers={
        <Text as="span" voice="datum">
          {roster.memberCount}
          {roster.rules.length > 0 ? ` · ${roster.rules.length} rule${roster.rules.length === 1 ? "" : "s"}` : ""}
        </Text>
      }
      onSelect={onSelect}
      selected={selected}
      subtitle={roster.members.map((m) => m.name).join(", ")}
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
