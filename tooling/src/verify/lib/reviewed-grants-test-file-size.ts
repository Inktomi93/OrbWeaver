// Reviewed grants: test-file-size, the reviewed exception list. Each row is a test-tree file over the cap when the gate
// landed (docs/law/Spine-Testing.md §10). Delete a row when its file is split below the cap; central liveness reds a
// row whose file fits. A new file is split instead of taking a row.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

const POLICY = "test-file-size";

export const REVIEWED_GRANTS_TEST_FILE_SIZE: readonly ReviewedGateGrant[] = [
  "tests/tooling/_ct-stories.tsx",
  "tests/tooling/ast/index.test.ts",
  "tests/tooling/design-audit-walker.ct.tsx",
  "tests/tooling/snap/ops/run-bundle.suite.int.test.ts",
  "tests/tooling/tool-guard.int.test.ts",
  "tests/tooling/ui-audit/index.int.test.ts",
  "tests/tooling/ui-audit/index.test.ts",
  "tests/tooling/verify/gates/policy-soundness-family.suite.repo.int.test.ts",
  "tests/tooling/verify/lib/policy-pass.test.ts",
  "tests/tooling/verify/ops/policy-conformance.test.ts",
  "tests/tooling/verify/ops/run.int.test.ts",
].map((subject) => ({
  id: `${POLICY}:${subject}`,
  policyId: POLICY,
  subject,
  operation: "oversize",
  why: `${subject} was over the cap when the gate landed; it holds several concerns in one review unit.`,
  endsWhen:
    "the file is split by concern below the cap (burn-down: the monolith splits in docs/plans/test-mirror/design.md); this row then consumes nothing and reds stale.",
}));
