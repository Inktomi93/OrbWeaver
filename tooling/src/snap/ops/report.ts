// Report printing: the human triage view (summary/aria/eval/contrast/map/assert/css/watch blocks), the
// checkpoint evidence-window scoping, console selection (errors win), crop attribution, and the
// probe-motion voiding marker. --json remains the lossless record (ops/manifest.ts).
import { print } from "../../_shared/artifacts.ts";
import type { CapturedConsole, CapturedRequest, ProbeSession } from "../../_shared/browser.ts";
import type { BrowserEnvironmentEvidence } from "../../_shared/browser-environment.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { CssEvidenceReceipt } from "../contract/cascade.ts";
import type {
  Args,
  AssertionOutcome,
  CaptureOutcome,
  ContrastOutcome,
  EvalOutcome,
  EvidenceRange,
  MapEntry,
  ReportCtx,
  SessionCounts,
  WatchTick,
} from "../contract/types.ts";
import { CROP_RE, PNG_EXT_RE } from "../lib/out-names.ts";
import { shotScaleResultValue } from "../lib/shot-scale.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

const ARIA_MAX_LINES = 400;
const MAP_NAME_MAX_LENGTH = 80;
// Human output is a triage view; --json is the lossless console record.
const CONSOLE_REPORT_CAP = 200;
// Cap on DEADCSS/EMPTYCSS lines echoed (the counts always print in full).
const CSS_FINDINGS_CAP = 15;
const CASCADE_STATE_PAD = 10;
const CASCADE_SOURCE_PAD = 18;

// --eval block header: the expr itself, truncated so a long one-liner doesn't wrap the report.
const EVAL_LABEL_CAP = 80;

const METHOD_PAD = 4;
const TYPE_PAD = 8;

/** --probe injects `*{animation:none!important;transition:none!important}` from DOMContentLoaded
 *  (PROBE_CSS_SCRIPT). That is correct for a DETERMINISTIC SHOT and fatal for a MOTION reading: it kills
 *  the very FLIP animations (shell.css `@keyframes shell-list-push-in`, stamped by use-list-track-flip)
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

export function consoleForEvidence(messages: readonly CapturedConsole[], outcomes: readonly CaptureOutcome[]): readonly CapturedConsole[] {
  const ranges = outcomes.map((outcome) => outcome.evidenceRange);
  if (ranges.some((range) => range === null)) {
    return messages;
  }
  const first = ranges[0] as EvidenceRange | undefined;
  const last = ranges.at(-1) as EvidenceRange | undefined;
  return first === undefined || last === undefined ? messages : messages.slice(first.consoleStart, last.consoleEnd);
}

export function pageErrorsForEvidence(errors: readonly string[], outcomes: readonly CaptureOutcome[]): readonly string[] {
  const ranges = outcomes.map((outcome) => outcome.evidenceRange);
  if (ranges.some((range) => range === null)) {
    return errors;
  }
  const first = ranges[0] as EvidenceRange | undefined;
  const last = ranges.at(-1) as EvidenceRange | undefined;
  return first === undefined || last === undefined ? errors : errors.slice(first.pageErrorStart, last.pageErrorEnd);
}

export function extendEvidenceThroughWatch(outcomes: readonly CaptureOutcome[], session: ProbeSession): void {
  const outcome = outcomes.findLast((candidate) => candidate.evidenceRange !== null);
  const range = outcome?.evidenceRange;
  if (outcome !== undefined && range !== null && range !== undefined) {
    outcome.evidenceRange = {
      ...range,
      consoleEnd: session.consoleMessages.length,
      pageErrorEnd: session.pageErrors.length,
    };
  }
}

export function sessionForEvidence(session: SessionCounts, outcomes: readonly CaptureOutcome[]): SessionCounts {
  const consoleMessages = consoleForEvidence(session.consoleMessages, outcomes);
  return {
    requests: session.requests,
    consoleMessages,
    consoleLines: consoleMessages.map((message) => message.line),
    pageErrors: pageErrorsForEvidence(session.pageErrors, outcomes),
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

function printMapBlock(opts: Args, entries: MapEntry[] | null, error: string | null): void {
  // Gate on whether the map actually RAN on this page (multi-tab: --map targets one page). A null
  // result + null error means it didn't run here.
  if (entries === null && error === null) {
    return;
  }
  if (error !== null) {
    print(`\n--- MAP (${opts.mapSelector}) ---`);
    print(`  MAP capture failed: ${error}`);
    return;
  }
  const list = entries ?? [];
  const fallbackCount = list.filter((entry) => entry.source === "dom").length;
  print(`\n--- MAP (${list.length} element(s), ${fallbackCount} DOM fallback(s)) ---`);
  for (const e of list.slice(0, ARIA_MAX_LINES)) {
    const name = e.name.length > MAP_NAME_MAX_LENGTH ? `${e.name.slice(0, MAP_NAME_MAX_LENGTH - 1)}…` : e.name;
    print(`  ${e.role}  "${name}"  →  ${e.selector}  [${e.source}]`);
  }
  if (list.length > ARIA_MAX_LINES) {
    print(`  … +${list.length - ARIA_MAX_LINES} more — scope with --map <selector>`);
  }
  // Two recurring foot-guns worth reprinting where the selectors are chosen: engine-mixing + virtual rows.
  print("  NOTE: one selector engine per target — never concatenate a CSS selector with a role= selector.");
  print("  NOTE: a virtualized/composite row often needs --jsclick (raw click); role= locators flake.");
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

export function printCaptureLog(session: SessionCounts, failed: CapturedRequest[], viteChurn: readonly CapturedRequest[] = []): void {
  if (failed.length > 0) {
    print("\n--- failed requests ---");
    printRequestLines(failed);
  }
  // Printed, never counted against the run — see isViteDepChurn.
  if (viteChurn.length > 0) {
    print(`\n--- vite dep-optimizer churn (${viteChurn.length}, NOT a failure — cold-stage re-bundle aborts, re-requested and served) ---`);
    printRequestLines(viteChurn);
  }
  if (session.consoleLines.length > 0) {
    const selected = selectConsoleMessagesForReport(session.consoleMessages);
    print("\n--- console ---");
    if (selected.omitted > 0) {
      print(`  … ${selected.omitted} message(s) omitted — errors/warnings prioritized; use --json for the complete structured log`);
    }
    for (const message of selected.messages) {
      print(`  ${message.line}`);
    }
  }
  if (session.pageErrors.length > 0) {
    print("\n--- page errors ---");
    for (const e of session.pageErrors) {
      print(e);
    }
  }
}

function printCssCensus(outcome: CaptureOutcome): void {
  const evidence = outcome.deadCssEvidence;
  if (evidence === null) {
    return;
  }
  const drain = evidence.drain === null ? "unavailable" : `${evidence.drain.completedGeneration}/${evidence.drain.requestedGeneration}`;
  print(
    `\n--- CSS CENSUS sheets=${evidence.sheets} readable=${evidence.readableSheets} rules=${evidence.rules} defined=${evidence.defined} used=${evidence.used} unreadable=${evidence.unreadable.length} drain=${drain} ---`,
  );
  for (const sheet of evidence.unreadable) {
    print(`  INSTRUMENT ERROR unreadable stylesheet ${sheet.href ?? "(inline)"}: ${sheet.error}`);
  }
}

function printCssFindings(outcome: CaptureOutcome): void {
  printCssCensus(outcome);
  if (outcome.deadCss.length > 0) {
    print("\n--- DEADCSS (class tokens with no matching CSS rule) ---");
    for (const d of outcome.deadCss.slice(0, CSS_FINDINGS_CAP)) {
      print(`  ${d.token} (×${d.count})`);
    }
    if (outcome.deadCss.length > CSS_FINDINGS_CAP) {
      print(`  … +${outcome.deadCss.length - CSS_FINDINGS_CAP} more`);
    }
  }
  if (outcome.emptyCss.length > 0) {
    // The selector compiled but the browser threw away every declaration — the value
    // was invalid CSS. Canonical case: Tailwind v3 var syntax `w-[--foo]` compiling to
    // `width: --foo` (no var()) under v4; the v4 form is `w-(--foo)`. Invisible to the
    // dead-token scan above because the RULE exists.
    print("\n--- EMPTYCSS (rules whose declarations the browser dropped — invalid values) ---");
    for (const sel of outcome.emptyCss.slice(0, CSS_FINDINGS_CAP)) {
      print(`  ${sel}`);
    }
    if (outcome.emptyCss.length > CSS_FINDINGS_CAP) {
      print(`  … +${outcome.emptyCss.length - CSS_FINDINGS_CAP} more`);
    }
  }
}

function printCascadeReceipt(receipt: CssEvidenceReceipt | null): void {
  if (receipt === null) {
    return;
  }
  print(`\n--- CSS CASCADE (${receipt.cascade.length} query, ${receipt.repositoryDeclarations} repository declarations) ---`);
  if (receipt.error !== null) {
    print(`  INSTRUMENT ERROR: ${receipt.error}`);
  }
  for (const query of receipt.cascade) {
    if (query.status === "instrument-error") {
      print(`  ${query.selector} ${query.property}: INSTRUMENT ERROR — ${query.error}`);
      continue;
    }
    print(`  ${query.selector} ${query.property} = ${query.computedValue}${query.computedDefault ? " [computed default]" : ""}`);
    for (const declaration of query.declarations.slice(0, CSS_FINDINGS_CAP)) {
      print(
        `    ${declaration.state.padEnd(CASCADE_STATE_PAD)} ${declaration.source.padEnd(CASCADE_SOURCE_PAD)} ${declaration.selector ?? "(inline/dynamic)"}  ${declaration.value}`,
      );
    }
    if (query.declarations.length > CSS_FINDINGS_CAP) {
      print(`    … +${query.declarations.length - CSS_FINDINGS_CAP} declarations (use --json)`);
    }
  }
}

/** Where `--crop` actually landed — the PATH when a crop was written, else why it wasn't. The RESULT
 *  line carries this too (`crop=…`): a reviewer greps RESULT, and a crop reported only in the body read
 *  as a no-op (2026-08-16, an audit believed --crop did nothing). One derivation, two printers. */
export function cropOutcome(opts: Args, ctx: ReportCtx): string | null {
  if (opts.crop === null) {
    return null;
  }
  if (!CROP_RE.test(opts.crop)) {
    return `IGNORED — expected WxH+X+Y, got "${opts.crop}"`;
  }
  if (!ctx.produceShot) {
    return "IGNORED — needs a shot (drop --no-shot/--text)";
  }
  if (opts.shotOf !== null) {
    return "IGNORED — mutually exclusive with --shot-of";
  }
  return ctx.out.replace(PNG_EXT_RE, "-crop.png");
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
  printMapBlock(opts, outcome.mapResult, outcome.mapError);
  printAssertionBlock(outcome.assertions);
  printCssFindings(outcome);
  printCascadeReceipt(outcome.cssEvidence);
}
