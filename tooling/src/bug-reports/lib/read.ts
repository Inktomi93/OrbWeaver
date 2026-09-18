// Reading the captured bug reports off disk (#1184). Tool-internal: the directory scan, the bundle parse,
// and the summary derivation. `ops/` formats what this returns; nothing here prints.
//
// THE BUNDLE IS FOREIGN DATA. Its `client` half is `unknown` by contract (the page owns that shape and the
// server stores it opaquely), and any file in the directory could be truncated, hand-edited, or from an older
// writer. So every field is read through a narrowing accessor and a parse failure becomes an `unreadable` ROW,
// never a throw and never a silent skip — a report the reader cannot open is exactly the thing an
// investigator needs to be told about.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { BugReportRecord } from "@orb/kit/bug-report";
import { BUG_REPORT_DIR, bugReportIdOfStem } from "@orb/kit/bug-report";
import type { BugReportListing, BugReportSummary } from "../contract/index.ts";

/** The absolute report directory for a checkout. One derivation — callers never join it themselves. */
export function bugReportDir(repoRoot: string): string {
  return join(repoRoot, BUG_REPORT_DIR);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

/** A TOP-LEVEL field of the writer's record. Every read of the bundle's own fields goes through
 *  {@link bundleField}, so this is a real compile-time coupling and not a comment: rename a field on
 *  `BugReportRecord` and every call site here REDS, instead of the lister quietly printing "route?" forever. */
type BundleField = keyof BugReportRecord;

/** Read one of the writer's own top-level fields off a parsed bundle. Still `unknown` on the way out — the
 *  file is foreign data and could be truncated or written by an older writer — but the NAME is not free. */
function bundleField(record: Readonly<Record<string, unknown>>, key: BundleField): unknown {
  return record[key];
}

/** A string, or `null` — the ONE narrowing both accessors below share. */
function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readString(source: unknown, key: string): string | null {
  return isRecord(source) ? asString(source[key]) : null;
}

/** The client bundle's `route.pathname`, or `null`. Two hops through opaque data, so both are narrowed. */
function routeOf(record: Readonly<Record<string, unknown>>): string | null {
  const client = bundleField(record, "client");
  return isRecord(client) ? readString(client["route"], "pathname") : null;
}

/** The sources whose ring did not reach the whole requested window. Reads BOTH halves of the bundle — the
 *  page's own receipts and the server's — because a report is partial if EITHER side was. */
function truncatedSourcesOf(record: Readonly<Record<string, unknown>>): readonly string[] {
  const server = bundleField(record, "server");
  const client = bundleField(record, "client");
  const groups = [isRecord(server) ? server["sources"] : undefined, isRecord(client) ? client["sources"] : undefined];
  const names: string[] = [];
  for (const group of groups) {
    if (!Array.isArray(group)) {
      continue;
    }
    for (const meta of group) {
      if (isRecord(meta) && typeof meta["truncatedAt"] === "number") {
        const name = readString(meta, "source");
        if (name !== null) {
          names.push(name);
        }
      }
    }
  }
  return names;
}

/** The bundle's `version` block rendered as the one line the listing prints. Read through the SAME foreign-
 *  data narrowing as every other field — an older bundle carries no `version` at all, which is `null`, not a
 *  crash. `formatVersionIdentity` is not reused here because it demands a fully-typed identity and this is a
 *  hand-parsed object off disk; the two-field degrade below is what an incomplete block should print. */
function versionLabelOf(record: Readonly<Record<string, unknown>>): string | null {
  const version = bundleField(record, "version");
  if (!isRecord(version)) {
    return null;
  }
  const release = asString(version["version"]);
  const short = asString(version["short"]);
  const source = asString(version["source"]);
  if (release === null) {
    return null;
  }
  return `v${release} (${short ?? "no-commit"}${source === null ? "" : `, ${source}`})`;
}

/** The note's first non-empty line, collapsed to one line and capped — a listing is an index, not a read. */
function firstLineOf(note: string, cap: number): string {
  const line = note
    .split("\n")
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.length > 0);
  if (line === undefined) {
    return "(no note)";
  }
  return line.length > cap ? `${line.slice(0, cap - 1)}…` : line;
}

/** How much of a note's first line the listing prints. */
const NOTE_LINE_CAP = 72;

/** Build one summary from a parsed bundle. `now` is INJECTED so a spec pins `ageMs` instead of racing it. */
function summarize(args: {
  readonly stem: string;
  readonly id: string;
  readonly record: Readonly<Record<string, unknown>>;
  readonly dir: string;
  readonly hasMarkdown: boolean;
  readonly now: number;
}): BugReportSummary {
  const { stem, id, record, dir, hasMarkdown, now } = args;
  const capturedAt = asString(bundleField(record, "capturedAt")) ?? "";
  const capturedMs = capturedAt === "" ? Number.NaN : Date.parse(capturedAt);
  const build = bundleField(record, "build");
  return {
    id,
    version: versionLabelOf(record),
    stem,
    capturedAt,
    ageMs: Number.isNaN(capturedMs) ? null : now - capturedMs,
    noteFirstLine: firstLineOf(asString(bundleField(record, "note")) ?? "", NOTE_LINE_CAP),
    route: routeOf(record),
    sha: isRecord(build) ? readString(build, "sha") : null,
    dirty: isRecord(build) && build["dirty"] === true,
    truncatedSources: truncatedSourcesOf(record),
    jsonPath: join(dir, `${stem}.json`),
    markdownPath: hasMarkdown ? join(dir, `${stem}.md`) : null,
  };
}

/** Read every report in a checkout, newest first.
 *
 *  NEWEST-FIRST IS A NAME SORT, not a `capturedAt` sort: the stem leads with a sortable UTC timestamp
 *  (`@orb/kit/bug-report`'s `bugReportStem`), so the order is correct before a single file is opened — and it
 *  stays correct for a bundle whose body failed to parse, which a body-derived sort could not place at all. */
export async function readBugReports(repoRoot: string, now: number): Promise<BugReportListing> {
  const dir = bugReportDir(repoRoot);
  const entries = await listDir(dir);
  if (entries === null) {
    return { dir, missing: true, reports: [], unreadable: [] };
  }
  const markdownStems = new Set(entries.filter((name) => name.endsWith(".md")).map((name) => name.slice(0, -".md".length)));
  const stems = entries
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .sort()
    .reverse();
  const reports: BugReportSummary[] = [];
  const unreadable: { stem: string; reason: string }[] = [];
  for (const stem of stems) {
    const id = bugReportIdOfStem(stem);
    if (id === null) {
      unreadable.push({ stem, reason: "the filename is not a report stem (<timestamp>-<id>)" });
      continue;
    }
    const parsed = await parseBundle(join(dir, `${stem}.json`));
    if (parsed === null) {
      unreadable.push({ stem, reason: "the bundle is not readable JSON — truncated, or written by a different writer" });
      continue;
    }
    reports.push({ ...summarize({ stem, id, record: parsed, dir, hasMarkdown: markdownStems.has(stem), now }) });
  }
  return { dir, missing: false, reports, unreadable };
}

/** The directory's entries, or `null` when it does not exist (nothing captured yet in this checkout). */
async function listDir(dir: string): Promise<readonly string[] | null> {
  // @orb-waive caught-failure-ownership(catch): an absent directory IS the answer here — it
  // becomes the listing's `missing: true` arm, which the formatter renders as a named empty naming the capture
  // path. Ends if `missing` stops being rendered distinctly from "zero reports".
  try {
    return await readdir(dir);
  } catch {
    return null;
  }
}

/** A parsed bundle object, or `null` when the file is unreadable/not an object — the `unreadable` row. */
async function parseBundle(path: string): Promise<Readonly<Record<string, unknown>> | null> {
  // @orb-waive caught-failure-ownership(catch): the null is consumed as an `unreadable` ROW in
  // the listing, which is printed — a report the reader cannot open is reported, never skipped. Ends if the
  // caller stops recording the row.
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** The `.md` digest beside a bundle, or `null` when the capture wrote only half. */
export async function readBugReportMarkdown(path: string | null): Promise<string | null> {
  if (path === null) {
    return null;
  }
  // @orb-waive caught-failure-ownership(catch): a missing companion degrades the SHOW output to
  // "the bundle is at <path>" rather than failing the lookup — the JSON is the evidence, the md is the index
  // card. Ends if the show formatter stops handling a null digest.
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}
