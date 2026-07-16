// Runner test: import-bundle — the thin workload runner over `env.import.importBundle`. Passes the row's
// target owner + the staging token through and returns the op's summary counts; a null owner (an ownerless
// row) is a guard throw (import mints owner-owned rows, never into the synthetic system id).

import { describe, vi } from "vitest";
import { importBundleRunner } from "../../../../../packages/server/src/domain/workloads/runners/import-bundle.ts";
import { expect, test } from "../../../../support/fixtures";
import { fakeEnv, makeRunnerContext, RUNNER_OWNER_ID } from "../_support.ts";

describe("import-bundle runner", () => {
  test("threads the owner + token to importBundle and returns its counts", async () => {
    const env = fakeEnv();
    const result = await importBundleRunner(makeRunnerContext(env), { token: "import-bundle-xyz.zip" }, vi.fn(), new AbortController().signal);
    expect(env.import.importBundle).toHaveBeenCalledWith({
      ownerId: RUNNER_OWNER_ID,
      token: "import-bundle-xyz.zip",
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual({ imported: 7, skipped: 1, failed: 0 });
  });

  test("a null-owner (ownerless) row throws — a bundle must be scoped to the uploader", async () => {
    const env = fakeEnv();
    await expect(
      importBundleRunner(makeRunnerContext(env, { ownerId: null }), { token: "import-bundle-xyz.zip" }, vi.fn(), new AbortController().signal),
    ).rejects.toThrow("no target owner");
    expect(env.import.importBundle).not.toHaveBeenCalled();
  });
});
