// The pure captures: --aria snapshots, --eval execution (JSON-printed, both-ends-capped),
// the --expect-* assertion family, and the perf/__orb evidence read.
import { errorMessage } from "@orb/kit/error-message";
import type { Locator, Page } from "@playwright/test";
import type { Args, Assertion, AssertionOutcome, EvalOutcome, PerfEvidence } from "../contract/types.ts";
import { WAIT_SELECTOR_TIMEOUT_MS } from "../lib/budgets.ts";
import { CHURN_LINE, capEvalText, isContextChurn, wrapEvalExpr } from "../lib/eval-text.ts";
import { HTTP_URL_RE } from "../lib/out-names.ts";
import { overflowAssertionLine } from "../lib/overflow-line.ts";
import { probeOverflow } from "./overflow.ts";

interface AriaOutcome {
  readonly text: string | null;
  readonly error: string | null;
}

export async function captureAria(page: Page, opts: Args): Promise<AriaOutcome> {
  try {
    const root = page.locator(opts.ariaSelector).first();
    await root.waitFor({ state: "attached", timeout: WAIT_SELECTOR_TIMEOUT_MS });
    const ariaOpts: { depth?: number; boxes?: boolean } = { boxes: opts.ariaBoxes };
    if (opts.ariaDepth !== null) {
      ariaOpts.depth = opts.ariaDepth;
    }
    return { text: await root.ariaSnapshot(ariaOpts), error: null };
  } catch (e) {
    return { text: null, error: `ARIA capture failed for "${opts.ariaSelector}": ${errorMessage(e)}` };
  }
}

export async function captureEvals(page: Page, exprs: readonly string[]): Promise<EvalOutcome[]> {
  const results: EvalOutcome[] = [];
  for (const expr of exprs) {
    let text: string;
    let failed = false;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: evals are argv-ordered and independent — sequential to keep report order matching argv, same discipline as driveActions.
      const value: unknown = await page.evaluate(wrapEvalExpr(expr));
      text = value === undefined ? "undefined" : JSON.stringify(value, null, 2);
      text = capEvalText(text);
    } catch (e) {
      failed = true;
      const msg = errorMessage(e);
      text = isContextChurn(msg) ? `EVAL ERROR: ${msg}\n${CHURN_LINE}` : `EVAL ERROR: ${msg}`;
    }
    results.push({ expr, text, failed });
  }
  return results;
}

async function visibleLocators(locator: Locator, includeHidden: boolean): Promise<Locator[]> {
  const count = await locator.count();
  const candidates = Array.from({ length: count }, (_, index) => locator.nth(index));
  if (includeHidden) {
    return candidates;
  }
  const visible = await Promise.all(candidates.map((candidate) => candidate.isVisible()));
  return candidates.filter((_, index) => visible[index] === true);
}

function urlMatches(actual: string, expected: string): boolean {
  if (HTTP_URL_RE.test(expected)) {
    return actual === expected;
  }
  const url = new URL(actual);
  return `${url.pathname}${url.search}${url.hash}` === expected;
}

function assertUrl(page: Page, assertion: Extract<Assertion, { kind: "url" }>): AssertionOutcome {
  const actual = page.url();
  const pass = urlMatches(actual, assertion.expected);
  return { line: `ASSERT url ${JSON.stringify(assertion.expected)}: ${pass ? "PASS" : `FAIL actual=${JSON.stringify(actual)}`}`, failed: !pass };
}

function assertCount(assertion: Extract<Assertion, { kind: "count" }>, candidates: readonly Locator[], includeHidden: boolean): AssertionOutcome {
  const pass = candidates.length === assertion.expected;
  const scope = includeHidden ? "all DOM" : "rendered";
  return {
    line: `ASSERT count ${assertion.selector}: ${pass ? "PASS" : "FAIL"} actual=${candidates.length} expected=${assertion.expected} scope=${scope}`,
    failed: !pass,
  };
}

async function runMatchedAssertion(
  assertion: Exclude<Assertion, { kind: "url" | "visible" }>,
  candidates: readonly Locator[],
  includeHidden: boolean,
): Promise<AssertionOutcome> {
  if (assertion.kind === "count") {
    return assertCount(assertion, candidates, includeHidden);
  }
  const first = candidates[0];
  if (first === undefined) {
    return { line: `ASSERT ${assertion.kind} ${assertion.selector}: FAIL no ${includeHidden ? "attached" : "rendered"} match`, failed: true };
  }
  if (assertion.kind === "text") {
    const actual = (await first.textContent()) ?? "";
    const pass = actual.includes(assertion.expected);
    return {
      line: `ASSERT text ${assertion.selector}: ${pass ? "PASS" : `FAIL expected=${JSON.stringify(assertion.expected)} actual=${JSON.stringify(actual)}`}`,
      failed: !pass,
    };
  }
  if (assertion.kind === "focus") {
    const pass = await first.evaluate((element) => (element as unknown as { matches: (selector: string) => boolean }).matches(":focus"));
    return { line: `ASSERT focus ${assertion.selector}: ${pass ? "PASS" : "FAIL"}`, failed: !pass };
  }
  return overflowAssertionLine(assertion.selector, await probeOverflow(first));
}

async function runAssertion(page: Page, assertion: Assertion, includeHidden: boolean): Promise<AssertionOutcome> {
  if (assertion.kind === "url") {
    return assertUrl(page, assertion);
  }
  const locator = page.locator(assertion.selector);
  if (assertion.kind === "visible") {
    const pass = await locator
      .first()
      .isVisible()
      .catch(() => false);
    return { line: `ASSERT visible ${assertion.selector}: ${pass ? "PASS" : "FAIL"}`, failed: !pass };
  }
  return await runMatchedAssertion(assertion, await visibleLocators(locator, includeHidden), includeHidden);
}

export async function runAssertions(page: Page, assertions: readonly Assertion[], includeHidden: boolean): Promise<AssertionOutcome[]> {
  const outcomes: AssertionOutcome[] = [];
  for (const assertion of assertions) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: assertions preserve argv order and may read focus/state established by the preceding assertion target.
      outcomes.push(await runAssertion(page, assertion, includeHidden));
    } catch (error) {
      outcomes.push({ line: `ASSERT ${assertion.kind}: ERROR ${errorMessage(error)}`, failed: true });
    }
  }
  return outcomes;
}

export async function capturePerfEvidence(page: Page): Promise<PerfEvidence | null> {
  try {
    return (await page.evaluate(`(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      return {
        navigation: nav ? {
          domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
          loadMs: Math.round(nav.loadEventEnd),
          responseMs: Math.round(nav.responseEnd),
        } : null,
        orb: window.__orb ? window.__orb.snap() : null,
      };
    })()`)) as PerfEvidence;
  } catch {
    return null;
  }
}
