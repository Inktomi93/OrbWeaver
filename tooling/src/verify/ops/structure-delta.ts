// THE PER-POLICY DELTA (#2110) — `pnpm check:structure-delta`.
//
// THE DEFECT IT CLOSES. `pnpm check:structure` exits 1 BY CONSTRUCTION while the loader is mixed (#1584), so a
// NEW red on a final policy is invisible: the verdict is already red, the tail numbers are aggregates, and
// nobody diffs per policy. Proven 2026-09-12 — `conversion-refusal-liveness`, a HARD gate landed in
// `03dd7329e`, had been RED on main against its one live subject since it landed and no run surfaced it
// (#2106). The posture is "baseline the red, never launder it", but baselining was a HAND read of two
// artifacts, which is why nobody did it.
//
// WHAT IT COMPARES. Two published slots, per FINAL policy: raw / waived / granted / effective, plus withheld
// and owner status, plus the run-level tool errors. Only final rows carry that vocabulary, so only final rows
// are diffed — a legacy descriptor has no waived/granted axis and pretending otherwise would invent numbers.
//
// WHAT IT REFUSES, and why each refusal is the point. This instrument exists because a calm zero from a
// broken read is worse than no instrument, so every way the comparison could be meaningless is exit 2:
//   • either artifact unreadable or absent — including "there is no prior slot", which is NOT "no change";
//   • either run DIED (`complete: false`) — the #410 in-flight stub;
//   • either run is a NON-VERDICT (#2167) — fixture-mode, contaminated, or operator-tombstoned;
//   • either run was GATE-SCOPED (`selection.kind !== "all"`) — a one-policy run against a whole-corpus run
//     shares no denominator, and differencing them manufactures ~300 phantom removals that read as a finding.
//   • the two runs are from DIFFERENT CHECKOUTS — different trees, so the delta is not about a change;
//   • the two ends are TRANSPOSED (#2223) — an explicit `--before` that started AFTER its `--after` reverses
//     every comparison, so a regression reads as a repair and the tool exits 0 on it.
//
// THE THREE SILENT ZEROES #2223 CLOSED, all found by auditing this module against its own promise:
//   (a) a NEW AUTHORITY ALARM on an ALREADY-RED policy. `ok` is already false, so the `before.ok && !after.ok`
//       clause cannot fire, and an alarm changes no finding count — the exact blind spot the mixed runtime
//       makes permanent, because most final policies are red by construction while the loader is legacy.
//   (b) a VANISHED policy. `no longer present:` was PRINTED and then dropped on the floor: a final policy that
//       stops loading (a module that exports no gate, a conversion that broke registration) removed its own
//       red row and the run exited 0 — the loader's silent `continue` wearing a delta's clothes.
//   (c) a TRANSPOSED explicit pair. `resolveBefore` enforces `startedAt` ordering only on the DEFAULT path;
//       two explicit slot ids were accepted in any order. Measured on the real pair
//       `main-586333-2026-09-12T18-47-45-941Z` → `main-1662184-2026-09-12T23-01-14-421Z`: run forward it is a
//       delta, run backward it exited 0.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { reportsPath, reportsRelPath } from "@orb/tooling/_shared/artifacts";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import type { RunManifest } from "../contract/run-manifest.ts";
import type { FinalPolicyRow, StructureReport } from "../contract/structure-report.ts";
import { STRUCTURE_REPORT_NAME } from "../contract/structure-report.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:structure-delta");

/** WHAT A READER ACTUALLY FINDS ON DISK, which is not `StructureReport`. That type describes what TODAY'S
 *  writer emits, with `run` required; this instrument opens artifacts written by every writer this repo has
 *  had, and a pre-#410 one carries no manifest at all (`ops/show.ts` models the same reality the same way).
 *  Typing the reader against the writer's shape would make the "no manifest" refusal below unreachable — and
 *  silently reachable at runtime, which is how an instrument comes to read `undefined.complete`. */
/** The manifest fields that ARRIVED LATER and are therefore absent from artifacts still on disk: `final`
 *  with the mixed runtime (#1584), `selection`/`quiet` with the gate-scoped door (#1964), and
 *  `verdict`/`nonVerdictReason` with this row (#2167). Declaring them optional HERE is what makes each
 *  `!== undefined` guard below a real test instead of dead code the linter is right to flag. */
type LateManifestFields = "final" | "selection" | "quiet" | "verdict" | "nonVerdictReason";
type SlotRun = Omit<RunManifest, LateManifestFields> & Partial<Pick<RunManifest, LateManifestFields>>;
/** `toolErrors` LEFT the writer contract at #2176 Phase F (the legacy dispatcher that raised them is gone),
 *  which does not remove it from the slots already on disk. Declaring it OPTIONAL here is the same move the
 *  late fields above make in the other direction: this reader opens every writer this repo has had, and a
 *  reader that dropped the field would silently stop counting a historical run's thrown gates. */
/** A row shape slots written BEFORE #2176 Phase F still carry: the legacy contract's per-gate record. The
 *  writer emits only `FinalPolicyRow` now, so typing this reader against the writer's shape would make the
 *  `contract === "final"` test below always-true — and then a historical legacy row would be silently read
 *  as a policy row it is not. Same reasoning as the late/retired manifest fields around it. */
interface HistoricalGateRow {
  readonly contract?: "legacy";
  readonly name: string;
  readonly ok: boolean;
  readonly violations: readonly unknown[];
}
type SlotReport = Omit<StructureReport, "run" | "gates"> & {
  readonly run?: SlotRun;
  readonly gates: readonly (FinalPolicyRow | HistoricalGateRow)[];
  readonly toolErrors?: readonly { readonly gate: string; readonly phase: string; readonly message: string }[];
};

/** The slot directory's segments BENEATH the artifact root — never including `"reports"` itself. The root is
 *  spelled ONCE, in `_shared/artifacts.ts#reportsPath` (#1164): a second `"reports"` literal fed to a path call
 *  is a second answer to "where do runs live", and the #1029 run-slot layout would never see it move. */
const SLOT_SEGMENTS = ["runs", "structure"] as const;

/** One slot's artifact plus the id it came from, so every refusal can name WHICH run it is refusing. */
interface Slot {
  readonly id: string;
  readonly report: SlotReport;
}

function slotDir(root: string): string {
  return reportsPath(root, ...SLOT_SEGMENTS);
}

function readSlot(root: string, id: string): Slot {
  const file = join(slotDir(root), id, STRUCTURE_REPORT_NAME);
  let report: SlotReport;
  try {
    report = JSON.parse(readFileSync(file, "utf8")) as SlotReport;
  } catch (error) {
    throw new DeltaRefusal(`slot ${id}: no readable artifact at ${file} — ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  return { id, report };
}

/** A refusal that is a TOOL ERROR, not a verdict — thrown so every unreadable path lands on exit 2 through
 *  one door rather than each caller remembering to return the right code. */
class DeltaRefusal extends Error {}

/** Every slot id on disk. `.pruned.jsonl` and any non-slot entry are skipped by the artifact existence test
 *  rather than by a name pattern — a slot IS a directory holding the report. Directory names also carry a PID,
 *  so their lexical order is not run chronology; `resolveBefore` orders readable candidates by `startedAt`. */
function slotIds(root: string): readonly string[] {
  const dir = slotDir(root);
  if (!existsSync(dir)) {
    throw new DeltaRefusal(`no ${reportsRelPath(...SLOT_SEGMENTS)} directory — nothing has published a structure slot in this checkout`);
  }
  return readdirSync(dir).filter((id) => existsSync(join(dir, id, STRUCTURE_REPORT_NAME)));
}

/** Is this slot usable as one END of a comparison? The list is the header's refusal set, and it is applied to
 *  BOTH ends: a prior slot that is a fixture run is no more comparable than a current one. */
function unusable(slot: Slot): string | null {
  const run = slot.report.run;
  if (run === undefined) {
    return "the artifact predates the run manifest (#410) — it cannot say whether it is a verdict";
  }
  if (!run.complete) {
    return "that run DIED — this is the in-flight stub (#410), not a verdict at any exit code";
  }
  if (run.verdict === "non-verdict") {
    return `that run is a NON-VERDICT (#2167) — ${run.nonVerdictReason ?? "no reason recorded"}`;
  }
  if (run.selection !== undefined && run.selection.kind !== "all") {
    return `that run was GATE-SCOPED (--${run.selection.kind} ${run.selection.names.join(", ")}) — it shares no denominator with a whole-corpus run`;
  }
  return null;
}

/** The AFTER end: the published pointer's run by default. Read through the slot list rather than the pointer
 *  symlink so both ends resolve the same way and the id is always known. */
function resolveAfter(root: string, requested: string | undefined): Slot {
  if (requested !== undefined) {
    return readSlot(root, requested);
  }
  const pointer = reportsPath(root, STRUCTURE_REPORT_NAME);
  if (!existsSync(pointer)) {
    throw new DeltaRefusal(`no published reports/${STRUCTURE_REPORT_NAME} — run \`pnpm check:structure\` first, or name a slot with --after`);
  }
  const report = JSON.parse(readFileSync(pointer, "utf8")) as SlotReport;
  return { id: report.run?.runId ?? "(unidentified)", report };
}

/** The BEFORE end: the newest USABLE slot from the same checkout strictly older than `after`. "Older" is by
 *  the run's own `startedAt`, never by file mtime — a slot's files are rewritten by `--void`. */
function resolveBefore(root: string, requested: string | undefined, after: Slot): Slot {
  if (requested !== undefined) {
    return readSlot(root, requested);
  }
  const afterStart = after.report.run?.startedAt ?? "";
  const checkout = after.report.run?.checkout;
  const candidates: Slot[] = [];
  for (const id of slotIds(root)) {
    if (id === after.id) {
      continue;
    }
    const slot = readSlot(root, id);
    const run = slot.report.run;
    if (run === undefined || run.startedAt >= afterStart || run.checkout !== checkout || unusable(slot) !== null) {
      continue;
    }
    candidates.push(slot);
  }
  const nearest = candidates.toSorted((left, right) => {
    const byStart = right.report.run?.startedAt.localeCompare(left.report.run?.startedAt ?? "") ?? 0;
    return byStart === 0 ? right.id.localeCompare(left.id) : byStart;
  })[0];
  if (nearest !== undefined) {
    return nearest;
  }
  throw new DeltaRefusal(
    `no usable PRIOR slot for checkout "${checkout ?? "?"}" older than ${after.id} — "there is nothing to compare against" is not "nothing changed". Name one with --before.`,
  );
}

function finalRows(report: SlotReport): ReadonlyMap<string, FinalPolicyRow> {
  const rows = new Map<string, FinalPolicyRow>();
  for (const row of report.gates) {
    if (row.contract === "final") {
      rows.set(row.name, row);
    }
  }
  return rows;
}

interface Counts {
  readonly effective: number;
  readonly waived: number;
  readonly granted: number;
  readonly raw: number;
  readonly withheld: boolean;
  readonly ok: boolean;
  readonly owner: string;
  /** Authority alarms NAMING THIS POLICY (#2223 gap (a)). They live run-level, not on the row, and they move
   *  NEITHER the finding count NOR `ok` once `ok` is already false — so without this field a policy that is
   *  red today and grows a stale/over-broad grant tomorrow is a zero. */
  readonly alarms: number;
}

/** Alarms per policy id for one slot. Built once per end rather than scanned per row: the list is run-level
 *  and a per-row filter would be quadratic over ~160 policies. */
function alarmsByPolicy(report: SlotReport): ReadonlyMap<string, number> {
  const tally = new Map<string, number>();
  for (const alarm of report.policy?.authority.alarms ?? []) {
    tally.set(alarm.policyId, (tally.get(alarm.policyId) ?? 0) + 1);
  }
  return tally;
}

function counts(row: FinalPolicyRow, alarms: ReadonlyMap<string, number>): Counts {
  const effective = row.violations.length;
  return {
    effective,
    waived: row.waived,
    granted: row.granted,
    raw: effective + row.waived + row.granted,
    withheld: row.withheld,
    ok: row.ok,
    owner: row.owner.status,
    alarms: alarms.get(row.name) ?? 0,
  };
}

function line(name: string, before: Counts | null, after: Counts): string {
  const was = before === null ? "NEW" : `raw ${before.raw} (w ${before.waived} · g ${before.granted} · eff ${before.effective})`;
  const now = `raw ${after.raw} (w ${after.waived} · g ${after.granted} · eff ${after.effective})`;
  const state =
    `ok ${before === null ? "—" : String(before.ok)} → ${String(after.ok)} · withheld ${before === null ? "—" : String(before.withheld)} → ${String(after.withheld)}` +
    ` · owner ${before === null ? "—" : before.owner} → ${after.owner} · alarms ${before === null ? "—" : String(before.alarms)} → ${String(after.alarms)}`;
  return `  ${name}: ${was} → ${now} · ${state}`;
}

/** REGRESSION, precisely: a final policy's EFFECTIVE count rose, its ALARM count rose, it became withheld, or
 *  it went from ok to red. A policy that is NEW and already red regresses too: it went from nothing to a red row.
 *
 *  THE ALARM ARM IS NOT REDUNDANT WITH `ok` (#2223 gap (a)): `before.ok && !after.ok` fires only on the
 *  TRANSITION, and under the mixed runtime most final policies are ALREADY red, so every alarm a lane adds to
 *  one of those lands in a policy whose `ok` cannot change and whose finding count the alarm does not touch. */
function regressed(before: Counts | null, after: Counts): boolean {
  if (before === null) {
    return !after.ok;
  }
  return after.effective > before.effective || after.alarms > before.alarms || (!before.withheld && after.withheld) || (before.ok && !after.ok);
}

function toolErrorCount(report: SlotReport): number {
  const policy = report.policy;
  const historical = report.toolErrors?.length ?? 0;
  if (policy === null) {
    return historical;
  }
  return historical + policy.toolErrors.length + policy.factErrors.length + policy.authority.toolErrors.length;
}

const DELTA_OPTIONS = { before: { type: "string" }, after: { type: "string" } } as const;

/** This verb's usage — ONE home, read by the tail refusal and by cli.ts's pre-dispatch `--help` (#809). */
export const STRUCTURE_DELTA_USAGE =
  "usage: node tooling/src/verify/cli.ts structure-delta [--before <slot>] [--after <slot>]\n" +
  "  Diffs two published structure slots PER FINAL POLICY: raw / waived / granted / effective, withheld, owner.\n" +
  "  Defaults: --after is the published reports/check-structure.json; --before is the newest usable slot from\n" +
  "  the same checkout that started earlier. Slot ids are the directory names under reports/runs/structure/.\n" +
  "  Exit 1 when any final policy's effective count ROSE, its authority ALARMS rose, it became withheld, went\n" +
  "  ok → red, or VANISHED, or when the run-level tool-error count rose. Exit 2 when either end is unreadable, died, is a NON-VERDICT (#2167), was\n" +
  "  gate-scoped, TRANSPOSED (--before started at or after --after), or when there is no prior slot at all.";

export function runStructureDelta(root: string, argv: readonly string[]): number {
  let values: { readonly before?: string; readonly after?: string };
  try {
    values = parseArgs({ args: [...argv], options: DELTA_OPTIONS, strict: true, allowPositionals: false }).values;
  } catch (error) {
    throw new UsageError(`structure-delta: ${error instanceof Error ? error.message : String(error)}\n${STRUCTURE_DELTA_USAGE}`, { cause: error });
  }
  try {
    return compare(root, values);
  } catch (error) {
    if (error instanceof DeltaRefusal) {
      // exit 2, never a serene zero: an instrument that reads something unreadable and returns "no change" is
      // the exact failure this row exists to remove.
      process.stderr.write(`structure-delta: NOT A COMPARISON — ${error.message}\n`);
      return EXIT.toolError;
    }
    throw error;
  }
}

/** THE TRANSPOSITION REFUSAL (#2223 gap (c)). `resolveBefore` enforces `startedAt` ordering only while it is
 *  CHOOSING a slot; two explicit ids bypassed it entirely, and a reversed pair inverts every comparison — a
 *  rising effective count reads as a repair and the run exits 0. Ordering is asserted on the RUN's own
 *  `startedAt`, the same clock `resolveBefore` picks by, never on the slot id or file mtime. */
function refuseTransposed(before: Slot, after: Slot): void {
  const beforeStart = before.report.run?.startedAt;
  const afterStart = after.report.run?.startedAt;
  if (beforeStart === undefined || afterStart === undefined || beforeStart < afterStart) {
    return;
  }
  const same = beforeStart === afterStart;
  throw new DeltaRefusal(
    `the two ends are ${same ? "THE SAME RUN" : "TRANSPOSED"} — --before ${before.id} started ${beforeStart}, which is ` +
      `${same ? "the same instant as" : "AFTER"} --after ${after.id} (${afterStart}). ` +
      "A reversed pair inverts every comparison, so a regression reads as a repair and this exits 0. Swap the two ids.",
  );
}

function compare(root: string, values: { readonly before?: string; readonly after?: string }): number {
  const after = resolveAfter(root, values.after);
  const afterWhy = unusable(after);
  if (afterWhy !== null) {
    throw new DeltaRefusal(`the AFTER slot ${after.id} is not comparable — ${afterWhy}`);
  }
  const before = resolveBefore(root, values.before, after);
  const beforeWhy = unusable(before);
  if (beforeWhy !== null) {
    throw new DeltaRefusal(`the BEFORE slot ${before.id} is not comparable — ${beforeWhy}`);
  }
  if (before.report.run?.checkout !== after.report.run?.checkout) {
    throw new DeltaRefusal(
      `the two slots are from DIFFERENT CHECKOUTS (${before.report.run?.checkout} vs ${after.report.run?.checkout}) — that is not a delta about a change`,
    );
  }
  refuseTransposed(before, after);
  return render(before, after);
}

function reportRegressions(regressions: readonly string[], beforeToolErrors: number, afterToolErrors: number): boolean {
  const toolErrorsRegressed = afterToolErrors > beforeToolErrors;
  if (regressions.length > 0) {
    process.stdout.write(`\n✗ ${regressions.length} final polic(ies) REGRESSED: ${regressions.join(", ")}\n`);
  }
  if (toolErrorsRegressed) {
    process.stdout.write(`\n✗ run-level tool errors REGRESSED: ${beforeToolErrors} → ${afterToolErrors}\n`);
  }
  if (regressions.length === 0 && !toolErrorsRegressed) {
    return false;
  }
  process.stdout.write(
    "  A policy whose effective count rose, whose AUTHORITY ALARMS rose, that became WITHHELD, went ok → red, or VANISHED,\n" +
      "  or a run whose tool-error count rose,\n" +
      "  is a NEW red the mixed-runtime exit code cannot show you (#2110, #2223).\n",
  );
  return true;
}

function render(before: Slot, after: Slot): number {
  const was = finalRows(before.report);
  const now = finalRows(after.report);
  const wasAlarms = alarmsByPolicy(before.report);
  const nowAlarms = alarmsByPolicy(after.report);
  const beforeToolErrors = toolErrorCount(before.report);
  const afterToolErrors = toolErrorCount(after.report);
  const changed: string[] = [];
  const regressions: string[] = [];
  for (const [name, row] of [...now].toSorted(([a], [b]) => a.localeCompare(b))) {
    const prior = was.get(name);
    const priorCounts = prior === undefined ? null : counts(prior, wasAlarms);
    const nowCounts = counts(row, nowAlarms);
    if (priorCounts !== null && JSON.stringify(priorCounts) === JSON.stringify(nowCounts)) {
      continue;
    }
    changed.push(line(name, priorCounts, nowCounts));
    if (regressed(priorCounts, nowCounts)) {
      regressions.push(name);
    }
  }
  // A policy that was in the BEFORE roster and is not in the AFTER one has VANISHED (#2223 gap (b)) — the
  // loader's silent `continue` (a module that stopped exporting a gate, a conversion that broke registration)
  // wearing a delta's clothes. It was printed and then dropped: a red policy that disappears removed its own
  // red row, which is the largest possible regression, and this exited 0 on it.
  const removed = [...was.keys()].filter((name) => !now.has(name)).toSorted();
  regressions.push(...removed);
  process.stdout.write(`structure-delta: ${before.id} → ${after.id}\n`);
  process.stdout.write(`  final policies: ${was.size} → ${now.size} · tool errors: ${beforeToolErrors} → ${afterToolErrors}\n`);
  // "?" is the honest value for a PRE-MIXED artifact that has no final ledger at all — never a 0, which would
  // read as "nothing was withheld" about a run that could not answer the question.
  process.stdout.write(`  withheld: ${before.report.run?.final?.withheld ?? "?"} → ${after.report.run?.final?.withheld ?? "?"}\n`);
  if (removed.length > 0) {
    process.stdout.write(`  VANISHED — no longer in the final roster: ${removed.join(", ")}\n`);
  }
  if (changed.length === 0 && regressions.length === 0 && afterToolErrors <= beforeToolErrors) {
    process.stdout.write("  no per-policy change\n");
    return EXIT.clean;
  }
  if (changed.length > 0) {
    process.stdout.write(`${changed.join("\n")}\n`);
  }
  return reportRegressions(regressions, beforeToolErrors, afterToolErrors) ? EXIT.violations : EXIT.clean;
}
