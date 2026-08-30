// The Regex scripts config group (config-revamp-design.md §3.1, owner fork F-1) — the script library's
// identity on the group base, its `CollectionContribution` riding the `collection` body arm verbatim.

import { Code } from "@orb/ui/icons";
import type { ConfigGroupDefinition } from "#state";
import { regexCollection } from "./regex-collection.tsx";
import { REGEX_COLLECTION_ID } from "./regex-model.ts";

export const regexGroup: ConfigGroupDefinition = {
  id: REGEX_COLLECTION_ID,
  shelf: "collections",
  label: "Regex scripts",
  icon: Code,
  order: 20,
  // #104 item 3 (em-dash diet): a semicolon carries the same two-clause shape without a third dash on a
  // pane that already had two.
  description: "Find/replace that runs on input, output, or both; everywhere, or only where you attach it.",
  body: { kind: "collection", collection: regexCollection },
};
