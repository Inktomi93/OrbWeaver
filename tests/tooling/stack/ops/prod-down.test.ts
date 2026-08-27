import process from "node:process";
import { vi } from "vitest";
import type { DownDeps } from "../../../../tooling/src/stack/ops/prod-down.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const control = vi.hoisted(() => ({ alive: false }));
vi.mock("node:timers/promises", () => ({ setTimeout: async () => undefined }));
// `print` writes to process.stdout; spy the STREAM (a node edge) rather than mocking our own artifacts
// module — the doctrine's line, and it keeps the real `print` under test.
vi.spyOn(process.stdout, "write").mockImplementation(() => true);
// INJECTED, never mocked (Spine-Testing §3): `doDown` takes its ownership verdict and liveness poll as
// `DownDeps`, so these are supplied through the real seam. The rest of prod-state stays REAL, which is the
// point — a wholesale module fake would also have replaced the ten symbols this test never steers.
const deps: DownDeps = {
  classify: () =>
    Promise.resolve({
      record: { pid: 123, pgid: 456, logPath: "/tmp/prod.log", startedAt: new Date(0).toISOString() },
      classification: { verdict: "ours-unhealthy", reason: "planted owned process" },
    }) as ReturnType<DownDeps["classify"]>,
  processAlive: () => control.alive,
};
const { doDown } = await import("../../../../tooling/src/stack/ops/prod-down.ts");

function signalError(code: string): Error & { code: string } {
  return Object.assign(new Error(`planted ${code} signal failure`), { code });
}

test("SIGTERM ignores only a vanished process and surfaces permission failures", async () => {
  control.alive = false;
  const kill = vi.spyOn(process, "kill").mockImplementation((() => {
    throw signalError("EPERM");
  }) as typeof process.kill);
  try {
    await expect(doDown(deps)).rejects.toThrow("planted EPERM signal failure");
  } finally {
    kill.mockRestore();
  }
});

test("SIGKILL surfaces permission failure instead of reporting a live process stopped", async () => {
  control.alive = false;
  const now = vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(20_000);
  let calls = 0;
  const kill = vi.spyOn(process, "kill").mockImplementation((() => {
    calls += 1;
    if (calls === 2) {
      throw signalError("EPERM");
    }
    return true;
  }) as typeof process.kill);
  try {
    await expect(doDown(deps)).rejects.toThrow("planted EPERM signal failure");
  } finally {
    kill.mockRestore();
    now.mockRestore();
  }
});

test("down refuses to remove the pidfile or report stopped when the process survives the deadline", async () => {
  control.alive = true;
  const now = vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValueOnce(20_000).mockReturnValueOnce(0).mockReturnValue(20_000);
  const kill = vi.spyOn(process, "kill").mockReturnValue(true);
  try {
    await expect(doDown(deps)).rejects.toThrow("pid 123 remained live after the shutdown deadline");
  } finally {
    kill.mockRestore();
    now.mockRestore();
    control.alive = false;
  }
});
