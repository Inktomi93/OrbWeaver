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
//   • the two runs are from DIFFERENT CHECKOUTS — different trees, so the delta is not about a change.
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

refuseDirectInvocation(import.meta.url, "pnpm check:structure-delta");

/** WHAT A READER ACTUALLY FINDS ON DISK, which is not `StructureReport`. That type describes what TODAY'S
 *  writer emits, with `run` required; this instrument opens artifacts written by every writer this repo has
 *  had, and a pre-#410 one carries no manifest at all (`ops/show.ts` models the same reality the same way).
 *  Typing the reader against the writer's shape would make the "no manifest" refusal below unreachable — and
 *  silently reachable at runtime, which is how an instrument comes to read `undefined.complete`. */
/** The manifest fields that ARRIVED LATER and are therefore absent from artifacts still on disk: `legacy`/
 *  `final` with the mixed runtime (#1584), `selection`/`quiet` with the gate-scoped door (#1964), and
 *  `verdict`/`nonVerdictReason` with this row (#2167). Declaring them optional HERE is what makes each
 *  `!== undefined` guard below a real test instead of dead code the linter is right to flag. */
type LateManifestFields = "legacy" | "final" | "selection" | "quiet" | "verdict" | "nonVerdictReason";
type SlotRun = Omit<RunManifest, LateManifestFields> & Partial<Pick<RunManifest, LateManifestFields>>;
type SlotReport = Omit<StructureReport, "run"> & { readonly run?: SlotRun };

/** The slot directory's segments BENEATH the artifact root — never including `"reports"` itself. The root is
 *  spelled ONCE, in `_shared/artifacts.ts#reportsPath` (#1164): a second `"reports"` literal fed to a path call
 *  is a second answer to "where do runs live", and the #1029 run-slot layout would never see it move. */
const SLOT_SEGMENTS = ["runs", "structure"] as const;
const REPORT_NAME = "check-structure.json";

/** One slot's artifact plus the id it came from, so every refusal can name WHICH run it is refusing. */
interface Slot {
  readonly id: string;
  readonly report: SlotReport;
}

function slotDir(root: string): string {
  return reportsPath(root, ...SLOT_SEGMENTS);
}

function readSlot(root: string, id: string): Slot {
  const file = join(slotDir(root), id, REPORT_NAME);
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

/** Every slot id on disk, newest first by directory name (the id embeds an ISO timestamp, so lexical order IS
 *  chronological order for one checkout). `.pruned.jsonl` and any non-slot entry are skipped by the artifact
 *  existence test rather than by a name pattern — a slot IS a directory holding the report. */
function slotIds(root: string): readonly string[] {
  const dir = slotDir(root);
  if (!existsSync(dir)) {
    throw new DeltaRefusal(`no ${reportsRelPath(...SLOT_SEGMENTS)} directory — nothing has published a structure slot in this checkout`);
  }
  return readdirSync(dir)
    .filter((id) => existsSync(join(dir, id, REPORT_NAME)))
    .toSorted()
    .toReversed();
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
  const pointer = reportsPath(root, REPORT_NAME);
  if (!existsSync(pointer)) {
    throw new DeltaRefusal(`no published reports/${REPORT_NAME} — run \`pnpm check:structure\` first, or name a slot with --after`);
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
  for (const id of slotIds(root)) {
    if (id === after.id) {
      continue;
    }
    const slot = readSlot(root, id);
    const run = slot.report.run;
    if (run === undefined || run.startedAt >= afterStart || run.checkout !== checkout || unusable(slot) !== null) {
      continue;
    }
    return slot;
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
}

function counts(row: FinalPolicyRow): Counts {
  const effective = row.violations.length;
  return {
    effective,
    waived: row.waived,
    granted: row.granted,
    raw: effective + row.waived + row.granted,
    withheld: row.withheld,
    ok: row.ok,
    owner: row.owner.status,
  };
}

function line(name: string, before: Counts | null, after: Counts): string {
  const was = before === null ? "NEW" : `raw ${before.raw} (w ${before.waived} · g ${before.granted} · eff ${before.effective})`;
  const now = `raw ${after.raw} (w ${after.waived} · g ${after.granted} · eff ${after.effective})`;
  const state = `ok ${before === null ? "—" : String(before.ok)} → ${String(after.ok)} · withheld ${before === null ? "—" : String(before.withheld)} → ${String(after.withheld)} · owner ${before === null ? "—" : before.owner} → ${after.owner}`;
  return `  ${name}: ${was} → ${now} · ${state}`;
}

/** REGRESSION, precisely: a final policy's EFFECTIVE count rose, or it went from ok to red (which catches a
 *  withheld owner and an authority alarm — both flip `ok` without moving the finding count). A policy that is
 *  NEW and already red regresses too: it went from nothing to a red row. */
function regressed(before: Counts | null, after: Counts): boolean {
  if (before === null) {
    return !after.ok;
  }
  return after.effective > before.effective || (before.ok && !after.ok);
}

function toolErrorCount(report: SlotReport): number {
  const policy = report.policy;
  if (policy === null) {
    return report.toolErrors.length;
  }
  return report.toolErrors.length + policy.toolErrors.length + policy.factErrors.length + policy.authority.toolErrors.length;
}

const DELTA_OPTIONS = { before: { type: "string" }, after: { type: "string" } } as const;

/** This verb's usage — ONE home, read by the tail refusal and by cli.ts's pre-dispatch `--help` (#809). */
export const STRUCTURE_DELTA_USAGE =
  "usage: node tooling/src/verify/cli.ts structure-delta [--before <slot>] [--after <slot>]\n" +
  "  Diffs two published structure slots PER FINAL POLICY: raw / waived / granted / effective, withheld, owner.\n" +
  "  Defaults: --after is the published reports/check-structure.json; --before is the newest usable slot from\n" +
  "  the same checkout that started earlier. Slot ids are the directory names under reports/runs/structure/.\n" +
  "  Exit 1 when any final policy's effective count ROSE or a policy went ok → red. Exit 2 when either end is\n" +
  "  unreadable, died, is a NON-VERDICT (#2167), was gate-scoped, or when there is no prior slot at all.";

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
  return render(before, after);
}

function render(before: Slot, after: Slot): number {
  const was = finalRows(before.report);
  const now = finalRows(after.report);
  const changed: string[] = [];
  const regressions: string[] = [];
  for (const [name, row] of [...now].toSorted(([a], [b]) => a.localeCompare(b))) {
    const prior = was.get(name);
    const priorCounts = prior === undefined ? null : counts(prior);
    const nowCounts = counts(row);
    if (priorCounts !== null && JSON.stringify(priorCounts) === JSON.stringify(nowCounts)) {
      continue;
    }
    changed.push(line(name, priorCounts, nowCounts));
    if (regressed(priorCounts, nowCounts)) {
      regressions.push(name);
    }
  }
  const removed = [...was.keys()].filter((name) => !now.has(name)).toSorted();
  process.stdout.write(`structure-delta: ${before.id} → ${after.id}\n`);
  process.stdout.write(`  final policies: ${was.size} → ${now.size} · tool errors: ${toolErrorCount(before.report)} → ${toolErrorCount(after.report)}\n`);
  // "?" is the honest value for a PRE-MIXED artifact that has no final ledger at all — never a 0, which would
  // read as "nothing was withheld" about a run that could not answer the question.
  process.stdout.write(`  withheld: ${before.report.run?.final?.withheld ?? "?"} → ${after.report.run?.final?.withheld ?? "?"}\n`);
  if (removed.length > 0) {
    process.stdout.write(`  no longer present: ${removed.join(", ")}\n`);
  }
  if (changed.length === 0) {
    process.stdout.write("  no per-policy change\n");
    return EXIT.clean;
  }
  process.stdout.write(`${changed.join("\n")}\n`);
  if (regressions.length === 0) {
    return EXIT.clean;
  }
  process.stdout.write(`\n✗ ${regressions.length} final polic(ies) REGRESSED: ${regressions.join(", ")}\n`);
  process.stdout.write("  A policy whose effective count rose, or that went ok → red, is a NEW red the mixed-runtime exit code cannot show you (#2110).\n");
  return EXIT.violations;
}
