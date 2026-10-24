import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import {
  BASE_GRANTS,
  createPluginProcessEdge,
  firstChild,
  frameField,
  installGuest,
  NATIVE_TIMEOUT_MS,
  NOOP_COMMAND,
  releasedAuthorities,
} from "./process-runtime.fixtures.ts";

test("retiring a disabled guest's runtime draws no business id, whenever its worker answers", { timeout: NATIVE_TIMEOUT_MS }, async () => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const guest = await installGuest(root, "retire-draws", `const h=orb.host(1);${NOOP_COMMAND}`, BASE_GRANTS);
  expect((await guest.enable()).status).toBe("enabled");
  using dispose = edge.holdNext((value) => frameField(value, "kind") === "response");
  const disabling = guest.disable();
  await dispose.reached;
  // Everything the verb draws is spent once it returns; only the late retirement can draw after the probe.
  await disabling;
  const before = root.ids.snapshot();
  dispose.release();
  await root.settleBackground();
  await expect.poll(() => releasedAuthorities(edge)).toBeGreaterThan(0);
  expect(root.ids.snapshot()).toBe(before);
});

test("a binding waiting for ready survives a delayed old-child exit and activates exactly once", { timeout: NATIVE_TIMEOUT_MS }, async () => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const victim = await installGuest(root, "old-connection", `const h=orb.host(1);${NOOP_COMMAND}`, BASE_GRANTS);
  expect((await victim.enable()).status).toBe("enabled");
  using oldExit = edge.holdNext(() => true, "exit");
  const child = firstChild(edge);
  child.ref();
  expect(child.kill("SIGKILL")).toBe(true);
  await oldExit.reached;
  await expect(victim.invoke("noop")).rejects.toThrow();
  const bystander = await installGuest(
    root,
    "new-connection",
    `const h=orb.host(1);${NOOP_COMMAND}
    void(async()=>{const prior=await h.storage.get("activation");await h.storage.set("activation",(prior||"")+"x");})();`,
    BASE_GRANTS,
  );
  const timersBefore = root.timers.pending();
  const activating = bystander.enable();
  const settled = Promise.allSettled([activating]);
  await expect.poll(() => root.timers.pending()).toBeGreaterThan(timersBefore);
  expect(edge.children).toHaveLength(1);
  oldExit.release();
  expect(await settled).toMatchObject([{ status: "fulfilled", value: { status: "enabled" } }]);
  expect(await bystander.read("activation")).toBe("x");
  expect(edge.children).toHaveLength(2);
  await expect(bystander.invoke("noop")).resolves.toEqual({ toasts: [] });
});
