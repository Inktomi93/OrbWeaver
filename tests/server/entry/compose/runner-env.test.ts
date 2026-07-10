// entry/compose/runner-env — the cross-feature `WorkloadRunnerEnv` builder. Load-bearing here: the
// `connection.refreshCatalogSnapshot` FAN-OUT. The daily catalog refresh runs BOTH provider catalogs
// (OpenRouter `/models` + the agent-sdk daemon `supportedModels()` map) INDEPENDENTLY — one lane's failure
// must never discard the other. Semantics under test: both succeed → both counts; one fails → the failed
// lane reports `null` (NOT 0 — null ≠ empty catalog) and the run still succeeds; BOTH fail → rethrow the
// first rejection (the run accomplished nothing → fail loud).

import type { RunnerEnvDeps } from "@orb/server/entry/compose";
import { buildWorkloadRunnerEnv } from "@orb/server/entry/compose";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures";

// The fan-out only reads `.models.length` off each verb's return — derive the exact return shapes off the
// deps so the fakes stay contract-accurate without importing the snapshot element types by name.
type OrCatalog = Awaited<ReturnType<RunnerEnvDeps["connection"]["refreshCatalog"]>>;
type AgentSdkCatalog = Awaited<ReturnType<RunnerEnvDeps["connection"]["refreshAgentSdkCatalog"]>>;

/** The `refreshCatalog` (OpenRouter) return with `count` models — only `.models.length` is read. */
function orCatalog(count: number): OrCatalog {
  // FABRICATION-OK: the fan-out reads ONLY `.models.length` — the per-model shape never enters the test.
  return { models: Array.from({ length: count }, () => ({})) } as OrCatalog;
}

/** The `refreshAgentSdkCatalog` return with `count` models — only `.models.length` is read. */
function agentSdkCatalog(count: number): AgentSdkCatalog {
  // FABRICATION-OK: only `.models.length` is read (see orCatalog) — the per-model shape never enters the fan-out.
  return { models: Array.from({ length: count }, () => ({})) } as AgentSdkCatalog;
}

/** Build the runner-env with ONLY the two connection verbs wired (the rest of `RunnerEnvDeps` is unused by
 *  `refreshCatalogSnapshot`; cast the frame so the test states exactly what it exercises). */
function buildEnv(
  connection: RunnerEnvDeps["connection"],
): ReturnType<typeof buildWorkloadRunnerEnv> {
  // FABRICATION-OK: deliberate partial deps — `refreshCatalogSnapshot` closes over ONLY `deps.connection`.
  return buildWorkloadRunnerEnv({ connection } as RunnerEnvDeps);
}

const signal = new AbortController().signal;

describe("buildWorkloadRunnerEnv — refreshCatalogSnapshot fan-out", () => {
  test("both lanes succeed → both snapshot counts", async () => {
    const env = buildEnv({
      refreshCatalog: vi.fn(async () => orCatalog(99)),
      refreshAgentSdkCatalog: vi.fn(async () => agentSdkCatalog(3)),
    });
    const result = await env.connection.refreshCatalogSnapshot({ signal });
    expect(result).toEqual({ models: 99, agentSdkModels: 3 });
  });

  test("agent-sdk lane fails → its count is null, OR lane still refreshes (run succeeds)", async () => {
    const env = buildEnv({
      refreshCatalog: vi.fn(async () => orCatalog(42)),
      refreshAgentSdkCatalog: vi.fn(() =>
        Promise.reject(new Error("agent-sdk catalog unavailable")),
      ),
    });
    const result = await env.connection.refreshCatalogSnapshot({ signal });
    // null (could-not-refresh), NEVER 0 — 0 would conflate a failed lane with a real empty catalog.
    expect(result).toEqual({ models: 42, agentSdkModels: null });
  });

  test("OR lane fails → its count is null, agent-sdk lane still refreshes (run succeeds)", async () => {
    const env = buildEnv({
      refreshCatalog: vi.fn(() => Promise.reject(new Error("no OpenRouter key"))),
      refreshAgentSdkCatalog: vi.fn(async () => agentSdkCatalog(7)),
    });
    const result = await env.connection.refreshCatalogSnapshot({ signal });
    expect(result).toEqual({ models: null, agentSdkModels: 7 });
  });

  test("BOTH lanes fail → rethrows the first (OR) rejection (the run accomplished nothing)", async () => {
    const orFailure = new Error("no OpenRouter key");
    const env = buildEnv({
      refreshCatalog: vi.fn(() => Promise.reject(orFailure)),
      refreshAgentSdkCatalog: vi.fn(() =>
        Promise.reject(new Error("agent-sdk catalog unavailable")),
      ),
    });
    await expect(env.connection.refreshCatalogSnapshot({ signal })).rejects.toBe(orFailure);
  });
});
