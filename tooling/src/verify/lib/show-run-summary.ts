// `pnpm check:show`'s FAILED-VERIFY-RUN summary (docs/work item 0267) — every failing stage of the LATEST
// verify run, with its own transcript's failure lines pulled out, printed before the structure view so one
// `check:show --errors-only` call after a red `pnpm verify` names every red stage, not only
// `check:structure`'s. Before this, `--errors-only` read only `reports/check-structure.json`: a run whose
// `tests:node`, `browser:ct` or another non-structure stage failed printed a clean structure verdict and
// nothing else — a false clean.
//
// WHY A SEPARATE PASS OVER THE LOG, NOT `StageResult.failureExcerpt`. The excerpt is a TAIL of the child's
// own output (the last few non-blank lines, `ops/run.ts`) — for a tool whose summary block trails its detail
// (vitest, CT) the tail is the exit-code line, not the finding. This scans the whole transcript for the
// lines that carry the verdict: the "✗" gate/ratchet/budget rows every one of structure, the CT ratchets,
// orphan-ratchet and the boot-chunk budget already print, vitest's concise "FAIL" rows, and a boot/webServer
// timeout, which prints neither glyph.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolvePointer } from "@orb/tooling/_shared/artifact-pointer";
import type { RunManifestView } from "../contract/show-artifact.ts";
import type { StageResult, VerifyReport } from "../contract/stage.ts";
import { VERIFY_INSTRUMENT, VERIFY_REPORT_NAME } from "../contract/stage.ts";
import type { ShowInk } from "./show-policy.ts";

const MARK_LINE = /^\s*✗/u;
const VITEST_FAIL_LINE = /^\s*FAIL\s+\S/u;
const BOOT_TIMEOUT_LINE = /timed out waiting.*webserver/iu;

function isFailureLine(line: string): boolean {
  return MARK_LINE.test(line) || VITEST_FAIL_LINE.test(line) || BOOT_TIMEOUT_LINE.test(line);
}

/** The lines worth showing out of one stage's transcript, capped at `limit`: the matched failure lines when
 *  the log carries any of the three markers above, else the last non-blank lines — the fallback for a stage
 *  this reader has no extractor for, so a red stage never prints nothing. */
function stageFailureLines(text: string, limit: number): { readonly shown: readonly string[]; readonly more: number } {
  const lines = text.split(/\r?\n/u);
  const matched = lines.filter(isFailureLine).map((l) => l.trim());
  const pool =
    matched.length > 0
      ? matched
      : lines
          .map((l) => l.trim())
          .filter((l) => l.length > 0)
          .slice(-limit);
  return { shown: pool.slice(0, limit), more: Math.max(0, pool.length - limit) };
}

function stageBlock(root: string, s: StageResult, limit: number, ink: ShowInk): readonly string[] {
  const header = `${ink.red("✗")} ${ink.bold(s.name)} (exit ${s.exitCode})`;
  if (s.logFile === null) {
    return [header, ink.dim(`  no transcript recorded for this stage — pnpm check:show --stage ${s.name}`)];
  }
  let text: string;
  // @orb-waive caught-failure-ownership(catch): an unreadable stage log is surfaced as an operator-visible dim line naming the path and the `--stage` door, never swallowed — the whole point of this reader is to say something rather than nothing for a red stage. Ends if the returned lines stop carrying that text.
  try {
    text = readFileSync(join(root, s.logFile), "utf-8");
  } catch {
    return [header, ink.dim(`  ${s.logFile} is not readable — pnpm check:show --stage ${s.name}`)];
  }
  const { shown, more } = stageFailureLines(text, limit);
  const body = shown.map((l) => `  ${l}`);
  const tail = more > 0 ? [ink.dim(`  …and ${more} more (pnpm check:show --stage ${s.name} to widen)`)] : [];
  return [header, ...body, ...tail];
}

/** The latest verify run's report, or `null` when there is nothing CLEAN to say about it: no run has
 *  published here, the pointer is ambiguous (a newer run in flight, a dead run behind it, a dangling or
 *  unslotted alias), or the report will not parse. A reader that cannot resolve the run unambiguously says
 *  nothing here and falls through to the structure-only view rather than guessing whose run it read. */
export function readLatestVerifyRun(root: string): VerifyReport | null {
  const res = resolvePointer(root, VERIFY_INSTRUMENT, VERIFY_REPORT_NAME);
  if (res.runId === null || res.inFlight.length > 0 || res.abandoned.length > 0 || res.state === "unslotted" || res.state === "dangling") {
    return null;
  }
  // @orb-waive caught-failure-ownership(catch): an unparseable verify.json is the same "nothing clean to say" answer as an ambiguous pointer — the one caller falls through to the structure-only view rather than guessing whose run it read. Ends if a caller starts treating null as "the run passed".
  try {
    return JSON.parse(readFileSync(res.path, "utf-8")) as VerifyReport;
  } catch {
    return null;
  }
}

/** The failing-stage summary for a verify run that did NOT pass — every failed stage, its own extracted
 *  failure lines, capped per stage. `null` on a clean run: the caller's existing structure view already
 *  says "passed" and a run that agrees needs no preface. */
export function verifyFailureSummary(root: string, report: VerifyReport, limit: number, ink: ShowInk): readonly string[] | null {
  if (report.ok) {
    return null;
  }
  const failing = report.stages.filter((s) => !s.ok);
  const lines: string[] = [
    ink.red(`✗ verify ${report.tier} FAILED — ${failing.length}/${report.stages.length} stage(s) failed`),
    ...(report.noVerdict.length === 0 ? [] : [ink.red(`‼ NO VERDICT from: ${report.noVerdict.join(", ")} — these stages measured nothing`)]),
    "",
  ];
  for (const s of failing) {
    lines.push(...stageBlock(root, s, limit, ink), "");
  }
  return lines;
}

/** Whether the `check-structure.json` verdict rendered below belongs to THIS verify run or an older one —
 *  the false-clean this item exists to close: a failed verify run can leave the structure pointer resolved
 *  to a run from before it even started. Compared by instant, since a verify run does not record the child
 *  instrument run ids it spawned. */
export function structureProvenanceNote(verifyRun: VerifyReport["run"], structureRun: RunManifestView | undefined, ink: ShowInk): string {
  if (verifyRun === undefined) {
    return ink.dim("structure verdict: this verify run carries no run manifest — provenance cannot be compared.");
  }
  if (structureRun?.startedAt === undefined) {
    return ink.dim(`structure verdict: run unknown — cannot say whether it is from verify run ${verifyRun.runId}.`);
  }
  const withinRun = structureRun.startedAt >= verifyRun.startedAt && structureRun.startedAt <= verifyRun.finishedAt;
  return withinRun
    ? ink.dim(`structure verdict is from THIS verify run (${verifyRun.runId}).`)
    : ink.dim(`structure verdict is from an OLDER run (${structureRun.runId}, started ${structureRun.startedAt}) — NOT this verify run (${verifyRun.runId}).`);
}
