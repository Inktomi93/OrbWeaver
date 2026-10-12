// Reviewed grants: tests-raw-package-reach — a strict-tree test file and the raw `#<package>/*` specifiers it reached when
// raw reaches became grant-gated (Core-0-Architecture-and-Structure.md §5). The legacy folder reaches raw without a grant.
// Delete a specifier when its test moves to the package's public entry; central liveness reds a specifier the test drops.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

const POLICY = "tests-raw-package-reach";

const ROWS: Readonly<Record<string, readonly string[]>> = {
  "tests/e2e/event-sequence.spec.ts": ["#client/state/active-chat-store.ts"],
  "tests/e2e/live-parity-plus-capstone.spec.ts": ["#ui/lib/action-names.ts"],
  "tests/e2e/support/chat-room.ts": ["#client/lib/row-qualifiers.ts"],
  "tests/tooling/motion-audit/ops/matrix-contract.test.ts": ["#client/lib/appearance-carrier-manifest.ts"],
  "tests/tooling/snap/ops/matrix-contract.test.ts": ["#client/lib/appearance-carrier-manifest.ts"],
  "tests/tooling/snap/ops/session-matrix.suite.int.test.ts": ["#client/lib/appearance-carrier-manifest.ts"],
  "tests/tooling/ui-audit/ops/walker/target-identity.test.ts": ["#ui/lib/variant-attrs.ts"],
};

/** One grant per (test file, raw specifier). The operation is the gate's `raw-reach:<specifier>` token. */
export const REVIEWED_GRANTS_TESTS_RAW_PACKAGE_REACH: readonly ReviewedGateGrant[] = Object.entries(ROWS).flatMap(([subject, specifiers]) =>
  specifiers.map((specifier) => ({
    id: `${POLICY}:${subject}:${specifier}`,
    policyId: POLICY,
    subject,
    operation: `raw-reach:${specifier}`,
    why: `${subject} reached ${specifier} through the root imports map when raw reaches became grant-gated; it is baselined debt, not a reviewed need for the internal file.`,
    endsWhen: `${subject} imports what it needs through the package's public entry or testing door, or the owning layer exports it there; this row then consumes nothing and reds stale.`,
  })),
);
