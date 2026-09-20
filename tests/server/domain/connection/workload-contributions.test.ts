// Contribution test: `refresh-model-catalog`. The lane's shape is the behaviour: it refreshes the ONE
// provider whose catalog is keyless (`openrouter`) and reports `agentSdkModels: null` BY DESIGN — the daemon
// catalog needs a per-user `claude-sub` credential, which a scheduled workload with no principal does not
// have, so a 0 there would claim an empty catalog was measured. The abort signal must reach the verb (a
// sweep that drops it cannot be cancelled), and a failed refresh must FAIL the row rather than report a
// silent empty catalog.

import type { WorkloadRunContext } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ConnectionWorkloadDeps } from "@orb/server/domain/connection";
import { createConnectionWorkloadContributions } from "@orb/server/domain/connection";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const T0 = 1_700_000_000_000;
// A catalog refresh is deployment-wide (bulk-only): the row carries no owner.
const ctx: WorkloadRunContext = { userId: castId<UserId>("system"), ownerId: null, now: () => T0 };

interface Call {
  readonly providerId: string;
  readonly signal: AbortSignal | undefined;
}

/** The contribution over a recording `refreshCatalog` — the real deps shape, no cast. */
function build(refresh: ConnectionWorkloadDeps["connection"]["refreshCatalog"]): {
  readonly contribution: ReturnType<typeof createConnectionWorkloadContributions>[0];
  readonly calls: Call[];
  readonly reports: string[];
} {
  const calls: Call[] = [];
  const reports: string[] = [];
  const [contribution] = createConnectionWorkloadContributions({
    connection: {
      refreshCatalog: (params) => {
        calls.push({ providerId: params.providerId, signal: params.signal });
        return refresh(params);
      },
    },
  });
  return { contribution, calls, reports };
}

const run = async (
  built: ReturnType<typeof build>,
  signal: AbortSignal = new AbortController().signal,
): Promise<Awaited<ReturnType<ReturnType<typeof createConnectionWorkloadContributions>[0]["run"]>>> =>
  built.contribution.run(
    ctx,
    {},
    (progress): void => {
      built.reports.push(progress.message ?? "");
    },
    signal,
  );

describe("refresh-model-catalog contribution", () => {
  test("refreshes the keyless OpenRouter catalog and projects its count, with the daemon lane null BY DESIGN", async () => {
    const built = build(() => Promise.resolve({ models: 99 }));
    const result = await run(built);
    expect(result).toEqual({ models: 99, agentSdkModels: null });
    expect(built.calls.map((call) => call.providerId)).toEqual(["openrouter"]);
    expect(built.reports.at(0)).toContain("OpenRouter");
  });

  test("the run's abort signal reaches the verb — a sweep that dropped it could not be cancelled", async () => {
    const built = build(() => Promise.resolve({ models: 1 }));
    const controller = new AbortController();
    await run(built, controller.signal);
    expect(built.calls.at(0)?.signal).toBe(controller.signal);
  });

  test("a refresh that reports no measurable count passes `null` through (null ≠ 0, a real empty catalog)", async () => {
    const built = build(() => Promise.resolve({ models: null }));
    expect(await run(built)).toEqual({ models: null, agentSdkModels: null });
  });

  test("a FAILED refresh fails the run — the row is a real failure, not a silent empty refresh", async () => {
    const built = build(() => Promise.reject(new Error("offline")));
    await expect(run(built)).rejects.toThrow("offline");
  });

  test("declares the sweep lane + idempotent-restart resume policy", () => {
    const built = build(() => Promise.resolve({ models: 0 }));
    expect(built.contribution.kind).toBe("refresh-model-catalog");
    expect(built.contribution.lane).toBe("sweep");
    expect(built.contribution.resume).toBe("idempotent-restart");
  });
});
