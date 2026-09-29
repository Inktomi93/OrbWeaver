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
import { pointerAdvisories, resolvePointer } from "@orb/tooling/_shared/artifact-pointer";
import type { RunManifestView } from "../contract/show-artifact.ts";
import type { StageResult, VerifyReport, VerifyRunResolution } from "../contract/stage.ts";
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
 *  this reader has no extractor for, so a red stage never prints nothing. `more` counts every line the cap
 *  dropped in EITHER branch, so a fallback tail (which drops from the FRONT) reports its drop honestly
 *  instead of always reading zero because the slice already ran before the count did. */
function stageFailureLines(text: string, limit: number): { readonly shown: readonly string[]; readonly more: number } {
  const lines = text.split(/\r?\n/u);
  const matched = lines.filter(isFailureLine).map((l) => l.trim());
  if (matched.length > 0) {
    return { shown: matched.slice(0, limit), more: Math.max(0, matched.length - limit) };
  }
  const nonBlank = lines.map((l) => l.trim()).filter((l) => l.length > 0);
  return { shown: nonBlank.slice(-limit), more: Math.max(0, nonBlank.length - limit) };
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
  if (shown.length === 0) {
    // A red stage with a zero-byte (or all-blank) log is a fact worth saying, not a silent empty block —
    // otherwise this reads identically to "no failure lines matched", which it is not.
    return [header, ink.dim(`  (this stage's log is empty — no output was captured — pnpm check:show --stage ${s.name})`)];
  }
  const body = shown.map((l) => `  ${l}`);
  const tail = more > 0 ? [ink.dim(`  …and ${more} more (pnpm check:show --stage ${s.name} to widen)`)] : [];
  return [header, ...body, ...tail];
}

/** `toolError` on the two advisory cases follows `show-stage.ts`'s own precedent for the same pointer states
 *  (`resolveReport`, #2502): an abandoned run and an unparseable report are both refused there at exit 2,
 *  never rendered as an inspection view, so this reader's exit code agrees with `--stage`/`--stages` about
 *  what those two states mean. */
export function resolveLatestVerifyRun(root: string): VerifyRunResolution {
  const res = resolvePointer(root, VERIFY_INSTRUMENT, VERIFY_REPORT_NAME);
  if (res.runId === null || res.inFlight.length > 0 || res.state === "unslotted" || res.state === "dangling") {
    return { kind: "silent" };
  }
  if (res.abandoned.length > 0) {
    return { kind: "advisory", lines: pointerAdvisories(res), toolError: true };
  }
  // @orb-waive caught-failure-ownership(catch): an unparseable verify.json is surfaced as an operator-visible advisory naming the run and the path, never swallowed — the one caller prints it and keeps rendering the structure view beneath it. Ends if the advisory stops reaching the console.
  try {
    return { kind: "report", report: JSON.parse(readFileSync(res.path, "utf-8")) as VerifyReport };
  } catch {
    return {
      kind: "advisory",
      lines: [`✗ reports/${VERIFY_REPORT_NAME} resolves to ${res.runId} but will not parse — the evidence is broken, not merely absent.`],
      toolError: true,
    };
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

/** Whether the `check-structure.json` verdict rendered below belongs to THIS verify run, an OLDER one, or a
 *  NEWER one — the false-clean this item exists to close: a failed verify run can leave the structure
 *  pointer resolved to a run from before it even started. A structure run inside the verify run's own
 *  `[startedAt, finishedAt]` window is named as started DURING it, never claimed to BE its `structure:full`
 *  stage — a standalone whole `pnpm check:structure` invoked by hand during that window looks identical from
 *  here, because a verify run's artifact does not record the child instrument run ids it spawned. */
export function structureProvenanceNote(verifyRun: VerifyReport["run"], structureRun: RunManifestView | undefined, ink: ShowInk): string {
  if (verifyRun === undefined) {
    return ink.dim("structure verdict: this verify run carries no run manifest — provenance cannot be compared.");
  }
  if (structureRun?.startedAt === undefined) {
    return ink.dim(`structure verdict: run unknown — cannot say whether it is from verify run ${verifyRun.runId}.`);
  }
  if (structureRun.startedAt < verifyRun.startedAt) {
    return ink.dim(
      `structure verdict is from an OLDER run (${structureRun.runId}, started ${structureRun.startedAt}) — before this verify run (${verifyRun.runId}) started.`,
    );
  }
  if (structureRun.startedAt > verifyRun.finishedAt) {
    return ink.dim(
      `structure verdict is from a NEWER run (${structureRun.runId}, started ${structureRun.startedAt}) — after this verify run (${verifyRun.runId}) finished.`,
    );
  }
  return ink.dim(
    `structure verdict is from a run (${structureRun.runId}) started DURING this verify run (${verifyRun.runId}) — not necessarily its own structure:full stage.`,
  );
}
