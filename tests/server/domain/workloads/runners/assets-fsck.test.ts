// Runner test: assets-fsck (PD-26 — the read-only integrity report AS a workload) — wraps assets.fsck and
// returns the FsckReport verbatim (the env op already projects the domain's richer result).

import { describe, vi } from "vitest";
import { assetsFsckRunner } from "../../../../../packages/server/src/domain/workloads/runners/assets-fsck.ts";
import { expect, test } from "../../../../support/fixtures";
import { fakeEnv, makeRunnerContext } from "../_support.ts";

describe("assets-fsck runner", () => {
  test("returns the integrity report", async () => {
    const env = fakeEnv();
    const result = await assetsFsckRunner(makeRunnerContext(env), {}, vi.fn(), new AbortController().signal);
    expect(env.assets.fsck).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
    expect(result).toEqual({ danglingRows: 1, corruptBlobs: 0, orphanBlobs: 2 });
  });
});
