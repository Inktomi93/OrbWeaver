// @subject packages/server/src/infra/plugin-host/broker-watchdog.ts
// The broker is replaced only when its own main thread stops answering its watchdog's heartbeat, never because a
// command or a Worker is late, and a replacement strikes no plugin (D347). The strike count is read from the plugin's
// row, which no door shows.
import { execFileSync } from "node:child_process";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import type { PluginStatus } from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { capturePluginRows } from "@orb/testkit/node/rows";
import {
  PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS,
  PLUGIN_BROKER_LIVENESS_BOUND_MS,
  PLUGIN_INVOCATION_CPU_MS,
  PLUGIN_WORKER_OVERRUN_MAX_MS,
} from "#server/infra/plugin-host/budgets.ts";
import { parsePluginIpcMessage } from "#server/infra/plugin-host/process-channel.ts";
import { BASE_GRANTS, createPluginProcessEdge, firstChild, installGuest, NATIVE_TIMEOUT_MS, NOOP_COMMAND } from "../process-runtime.fixtures.ts";

const ENABLED = "enabled" satisfies PluginStatus;
const BROKER_STOPPED = "stopped" satisfies NonNullable<ReturnType<typeof parsePluginIpcMessage>>["kind"];
// The watchdog judges once per interval, so it notices silence at most one interval late; the kill and the stopped
// report then cross two processes, given as much again.
const LIVENESS_BOUND_MS = PLUGIN_BROKER_LIVENESS_BOUND_MS + PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS;
const REPLACED_WITHIN_MS = 2 * LIVENESS_BOUND_MS;
// A watchdog stall twice the bound: past it whatever the stall's own jitter.
const WATCHDOG_STALL_MS = 2 * LIVENESS_BOUND_MS;
// One string search of minutes with no interrupt poll inside it.
const NATIVE_STALL = "'a'.repeat(400000).indexOf('a'.repeat(100000) + 'b');";
const STALL_COMMAND = `h.ui.registerCommand({name:"stall",describe:"One native call of minutes",onRun:()=>{${NATIVE_STALL}}});`;
// The broker ends a stuck Worker one span bound after its window opens; a green run waits that out once.
const STUCK_TEST_TIMEOUT_MS = 3 * (PLUGIN_INVOCATION_CPU_MS + PLUGIN_WORKER_OVERRUN_MAX_MS);

// The broker is the watchdog's one child process; this reads its pid from the operating system.
function brokerPid(edge: ReturnType<typeof createPluginProcessEdge>): number {
  return Number(execFileSync("pgrep", ["-P", String(firstChild(edge).pid)], { encoding: "utf8" }).trim());
}

function stoppedReports(edge: ReturnType<typeof createPluginProcessEdge>): readonly unknown[] {
  return edge.delivered.filter((value) => parsePluginIpcMessage(value)?.kind === BROKER_STOPPED);
}

async function crashesOf(
  root: Parameters<typeof capturePluginRows>[0],
  ownerId: Parameters<typeof capturePluginRows>[1],
  pluginId: Parameters<typeof capturePluginRows>[2],
): Promise<number> {
  return (await capturePluginRows(root, ownerId, pluginId)).plugin.consecutiveCrashes;
}

test("a broker whose main thread stops answering is replaced within the heartbeat bound, and no plugin is struck", {
  tags: ["slow"],
  timeout: NATIVE_TIMEOUT_MS,
}, async () => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const caller = await installGuest(root, "caller", `const h=orb.host(1);${NOOP_COMMAND}`, BASE_GRANTS);
  const bystander = await installGuest(root, "bystander", `const h=orb.host(1);${NOOP_COMMAND}`, BASE_GRANTS);
  expect((await caller.enable()).status).toBe(ENABLED);
  expect((await bystander.enable()).status).toBe(ENABLED);
  await caller.invoke("noop");
  await bystander.invoke("noop");
  const hung = brokerPid(edge);

  // A stopped process runs nothing: its heartbeat timer is as silent as a hung main thread's.
  process.kill(hung, "SIGSTOP");
  const stoppedAt = performance.now();
  await expect(caller.invoke("noop")).toThrowTRPCError("CONFLICT");
  const failedAfterMs = performance.now() - stoppedAt;
  expect(failedAfterMs).toBeGreaterThan(PLUGIN_BROKER_LIVENESS_BOUND_MS - PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS);
  expect(failedAfterMs).toBeLessThan(REPLACED_WITHIN_MS);
  expect(stoppedReports(edge)).toHaveLength(1);

  // What a bystander sees: its binding crashed with the broker as a host loss, so its calls fail as host-unavailable,
  // with no strike, until it is enabled again; then a new broker serves it.
  await expect(bystander.invoke("noop")).toThrowTRPCError("CONFLICT");
  expect((await bystander.view()).status).toBe(ENABLED);
  expect(await crashesOf(root.db, root.ownerId, caller.pluginId)).toBe(0);
  expect(await crashesOf(root.db, root.ownerId, bystander.pluginId)).toBe(0);
  await bystander.disable();
  expect((await bystander.enable()).status).toBe(ENABLED);
  await bystander.invoke("noop");
  expect(brokerPid(edge)).not.toBe(hung);
});

test("a watchdog that stalls past the liveness bound keeps a broker that went on answering", { tags: ["slow"], timeout: NATIVE_TIMEOUT_MS }, async () => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const guest = await installGuest(root, "kept", `const h=orb.host(1);${NOOP_COMMAND}`, BASE_GRANTS);
  expect((await guest.enable()).status).toBe(ENABLED);
  await guest.invoke("noop");
  const live = brokerPid(edge);
  const watchdog = firstChild(edge).pid;
  if (watchdog === undefined) {
    throw new Error("the production host did not spawn its watchdog");
  }

  // The broker's heartbeats wait in the stopped watchdog's pipe; on resume they are read before the broker is judged.
  process.kill(watchdog, "SIGSTOP");
  await sleep(WATCHDOG_STALL_MS);
  process.kill(watchdog, "SIGCONT");
  await sleep(LIVENESS_BOUND_MS);

  expect(stoppedReports(edge)).toEqual([]);
  expect(brokerPid(edge)).toBe(live);
  await guest.invoke("noop");
});

test("a broker whose every Worker is stuck in a native call keeps answering its watchdog and is not replaced", {
  tags: ["slow"],
  timeout: STUCK_TEST_TIMEOUT_MS,
}, async () => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const guests = [
    await installGuest(root, "stuck-a", `const h=orb.host(1);${NOOP_COMMAND}${STALL_COMMAND}`, BASE_GRANTS),
    await installGuest(root, "stuck-b", `const h=orb.host(1);${NOOP_COMMAND}${STALL_COMMAND}`, BASE_GRANTS),
  ];
  for (const guest of guests) {
    expect((await guest.enable()).status).toBe(ENABLED);
    await guest.invoke("noop");
  }
  const live = brokerPid(edge);

  // Each stall ends as its own invocation, ended by the broker that kept running, never as a host loss.
  const outcomes = await Promise.allSettled(guests.map((guest) => guest.invoke("stall")));
  expect(outcomes).toEqual(guests.map(() => ({ status: "rejected", reason: expect.objectContaining({ code: "BAD_REQUEST" }) })));
  expect(stoppedReports(edge)).toEqual([]);
  expect(brokerPid(edge)).toBe(live);
  for (const guest of guests) {
    await guest.invoke("noop");
  }
});
