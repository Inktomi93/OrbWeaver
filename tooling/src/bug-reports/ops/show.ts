// `pnpm bug:reports <id-or-unique-prefix>` — resolve one report and print its digest (#1184).
//
// AN AMBIGUOUS PREFIX REFUSES AND LISTS THE CANDIDATES. It never picks the newest, never picks the first:
// the whole reason a reader takes a prefix is that the ids are uuids nobody retypes, and a resolver that
// guesses turns "I read the wrong report" into a silent outcome. Same posture as `__orb.pluginLog`'s loud
// refusal on an ambiguous ref.

import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { BugReportListing, BugReportResolution, BugReportSummary } from "../contract/index.ts";

refuseDirectInvocation(import.meta.url, "pnpm bug:reports <id-or-unique-prefix>");

/** Match by exact id first, then by unique prefix. Exact wins outright — an id that happens to prefix a
 *  longer one is still an EXACT answer for itself, and refusing it would make a full id unusable. */
export function resolveBugReport(listing: BugReportListing, ref: string, markdown: string | null): BugReportResolution {
  const exact = listing.reports.find((report) => report.id === ref);
  if (exact !== undefined) {
    return { ok: true, report: exact, markdown };
  }
  const matches = listing.reports.filter((report) => report.id.startsWith(ref));
  if (matches.length === 1 && matches[0] !== undefined) {
    return { ok: true, report: matches[0], markdown };
  }
  if (matches.length === 0) {
    return {
      ok: false,
      reason: `no bug report matches "${ref}" in ${listing.dir} — run \`pnpm bug:reports\` for the list`,
      candidates: [],
    };
  }
  return {
    ok: false,
    reason: `"${ref}" is ambiguous — ${String(matches.length)} reports share that prefix; give more characters`,
    candidates: matches.map((report) => report.id),
  };
}

/** Which report a resolution WOULD read, before its markdown is loaded. `null` on a refusal. */
export function resolvedSummary(listing: BugReportListing, ref: string): BugReportSummary | null {
  const resolution = resolveBugReport(listing, ref, null);
  return resolution.ok ? resolution.report : null;
}

/** Render the SHOW output: the markdown digest, then the paths — the JSON is named ALWAYS, because the
 *  digest is an index card and the bundle is the evidence a reviewer actually opens next. */
export function formatShow(resolution: BugReportResolution): string {
  if (!resolution.ok) {
    return resolution.candidates.length === 0 ? resolution.reason : [resolution.reason, ...resolution.candidates.map((id) => `  ${id}`)].join("\n");
  }
  const { report, markdown } = resolution;
  const digest = markdown ?? `(no .md companion was written for ${report.stem} — the bundle below is the whole report)`;
  return [
    digest.trimEnd(),
    "",
    `bundle: ${report.jsonPath}`,
    report.markdownPath === null ? "digest: (none)" : `digest: ${report.markdownPath}`,
    report.truncatedSources.length === 0
      ? ""
      : `TRUNCATED sources — these rings did not reach the whole requested window: ${report.truncatedSources.join(", ")}`,
  ]
    .filter((line, index, lines) => !(line === "" && lines[index - 1] === ""))
    .join("\n");
}
