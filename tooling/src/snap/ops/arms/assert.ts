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
import { EXIT } from "../../../_shared/exit-contract.ts";
import type { ArmArgs, ArmDef, ArmFactEmission, ArmFailureCounts, ArmNeeds, ArmPairInput } from "../../contract/arms.ts";
import type { SnapArmState } from "../../contract/run-facts.ts";
import type { Assertion, AssertionOutcome } from "../../contract/types.ts";
import { HTTP_URL_RE } from "../../lib/out-names.ts";
import { overflowAssertionLine } from "../../lib/overflow-line.ts";
import { consumeOptionalSelector } from "../flags-support.ts";
import { probeOverflow } from "../overflow.ts";
import { writeArmEvidenceFile } from "./evidence-file.ts";

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

/** A verdict about the app: PASS or FAIL, exit 0/1. */
function judged(line: string, failed: boolean): AssertionOutcome {
  return { line, failed, refused: false };
}

/** THE UNASKED REQUIREMENT (#1343). `text`/`focus`/`no-overflow` state something about a MATCHED element;
 *  with nothing matched there is no measurement to report, only a selector that found nothing. It printed
 *  `FAIL no rendered match` — exit 1, the same code as a real violation — so a mistyped selector read as a
 *  finding about the app and a reviewer could not tell the two apart. NO-MATCH is loud and exits 2.
 *  `--expect-visible` and `--expect-count` never come here: for them the empty population IS the answer. */
function noMatch(kind: Assertion["kind"], selector: string, includeHidden: boolean): AssertionOutcome {
  const population = includeHidden ? "attached to the DOM" : "rendered";
  const widen = includeHidden ? "" : " (--include-hidden widens the population to all attached elements)";
  // The overflow arm's own lines say `no-overflow` (lib/overflow-line.ts); a refusal that spelled its kind
  // differently from the verdict beside it would be a second vocabulary for one flag.
  const label = kind === "overflow" ? "no-overflow" : kind;
  return {
    line: `ASSERT ${label} ${selector}: NO-MATCH  nothing ${population} matches this selector${widen} — the requirement was never tested, so this run is not a verdict about it`,
    failed: true,
    refused: true,
  };
}

function assertUrl(page: Page, assertion: Extract<Assertion, { kind: "url" }>): AssertionOutcome {
  const actual = page.url();
  const pass = urlMatches(actual, assertion.expected);
  return judged(`ASSERT url ${JSON.stringify(assertion.expected)}: ${pass ? "PASS" : `FAIL actual=${JSON.stringify(actual)}`}`, !pass);
}

function assertCount(assertion: Extract<Assertion, { kind: "count" }>, candidates: readonly Locator[], includeHidden: boolean): AssertionOutcome {
  const pass = candidates.length === assertion.expected;
  const scope = includeHidden ? "all DOM" : "rendered";
  return judged(
    `ASSERT count ${assertion.selector}: ${pass ? "PASS" : "FAIL"} actual=${candidates.length} expected=${assertion.expected} scope=${scope}`,
    !pass,
  );
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
    return noMatch(assertion.kind, assertion.selector, includeHidden);
  }
  if (assertion.kind === "text") {
    const actual = (await first.textContent()) ?? "";
    const pass = actual.includes(assertion.expected);
    return judged(
      `ASSERT text ${assertion.selector}: ${pass ? "PASS" : `FAIL expected=${JSON.stringify(assertion.expected)} actual=${JSON.stringify(actual)}`}`,
      !pass,
    );
  }
  if (assertion.kind === "focus") {
    const pass = await first.evaluate((element) => {
      const matches = Reflect.get(element, "matches");
      return typeof matches === "function" && Reflect.apply(matches, element, [":focus"]) === true;
    });
    return judged(`ASSERT focus ${assertion.selector}: ${pass ? "PASS" : "FAIL"}`, !pass);
  }
  return overflowAssertionLine(assertion.selector, await probeOverflow(first));
}

async function runAssertion(page: Page, assertion: Assertion, includeHidden: boolean): Promise<AssertionOutcome> {
  if (assertion.kind === "url") {
    return assertUrl(page, assertion);
  }
  const locator = page.locator(assertion.selector);
  if (assertion.kind === "visible") {
    // THE WHOLE POPULATION, not `.first()` (#1509): a hidden duplicate ahead of a visible match made this
    // flag report FAIL about an element the user can see. `visibleLocators` is asked for the VISIBLE
    // population unconditionally — `--include-hidden` widens the other assertions' population, but for
    // this one visibility IS the question, so widening it would answer a different one.
    // @orb-waive caught-failure-ownership(visibleLocators): probe-whose-failure-is-its-return-value — a locator failure converts to an empty population and so to pass=false, which the very next line reports as ASSERT visible … FAIL. Ends if that FAIL line stops being printed/read.
    const matched = await visibleLocators(locator, false).catch((): Locator[] => []);
    const pass = matched.length > 0;
    // NEVER a NO-MATCH: an absent element is precisely the finding this flag exists to report.
    return judged(`ASSERT visible ${assertion.selector}: ${pass ? "PASS" : "FAIL"}`, !pass);
  }
  return await runMatchedAssertion(assertion, await visibleLocators(locator, includeHidden), includeHidden);
}

async function runAssertions(page: Page, assertions: readonly Assertion[], includeHidden: boolean): Promise<AssertionOutcome[]> {
  const outcomes: AssertionOutcome[] = [];
  for (const assertion of assertions) {
    // @orb-waive caught-failure-ownership(error): captured as an ERROR outcome line pushed into the returned outcomes array, which the caller counts as failed and reports. Ends if the outcomes array stops being read.
    try {
      outcomes.push(await runAssertion(page, assertion, includeHidden));
    } catch (error) {
      outcomes.push({ line: `ASSERT ${assertion.kind}: ERROR ${errorMessage(error)}`, failed: true, refused: false });
    }
  }
  return outcomes;
}

function assertionFailures({ outcomes }: ArmPairInput): number {
  return outcomes.reduce((count, outcome) => count + outcome.assertions.filter((entry) => entry.failed).length, 0);
}

/** Requirements this run never asked. Their own count, because they drive the EXIT, not the verdict. */
function assertionRefusals({ outcomes }: ArmPairInput): number {
  return outcomes.reduce((count, outcome) => count + outcome.assertions.filter((entry) => entry.refused).length, 0);
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
      group: "Assert",
      summary: "a rendered, visible element exists",
      handler: (a, rest, page): void => {
        a.assertions.push({ kind: "visible", selector: rest.shift() ?? "", page });
      },
    },
    {
      flag: "--expect-text",
      kind: "required-value",
      pageTargetable: true,
      group: "Assert",
      summary: "selector=text — rendered text contains the value",
      handler: (a, rest, page): void => {
        const value = splitLastEq(rest.shift() ?? "");
        a.assertions.push({ kind: "text", selector: value.head, expected: value.tail, page });
      },
    },
    {
      flag: "--expect-count",
      kind: "required-value",
      pageTargetable: true,
      group: "Assert",
      summary: "selector=N — exactly N rendered matches (virtualized lists count mounted rows)",
      handler: (a, rest, page): void => {
        const value = splitLastEq(rest.shift() ?? "");
        a.assertions.push({ kind: "count", selector: value.head, expected: Number(value.tail), page });
      },
    },
    {
      flag: "--expect-url",
      kind: "required-value",
      pageTargetable: true,
      group: "Assert",
      summary: "the final browser URL (only ever / or /login here)",
      handler: (a, rest, page): void => {
        a.assertions.push({ kind: "url", expected: rest.shift() ?? "", page });
      },
    },
    {
      flag: "--expect-no-overflow",
      kind: "optional-selector",
      pageTargetable: true,
      group: "Assert",
      summary: "scroll bounds fit client bounds and no descendant box exits the clip",
      handler: (a, rest, page): void => {
        a.assertions.push({ kind: "overflow", selector: consumeOptionalSelector(rest) ?? "html", page });
      },
    },
    {
      flag: "--expect-focus",
      kind: "required-value",
      pageTargetable: true,
      group: "Assert",
      summary: "the active element matches (pair with bare --key Tab walks)",
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
    // #1342: the ASSERT lines themselves. `assertion-fails=2` in the index said two requirements were unmet
    // and never said WHICH — the line a reviewer quotes ("the printed ASSERT line IS the receipt") had no
    // copy in the slot the review cites.
    evidence: async ({ outcomes }, slug): Promise<void> => {
      const rows = outcomes.flatMap((outcome) =>
        outcome.assertions.map((entry) => ({ page: outcome.pageIndex, line: entry.line, failed: entry.failed, refused: entry.refused })),
      );
      await writeArmEvidenceFile({
        arm: "assert",
        name: "assertions",
        slug,
        schema: "snap-assertions-v1",
        records: rows.length,
        completeness: "complete",
        completenessDetail: "every assertion this run ran, in argv order, with its printed line and whether it was a verdict or a NO-MATCH refusal",
        body: { v: 1, assertions: rows },
      });
    },
    facts: (input): readonly ArmFactEmission<"assert">[] => {
      const assertions = input.outcomes.reduce((count, outcome) => count + outcome.assertions.length, 0);
      const failures = assertionFailures(input);
      const refusals = assertionRefusals(input);
      let state: SnapArmState = "off";
      let detail: string | null = null;
      if (input.opts.assertions.length > 0) {
        state = failures > 0 ? "failed" : "passed";
      }
      if (refusals > 0) {
        // The fact says REFUSED, not failed: `assertion-fails` still counts these (they are unmet
        // requirements on the RESULT line, where the field order is a contract), but a reader asking the
        // fact "was this a verdict about the app?" gets no.
        state = "refused";
        detail = `${String(refusals)} of ${String(assertions)} assertion(s) matched nothing rendered and were never tested`;
      }
      return [
        {
          scope: aggregateScope(),
          data: { state, detail, assertions, failures },
        },
      ];
    },
    failures: (input): ArmFailureCounts => ({ assertions: assertionFailures(input) }),
    // A requirement that was never asked exits 2 whatever else the run found — the same posture the
    // Lighthouse refusal and the missing theme stamp take (ops/run.ts's two-ways-not-a-verdict note).
    exit: (input, code): number => (assertionRefusals(input) > 0 ? EXIT.toolError : code),
  },
} satisfies ArmDef<"assert">;
