// Reviewed grants: dangling-ref-citations.
// Split from reviewed-grants.ts — see that file for the central home comment.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

export const REVIEWED_GRANTS_DANGLINGREFCITATIONS: readonly ReviewedGateGrant[] = [
      {
        id: "dangling-ref-citations:tooling-src-verify-gates-membership-fan-guard-ts",
        policyId: "dangling-ref-citations",
        subject: "tooling/src/verify/gates/membership-fan-guard.ts:10, 23",
        operation: "dangling-path-cite",
        why: "the gate was renamed or restructured during #1584; the regex-section proposal doc names the pre-conversion gate and line range as a historical citation",
        endsWhen:
          "the owning doc (PROPOSAL-sys.md) is repaired to repoint, strike, or rider this reference; the finding disappears and central zero-use reconciliation stales this row.",
      },
      {
        id: "dangling-ref-citations:tooling-src-verify-gates-user-bus-coverage-ts",
        policyId: "dangling-ref-citations",
        subject: "tooling/src/verify/gates/user-bus-coverage.ts",
        operation: "dangling-path-cite",
        why: "gate was renamed during #1584 conversion; the bus-pair review and census docs record the pre-conversion gate name as a point-in-time snapshot",
        endsWhen:
          "the owning docs (bus-pair-1584.md, uncovered-gate-conversion-census.md) are repaired to repoint, strike, or rider this reference; the finding disappears and central zero-use reconciliation stales this row.",
      },
      {
        id: "dangling-ref-citations:tooling-src-verify-cli-ts-structure",
        policyId: "dangling-ref-citations",
        subject: "tooling/src/verify/cli.ts structure",
        operation: "dangling-path-cite",
        why: "the backticked path includes a CLI subcommand suffix; tooling/src/verify/cli.ts exists but the complete slice does not resolve as a file path. The planner-cli integration review doc cites the invocation form",
        endsWhen:
          "the owning doc (planner-cli-integration.md) is repaired to repoint, strike, or rider this reference; the finding disappears and central zero-use reconciliation stales this row.",
      },
      {
        id: "dangling-ref-citations:tooling-src-verify-lib-section-defs-ts",
        policyId: "dangling-ref-citations",
        subject: "tooling/src/verify/lib/section-defs.ts",
        operation: "dangling-path-cite",
        why: "section-defs was restructured during #1584; the registry-family checkpoint review doc names the pre-restructure path as a point-in-time snapshot",
        endsWhen:
          "the owning doc (registry-family-1584-checkpoint.md) is repaired to repoint, strike, or rider this reference; the finding disappears and central zero-use reconciliation stales this row.",
      },
      {
        id: "dangling-ref-citations:tooling-src-verify-gates-tooling-shared-plumbing-ts",
        policyId: "dangling-ref-citations",
        subject: "tooling/src/verify/gates/tooling-shared-plumbing.ts",
        operation: "dangling-path-cite",
        why: "gate was renamed during #1584 conversion; the census doc records the pre-conversion gate name as a point-in-time snapshot",
        endsWhen:
          "the owning doc (uncovered-gate-conversion-census.md) is repaired to repoint, strike, or rider this reference; the finding disappears and central zero-use reconciliation stales this row.",
      },
      {
        id: "dangling-ref-citations:tooling-src-verify-gates-asset-refs-fk-coverage-ts",
        policyId: "dangling-ref-citations",
        subject: "tooling/src/verify/gates/asset-refs-fk-coverage.ts",
        operation: "dangling-path-cite",
        why: "gate was renamed during #1584 conversion; the census doc records the pre-conversion gate name as a point-in-time snapshot",
        endsWhen:
          "the owning doc (uncovered-gate-conversion-census.md) is repaired to repoint, strike, or rider this reference; the finding disappears and central zero-use reconciliation stales this row.",
      },
      {
        id: "dangling-ref-citations:tooling-src-verify-gates-automation-bus-coverage-ts",
        policyId: "dangling-ref-citations",
        subject: "tooling/src/verify/gates/automation-bus-coverage.ts",
        operation: "dangling-path-cite",
        why: "gate was renamed during #1584 conversion; the census doc records the pre-conversion gate name as a point-in-time snapshot",
        endsWhen:
          "the owning doc (uncovered-gate-conversion-census.md) is repaired to repoint, strike, or rider this reference; the finding disappears and central zero-use reconciliation stales this row.",
      },
      {
        id: "dangling-ref-citations:tooling-src-verify-gates-bus-coverage-ts",
        policyId: "dangling-ref-citations",
        subject: "tooling/src/verify/gates/bus-coverage.ts",
        operation: "dangling-path-cite",
        why: "gate was renamed during #1584 conversion; the census doc records the pre-conversion gate name as a point-in-time snapshot",
        endsWhen:
          "the owning doc (uncovered-gate-conversion-census.md) is repaired to repoint, strike, or rider this reference; the finding disappears and central zero-use reconciliation stales this row.",
      },
      {
        id: "dangling-ref-citations:tooling-src-verify-gates-domain-events-coverage-ts",
        policyId: "dangling-ref-citations",
        subject: "tooling/src/verify/gates/domain-events-coverage.ts",
        operation: "dangling-path-cite",
        why: "gate was renamed during #1584 conversion; the census doc records the pre-conversion gate name as a point-in-time snapshot",
        endsWhen:
          "the owning doc (uncovered-gate-conversion-census.md) is repaired to repoint, strike, or rider this reference; the finding disappears and central zero-use reconciliation stales this row.",
      },
      {
        id: "dangling-ref-citations:tooling-src-verify-gates-monotonic-tests-ts",
        policyId: "dangling-ref-citations",
        subject: "tooling/src/verify/gates/monotonic-tests.ts",
        operation: "dangling-path-cite",
        why: "gate was deleted (monotonic-tests manifest removed #2217); the census doc records the pre-deletion gate name as a point-in-time snapshot",
        endsWhen:
          "the owning doc (uncovered-gate-conversion-census.md) is repaired to repoint, strike, or rider this reference; the finding disappears and central zero-use reconciliation stales this row.",
      },
      {
        id: "dangling-ref-citations:tooling-src-verify-gates-rpg-bus-coverage-ts",
        policyId: "dangling-ref-citations",
        subject: "tooling/src/verify/gates/rpg-bus-coverage.ts",
        operation: "dangling-path-cite",
        why: "gate was renamed during #1584 conversion; the census doc records the pre-conversion gate name as a point-in-time snapshot",
        endsWhen:
          "the owning doc (uncovered-gate-conversion-census.md) is repaired to repoint, strike, or rider this reference; the finding disappears and central zero-use reconciliation stales this row.",
      },
      {
        id: "dangling-ref-citations:tooling-src-verify-gates-finding-overload-provenance-ts",
        policyId: "dangling-ref-citations",
        subject: "tooling/src/verify/gates/finding-overload-provenance.ts",
        operation: "dangling-path-cite",
        why: "gate was renamed during #1584 conversion; the census doc records the pre-conversion gate name as a point-in-time snapshot",
        endsWhen:
          "the owning doc (uncovered-gate-conversion-census.md) is repaired to repoint, strike, or rider this reference; the finding disappears and central zero-use reconciliation stales this row.",
      },
      {
        id: "dangling-ref-citations:tooling-src-verify-ops-policy-conformance-ts-145-147",
        policyId: "dangling-ref-citations",
        subject: "tooling/src/verify/ops/policy-conformance.ts:145-147, ",
        operation: "dangling-path-cite",
        why: "the file exists but the backticked path includes a line-range suffix with a trailing comma-space; the review doc cites a historical line range that may have shifted",
        endsWhen:
          "the owning doc (v-wave-2026-09-13.md) is repaired to repoint, strike, or rider this reference; the finding disappears and central zero-use reconciliation stales this row.",
      },
      {
        id: "dangling-ref-citations:tooling-src-verify-lib-population-ts",
        policyId: "dangling-ref-citations",
        subject: "tooling/src/verify/lib/population.ts",
        operation: "dangling-path-cite",
        why: "population.ts was renamed to population-resolver.ts; the review doc names the pre-rename path as a point-in-time snapshot",
        endsWhen:
          "the owning doc (v-wave-2026-09-13.md) is repaired to repoint, strike, or rider this reference; the finding disappears and central zero-use reconciliation stales this row.",
      },

];
