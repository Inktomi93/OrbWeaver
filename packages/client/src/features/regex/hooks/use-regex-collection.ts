// The regex collection's host-facing hooks (the `CollectionContribution` seam): the group count, the create
// verb, the IMPORT door's runner and the BULK-SELECT mode. All are hooks because a definition is a
// module-level value — the host calls each unconditionally, once, per rendered affordance.

import { useQuery } from "@tanstack/react-query";
import { useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { selectCollectionMember, toggleRegexBulkMode, useRegexBulkActive } from "#state";
import { REGEX_COLLECTION_ID } from "../lib/regex-model.ts";
import { useCreateRegexScript, useImportRegexScriptFile } from "./use-regex-library.ts";
import { makeRegexScriptDefaults } from "./use-regex-script-form.ts";

/** The group band's live census — a NON-suspending read sharing the rows' cache. */
export function useRegexCount(): number | undefined {
  const trpc = useTRPC();
  return useQuery(trpc.regex.listScripts.queryOptions()).data?.length;
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
    void create.mutateAsync({ input: makeRegexScriptDefaults() }).then((row) => {
      selectCollectionMember(REGEX_COLLECTION_ID, row.id);
    });
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
