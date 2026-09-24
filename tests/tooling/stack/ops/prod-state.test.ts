import type * as Fs from "node:fs";
import process from "node:process";
import { vi } from "vitest";
import { expect, test } from "../../../support/tool-fixtures.ts";

const fileError = vi.hoisted(() => ({ code: "ENOENT", match: "/.env", value: null as string | null }));
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof Fs>();
  return {
    ...real,
    readFileSync: (path: Parameters<typeof real.readFileSync>[0], options?: Parameters<typeof real.readFileSync>[1]) => {
      if (String(path).includes(fileError.match)) {
        if (fileError.value !== null) {
          return fileError.value;
        }
        throw Object.assign(new Error(`planted ${fileError.code} file failure`), { code: fileError.code });
      }
      return (real.readFileSync as (...args: unknown[]) => unknown)(path, options);
    },
  };
});

const { PIDFILE, TOKEN_PATH, observe, processAlive, readEnvFile, readRecord } = await import("../../../../tooling/src/stack/ops/prod-state.ts");

test("only missing optional state files default; unreadable env, token, and pidfile witnesses fail loud", () => {
  const cases = [
    { match: "/.env", read: readEnvFile, absent: {} },
    { match: PIDFILE(), read: readRecord, absent: null },
  ] as const;
  for (const row of cases) {
    fileError.match = row.match;
    fileError.code = "ENOENT";
    expect(row.read()).toEqual(row.absent);
    fileError.code = "EIO";
    expect(() => row.read()).toThrow("planted EIO file failure");
  }
});

test("an unreadable debug token fails the composed observation instead of impersonating a disarmed debug surface", async () => {
  fileError.match = TOKEN_PATH();
  fileError.code = "EIO";
  fileError.value = null;
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ harness: false }) })
    .mockResolvedValueOnce({ status: 401 });
  vi.stubGlobal("fetch", fetch);
  try {
    await expect(observe(8788)).rejects.toThrow("planted EIO file failure");
  } finally {
    vi.unstubAllGlobals();
  }
});

test("a failed token-authenticated identity probe rejects instead of falling back to a weaker socket witness", async () => {
  fileError.match = TOKEN_PATH();
  fileError.value = "planted-token";
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ harness: false }) })
    .mockResolvedValueOnce({ status: 401 })
    .mockRejectedValueOnce(new Error("planted authenticated probe failure"));
  vi.stubGlobal("fetch", fetch);
  try {
    await expect(observe(8788)).rejects.toThrow("planted authenticated probe failure");
    expect(fetch).toHaveBeenCalledTimes(3);
  } finally {
    fileError.value = null;
    vi.unstubAllGlobals();
  }
});

test("kill-zero classifies only ESRCH as absent, keeps EPERM live, and surfaces other probe failures", () => {
  let code = "ESRCH";
  const kill = vi.spyOn(process, "kill").mockImplementation((() => {
    throw Object.assign(new Error(`planted ${code} kill failure`), { code });
  }) as typeof process.kill);
  try {
    expect(processAlive(123)).toBe(false);
    code = "EPERM";
    expect(processAlive(123)).toBe(true);
    code = "EIO";
    expect(() => processAlive(123)).toThrow("planted EIO kill failure");
  } finally {
    kill.mockRestore();
  }
});
