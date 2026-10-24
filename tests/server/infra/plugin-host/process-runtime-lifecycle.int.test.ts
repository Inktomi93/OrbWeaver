// @subject packages/server/src/infra/plugin-host/process-runtime.ts
// Watchdog loss, readiness and revocation against a real plugin-host child; each case owns its child process.
import { once } from "node:events";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import {
  BASE_GRANTS,
  createPluginProcessEdge,
  firstChild,
  hasOperation,
  installGuest,
  NATIVE_TIMEOUT_MS,
  NOOP_COMMAND,
  PLUGIN_PROCESS_OPERATIONS as OP,
} from "./process-runtime.fixtures.ts";

test("watchdog loss during activation fails closed without replay and permits only an explicit fresh activation", { timeout: NATIVE_TIMEOUT_MS }, async () => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const guest = await installGuest(root, "activation-loss", `const h=orb.host(1);h.ids.mint();h.storage.set("activation","once");${NOOP_COMMAND}`, BASE_GRANTS);
  using delivery = edge.holdNext((value) => hasOperation(value, OP.mint));
  const activating = Promise.allSettled([guest.enable()]);
  await delivery.reached;
  const child = firstChild(edge);
  const exited = once(child, "exit");
  child.ref();
  expect(child.kill("SIGKILL")).toBe(true);
  await exited;
  delivery.release();
  expect(await activating).toMatchObject([
    { status: "rejected", reason: { name: "PluginHostUnavailable", message: expect.stringContaining("broker became unavailable") } },
  ]);
  expect((await guest.rows()).plugin).toMatchObject({ status: "disabled", grantedCapabilities: [...BASE_GRANTS] });
  expect((await guest.rows()).kv).toEqual([]);
  expect(edge.children).toHaveLength(1);
  expect((await guest.enable()).status).toBe("enabled");
  expect(await guest.read("activation")).toBe("once");
  await expect(guest.invoke("noop")).resolves.toEqual({ toasts: [] });
  expect(edge.children).toHaveLength(2);
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

test("unexpected loss rejects a parked invocation and old callbacks before explicit recovery", { timeout: NATIVE_TIMEOUT_MS }, async () => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const guest = await installGuest(
    root,
    "invoke-loss",
    `const h=orb.host(1);${NOOP_COMMAND}
    h.ui.registerCommand({name:"wait",describe:"Park a read",onRun:async()=>{await h.storage.get("gate");await h.storage.set("late","forbidden");}});`,
    BASE_GRANTS,
  );
  expect((await guest.enable()).status).toBe("enabled");
  using delivery = edge.holdNext((value) => hasOperation(value, OP.read));
  const running = Promise.allSettled([guest.invoke("wait")]);
  await delivery.reached;
  const child = firstChild(edge);
  const exited = once(child, "exit");
  child.ref();
  expect(child.kill("SIGKILL")).toBe(true);
  await exited;
  delivery.release();
  expect(await running).toMatchObject([{ status: "rejected" }]);
  await expect(guest.invoke("noop")).rejects.toThrow();
  expect((await guest.rows()).kv).toEqual([]);
  expect(edge.children).toHaveLength(1);
  await guest.disable();
  expect((await guest.enable()).status).toBe("enabled");
  await expect(guest.invoke("noop")).resolves.toEqual({ toasts: [] });
  expect(edge.children).toHaveLength(2);
});

test("a real write queued before disable cannot alter owned persistence after its runtime is revoked", { timeout: NATIVE_TIMEOUT_MS }, async () => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const guest = await installGuest(
    root,
    "late-frame",
    `const h=orb.host(1);h.storage.set("positive","kept");
    h.ui.registerCommand({name:"write",describe:"Write after admission",onRun:async()=>{await h.storage.set("late","landed");}});`,
    BASE_GRANTS,
  );
  expect((await guest.enable()).status).toBe("enabled");
  expect(await guest.read("positive")).toBe("kept");
  using delivery = edge.holdNext((value) => hasOperation(value, OP.write));
  const running = Promise.allSettled([guest.invoke("write")]);
  await delivery.reached;
  const before = (await guest.rows()).kv;
  await guest.disable();
  delivery.release();
  expect(await running).toMatchObject([{ status: "rejected" }]);
  expect((await guest.rows()).kv).toEqual(before);
  expect((await guest.rows()).plugin.status).toBe("disabled");
  expect((await guest.enable()).status).toBe("enabled");
  await guest.invoke("write");
  expect(await guest.read("late")).toBe("landed");
});
