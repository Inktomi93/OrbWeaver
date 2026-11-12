// @subject packages/server/src/infra/plugin-host/broker-watchdog.ts
// A watchdog that is stopping logs no relay failure: a frame the app sent while the watchdog shut its broker down is
// part of the shutdown, not a broken relay, so a failure line in the watchdog's log always means a real one.
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { constants } from "node:os";
import process from "node:process";
import type { PluginHostSeamDeps } from "@orb/server/infra/plugin-host";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS } from "#server/infra/plugin-host/budgets.ts";
import { BASE_GRANTS, installGuest, NATIVE_TIMEOUT_MS, NOOP_COMMAND } from "./process-runtime.fixtures.ts";

const STDERR = 2;
// Every channel failure the watchdog reports.
const RELAY_FAILURE = /plugin broker watchdog: the [a-z-]+ relay failed/u;
// A line the watchdog writes once its broker runs: proof the capture reads the watchdog's log at all.
const RUNTIME_LINE = /plugin broker watchdog: runtime/u;
// A Linux pending-signal mask sets bit (signal - 1) for each signal waiting.
const SIGTERM_BIT = 2n ** BigInt(constants.signals.SIGTERM - 1);
// The watchdog ends a silent broker one liveness bound after it stops, so the stop is read well inside that bound.
const PENDING_POLL_MS = PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS / 5;

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

// The broker is the watchdog's one child process, and no production surface names its pid.
function brokerPidOf(watchdog: number): number {
  return Number(
    readFileSync(`/proc/${String(watchdog)}/task/${String(watchdog)}/children`, "utf8")
      .trim()
      .split(" ")[0],
  );
}

// Whether a SIGTERM waits on a process, from its Linux status masks.
function sigtermPending(pid: number): boolean {
  const status = readFileSync(`/proc/${String(pid)}/status`, "utf8");
  return ["SigPnd", "ShdPnd"].some((mask) => {
    const hex = new RegExp(`^${mask}:\\s*([0-9a-f]+)$`, "mu").exec(status)?.[1];
    return hex !== undefined && (BigInt(`0x${hex}`) / SIGTERM_BIT) % 2n === 1n;
  });
}

test("a frame the app sends while the watchdog stops its broker logs no relay failure", { timeout: NATIVE_TIMEOUT_MS }, async () => {
  const captured = capturingSpawn();
  {
    await using root = await createServerHarness({ pluginSpawn: captured.spawn });
    const guest = await installGuest(root, "shutdown", `const h=orb.host(1);${NOOP_COMMAND}`, BASE_GRANTS);
    expect((await guest.enable()).status).toBe("enabled");
    await guest.invoke("noop");
    const [watchdog] = captured.watchdogs;
    if (watchdog?.pid === undefined) {
      throw new Error("the production host did not spawn its watchdog");
    }
    const broker = brokerPidOf(watchdog.pid);

    // Holding the broker keeps the watchdog inside its shutdown: told to stop, it closes its relay to the broker and
    // signals it, then waits for an exit the stopped broker cannot make.
    process.kill(broker, "SIGSTOP");
    try {
      process.kill(watchdog.pid, "SIGTERM");
      await expect.poll(() => sigtermPending(broker), { interval: PENDING_POLL_MS }).toBe(true);
      // The app's next frame reaches a watchdog that is stopping.
      await expect(guest.invoke("noop")).toThrowTRPCError("CONFLICT");
    } finally {
      // The watchdog's liveness check may already have ended the silent broker.
      if (existsSync(`/proc/${String(broker)}`)) {
        process.kill(broker, "SIGCONT");
      }
    }
  }
  const log = captured.lines.join("");
  expect(log).toMatch(RUNTIME_LINE);
  expect(log).not.toMatch(RELAY_FAILURE);
});
