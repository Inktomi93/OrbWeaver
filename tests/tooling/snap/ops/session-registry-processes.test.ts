import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { abandonedRuns } from "../../../../tooling/src/floor/artifacts/artifacts.ts";
import type { SessionRow } from "../../../../tooling/src/snap/contract/session.ts";
import { SESSION_PROTOCOL_VERSION } from "../../../../tooling/src/snap/contract/session.ts";
import { SESSION_INSTRUMENT, sessionRowPath, sessionSocketPath } from "../../../../tooling/src/snap/lib/session-plan.ts";
import { reapSession, writeRow } from "../../../../tooling/src/snap/ops/session-registry.ts";
import { expect, test } from "../../_windows-processes.ts";

function row(home: string, root: string, pid: number, slotDir: string): SessionRow {
  return {
    v: SESSION_PROTOCOL_VERSION,
    name: "owned-daemon",
    ownerCheckout: root,
    daemonPid: pid,
    pgid: pid,
    socket: sessionSocketPath(home, "owned-daemon"),
    cdpEndpoint: null,
    slotDir,
    binding: { kind: "base", url: "http://127.0.0.1" },
    environment: {
      viewport: { width: 1280, height: 720 },
      device: null,
      colorScheme: null,
      reducedMotion: false,
      contrast: null,
      reducedTransparency: false,
      deviceScaleFactor: null,
    },
    bootArgv: [],
    createdAt: new Date(0).toISOString(),
    lastUsedAt: new Date(0).toISOString(),
    inflightOp: null,
    lastOp: null,
    ttlMs: 60_000,
    headless: true,
    calls: 0,
  };
}

test("Windows-edge stale daemon cleanup settles only its bookkeeping and does not claim descendant termination", async ({ scratch, windows }) => {
  const home = join(scratch, "registry");
  mkdirSync(home);
  const record = row(home, windows.checkout, windows.rootPid, windows.slotDir);
  writeRow(home, record);
  writeFileSync(record.socket, "stale socket");
  const evidence = join(record.slotDir, "evidence.txt");
  writeFileSync(evidence, "preserved evidence");
  windows.root.kill("SIGKILL");
  await windows.rootExit;
  const state = windows.state;
  state.rows = state.rows.filter((entry) => entry.pid !== windows.rootPid);
  expect(abandonedRuns(windows.checkout, SESSION_INSTRUMENT).map((run) => run.dir)).toContain(windows.slotDir);
  const receipt = await reapSession(home, windows.checkout, record, windows.process);
  expect(receipt).toContain("stale registry cleaned; descendant termination unverified");
  expect(windows.state.tasks).toEqual([]);
  expect(existsSync(sessionRowPath(home, record.name))).toBe(false);
  expect(existsSync(record.socket)).toBe(false);
  expect(abandonedRuns(windows.checkout, SESSION_INSTRUMENT).map((run) => run.dir)).not.toContain(windows.slotDir);
  expect(readFileSync(evidence, "utf8")).toBe("preserved evidence");
  expect(windows.leaf.hasExited()).toBe(false);
});

test("Windows-edge stale daemon observation refusal preserves row socket and marker", async ({ scratch, windows }) => {
  const home = join(scratch, "registry");
  mkdirSync(home);
  const record = row(home, windows.checkout, windows.rootPid, windows.slotDir);
  writeRow(home, record);
  writeFileSync(record.socket, "stale socket");
  windows.root.kill("SIGKILL");
  await windows.rootExit;
  const state = windows.state;
  state.rows = state.rows.filter((entry) => entry.pid !== windows.rootPid);
  state.observationFails = true;
  await expect(reapSession(home, windows.checkout, record, windows.process)).rejects.toThrow("observation failed");
  expect(existsSync(sessionRowPath(home, record.name))).toBe(true);
  expect(existsSync(record.socket)).toBe(true);
  expect(abandonedRuns(windows.checkout, SESSION_INSTRUMENT).map((run) => run.dir)).toContain(windows.slotDir);
  expect(windows.state.tasks).toEqual([]);
});

test("Windows-edge live daemon termination retains row socket and marker on taskkill refusal", async ({ scratch, windows }) => {
  const home = join(scratch, "registry");
  mkdirSync(home);
  const record = row(home, windows.checkout, windows.rootPid, windows.slotDir);
  writeRow(home, record);
  writeFileSync(record.socket, "owned socket");
  windows.state.status = 5;
  windows.state.removeTargets = false;
  await expect(reapSession(home, windows.checkout, record, windows.process)).rejects.toThrow("taskkill failed");
  expect(existsSync(sessionRowPath(home, record.name))).toBe(true);
  expect(existsSync(record.socket)).toBe(true);
  expect(windows.state.tasks).toHaveLength(1);
  windows.root.kill("SIGKILL");
  await windows.rootExit;
  expect(abandonedRuns(windows.checkout, SESSION_INSTRUMENT).map((run) => run.dir)).toContain(windows.slotDir);
});

test("Windows-edge live daemon bookkeeping settles only after its retained tree is absent", async ({ scratch, windows }) => {
  const home = join(scratch, "registry");
  mkdirSync(home);
  const record = row(home, windows.checkout, windows.rootPid, windows.slotDir);
  writeRow(home, record);
  writeFileSync(record.socket, "owned socket");
  expect(await reapSession(home, windows.checkout, record, windows.process)).toContain("force-stopped daemon tree");
  expect(windows.state.tasks).toEqual([["/PID", String(windows.rootPid), "/PID", String(windows.leafPid), "/F"]]);
  expect(existsSync(sessionRowPath(home, record.name))).toBe(false);
  expect(existsSync(record.socket)).toBe(false);
});
