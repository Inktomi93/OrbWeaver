import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import { isAbsolute } from "node:path";
import { verifyMediaRuntime } from "@orb/server/infra/media/runtime";
import { afterEach, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

vi.mock("node:child_process", async (original) => ({ ...(await original<typeof import("node:child_process")>()), spawnSync: vi.fn() }));
afterEach(() => vi.mocked(spawnSync).mockReset());

function response(status: number | null, stdout: string, error?: Error): SpawnSyncReturns<string> {
  return { pid: 1, output: [null, stdout, ""], stdout, stderr: "", status, signal: null, ...(error === undefined ? {} : { error }) };
}

test("verification executes the package-relative CLI with bounded capture and no shell", () => {
  vi.mocked(spawnSync).mockReturnValue(response(0, "ffmpeg version 8.1-Jellyfin\nconfiguration: test\n"));
  expect(verifyMediaRuntime()).toBe("ffmpeg version 8.1-Jellyfin");
  const command = vi.mocked(spawnSync).mock.calls[0]?.[0];
  expect(typeof command).toBe("string");
  expect(isAbsolute(String(command))).toBe(true);
  expect(command).not.toBe("ffmpeg");
  expect(spawnSync).toHaveBeenCalledWith(command, ["-version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    timeout: 10_000,
    maxBuffer: 65_536,
  });
});

for (const result of [response(null, "", new Error("not executable")), response(1, "ffmpeg version broken"), response(0, "not FFmpeg")]) {
  test(`an absent, failed or wrong executable is a required-runtime failure (${result.status}/${result.stdout})`, () => {
    vi.mocked(spawnSync).mockReturnValue(result);
    expect(verifyMediaRuntime).toThrow("required packaged FFmpeg is not runnable");
  });
}
