import process from "node:process";
import { vi } from "vitest";
import { expect, test } from "../../../support/tool-fixtures.ts";

const control = vi.hoisted(() => ({ alive: false }));
vi.mock("node:timers/promises", () => ({ setTimeout: async () => undefined }));
vi.mock("../../../../tooling/src/_shared/artifacts.ts", () => ({ print: () => undefined }));
vi.mock("../../../../tooling/src/_shared/entrypoint.ts", () => ({ refuseDirectInvocation: () => undefined }));
vi.mock("../../../../tooling/src/stack/ops/prod-state.ts", () => ({
  classify: async () => ({
    record: { pid: 123, pgid: 456, logPath: "/tmp/prod.log", startedAt: new Date(0).toISOString() },
    classification: { verdict: "ours-unhealthy", reason: "planted owned process" },
  }),
  LOG_PATH: () => "/tmp/prod.log",
  log: () => undefined,
  MS_PER_SECOND: 1000,
  PIDFILE: () => "/tmp/prod.pid",
  POLL_INTERVAL_MS: 1,
  processAlive: () => control.alive,
  readEnvFile: () => ({}),
  resolvePort: () => 8788,
  result: () => undefined,
  TOKEN_PATH: () => "/tmp/debug-token",
}));
vi.mock("../../../../tooling/src/stack/ops/prod-support.ts", () => ({
  distVerdict: () => ({ state: "fresh", message: "fresh" }),
  readFrom: () => "",
  removePidfile: () => undefined,
  safeSize: () => 0,
  uptimeText: () => "0s",
}));

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
    await expect(doDown()).rejects.toThrow("planted EPERM signal failure");
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
    if (calls === 2) throw signalError("EPERM");
    return true;
  }) as typeof process.kill);
  try {
    await expect(doDown()).rejects.toThrow("planted EPERM signal failure");
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
    await expect(doDown()).rejects.toThrow("pid 123 remained live after the shutdown deadline");
  } finally {
    kill.mockRestore();
    now.mockRestore();
    control.alive = false;
  }
});
