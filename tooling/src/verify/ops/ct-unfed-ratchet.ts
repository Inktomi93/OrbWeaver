// THE UNFED-READ RATCHET (#637) — the #629 census turned from a diagnostic into a standing verdict.
//
// WHY IT EXISTS. `routeTrpc` answers an unlisted procedure `{result:{data:null}}` on purpose (an incidental
// read must never 404 a test that has nothing to do with it — a RECORDED ruling, tests/support/node/route-trpc.ts).
// But `null` is not a view, and a mount whose reads nobody fed runs its pipelines INERT: a suspending reader
// throws and its QueryBoundary swaps the body for `QueryErrorState` while the heading outside the boundary
// still passes; a NON-suspending reader skips its `data === undefined` branch and renders the null arm
// forever. Either way a regression inside that pipeline is invisible to the file that mounts it. The #629
// lane made the reads LOUD and swept one feature: 14 of ~60 chat CT files mounted trees with unfed reads.
// Without a ratchet the next wave accretes silently and the whole discovery has to be re-paid.
//
// IT CANNOT BE A `check:structure` GATE (owner, #637). An unfed read is a RUNTIME property — it is observed
// by mounting the tree and watching which procedures the mounted React tree actually requests. No static
// reader can know that. So the enforcement lives where the observation already happens: the CT run, via
// `ct-flaky-reporter.ts`, which already collects the census off `routeTrpc`'s stderr markers.
//
// THE ENFORCEMENT IS ON THE CENSUS, NEVER ON THE STUB. `routeTrpc` keeps its lenient null fulfil — making it
// strict would 404 incidental reads and is a ruling this must not reverse. What is judged is the census.
//
// SUBJECT IDENTITY IS `<file> :: <proc>`, NEVER A PER-FILE COUNT. A count-keyed row lets a file stop having
// an unfed `chat.getChat` and start having an unfed `foo.bar` while the number holds — the ratchet would read
// a swapped defect as green. Every row is therefore exactly ONE (file, procedure) membership, `count: 1`.
//
// FIVE ARMS, TWO OF THEM REFUSALS (GATE-AUTHORING.md §4.4a — every exemption is two-sided from birth):
//   • NEW      — an observed (file, proc) with no baseline row is RED. This is the arm that stops the 14
//                coming back.
//   • SHRINK   — a baseline row whose file RAN, with the instrument proven live in it, and which no longer
//                reports that procedure, is RED: the baseline must shrink in the commit that fed the read.
//                Debt cannot persist under a stale allowance.
//   • DEAD     — a committed row naming a CT file that is no longer on the tree is RED: no run can ever
//                retire it, so it would be a permanent allowance nothing judges.
//   • REFUSE (malformed ledger) — a row that is not `<ct file> :: <procedure>` with `count: 1` is a TOOL
//                ERROR. An unparseable ledger must never read as zero admitted findings.
//   • REFUSE (dead instrument) — an executed file whose SOURCE calls `routeTrpc(` but which produced no
//                `[routeTrpc] ACTIVE` marker. This is the tripwire for the census going silently dead (the
//                marker renamed, the stderr plumbing broken, the stub swapped) — the single most common way
//                an instrument in this repo lies. A run that collected nothing because the harness broke
//                must NOT read as "zero unfed reads".
//
// THE CORPUS IS THE WHOLE CT TREE, and the committed baseline was built from a whole-tree census (owner
// ruling 2026-08-24, taken as niced `pnpm test:ct … --workers=2` passes rather than one battery). There is
// NO scope constant here on purpose: a path fence would let a green read as a clean bill of health for files
// nobody measured, which is the false-clean shape this row exists to kill. Every CT file a run executes is
// judged; a file nobody runs is skipped, not absolved.
//
// DECLARED LIMITS:
//   • A SCOPED run (`pnpm test:ct <subset>`) can only judge the files it executed. Baseline rows for files
//     the run never touched are skipped — not shrunk, not admitted. Only a run covering a file can retire
//     its row, which is why the SHRINK arm keys off `executedFiles`.
//   • The dead-instrument tripwire recognises the call by the literal `routeTrpc(` in the test file's own
//     source. A file that reaches the stub only through a helper module it imports is not covered by that
//     arm (it is still covered by the blind-file arm once it is baselined).
//   • Subscriptions are NOT unfed reads and never appear here: `routeTrpc` scopes the EventSource path out by
//     design and always answers 204, so `noteUnstubbed` skips it (the instrument's own #629 self-correction —
//     it was reporting `stream.attach`/`stream.connect` as findings, which was it reporting its documented
//     posture as a defect).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import type { RatchetRow } from "@orb/tooling/_shared/ratchet-rows";

refuseDirectInvocation(import.meta.url, "pnpm test:ct (the CT reporter imports this judge; it has no CLI of its own)");

/** The committed ledger, at the ONE path every consumer imports rather than re-spells (a rename then breaks
 *  `tsc` instead of silently leaving the debt walk reading a path nothing writes). */
export const BASELINE_REL = "tooling/src/verify/ops/ct-unfed-reads.baseline.json";

/** The marker `routeTrpc` writes once per registration, proving the census instrument is alive in that file. */
export const ACTIVE_MARKER = "[routeTrpc] ACTIVE";

/** The literal that makes an executed CT file OWE an `ACTIVE` marker (the dead-instrument tripwire). */
const ROUTE_TRPC_CALL = "routeTrpc(";

/** ONE row's identity: the CT file that mounted the tree, and the procedure nobody stubbed. */
export function subjectOf(file: string, proc: string): string {
  return `${file} :: ${proc}`;
}

/** Split a committed subject back into its two halves, or null when the row is not in the one legal spelling. */
function parseSubject(subject: string): { readonly file: string; readonly proc: string } | null {
  const parts = subject.split(" :: ");
  if (parts.length !== 2) {
    return null;
  }
  const [file, proc] = parts;
  if (file === undefined || proc === undefined || file.trim() === "" || proc.trim() === "") {
    return null;
  }
  return { file, proc };
}

/** What ONE CT run observed. Every field is repo-relative and already scope-agnostic — the judge fences. */
export interface UnfedRunObservation {
  /** CT files this run executed at least one non-skipped test from. */
  readonly executedFiles: readonly string[];
  /** Files that emitted at least one `ACTIVE` marker — i.e. `routeTrpc` provably ran inside them. */
  readonly instrumentedFiles: ReadonlySet<string>;
  /** file → the distinct procedures its mounts requested and nobody stubbed. */
  readonly unfedByFile: ReadonlyMap<string, readonly string[]>;
}

/** The verdict. `refusals` are TOOL-ERROR class (the run is not a verdict); `violations` are RED. */
export interface UnfedRatchetVerdict {
  readonly refusals: readonly string[];
  readonly violations: readonly string[];
}

/**
 * Does this executed CT file OWE an `ACTIVE` marker? True when its own source calls `routeTrpc(`. Read from
 * disk rather than remembered: a file that stopped using the stub stops owing, in the same commit.
 * A source that cannot be read is treated as owing NOTHING — an unreadable file is a separate failure that
 * playwright already reports, and inventing a refusal from it would be noise, not signal.
 */
export function owesActiveMarker(root: string, file: string): boolean {
  // @orb-gate-ignore caught-failure-ownership(default:catch): documented above — an unreadable file is a separate failure playwright already reports; treating it as "owing nothing" avoids inventing a duplicate, noisy refusal. Ends if playwright stops being the thing that surfaces unreadable-file failures.
  try {
    return readFileSync(join(root, file), "utf8").includes(ROUTE_TRPC_CALL);
  } catch {
    return false;
  }
}

/** ONE committed row, resolved to the site it admits. */
interface LedgerSite {
  readonly file: string;
  readonly proc: string;
}

/** REFUSE (dead instrument) — a file that calls the stub and never announced it was not observed at all. */
function blindCensusRefusals(executed: ReadonlySet<string>, instrumented: ReadonlySet<string>, owesMarker: (file: string) => boolean): readonly string[] {
  const out: string[] = [];
  for (const file of executed) {
    if (owesMarker(file) && !instrumented.has(file)) {
      out.push(
        `BLIND CENSUS — ${file} ran and its source calls \`routeTrpc(\`, but no \`${ACTIVE_MARKER}\` marker reached the reporter. The unfed-read census did not observe this file, so its zero is "I could not measure", not "it is clean". Check that route-trpc.ts still emits the marker and that the CT reporter is still wired in playwright-ct.config.ts.`,
      );
    }
  }
  return out;
}

/** The committed ledger resolved to sites. A row nobody can resolve is a REFUSAL, never an admitted zero;
 *  a row naming a file that is no longer on the tree is a VIOLATION (it can never be retired by any run, so
 *  it would be a permanent allowance nothing judges — the two-sided half of the exemption). */
function resolveLedger(
  baseline: ReadonlyMap<string, RatchetRow>,
  fileExists: (file: string) => boolean,
): { readonly sites: ReadonlyMap<string, LedgerSite>; readonly refusals: readonly string[]; readonly violations: readonly string[] } {
  const sites = new Map<string, LedgerSite>();
  const refusals: string[] = [];
  const violations: string[] = [];
  for (const [subject, row] of baseline) {
    const parsed = parseSubject(subject);
    if (parsed === null) {
      refusals.push(
        `MALFORMED LEDGER ROW — ${JSON.stringify(subject)} in ${BASELINE_REL} is not the one legal subject spelling \`<ct file> :: <procedure>\`. A ledger row nobody can resolve to a site must never read as an admitted zero.`,
      );
    } else if (row.count !== 1) {
      refusals.push(
        `MALFORMED LEDGER ROW — ${JSON.stringify(subject)} in ${BASELINE_REL} carries count ${String(row.count)}; every row is exactly ONE (file, procedure) membership, so its count is always 1.`,
      );
    } else if (fileExists(parsed.file)) {
      sites.set(subject, parsed);
    } else {
      violations.push(
        `DEAD UNFED-READ ALLOWANCE — ${BASELINE_REL} admits ${JSON.stringify(subject)}, but ${parsed.file} is not on the tree (deleted, renamed or moved). No run can ever retire it, so it is a permanent allowance nothing judges: delete or re-point the row.`,
      );
    }
  }
  return { sites, refusals, violations };
}

/** NEW — an observed unfed read with no committed row. The arm that stops the 14 coming back. */
function newReadViolations(run: UnfedRunObservation, sites: ReadonlyMap<string, LedgerSite>): readonly string[] {
  const out: string[] = [];
  for (const [file, procs] of run.unfedByFile) {
    for (const proc of procs) {
      if (!sites.has(subjectOf(file, proc))) {
        out.push(
          `UNFED tRPC READ — ${file} mounts a tree that requests \`${proc}\` and never stubs it. routeTrpc answered it \`null\`, which is not a view: that pipeline runs INERT in this file, so a regression inside it is invisible here. FEED it (add \`"${proc}"\` to the routeTrpc call), or DECLARE it — an in-file comment saying why this mount deliberately does not exercise it, plus a row in ${BASELINE_REL} carrying that same reason as its \`why\`.`,
        );
      }
    }
  }
  return out;
}

/** SHRINK — a committed row whose read is gone must go with it. Only a run that EXECUTED the file, with the
 *  instrument proven live in it, may retire a row: a scoped run says nothing about files it skipped. */
function staleAllowanceViolations(run: UnfedRunObservation, sites: ReadonlyMap<string, LedgerSite>, executed: ReadonlySet<string>): readonly string[] {
  const out: string[] = [];
  for (const [subject, { file, proc }] of sites) {
    const observable = executed.has(file) && run.instrumentedFiles.has(file);
    if (observable && !(run.unfedByFile.get(file) ?? []).includes(proc)) {
      out.push(
        `STALE UNFED-READ ALLOWANCE — ${BASELINE_REL} still admits ${JSON.stringify(subject)}, but ${file} no longer leaves \`${proc}\` unfed. Delete the row: an allowance that outlives the thing it admitted is how declared debt becomes permanent.`,
      );
    }
  }
  return out;
}

/** The two filesystem questions the judge asks, injected so the arms stay pure and the unit pin can drive
 *  every one of them without planting a tree. */
export interface UnfedTreeReader {
  /** Does this executed CT file's own source call `routeTrpc(`? (the dead-instrument tripwire) */
  readonly owesMarker: (file: string) => boolean;
  /** Is this baselined CT file still on the tree? (the dead-allowance arm) */
  readonly fileExists: (file: string) => boolean;
}

/**
 * THE JUDGE — pure, so its arms are pinned by a unit test rather than by a CT run nobody can re-shape.
 * `baseline` is the parsed committed ledger keyed by subject (`readBudgetRows`).
 */
export function judgeUnfedReads(run: UnfedRunObservation, baseline: ReadonlyMap<string, RatchetRow>, tree: UnfedTreeReader): UnfedRatchetVerdict {
  const executed = new Set(run.executedFiles);
  const { sites, refusals, violations } = resolveLedger(baseline, tree.fileExists);
  return {
    refusals: [...blindCensusRefusals(executed, run.instrumentedFiles, tree.owesMarker), ...refusals],
    violations: [...newReadViolations(run, sites), ...staleAllowanceViolations(run, sites, executed), ...violations],
  };
}
