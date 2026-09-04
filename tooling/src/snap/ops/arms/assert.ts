// The `--expect-*` ARM: the assertion family — visible / text / count / url / focus / no-overflow. Every
// one is a REQUIREMENT the run states about the settled surface, so every failure is a verdict member.
// Split out of the former ops/evidence.ts by NATURE when the arm registry landed (contract/arms.ts); the
// aria, eval and perf halves that shared that file are now their own arms.
import { errorMessage } from "@orb/kit/error-message";
import type { Locator, Page } from "@playwright/test";
import { splitLastEq } from "../../../_shared/argv.ts";
import { aggregateScope } from "../../../_shared/artifact-scope.ts";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import type { ArmArgs, ArmDef, ArmFactEmission, ArmFailureCounts, ArmNeeds, ArmPairInput } from "../../contract/arms.ts";
import type { Assertion, AssertionOutcome } from "../../contract/types.ts";
import { HTTP_URL_RE } from "../../lib/out-names.ts";
import { overflowAssertionLine } from "../../lib/overflow-line.ts";
import { consumeOptionalSelector } from "../flags-support.ts";
import { probeOverflow } from "../overflow.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --expect-visible <selector>");

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
    const pass = await first.evaluate((element) => {
      const matches = Reflect.get(element, "matches");
      return typeof matches === "function" && Reflect.apply(matches, element, [":focus"]) === true;
    });
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
    // @orb-gate-ignore caught-failure-ownership(promise:isVisible): probe-whose-failure-is-its-return-value — a locator failure converts to pass=false, which the very next line reports as ASSERT visible … FAIL. Ends if that FAIL line stops being printed/read.
    const pass = await locator
      .first()
      .isVisible()
      .catch(() => false);
    return { line: `ASSERT visible ${assertion.selector}: ${pass ? "PASS" : "FAIL"}`, failed: !pass };
  }
  return await runMatchedAssertion(assertion, await visibleLocators(locator, includeHidden), includeHidden);
}

async function runAssertions(page: Page, assertions: readonly Assertion[], includeHidden: boolean): Promise<AssertionOutcome[]> {
  const outcomes: AssertionOutcome[] = [];
  for (const assertion of assertions) {
    // @orb-gate-ignore caught-failure-ownership(empty:error): captured as an ERROR outcome line pushed into the returned outcomes array, which the caller counts as failed and reports. Ends if the outcomes array stops being read.
    try {
      outcomes.push(await runAssertion(page, assertion, includeHidden));
    } catch (error) {
      outcomes.push({ line: `ASSERT ${assertion.kind}: ERROR ${errorMessage(error)}`, failed: true });
    }
  }
  return outcomes;
}

function assertionFailures({ outcomes }: ArmPairInput): number {
  return outcomes.reduce((count, outcome) => count + outcome.assertions.filter((entry) => entry.failed).length, 0);
}

/** Six flags, one queue. The value split differs per kind and each rule is load-bearing: `--expect-text`
 *  and `--expect-count` split on the LAST `=` (an attribute selector carries its own), `--expect-url`
 *  takes the whole token, and `--expect-no-overflow` defaults to `html` when no selector follows. */
export const ASSERT_ARM = {
  flags: [
    {
      flag: "--expect-visible",
      kind: "required-value",
      pageTargetable: true,
      handler: (a, rest, page): void => {
        a.assertions.push({ kind: "visible", selector: rest.shift() ?? "", page });
      },
    },
    {
      flag: "--expect-text",
      kind: "required-value",
      pageTargetable: true,
      handler: (a, rest, page): void => {
        const value = splitLastEq(rest.shift() ?? "");
        a.assertions.push({ kind: "text", selector: value.head, expected: value.tail, page });
      },
    },
    {
      flag: "--expect-count",
      kind: "required-value",
      pageTargetable: true,
      handler: (a, rest, page): void => {
        const value = splitLastEq(rest.shift() ?? "");
        a.assertions.push({ kind: "count", selector: value.head, expected: Number(value.tail), page });
      },
    },
    {
      flag: "--expect-url",
      kind: "required-value",
      pageTargetable: true,
      handler: (a, rest, page): void => {
        a.assertions.push({ kind: "url", expected: rest.shift() ?? "", page });
      },
    },
    {
      flag: "--expect-no-overflow",
      kind: "optional-selector",
      pageTargetable: true,
      handler: (a, rest, page): void => {
        a.assertions.push({ kind: "overflow", selector: consumeOptionalSelector(rest) ?? "html", page });
      },
    },
    {
      flag: "--expect-focus",
      kind: "required-value",
      pageTargetable: true,
      handler: (a, rest, page): void => {
        a.assertions.push({ kind: "focus", selector: rest.shift() ?? "", page });
      },
    },
  ],
  level: "call",
  needs: (): ArmNeeds => ({}),
  sessionCallBaseMs: (): null => null,
  defaults: (): Pick<ArmArgs, "assertions"> => ({ assertions: [] }),
  help: `  --expect-visible <selector>       require a rendered, visible element
  --expect-text <selector=text>     require rendered text to contain a value
  --expect-count <selector=N>       require N rendered matches
  --expect-url <url-or-path>        require the final URL
  --expect-no-overflow [selector]   scroll bounds must fit client bounds AND no descendant's box may
                                    exit the clip on any side (left/top too — scrollWidth cannot see
                                    a justify-end spill); a scrolling axis is not judged
  --expect-focus <selector>         require the active element to match`,
  result: {
    schema: "snap-arm-assert-v1",
    source: "Playwright locator assertions",
    lifetime: "settled page capture",
    enabled: (opts): boolean => opts.assertions.length > 0,
  },
  lifecycle: {
    at: "page",
    enabled: ({ opts, pageIndex }): boolean => opts.assertions.some((entry) => entry.page === pageIndex),
    run: async ({ page, opts, pageIndex, outcome }): Promise<void> => {
      outcome.assertions = await runAssertions(
        page,
        opts.assertions.filter((entry) => entry.page === pageIndex),
        opts.includeHidden,
      );
    },
    pairs: (input): readonly ResultPair[] => [["assertion-fails", assertionFailures(input)]],
    facts: (input): readonly ArmFactEmission<"assert">[] => {
      const assertions = input.outcomes.reduce((count, outcome) => count + outcome.assertions.length, 0);
      const failures = assertionFailures(input);
      let state: "off" | "failed" | "passed" = "off";
      if (input.opts.assertions.length > 0) {
        state = failures > 0 ? "failed" : "passed";
      }
      return [
        {
          scope: aggregateScope(),
          data: { state, detail: null, assertions, failures },
        },
      ];
    },
    failures: (input): ArmFailureCounts => ({ assertions: assertionFailures(input) }),
    exit: (_input, code): number => code,
  },
} satisfies ArmDef<"assert">;
