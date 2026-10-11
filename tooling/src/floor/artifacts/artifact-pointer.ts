// THE READ SIDE of the run-slot layout (#2502) — "which run is this `reports/…` pointer actually serving?"
//
// ./artifacts.ts owns the WRITE side: a run writes into `reports/runs/<instrument>/<runId>/` and, at
// completion only, publishes the well-known paths the constitution names as relative symlinks into that
// slot (UNIFIED-VERIFICATION-DESIGN.md §3.3b). That publish-at-completion policy is CORRECT and this module
// does not touch it: it is what lets two concurrent runs each keep a coherent verdict, and `reports/…` is
// therefore always a COMPLETE run — just not necessarily the run the reader meant.
//
// THE DEFECT THIS CLOSES. The write side was centralized and the read side was not, so every reader
// re-derived "whose run is this" for itself or — more often — never asked. Measured 2026-09-20: three
// separate misattributions in one day, ALL of them hand-paths of `reports/verify/<stage>.log`, plus
// `reports/test-report-tooling.json` sitting on a 2026-09-13 slot for a week while every `tests:tooling`
// verdict was read as a run that had happened. Not one of the three was a rendering problem; all three were
// RESOLUTION failures, which is why this module is a resolver and the renderers stay per-instrument (a
// single renderer would need the union of every instrument's display vocabulary — `--gate`/`--file` for
// structure, `Test Files`/`Tests` for a test report, arms and viewports for a snap run).
//
// THE FOUR QUESTIONS, and nothing else: which slot am I reading · is it the newest COMPLETE one · is a newer
// run IN FLIGHT · when did it publish. `check:show`'s existing provenance first line is the PRECEDENT for
// how the answer is spoken (`formatRunProvenance`), not a thing to redesign.
import { lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { instrumentRunsDir, PUBLISHED_MANIFEST, pointerRunId, readMarker, reportsPath, runDirs } from "./artifacts.ts";
import { pidAlive } from "./run-retention.ts";

/** What a slot IS right now, derived from ./artifacts.ts's own two markers: `.inflight` present with a LIVE
 *  pid is a concurrent writer; present with a DEAD pid is a run that was killed, OOM-aborted or timed out;
 *  absent means the run finished (`finishSlot` unlinks it — for a publisher AND for a run that deliberately
 *  published nothing). There is no fourth state: a slot with no marker is done, whatever it published. */
export const SLOT_STATES = ["in-flight", "abandoned", "complete"] as const;
export type SlotState = (typeof SLOT_STATES)[number];

/** What an ALIAS is: resolving into the newest complete slot (`fresh`), into an OLDER one than the
 *  instrument's newest complete run (`stale` — the week-dark class), a symlink whose slot is gone
 *  (`dangling`), a REAL file rather than a pointer (`unslotted` — every pre-#1029 artifact, and anything a
 *  human copied over the alias), or nothing at all (`absent`). */
export const POINTER_STATES = ["fresh", "stale", "dangling", "unslotted", "absent"] as const;
export type PointerState = (typeof POINTER_STATES)[number];

/** WHERE a slot's instant came from. A run id carries its own start stamp (`<checkout>-<pid>-<ISO>`), which
 *  is exact; a slot whose id does not parse falls back to the directory mtime, which is a different fact and
 *  is labelled as one rather than laundered into the same field. */
export const RUN_INSTANT_SOURCES = ["run-id", "mtime"] as const;
export type RunInstantSource = (typeof RUN_INSTANT_SOURCES)[number];

export interface SlotCensusRow {
  readonly runId: string;
  /** ABSOLUTE path of the slot dir. */
  readonly dir: string;
  readonly state: SlotState;
  /** ISO instant the run STARTED (see `RunInstantSource` for which fact this is). */
  readonly ranAt: string;
  readonly ranAtSource: RunInstantSource;
  /** The in-flight marker's pid — present only while the marker is (in-flight and abandoned rows). */
  readonly pid: number | null;
  /** HOW MANY `latest` ALIASES THIS RUN PUBLISHED, or null for a slot with no manifest at all (pre-#2221).
   *  Zero is NOT the same as null and this is the one reader that must not collapse them: `closeRunSlot`
   *  writes an explicit `[]` for a run that FINISHED and deliberately published nothing — a fixture-mode or
   *  gate-scoped `check:structure` (ops/structure.ts:352) — and such a run never spoke for the instrument,
   *  so it must not be the "newest complete run" another pointer is called stale against. Measured while
   *  building this: without the distinction, every `check:structure --family <x>` floor run of the #1584
   *  program would have made `reports/check-structure.json` read STALE. */
  readonly publishedCount: number | null;
}

export interface PointerResolution {
  readonly instrument: string;
  /** The alias as spelled under `reports/` (`verify.json`, `verify`, `test-report-tooling.json`). */
  readonly alias: string;
  /** ABSOLUTE path of the alias itself. */
  readonly path: string;
  readonly state: PointerState;
  /** The run the alias resolves into, or null for `absent`/`unslotted`/an unparseable target. */
  readonly runId: string | null;
  /** The repo-relative slot dir the alias resolves into — the second half of the provenance line. */
  readonly relDir: string | null;
  /** WHEN THIS POINTER WAS PUBLISHED: the alias's own lstat mtime. `publishSymlink` creates the link and
   *  renames it over the alias, and rename preserves the link's own timestamps, so this is the publish
   *  instant and not a read or a slot write. Null when there is no alias to stat. */
  readonly publishedAt: string | null;
  /** The census row for the resolved slot, when the slot still exists. */
  readonly resolved: SlotCensusRow | null;
  /** The instrument's newest COMPLETE slot — what `fresh` is measured against. */
  readonly newestComplete: SlotCensusRow | null;
  /** Runs of this instrument that are writing RIGHT NOW and started after the resolved slot. Non-empty means
   *  a read of this alias is ambiguous: the answer the caller wants may be about to be published. */
  readonly inFlight: readonly SlotCensusRow[];
  /** Runs that DIED after the resolved slot ran — "your last run never finished and you are about to read an
   *  older verdict as its result" (the #410 tell, re-rooted onto slots by #1029). */
  readonly abandoned: readonly SlotCensusRow[];
}

const RUN_ID_STAMP = /-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/u;
const RUNS_ALIAS = "runs";

/** The ISO instant a run id carries, or null when the id was not minted by `runId()`. */
function stampOf(runIdValue: string): string | null {
  const m = RUN_ID_STAMP.exec(runIdValue);
  return m === null ? null : `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`;
}

/** How many aliases a slot's `.published` manifest records, or null when there is no manifest. Read HERE
 *  rather than through ./artifacts.ts `publishedAliases`, whose own waived contract collapses "never
 *  published" into "manifest lost" for the retention question it answers — the filename is shared, the
 *  three-way answer is this reader's. */
function publishedCountOf(dir: string): number | null {
  // @orb-waive caught-failure-ownership(catch): an absent or unreadable `.published` manifest is the UNKNOWN answer to "how many aliases did this run publish?", and `null` is that answer — deliberately distinct from the `0` a run that finished and published nothing writes. Both are returned to the one caller, which acts on the difference. Ends if a caller starts needing to know WHY the manifest was unreadable.
  try {
    const parsed = JSON.parse(readFileSync(join(dir, PUBLISHED_MANIFEST), "utf-8")) as readonly string[];
    return parsed.length;
  } catch {
    return null; // no manifest (or an unreadable one): this slot's publishing intent is UNKNOWN, not zero
  }
}

/** A slot's last-modified instant, or null when the slot vanished under us (a concurrent publisher's prune —
 *  the same race ./artifacts.ts `slotMtime` answers with a value rather than a throw). */
function dirInstant(dir: string): string | null {
  // @orb-waive caught-failure-ownership(catch): a slot removed by a concurrent publisher's prune between the directory listing and this stat is the expected racing case (the same one ./artifacts.ts `slotMtime` answers with a value), and `null` is the answer its one caller acts on — the slot is dropped from the census, because a slot that is gone has no instant. Ends if a vanished slot must be distinguished from an unreadable one.
  try {
    return new Date(statSync(dir).mtimeMs).toISOString();
  } catch {
    return null; // pruned between the listing and this stat — nothing to report about a slot that is gone
  }
}

function censusRow(dir: string, runIdValue: string): SlotCensusRow | null {
  const marker = readMarker(dir);
  const stamp = stampOf(runIdValue);
  // The three instants in preference order, written out rather than as a `??` chain: biome's type service
  // reads `stampOf`'s `string | null` as `string` and calls every fallback unreachable (the same
  // cross-module narrowing blind spot the repo hits on zod-inferred unions), and the honest fix is the
  // structure, never a suppression.
  let ranAt: string | null = stamp;
  if (ranAt === null && marker !== null) {
    ranAt = marker.startedAt;
  }
  if (ranAt === null) {
    ranAt = dirInstant(dir);
  }
  if (ranAt === null) {
    return null;
  }
  let state: SlotState = "complete";
  let pid: number | null = null;
  if (marker !== null) {
    pid = marker.pid;
    state = pidAlive(marker.pid) ? "in-flight" : "abandoned";
  }
  return { runId: runIdValue, dir, state, ranAt, ranAtSource: stamp === null ? "mtime" : "run-id", pid, publishedCount: publishedCountOf(dir) };
}

/** Did this run SPEAK for its instrument? A complete run that published at least one `latest` alias did; a
 *  complete run that explicitly published NONE did not (see `SlotCensusRow.publishedCount`), and a slot with
 *  no manifest at all is UNKNOWN and is counted as a publisher — the conservative direction, because calling
 *  an unknown a non-publisher would silently suppress a real staleness finding. */
function spokeForInstrument(row: SlotCensusRow): boolean {
  return row.state === "complete" && row.publishedCount !== 0;
}

/** Every slot of `instrument` on this checkout with its state and its instant, NEWEST FIRST. This is the one
 *  place the three states are decided; every question below is a filter over it. */
export function slotCensus(root: string, instrument: string): readonly SlotCensusRow[] {
  const base = instrumentRunsDir(root, instrument);
  return runDirs(root, instrument)
    .map((name) => censusRow(join(base, name), name))
    .filter((row): row is SlotCensusRow => row !== null)
    .sort((a, b) => b.ranAt.localeCompare(a.ranAt));
}

/** Is there an alias here at all, and is it a POINTER? `lstat`, never `stat`: a dangling symlink must read as
 *  a dangling POINTER, not as an absent file. */
function aliasKind(path: string): "symlink" | "file" | "absent" {
  // @orb-waive caught-failure-ownership(catch): this IS an existence predicate — the throw is the `absent` answer, one of the three values the caller switches on, and it becomes the operator-visible `absent` pointer state (which `check:show --stage` turns into a refusal naming the command to run). Ends if the caller starts needing WHY the alias is unreadable.
  try {
    return lstatSync(path).isSymbolicLink() ? "symlink" : "file";
  } catch {
    return "absent"; // nothing published here yet — the honest negative, and the caller's own refusal text
  }
}

function pointerState(kind: "symlink" | "file" | "absent", resolved: SlotCensusRow | null, newestComplete: SlotCensusRow | null): PointerState {
  if (kind === "absent") {
    return "absent";
  }
  if (kind === "file") {
    return "unslotted";
  }
  if (resolved === null) {
    return "dangling";
  }
  return newestComplete !== null && newestComplete.ranAt > resolved.ranAt ? "stale" : "fresh";
}

function aliasInstant(path: string): string | null {
  // @orb-waive caught-failure-ownership(catch): there is no alias to stat — the `state` field, computed from `aliasKind` above, has already told the reader that, so a publish instant of `null` is the consistent answer rather than a swallowed failure. Ends if `publishedAt` becomes readable independently of `state`.
  try {
    return new Date(lstatSync(path).mtimeMs).toISOString();
  } catch {
    return null; // no alias to stat — `state` already says so
  }
}

/** THE RESOLVER. Answer the four questions for one published alias of one instrument. Pure reads: it never
 *  publishes, prunes or repairs — a reader that mutated the evidence it is judging could not be trusted
 *  about it. */
export function resolvePointer(root: string, instrument: string, alias: string): PointerResolution {
  const path = reportsPath(root, alias);
  const kind = aliasKind(path);
  const census = slotCensus(root, instrument);
  const resolvedId = kind === "symlink" ? pointerRunId(root, alias, instrument) : null;
  const resolved = census.find((row) => row.runId === resolvedId) ?? null;
  const newestComplete = census.find(spokeForInstrument) ?? null;
  const newerThanResolved = (row: SlotCensusRow): boolean => resolved === null || row.ranAt > resolved.ranAt;
  return {
    instrument,
    alias,
    path,
    state: pointerState(kind, resolved, newestComplete),
    runId: resolvedId,
    relDir: resolvedId === null ? null : relDirOf(root, instrument, resolvedId),
    publishedAt: aliasInstant(path),
    resolved,
    newestComplete,
    inFlight: census.filter((row) => row.state === "in-flight" && newerThanResolved(row)),
    abandoned: census.filter((row) => row.state === "abandoned" && newerThanResolved(row)),
  };
}

/** The repo-relative slot spelling a provenance line prints. Derived from the SAME path home the writer used
 *  (`reportsPath`), never a second `reports/…` literal (policy `tooling-artifact-path-home`). */
function relDirOf(root: string, instrument: string, runIdValue: string): string {
  return join(instrumentRunsDir(root, instrument), runIdValue).slice(root.length + 1);
}

/** HOW A RUN NAMES ITSELF TO A READER — the one spelling, taken from `check:show`'s shipped first line
 *  (`(run <id> → reports/runs/<instrument>/<id>)`). Every instrument's reader prints provenance through
 *  here, so the format cannot drift per tool and a reader that forgets it is the exception rather than the
 *  norm. The bare id is the answer when the slot is not known. */
export function formatRunProvenance(runIdValue: string, relDir: string | null | undefined): string {
  return relDir === null || relDir === undefined ? runIdValue : `${runIdValue} → ${relDir}`;
}

/** The provenance line a resolver-backed reader prints FIRST, in `check:show`'s shipped shape. An alias that
 *  resolves to nothing says so rather than printing an empty parenthesis. */
export function provenanceLine(res: PointerResolution): string {
  if (res.runId === null) {
    return `(no ${res.instrument} run is published at reports/${res.alias} — ${res.state})`;
  }
  return `(run ${formatRunProvenance(res.runId, res.relDir)})`;
}

/** THE UNIFORM BANNER — the "this is not the run you meant" lines, identical for every instrument instead of
 *  nine slightly different warnings. Returns the lines to print; an empty list means the pointer is the
 *  newest complete run of its instrument and nothing newer is happening. A refusal (exit 2) is the CALLER's
 *  decision — a reader that can still serve something useful may print these and continue. */
export function pointerAdvisories(res: PointerResolution): readonly string[] {
  const lines: string[] = [];
  if (res.state === "stale" && res.newestComplete !== null && res.resolved !== null) {
    lines.push(
      `‼ STALE POINTER: reports/${res.alias} still resolves to ${res.resolved.runId} (${res.resolved.ranAt}), ` +
        `but ${res.instrument} has a NEWER complete run ${res.newestComplete.runId} (${res.newestComplete.ranAt}) — this alias is not that run.`,
    );
  }
  if (res.state === "dangling") {
    lines.push(`‼ DANGLING POINTER: reports/${res.alias} names run ${res.runId ?? "<unparseable>"}, whose slot is gone (pruned) — there is nothing behind it.`);
  }
  if (res.state === "unslotted") {
    lines.push(`‼ NOT A POINTER: reports/${res.alias} is a real file, not a published alias — no run owns it, so its provenance cannot be established.`);
  }
  for (const row of res.inFlight) {
    lines.push(
      `‼ IN FLIGHT: ${res.instrument} run ${row.runId} (pid ${row.pid ?? "?"}, started ${row.ranAt}) is writing NOW — it has published nothing yet, so this read is about the PREVIOUS run.`,
    );
  }
  for (const row of res.abandoned) {
    lines.push(
      `‼ NEVER FINISHED: ${res.instrument} run ${row.runId} (started ${row.ranAt}) died — it was killed, OOM-aborted or timed out, and reports/${res.alias} is NOT its verdict.`,
    );
  }
  return lines;
}

/** The instrument a published alias belongs to, read off the link target, or null when the entry is not a
 *  pointer into a run slot. */
function instrumentOfAlias(root: string, alias: string): string | null {
  const dir = reportsPath(root, RUNS_ALIAS);
  for (const instrument of readdirSafe(dir)) {
    if (pointerRunId(root, alias, instrument) !== null) {
      return instrument;
    }
  }
  return null;
}

function readdirSafe(dir: string): readonly string[] {
  // @orb-waive caught-failure-ownership(catch): no `reports/runs/` directory means no instrument has ever run on this checkout — an empty instrument list is the truthful census, and the caller turns a resulting empty inventory into an explicit NOTHING TO MEASURE refusal rather than a clean zero. Ends if an unreadable runs directory must be refused here.
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return []; // no runs directory on this checkout — nothing has ever published here
  }
}

/** THE POINTER INVENTORY (deliverable 4, #2502): every published VERDICT alias on this checkout, resolved.
 *
 *  THE FENCE IS DEPTH ONE, and it is not arbitrary. A verdict instrument publishes a FIXED alias set known
 *  before the run — the paths the constitution names, all direct children of `reports/` — while the
 *  `--out`-keyed rendered families (`snaps/`, `design-audit/`, `traces/`, …) publish ONE POINTER PER
 *  ARTIFACT FILE under a `<kind>/` dir, and those are older than the newest run BY DESIGN (#1164: each names
 *  its own run and retention keeps them alive deliberately). Walking into them would bury the one finding
 *  this view exists for under thousands of by-design-stale rows. Every reader of this list is told the fence
 *  and the scanned count, so an empty answer is never mistaken for "nothing is stale". */
export function publishedPointers(root: string): readonly PointerResolution[] {
  const rows: PointerResolution[] = [];
  for (const entry of readdirAll(reportsPath(root))) {
    if (entry === RUNS_ALIAS || entry.startsWith(".")) {
      continue;
    }
    const instrument = instrumentOfAlias(root, entry);
    if (instrument !== null) {
      rows.push(resolvePointer(root, instrument, entry));
    }
  }
  return rows.sort((a, b) => a.alias.localeCompare(b.alias));
}

function readdirAll(dir: string): readonly string[] {
  // @orb-waive caught-failure-ownership(catch): no `reports/` directory at all — the same honest zero as `readdirSafe`, and the same caller refuses on it (`pointerView` raises NOTHING TO MEASURE, exit 3), so the empty list is never rendered as "nothing is stale". Ends if this stops being the only caller.
  try {
    return readdirSync(dir).map((name) => basename(name));
  } catch {
    return []; // no reports/ directory — the caller distinguishes "nothing ran here" from "nothing is stale"
  }
}
