// Plugin process revocation and frozen grants against stored rows: a refused floated or continued write
// leaves global_variables unchanged, and a lost, disabled or expired runtime leaves the plugin_kv rows as they were.
// @subject packages/server/src/infra/plugin-host/process-runtime.ts

import { once } from "node:events";
import { PLUGIN_CONTINUATION_WINDOW_MS } from "@orb/contracts/plugin";
import { globalVariables } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { capturePluginRows } from "@orb/testkit/node/rows";
import {
  BASE_GRANTS,
  bridgeRequest,
  createPluginProcessEdge,
  firstChild,
  floatCommand,
  hasOperation,
  installGuest,
  NATIVE_TIMEOUT_MS,
  NOOP_COMMAND,
  PLUGIN_PROCESS_OPERATIONS as OP,
  releasedAuthorities,
  STOPPED,
} from "../../../infra/plugin-host/process-runtime.fixtures.ts";

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
  expect(await guest.view()).toMatchObject({ status: "disabled", grantedCapabilities: [...BASE_GRANTS] });
  expect((await capturePluginRows(root.db, root.ownerId, guest.pluginId)).kv).toEqual([]);
  expect(edge.children).toHaveLength(1);
  expect((await guest.enable()).status).toBe("enabled");
  expect(await guest.read("activation")).toBe("once");
  await expect(guest.invoke("noop")).resolves.toEqual({ toasts: [] });
  expect(edge.children).toHaveLength(2);
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
  expect((await capturePluginRows(root.db, root.ownerId, guest.pluginId)).kv).toEqual([]);
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
  const before = (await capturePluginRows(root.db, root.ownerId, guest.pluginId)).kv;
  await guest.disable();
  delivery.release();
  expect(await running).toMatchObject([{ status: "rejected" }]);
  expect((await capturePluginRows(root.db, root.ownerId, guest.pluginId)).kv).toEqual(before);
  expect((await guest.view()).status).toBe("disabled");
  expect((await guest.enable()).status).toBe("enabled");
  await guest.invoke("write");
  expect(await guest.read("late")).toBe("landed");
});

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
  expect((await capturePluginRows(root.db, root.ownerId, guest.pluginId)).kv).toEqual([]);
  await expect(guest.invoke("noop")).resolves.toEqual({ toasts: [] });
});
