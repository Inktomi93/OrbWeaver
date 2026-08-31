// The regex collection's host-facing hooks (the `CollectionContribution` seam): the group count, the create
// verb, the IMPORT door's runner and the BULK-SELECT mode. All are hooks because a definition is a
// module-level value — the host calls each unconditionally, once, per rendered affordance.

import type { RegexScriptRow } from "@orb/contracts/regex";
import { useQuery } from "@tanstack/react-query";
import { useInvalidation, useTRPC } from "#data";
import type { CollectionPreviewEntry } from "#lib";
import { COLLECTION_PREVIEW_LIMIT, notify, regexScriptTitle, timeLib } from "#lib";
import { selectCollectionMember, toggleRegexBulkMode, useRegexBulkActive } from "#state";
import { REGEX_COLLECTION_ID } from "../lib/regex-model.ts";
import { useCreateRegexScript, useImportRegexScriptFile } from "./use-regex-library.ts";
import { makeRegexScriptDefaults } from "./use-regex-script-form.ts";

/** The group band's live census — a NON-suspending read sharing the rows' cache. */
export function useRegexCount(): number | undefined {
  const trpc = useTRPC();
  return useQuery(trpc.regex.listScripts.queryOptions()).data?.length;
}

/** One ranked row → the host-facing preview entry. The datum is the EDIT STAMP, which is the same field
 *  X-16 put at the end of the list row's scent and for the same reason: `Add script` mints every row named
 *  "New script", so a wall of names is unreadable without the one datum that tells them apart.
 *
 *  NO PLACEMENT/CHANNEL GLYPH, deliberately (deviation from the 2026-08-19 brief, stated): no icon
 *  vocabulary for `RegexPlacement` exists anywhere on this tree — the editor's chips, the pipeline readout
 *  and the list scent all name a stage with `REGEX_PLACEMENT_LABELS` — so minting one HERE would be a
 *  second vocabulary for one pipeline stage, which is the exact defect that map was created to end (side-eye
 *  F-23). A script bites on a SET of stages besides, so a single glyph would have to pick one and drop the
 *  rest silently. The stage phrase stays where it is legible: the list row's subtitle. */
function previewEntry(script: RegexScriptRow): CollectionPreviewEntry {
  return { id: script.id, label: regexScriptTitle(script), detail: timeLib.formatRelative(script.updatedAt) };
}

/** The welcome hero's chip wall (the `preview` seam): the most recently EDITED slice of the library.
 *
 *  RECENCY IS THE HONEST RANK HERE, not usage. A script has no usage total that rides its list row (the
 *  "attached by" rollup is the queued REGROSTER read, and it is not on this key), and ranking a library you
 *  are actively authoring by what you touched last is what the list's own newest-first order already does
 *  — this is that order, in a glance. Sorted on a COPY: the query's array is react-query cache state.
 *
 *  THE SAME CACHED LIST the census and the rows read, so this is a cache hit and never a second request. */
export function useRegexPreview(): readonly CollectionPreviewEntry[] | undefined {
  const trpc = useTRPC();
  const rows = useQuery(trpc.regex.listScripts.queryOptions()).data;
  if (rows === undefined) {
    return rows;
  }
  const newestFirst = [...rows].sort((left, right) => right.updatedAt - left.updatedAt);
  return newestFirst.slice(0, COLLECTION_PREVIEW_LIMIT).map(previewEntry);
}

/** The OPEN member's name for the mobile pushed frame's topbar (the `useMemberTitle` seam) — the SAME
 *  cached list the census and the rows read, so this is a cache hit and never a second request. */
export function useRegexMemberTitle(memberId: string): string | undefined {
  const trpc = useTRPC();
  const rows = useQuery(trpc.regex.listScripts.queryOptions()).data;
  return rows?.find((row) => row.id === memberId)?.name;
}

/** The create runner: mint a script from the schema defaults, then OPEN it in CONTENT — the same
 *  create-then-edit motion the settings pane had, minus the dialog stacked on a modal (C-7). */
export function useCreateRegexMember(): () => void {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const create = useCreateRegexScript({ trpc, invalidation });
  return (): void => {
    create.mutate({ input: makeRegexScriptDefaults() }, { onSuccess: (row): void => selectCollectionMember(REGEX_COLLECTION_ID, row.id) });
  };
}

/** The IMPORT runner (REGX2 · D121-D `band=Import`) — one portable `regex/*.json`, through the SAME thin-arm
 *  verb the backup bundle calls, so a shared script and a restored one can never diverge. The SERVER's
 *  refusal reason is what the reader sees: "written by a newer version of orbweaver" is a different problem
 *  from "that isn't a regex script", and only the difference is actionable.
 *
 *  A DEDUPED import is a SUCCESS with different words, not a failure: the bundle's import rule matches a
 *  candidate against an existing owned row by name + behavior body, so re-importing a script you already
 *  have re-asserts its global scope and mints nothing. Saying "imported" there would be a lie the user
 *  discovers only by counting rows. */
export function useImportRegexMember(): (file: File) => void {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const importScript = useImportRegexScriptFile({ trpc, invalidation });
  return (file: File): void => {
    void file
      .text()
      .then((fileText) => importScript.mutateAsync({ fileText }))
      .then(({ created }) => {
        notify.success(created ? "Script imported." : "You already had that script — nothing new was added.");
      })
      .catch((error: unknown) => {
        notify.error(error instanceof Error ? error.message : "Couldn't import the script.");
      });
  };
}

/** The BULK-SELECT mode the config band's toggle drives (REGX2). The STATE is external
 *  (`state/regex-bulk-store`) because the toggle and the checkboxes it turns on are rendered by two
 *  components that never meet in the tree — the host's band and this feature's rows. */
export function useRegexBulkMode(): { readonly active: boolean; readonly toggle: () => void } {
  return { active: useRegexBulkActive(), toggle: toggleRegexBulkMode };
}
