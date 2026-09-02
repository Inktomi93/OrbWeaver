// `bug-reports` — the READER for the dev bug-found button's durable captures (#1095 wrote them, #1184 made
// them findable). Programmatic surface; `cli.ts` is the argv door and `pnpm bug:reports` is the front door.
//
// WHY A TOOL AT ALL: the artifacts are GITIGNORED per the #1095 contract (they carry whatever the page and
// the server's flight recorders held, so they are the owner's raw evidence and never committed). That makes
// them invisible to every normal way an agent session finds things — no tree grep, no file listing in a diff,
// nothing. The owner's words at filing: "so we don't forget that it exists." A named pnpm script IS the
// memory; this tool is what it points at.
//
// NOT AN INSTRUMENT, deliberately: it publishes no verdict about the app, files no artifact, and opens no run
// slot, so it is correctly absent from `_shared/instruments.ts`'s `INSTRUMENT_TOOLS` (whose members owe
// bite/absence proofs because a blind zero from them would read as a pass). Its own blind-zero risk is real
// but different in kind and handled in-band: a zero-report listing is a NAMED empty that states the directory
// and how a capture is made, never a bare "nothing".
//
// Scope is list + show and stops there — no filters, no search, no in-tool triage. The review ritual is "read
// the new reports, file rows from them", and the JSON bundle is what a reviewer opens next.

export type { BugReportListing, BugReportResolution, BugReportSummary } from "./contract/index.ts";
export { bugReportDir, readBugReportMarkdown, readBugReports } from "./lib/read.ts";
export { buildLabel, formatListing, humanAge } from "./ops/list.ts";
export { formatShow, resolveBugReport, resolvedSummary } from "./ops/show.ts";
