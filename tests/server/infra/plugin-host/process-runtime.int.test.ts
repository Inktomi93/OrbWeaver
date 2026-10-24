// @subject packages/server/src/infra/plugin-host/process-runtime.ts
import { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import {
  createPluginProcessEdge,
  firstChild,
  frameField,
  hasOperation,
  NATIVE_TIMEOUT_MS,
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
