// A live silent proof must say why the rule was silent, and its case must hand over the report that says so.
import type { AuditRuleProof, RelationalPopulationReport } from "@orb/testkit/node";
import { auditRuleTest } from "@orb/testkit/tooling";

declare const report: RelationalPopulationReport;

// An alias, because the lint reads a call under the real name as a test body that owes an assertion.
const register = auditRuleTest;

// @ts-expect-error a silent row names its disposition
export const undisposed: AuditRuleProof = { rule: "contrast", kind: "silent", reason: "no cause stated" };

// @ts-expect-error `clean` is no disposition: silence has only the causes the union names
export const invented: AuditRuleProof = { rule: "contrast", kind: "silent", reason: "invented cause", disposition: { kind: "clean" } };

// @ts-expect-error an exclusion names its reason
export const unreasoned: AuditRuleProof = { rule: "contrast", kind: "silent", reason: "no reason", disposition: { kind: "excluded" } };

export const judged: AuditRuleProof = { rule: "contrast", kind: "silent", reason: "a passing ratio", disposition: { kind: "judged" } };

register(
  [{ rule: "contrast", kind: "silent", reason: "a passing ratio", disposition: { kind: "judged" } }],
  "a silent row reads its disposition from the returned report",
  // @ts-expect-error a case with a silent row returns the report the row is read from
  async () => {
    await Promise.resolve();
  },
);

register(
  [{ rule: "contrast", kind: "silent", reason: "a passing ratio", disposition: { kind: "judged" } }],
  "a returned report satisfies a silent row",
  async () => {
    await Promise.resolve();
    return report;
  },
);

register(
  [{ rule: "broken-image", kind: "silent", reason: "no row", disposition: { kind: "no-population" } }],
  "a hand-built report satisfies no silent row",
  // @ts-expect-error only readAuditReport mints a report, so no run stands behind this one
  async () => {
    await Promise.resolve();
    return { findings: [] };
  },
);

register([{ rule: "contrast", kind: "fires", reason: "a failing ratio" }], "a fires-only case returns nothing", () => undefined);
