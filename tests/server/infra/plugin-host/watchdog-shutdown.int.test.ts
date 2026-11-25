// @subject packages/server/src/infra/plugin-host/process-runtime.ts
// @subject packages/server/src/infra/plugin-host/broker-watchdog.ts
// Stopping the server stops the plugin host's processes over their IPC channels, never by a signal, so the stop works
// the same on Windows, macOS and Linux: each child sees its channel close, ends, and its parent waits for the exit. A
// child that cannot act on its stop is ended by its parent, and no watchdog or broker outlives the server.
// The first case runs on every platform in the contributor proof; the others hold a process with SIGSTOP, which
// Windows does not have, so they run on macOS and Linux only.
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { once } from "node:events";
import process from "node:process";
import type { PluginHostSeamDeps } from "@orb/server/infra/plugin-host";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { PLUGIN_WATCHDOG_STOP_GRACE_MS } from "#server/infra/plugin-host/budgets.ts";
import { BASE_GRANTS, brokerOf, installGuest, isRunning, NATIVE_TIMEOUT_MS, NOOP_COMMAND } from "./process-runtime.fixtures.ts";

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

// SIGSTOP holds a process on POSIX; Windows has no signal that holds one.
const HOLDS_A_PROCESS = process.platform !== "win32";

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
  // The watchdog prints its runtime line only above a silent log level; the line is this case's proof that its stderr was captured.
  await using root = await createServerHarness({ pluginSpawn: captured.spawn, logLevel: "info" });
  const { watchdog, broker } = await serveOnce(root, captured, "stop-clean");
  expect(isRunning(broker)).toBe(true);

  await root[Symbol.asyncDispose]();

  // The watchdog exited by itself, not by the host's fallback, and its broker did too, not by the liveness check.
  expect({ code: watchdog.exitCode, signal: watchdog.signalCode }).toEqual({ code: 0, signal: null });
  const log = captured.lines.join("");
  expect(log).toMatch(RUNTIME_LINE);
  expect(log).not.toMatch(STOP_IGNORED);
  expect(log).not.toMatch(RELAY_FAILURE);
  expect(isRunning(watchdog.pid)).toBe(false);
  expect(isRunning(broker)).toBe(false);
});

test.skipIf(!HOLDS_A_PROCESS)(
  "a broker that cannot act on its stop is ended by its watchdog's liveness check, and the watchdog still exits on its own",
  {
    timeout: NATIVE_TIMEOUT_MS,
  },
  async () => {
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
      if (isRunning(broker)) {
        process.kill(broker, "SIGKILL");
      }
    }

    expect({ code: watchdog.exitCode, signal: watchdog.signalCode }).toEqual({ code: 0, signal: null });
    const log = captured.lines.join("");
    expect(log).toMatch(STOP_IGNORED);
    expect(log).not.toMatch(RELAY_FAILURE);
    expect(isRunning(broker)).toBe(false);
  },
);

test.skipIf(!HOLDS_A_PROCESS)(
  "a connection the host finds broken is stopped over the channel too, so the watchdog still ends a broker that cannot act on it",
  {
    timeout: NATIVE_TIMEOUT_MS,
  },
  async () => {
    const captured = capturingSpawn();
    await using root = await createServerHarness({ pluginSpawn: captured.spawn });
    const { watchdog, broker } = await serveOnce(root, captured, "broken-connection");
    // A held broker cannot see its channel close: with its watchdog gone it would run on with no supervisor.
    process.kill(broker, "SIGSTOP");
    try {
      // An envelope the host cannot parse is a broken connection.
      watchdog.emit("message", { kind: "not-an-envelope" });
      await once(watchdog, "exit");
    } finally {
      if (isRunning(broker)) {
        process.kill(broker, "SIGKILL");
      }
    }

    expect({ code: watchdog.exitCode, signal: watchdog.signalCode }).toEqual({ code: 0, signal: null });
    expect(captured.lines.join("")).toMatch(STOP_IGNORED);
    expect(isRunning(broker)).toBe(false);
    // Positive control: the host replaces the stopped watchdog on its next call.
    const after = await installGuest(root, "after-broken", `const h=orb.host(1);${NOOP_COMMAND}`, BASE_GRANTS);
    expect((await after.enable()).status).toBe("enabled");
    await expect(after.invoke("noop")).resolves.toEqual({ toasts: [] });
    expect(captured.watchdogs).toHaveLength(2);
  },
);

test.skipIf(!HOLDS_A_PROCESS)(
  "a watchdog that ignores its stop is ended by the host's fallback, and its broker exits on the closed channel",
  {
    timeout: NATIVE_TIMEOUT_MS,
  },
  async () => {
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
    await expect.poll(() => isRunning(broker)).toBe(false);
  },
);
