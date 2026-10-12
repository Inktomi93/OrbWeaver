// The one row shape for `tests-raw-package-reach` grants: a test file and the raw specifiers it reaches.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

const POLICY = "tests-raw-package-reach";

/** One grant per (test file, raw specifier). The operation is the gate's `raw-reach:<specifier>` token. */
export function testsRawPackageReachGrants(rows: Readonly<Record<string, readonly string[]>>): readonly ReviewedGateGrant[] {
  return Object.entries(rows).flatMap(([subject, specifiers]) =>
    specifiers.map((specifier) => ({
      id: `${POLICY}:${subject}:${specifier}`,
      policyId: POLICY,
      subject,
      operation: `raw-reach:${specifier}`,
      why: `${subject} reached ${specifier} through the root imports map when raw reaches became grant-gated; it is baselined debt, not a reviewed need for the internal file.`,
      endsWhen: `${subject} imports what it needs through the package's public entry or testing door, or the owning layer exports it there; this row then consumes nothing and reds stale.`,
    })),
  );
}
