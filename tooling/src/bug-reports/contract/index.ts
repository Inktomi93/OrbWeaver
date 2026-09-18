// The `bug-reports` reader's result shapes (#1184). The ARTIFACT's own shape is not respelled here — it is
// `@orb/kit/bug-report`, the one home the writer (`@orb/server`'s `/api/_debug/bug-report`) also reads.
// These types are what the READER derives from it: the one-line summary the listing prints, and the
// resolution verdict for a lookup by id or prefix.

/** One report as the listing shows it — everything derived up front so the formatter opens no files. */
export interface BugReportSummary {
  /** The correlation id from the file stem. */
  readonly id: string;
  /** `<sortable timestamp>-<id>` — the shared stem both artifacts wear. */
  readonly stem: string;
  /** ISO-8601 of the capture, from the bundle. */
  readonly capturedAt: string;
  /** Milliseconds between the capture and the listing — `null` when `capturedAt` did not parse. */
  readonly ageMs: number | null;
  /** The FIRST LINE of the owner's note. The whole note is in the `.md`; a listing is an index, not a read. */
  readonly noteFirstLine: string;
  /** Where the report was taken — the client bundle's `route.pathname`, or `null` when it carried none. */
  readonly route: string | null;
  /** The RELEASE identity at capture — the root manifest's version and the short commit the process derived
   *  for itself, as `v0.4.1 (a1b2c3d4e5f6, container)`. `null` when the bundle predates the field or was
   *  written by a different writer; the listing prints `no-version` rather than a blank column, because a
   *  report that cannot say what it ran against is a fact about the report. */
  readonly version: string | null;
  /** The build identity at capture. `sha: null` = git could not answer; `dirty` = NOT the commit it names. */
  readonly sha: string | null;
  readonly dirty: boolean;
  /** The sources whose ring did not reach the whole requested window — the honesty half, surfaced in the
   *  listing because a reader choosing WHICH report to open should know which ones are partial. */
  readonly truncatedSources: readonly string[];
  readonly jsonPath: string;
  /** The `.md` companion, or `null` when only the bundle survived (a half-written capture). */
  readonly markdownPath: string | null;
}

/** What a listing found. `dir` is stated ALWAYS, including on the empty arm — a bare "no reports" cannot
 *  tell "none captured yet" from "you are looking in the wrong tree", and this reader answers both. */
export interface BugReportListing {
  /** The absolute directory scanned. */
  readonly dir: string;
  /** true ⇒ the directory does not exist yet (nothing has ever been captured in this checkout). */
  readonly missing: boolean;
  /** Newest-first — a NAME sort, since the stem's timestamp leads and sorts lexically. */
  readonly reports: readonly BugReportSummary[];
  /** Stems that look like reports but whose bundle could not be read, with why. Never silently dropped: a
   *  report the reader cannot parse is a defect in the writer or a truncated file, and both matter. */
  readonly unreadable: readonly { readonly stem: string; readonly reason: string }[];
}

/** A lookup by id or prefix. An ambiguous ref REFUSES with the candidates — it never picks one. */
export type BugReportResolution =
  | { readonly ok: true; readonly report: BugReportSummary; readonly markdown: string | null }
  | { readonly ok: false; readonly reason: string; readonly candidates: readonly string[] };
