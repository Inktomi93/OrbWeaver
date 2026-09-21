// `pnpm check:show --stage <name>` / `--stages` — THE VERIFY STAGE-LOG READER (#2502).
//
// THE GAP THIS CLOSES. A verify run prints `per-stage logs → reports/verify/<stage>.log` and then NOTHING
// READS THAT ALIAS: every consumer hand-paths it. All three of 2026-09-20's misattributions were hand-paths
// of exactly this alias — not one was a rendering problem, all three were "whose run is this".
//
// ONE DOOR, NOT TWO. This is a MODE of `check:show`, not a sibling verb, because `check:structure` IS a
// stage of `pnpm check`: "what did the last run say about X" is one question at two granularities, and
// `pnpm check:show` is the shipped muscle memory for it. Two verbs would mean two provenance lines, two
// in-flight refusals and two things to keep in agreement — which is the defect, one level up. What stays
// SPLIT is the rendering: this module speaks stage vocabulary (`mode`, `childExit`, the transcript tail),
// ops/show.ts speaks gate vocabulary (`--gate`, `--file`), and neither knows the other's nouns.
//
// THE REFUSAL IS THE POINT. `reports/verify.json` is published at completion only, so while a newer run is
// IN FLIGHT the alias is a COMPLETE verdict about the PREVIOUS run — which is precisely the read that got
// misattributed three times. That read refuses (exit 2) and names the live run plus the `--run <id>` door,
// rather than silently serving an older file.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatRunProvenance, pointerAdvisories, resolvePointer, slotCensus } from "@orb/tooling/_shared/artifact-pointer";
import { instrumentRunsDir } from "@orb/tooling/_shared/artifacts";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import type { StageResult, VerifyReport } from "../contract/stage.ts";
import { VERIFY_INSTRUMENT, VERIFY_REPORT_NAME } from "../contract/stage.ts";
import type { ShowInk } from "./show-policy.ts";

/** Transcript lines shown by default. A stage log is the WHOLE child transcript (a `tests:node` log runs to
 *  thousands of lines); the verdict is at the END by construction (ops/run.ts's chronological capture), so
 *  the default view is a tail and `--limit` widens it. */
const DEFAULT_TAIL = 40;

export interface StageViewRequest {
  /** The stage to render, matched exactly or by a UNIQUE substring. */
  readonly stage: string | null;
  /** List every stage of the resolved run with its verdict, instead of rendering one. */
  readonly stages: boolean;
  /** Read THIS run's slot directly instead of the published pointer — the operator's door out of an
   *  in-flight refusal, and the executable form of "take the slot the run printed when you need YOUR run". */
  readonly run: string | null;
  readonly limit: number | null;
}

export interface StageView {
  readonly lines: readonly string[];
  readonly exit: number;
}

interface ResolvedReport {
  readonly report: VerifyReport;
  readonly provenance: string;
  readonly advisories: readonly string[];
}

function readVerifyReport(path: string): VerifyReport | null {
  // @orb-waive caught-failure-ownership(catch): an absent or unparseable artifact at this path is the NEGATIVE answer the two callers each own with a DIFFERENT operator-visible refusal — the pointer door raises "the evidence is broken, not merely absent" (exit 2) and the `--run` door raises "that slot holds no readable verify.json" (exit 3). Returning the failure here would collapse those two into one text. Ends if both callers ever want the same refusal.
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as VerifyReport;
  } catch {
    return null; // absent or unparseable — the caller owns the refusal text, which differs per door
  }
}

/** The `--run <id>` door: read a named slot directly. An id that names no slot on this checkout REFUSES with
 *  the ids that do exist — never a silent fall-back to the pointer, which would defeat the whole request. */
function resolveNamedRun(root: string, runId: string): ResolvedReport {
  const census = slotCensus(root, VERIFY_INSTRUMENT);
  const row = census.find((r) => r.runId === runId);
  if (row === undefined) {
    throw new UsageError(
      `check:show --run ${runId} — no ${VERIFY_INSTRUMENT} slot with that id on this checkout.\n  Slots here (newest first): ${census.map((r) => r.runId).join(", ") || "<none — nothing has run here>"}`,
    );
  }
  const report = readVerifyReport(join(row.dir, VERIFY_REPORT_NAME));
  if (report === null) {
    throw new UsageError(`check:show --run ${runId} — that slot holds no readable ${VERIFY_REPORT_NAME} (state: ${row.state}).`);
  }
  const relDir = row.dir.slice(root.length + 1);
  const note = row.state === "complete" ? [] : [`‼ that run is ${row.state} — its artifact is not a finished verdict`];
  return { report, provenance: `(run ${formatRunProvenance(row.runId, relDir)}, read by --run)`, advisories: note };
}

/** The refusal an ambiguous pointer earns, with the door out of it. */
function ambiguityRefusal(root: string, advisories: readonly string[], ink: ShowInk): readonly string[] {
  const slots = instrumentRunsDir(root, VERIFY_INSTRUMENT).slice(root.length + 1);
  return [
    ink.red(`✗ reports/${VERIFY_REPORT_NAME} cannot answer this read unambiguously`),
    ...advisories.map((a) => ink.red(`      ${a}`)),
    ink.dim(`      Read a specific run instead: pnpm check:show --stage <name> --run <runId>  (ids: ls ${slots})`),
  ];
}

/** Which run this view is about, or the refusal that says why there is no unambiguous answer. */
function resolveReport(root: string, req: StageViewRequest, ink: ShowInk): ResolvedReport | StageView {
  if (req.run !== null) {
    return resolveNamedRun(root, req.run);
  }
  const res = resolvePointer(root, VERIFY_INSTRUMENT, VERIFY_REPORT_NAME);
  if (res.state === "absent") {
    throw new UsageError(
      `check:show — nothing is published at reports/${VERIFY_REPORT_NAME}.\n  Run \`pnpm check\` (or \`pnpm verify --push\`) first to generate it.`,
    );
  }
  const advisories = pointerAdvisories(res);
  // AMBIGUOUS: a newer run writing now, a run that died after this one, a real file nobody's run owns, or a
  // pointer into a pruned slot. Each means the bytes behind the alias are not the answer to the question
  // being asked — and serving them quietly is the exact failure this reader exists to end.
  if (res.inFlight.length > 0 || res.abandoned.length > 0 || res.state === "unslotted" || res.state === "dangling") {
    return { lines: ambiguityRefusal(root, advisories, ink), exit: EXIT.toolError };
  }
  const report = readVerifyReport(res.path);
  if (report === null) {
    return {
      lines: [
        ink.red(
          `✗ reports/${VERIFY_REPORT_NAME} resolves to ${res.runId ?? "<unparseable>"} but holds no readable report — the evidence is broken, not merely absent.`,
        ),
      ],
      exit: EXIT.toolError,
    };
  }
  return { report, provenance: `(run ${formatRunProvenance(res.runId ?? "<unknown>", res.relDir)})`, advisories };
}

function stageHeadline(s: StageResult, ink: ShowInk): string {
  const mark = s.ok ? ink.green("✓") : ink.red("✗");
  // `childExit` is a THREE-valued field (contract/stage.ts): absent = this stage ran no child; null = the
  // child was signal-killed, timed out or never spawned; a digit = the raw exit the classifier mapped.
  const childExit = s.childExit ?? "NO EXIT (killed/timed out/never spawned)";
  const child = s.childExit === undefined ? "" : ` · child ${childExit}`;
  return `${mark} ${ink.bold(s.name)} [${s.group}] ${s.mode} · exit ${s.exitCode} · ${Math.round(s.durationMs)}ms${child}`;
}

/** The stage named, matched exactly first so a name that is a prefix of another is always reachable. */
function selectStage(report: VerifyReport, needle: string): StageResult {
  const exact = report.stages.find((s) => s.name === needle);
  if (exact !== undefined) {
    return exact;
  }
  const matches = report.stages.filter((s) => s.name.includes(needle));
  const first = matches[0];
  if (matches.length === 1 && first !== undefined) {
    return first;
  }
  const names = report.stages.map((s) => s.name).join(", ");
  const why = matches.length === 0 ? "matched no stage" : `matched ${matches.length} stages (${matches.map((s) => s.name).join(", ")})`;
  throw new UsageError(`check:show --stage ${JSON.stringify(needle)} — ${why} in this run.\n  Stages in it: ${names}`);
}

/** The transcript tail, or the refusal for a stage whose log is not readable. A stage that ran and left no
 *  log is BROKEN EVIDENCE (exit 2), never an empty view: a reader that prints nothing is indistinguishable
 *  from one that is broken. A DEFERRED/SKIPPED stage legitimately has no log and says so at exit 0. */
function transcript(root: string, s: StageResult, limit: number, ink: ShowInk): StageView {
  if (s.logFile === null) {
    const ran = s.mode === "deferred" || s.mode === "skipped";
    const text = ran
      ? ink.dim(`  (${s.mode} — this stage ran no child, so there is no transcript${s.runsAt === null ? "" : `; it runs at ${s.runsAt}`})`)
      : ink.red(`  ✗ this stage ran (mode ${s.mode}) but recorded NO log file — the transcript is missing, so its verdict cannot be read back.`);
    return { lines: [text], exit: ran ? s.exitCode : EXIT.toolError };
  }
  let raw: string;
  // @orb-waive caught-failure-ownership(catch): the failure is SURFACED, not swallowed — the catch returns an operator-visible red line naming the unreadable log and exits 2 (broken evidence), which is the whole point of this reader refusing rather than printing an empty view. Ends if the returned lines stop carrying the toolError exit.
  try {
    raw = readFileSync(join(root, s.logFile), "utf-8");
  } catch {
    return {
      lines: [ink.red(`  ✗ ${s.logFile} is not readable — the run recorded a transcript that is no longer there (a pruned slot, or a hand-deleted log).`)],
      exit: EXIT.toolError,
    };
  }
  const all = raw.split("\n");
  const tail = all.slice(Math.max(0, all.length - limit));
  const head =
    all.length > tail.length ? [ink.dim(`  …${all.length - tail.length} earlier line(s) omitted (--limit N to widen; whole log: ${s.logFile})`)] : [];
  return { lines: [...head, ...tail.map((l) => `  ${l}`)], exit: s.exitCode };
}

/** Every stage of the resolved run, one line each — the "what did this run actually do" view, and the door
 *  that names the stage spellings `--stage` accepts. */
function stageList(report: VerifyReport, ink: ShowInk): StageView {
  const lines = [
    `${report.ok ? ink.green("✓") : ink.red("✗")} ${ink.bold(`verify ${report.tier}`)} ${report.scope} · exit ${report.exitCode} · ${report.failed} failed · ${report.stages.length} stage(s)`,
    ...(report.noVerdict.length === 0 ? [] : [ink.red(`‼ NO VERDICT from: ${report.noVerdict.join(", ")} — these stages measured nothing`)]),
    "",
    ...report.stages.map((s) => stageHeadline(s, ink)),
    "",
    ink.dim("  pnpm check:show --stage <name>   the full transcript tail of one stage"),
  ];
  return { lines, exit: report.exitCode };
}

/** THE STAGE VIEW. Returns lines + the exit code the caller writes and returns — the console half stays in
 *  ops/show.ts, which owns the one write per line and the TTY palette. */
export function stageView(root: string, req: StageViewRequest, ink: ShowInk): StageView {
  const resolved = resolveReport(root, req, ink);
  if ("lines" in resolved) {
    return resolved;
  }
  const { report, provenance, advisories } = resolved;
  const preamble = [ink.dim(provenance), ...advisories.map((a) => ink.red(a))];
  if (req.stages) {
    const listed = stageList(report, ink);
    return { lines: [...preamble, ...listed.lines], exit: listed.exit };
  }
  const selected = selectStage(report, req.stage ?? "");
  const body = transcript(root, selected, req.limit ?? DEFAULT_TAIL, ink);
  return { lines: [...preamble, stageHeadline(selected, ink), ...body.lines], exit: body.exit };
}
