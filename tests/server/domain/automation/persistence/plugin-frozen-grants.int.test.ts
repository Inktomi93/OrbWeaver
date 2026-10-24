// A floated plugin command and a guest continuation keep their frozen grant refusals: the stored
// global_variables rows stay byte-for-byte unchanged after the refused write.
// @subject packages/server/src/infra/plugin-host/process-runtime.ts

import { globalVariables } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import {
  BASE_GRANTS,
  bridgeRequest,
  createPluginProcessEdge,
  floatCommand,
  hasOperation,
  installGuest,
  NATIVE_TIMEOUT_MS,
  PLUGIN_PROCESS_OPERATIONS as OP,
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
