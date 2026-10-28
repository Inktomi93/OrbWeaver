import { once } from "node:events";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import type { Server } from "node:net";
import { join } from "node:path";
import process from "node:process";
import { expect, test as toolingTest } from "@orb/testkit/tooling";
import { vi } from "vitest";
import type { ProdRecord } from "../../../../tooling/src/stack/contract/types.ts";
import { observe, PIDFILE, processAlive, readEnvFile, readRecord, TOKEN_PATH } from "../../../../tooling/src/stack/ops/prod-state.ts";

const test = toolingTest.extend<{ privateRun: string }>({
  privateRun: [
    async ({ scratch }, use) => {
      vi.stubEnv("STACK_RUN_DIR", scratch);
      expect(PIDFILE()).toBe(join(scratch, "prod.json"));
      expect(TOKEN_PATH()).toBe(join(scratch, "debug-token"));
      await use(scratch);
    },
    { auto: true },
  ],
});

const PLANTED_TOKEN = "planted-token";
const DEBUG_TOKEN_HEADER = "x-debug-token";
const SELF_REPORTED_PID = 424_242;

function prodRecord(pid: number): ProdRecord {
  return { mode: "prod", pid, pgid: pid, port: 0, startedAt: "", debug: true, repoRoot: "", logPath: "" };
}

async function listen(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the planted listener has no TCP address");
  }
  return address.port;
}

// Store credential classifications, never raw values, so failed assertions cannot disclose an operator token.
async function fakeDebugServer(failAuthenticated = false): Promise<{
  readonly port: number;
  readonly tokensSeen: ("none" | "planted" | "unexpected")[];
  readonly close: () => Promise<void>;
}> {
  const tokensSeen: ("none" | "planted" | "unexpected")[] = [];
  const server = createHttpServer((req, res) => {
    if (req.url === "/healthz") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ harness: false }));
      return;
    }
    const token = req.headers[DEBUG_TOKEN_HEADER];
    const presentToken = token === PLANTED_TOKEN ? "planted" : "unexpected";
    tokensSeen.push(token === undefined ? "none" : presentToken);
    if (token !== PLANTED_TOKEN) {
      res.statusCode = 401;
      res.end();
      return;
    }
    if (failAuthenticated) {
      req.socket.destroy();
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ pid: SELF_REPORTED_PID }));
  });
  const port = await listen(server);
  return { port, tokensSeen, close: () => new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error)))) };
}

test("the debug token is never presented to a listener the socket table does not name as our recorded pid", async ({ privateRun }) => {
  writeFileSync(join(privateRun, "debug-token"), PLANTED_TOKEN);
  const squatter = await fakeDebugServer();
  try {
    for (const record of [prodRecord(process.ppid), null]) {
      const observed = await observe(squatter.port, record);
      expect(observed.posture).toBe("token");
      expect(observed.listenerPid).toBe(process.pid);
    }
    expect(squatter.tokensSeen).toEqual(["none", "none"]);
  } finally {
    await squatter.close();
  }
});

test("our recorded listener gets the token on the pid read only, and its self-reported pid wins", async ({ privateRun }) => {
  writeFileSync(join(privateRun, "debug-token"), PLANTED_TOKEN);
  const ours = await fakeDebugServer();
  try {
    const observed = await observe(ours.port, prodRecord(process.pid));
    expect(observed.listenerPid).toBe(SELF_REPORTED_PID);
    expect(ours.tokensSeen).toEqual(["none", "planted"]);
  } finally {
    await ours.close();
  }
});

test("only missing optional state files default; unreadable env and pidfile witnesses fail loud", ({ privateRun }) => {
  expect(Object.keys(readEnvFile(privateRun))).toEqual([]);
  writeFileSync(join(privateRun, ".env"), "PORT=12345\n");
  // Compare keys and a nonsecret field, never a whole environment record.
  expect(Object.keys(readEnvFile(privateRun))).toEqual(["PORT"]);
  expect(readEnvFile(privateRun)["PORT"]).toBe("12345");
  rmSync(join(privateRun, ".env"));
  mkdirSync(join(privateRun, ".env"));
  expect(() => readEnvFile(privateRun)).toThrow(/EISDIR/u);

  expect(readRecord()).toBeNull();
  writeFileSync(PIDFILE(), JSON.stringify(prodRecord(process.pid)));
  expect(readRecord()?.pid).toBe(process.pid);
  rmSync(PIDFILE());
  mkdirSync(PIDFILE());
  expect(() => readRecord()).toThrow(/EISDIR/u);
});

test("an unreadable debug token fails the composed observation instead of impersonating a disarmed debug surface", async ({ privateRun }) => {
  mkdirSync(join(privateRun, "debug-token"));
  const listener = await fakeDebugServer();
  try {
    await expect(observe(listener.port, prodRecord(process.pid))).rejects.toThrow(/EISDIR/u);
    expect(listener.tokensSeen).toEqual(["none"]);
  } finally {
    await listener.close();
  }
});

test("a failed token-authenticated identity probe rejects instead of falling back to a weaker socket witness", async ({ privateRun }) => {
  writeFileSync(join(privateRun, "debug-token"), PLANTED_TOKEN);
  const listener = await fakeDebugServer(true);
  try {
    await expect(observe(listener.port, prodRecord(process.pid))).rejects.toThrow("fetch failed");
    expect(listener.tokensSeen).toEqual(["none", "planted"]);
  } finally {
    await listener.close();
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
