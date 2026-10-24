// @subject packages/server/src/infra/plugin-host/process-runtime.ts
import { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { PLUGIN_CONTINUATION_WINDOW_MS } from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import {
  BASE_GRANTS,
  createPluginProcessEdge,
  FLOOD_HOST_CALLS,
  floatCommand,
  frameField,
  hasOperation,
  installGuest,
  NATIVE_TIMEOUT_MS,
  NOOP_COMMAND,
  PLUGIN_PROCESS_OPERATIONS as OP,
  responseResult,
} from "./process-runtime.fixtures.ts";

test.for([
  { name: "RPC refusal without its error", result: { ok: false }, message: "malformed broker response" },
  { name: "RPC success carrying a refusal", result: { ok: true, error: { name: "Error", message: "refusal" } }, message: "malformed broker response" },
  {
    name: "snippet classification without its error",
    result: { ok: true, value: { logLines: [], errorKind: "parse" } },
    message: "malformed snippet response",
  },
])("native process rejects $name after a successful native snippet", { timeout: NATIVE_TIMEOUT_MS }, async ({ result, message }) => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const caller = await root.internalCallerFor(root.ownerId);
  const room = (await caller.chat.startChat({ characterIds: [] })).chat;
  const code = 'orb.host(1).log.info("native result control");';
  expect(await caller.plugin.runSnippet({ chatId: room.id, code })).toEqual({ logLines: ["[info] native result control"] });
  using delivery = edge.holdNext((value) => frameField(value, "kind") === "response");
  const running = caller.plugin.runSnippet({ chatId: room.id, code });
  const settled = Promise.allSettled([running]);
  const frame = await delivery.reached;
  delivery.release(responseResult(frame, result));
  expect(await settled).toMatchObject([{ status: "rejected", reason: { message: expect.stringContaining(message) } }]);
});

function firstChild(edge: ReturnType<typeof createPluginProcessEdge>): ChildProcess {
  const child = edge.children[0];
  if (child === undefined) {
    throw new Error("the production host did not spawn its watchdog");
  }
  return child;
}

function releasedAuthorities(edge: ReturnType<typeof createPluginProcessEdge>): number {
  return edge.delivered.filter((value) => frameField(value, "kind") === "authority-released").length;
}

test("holding an actual synchronous IPC message preserves its identity, result and live child ownership", { timeout: NATIVE_TIMEOUT_MS }, async () => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const caller = await root.internalCallerFor(root.ownerId);
  const room = (await caller.chat.startChat({ characterIds: [] })).chat;
  using delivery = edge.holdNext((value) => hasOperation(value, OP.mint));
  const running = caller.plugin.runSnippet({ chatId: room.id, code: 'const h=orb.host(1);h.log.info("native-id="+h.ids.mint());' });
  const settled = Promise.allSettled([running]);
  const captured = await delivery.reached;
  const child = firstChild(edge);
  expect(child).toBeInstanceOf(ChildProcess);
  expect(edge.delivered).not.toContain(captured);
  const observed: unknown[] = [];
  child.on("message", (value: unknown) => observed.push(value));
  delivery.release();
  expect(await settled).toMatchObject([{ status: "fulfilled", value: { logLines: [expect.stringContaining("native-id=")] } }]);
  expect((await running).error).toBeUndefined();
  expect(observed).toContain(captured);
  expect(edge.delivered).toContain(captured);
  expect((await caller.plugin.runSnippet({ chatId: room.id, code: 'orb.host(1).log.info("still live");' })).logLines).toEqual(["[info] still live"]);
  expect(edge.children).toHaveLength(1);
  const closed = once(child, "close");
  await root[Symbol.asyncDispose]();
  await closed;
  expect(child.exitCode).toBe(0);
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
