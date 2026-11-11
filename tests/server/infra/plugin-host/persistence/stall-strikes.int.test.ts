// @subject packages/server/src/infra/plugin-host/process-runtime.ts
// A stall a plugin caused is its strike even when no command was waiting on it, and so is a command of its own that
// outlives the parent's timeout. A bystander's calls through the same teardown never are (D347). The strike count is
// read from the plugin's row, which no door shows.
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import type { PluginStatus } from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, guestRunner, installGuest } from "@orb/testkit/node/composed";
import { capturePluginRows } from "@orb/testkit/node/rows";
import {
  PLUGIN_COMMAND_TIMEOUT_MS,
  PLUGIN_INVOCATION_CPU_MS,
  PLUGIN_WORKER_OVERRUN_MAX_MS,
  PLUGIN_WORKER_SPAN_CHECK_MS,
} from "#server/infra/plugin-host/budgets.ts";
import {
  BASE_GRANTS,
  createPluginProcessEdge,
  frameField,
  installGuest as installNativeGuest,
  NATIVE_TIMEOUT_MS,
  NOOP_COMMAND,
} from "../process-runtime.fixtures.ts";

const ENABLED = "enabled" satisfies PluginStatus;
// One string search of minutes with no interrupt poll inside it.
const NATIVE_STALL = "'a'.repeat(400000).indexOf('a'.repeat(100000) + 'b');";
const AFTER_OPS = {
  busyLoop: "() => { for (;;) {} }",
  ping: "(h) => h.storage.get('k')",
  // The command returns at once; the settlement of its floated call then runs the getter's stall, once.
  stallAfter: `(h) => { Object.defineProperty(Array.prototype, 'then', { get() { if (globalThis.stalled) { return undefined; } globalThis.stalled = true; ${NATIVE_STALL} return undefined; }, configurable: true }); h.storage.list(''); return null; }`,
} as const;
// Past the latest moment the broker ends a span that overran the outside account's window, with a window of slack.
const OUTSIDE_STALL_ENDED_MS = 2 * PLUGIN_INVOCATION_CPU_MS + PLUGIN_WORKER_OVERRUN_MAX_MS + 2 * PLUGIN_WORKER_SPAN_CHECK_MS;

async function crashesOf(
  root: Parameters<typeof capturePluginRows>[0],
  ownerId: Parameters<typeof capturePluginRows>[1],
  pluginId: Parameters<typeof capturePluginRows>[2],
): Promise<number> {
  return (await capturePluginRows(root, ownerId, pluginId)).plugin.consecutiveCrashes;
}

test("a stall after its command returned ends its Worker and strikes the plugin on its next call; a bystander takes none", {
  tags: ["slow"],
  timeout: 4 * OUTSIDE_STALL_ENDED_MS,
}, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const owner = await root.principalFor(root.ownerId);
  const culpritId = await installGuest(root, owner, { slug: "stall-after", capabilities: ["storage.kv"] }, AFTER_OPS);
  const bystanderId = await installGuest(root, owner, { slug: "bystander", capabilities: ["storage.kv"] }, AFTER_OPS);
  const culprit = guestRunner({ root, caller: owner, pluginId: culpritId, chatId: null });
  const bystander = guestRunner({ root, caller: owner, pluginId: bystanderId, chatId: null });

  expect(await culprit("stallAfter")).toEqual({ ok: true, value: null });
  await sleep(OUTSIDE_STALL_ENDED_MS);
  expect(await bystander("ping")).toEqual({ ok: true, value: null });
  // No command was waiting when the broker ended the Worker, so the culprit's next call answers for the stall.
  const owed: unknown = await culprit("ping").catch((error: unknown) => error);
  expect(await crashesOf(root.db, root.ownerId, culpritId)).toBe(1);
  expect(await crashesOf(root.db, root.ownerId, bystanderId)).toBe(0);

  // The owed refusal has an ended guest's shape, and the call after it is served by a fresh runtime.
  expect(await culprit("ping")).toEqual({ ok: true, value: null });
  const ended: unknown = await culprit("busyLoop").catch((error: unknown) => error);
  if (!(ended instanceof Error && "code" in ended)) {
    throw new Error("a busy loop ends in a coded guest failure");
  }
  expect(owed).toMatchObject({ name: ended.name, code: ended.code });
});

test("a command that outlives the parent's timeout strikes its own plugin; a bystander's calls through the killed broker do not", {
  tags: ["slow"],
  timeout: NATIVE_TIMEOUT_MS,
}, async () => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const culprit = await installNativeGuest(root, "culprit", `const h=orb.host(1);${NOOP_COMMAND}`, BASE_GRANTS);
  const bystander = await installNativeGuest(root, "bystander", `const h=orb.host(1);${NOOP_COMMAND}`, BASE_GRANTS);
  expect((await culprit.enable()).status).toBe(ENABLED);
  expect((await bystander.enable()).status).toBe(ENABLED);
  await bystander.invoke("noop");

  // The broker's answer to the culprit's command never arrives, so the parent's own timeout is what ends it.
  using held = edge.holdNext((value) => frameField(value, "kind") === "response");
  const calling = culprit.invoke("noop");
  await held.reached;
  root.timers.advance(PLUGIN_COMMAND_TIMEOUT_MS.invoke);
  await expect(calling).toThrowTRPCError("BAD_REQUEST");
  await expect(bystander.invoke("noop")).toThrowTRPCError("CONFLICT");

  expect(await crashesOf(root.db, root.ownerId, culprit.pluginId)).toBe(1);
  expect(await crashesOf(root.db, root.ownerId, bystander.pluginId)).toBe(0);
});
