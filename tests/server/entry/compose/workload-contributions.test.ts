// entry/compose/workload-contributions — the ONE registry the workloads engine dispatches every background
// job through, and the home of the COMPLETENESS PIN that replaced the retired `runner-env` god-hub. The
// engine knows no domain: it looks a job up by kind and runs whatever this map returned. So a kind that is
// missing, doubled, or mis-keyed is not a type error at the point of use — it is a job that silently never
// runs, or one domain's params validator adjudicating another domain's job.
//
// `keyByKind` is the guard (missing → boot throws; duplicate → boot throws) and this file proves the
// ASSEMBLY it guards actually satisfies it on the real tree: every `WORKLOAD_KINDS` member is contributed
// exactly once, by a contribution whose own `kind` matches the key it was filed under. That last one is the
// mis-key arm — `Object.fromEntries` would happily file a contribution under a key its own `kind` disagrees
// with, and nothing downstream re-checks.
//
// The engine's actual dispatch (params validation, admission, the runner) is the workloads domain's and is
// tested there; what is asserted here is exactly what this seam decides — WHICH contributions exist.

import type { WorkloadKind } from "@orb/contracts/workloads";
import { WORKLOAD_KINDS } from "@orb/contracts/workloads";
import { describe } from "vitest";
import type { WorkloadContributionsDeps } from "../../../../packages/server/src/entry/compose/workload-contributions.ts";
import { buildWorkloadContributions } from "../../../../packages/server/src/entry/compose/workload-contributions.ts";
import { expect, test } from "../../../support/fixtures.ts";

/** Every contribution factory only CLOSES over its deps (the work happens when the engine runs a job), so a
 *  recursive no-op stand-in is enough to assemble the real registry — and it keeps this pin honest about
 *  what it covers: the registration, never the running. */
function inertDeps(): WorkloadContributionsDeps {
  const inert = (): undefined => undefined;
  const handler: ProxyHandler<object> = {
    // `then` must stay undefined or an `await` on this object would try to adopt it as a thenable.
    get: (_target, prop): unknown => (prop === "then" ? undefined : new Proxy(inert, handler)),
  };
  // @orb-waive no-test-fabrication(unknown): a recursive inert stand-in for the union of nine domains' contribution deps — the Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  // factories store their ops and this pin never runs a job.
  return new Proxy({}, handler) as unknown as WorkloadContributionsDeps;
}

describe("buildWorkloadContributions — the registry is exhaustive over WORKLOAD_KINDS", () => {
  test("every declared kind is contributed (a missing one is a job that silently never runs)", () => {
    const registry = buildWorkloadContributions(inertDeps());

    expect(Object.keys(registry).sort()).toStrictEqual([...WORKLOAD_KINDS].sort());
  });

  test("each contribution is filed under its OWN kind (a mis-key would hand one domain another's job)", () => {
    const registry = buildWorkloadContributions(inertDeps());

    for (const kind of WORKLOAD_KINDS) {
      expect(registry[kind]?.kind).toBe(kind);
    }
  });

  test("the reserved owner-less kind is present as an inert stub, not absent", () => {
    const registry = buildWorkloadContributions(inertDeps());

    // `reconcile-world-state` has no owning domain yet; workloads carries it so the exhaustive map stays
    // whole. If the stub is ever dropped, the completeness pin above turns red at BOOT, not here.
    expect(WORKLOAD_KINDS).toContain("reconcile-world-state" as WorkloadKind);
    expect(registry["reconcile-world-state" as WorkloadKind]).toBeDefined();
  });

  test("no kind is contributed twice (the duplicate arm of keyByKind never fires on the real assembly)", () => {
    // A duplicate would have thrown inside `buildWorkloadContributions`; reaching this line IS the receipt,
    // and the key count matching the declared count is the second half of it.
    const registry = buildWorkloadContributions(inertDeps());

    expect(Object.keys(registry)).toHaveLength(WORKLOAD_KINDS.length);
    expect(new Set(Object.keys(registry)).size).toBe(WORKLOAD_KINDS.length);
  });
});
