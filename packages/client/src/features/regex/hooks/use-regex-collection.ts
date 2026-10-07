// The regex collection's host-facing hooks (the `CollectionContribution` seam): the group count, the create
// verb, the IMPORT door's runner and the BULK-SELECT mode. All are hooks because a definition is a
// module-level value — the host calls each unconditionally, once, per rendered affordance.

import { useQuery } from "@tanstack/react-query";
import { useInvalidation, useTRPC } from "#data";
import type { CollectionCount, CollectionInsight } from "#lib";
import { notify, regexScriptTitle, timeLib } from "#lib";
import { selectCollectionMember, toggleRegexBulkMode, useRegexBulkActive } from "#state";
import { REGEX_COLLECTION_ID } from "../lib/regex-model.ts";
import { useCreateRegexScript, useImportRegexScriptFile } from "./use-regex-library.ts";
import { makeRegexScriptDefaults } from "./use-regex-script-form.ts";

/** The group band's live census — a NON-suspending read sharing the rows' cache. A FAILED read says so
 *  rather than reading as absence (#1546 — see {@link CollectionCount}). */
export function useRegexCount(): CollectionCount {
  const trpc = useTRPC();
  const census = useQuery(trpc.regex.listScripts.queryOptions());
  // `refetch` takes an OPTIONS BAG, so it is wrapped rather than passed by reference.
  return { count: census.data?.length, failed: census.error !== null, retry: (): void => void census.refetch().catch(globalThis.reportError) };
}

/**
 * THE REGEX LIBRARY'S OWN LANDING FACTS (the `insights` seam — #1209 replaced the preview wall with these).
 *
 * WHAT THE LIST CANNOT SAY. A script's row carries its name and its find pattern; what it cannot state is
 * the shape of the LIBRARY — how much of it is armed everywhere, how much of it is switched OFF (a disabled
 * script looks like a live one at a glance and silently does nothing), and when it was last touched. Those
 * are the three questions a reader returning to a rules library actually arrives with, and none of them is
 * answerable by scrolling rows.
 *
 * ONE CACHED READ, the same key the census, the rows and the member title share — never a second request.
 * The scope fact reads `enabled`+`runsGlobally` off those same rows rather than the `listGlobal` key, so the
 * landing costs nothing beyond what the pane has already loaded. Sorted on a COPY: the query's array is
 * react-query cache state.
 */
export function useRegexInsights(): readonly CollectionInsight[] | undefined {
  const trpc = useTRPC();
  const rows = useQuery(trpc.regex.listScripts.queryOptions()).data;
  if (rows === undefined) {
    return rows;
  }
  const off = rows.filter((row) => !row.enabled);
  const firstOff = off[0];
  const newest = [...rows].sort((left, right) => right.updatedAt - left.updatedAt)[0];
  return [
    {
      id: "disabled",
      label: "Switched off",
      value: `${String(off.length)} of ${String(rows.length)}`,
      ...(firstOff === undefined
        ? {}
        : { open: { label: `Open ${regexScriptTitle(firstOff)}`, run: (): void => selectCollectionMember(REGEX_COLLECTION_ID, firstOff.id) } }),
    },
    ...(newest === undefined
      ? []
      : [
          {
            id: "last-edited",
            label: "Last edited",
            value: timeLib.formatRelative(newest.updatedAt),
            open: { label: `Open ${regexScriptTitle(newest)}`, run: (): void => selectCollectionMember(REGEX_COLLECTION_ID, newest.id) },
          },
        ]),
  ];
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
