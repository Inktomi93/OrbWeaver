import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import {
  BASE_GRANTS,
  createPluginProcessEdge,
  FLOOD_HOST_CALLS,
  floatCommand,
  hasOperation,
  installGuest,
  NATIVE_TIMEOUT_MS,
  PLUGIN_PROCESS_OPERATIONS as OP,
  releasedAuthorities,
} from "./process-runtime.fixtures.ts";

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
