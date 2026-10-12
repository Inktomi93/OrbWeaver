// The budget split for tests-raw-package-reach on the real tree: each grant's subject is a test file, so a grant
// counts toward the application part exactly when the application subject reader admits that file.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { gate } from "../../../../tooling/src/verify/gates/tests-raw-package-reach.ts";
import { readApplicationSubjects } from "../../../../tooling/src/verify/lib/application-programs.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { WAIVER_BUDGET } from "../../../../tooling/src/verify/lib/waiver-budget.ts";
import { scaledBudget } from "../../_load-budget.ts";

test("the application part counts the grants on application subjects and the implementation part the rest", { timeout: scaledBudget(110_000) }, async ({
  repoRoot,
}) => {
  const subjects = new Set((await readApplicationSubjects(repoRoot)).subjects);
  const rows = REVIEWED_GRANTS.filter(({ policyId }) => policyId === gate.id);
  const application = rows.filter(({ subject }) => subjects.has(subject)).length;
  expect({ application: WAIVER_BUDGET.application[gate.id] ?? 0, implementation: WAIVER_BUDGET.implementation[gate.id] ?? 0 }).toEqual({
    application,
    implementation: rows.length - application,
  });
});
