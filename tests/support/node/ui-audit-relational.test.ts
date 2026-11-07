// A silent proof is only as true as this read: each cause of silence must fail on the row another cause leaves.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RulePopulationAccounting } from "@orb/tooling/ui-audit";
import { afterAll, beforeAll } from "vitest";
import { expect, test } from "./fixtures.ts";
import type { RelationalPopulationReport, SilentDisposition } from "./ui-audit-relational.ts";
import { expectPopulation, readAuditReport } from "./ui-audit-relational.ts";

let dir = "";
let filed = 0;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "ui-audit-relational-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

function row(over: Partial<RulePopulationAccounting>): RulePopulationAccounting {
  return { candidates: 1, judged: 0, affected: 0, populations: 0, emitted: 0, withheld: {}, excluded: {}, collapsed: {}, ...over };
}

/** A report filed the way a run files one and read through the run's door. `null` is a run whose accounting omits
 *  the rule; `"unaccounted"` is a report with no accounting at all. */
async function report(accounting: RulePopulationAccounting | null | "unaccounted", fired = false): Promise<RelationalPopulationReport> {
  filed += 1;
  const path = join(dir, `report-${String(filed)}.json`);
  const populationAccounting = accounting === null ? {} : { contrast: accounting };
  await writeFile(path, JSON.stringify({ findings: fired ? [{ rule: "contrast" }] : [], ...(accounting === "unaccounted" ? {} : { populationAccounting }) }));
  return await readAuditReport(`report ${path}`);
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
])("the %s disposition reads its own row", async ([, disposition, accounting]) => {
  const filedReport = await report(accounting);
  expect(() => expectPopulation(filedReport, "contrast", disposition)).not.toThrow();
});

test.for<readonly [string, SilentDisposition, RulePopulationAccounting | null | "unaccounted"]>([
  ["a judged claim on a rule that judged nothing", { kind: "judged" }, NO_CANDIDATE],
  ["a judged claim where every judged subject fired", { kind: "judged" }, row({ judged: 1, affected: 1, populations: 1, emitted: 1 })],
  ["a judged claim beside a withheld subject", { kind: "judged" }, row({ candidates: 2, judged: 1, withheld: { unresolved: 1 } })],
  ["an excluded claim on a withheld subject", { kind: "excluded", reason: "reason" }, WITHHELD],
  ["a withheld claim on an excluded subject", { kind: "withheld", reason: "reason" }, EXCLUDED],
  ["an exclusion under another reason", { kind: "excluded", reason: "other" }, EXCLUDED],
  ["a no-candidate claim on a judged rule", { kind: "no-candidate" }, JUDGED_CLEAN],
  ["a no-population claim on a rule with a row", { kind: "no-population" }, NO_CANDIDATE],
  ["a no-population claim on a report with no accounting", { kind: "no-population" }, "unaccounted"],
  ["a judged claim on a rule with no row", { kind: "judged" }, null],
])("%s is refused", async ([, disposition, accounting]) => {
  const filedReport = await report(accounting);
  expect(() => expectPopulation(filedReport, "contrast", disposition)).toThrow(NO_DISPOSITION_MATCH);
});

test("a silent rule that filed a finding is refused, unless the run's other subject fires by design", async () => {
  const firing = await report(row({ judged: 2, affected: 1, populations: 1, emitted: 1 }), true);
  expect(() => expectPopulation(firing, "contrast", { kind: "judged" })).toThrow(SILENCE_BROKEN);
  expect(() => expectPopulation(firing, "contrast", { kind: "judged" }, true)).not.toThrow();
});

test.for<readonly [string, RulePopulationAccounting]>([
  ["judged clean", row({ candidates: 2, judged: 2, affected: 1, populations: 1, emitted: 1 })],
  ["withheld", row({ candidates: 2, judged: 1, affected: 1, populations: 1, emitted: 1, withheld: { unresolved: 1 } })],
  ["excluded", row({ candidates: 2, judged: 1, affected: 1, populations: 1, emitted: 1, excluded: { art: 1 } })],
])("beside a firing subject, a no-candidate claim on a subject %s is refused", async ([, accounting]) => {
  const filedReport = await report(accounting, true);
  expect(() => expectPopulation(filedReport, "contrast", { kind: "no-candidate" }, true)).toThrow(NO_DISPOSITION_MATCH);
});

test("beside a firing subject, no-candidate holds when the fired subject is the whole population", async () => {
  const onlyFired = await report(row({ judged: 1, affected: 1, populations: 1, emitted: 1 }), true);
  expect(() => expectPopulation(onlyFired, "contrast", { kind: "no-candidate" }, true)).not.toThrow();
});
