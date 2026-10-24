// @subject packages/server/src/infra/plugin-host/process-runtime.ts
// Command continuations that outlive their return, against a real plugin-host child; each case owns its child process.
import { PLUGIN_CONTINUATION_WINDOW_MS } from "@orb/contracts/plugin";
import { globalVariables } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import {
  BASE_GRANTS,
  bridgeRequest,
  createPluginProcessEdge,
  FLOOD_HOST_CALLS,
  floatCommand,
  hasOperation,
  installGuest,
  NATIVE_TIMEOUT_MS,
  PLUGIN_PROCESS_OPERATIONS as OP,
  releasedAuthorities,
  STOPPED,
} from "./process-runtime.fixtures.ts";

test("the parent expires a returned command authority while its real Worker continuation remains parked", { timeout: NATIVE_TIMEOUT_MS }, async () => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const guest = await installGuest(root, "expired-tail", floatCommand('await h.storage.set("late","forbidden");'), BASE_GRANTS);
  expect((await guest.enable()).status).toBe("enabled");
  await expect.poll(() => releasedAuthorities(edge)).toBe(1);
  await root.settleBackground();
  const timersBefore = root.timers.pending();
  using delivery = edge.holdNext((value) => hasOperation(value, OP.read));
  const invoking = guest.invoke("float");
  const settled = Promise.allSettled([invoking]);
  await delivery.reached;
  await expect(invoking).resolves.toEqual({ toasts: [] });
  await settled;
  expect(root.timers.pending()).toBeGreaterThan(timersBefore);
  root.timers.advance(PLUGIN_CONTINUATION_WINDOW_MS);
  delivery.release();
  await expect.poll(async () => (await guest.log()).map((line) => line.message).join("\n")).toContain("stale command authority");
  expect((await guest.rows()).kv).toEqual([]);
  await expect(guest.invoke("noop")).resolves.toEqual({ toasts: [] });
});

test("a valid floated continuation persists after return and its tail timers clear on completion and retirement", { timeout: NATIVE_TIMEOUT_MS }, async () => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const guest = await installGuest(root, "released-tail", floatCommand('await h.storage.set("late","allowed");'), BASE_GRANTS);
  expect((await guest.enable()).status).toBe("enabled");
  await expect.poll(() => releasedAuthorities(edge)).toBe(1);
  await root.settleBackground();
  const baseline = root.timers.pending();
  using first = edge.holdNext((value) => hasOperation(value, OP.read));
  const running = guest.invoke("float");
  const settled = Promise.allSettled([running]);
  await first.reached;
  await expect(running).resolves.toEqual({ toasts: [] });
  await settled;
  expect(root.timers.pending()).toBeGreaterThan(baseline);
  first.release();
  await expect.poll(() => guest.read("late")).toBe("allowed");
  await expect.poll(() => releasedAuthorities(edge)).toBe(2);
  await root.settleBackground();
  await expect.poll(() => root.timers.pending()).toBe(baseline);
  using second = edge.holdNext((value) => hasOperation(value, OP.read));
  const retiring = guest.invoke("float");
  const retired = Promise.allSettled([retiring]);
  await second.reached;
  await expect(retiring).resolves.toEqual({ toasts: [] });
  await retired;
  expect(root.timers.pending()).toBeGreaterThan(baseline);
  await guest.disable();
  await expect.poll(() => root.timers.pending()).toBe(baseline);
  second.release();
});

test("a returned command continuation reaches the parent's call limit rather than completing an unbounded chain", { timeout: NATIVE_TIMEOUT_MS }, async () => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const guest = await installGuest(
    root,
    "bounded-tail",
    floatCommand(`for(let i=0;i<${FLOOD_HOST_CALLS};i++){await h.storage.get("spin");}h.log.warn("unbounded completion");`),
    BASE_GRANTS,
  );
  expect((await guest.enable()).status).toBe("enabled");
  using delivery = edge.holdNext((value) => hasOperation(value, OP.read));
  const invoking = guest.invoke("float");
  const settled = Promise.allSettled([invoking]);
  await delivery.reached;
  await expect(invoking).resolves.toEqual({ toasts: [] });
  await settled;
  delivery.release();
  await expect.poll(async () => (await guest.log()).map((line) => line.message).join("\n")).toContain("continuation call budget");
  expect((await guest.log()).some((line) => line.message === "unbounded completion")).toBe(false);
  const reads = edge.delivered.filter((value) => hasOperation(value, OP.read));
  expect(reads.length).toBeGreaterThan(1);
  expect(reads.length).toBeLessThan(FLOOD_HOST_CALLS);
  await expect(guest.invoke("noop")).resolves.toEqual({ toasts: [] });
});

test("the parent rechecks a floated command's frozen grants on actual inherited-channel input", { timeout: NATIVE_TIMEOUT_MS }, async () => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const guest = await installGuest(root, "frozen-grants", floatCommand('h.log.info("allowed completion");'), BASE_GRANTS);
  expect((await guest.enable()).status).toBe("enabled");
  const before = await root.db.select().from(globalVariables);
  using delivery = edge.holdNext((value) => hasOperation(value, OP.read));
  const invoking = guest.invoke("float");
  const settled = Promise.allSettled([invoking]);
  const frame = await delivery.reached;
  await expect(invoking).resolves.toEqual({ toasts: [] });
  await settled;
  delivery.release(bridgeRequest(frame, OP.variableWrite, ["unauthorized", "must-not-land"]));
  await expect
    .poll(async () => (await guest.log()).map((line) => line.message))
    .toContain(`${STOPPED}Error:plugin broker: variables.set lacks capability global_vars`);
  expect(await root.db.select().from(globalVariables)).toEqual(before);
  expect((await guest.log()).some((line) => line.message === "allowed completion")).toBe(false);
  await expect(guest.invoke("noop")).resolves.toEqual({ toasts: [] });
});

test("a real guest continuation retains its membrane grant refusal after the command returns", { timeout: NATIVE_TIMEOUT_MS }, async () => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const guest = await installGuest(root, "guest-frozen-grants", floatCommand('await h.variables.set("unauthorized","must-not-land");'), BASE_GRANTS);
  expect((await guest.enable()).status).toBe("enabled");
  const before = await root.db.select().from(globalVariables);
  using delivery = edge.holdNext((value) => hasOperation(value, OP.read));
  const invoking = guest.invoke("float");
  const settled = Promise.allSettled([invoking]);
  await delivery.reached;
  await expect(invoking).resolves.toEqual({ toasts: [] });
  await settled;
  delivery.release();
  await expect.poll(async () => (await guest.log()).map((line) => line.message).join("\n")).toContain(`${STOPPED}PluginCapabilityError:`);
  expect(await root.db.select().from(globalVariables)).toEqual(before);
  expect(edge.delivered.some((value) => hasOperation(value, OP.variableWrite))).toBe(false);
});
