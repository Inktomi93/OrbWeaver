// @subject packages/server/src/infra/plugin-host/process-runtime.ts
// @subject packages/server/src/infra/plugin-host/broker-watchdog.ts
// Stopping the server stops the plugin host's processes over their IPC channels, never by a signal, so the stop works
// the same on Windows, macOS and Linux: each child sees its channel close, ends, and its parent waits for the exit. A
// child that cannot act on its stop is ended by its parent, and no watchdog or broker outlives the server.
// The first case runs natively on every platform in the contributor proof; the other two hold a process with SIGSTOP,
// which only POSIX has.
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { once } from "node:events";
import process from "node:process";
import type { PluginHostSeamDeps } from "@orb/server/infra/plugin-host";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { listProcesses } from "@orb/tooling/floor/host/platform";
import { PLUGIN_WATCHDOG_STOP_GRACE_MS } from "#server/infra/plugin-host/budgets.ts";
import { BASE_GRANTS, installGuest, NATIVE_TIMEOUT_MS, NOOP_COMMAND } from "./process-runtime.fixtures.ts";

const STDERR = 2;
// Every channel failure the watchdog reports.
const RELAY_FAILURE = /plugin broker watchdog: the [a-z-]+ relay failed/u;
// The line the watchdog writes when it ends a broker that did not exit on its stop.
const STOP_IGNORED = /the broker did not exit on its stop/u;
// A line the watchdog writes once its broker runs: proof the capture reads the watchdog's log at all.
const RUNTIME_LINE = /plugin broker watchdog: runtime/u;

interface Captured {
  readonly spawn: NonNullable<PluginHostSeamDeps["spawn"]>;
  readonly lines: string[];
  readonly watchdogs: ChildProcess[];
}

// The production spawn with only the watchdog's stderr piped here instead of inherited, so the suite reads its log.
function capturingSpawn(): Captured {
  const lines: string[] = [];
  const watchdogs: ChildProcess[] = [];
  return {
    lines,
    watchdogs,
    spawn: (command, args, options): ChildProcess => {
      const stdio = Array.isArray(options.stdio) ? [...options.stdio] : [];
      stdio[STDERR] = "pipe";
      const child = spawn(command, args, { ...options, stdio });
      child.stderr?.setEncoding("utf8").on("data", (chunk: string) => lines.push(chunk));
      watchdogs.push(child);
      return child;
    },
  };
}

function running(pid: number): boolean {
  return listProcesses().some((row) => row.pid === pid);
}

// The broker is the watchdog's one child process, and no production surface names its pid.
function brokerOf(watchdog: number): number {
  const children = listProcesses().filter((row) => row.ppid === watchdog);
  const [broker] = children;
  if (children.length !== 1 || broker === undefined) {
    throw new Error(`the watchdog runs ${String(children.length)} child processes, not its one broker`);
  }
  return broker.pid;
}

interface HostProcesses {
  readonly watchdog: ChildProcess & { readonly pid: number };
  readonly broker: number;
}

// Serve one plugin call on `root`, so its watchdog and broker both run.
async function serveOnce(root: Awaited<ReturnType<typeof createServerHarness>>, captured: Captured, slug: string): Promise<HostProcesses> {
  const guest = await installGuest(root, slug, `const h=orb.host(1);${NOOP_COMMAND}`, BASE_GRANTS);
  expect((await guest.enable()).status).toBe("enabled");
  await guest.invoke("noop");
  const [watchdog] = captured.watchdogs;
  if (watchdog?.pid === undefined) {
    throw new Error("the production host did not spawn its watchdog");
  }
  return { watchdog: Object.assign(watchdog, { pid: watchdog.pid }), broker: brokerOf(watchdog.pid) };
}

test("stopping the server stops its watchdog and broker over their channels: each exits on its own and neither remains", {
  timeout: NATIVE_TIMEOUT_MS,
}, async () => {
  const captured = capturingSpawn();
  await using root = await createServerHarness({ pluginSpawn: captured.spawn });
  const { watchdog, broker } = await serveOnce(root, captured, "stop-clean");
  expect(running(broker)).toBe(true);

  await root[Symbol.asyncDispose]();

  // The watchdog exited by itself, not by the host's fallback, and its broker did too, not by the liveness check.
  expect({ code: watchdog.exitCode, signal: watchdog.signalCode }).toEqual({ code: 0, signal: null });
  const log = captured.lines.join("");
  expect(log).toMatch(RUNTIME_LINE);
  expect(log).not.toMatch(STOP_IGNORED);
  expect(log).not.toMatch(RELAY_FAILURE);
  expect(running(watchdog.pid)).toBe(false);
  expect(running(broker)).toBe(false);
});

test("a broker that cannot act on its stop is ended by its watchdog's liveness check, and the watchdog still exits on its own", {
  timeout: NATIVE_TIMEOUT_MS,
}, async () => {
  const captured = capturingSpawn();
  await using root = await createServerHarness({ pluginSpawn: captured.spawn });
  const { watchdog, broker } = await serveOnce(root, captured, "stop-held-broker");
  // A held broker cannot see its channel close, and sends no beat.
  process.kill(broker, "SIGSTOP");
  try {
    // A message on its app channel that is no frame makes the watchdog stop its broker and exit.
    watchdog.send({ kind: "not-a-frame" });
    await once(watchdog, "exit");
  } finally {
    if (running(broker)) {
      process.kill(broker, "SIGKILL");
    }
  }

  expect({ code: watchdog.exitCode, signal: watchdog.signalCode }).toEqual({ code: 0, signal: null });
  const log = captured.lines.join("");
  expect(log).toMatch(STOP_IGNORED);
  expect(log).not.toMatch(RELAY_FAILURE);
  expect(running(broker)).toBe(false);
});

test("a watchdog that ignores its stop is ended by the host's fallback, and its broker exits on the closed channel", {
  timeout: NATIVE_TIMEOUT_MS,
}, async () => {
  const captured = capturingSpawn();
  await using root = await createServerHarness({ pluginSpawn: captured.spawn });
  const { watchdog, broker } = await serveOnce(root, captured, "stop-held-watchdog");
  // A held watchdog cannot see its channel close, retire a runtime, or stop its broker.
  process.kill(watchdog.pid, "SIGSTOP");
  let closed = false;
  try {
    // The host's own timers run only when advanced: each step lets the retirement it cannot finish time out, then the
    // stop's grace pass.
    const failure = root[Symbol.asyncDispose]().then(
      () => null,
      (error: unknown) => error,
    );
    void failure.then(() => {
      closed = true;
    });
    await expect
      .poll(() => {
        root.timers.advance(PLUGIN_WATCHDOG_STOP_GRACE_MS);
        return closed;
      })
      .toBe(true);
    // The runtime the held watchdog could not retire is reported.
    expect(await failure).toBeInstanceOf(AggregateError);
  } finally {
    if (watchdog.exitCode === null && watchdog.signalCode === null) {
      watchdog.kill("SIGKILL");
    }
  }

  expect(watchdog.signalCode).toBe("SIGKILL");
  // The broker sees its channel close when the watchdog dies and ends itself.
  await expect.poll(() => running(broker)).toBe(false);
});
