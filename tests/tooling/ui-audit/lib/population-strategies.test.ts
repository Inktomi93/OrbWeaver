// THE PERMANENT PIN for the walker's route TAG reaching the printed row from EVERY accounting builder
// that takes a census (#1808).
//
// `carried` exists so a census route cannot enter or leave a denominator invisibly (#1172). It was
// spread into `decisionPopulationFindings` alone, so a tag raised by a rung-2a or rung-3 census was
// silently dropped between the walker and the report — the exact blindness the tag was built to close,
// reproduced one layer up. Measured on `selection-idiom`'s new `heterogeneousRest` tag: the walker
// counted three cohorts judged against the smallest-delta fallback and the population row printed
// nothing at all. The file's own `withheldSubjectsOf` docstring had already named the class ("a
// conditional spread repeated three times is how the `carried` tag came to reach only one of them") and
// fixed only the subjects half.
//
// PLANTED CONTROL, BOTH DIRECTIONS: each builder is asserted with a census that HAS a route and with one
// that has none — deleting any single `...carriedOf(census)` spread turns exactly one of the three
// "carries" cases red, and the absent-route cases prove the fix does not mint an empty `carried()` on
// every row (the report prints the token only where a census has a route, ops/report.ts:195-198).
import { describe } from "vitest";
import type { Finding, RelationalCensusAccountingInput } from "../../../../tooling/src/ui-audit/contract/findings.ts";
import { accountedFindings, cappedRelationalFindings, decisionPopulationFindings } from "../../../../tooling/src/ui-audit/lib/population-strategies.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

interface Subject {
  readonly selector: string;
}

const SUBJECT: Subject = { selector: "#one" };

/** One judged candidate plus one excluded, so the row settles, and ONE candidate reached by a named
 *  route. `carried` sits outside the settlement arithmetic by construction, which is why it can be
 *  dropped without any assertion noticing. */
function census(): RelationalCensusAccountingInput {
  return { candidates: 2, judged: 1, withheld: {}, excluded: { notApplicable: 1 }, carried: { pseudo: 1 } };
}

/** The same census with NO route at all — the shape every rule without an alternate collection channel
 *  publishes, spelled by OMISSION because `exactOptionalPropertyTypes` refuses an explicit `undefined`. */
function routelessCensus(): RelationalCensusAccountingInput {
  return { candidates: 2, judged: 1, withheld: {}, excluded: { notApplicable: 1 } };
}

const NO_FINDING = (): Finding | null => null;

describe("the walker's carried tag reaches the printed row from every census-taking builder", () => {
  test("cappedRelationalFindings (rung 3) carries the route", () => {
    const { accounting } = cappedRelationalFindings("cohort-anatomy", [SUBJECT], NO_FINDING, census());
    expect(accounting.carried).toStrictEqual({ pseudo: 1 });
  });

  test("accountedFindings (rung 2a) carries the route", () => {
    const { accounting } = accountedFindings("selection-idiom", [SUBJECT], NO_FINDING, { census: census(), samplesAreJudged: true });
    expect(accounting.carried).toStrictEqual({ pseudo: 1 });
  });

  test("decisionPopulationFindings (rung 4) carries the route", () => {
    const { accounting } = decisionPopulationFindings("off-grid-text", [SUBJECT], NO_FINDING, {
      census: census(),
      decisionKey: (item) => item.selector,
    });
    expect(accounting.carried).toStrictEqual({ pseudo: 1 });
  });

  test("a census with NO route mints no carried key in any of the three — an empty carried() would read as a route that saw nothing", () => {
    const routeless = routelessCensus();
    expect(cappedRelationalFindings("cohort-anatomy", [SUBJECT], NO_FINDING, routeless).accounting.carried).toBeUndefined();
    expect(accountedFindings("selection-idiom", [SUBJECT], NO_FINDING, { census: routeless, samplesAreJudged: true }).accounting.carried).toBeUndefined();
    expect(
      decisionPopulationFindings("off-grid-text", [SUBJECT], NO_FINDING, { census: routeless, decisionKey: (item) => item.selector }).accounting.carried,
    ).toBeUndefined();
  });

  test("the tag is COPIED, never aliased — a later mutation of the walker census cannot rewrite a filed row", () => {
    const source = census();
    const { accounting } = accountedFindings("selection-idiom", [SUBJECT], NO_FINDING, { census: source, samplesAreJudged: true });
    (source.carried as Record<string, number>)["pseudo"] = 99;
    expect(accounting.carried).toStrictEqual({ pseudo: 1 });
  });
});
