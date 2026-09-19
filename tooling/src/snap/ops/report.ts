// Report printing: the human triage view (summary/aria/eval/contrast/map/assert/css/watch blocks), the
// checkpoint evidence-window scoping, console selection (errors win), crop attribution, and the
// probe-motion voiding marker. --json remains the lossless record (ops/manifest.ts).
import { activeRunSlot } from "../../_shared/artifact-out.ts";
import { print } from "../../_shared/artifacts.ts";
import type { CapturedConsole, CapturedRequest } from "../../_shared/browser-capture.ts";
import type { BrowserPageError, ProbeSession } from "../../_shared/browser-contract.ts";
import { pageErrorText } from "../../_shared/browser-contract.ts";
import type { BrowserDiagnostic } from "../../_shared/browser-diagnostics.ts";
import type { BrowserEnvironmentEvidence } from "../../_shared/browser-environment.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ContrastOutcome } from "../contract/contrast.ts";
import type { Args, AssertionOutcome, CaptureOutcome, EvalOutcome, EvidenceRange, ReportCtx, SessionCounts, WatchTick } from "../contract/types.ts";
import { printMapBlock } from "../lib/map-report.ts";
import { shotScaleResultValue } from "../lib/shot-scale.ts";
// `cropOutcome` belongs to the PIXEL ARM (ops/arms/shot.ts) — the crop is a shot instruction, and one
// rule with two homes is what the arm registry exists to end.
import { cropOutcome } from "./arms/shot.ts";
import { printDiagnosticQuery } from "./diagnostics.ts";
import { printCascadeReceipt, printCssFindings } from "./report-summary-blocks.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

const ARIA_MAX_LINES = 400;
// Human output is a triage view; --json is the lossless console record.
const CONSOLE_REPORT_CAP = 200;

// --eval block header: the expr itself, truncated so a long one-liner doesn't wrap the report.
const EVAL_LABEL_CAP = 80;

const METHOD_PAD = 4;
const TYPE_PAD = 8;

/** --probe injects `*{animation:none!important;transition:none!important}` from DOMContentLoaded
 *  (PROBE_CSS_SCRIPT). That is correct for a DETERMINISTIC SHOT and fatal for a MOTION reading: it kills
 *  the very FLIP animations (shell.css `@keyframes shell-main-flip`, stamped by use-shell-track-flip)
 *  whose job is to make a track change CLS-free — so the harness MANUFACTURES layout-shift findings
 *  (a 0.2295 theme-scope shift was filed off exactly this on 2026-08-16). `__orb.motion()` reached
 *  through --eval is uncatchable from here, so the marker is unconditional under --probe: every
 *  motion/CLS number in the run is void, and the run says so. Take CLS/motion receipts WITHOUT --probe. */
const PROBE_MOTION_MARKER = "PROBE-NEUTERED-MOTION";

export function printProbeMotionWarning(opts: Args): void {
  if (opts.probe) {
    print(`\n!! ${PROBE_MOTION_MARKER} — --probe floors every animation/transition from first paint, so every`);
    print("   motion / CLS / layout-shift number in this run is an ARTEFACT of the harness, not the app.");
    print("   Re-take motion receipts without --probe.");
  }
}

export function motionResultValue(opts: Args): string {
  return opts.probe ? PROBE_MOTION_MARKER : "live";
}

/** `scale=<ask>/<WxH>` on the RESULT line: what the run ACTUALLY produced, not what it asked for (#915
 *  item 2). The APPLIED contract is the source because a device descriptor supplies its own viewport and
 *  DPR — reading `opts` alone would state a density the pixels do not have. */
export function scaleResultValue(opts: Args, environment: readonly BrowserEnvironmentEvidence[]): string {
  const applied = environment[0]?.applied;
  return shotScaleResultValue(opts.scale, applied?.viewport ?? opts.viewport, applied?.deviceScaleFactor ?? 1);
}

/** `device=<pointer>:dpr<n>:<WxH>` on the RESULT line (#1668) — the EFFECTIVE device, read from the same
 *  OBSERVED contract every other receipt uses, so a reader can see what was actually measured instead of
 *  inferring it from the argv. It exists because `--mobile --viewport 320x740` used to report a desktop at
 *  320 in total silence: `pointer` is what `matchMedia("(pointer: coarse)")` answered ON THE PAGE, not what
 *  the descriptor promised, so a device that failed to apply says so here rather than in a lane's re-run.
 *  `unknown` only when no browser environment was captured at all (a report-only invocation). */
export function deviceResultValue(environment: readonly BrowserEnvironmentEvidence[]): string {
  const evidence = environment[0];
  if (evidence === undefined) {
    return "unknown";
  }
  const { pointer, deviceScaleFactor, innerViewport, viewport } = evidence.actual;
  const size = viewport ?? innerViewport;
  return `${pointer}:dpr${String(deviceScaleFactor)}:${String(size.width)}x${String(size.height)}`;
}

function evidenceRanges(outcomes: readonly CaptureOutcome[]): readonly EvidenceRange[] | null {
  const ranges = outcomes.map((outcome) => outcome.evidenceRange);
  return ranges.some((range) => range === null) ? null : ranges.filter((range): range is EvidenceRange => range !== null);
}

export function consoleForEvidence(
  session: Pick<SessionCounts, "consoleMessages" | "evidence">,
  outcomes: readonly CaptureOutcome[],
): readonly CapturedConsole[] {
  const ranges = evidenceRanges(outcomes);
  if (ranges === null) {
    return session.consoleMessages;
  }
  const first = ranges[0];
  const last = ranges.at(-1);
  if (first === undefined || last === undefined) {
    return session.consoleMessages;
  }
  return (
    session.evidence?.console.read(first.consoleStart, last.consoleEnd, "browser-console-window").records ??
    session.consoleMessages.slice(first.consoleStart, last.consoleEnd)
  );
}

export function pageErrorsForEvidence(
  session: Pick<SessionCounts, "pageErrors" | "evidence">,
  outcomes: readonly CaptureOutcome[],
): readonly BrowserPageError[] {
  const ranges = evidenceRanges(outcomes);
  if (ranges === null) {
    return session.pageErrors;
  }
  const first = ranges[0];
  const last = ranges.at(-1);
  if (first === undefined || last === undefined) {
    return session.pageErrors;
  }
  return (
    session.evidence?.pageErrors.read(first.pageErrorStart, last.pageErrorEnd, "browser-page-error-window").records ??
    session.pageErrors.slice(first.pageErrorStart, last.pageErrorEnd)
  );
}

function diagnosticsForEvidence(diagnostics: readonly BrowserDiagnostic[], outcomes: readonly CaptureOutcome[]): readonly BrowserDiagnostic[] {
  const windows = evidenceWindows(outcomes);
  return windows.size === 0 ? diagnostics : diagnostics.filter((entry) => windows.has(entry.evidenceWindow));
}

function evidenceWindows(outcomes: readonly CaptureOutcome[]): ReadonlySet<number> {
  return new Set(outcomes.flatMap((outcome) => (outcome.evidenceRange === null ? [] : [outcome.evidenceRange.diagnosticWindow])));
}

export function extendEvidenceThroughWatch(outcomes: readonly CaptureOutcome[], session: ProbeSession): void {
  const outcome = outcomes.findLast((candidate) => candidate.evidenceRange !== null);
  const range = outcome?.evidenceRange;
  if (outcome !== undefined && range !== null && range !== undefined) {
    outcome.evidenceRange = {
      ...range,
      consoleEnd: session.evidence.console.cursor(),
      pageErrorEnd: session.evidence.pageErrors.cursor(),
    };
  }
}

export function sessionForEvidence(session: SessionCounts, outcomes: readonly CaptureOutcome[]): SessionCounts {
  const consoleMessages = consoleForEvidence(session, outcomes);
  return {
    requests: session.requests,
    consoleMessages,
    consoleLines: consoleMessages.map((message) => message.line),
    pageErrors: pageErrorsForEvidence(session, outcomes),
    diagnostics: diagnosticsForEvidence(session.diagnostics, outcomes),
    diagnosticCompleteness: session.diagnosticCompleteness.filter((entry) => {
      const windows = evidenceWindows(outcomes);
      return windows.size === 0 || windows.has(entry.evidenceWindow);
    }),
    diagnosticWindow: session.diagnosticWindow,
  };
}

export function printCheckpointScope(full: SessionCounts, scoped: SessionCounts): void {
  const bootConsole = full.consoleMessages.length - scoped.consoleMessages.length;
  const bootPageErrors = full.pageErrors.length - scoped.pageErrors.length;
  if (bootConsole > 0 || bootPageErrors > 0) {
    print(`checkpoint   interaction verdict excludes ${bootConsole} boot console message(s) and ${bootPageErrors} boot page error(s); JSON retains both`);
  }
}

function printSummary(session: SessionCounts, outcome: CaptureOutcome, opts: Args, ctx: ReportCtx): void {
  let shotDisplay = ctx.out;
  if (!ctx.produceShot) {
    shotDisplay = "(none — --no-shot)";
  } else if (opts.shotOf !== null) {
    shotDisplay = `${ctx.out}  (element: ${opts.shotOf})`;
  }
  print(`URL          ${ctx.url}`);
  print(`screenshot   ${shotDisplay}`);
  if (opts.colorScheme !== null) {
    print(`colorScheme  ${opts.colorScheme}`);
  }
  if (outcome.navError !== null) {
    print(`NAV ERROR    ${outcome.navError}`);
  }
  print(`requests     ${session.requests.size} (${ctx.failed.length} failed/4xx-5xx)`);
  const consoleErrors = session.consoleMessages.filter((entry) => entry.type === "error").length;
  const consoleWarnings = session.consoleMessages.filter((entry) => entry.type === "warning").length;
  print(`console      ${session.consoleLines.length} message(s) (${consoleErrors} error, ${consoleWarnings} warning)`);
  print(`page errors  ${session.pageErrors.length}`);
  const diagnosticErrors = session.diagnostics.filter((entry) => entry.level === "error").length;
  const diagnosticWarnings = session.diagnostics.filter((entry) => entry.level === "warning").length;
  const issues = session.diagnostics.filter((entry) => entry.origin === "audits").length;
  print(`diagnostics  ${session.diagnostics.length} record(s) (${diagnosticErrors} error, ${diagnosticWarnings} warning, ${issues} issue)`);
  printDiagnosticQuery(session.diagnostics, opts.diagnostics, session.diagnosticWindow.value);
}

function printAriaBlock(opts: Args, ariaText: string | null, ariaError: string | null): void {
  if (ariaError !== null) {
    print(`\n--- ARIA (${opts.ariaSelector}) ---`);
    print(`  ${ariaError}`);
    return;
  }
  if (ariaText === null) {
    return;
  }
  // The text path. For "did it render / is the list populated / is the dialog
  // open / what's the label" this is the whole answer — no pixels needed.
  const lines = ariaText.split("\n");
  const scope = `${opts.ariaSelector}${opts.ariaDepth !== null ? ` depth≤${opts.ariaDepth}` : ""}`;
  print(`\n--- ARIA (${scope}, ${lines.length} line(s)) ---`);
  for (const l of lines.slice(0, ARIA_MAX_LINES)) {
    print(`  ${l}`);
  }
  if (lines.length > ARIA_MAX_LINES) {
    print(`  … +${lines.length - ARIA_MAX_LINES} more — scope with --aria <selector> or --aria-depth N`);
  }
}

function printEvalBlock(evals: readonly EvalOutcome[]): void {
  evals.forEach((e, i) => {
    const label = e.expr.length > EVAL_LABEL_CAP ? `${e.expr.slice(0, EVAL_LABEL_CAP)}…` : e.expr;
    print(`\n--- EVAL[${i}] (${label}) ---`);
    print(e.text);
  });
}

function printContrastBlock(contrasts: readonly ContrastOutcome[]): void {
  if (contrasts.length > 0) {
    print("");
  }
  for (const c of contrasts) {
    print(c.line);
  }
}

function printAssertionBlock(assertions: readonly AssertionOutcome[]): void {
  if (assertions.length === 0) {
    return;
  }
  print(`\n--- ASSERTIONS (${assertions.length}) ---`);
  for (const assertion of assertions) {
    print(`  ${assertion.line}`);
  }
}

/** Bound terminal noise without hiding the evidence that decides a run. Errors win, then warnings, then
 *  the newest informational tail; the JSON manifest remains the lossless record. */
export function selectConsoleMessagesForReport(
  messages: readonly CapturedConsole[],
  cap = CONSOLE_REPORT_CAP,
): { readonly messages: readonly CapturedConsole[]; readonly omitted: number } {
  if (messages.length <= cap) {
    return { messages, omitted: 0 };
  }
  const indexed = messages.map((message, index) => ({ message, index }));
  const errors = indexed.filter(({ message }) => message.type === "error");
  const warnings = indexed.filter(({ message }) => message.type === "warning");
  const ordinary = indexed.filter(({ message }) => message.type !== "error" && message.type !== "warning");
  const selected = errors.slice(-cap);
  selected.push(...warnings.slice(-Math.max(0, cap - selected.length)));
  selected.push(...ordinary.slice(-Math.max(0, cap - selected.length)));
  selected.sort((left, right) => left.index - right.index);
  return { messages: selected.map(({ message }) => message), omitted: messages.length - selected.length };
}

function printRequestLines(requests: readonly CapturedRequest[]): void {
  for (const r of requests) {
    print(`  ${r.method.padEnd(METHOD_PAD)} ${r.type.padEnd(TYPE_PAD)} ${r.status ?? "—"} ${r.failed ?? ""} ${r.url}`);
  }
}

export function printCaptureLog(
  session: SessionCounts,
  failed: CapturedRequest[],
  viteChurn: readonly CapturedRequest[] = [],
  fileOrigin: readonly CapturedRequest[] = [],
): void {
  if (failed.length > 0) {
    print("\n--- failed requests ---");
    printRequestLines(failed);
  }
  // Printed, never counted against the run — see isViteDepChurn.
  if (fileOrigin.length > 0) {
    print(`\n--- file:// unique-origin notes (${fileOrigin.length}, NOT a failure — a CDP attach against a file:// document, ops/noise.ts) ---`);
    printRequestLines(fileOrigin);
  }
  if (viteChurn.length > 0) {
    print(`\n--- vite dep-optimizer churn (${viteChurn.length}, NOT a failure — cold-stage re-bundle aborts, re-requested and served) ---`);
    printRequestLines(viteChurn);
  }
  printConsoleDigest(session);
  if (session.pageErrors.length > 0) {
    print("\n--- page errors ---");
    for (const e of session.pageErrors) {
      print(pageErrorText(e));
    }
  }
}

/** HOW THIS RUN IS CITED. The run id is what `--report` resolves (across worktrees, unambiguously), and
 *  it is 60 characters instead of two absolute paths — the same shortening #1369 applied to the FINDING
 *  rows, for the same reason. Outside a run (a library caller, a test) there is no slot, and `latest` is
 *  the reader's own resolution rather than an id we would be inventing. */
function runCitation(): string {
  const slot = activeRunSlot();
  return slot === null ? "latest" : slot.runId;
}

/** THE CONSOLE, AS ONE LINE (#1345).
 *
 *  A `/chats` run's console block was 46 lines and ~8 KB of `%c`-formatted trpc chatter — it pushed the
 *  answer to an `--eval` run down to line 61 and put the end card within reach of the Bash tool's output
 *  truncation. The messages were never lost (they are in the run's diagnostics artifact and in `--json`),
 *  they were simply printed at the wrong tier: nothing an operator asked for.
 *
 *  ERRORS STILL PRINT INLINE, always and in full. A console error is a claim about the app that the
 *  reader must not have to make a second call to see, and it is exactly what the digest line would
 *  otherwise reduce to a count. */
function printConsoleDigest(session: SessionCounts): void {
  const errors = session.consoleMessages.filter((entry) => entry.type === "error");
  const warnings = session.consoleMessages.filter((entry) => entry.type === "warning").length;
  if (session.consoleMessages.length === 0) {
    return;
  }
  const run = runCitation();
  print(
    `console      errors=${errors.length} warnings=${warnings} messages=${session.consoleMessages.length} → browser-diagnostics/ in run ${run}; read: pnpm snap --report ${run} --all --channel console`,
  );
  for (const message of errors.slice(0, CONSOLE_REPORT_CAP)) {
    print(`  ${message.line}`);
  }
  if (errors.length > CONSOLE_REPORT_CAP) {
    print(`  … ${errors.length - CONSOLE_REPORT_CAP} further console error(s) — read them with the command above`);
  }
}

// Crop is captured natively in captureShot (Playwright clip) — just report it.
export function printCropNote(opts: Args, ctx: ReportCtx): void {
  const outcome = cropOutcome(opts, ctx);
  if (outcome !== null) {
    print(`crop         ${outcome}`);
  }
}

/** `nav=` on the RESULT line covers BOTH nav classes. It printed OK next to `nav-actions-failed=1` until
 *  2026-08-16 — a chain whose --goto was rejected read as a clean run of the surface it never reached. */
export function navResultVerdict(navigationErrors: number, navActionFailures: number): string {
  if (navigationErrors > 0) {
    return "ERROR";
  }
  return navActionFailures > 0 ? "ACTIONS-FAILED" : "OK";
}

export function printWatchBlock(ticks: readonly WatchTick[]): void {
  if (ticks.length === 0) {
    return;
  }
  print(`\n--- WATCH (${ticks.length} tick(s)) ---`);
  let previousEvalSignature: string | null = null;
  let omitted = 0;
  for (const t of ticks) {
    const evalSignature = JSON.stringify(t.evals.map((entry) => ({ text: entry.text, failed: entry.failed })));
    const unchangedEvalOnly = t.shot === null && t.shotError === null && previousEvalSignature === evalSignature;
    previousEvalSignature = evalSignature;
    if (unchangedEvalOnly) {
      omitted += 1;
      continue;
    }
    if (omitted > 0) {
      print(`  … ${omitted} unchanged tick(s) omitted`);
      omitted = 0;
    }
    print(`  t+${t.elapsedMs}ms  →  ${t.shot ?? "(no shot — --no-shot)"}${t.shotError === null ? "" : `  FAILED: ${t.shotError}`}`);
    t.evals.forEach((e, i) => {
      const label = e.expr.length > EVAL_LABEL_CAP ? `${e.expr.slice(0, EVAL_LABEL_CAP)}…` : e.expr;
      // Collapse a multi-line eval result to keep the series scannable; the single-shot --eval block
      // (post-watch) still prints the full pretty-printed value.
      const oneLine = e.text.replace(/\s+/g, " ").slice(0, EVAL_LABEL_CAP);
      print(`    eval[${i}] (${label}): ${oneLine}`);
    });
  }
  if (omitted > 0) {
    print(`  … ${omitted} unchanged tick(s) omitted`);
  }
}

// One page's report section. Multi-tab prefixes a `=== PAGE N ===` banner; single-page prints exactly
// the original layout. Session-wide logs (requests/console/pageErrors) print ONCE after all pages.
// ctx.label lets --contexts reuse this for a `=== CONTEXT N ===` banner instead.
export function printPageReport(session: SessionCounts, outcome: CaptureOutcome, opts: Args, ctx: ReportCtx): void {
  if (ctx.totalPages > 1) {
    print(`\n========== ${ctx.label ?? "PAGE"} ${outcome.pageIndex} ==========`);
  }
  printSummary(session, outcome, opts, ctx);
  printAriaBlock(opts, outcome.ariaText, outcome.ariaError);
  printEvalBlock(outcome.evalResults);
  printContrastBlock(outcome.contrastResults);
  printMapBlock({
    opts,
    atlas: outcome.mapAtlas,
    atlasError: outcome.mapAtlasError,
    shell: outcome.mapShell,
    shellError: outcome.mapShellError,
    entries: outcome.mapResult,
    surfaceError: outcome.mapError,
  });
  printAssertionBlock(outcome.assertions);
  printCssFindings(outcome);
  printCascadeReceipt(outcome.cssEvidence);
}
