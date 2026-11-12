// @subject packages/server/src/infra/plugin-host/broker-watchdog.ts
// The broker is replaced only when its own main thread stops answering its watchdog's heartbeat, never because a
// command or a Worker is late, and a replacement strikes no plugin (D347). The strike count is read from the plugin's
// row, which no door shows.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import type { PluginStatus } from "@orb/contracts/plugin";
import { brandedId, createIdSource } from "@orb/kit/ids";
import { systemTimers } from "@orb/server/infra/timers";
import { createFrozenClock } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, guestRunner, installGuest as installOwnedGuest } from "@orb/testkit/node/composed";
import { capturePluginRows } from "@orb/testkit/node/rows";
import {
  PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS,
  PLUGIN_BROKER_LIVENESS_BOUND_MS,
  PLUGIN_BROKER_LOSS_WINDOW_MS,
  PLUGIN_BROKER_LOSSES_MAX,
  PLUGIN_INVOCATION_CPU_MS,
  PLUGIN_WORKER_OVERRUN_MAX_MS,
  PLUGIN_WORKER_SPAN_CHECK_MS,
  pluginBrokerRestartHoldMs,
} from "#server/infra/plugin-host/budgets.ts";
import { parsePluginIpcMessage } from "#server/infra/plugin-host/process-channel.ts";
import { BASE_GRANTS, createPluginProcessEdge, firstChild, installGuest, NATIVE_TIMEOUT_MS, NOOP_COMMAND } from "../process-runtime.fixtures.ts";

const ENABLED = "enabled" satisfies PluginStatus;
const BYSTANDER_HANDLE = brandedId("Handle").parse("halt-bystander");
const BYSTANDER_SLUG = "other-owners-plugin";
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

// The broker is the watchdog's one child process, and no production surface names its pid, so this reads it from the
// watchdog's Linux process entry.
function brokerPid(edge: ReturnType<typeof createPluginProcessEdge>): number {
  const watchdog = firstChild(edge).pid;
  const children = readFileSync(`/proc/${String(watchdog)}/task/${String(watchdog)}/children`, "utf8")
    .trim()
    .split(" ");
  expect(children).toHaveLength(1);
  return Number(children[0]);
}

function stoppedReports(edge: ReturnType<typeof createPluginProcessEdge>): readonly unknown[] {
  return edge.delivered.filter((value) => parsePluginIpcMessage(value)?.kind === BROKER_STOPPED);
}

// The host's monotonic clock, stepped by the test; production timers run in real time beside it. A root with its own
// time takes its database and owner from a seed root.
function steppedTime(): {
  readonly clock: { at: number };
  readonly time: { readonly now: () => number; readonly monotonicNow: () => number; readonly timers: typeof systemTimers };
} {
  const clock = { at: 0 };
  return { clock, time: { now: createFrozenClock().now, monotonicNow: (): number => clock.at, timers: systemTimers } };
}

// Ends the broker the way any crash does; the production watchdog reports it stopped and starts a replacement.
async function loseBroker(edge: ReturnType<typeof createPluginProcessEdge>, losses: number): Promise<void> {
  process.kill(brokerPid(edge), "SIGKILL");
  await expect.poll(() => stoppedReports(edge).length, { timeout: REPLACED_WITHIN_MS }).toBe(losses);
}

async function crashesOf(
  root: Parameters<typeof capturePluginRows>[0],
  ownerId: Parameters<typeof capturePluginRows>[1],
  pluginId: Parameters<typeof capturePluginRows>[2],
): Promise<number> {
  return (await capturePluginRows(root, ownerId, pluginId)).plugin.consecutiveCrashes;
}

test("a broker whose main thread stops answering is replaced within the heartbeat bound, and every plugin is served by the new one unstruck", {
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
  // A red run never ends this broker, and the root's teardown would wait on it while stopped: resume it on the way out.
  using _resumed = {
    [Symbol.dispose]: (): void => {
      if (existsSync(`/proc/${String(hung)}`)) {
        process.kill(hung, "SIGCONT");
      }
    },
  };

  // A stopped process runs nothing: its heartbeat timer is as silent as a hung main thread's.
  process.kill(hung, "SIGSTOP");
  const stoppedAt = performance.now();
  // Raced against twice the replacement bound, so a broker that is never replaced fails here and the resume above runs.
  await expect(Promise.race([caller.invoke("noop"), sleep(2 * REPLACED_WITHIN_MS)])).toThrowTRPCError("CONFLICT");
  const failedAfterMs = performance.now() - stoppedAt;
  expect(failedAfterMs).toBeGreaterThan(PLUGIN_BROKER_LIVENESS_BOUND_MS - PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS);
  expect(failedAfterMs).toBeLessThan(REPLACED_WITHIN_MS);
  expect(stoppedReports(edge)).toHaveLength(1);

  // What a bystander sees: nothing. Its owner does nothing, and its next call is served by the new broker, unstruck.
  await bystander.invoke("noop");
  await caller.invoke("noop");
  expect(brokerPid(edge)).not.toBe(hung);
  expect((await bystander.view()).status).toBe(ENABLED);
  expect(await crashesOf(root.db, root.ownerId, caller.pluginId)).toBe(0);
  expect(await crashesOf(root.db, root.ownerId, bystander.pluginId)).toBe(0);
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

// The broker ends a Worker stuck in one native call at its span bound, one check late at most: past the time a paused
// watchdog's beat pipe takes to fill. The pause outlasts that end by two liveness bounds.
const STUCK_ENDED_BY_MS = PLUGIN_INVOCATION_CPU_MS + PLUGIN_WORKER_OVERRUN_MAX_MS + PLUGIN_WORKER_SPAN_CHECK_MS;
const PAUSE_SAMPLE_MS = 10 * PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS;
const PAUSE_SAMPLES = Math.ceil((STUCK_ENDED_BY_MS + 2 * LIVENESS_BOUND_MS) / PAUSE_SAMPLE_MS);

// The broker's thread count from its Linux process entry: a Worker ended is a thread gone.
function brokerThreads(pid: number): number {
  return readdirSync(`/proc/${String(pid)}/task`).length;
}

test("a watchdog paused past the time the beat pipe takes to fill leaves the broker's main thread running, and the same broker serves on after", {
  tags: ["slow"],
  timeout: PAUSE_SAMPLES * PAUSE_SAMPLE_MS + NATIVE_TIMEOUT_MS,
}, async () => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const culprit = await installGuest(root, "paused-culprit", `const h=orb.host(1);${NOOP_COMMAND}${STALL_COMMAND}`, BASE_GRANTS);
  const bystander = await installGuest(root, "paused-bystander", `const h=orb.host(1);${NOOP_COMMAND}`, BASE_GRANTS);
  expect((await culprit.enable()).status).toBe(ENABLED);
  expect((await bystander.enable()).status).toBe(ENABLED);
  await culprit.invoke("noop");
  await bystander.invoke("noop");
  const broker = brokerPid(edge);
  const watchdog = firstChild(edge).pid;
  if (watchdog === undefined) {
    throw new Error("the production host did not spawn its watchdog");
  }

  // The stall crosses the watchdog into the broker before the pause; its answer waits for the resume.
  const stalled: Promise<unknown> = culprit.invoke("stall").catch((error: unknown) => error);
  await sleep(LIVENESS_BOUND_MS);
  const threadsAtPause = brokerThreads(broker);

  // A paused watchdog stops reading the beat pipe, which fills. A broker whose beat write blocked on it would sit in
  // that write and could not end the stalled Worker; a running one ends it during the pause, a thread gone.
  process.kill(watchdog, "SIGSTOP");
  let fewestThreads = threadsAtPause;
  try {
    for (let sample = 0; sample < PAUSE_SAMPLES; sample += 1) {
      await sleep(PAUSE_SAMPLE_MS);
      fewestThreads = Math.min(fewestThreads, brokerThreads(broker));
    }
  } finally {
    process.kill(watchdog, "SIGCONT");
  }
  expect(fewestThreads).toBeLessThan(threadsAtPause);

  // After the resume the broker is the same process and was never replaced: its beats resumed within the bound.
  expect(await stalled).toMatchObject({ code: "BAD_REQUEST" });
  await sleep(LIVENESS_BOUND_MS);
  expect(stoppedReports(edge)).toEqual([]);
  expect(brokerPid(edge)).toBe(broker);
  await culprit.invoke("noop");
  await bystander.invoke("noop");
  expect(await crashesOf(root.db, root.ownerId, bystander.pluginId)).toBe(0);
});

// One loss of every run past the bound, plus the replacements before it, each a real broker start.
const BOUND_TEST_TIMEOUT_MS = (PLUGIN_BROKER_LOSSES_MAX + 2) * (REPLACED_WITHIN_MS + NATIVE_TIMEOUT_MS);

test("a watchdog that stops itself, reporting its broker stopped and then exiting, is one broker loss", {
  tags: ["slow"],
  timeout: NATIVE_TIMEOUT_MS,
}, async () => {
  const edge = createPluginProcessEdge();
  const { time } = steppedTime();
  await using seed = await createServerHarness({ startJobs: false });
  await using root = await createServerHarness({
    db: seed.db,
    ownerId: seed.ownerId,
    idSource: createIdSource(),
    startJobs: false,
    pluginSpawn: edge.spawn,
    time,
  });
  const guest = await installGuest(root, "stopped-once", `const h=orb.host(1);${NOOP_COMMAND}`, BASE_GRANTS);
  expect((await guest.enable()).status).toBe(ENABLED);
  await guest.invoke("noop");
  const watchdog = firstChild(edge);
  if (watchdog.pid === undefined) {
    throw new Error("the production host did not spawn its watchdog");
  }

  // Told to stop, the watchdog ends its broker, reports it stopped, and exits: both reach the host before the call.
  process.kill(watchdog.pid, "SIGTERM");
  await expect.poll(() => watchdog.exitCode !== null || watchdog.signalCode !== null, { timeout: REPLACED_WITHIN_MS }).toBe(true);
  expect(stoppedReports(edge)).toHaveLength(1);

  // One loss holds nothing, on a clock that never moves: a second counted loss would hold this call.
  expect(pluginBrokerRestartHoldMs(1)).toBe(0);
  await guest.invoke("noop");
  expect(edge.children).toHaveLength(2);
});

test("repeated broker losses inside the window hold plugin calls for a doubling time, then stop the host and tell each owner which of their plugins ran at each loss", {
  tags: ["slow"],
  timeout: BOUND_TEST_TIMEOUT_MS,
}, async () => {
  const edge = createPluginProcessEdge();
  const { clock, time } = steppedTime();
  await using seed = await createServerHarness({ startJobs: false });
  const bystanderId = await seed.app.sessions.ensureUser(BYSTANDER_HANDLE);
  await using root = await createServerHarness({
    db: seed.db,
    ownerId: seed.ownerId,
    idSource: createIdSource(),
    startJobs: false,
    pluginSpawn: edge.spawn,
    time,
  });
  const guest = await installGuest(root, "lost-often", `const h=orb.host(1);${NOOP_COMMAND}`, BASE_GRANTS);
  expect((await guest.enable()).status).toBe(ENABLED);
  await guest.invoke("noop");
  // Another owner's plugin runs on the same broker at the first loss only.
  const bystander = await root.principalFor(bystanderId);
  const bystanderPlugin = await installOwnedGuest(
    root,
    bystander,
    { slug: BYSTANDER_SLUG, capabilities: ["storage.kv"] },
    { ping: "(h) => h.storage.get('k')" },
  );
  expect(await guestRunner({ root, caller: bystander, pluginId: bystanderPlugin, chatId: null })("ping")).toEqual({ ok: true, value: null });

  // A lone loss recovers at once.
  await loseBroker(edge, 1);
  expect(pluginBrokerRestartHoldMs(1)).toBe(0);
  await guest.invoke("noop");
  for (let loss = 2; loss <= PLUGIN_BROKER_LOSSES_MAX; loss += 1) {
    await loseBroker(edge, loss);
    // Held: refused as host-unavailable, never a strike, until the hold passes on the host's clock.
    clock.at += pluginBrokerRestartHoldMs(loss) - 1;
    await expect(guest.invoke("noop")).toThrowTRPCError("CONFLICT");
    clock.at += 1;
    await guest.invoke("noop");
    expect((await guest.view()).lastError).toBeNull();
  }

  // One loss more inside the window stops the host: no broker starts again, and each owner's rows say why, naming only
  // that owner's plugins that ran at each loss.
  await loseBroker(edge, PLUGIN_BROKER_LOSSES_MAX + 1);
  await expect(guest.invoke("noop")).toThrowTRPCError("CONFLICT");
  await expect.poll(async () => (await guest.view()).lastError).not.toBeNull();
  const ownRecord = (await guest.view()).lastError ?? "";
  for (let loss = 1; loss <= PLUGIN_BROKER_LOSSES_MAX + 1; loss += 1) {
    expect(ownRecord).toContain(`${String(loss)}: lost-often`);
  }
  expect(ownRecord).not.toContain(BYSTANDER_SLUG);
  const bystanderRecord = (await root.services.plugin.list({ caller: bystander })).find(({ id }) => id === bystanderPlugin)?.lastError ?? "";
  expect(bystanderRecord).toContain(`1: ${BYSTANDER_SLUG}`);
  expect(bystanderRecord).toContain("2: none");
  expect(bystanderRecord).not.toContain("lost-often");
  await expect.poll(() => firstChild(edge).exitCode !== null || firstChild(edge).signalCode !== null, { timeout: REPLACED_WITHIN_MS }).toBe(true);
  await expect(guest.invoke("noop")).toThrowTRPCError("CONFLICT");
  expect(edge.children).toHaveLength(1);
  expect((await guest.view()).status).toBe(ENABLED);
  expect(await crashesOf(root.db, root.ownerId, guest.pluginId)).toBe(0);
});

test("broker losses further apart than the window never add up, and never stop the host", {
  tags: ["slow"],
  timeout: BOUND_TEST_TIMEOUT_MS,
}, async () => {
  const edge = createPluginProcessEdge();
  const { clock, time } = steppedTime();
  await using seed = await createServerHarness({ startJobs: false });
  await using root = await createServerHarness({
    db: seed.db,
    ownerId: seed.ownerId,
    idSource: createIdSource(),
    startJobs: false,
    pluginSpawn: edge.spawn,
    time,
  });
  const guest = await installGuest(root, "lost-rarely", `const h=orb.host(1);${NOOP_COMMAND}`, BASE_GRANTS);
  expect((await guest.enable()).status).toBe(ENABLED);
  await guest.invoke("noop");

  for (let loss = 1; loss <= PLUGIN_BROKER_LOSSES_MAX + 1; loss += 1) {
    clock.at += PLUGIN_BROKER_LOSS_WINDOW_MS;
    await loseBroker(edge, loss);
    // Each loss is the first inside its window, so the next call is served at once.
    await guest.invoke("noop");
  }
  expect((await guest.view()).lastError).toBeNull();
});
