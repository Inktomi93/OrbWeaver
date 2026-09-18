// `pnpm bug:reports` with no argument — the listing (#1184).
//
// THE EMPTY ARM IS THE POINT. These artifacts are gitignored, so a cold investigator has no tree evidence
// that any of this exists; a bare "no reports" would read identically to "you are in the wrong checkout" and
// to "the feature is not built". Both empty arms therefore NAME the directory and say how a report gets made
// — the standing named-empty rule (`empty-population-vs-broken-probe`), applied to a reader.

import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { BugReportListing, BugReportSummary } from "../contract/index.ts";

refuseDirectInvocation(import.meta.url, "pnpm bug:reports");

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
/** Characters of sha the build column shows — git's own short-sha length, so it pastes into `git show`. */
const SHORT_SHA = 9;

/** `4m` / `3h` / `2d` — a coarse age, because the exact instant is one column over in `capturedAt`. */
export function humanAge(ageMs: number | null): string {
  if (ageMs === null) {
    return "age?";
  }
  const minutes = Math.max(0, Math.round(ageMs / MS_PER_MINUTE));
  if (minutes < MINUTES_PER_HOUR) {
    return `${String(minutes)}m`;
  }
  const hours = Math.round(minutes / MINUTES_PER_HOUR);
  return hours < HOURS_PER_DAY ? `${String(hours)}h` : `${String(Math.round(hours / HOURS_PER_DAY))}d`;
}

/** The build column: a short sha, `+dirty` when the tree was not the commit, `no-sha` when git could not say. */
export function buildLabel(report: BugReportSummary): string {
  if (report.sha === null) {
    return "no-sha";
  }
  return `${report.sha.slice(0, SHORT_SHA)}${report.dirty ? "+dirty" : ""}`;
}

/** One report, one line. Id first because it is what `pnpm bug:reports <id>` takes; the RELEASE identity
 *  sits ahead of the git build column because it is the field an issue quotes (`v0.4.1 (a1b2c3d4e5f6)`)
 *  and the one a container report can even carry. */
function reportLine(report: BugReportSummary): string {
  const truncated = report.truncatedSources.length === 0 ? "" : `  TRUNCATED(${String(report.truncatedSources.length)})`;
  return [
    report.id,
    `${humanAge(report.ageMs)} ago`,
    report.capturedAt,
    report.version ?? "no-version",
    buildLabel(report),
    report.route ?? "route?",
    `— ${report.noteFirstLine}${truncated}`,
  ].join("  ");
}

/** Render a listing. Pure: the caller prints it, so a spec asserts the exact text. */
export function formatListing(listing: BugReportListing): string {
  const lines: string[] = [];
  if (listing.missing || listing.reports.length === 0) {
    lines.push(listing.missing ? `no bug reports yet — ${listing.dir} does not exist` : `no bug reports yet — ${listing.dir} is empty`);
    lines.push("capture one from the dev top rail: the bug button beside ⌘K (dev builds only), then re-run `pnpm bug:reports`.");
    return withUnreadable(lines, listing).join("\n");
  }
  lines.push(`${String(listing.reports.length)} bug report(s) in ${listing.dir}, newest first:`);
  for (const report of listing.reports) {
    lines.push(`  ${reportLine(report)}`);
  }
  lines.push("");
  lines.push("read one: `pnpm bug:reports <id-or-unique-prefix>`");
  return withUnreadable(lines, listing).join("\n");
}

/** Unreadable bundles are appended to EVERY arm, empty included — a directory holding nothing but corrupt
 *  files must not print as "no reports yet", which is the false-clean this reader would otherwise mint. */
function withUnreadable(lines: readonly string[], listing: BugReportListing): readonly string[] {
  if (listing.unreadable.length === 0) {
    return lines;
  }
  return [
    ...lines,
    "",
    `${String(listing.unreadable.length)} file(s) in that directory could NOT be read as a report:`,
    ...listing.unreadable.map((row) => `  ${row.stem} — ${row.reason}`),
  ];
}
