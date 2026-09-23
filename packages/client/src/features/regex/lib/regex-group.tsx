// The Regex scripts config group (owner fork F-1) — the script library's
// identity on the group base, its `CollectionContribution` riding the `collection` body arm verbatim.

import { Code } from "@orb/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import type { ConfigGroupDefinition, ConfigSearchRow } from "#state";
import { regexCollection } from "./regex-collection.tsx";

import { REGEX_COLLECTION_ID } from "./regex-model.ts";

/** The scripts as SEARCH rows (§3.3) — the list's own cache-first read; non-suspense on purpose. */
function useRegexSearchRows(): readonly ConfigSearchRow[] {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.regex.listScripts.queryOptions());
  return (data ?? []).map((script) => ({ id: script.id, label: script.name, memberId: script.id }));
}

export const regexGroup: ConfigGroupDefinition = {
  id: REGEX_COLLECTION_ID,
  shelf: "collections",
  label: "Regex scripts",
  icon: Code,
  order: 20,
  // #104 item 3 (em-dash diet): a semicolon carries the same two-clause shape without a third dash on a
  // pane that already had two.
  description: "Find/replace that runs on input, output, or both; everywhere, or only where you attach it.",
  useSearchRows: useRegexSearchRows,
  body: { kind: "collection", collection: regexCollection },
};
