// A silent proof is only as true as this read: each cause of silence must fail on the row another cause leaves.
import type { RulePopulationAccounting } from "@orb/tooling/ui-audit";
import { expect, test } from "./fixtures.ts";
import type { RelationalPopulationReport, SilentDisposition } from "./ui-audit-relational.ts";
import { expectPopulation } from "./ui-audit-relational.ts";

function row(over: Partial<RulePopulationAccounting>): RulePopulationAccounting {
  return { candidates: 1, judged: 0, affected: 0, populations: 0, emitted: 0, withheld: {}, excluded: {}, collapsed: {}, ...over };
}

function report(accounting: RulePopulationAccounting | null, fired = false): RelationalPopulationReport {
  return { findings: fired ? [{ rule: "contrast" }] : [], ...(accounting === null ? {} : { populationAccounting: { contrast: accounting } }) };
}

const NO_DISPOSITION_MATCH = /is not \{/u;
const SILENCE_BROKEN = /was silent, so it files nothing/u;

const JUDGED_CLEAN = row({ judged: 1 });
const EXCLUDED = row({ excluded: { reason: 1 } });
const WITHHELD = row({ withheld: { reason: 1 } });
const NO_CANDIDATE = row({ candidates: 0 });

test.for<readonly [string, SilentDisposition, RulePopulationAccounting | null]>([
  ["judged clean", { kind: "judged" }, JUDGED_CLEAN],
  ["excluded", { kind: "excluded", reason: "reason" }, EXCLUDED],
  ["withheld", { kind: "withheld", reason: "reason" }, WITHHELD],
  ["no candidate", { kind: "no-candidate" }, NO_CANDIDATE],
  ["no population", { kind: "no-population" }, null],
])("the %s disposition reads its own row", ([, disposition, accounting]) => {
  expect(() => expectPopulation(report(accounting), "contrast", disposition)).not.toThrow();
});

test.for<readonly [string, SilentDisposition, RulePopulationAccounting | null]>([
  ["a judged claim on a rule that judged nothing", { kind: "judged" }, NO_CANDIDATE],
  ["a judged claim where every judged subject fired", { kind: "judged" }, row({ judged: 1, affected: 1, populations: 1, emitted: 1 })],
  ["an excluded claim on a withheld subject", { kind: "excluded", reason: "reason" }, WITHHELD],
  ["a withheld claim on an excluded subject", { kind: "withheld", reason: "reason" }, EXCLUDED],
  ["an exclusion under another reason", { kind: "excluded", reason: "other" }, EXCLUDED],
  ["a no-candidate claim on a judged rule", { kind: "no-candidate" }, JUDGED_CLEAN],
  ["a no-population claim on a rule with a row", { kind: "no-population" }, NO_CANDIDATE],
  ["a judged claim on a rule with no row", { kind: "judged" }, null],
])("%s is refused", ([, disposition, accounting]) => {
  expect(() => expectPopulation(report(accounting), "contrast", disposition)).toThrow(NO_DISPOSITION_MATCH);
});

test("a silent rule that filed a finding is refused, unless the run's other subject fires by design", () => {
  const firing = report(row({ judged: 2, affected: 1, populations: 1, emitted: 1 }), true);
  expect(() => expectPopulation(firing, "contrast", { kind: "judged" })).toThrow(SILENCE_BROKEN);
  expect(() => expectPopulation(firing, "contrast", { kind: "judged" }, true)).not.toThrow();
});

test("beside a firing subject, no-candidate means nothing else was judged clean", () => {
  const onlyFired = report(row({ candidates: 2, judged: 1, affected: 1, populations: 1, emitted: 1, excluded: { art: 1 } }), true);
  const judgedClean = report(row({ candidates: 2, judged: 2, affected: 1, populations: 1, emitted: 1 }), true);
  expect(() => expectPopulation(onlyFired, "contrast", { kind: "no-candidate" }, true)).not.toThrow();
  expect(() => expectPopulation(judgedClean, "contrast", { kind: "no-candidate" }, true)).toThrow(NO_DISPOSITION_MATCH);
});
