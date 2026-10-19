// The PERMANENT PIN for `caught-failure-ownership` on the real tree. Conformance proves the MATCHER against
// synthetic mini-projects; this proves what it structurally cannot:
//
//   MARKER HYGIENE ON THE REAL TREE. `caught-failure-ownership` green on its own proves nothing about its
//   waivers: malformed / unknown / stale / dead-position / over-broad / duplicate markers are the
//   CENTRAL ordinary-waiver engine's verdict, delivered as `authority.authorityAlarms`, and they are
//   asserted empty for this policy. The run must also be a verdict: no tool error, a successful owner, and a
//   population that is the real corpus rather than a handful of files.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { beforeEach, vi } from "vitest";
import { gate as caughtFailureOwnership } from "../../../../tooling/src/verify/gates/caught-failure-ownership.ts";
import { projectCtx, runPolicyPass } from "../../../../tooling/src/verify/index.ts";
import { nativeTypeFactOptions } from "../../../../tooling/src/verify/lib/project-context.ts";
import { nativeInventoryFixture } from "../../floor/compiler/native-inventory-fixture.ts";

// Composition/verdict assertions borrow an actual native snapshot; this process supplies no current-execution receipt.
beforeEach(async () => {
  const inventoryFactory = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
  const producer = vi.spyOn(inventoryFactory, "createSemanticInventory").mockImplementation(nativeInventoryFixture);
  return (): void => {
    producer.mockRestore();
  };
});

const GATE = "caught-failure-ownership";
/** A real run admits thousands of files; a broken POPULATION admits a handful. */
const MIN_SCANNED_FILES = 2000;

test("the real-tree run is a verdict, and no waiver is stale or over-broad", { timeout: 600_000 }, ({ repoRoot }) => {
  const context = projectCtx(repoRoot);
  const result = runPolicyPass({
    knownPolicies: [caughtFailureOwnership],
    policies: [caughtFailureOwnership],
    root: repoRoot,
    project: context.project,
    ...nativeTypeFactOptions(context),
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.toolErrors, "a tool error means the run is not a verdict").toEqual([]);
  expect(result.factErrors).toEqual([]);

  const owner = result.policies.find((policy) => policy.id === GATE);
  expect(owner, `${GATE} must be loaded`).toBeDefined();
  expect(owner?.owner.status, "an incomplete owner withholds reconciliation, so its zero proves nothing").toBe("success");
  expect(owner?.population.effectiveSourcePaths.length ?? 0).toBeGreaterThan(MIN_SCANNED_FILES);
  expect(owner?.population.effectiveSourcePaths.some((path) => path.startsWith("packages/inference/src/"))).toBe(true);

  // A stale, dead-position, over-broad or duplicate marker is an ALARM here, and an alarm is exactly the shape
  // a bulk marker translation fails in.
  expect(result.authority.authorityAlarms.filter((alarm) => alarm.policyId === GATE)).toEqual([]);
  expect(result.waiverCarrierRefusals, "a refused carrier is a skipped population, not a clean one").toEqual([]);
});
