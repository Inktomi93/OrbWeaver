// The derived per-arm SUMMARY lines and the CSS report blocks, moved out of report.ts to hold the
// 450-line cap: DISPLAY-ONLY derivations over evidence the arms already emitted (contrast/assert/map),
// plus the dead/empty-CSS census and cascade-declaration printers.
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { CssEvidenceReceipt } from "../contract/cascade.ts";
import type { ContrastOutcome } from "../contract/contrast.ts";
import type { AssertionOutcome, CaptureOutcome } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

// Cap on DEADCSS/EMPTYCSS lines echoed (the counts always print in full).
const CSS_FINDINGS_CAP = 15;
const CASCADE_STATE_PAD = 10;
const CASCADE_SOURCE_PAD = 18;

const RATIO_PATTERN = /(\d+(?:\.\d+)?):1/u;

/** The worst measured contrast ratio in a run, read off the arm's own printed rows.
 *
 *  A DISPLAY-ONLY derivation over evidence the contrast arm already emitted (`ops/arms/contrast.ts` owns
 *  the threshold and the exit vote; this only summarizes). Rows that carry no ratio — SKIPPED, NOT FOUND,
 *  OFF-SCREEN, OCCLUDED — are counted as no-verdict rather than folded into a number, because a refusal
 *  is not a passing measurement. */
function contrastSummary(contrasts: readonly ContrastOutcome[]): string {
  const ratios = contrasts.map((row) => Number(RATIO_PATTERN.exec(row.line)?.[1] ?? Number.NaN)).filter((value) => Number.isFinite(value));
  const worst = ratios.length === 0 ? "none-measured" : `${Math.min(...ratios).toFixed(2)}:1`;
  return `checked=${ratios.length} failed=${contrasts.filter((row) => row.failed).length} no-verdict=${contrasts.length - ratios.length} worst=${worst}`;
}

/** `no-match=` is the assertion class an operator most often causes and most often misreads as an app
 *  defect: the selector matched nothing at all.
 *
 *  It is counted over EVERY row rather than only the failed ones, because a zero population is not one
 *  verdict class. For `--expect-text`/`--expect-focus`/`--expect-no-overflow` nothing to read means the
 *  instrument could not answer — a REFUSAL (exit 2, ops/arms/assert.ts) — while `--expect-visible` and
 *  `--expect-count` are asking about the population itself and a zero IS their answer. Both spellings of
 *  "nothing matched" are recognized here, so the count stays right on either side of that split and the
 *  reader is told which of the two shapes they are looking at without opening the arm's rows. */
const NO_MATCH_PATTERN = /: (?:FAIL no (?:rendered|attached) match|NO[- ]MATCH)/iu;

function assertionSummary(assertions: readonly AssertionOutcome[]): string {
  const failed = assertions.filter((row) => row.failed);
  const noMatch = assertions.filter((row) => NO_MATCH_PATTERN.test(row.line)).length;
  return `passed=${assertions.length - failed.length} failed=${failed.length} no-match=${noMatch}`;
}

/** ONE DERIVED LINE PER ACTIVE ARM, at the top of the end card (#1345).
 *
 *  The RESULT line carries ~40 tokens and answers every axis; it does not answer "so what did the arm I
 *  asked for find". These lines do, in the arm's own vocabulary, before the reader has to parse anything.
 *  An arm that produced NO rows prints nothing — the RESULT line's `<arm>=off` already says that, and a
 *  zero row here would read as a measured zero. */
export function printArmSummaries(outcomes: readonly CaptureOutcome[]): void {
  const evals = outcomes.flatMap((outcome) => outcome.evalResults);
  const contrasts = outcomes.flatMap((outcome) => outcome.contrastResults);
  const assertions = outcomes.flatMap((outcome) => outcome.assertions);
  const controls = outcomes.flatMap((outcome) => outcome.mapResult ?? []);
  if (evals.length > 0) {
    print(`SUMMARY eval values=${evals.length} errors=${evals.filter((row) => row.failed).length}`);
  }
  if (contrasts.length > 0) {
    print(`SUMMARY contrast ${contrastSummary(contrasts)}`);
  }
  if (assertions.length > 0) {
    print(`SUMMARY assert ${assertionSummary(assertions)}`);
  }
  if (controls.length > 0) {
    const domOnly = controls.filter((entry) => entry.source === "dom").length;
    print(
      `SUMMARY map controls=${controls.length} no-semantic-identity=${domOnly} actionable=${controls.filter((entry) => entry.actionability === "actionable").length}`,
    );
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

export function printCssFindings(outcome: CaptureOutcome): void {
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

export function printCascadeReceipt(receipt: CssEvidenceReceipt | null): void {
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
