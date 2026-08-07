// The regex collection's ROWS — the OWNER half of the config-rail seam (F-5).
//
// The row anatomy is the LANDED one: name · scent subtitle · the global-scope switch as the row's own
// trailing control, because "runs in every chat" is a property OF THE ROW. Clicking the row opens the script
// in CONTENT (never a stacked editor Dialog).
//
// TWO THINGS ARRIVED WITH REGX2, and both are the row's own to render (C-4 puts band chrome in the host and
// leaves everything inside the row area here):
//  · the KEBAB, carrying Duplicate · Export · Delete. EXPORT is a per-member verb, so D121-D's
//    `kebab=Export` half is the owner's; IMPORT is the group band's, declared as data on the contribution.
//    There is NO Rename item — a script's name is a bound field of the editor this row's click already
//    mounts, so a Rename dialog would be a second write path for a field one click away (`LibraryRow`'s
//    `onRename` is optional for exactly this, the `onDuplicate` precedent).
//  · BULK MODE. While it is on, the trailing cluster IS a checkbox and the row's click toggles selection
//    instead of opening the editor — the `character-card` bulk shape, so "act on the things I checked" reads
//    the same everywhere. The per-row global switch and the kebab are suppressed: a mode where a stray click
//    on a switch silently edits a row you meant to check is worse than no mode.
//
// THE RESERVED CLUSTER IS 2 SLOTS, and it is the LIST's count, not any row's: the state toggle and the
// kebab, both rest-visible/real. It was 1 while the row had no kebab (side-eye 2026-08-03 P1 — reserving the
// §12.2 maximum spent 88px of a 290px row on two DEAD boxes while script names truncated at 128px). Two LIVE
// slots is not that defect: the rule is that a row reserves what its list declares, and the list now
// declares two. Bulk mode renders one and the spacer pads the second, so the checkbox column lands at the
// same x the switch does and the list keeps its scan column across the mode flip.
//
// Two render arms by size, the tag-collection shape: the sealed `VirtualList` in a bounded box past
// COLLECTION_LARGE_GROUP (with the host's filter), a plain stack below it.

import type { RegexScriptRow } from "@orb/contracts/regex";
import type { RegexScriptId } from "@orb/kit/ids";
import { Checkbox } from "@orb/ui/checkbox";
import { Download, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { MenuItem } from "@orb/ui/menu";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { VirtualList } from "@orb/ui/virtual-list";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { LibraryRow } from "#components";
import { useInvalidation, useTRPC, useTRPCClient } from "#data";
import type { CollectionListView } from "#lib";
import { COLLECTION_LARGE_GROUP, COLLECTION_WINDOW_MAX_HEIGHT, downloadTextFile, notify, regexScriptScent, regexScriptTitle } from "#lib";
import {
  clearCollectionSelection,
  clearRegexBulkSelection,
  toggleRegexScriptSelected,
  useIsRegexScriptSelected,
  useRegexBulkActive,
  useRegexBulkSelectedIds,
} from "#state";
import { useAttachRegexGlobal, useDetachRegexGlobal, useDuplicateRegexScript, useRemoveRegexScript } from "../hooks/use-regex-library.ts";
import { RegexBulkBar } from "./regex-bulk-bar.tsx";

/** One row's height guess for the windowed arm — the MEASURED height at the real 290px roster mount (name +
 *  scent subtitle + the reserved cluster). The virtualizer re-measures after mount; the guess only decides
 *  how many rows the first frame windows. */
const ESTIMATED_ROW_PX = 52;

/** How many §12.2 cluster slots THIS list reserves per row: the state toggle and the kebab (see the header). */
const REGEX_CLUSTER_SLOTS = 2;

export function RegexCollectionRows({ view }: { readonly view: CollectionListView }): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const client = useTRPCClient();
  const { data: scripts } = useSuspenseQuery(trpc.regex.listScripts.queryOptions());
  const { data: globals } = useSuspenseQuery(trpc.regex.listGlobal.queryOptions());
  const globalIds = new Set(globals.map((row) => row.id));
  const duplicate = useDuplicateRegexScript({ trpc, invalidation });
  const remove = useRemoveRegexScript({ trpc, invalidation });
  const bulkActive = useRegexBulkActive();
  const selectedIds = useRegexBulkSelectedIds();

  const needle = view.filter.trim().toLowerCase();
  const filtered = needle === "" ? scripts : scripts.filter((script) => regexScriptTitle(script).toLowerCase().includes(needle));

  const onDuplicate = (id: RegexScriptId): void => {
    void duplicate.mutateAsync({ scriptId: id }).then((created) => view.onSelect(created.id));
  };

  const onDelete = (id: RegexScriptId): void => {
    // Clear the selection FIRST when the open script is the one being deleted, so CONTENT falls back to the
    // workspace welcome instead of holding a dead editor over a deleted id (the world-info row's rule).
    if (view.selectedId === id) {
      clearCollectionSelection();
    }
    remove.mutate({ scriptId: id });
  };

  // The bytes are the SERVER's — the same file the backup bundle carries for this script — downloaded
  // verbatim, so a shared script and a restored one can never diverge.
  const onExport = (id: RegexScriptId): void => {
    void client.regex.exportScript
      .query({ scriptId: id })
      .then((file) => {
        downloadTextFile(file.filename, file.fileText);
      })
      .catch((error: unknown) => {
        notify.error(error instanceof Error ? error.message : "Couldn't export the script.");
      });
  };

  const renderRow = (script: RegexScriptRow): ReactElement => (
    <RegexCollectionRow
      bulkActive={bulkActive}
      isGlobal={globalIds.has(script.id)}
      key={script.id}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onExport={onExport}
      onSelect={(): void => view.onSelect(script.id)}
      script={script}
      selected={view.selectedId === script.id}
    />
  );

  const rows = ((): ReactElement | null => {
    if (filtered.length === 0) {
      // A FILTER MISS AND AN EMPTY LIBRARY ARE DIFFERENT STATES (side-eye 2026-08-03 P1): with no needle
      // this printed "No scripts match that filter." above the host's own zero-member slot — two empty
      // states, one of them a lie (below COLLECTION_LARGE_GROUP the filter box isn't even rendered). No
      // needle ⇒ the host's slot is the only voice.
      return needle === "" ? null : <Text voice="gloss">No scripts match that filter.</Text>;
    }
    if (scripts.length > COLLECTION_LARGE_GROUP) {
      return (
        <VirtualList
          aria-label="Regex scripts"
          className={COLLECTION_WINDOW_MAX_HEIGHT}
          estimateSize={(): number => ESTIMATED_ROW_PX}
          gapToken="field"
          getItemKey={(script): string => script.id}
          items={filtered}
          renderItem={renderRow}
        />
      );
    }
    return <Stack gap="tight">{filtered.map(renderRow)}</Stack>;
  })();

  const checkedIds = Object.keys(selectedIds);
  return (
    <>
      {rows}
      {/* THE BAR IS THE MODE'S ONLY VOICE WHILE NOTHING IS CHECKED — but it is not rendered then, and that
          is deliberate: the band toggle is pressed, every row wears a checkbox, and a zero-count bar would
          be chrome saying what the rows already say. It appears the moment a row is checked. */}
      {bulkActive && checkedIds.length > 0 ? <RegexBulkBar ids={checkedIds} onClear={clearRegexBulkSelection} trpc={trpc} /> : null}
    </>
  );
}

interface RegexCollectionRowProps {
  readonly script: RegexScriptRow;
  readonly isGlobal: boolean;
  readonly selected: boolean;
  readonly bulkActive: boolean;
  readonly onSelect: () => void;
  readonly onDuplicate: (id: RegexScriptId) => void;
  readonly onDelete: (id: RegexScriptId) => void;
  readonly onExport: (id: RegexScriptId) => void;
}

function RegexCollectionRow({ script, isGlobal, selected, bulkActive, onSelect, onDuplicate, onDelete, onExport }: RegexCollectionRowProps): ReactElement {
  const checked = useIsRegexScriptSelected(script.id);
  const title = regexScriptTitle(script);

  if (bulkActive) {
    return (
      <LibraryRow
        actionsReserved={REGEX_CLUSTER_SLOTS}
        onSelect={(): void => toggleRegexScriptSelected(script.id)}
        // `selected` means CHECKED here, not "open in CONTENT": in bulk mode the row's whole job is its
        // membership in the batch, and painting the open-editor row as current on top of that would give one
        // list two "you are here" marks.
        selected={checked}
        stateToggle={<Checkbox aria-label={`Select ${title}`} checked={checked} onCheckedChange={(): void => toggleRegexScriptSelected(script.id)} />}
        subtitle={regexScriptScent(script)}
        title={title}
      />
    );
  }

  return (
    <LibraryRow
      actions={{
        name: title,
        onDuplicate: (): void => onDuplicate(script.id),
        onDelete: (): void => onDelete(script.id),
        deleteDescription: "Deleting a script removes it from every preset, character, and room it's attached to. This can't be undone.",
        // Below Duplicate, above the destructive Delete — the §9 kebab order.
        menuItemsAfter: (
          <MenuItem onClick={(): void => onExport(script.id)}>
            <Icon icon={Download} size="sm" />
            Export
          </MenuItem>
        ),
      }}
      actionsReserved={REGEX_CLUSTER_SLOTS}
      onSelect={onSelect}
      selected={selected}
      stateToggle={<GlobalScopeSwitch isGlobal={isGlobal} script={script} />}
      subtitle={regexScriptScent(script)}
      title={title}
    />
  );
}

/** The GLOBAL scope switch — the one scope this library owns (preset/character/room attach from their own
 *  pickers). The accessible name is the row's own name plus what the switch does, so a screen-reader user
 *  hears "strip ooc runs in every chat", never a bare "switch". */
function GlobalScopeSwitch({ script, isGlobal }: { readonly script: RegexScriptRow; readonly isGlobal: boolean }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const attach = useAttachRegexGlobal({ trpc, invalidation });
  const detach = useDetachRegexGlobal({ trpc, invalidation });

  return (
    <Switch
      aria-label={`${regexScriptTitle(script)} runs in every chat`}
      checked={isGlobal}
      onCheckedChange={(checked): void => {
        if (checked) {
          void attach.mutateAsync({ scriptId: script.id });
        } else {
          void detach.mutateAsync({ scriptId: script.id });
        }
      }}
    />
  );
}
