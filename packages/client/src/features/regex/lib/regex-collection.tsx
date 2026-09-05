// The REGEX SCRIPTS collection contribution (config-rail-spec.md · review §4) — the `collection` body of the
// `regex` config group (`regex-group.tsx` carries the library's identity since the config revamp #866 S1),
// consumed BLIND by `features/config`.
//
// It replaces the `regex` settings PANE: this was always a script LIBRARY (its own pane header said so),
// which is workspace anatomy, not a knob stack. The scripts PERSIST as `regex_scripts` rows and RUN through
// the @orb/kit/regex engine in the chat pipeline — neither settings nor chat is their reader, so the
// library homes here.

import type { CollectionContribution } from "#lib";
import { RegexCollectionRows } from "../components/regex-collection-rows.tsx";
import { RegexContextBody } from "../components/regex-context-body.tsx";
import {
  useCreateRegexMember,
  useImportRegexMember,
  useRegexBulkMode,
  useRegexCount,
  useRegexInsights,
  useRegexMemberTitle,
} from "../hooks/use-regex-collection.ts";
import { RegexMemberSurface } from "../surfaces/regex-member-surface.tsx";

export const regexCollection: CollectionContribution = {
  emptyText: "No scripts yet.",
  useCount: useRegexCount,
  // The landing's library-level FACTS (#1209): how much of the library is switched OFF and when it was
  // last touched — two questions a rules library answers and its LIST of rows cannot.
  insights: { useInsights: useRegexInsights },
  useMemberTitle: useRegexMemberTitle,
  create: { label: "New script", useRun: useCreateRegexMember },
  // The two REGX2 band affordances, declared as DATA the host renders in its own chrome grammar (C-4).
  // `importFile` exists at all because the owner's REGX2 ruling ENDED the `{ ruled }` exemption that used to
  // say a script only travels inside the card it belongs to — see `lifecycle-portability.ts`'s regex cells.
  importFile: { label: "Import a regex script", accept: "application/json", useRun: useImportRegexMember },
  bulkSelect: { label: "Select scripts", useMode: useRegexBulkMode },
  list: (view) => <RegexCollectionRows view={view} />,
  // The WHOLE view: the editor draws the drill row out of `library` too (#1747, §3.4).
  detail: (view) => <RegexMemberSurface view={view} />,
  // The band's title names what the pane ANSWERS, not the shell's neutral "Details" — the mock drew it
  // "WHERE IT RUNS".
  //
  // …AND IT IS NO LONGER "WHERE IT RUNS" (side-eye 2026-08-19, the clarity finding). Two orthogonal concepts
  // wore near-identical phrasing on one screen: the EDITOR's `Runs on` field picks which TEXT STREAMS a
  // script rewrites (your message · model output · rendered transcript), while THIS pane decides and reports
  // which SCOPES it is attached from (globally, or by a preset / character / room). A reader who has just
  // set "Runs on" and then reads "Where it runs" 300px away has no way to know they are not the same
  // control, and the pane's own copy already speaks the attachment vocabulary ("Runs in every chat",
  // "Attached by presets · 2"). The panel is re-headed rather than the field, because the field's label is
  // also quoted inside this pane's own "no stream selected" warning — one re-head, one changed string.
  context: { kind: "body", title: "Where it’s attached", render: (view) => <RegexContextBody memberId={view.memberId} /> },
};
