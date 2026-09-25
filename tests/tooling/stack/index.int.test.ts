// The stack cli driven for real, on a private run dir and private ports so the operator's own dev stack is
// never touched: a detached `up` writes its record under `STACK_RUN_DIR` (0192), and a `down` over a record
// rewritten to a dead group still finds the live stack by its ports and stops it (0205). Plus the
// served-module probe end to end against a fake vite.

import { once } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { connect, createServer as createTcpServer } from "node:net";
import { join } from "node:path";
import process from "node:process";
import { processEnvValue } from "@orb/tooling/_shared/process-env";
import type { LeaderRecord } from "../../../tooling/src/stack/index.ts";
import { LEADER_RECORD_FILE, parseLeaderRecord, probeServedTransform, serializeLeaderRecord } from "../../../tooling/src/stack/index.ts";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

// ── the served-module probe, END TO END against a fake vite (#524) ───────────────────────────────────
//
// The unit controls in index.test.ts pin the classifier. THESE pin the whole op: the mtime walk, the
// `/@fs/<abs>` fetch, the candidate walk-down, and the verdict. A fake vite is the only way to drive the
// wedge — the real one cannot be asked to serve a stale transform on demand, and killing its watcher on the
// operator's live stack to find out is exactly the thing this probe exists to make unnecessary.

/** A planted module whose landed export the wedged arm withholds. */
const PLANTED_MODULE = "export const landedAfterTheWatcherDied = 42;\n";
const FS_PREFIX_RE = /^\/@fs/u;

async function withFakeVite(body: (requestedPath: string) => string | null, run: (port: number) => Promise<void>): Promise<void> {
  const server = createServer((req, res) => {
    const requested = decodeURIComponent((req.url ?? "").replace(FS_PREFIX_RE, "").split("?")[0] ?? "");
    const served = body(requested);
    if (served === null) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": "application/javascript" }).end(served);
  });
  await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  try {
    await run(port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("a fake vite that serves the file back is FRESH — the negative control the wedge is measured against", async ({ plantedTree }) => {
  const root = await plantedTree({ "packages/ui/src/canary.ts": PLANTED_MODULE });
  await withFakeVite(
    (requested) => (requested.endsWith("canary.ts") ? PLANTED_MODULE : null),
    async (port) => {
      const verdict = await probeServedTransform([`${root}/packages/ui/src`], port);
      expect(verdict.state).toBe("fresh");
    },
  );
});

test("a fake vite serving a body WITHOUT the landed export is STALE — the dead-watcher wedge, caught", async ({ plantedTree }) => {
  const root = await plantedTree({ "packages/ui/src/canary.ts": PLANTED_MODULE });
  await withFakeVite(
    () => "// the transform vite computed before the watcher died\n",
    async (port) => {
      const verdict = await probeServedTransform([`${root}/packages/ui/src`], port);
      expect(verdict.state).toBe("stale");
      expect(verdict.message).toContain("landedAfterTheWatcherDied");
    },
  );
});

test("a vite that does not answer at all is UNREACHABLE, never fresh", async ({ plantedTree }) => {
  const root = await plantedTree({ "packages/ui/src/canary.ts": PLANTED_MODULE });
  await withFakeVite(
    () => null, // every request 404s — the module is not served
    async (port) => {
      expect((await probeServedTransform([`${root}/packages/ui/src`], port)).state).toBe("unreachable");
    },
  );
});

// ── the live cycle on a private run dir (0192, 0205) ────────────────────────────────────────────────

const BOOT_CEILING_MS = scaledBudget(180_000);
const STOP_CEILING_MS = scaledBudget(60_000);
const CYCLE_TIMEOUT_MS = BOOT_CEILING_MS + STOP_CEILING_MS + scaledBudget(30_000);
const RESULT_RE = /^RESULT stack (.+)$/mu;

async function freePort(): Promise<number> {
  const server = createTcpServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  server.close();
  await once(server, "close");
  if (address === null || typeof address === "string") {
    throw new Error("freePort: the probe listener has no TCP address");
  }
  return address.port;
}

async function portRefuses(port: number): Promise<boolean> {
  const socket = connect(port, "127.0.0.1");
  try {
    await once(socket, "connect");
    return false;
  } catch {
    return true;
  } finally {
    socket.destroy();
  }
}

/** Only what node needs plus the sidecar's own address, so no vitest switch and no operator `.env` reaches the stack. */
function sidecarEnv(scratch: string, ports: { readonly server: number; readonly vite: number }): Record<string, string> {
  const inherited = ["PATH", "HOME"].flatMap((key) => {
    const value = processEnvValue(key);
    return value === undefined ? [] : [[key, value] as const];
  });
  return Object.fromEntries([
    ...inherited,
    ["STACK_RUN_DIR", join(scratch, "run")],
    ["PORT", String(ports.server)],
    ["VITE_PORT", String(ports.vite)],
    ["DATA_DIR", join(scratch, "data")],
    ["DATABASE_URL", `file:${join(scratch, "data", "orb.db")}`],
    ["ASSETS_DIR", join(scratch, "data", "assets")],
    ["ORB_ENV_NO_FILE", "1"],
  ]);
}

function resultLine(stdout: string): string {
  return RESULT_RE.exec(stdout)?.[1] ?? "";
}

test("up writes the record under STACK_RUN_DIR, and down finds the live stack by its ports when the record names a dead group", {
  timeout: CYCLE_TIMEOUT_MS,
}, async ({ runCli, scratch }) => {
  const ports = { server: await freePort(), vite: await freePort() };
  const env = sidecarEnv(scratch, ports);
  mkdirSync(join(scratch, "data"), { recursive: true });
  const recordPath = join(scratch, "run", LEADER_RECORD_FILE);
  let booted = false;
  try {
    const up = await runCli("stack", ["up"], { env, timeoutMs: BOOT_CEILING_MS });
    booted = true;
    expect(up.code, `${up.stdout}\n${up.stderr}`).toBe(0);
    expect(resultLine(up.stdout)).toContain("status=up");
    // 0192: the record lives under the custom run dir, not under the repo's default.
    expect(existsSync(recordPath), "the leader must write its record under STACK_RUN_DIR").toBe(true);
    const record = parseLeaderRecord(readFileSync(recordPath, "utf8"));
    expect(record).not.toBeNull();
    if (record === null) {
      return;
    }
    expect(record.ports).toEqual(ports);
    expect(record.children.length, "the leader records both children").toBe(2);
    expect(record.runDir).toBe(join(scratch, "run"));

    // A second `up` is idempotent over the live record: nothing is spawned twice.
    const again = await runCli("stack", ["up"], { env, timeoutMs: STOP_CEILING_MS });
    expect(again.code).toBe(0);
    expect(resultLine(again.stdout)).toContain("status=already-up");

    // 0205: the record now names a dead group while the leader still holds the ports. `down` must not stop
    // at "the leader is gone"; the port sweep finds this checkout's processes and stops their group.
    const dead: LeaderRecord = { ...record, pid: 2_147_483_000, pgid: 2_147_483_000, children: [] };
    writeFileSync(recordPath, serializeLeaderRecord(dead));
    const down = await runCli("stack", ["down"], { env, timeoutMs: STOP_CEILING_MS });
    expect(down.code, `${down.stdout}\n${down.stderr}`).toBe(0);
    expect(resultLine(down.stdout)).toContain("status=stopped");
    expect(await portRefuses(ports.server), "the server must not survive `down`").toBe(true);
    expect(await portRefuses(ports.vite), "vite must not survive `down`").toBe(true);
    expect(existsSync(recordPath), "a stopped stack leaves no record").toBe(false);
    booted = false;
  } finally {
    if (booted) {
      // The test's own record was overwritten above only after the assertions; a real `down` is the one
      // cleanup that never guesses at ownership.
      await runCli("stack", ["down"], { env, timeoutMs: STOP_CEILING_MS });
    }
  }
});

test("down with nothing recorded and nothing bound is a clean no-op, and a bare status reports down", async ({ runCli, scratch }) => {
  const env = sidecarEnv(scratch, { server: await freePort(), vite: await freePort() });
  const down = await runCli("stack", ["down"], { env, timeoutMs: STOP_CEILING_MS });
  expect(down.code, `${down.stdout}\n${down.stderr}`).toBe(0);
  expect(resultLine(down.stdout)).toBe("status=stopped pgid=none");
  const status = await runCli("stack", ["status"], { env, timeoutMs: STOP_CEILING_MS });
  expect(status.code, `${status.stdout}\n${status.stderr}`).toBe(0);
  expect(resultLine(status.stdout)).toContain("status=down");
  expect(process.platform === "win32" || existsSync(join(scratch, "run", LEADER_RECORD_FILE))).toBe(false);
});
