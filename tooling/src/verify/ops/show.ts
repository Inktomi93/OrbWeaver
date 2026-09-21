/**
 * `pnpm check:show` → `cli.ts show` [--errors-only|--gate <name>|--file <path>|--limit <N>]
 *
 * Human-readable, read-don't-rerun view of `reports/check-structure.json` — avoids re-paying the
 * whole-repo ts-morph load just to see what failed.
 *
 * THIS FILE IS THE CONSOLE HALF: argv, filtering, and the one write per line. The ARTIFACT half — the
 * view shapes, the read, and the three "this is not a verdict" refusals — is lib/show-artifact.ts, and
 * the FINAL-side renderers are lib/show-policy.ts (both split out under the tooling line cap, #2247).
 *
 * ONE DOOR, THREE ARTIFACTS (#2502). This verb also reads the verify run's per-stage transcripts
 * (`--stage`/`--stages`/`--run`, lib/show-stage.ts) and the pointer inventory (`--pointers`,
 * lib/show-pointers.ts). What the three SHARE is the resolution — which run am I reading, is it the newest
 * complete one, is a newer one in flight — which is centralized in `_shared/artifact-pointer.ts` because
 * every misattribution this closes was a RESOLUTION failure. What stays SPLIT is the rendering: this file's
 * first provenance line is the precedent the other two print through, and nothing else is shared.
 *
 * Flags:
 *   --errors-only     terse view — failing gate names + violation counts only, no per-site detail.
 *   --gate <substr>   filter to gates whose name contains <substr> (shows it even if it passes).
 *   --file <substr>   filter violations whose file path contains <substr> (case-insensitive).
 *   --limit <N>       sample violations per gate before an "…and N more" hint (default 10; 40 log lines
 *                     for --stage, which has its own default because it samples a different thing).
 *   --stage <name>    one verify stage's transcript tail · --stages lists them · --run <id> reads a slot.
 *   --pointers        the pointer-liveness inventory.
 *   --help, -h        usage.
 *
 * Exit code: mirrors the report's overall `ok` (0 clean / 1 dirty) — unless a filter is active,
 * in which case ordinary violations are an inspection view (0). Broken evidence is always toolError (2),
 * and invalid argv is always misuse (3), filters or not.
 */
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { formatSplit } from "@orb/tooling/_shared/ratchet-rows";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import type { GateReport, GateScanView, StructureReport, Violation } from "../contract/show-artifact.ts";
import type { StructurePolicyReport } from "../contract/structure-report.ts";
import { nearCapAdvisories } from "../lib/near-cap.ts";
import {
  brokenEvidenceCount,
  describeRun,
  isFinalRow,
  missingReportRefusal,
  populationAlarmText,
  readReport,
  refuseAbandoned,
  refuseIncomplete,
  resolveStructurePointer,
} from "../lib/show-artifact.ts";
import { pointerView } from "../lib/show-pointers.ts";
import { failedHeaderLine, finalBlockLines, finalBrokenEvidenceCount, finalRowHeader, passLine, violationLine } from "../lib/show-policy.ts";
import { stageView } from "../lib/show-stage.ts";
import { structureCountLine } from "../lib/structure-report.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:show");

const DEFAULT_LIMIT = 10;
const POSITIVE_INTEGER = /^\d+$/;

const tty = process.stdout.isTTY === true;
const identity = (s: string): string => s;
/** The palette every renderer here and in both lib halves is handed (`ShowInk`, lib/show-policy.ts). TTY
 *  detection lives HERE and only here — lib/show-artifact.ts and lib/show-policy.ts own no terminal
 *  knowledge, which is what lets them be read by a test that supplies a plain identity palette. */
const ANSI = {
  bold: tty ? (s: string): string => `\x1b[1m${s}\x1b[0m` : identity,
  dim: tty ? (s: string): string => `\x1b[2m${s}\x1b[0m` : identity,
  green: tty ? (s: string): string => `\x1b[32m${s}\x1b[0m` : identity,
  red: tty ? (s: string): string => `\x1b[31m${s}\x1b[0m` : identity,
  cyan: tty ? (s: string): string => `\x1b[36m${s}\x1b[0m` : identity,
};

function print(s: string): void {
  process.stdout.write(`${s}\n`);
}

interface Filter {
  readonly errorsOnly: boolean;
  readonly gate: string | null;
  readonly file: string | null;
  readonly limit: number;
  /** #2502 — the two OTHER artifacts this one door now reads. `stage`/`stages`/`run` select the verify
   *  run's per-stage transcripts (lib/show-stage.ts owns their rendering); `pointers` selects the pointer
   *  inventory (lib/show-pointers.ts). Each is a different ARTIFACT, so combining one with `--gate`/`--file`/
   *  `--errors-only` — which are structure vocabulary — is misuse, not a silently-ignored flag. */
  readonly stage: string | null;
  readonly stages: boolean;
  readonly run: string | null;
  readonly pointers: boolean;
  /** Whether `--limit` was given, so each view can keep its own default (10 violations, 40 log lines). */
  readonly limitGiven: boolean;
}

/** This verb's usage text — ONE home, read by both this parse and the front door's pre-dispatch `--help`
 *  answer (cli.ts VERB_HELP, #809). */
export const SHOW_HELP =
  "Usage: pnpm check:show [options]\n\n" +
  "  --errors-only     Failing gate names + counts only, no per-site detail.\n" +
  "  --gate <substr>   Filter to gates whose name contains <substr> (shows it even if clean).\n" +
  "  --file <substr>   Filter violations whose file path contains <substr>.\n" +
  '  --limit <N>       Sample violations per gate before an "…and N more" hint (default 10).\n' +
  "\n  The verify run's per-stage transcripts (reports/verify/<stage>.log) — #2502:\n" +
  "  --stage <name>    That stage's transcript tail from the last COMPLETE verify run (--limit N lines, default 40).\n" +
  "  --stages          Every stage of that run with its verdict, and the names --stage accepts.\n" +
  "  --run <runId>     Read that run's slot directly — the door out of an in-flight refusal.\n" +
  "\n  Pointer liveness:\n" +
  "  --pointers        Every published reports/ pointer, and whether it still serves its instrument's newest run.\n" +
  "\n  --help, -h        Show this message.";

function parseArgs(argv: readonly string[]): Filter | "help" {
  if (argv.includes("--help") || argv.includes("-h")) {
    print(SHOW_HELP);
    return "help";
  }
  let errorsOnly = false;
  let gate: string | null = null;
  let file: string | null = null;
  let limit = DEFAULT_LIMIT;
  let limitGiven = false;
  let stage: string | null = null;
  let stages = false;
  let run: string | null = null;
  let pointers = false;
  const valueAfter = (index: number, flag: string): string => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("-")) {
      throw new UsageError(`check:show — ${flag} requires a value`);
    }
    return value;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) {
      continue;
    }
    switch (arg) {
      case "--errors-only":
        errorsOnly = true;
        break;
      case "--gate":
        gate = valueAfter(i, arg);
        i += 1;
        break;
      case "--file":
        file = valueAfter(i, arg);
        i += 1;
        break;
      case "--stage":
        stage = valueAfter(i, arg);
        i += 1;
        break;
      case "--stages":
        stages = true;
        break;
      case "--run":
        run = valueAfter(i, arg);
        i += 1;
        break;
      case "--pointers":
        pointers = true;
        break;
      case "--limit": {
        const raw = valueAfter(i, arg);
        const parsed = Number(raw);
        const valid = POSITIVE_INTEGER.test(raw) && Number.isSafeInteger(parsed) && parsed >= 1;
        if (!valid) {
          throw new UsageError(`check:show — --limit must be a positive integer, got ${JSON.stringify(raw)}`);
        }
        limit = parsed;
        limitGiven = true;
        i += 1;
        break;
      }
      default:
        throw new UsageError(`check:show — unknown argument ${JSON.stringify(arg)}`);
    }
  }
  return refuseMixedViews({ errorsOnly, gate, file, limit, limitGiven, stage, stages, run, pointers });
}

/** THE THREE VIEWS ARE THREE ARTIFACTS, and a request that names two is misuse rather than a silent
 *  precedence rule (the #1117 tail axis, applied within one verb): `--gate`/`--file`/`--errors-only` read
 *  `reports/check-structure.json`, `--stage`/`--stages`/`--run` read the verify run's stage transcripts, and
 *  `--pointers` reads the pointer inventory. Answering one while ignoring the other is how a reader reports
 *  confidently about something nobody asked for. */
function refuseMixedViews(f: Filter): Filter {
  const structure = f.errorsOnly || f.gate !== null || f.file !== null;
  const stageFlags = f.stage !== null || f.stages || f.run !== null;
  const named = [structure ? "--errors-only/--gate/--file" : null, stageFlags ? "--stage/--stages/--run" : null, f.pointers ? "--pointers" : null].filter(
    (n): n is string => n !== null,
  );
  if (named.length > 1) {
    throw new UsageError(`check:show — ${named.join(" and ")} select DIFFERENT artifacts; ask for one at a time.`);
  }
  if (f.stage !== null && f.stages) {
    throw new UsageError("check:show — --stage names one stage and --stages lists them all; ask for one at a time.");
  }
  return f;
}

function matchesGate(g: GateReport, f: Filter): boolean {
  return f.gate === null || g.name.toLowerCase().includes(f.gate.toLowerCase());
}

function filteredViolations(g: GateReport, f: Filter): readonly Violation[] {
  if (f.file === null) {
    return g.violations;
  }
  const needle = f.file.toLowerCase();
  return g.violations.filter((v) => v.file.toLowerCase().includes(needle));
}

/** The scan denominator behind a gate's verdict, for the artifact view. Absent on a pre-2026-08-13
 *  artifact — printed as nothing rather than a fabricated zero. */
function scanNote(scan: GateScanView | undefined): string {
  if (scan === undefined) {
    return "";
  }
  const parts = [`scanned ${scan.scanned}/${scan.candidates} files`];
  if (scan.declared !== undefined) {
    parts.push(`${scan.declared.scanned}/${scan.declared.candidates} ${scan.declared.unit}s`);
  }
  if (scan.admitted > 0) {
    const ratified = scan.admittedRatified ?? 0;
    parts.push(`admitted-by-ratchet: ${scan.admitted} ${formatSplit(scan.admitted - ratified, ratified)}`);
  }
  return ANSI.dim(`  ·  ${parts.join(" · ")}`);
}

function printGate(g: GateReport, violations: readonly Violation[], f: Filter): void {
  const header = isFinalRow(g)
    ? finalRowHeader(g, violations.length, ANSI)
    : `${g.ok ? ANSI.green("✓") : ANSI.red("✗")} ${ANSI.bold(g.name)} (${violations.length} violation${violations.length === 1 ? "" : "s"})${scanNote(g.scan)}`;
  print(header);
  if (f.errorsOnly || violations.length === 0) {
    print("");
    return;
  }
  const sample = violations.slice(0, f.limit);
  for (const v of sample) {
    print(violationLine(v, ANSI));
  }
  if (violations.length > sample.length) {
    print(ANSI.dim(`  …and ${violations.length - sample.length} more (--limit N to widen)`));
  }
  print("");
}

/** The failure header + the thrown-gate rows. A thrown gate is a broken CHECKER, not a violation —
 *  rendered before the gate list so an otherwise-empty failing report explains itself. */
function printVerdictAndToolErrors(report: StructureReport): void {
  const toolErrors = report.toolErrors ?? [];
  const blind = report.scanAlarms ?? [];
  const populations = report.populationAlarms ?? [];
  const evidenceBroken = brokenEvidenceCount(report) > 0;
  // ANNOTATED LOCAL — see the same note in ops/structure.ts: biome resolves the imported view's optional
  // `policy` as always-present and reds the `?.` below; tsc reads the union correctly.
  const policy: StructurePolicyReport | null | undefined = report.policy;
  const counts = {
    total: report.total,
    toolErrors: toolErrors.length,
    blind: blind.length,
    populations: populations.length,
    finalToolErrors: finalBrokenEvidenceCount(report.policy),
    alarms: policy?.authority.alarms.length ?? 0,
  };
  print(report.ok && !evidenceBroken ? ANSI.green("✓ check:structure passed (filter view)\n") : failedHeaderLine(counts, ANSI));
  for (const e of toolErrors) {
    print(`${ANSI.red("✗ TOOL ERROR")} ${ANSI.bold(e.gate)} [${e.phase}]  ${e.message}`);
  }
  for (const name of blind) {
    print(
      `${ANSI.red("✗ SCANNED ZERO FILES")} ${ANSI.bold(name)}  the gate ran and read nothing — its verdict is a placebo (tooling/src/verify/gates/GATE-AUTHORING.md §3).`,
    );
  }
  for (const a of populations) {
    print(`${ANSI.red("✗ REFUSED POPULATION")} ${ANSI.bold(a.gate)}  ${populationAlarmText(a)}`);
  }
  if (report.policy !== null && report.policy !== undefined) {
    for (const line of finalBlockLines(report.policy, ANSI)) {
      print(line);
    }
  }
  if (evidenceBroken) {
    print("");
  }
}

/** #644 — the near-cap ADVISORY, never a violation: a file a few lines under its component-size /
 *  component-size-ui / tooling-size cap is a fact a lane needs BEFORE it edits (a one-member tuple
 *  addition + biome's re-wrap turns "a few lines under" into a surprise RED naming a file the edit never
 *  meant to restructure). Computed fresh off disk every call — cheap, no ts-morph — so it can never go
 *  stale relative to the last `check:structure` run the way a report-embedded count would. */
function printNearCapAdvisories(root: string): void {
  const rows = nearCapAdvisories(root);
  if (rows.length === 0) {
    return;
  }
  print(ANSI.dim(`ℹ ${rows.length} file(s) inside their line-cap band — plan a split before your next edit there (tooling/src/verify/lib/near-cap.ts, #644):`));
  for (const r of rows) {
    print(ANSI.dim(`  ${r.file} — ${r.lines}/${r.cap} (headroom ${r.headroom}, ${r.gate})`));
  }
  print("");
}

/** The failing-report gate list — one row per gate that matches the filter and (unless the caller asked
 *  for this exact gate by name) carries a violation. Split out of `runShow` to keep it under the
 *  cognitive-complexity cap. */
function printGateList(report: StructureReport, filter: Filter): void {
  printVerdictAndToolErrors(report);
  for (const g of report.gates) {
    if (!matchesGate(g, filter)) {
      continue;
    }
    const violations = filteredViolations(g, filter);
    // A clean gate is noise unless the caller explicitly asked to inspect this exact gate.
    if (violations.length === 0 && filter.gate === null) {
      continue;
    }
    printGate(g, violations, filter);
  }
}

/** THE OTHER TWO ARTIFACTS THIS ONE DOOR READS (#2502), answered before the structure read: the verify run's
 *  per-stage transcripts and the pointer inventory. Returns the exit code when one of them was asked for,
 *  and null when this is an ordinary structure read.
 *
 *  ONE DOOR, THREE RENDERERS. What the three share is the RESOLUTION — which run am I reading, is it the
 *  newest complete one, is a newer one in flight (`_shared/artifact-pointer.ts`) — and that is the whole of
 *  what was centralized: every misattribution this closes was a resolution failure, not a rendering one. The
 *  vocabularies stay apart, because a single renderer would have to speak `--gate`/`--file` AND stage modes
 *  AND, tomorrow, snap's arms and viewports — two homes for one concept, inverted. */
function runAlternateView(root: string, filter: Filter): number | null {
  const wantsStage = filter.stage !== null || filter.stages || filter.run !== null;
  if (!(filter.pointers || wantsStage)) {
    return null;
  }
  const view = filter.pointers
    ? pointerView(root, ANSI)
    : stageView(root, { stage: filter.stage, stages: filter.stages, run: filter.run, limit: filter.limitGiven ? filter.limit : null }, ANSI);
  for (const line of view.lines) {
    print(line);
  }
  return view.exit;
}

/** The `show` verb — the read-don't-rerun view of reports/check-structure.json. Returns the report's own
 *  verdict (0 clean / 1 dirty), or 0 when a filter makes this an inspection view. */
export function runShow(root: string, argv: readonly string[]): number {
  const filter = parseArgs(argv);
  if (filter === "help") {
    return EXIT.clean;
  }
  const alternate = runAlternateView(root, filter);
  if (alternate !== null) {
    return alternate;
  }
  const pointer = resolveStructurePointer(root);
  const report = readReport(root, pointer);
  const abandoned = refuseAbandoned(pointer, report, ANSI);
  if (abandoned !== null) {
    print(abandoned);
    return EXIT.toolError;
  }
  if (report === null) {
    throw new UsageError(missingReportRefusal(root));
  }
  const incomplete = refuseIncomplete(report, ANSI);
  if (incomplete !== null) {
    print(incomplete);
    return EXIT.toolError;
  }
  // WHOSE run this is, always — the pointer is a `latest` alias under concurrency (#1029), so a reader who
  // does not know the run identity does not know whether the verdict is theirs.
  print(ANSI.dim(`(run ${describeRun(report.run)})`));
  if (report.reconciliation !== undefined) {
    print(ANSI.dim(`finding count: ${structureCountLine(report.reconciliation)}`));
  }
  const filtersActive = filter.gate !== null || filter.file !== null;
  const evidenceBroken = brokenEvidenceCount(report) > 0;

  if (report.ok && !filtersActive && !evidenceBroken) {
    // The admitted total rides the PASS line: a ratchet baseline is declared debt a green run is still
    // carrying, and "green" was the only thing this line said until 2026-08-13 (Codex GA-H-02).
    print(passLine(report.gates, report.policy, ANSI));
    printNearCapAdvisories(root);
    return EXIT.clean;
  }

  printGateList(report, filter);
  if (!filtersActive) {
    printNearCapAdvisories(root);
  }

  if (evidenceBroken) {
    return EXIT.toolError;
  }
  return filtersActive || report.ok ? EXIT.clean : EXIT.violations;
}
