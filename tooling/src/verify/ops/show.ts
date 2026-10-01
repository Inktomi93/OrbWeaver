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
 * THE FAILED-VERIFY-RUN SUMMARY (#0267). The bare default and `--errors-only` also read `reports/verify.json`
 * — when the latest verify run did not pass, every failing stage is named with its own extracted failure
 * lines BEFORE the structure verdict, so a stage `check:structure` cannot see (`tests:node`, `browser:ct`,
 * a boot or budget stage) is never silent under a clean structure verdict. An ABANDONED verify run (it died
 * mid-flight) or an UNPARSEABLE `verify.json` gets a one-line advisory instead of a silent fall-through — the
 * structure view still renders beneath it. `lib/show-run-summary.ts` owns this reader; `--gate`/`--file` stay
 * a narrow, unaugmented structure-only ask.
 *
 * Exit code: mirrors the report's overall `ok` (0 clean / 1 dirty), and is never clean when the latest
 * verify run failed OR its pointer is abandoned/unparseable (toolError, 2) — unless a filter is active, in
 * which case ordinary violations are an inspection view (0). Broken structure evidence is always toolError
 * (2), and invalid argv is always misuse (3), filters or not.
 */
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import type { StructureReport } from "../contract/show-artifact.ts";
import {
  brokenEvidenceCount,
  describeRun,
  missingReportRefusal,
  readReport,
  refuseAbandoned,
  refuseIncomplete,
  resolveStructurePointer,
} from "../lib/show-artifact.ts";
import { pointerView } from "../lib/show-pointers.ts";
import { passLine } from "../lib/show-policy.ts";
import { resolveLatestVerifyRun, structureProvenanceNote, verifyFailureSummary } from "../lib/show-run-summary.ts";
import { stageView } from "../lib/show-stage.ts";
import { gateListLines, nearCapAdvisoryLines } from "../lib/show-structure-view.ts";
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

function printAll(lines: readonly string[]): void {
  for (const line of lines) {
    print(line);
  }
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
  "  The default view and --errors-only also name every failing stage of the last verify run, with its\n" +
  "  own extracted failure lines, before the structure verdict below.\n\n" +
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

/** The verify-run summary's verdict on the exit code: `failed` when the run ran and did not pass (never a
 *  clean exit even when structure alone is green); `toolError` when the pointer itself is broken evidence
 *  (an abandoned run, an unparseable report) — `show-stage.ts`'s own precedent for the same two states. */
interface VerifySignal {
  readonly failed: boolean;
  readonly toolError: boolean;
}

const NO_VERIFY_SIGNAL: VerifySignal = { failed: false, toolError: false };

/** THE FAILED-VERIFY-RUN SUMMARY (#0267) — printed before the structure verdict when the latest verify run
 *  did not pass, so a stage this artifact alone cannot see (`tests:node`, `browser:ct`, a budget or boot
 *  stage) is never silent under a clean structure verdict. An ambiguous-but-actionable pointer state
 *  (abandoned, unparseable) gets a one-line advisory instead of a silent fall-through to the structure view
 *  alone — a reader who never sees that the last verify run died has no way to know it. Split out of
 *  `runShow` to keep it under the cognitive-complexity cap. */
function printVerifyFailureSummary(root: string, structureRun: StructureReport["run"], filter: Filter): VerifySignal {
  const resolution = resolveLatestVerifyRun(root);
  if (resolution.kind === "silent") {
    return NO_VERIFY_SIGNAL;
  }
  if (resolution.kind === "advisory") {
    printAll(resolution.lines.map((line) => ANSI.red(line)));
    print("");
    return { failed: false, toolError: resolution.toolError };
  }
  printAll(resolution.advisories.map((line) => ANSI.red(line)));
  if (resolution.report.ok) {
    return NO_VERIFY_SIGNAL;
  }
  const summary = verifyFailureSummary(root, resolution.report, filter.limit, ANSI);
  if (summary !== null) {
    printAll(summary);
  }
  print(structureProvenanceNote(resolution.report.run, structureRun, ANSI));
  print("");
  return { failed: true, toolError: false };
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
  printAll(view.lines);
  return view.exit;
}

/** The structure verdict + the verify-run summary above it, and the exit code the two of them earn together.
 *  Split out of `runShow` to keep it under the cognitive-complexity cap — this is the half that combines the
 *  two artifacts' verdicts; `runShow` above it is purely "resolve the structure report or refuse". */
function renderStructureVerdict(root: string, report: StructureReport, filter: Filter): number {
  const filtersActive = filter.gate !== null || filter.file !== null;
  const evidenceBroken = brokenEvidenceCount(report) > 0;

  // A `--gate`/`--file` request is an explicit, narrow ask about the structure artifact and is left
  // untouched; the bare default and `--errors-only` are where a red `tests:node`/`browser:ct`/other
  // non-structure stage used to go unreported while a clean structure verdict printed underneath it.
  const verifySignal = filtersActive ? NO_VERIFY_SIGNAL : printVerifyFailureSummary(root, report.run, filter);
  const verifyBlocksClean = verifySignal.failed || verifySignal.toolError;

  if (report.ok && !filtersActive && !evidenceBroken && !verifyBlocksClean) {
    // The admitted total rides the PASS line: a ratchet baseline is declared debt a green run is still
    // carrying, and "green" was the only thing this line said until 2026-08-13 (Codex GA-H-02).
    print(passLine(report.gates, report.policy, ANSI));
    printAll(nearCapAdvisoryLines(root, ANSI));
    return EXIT.clean;
  }

  printAll(gateListLines(report, filter, filtersActive, ANSI));
  if (!filtersActive) {
    printAll(nearCapAdvisoryLines(root, ANSI));
  }

  if (evidenceBroken || verifySignal.toolError) {
    return EXIT.toolError;
  }
  if (verifySignal.failed) {
    // The run failed even though structure alone did not — never a clean exit for a red `pnpm verify`.
    return EXIT.violations;
  }
  return filtersActive || report.ok ? EXIT.clean : EXIT.violations;
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
  return renderStructureVerdict(root, report, filter);
}
