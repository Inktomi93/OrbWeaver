import { once } from "node:events";
import type * as Fs from "node:fs";
import { createServer as createHttpServer } from "node:http";
import type { Server } from "node:net";
import { createServer as createTcpServer } from "node:net";
import process from "node:process";
import { vi } from "vitest";
import type { ProdRecord } from "../../../../tooling/src/stack/contract/types.ts";
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

const PLANTED_TOKEN = "planted-token";
const DEBUG_TOKEN_HEADER = "x-debug-token";
// The pid the fake server reports about itself: distinct from the socket owner, so a test can tell the
// token-bearing body was read rather than the socket-table fallback.
const SELF_REPORTED_PID = 424_242;

function prodRecord(pid: number): ProdRecord {
  return { mode: "prod", pid, pgid: pid, port: 0, startedAt: "", debug: true, repoRoot: "", logPath: "" };
}

function boundPort(server: Server): number {
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the planted listener has no TCP address");
  }
  return address.port;
}

/** A real loopback listener owned by THIS process, so the real socket table names `process.pid` as its owner. */
async function listen(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return boundPort(server);
}

/** A stand-in for whatever answers on the prod port: the debug gate's 401/200 split, recording every header. */
async function fakeDebugServer(): Promise<{ readonly port: number; readonly tokensSeen: (string | undefined)[]; readonly close: () => void }> {
  const tokensSeen: (string | undefined)[] = [];
  const server = createHttpServer((req, res) => {
    if (req.url === "/healthz") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ harness: false }));
      return;
    }
    const token = req.headers[DEBUG_TOKEN_HEADER];
    tokensSeen.push(typeof token === "string" ? token : undefined);
    if (token !== PLANTED_TOKEN) {
      res.statusCode = 401;
      res.end();
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ pid: SELF_REPORTED_PID }));
  });
  const port = await listen(server);
  return { port, tokensSeen, close: () => server.close() };
}

test("the debug token is never presented to a listener the socket table does not name as our recorded pid", async () => {
  fileError.match = TOKEN_PATH();
  fileError.value = PLANTED_TOKEN;
  const squatter = await fakeDebugServer();
  try {
    for (const record of [prodRecord(process.ppid), null]) {
      const observed = await observe(squatter.port, record);
      expect(observed.posture).toBe("token");
      expect(observed.listenerPid).toBe(process.pid);
    }
    expect(squatter.tokensSeen).toEqual([undefined, undefined]);
  } finally {
    fileError.value = null;
    squatter.close();
  }
});

test("our recorded listener gets the token on the pid read only, and its self-reported pid wins", async () => {
  fileError.match = TOKEN_PATH();
  fileError.value = PLANTED_TOKEN;
  const ours = await fakeDebugServer();
  try {
    const observed = await observe(ours.port, prodRecord(process.pid));
    expect(observed.listenerPid).toBe(SELF_REPORTED_PID);
    expect(ours.tokensSeen).toEqual([undefined, PLANTED_TOKEN]);
  } finally {
    fileError.value = null;
    ours.close();
  }
});

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
  const listener = createTcpServer();
  const port = await listen(listener);
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ harness: false }) })
    .mockResolvedValueOnce({ status: 401 });
  vi.stubGlobal("fetch", fetch);
  try {
    await expect(observe(port, prodRecord(process.pid))).rejects.toThrow("planted EIO file failure");
  } finally {
    vi.unstubAllGlobals();
    listener.close();
  }
});

test("a failed token-authenticated identity probe rejects instead of falling back to a weaker socket witness", async () => {
  fileError.match = TOKEN_PATH();
  fileError.value = PLANTED_TOKEN;
  const listener = createTcpServer();
  const port = await listen(listener);
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ harness: false }) })
    .mockResolvedValueOnce({ status: 401 })
    .mockRejectedValueOnce(new Error("planted authenticated probe failure"));
  vi.stubGlobal("fetch", fetch);
  try {
    await expect(observe(port, prodRecord(process.pid))).rejects.toThrow("planted authenticated probe failure");
    expect(fetch).toHaveBeenCalledTimes(3);
  } finally {
    fileError.value = null;
    vi.unstubAllGlobals();
    listener.close();
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
