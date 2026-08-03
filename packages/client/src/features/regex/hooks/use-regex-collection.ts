// The regex collection's host-facing hooks (the `CollectionContribution` seam): the group count and the
// create verb. Both are hooks because a definition is a module-level value — the host calls them
// unconditionally, once, per rendered affordance.

import { useQuery } from "@tanstack/react-query";
import { useInvalidation, useTRPC } from "#data";
import { selectCollectionMember } from "#state";
import { REGEX_COLLECTION_ID } from "../lib/regex-model";
import { useCreateRegexScript } from "./use-regex-library";
import { makeRegexScriptDefaults } from "./use-regex-script-form";

/** The group band's live census — a NON-suspending read sharing the rows' cache. */
export function useRegexCount(): number | undefined {
  const trpc = useTRPC();
  return useQuery(trpc.regex.listScripts.queryOptions()).data?.length;
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
