// THE BUG-REPORT ARTIFACT CONTRACT (#1095/#1184) — the shape and the location of one captured report, in the
// ONE home both sides of it can reach.
//
// It has exactly two consumers and they sit at opposite ends of the tree: the WRITER is
// `@orb/server`'s `foundation/observability/debug/bug-report.ts` (the `/api/_debug/bug-report` capture), and
// the READER is `@orb/tooling`'s `bug-reports` tool (`pnpm bug:reports`). Neither may import the other — the
// server cannot see tooling, and a tool importing the server's observability BARREL would chain-load hono,
// pino and the OTel SDK to list some files. `kit` is the home the cake gives a shape with consumers above it
// on both sides, and this one qualifies without reservation: it is pure data, it reaches nothing, and every
// field it names is already a kit type (`@orb/kit/evidence-window`).
//
// WHY IT IS A SHARED CONTRACT AND NOT TWO SPELLINGS: the directory name is a runtime LITERAL. Re-spelling it
// in the reader means a rename of the writer's dir leaves a lister that finds nothing and says "no reports
// yet" — a silent empty that reads exactly like a quiet week. The stem grammar has the same property: the
// reader RESOLVES a report by the id embedded in the filename, so writer and reader must agree on where that
// id sits or lookup degrades to a scan that sometimes works.

import type { EvidenceSourceMeta, EvidenceWindow } from "#evidence-window";
import type { VersionIdentity } from "#version-identity";

/** The durable home, relative to the repo root (the process cwd in every launch — `entry/lifecycle.ts`'s own
 *  `repoRoot: process.cwd()` derivation). Gitignored: these are the owner's raw session evidence, not
 *  artifacts, so they are never `reports/` (which is instrument run-slots) and never the db. */
export const BUG_REPORT_DIR = "bug-reports";

/** The build a report was taken against. `dirty` is the honest half: in dev the served client IS the working
 *  tree, so a report from an uncommitted tree says so rather than pretending to be the commit it names. */
export interface BugReportBuildIdentity {
  /** `git rev-parse HEAD`, or `null` when git could not answer (not a checkout, git absent). */
  readonly sha: string | null;
  /** true ⇒ `git status --short` was non-empty at capture: this report is NOT the commit it names. */
  readonly dirty: boolean;
  /** The head of `git status --short` when dirty — what was uncommitted, so a later reader can reconstruct. */
  readonly statusHead: readonly string[];
}

/** One captured report, as it is written to disk, echoed to the caller, and read back by the lister. */
export interface BugReportRecord {
  /** The correlation id — also the file stem's tail, so a bundle and its files name each other. */
  readonly id: string;
  /** WHAT THIS BOX IS — the first header field of the envelope, deliberately ahead of everything but the id
   *  (owner ask 2026-09-18). A report is triaged by someone who was not there; `v0.4.1 (a1b2c3d4e5f6)` is
   *  the field that decides whether the behavior is even reproducible on today's tree. Derived by
   *  `@orb/server`'s `foundation/version` — plain-file, no git binary, and the same block `/healthz`,
   *  the boot line and Settings → About report. */
  readonly version: VersionIdentity;
  /** ISO-8601 of the capture. */
  readonly capturedAt: string;
  /** The CHECKOUT-only half {@link version} cannot answer: `git rev-parse HEAD` plus the DIRTY flag. In dev
   *  the served client IS the working tree, so a capture from an uncommitted tree must say so — which needs
   *  git, which an image does not have. Distinct fact, distinct source; never a second spelling of
   *  {@link version}. */
  readonly build: BugReportBuildIdentity;
  readonly window: EvidenceWindow;
  /** The owner's typed note, verbatim. */
  readonly note: string;
  /** Whatever the page assembled — opaque to both ends by design (the client owns its own bundle shape). */
  readonly client: unknown;
  readonly server: {
    readonly sources: readonly EvidenceSourceMeta[];
    readonly evidence: Readonly<Record<string, readonly unknown[]>>;
    /** Whether the provider wire recorder was even on — an empty capture list means nothing without it. */
    readonly wireCaptureEnabled: boolean;
  };
}

/** `2026-09-02T08-19-59` — a filesystem-safe, sortable timestamp. Sortable is the point: the lister's
 *  newest-first order is a NAME sort, so it never has to open a file to order the list. */
function timestampSlug(capturedAt: Date): string {
  return capturedAt
    .toISOString()
    .replace(/\.\d+Z$/u, "")
    .replaceAll(":", "-");
}

/** The file stem both sides agree on: `<sortable timestamp>-<id>`, worn by the `.json` bundle and the `.md`
 *  note alike. The id is the TAIL so `bugReportIdOfStem` can recover it without parsing the timestamp. */
export function bugReportStem(capturedAt: Date, id: string): string {
  return `${timestampSlug(capturedAt)}-${id}`;
}

/** The id embedded in a stem — everything after the timestamp. `null` ⇒ the name is not a report stem, which
 *  a reader must treat as "not one of ours" rather than guessing. */
export function bugReportIdOfStem(stem: string): string | null {
  const match = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-(?<id>.+)$/u.exec(stem);
  return match?.groups?.["id"] ?? null;
}
