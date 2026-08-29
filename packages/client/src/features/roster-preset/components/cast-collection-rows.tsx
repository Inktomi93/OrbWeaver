// The cast collection's ROWS — the OWNER half of the config-rail seam (B10's library-management
// surface; the tag-collection anatomy). A row is a SCAN line: name · member count · the member-name
// gloss; Delete is the row's kebab (the house per-row destructive affordance — LibraryRow.actions →
// RowActionsMenu confirm, the #271 convergence home), and EDITING lives in the mounted member editor
// (`surfaces/cast-member-surface.tsx`). No windowed arm: a cast library is picked by name and bounded
// in practice (the 25-member cap bounds the rows' own height, not their count — but a saved-cast
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

function CastLibraryRow({
  cast,
  selected,
  onSelect,
  onDelete,
}: {
  readonly cast: RosterPresetSummary;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onDelete: () => void;
}): ReactElement {
  return (
    <LibraryRow
      actions={{
        name: cast.name,
        onDelete,
        deleteDescription: "This removes the saved cast only — chats you started from it are untouched.",
      }}
      markers={
        <Text as="span" voice="datum">
          {cast.memberCount}
          {cast.rules.length > 0 ? ` · ${cast.rules.length} rule${cast.rules.length === 1 ? "" : "s"}` : ""}
        </Text>
      }
      onSelect={onSelect}
      selected={selected}
      subtitle={cast.members.map((m) => m.name).join(", ")}
      subtitleStep="label"
      title={cast.name}
    />
  );
}

export function CastCollectionRows({ view }: { readonly view: CollectionListView }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: casts } = useSuspenseQuery(trpc.rosterPreset.list.queryOptions());
  const remove = useRemoveRosterPreset({ trpc, invalidation });

  const filter = view.filter.trim().toLowerCase();
  const shown = filter === "" ? casts : casts.filter((cast) => cast.name.toLowerCase().includes(filter));

  return (
    <Stack gap="tight">
      {shown.map((cast) => (
        <CastLibraryRow
          cast={cast}
          key={cast.id}
          onDelete={(): void => {
            remove.mutate({ presetId: cast.id });
            if (view.selectedId === cast.id) {
              clearCollectionSelection();
            }
          }}
          onSelect={(): void => view.onSelect(cast.id)}
          selected={view.selectedId === cast.id}
        />
      ))}
    </Stack>
  );
}
