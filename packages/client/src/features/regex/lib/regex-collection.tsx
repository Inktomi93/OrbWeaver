// The REGEX SCRIPTS collection contribution (config-rail-spec.md · review §4) — co-located with its owner,
// assembled at the door into the `config-collections` registry, consumed BLIND by `features/config`.
//
// It replaces the `regex` settings PANE: this was always a script LIBRARY (its own pane header said so),
// which is workspace anatomy, not a knob stack. The scripts PERSIST as `regex_scripts` rows and RUN through
// the @orb/kit/regex engine in the chat pipeline — neither settings nor chat is their reader, so the
// library homes here.

import { Code } from "@orb/ui/icons";
import type { CollectionContribution } from "#lib";
import { RegexCollectionRows } from "../components/regex-collection-rows.tsx";
import { RegexContextBody } from "../components/regex-context-body.tsx";
import { useCreateRegexMember, useImportRegexMember, useRegexBulkMode, useRegexCount, useRegexMemberTitle } from "../hooks/use-regex-collection.ts";
import { RegexMemberSurface } from "../surfaces/regex-member-surface.tsx";
import { REGEX_COLLECTION_ID } from "./regex-model.ts";

export const regexCollection: CollectionContribution = {
  id: REGEX_COLLECTION_ID,
  label: "Regex scripts",
  icon: Code,
  order: 20,
  blurb: "Find/replace that runs on input, output, or both — everywhere, or only where you attach it.",
  emptyText: "No scripts yet.",
  useCount: useRegexCount,
  useMemberTitle: useRegexMemberTitle,
  create: { label: "New script", useRun: useCreateRegexMember },
  // The two REGX2 band affordances, declared as DATA the host renders in its own chrome grammar (C-4).
  // `importFile` exists at all because the owner's REGX2 ruling ENDED the `{ ruled }` exemption that used to
  // say a script only travels inside the card it belongs to — see `lifecycle-portability.ts`'s regex cells.
  importFile: { label: "Import a regex script", accept: "application/json", useRun: useImportRegexMember },
  bulkSelect: { label: "Select scripts", useMode: useRegexBulkMode },
  list: (view) => <RegexCollectionRows view={view} />,
  detail: (view) => <RegexMemberSurface memberId={view.memberId} />,
  // The band's title is the mock's own ("WHERE IT RUNS"), not the shell's neutral "Details".
  context: { kind: "body", title: "Where it runs", render: (view) => <RegexContextBody memberId={view.memberId} /> },
};
