// The REGEX SCRIPTS collection contribution (config-rail-spec.md · review §4) — co-located with its owner,
// assembled at the door into the `config-collections` registry, consumed BLIND by `features/config`.
//
// It replaces the `regex` settings PANE: this was always a script LIBRARY (its own pane header said so),
// which is workspace anatomy, not a knob stack. The scripts PERSIST as `regex_scripts` rows and RUN through
// the @orb/kit/regex engine in the chat pipeline — neither settings nor chat is their reader, so the
// library homes here.

import { Code } from "@orb/ui/icons";
import type { CollectionContribution } from "#lib";
import { RegexCollectionRows } from "../components/regex-collection-rows";
import { RegexContextBody } from "../components/regex-context-body";
import { useCreateRegexMember, useRegexCount } from "../hooks/use-regex-collection";
import { RegexMemberSurface } from "../surfaces/regex-member-surface";
import { REGEX_COLLECTION_ID } from "./regex-model";

export const regexCollection: CollectionContribution = {
  id: REGEX_COLLECTION_ID,
  label: "Regex scripts",
  icon: Code,
  order: 20,
  blurb: "Find/replace that runs on input, output, or both — everywhere, or only where you attach it.",
  emptyText: "No scripts yet.",
  useCount: useRegexCount,
  create: { label: "New script", useRun: useCreateRegexMember },
  list: (view) => <RegexCollectionRows view={view} />,
  detail: (view) => <RegexMemberSurface memberId={view.memberId} />,
  context: { kind: "body", render: (view) => <RegexContextBody memberId={view.memberId} /> },
};
