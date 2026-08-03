// The regex collection's ROWS — the OWNER half of the config-rail seam (F-5).
//
// The row anatomy is the LANDED one, unchanged (side-eye X-6): name · scent subtitle · the global-scope
// switch as the row's own trailing control, because "runs in every chat" is a property OF THE ROW. What
// changed is only where the row lives and what clicking it does — it opens the script in CONTENT instead
// of stacking an editor Dialog on top of the settings modal.
//
// Two render arms by size, the tag-collection shape: the sealed `VirtualList` in a bounded box past
// COLLECTION_LARGE_GROUP (with the host's filter), a plain stack below it.

import type { RegexScriptRow } from "@orb/contracts/regex";
import { Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { VirtualList } from "@orb/ui/virtual-list";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { LibraryRow } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { CollectionListView } from "#lib";
import { COLLECTION_LARGE_GROUP, regexScriptScent } from "#lib";
import { useAttachRegexGlobal, useDetachRegexGlobal } from "../hooks/use-regex-library";
import { regexScriptTitle } from "../lib/regex-model";

/** One compact row's height guess for the windowed arm (name + scent subtitle). */
const ESTIMATED_ROW_PX = 44;

export function RegexCollectionRows({ view }: { readonly view: CollectionListView }): ReactElement {
  const trpc = useTRPC();
  const { data: scripts } = useSuspenseQuery(trpc.regex.listScripts.queryOptions());
  const { data: globals } = useSuspenseQuery(trpc.regex.listGlobal.queryOptions());
  const globalIds = new Set(globals.map((row) => row.id));

  const needle = view.filter.trim().toLowerCase();
  const filtered = needle === "" ? scripts : scripts.filter((script) => regexScriptTitle(script).toLowerCase().includes(needle));

  const renderRow = (script: RegexScriptRow): ReactElement => (
    <RegexCollectionRow
      isGlobal={globalIds.has(script.id)}
      key={script.id}
      onSelect={(): void => view.onSelect(script.id)}
      script={script}
      selected={view.selectedId === script.id}
    />
  );

  if (filtered.length === 0) {
    return <Text voice="gloss">No scripts match that filter.</Text>;
  }
  if (scripts.length > COLLECTION_LARGE_GROUP) {
    return (
      <VirtualList
        aria-label="Regex scripts"
        className="max-h-96"
        estimateSize={(): number => ESTIMATED_ROW_PX}
        gapToken="field"
        getItemKey={(script): string => script.id}
        items={filtered}
        renderItem={renderRow}
      />
    );
  }
  return <Stack gap="tight">{filtered.map(renderRow)}</Stack>;
}

function RegexCollectionRow({
  script,
  isGlobal,
  selected,
  onSelect,
}: {
  readonly script: RegexScriptRow;
  readonly isGlobal: boolean;
  readonly selected: boolean;
  readonly onSelect: () => void;
}): ReactElement {
  return (
    <LibraryRow
      // The cluster carries a REST-VISIBLE control, so the strip is reserved IN FLOW — the floated arm is
      // inert at rest and would sit on the title text (LibraryRow's own header states the trade).
      actionsReserved={true}
      onSelect={onSelect}
      selected={selected}
      stateToggle={<GlobalScopeSwitch isGlobal={isGlobal} script={script} />}
      subtitle={regexScriptScent(script)}
      title={regexScriptTitle(script)}
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
